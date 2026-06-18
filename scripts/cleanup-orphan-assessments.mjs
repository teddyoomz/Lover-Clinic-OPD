// Rule M (two-phase) — delete docs orphaned by pre-2026-06-18 customer deletes that
// missed be_assessments (cascade gap) + be_customer_wallets (the be_wallets phantom).
// An orphan = a doc whose customerId has NO be_customers doc. DRY-RUN by default;
// writes only with --apply. Idempotent (re-run --apply → 0). Audit doc + forensic.
// Usage: node scripts/cleanup-orphan-assessments.mjs [--apply]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const data = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const COLLECTIONS = ['be_assessments', 'be_customer_wallets'];

async function findOrphans(col) {
  const snap = await data().collection(col).get();
  const orphans = [];
  for (const d of snap.docs) {
    const cid = d.data().customerId;
    if (cid && (await data().collection('be_customers').doc(String(cid)).get()).exists) continue;
    orphans.push({ ref: d.ref, id: d.id, customerId: cid || '(none)' });
  }
  return orphans;
}

async function main() {
  console.log(`=== cleanup-orphan-assessments (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`);
  const result = {};
  let totalDeleted = 0;
  for (const col of COLLECTIONS) {
    const orphans = await findOrphans(col);
    result[col] = orphans.map((o) => ({ id: o.id, customerId: o.customerId }));
    console.log(`\n${col}: ${orphans.length} orphan(s)`);
    for (const o of orphans) {
      console.log(`  ${APPLY ? 'DELETE' : 'would delete'}: ${o.id} (customerId=${o.customerId})`);
      if (APPLY) { await o.ref.delete(); totalDeleted += 1; }
    }
  }
  if (APPLY) {
    const auditId = `cleanup-orphan-assessments-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await data().collection('be_admin_audit').doc(auditId).set({
      type: 'cleanup-orphan-assessments',
      reason: 'be_assessments + be_customer_wallets orphaned by pre-2026-06-18 customer deletes (cascade gap / be_wallets phantom)',
      deleted: result, totalDeleted, appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(`\nAPPLIED — deleted ${totalDeleted} orphan doc(s). audit: ${auditId}`);
  } else {
    console.log('\nDRY-RUN — no writes. Re-run with --apply to delete.');
  }
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
