// scripts/v130-backfill-sale-created-by.mjs
// Rule M (two-phase) — backfill legacy be_sales' createdBy from the FIRST seller
// (user choice Q4=B, 2026-05-28). Stamps createdByName (resolved) + createdById
// (sellers[0].id) + createdBySource:'first-seller-backfill' (HONESTY TAG so a guess
// is never mistaken for true V130 capture) + _v130BackfilledAt.
//
//   node scripts/v130-backfill-sale-created-by.mjs            # DRY-RUN (default)
//   node scripts/v130-backfill-sale-created-by.mjs --apply    # COMMIT (user-authorized only)
//
// Display is identical with/without backfill (the report already falls back to the
// first seller); this just persists the field. Idempotent: re-run --apply → 0 writes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { resolveSellerName } from '../src/lib/documentFieldAutoFill.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const APPLY = process.argv.includes('--apply');

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env.local.prod', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();

  const lookup = [];
  for (const coll of ['be_staff', 'be_doctors']) {
    const snap = await db.collection(`${PREFIX}/${coll}`).get();
    for (const d of snap.docs) {
      const x = d.data();
      const name = String(x.name || `${x.firstName || ''} ${x.lastName || ''}`.trim() || '').trim();
      for (const key of [d.id, x.id, x.staffId, x.doctorId]) {
        if (key != null && key !== '') lookup.push({ id: String(key), name });
      }
    }
  }

  const salesSnap = await db.collection(`${PREFIX}/be_sales`).get();
  const candidates = [];
  let skippedAlready = 0, skippedNoSeller = 0;
  for (const d of salesSnap.docs) {
    const s = d.data();
    if (s.createdById || s.createdByName) { skippedAlready++; continue; }   // idempotent
    const first = Array.isArray(s.sellers) ? s.sellers[0] : null;
    const newId = first && first.id != null && first.id !== '' ? String(first.id) : '';
    const newName = resolveSellerName(first, lookup);
    if (!newId && !newName) { skippedNoSeller++; continue; }                 // nothing to persist
    candidates.push({ ref: d.ref, saleId: d.id, newId, newName });
  }

  console.log(`\nbe_sales scanned: ${salesSnap.size} · lookup entries: ${lookup.length}`);
  console.log(`already-stamped (skip): ${skippedAlready} · no-seller (skip): ${skippedNoSeller}`);
  console.log(`backfill candidates: ${candidates.length}`);
  for (const c of candidates.slice(0, 10)) {
    console.log(`  ${c.saleId.padEnd(20)} createdByName="${c.newName}"  createdById="${c.newId}"`);
  }

  if (!APPLY) {
    console.log('\nDRY-RUN — no writes. Re-run with --apply (user-authorized) to commit.');
    process.exit(0);
  }

  let written = 0;
  for (let i = 0; i < candidates.length; i += 400) {
    const batch = db.batch();
    for (const c of candidates.slice(i, i + 400)) {
      batch.set(c.ref, {
        createdById: c.newId,
        createdByName: c.newName,
        createdBySource: 'first-seller-backfill',
        _v130BackfilledAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      written++;
    }
    await batch.commit();
  }
  const auditId = `v130-backfill-sale-created-by-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.collection(`${PREFIX}/be_admin_audit`).doc(auditId).set({
    phase: 'V130', op: 'backfill-sale-created-by',
    scanned: salesSnap.size, backfilled: written,
    skippedAlready, skippedNoSeller, source: 'first-seller-backfill',
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`\nAPPLIED — backfilled ${written} sales. Audit: be_admin_audit/${auditId}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
