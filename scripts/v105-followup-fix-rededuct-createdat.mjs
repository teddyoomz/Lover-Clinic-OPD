#!/usr/bin/env node
/**
 * V105-followup Rule M patch (2026-05-19 LATE+3 NIGHT+3)
 *
 * Convert createdAt from Firestore Timestamp object → ISO string on the
 * 7 V105 RE-DEDUCT entries written by the original V105 backfill apply.
 *
 * Root cause: `scripts/v105-backfill-sale-customer-and-rededuct-stock.mjs`
 * line ~232 used `FieldValue.serverTimestamp()` for createdAt on the new
 * RE-DEDUCT movements. Existing stock movements use ISO STRING for
 * createdAt. Mixed shape → MovementLogPanel.jsx:161 sort
 * `(b.createdAt || '').localeCompare(...)` throws on Timestamp object
 * (no .localeCompare method) → catch sets movements to [] → user sees
 * "ไม่พบ movement" on entire log.
 *
 * Fix: read each V105 entry, convert Timestamp._seconds × 1000 → ISO,
 * write back via setDoc. Idempotent via `_v105FixedCreatedAtAt` flag.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';

async function main(applyMode = false) {
  console.log(`V105-followup createdAt fix ${applyMode ? '[--APPLY]' : '[DRY-RUN]'}`);

  const all = await db.collection(`${BASE}/be_stock_movements`).get();
  const offenders = [];
  for (const doc of all.docs) {
    const m = doc.data();
    const ca = m.createdAt;
    if (typeof ca === 'string') continue; // already ISO
    if (ca == null) continue; // no createdAt; leave
    // Has _seconds → Timestamp shape → needs conversion
    if (typeof ca === 'object' && (ca._seconds != null || ca.seconds != null)) {
      if (m._v105FixedCreatedAtAt) continue; // idempotent
      const seconds = ca._seconds != null ? ca._seconds : ca.seconds;
      const nanos = ca._nanoseconds != null ? ca._nanoseconds : (ca.nanoseconds || 0);
      const iso = new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
      offenders.push({ id: doc.id, ref: doc.ref, originalTs: { seconds, nanos }, newIso: iso, name: m.productName });
    }
  }

  console.log(`Total scanned: ${all.size}`);
  console.log(`Offenders (Timestamp createdAt, need fix): ${offenders.length}`);
  for (const o of offenders) {
    console.log(`  ${o.id} "${o.name}": Timestamp(${o.originalTs.seconds}) → "${o.newIso}"`);
  }

  if (applyMode && offenders.length > 0) {
    for (const o of offenders) {
      await o.ref.update({
        createdAt: o.newIso,
        _v105FixedCreatedAtAt: FieldValue.serverTimestamp(),
        _v105OriginalCreatedAtTimestamp: { seconds: o.originalTs.seconds, nanoseconds: o.originalTs.nanos },
      });
    }
    const auditId = `v105-followup-fix-rededuct-createdat-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.doc(`${BASE}/be_admin_audit/${auditId}`).set({
      phase: 'V105-followup',
      operation: 'fix-rededuct-createdat-iso',
      appliedAt: FieldValue.serverTimestamp(),
      summary: { fixed: offenders.length, ids: offenders.map(o => o.id) },
    });
    console.log(`\n✓ Fixed ${offenders.length} entries; audit: be_admin_audit/${auditId}`);
  } else if (!applyMode && offenders.length > 0) {
    console.log(`\n[DRY-RUN] Re-run with --apply to commit`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.includes('--apply')).catch(e => { console.error(e); process.exit(1); });
}
