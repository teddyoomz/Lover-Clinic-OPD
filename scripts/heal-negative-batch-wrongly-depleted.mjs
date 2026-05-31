#!/usr/bin/env node
// Rule M two-phase heal — flip wrongly-DEPLETED negative batches back to ACTIVE.
//
// Bug (fixed in code 2026-05-31): createStockAdjustment + sibling writers used
// `remaining <= 0 ? DEPLETED : ACTIVE`, so an ADJUST_ADD that bumped a negative
// batch up but not yet to ≥0 (e.g. -13 + 1 = -12) flipped it to status=depleted.
// Depleted batches are excluded from the active-only balance query (vanish from
// "ยอดคงเหลือ") AND from the _repayNegativeBalances sweep (debt unrepayable).
//
// Invariant restored: a batch with qty.remaining < 0 MUST be status='active'
// (visible active debt). Only remaining === 0 is depleted.
//
// This heal targets EXISTING prod batches already wrongly depleted (the code fix
// only prevents NEW occurrences). Idempotent: re-run with --apply = 0 writes.
//
// Usage:
//   node scripts/heal-negative-batch-wrongly-depleted.mjs           # dry-run
//   node scripts/heal-negative-batch-wrongly-depleted.mjs --apply   # commit
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();

async function main() {
  console.log(`=== Heal wrongly-depleted-negative batches (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);
  const snap = await db.collection(`${BASE}/be_stock_batches`).get();

  const targets = [];
  for (const doc of snap.docs) {
    const b = doc.data();
    const remaining = Number(b.qty?.remaining);
    if (b.status === 'depleted' && Number.isFinite(remaining) && remaining < 0) {
      targets.push({ id: doc.id, ref: doc.ref, name: b.productName, remaining, branchId: b.branchId });
    }
  }

  console.log(`Scanned ${snap.size} batches. Wrongly-depleted-negative: ${targets.length}\n`);
  for (const t of targets) {
    console.log(`  ${t.name} — remaining=${t.remaining} branch=${t.branchId} batch=…${String(t.id).slice(-8)}  →  status: depleted → active`);
  }

  if (targets.length === 0) {
    console.log('\nNothing to heal (idempotent — already clean).');
    return;
  }

  if (!APPLY) {
    console.log(`\n[DRY-RUN] Would flip ${targets.length} batch(es) to status='active'. Re-run with --apply to commit.`);
    return;
  }

  const auditId = `heal-negative-batch-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const batch = db.batch();
  for (const t of targets) {
    batch.update(t.ref, {
      status: 'active',
      // forensic trail (Rule M)
      _healNegBatchAt: FieldValue.serverTimestamp(),
      _healNegBatchFromStatus: 'depleted',
      _healNegBatchReason: 'wrongly-depleted-negative (2026-05-31 status-flip bug)',
      updatedAt: new Date().toISOString(),
    });
  }
  batch.set(db.doc(`${BASE}/be_admin_audit/${auditId}`), {
    auditId,
    op: 'heal-negative-batch-wrongly-depleted',
    scanned: snap.size,
    healed: targets.length,
    targets: targets.map(t => ({ batchId: t.id, productName: t.name, remaining: t.remaining, branchId: t.branchId })),
    appliedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  console.log(`\n[APPLY] Healed ${targets.length} batch(es) → status='active'. Audit: ${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
