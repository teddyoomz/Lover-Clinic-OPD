// Rule M — resolve the 3 duplicate-national-id customer pairs per user direction:
//   Pair 1 (CITIZEN:3309901263672): LC-069 empty → DELETE; keep LC-074.
//   Pair 2 (CITIZEN:1309801395457): LC-125 has 1 recall → MOVE recall to LC-123, then DELETE LC-125; keep LC-123.
//   Pair 3 (CITIZEN:1309900766135): test (สาขาทดลอง 1) → DELETE BOTH LC-143 + LC-155 (+ their appointments + claim).
// Each delete = full cascade (every customer-attached collection + subcollections)
// + free/promote the identity claim. Two-phase: DRY-RUN → --apply. Audit doc.
// Usage: node scripts/fix-dup-customer-pairs.mjs [--apply]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { deriveClaimKey } from '../src/lib/customerIdentity.js';
import { resolveCustomerDisplayName, resolveCustomerHN, resolveCustomerPhone } from '../src/lib/customerDisplayName.js';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const data = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

// 2026-06-18 — be_assessments (ED Score rounds) added; matches CUSTOMER_CASCADE_COLLECTIONS_FULL.
// A future merge moves be_assessments to the keeper with the same pattern as moveRecalls
// (query where customerId==from → set customerId=to).
const COLS = ['be_treatments', 'be_sales', 'be_deposits', 'be_customer_wallets', 'be_wallet_transactions', 'be_memberships', 'be_point_transactions', 'be_appointments', 'be_course_changes', 'be_link_requests', 'be_customer_link_tokens', 'be_quotations', 'be_vendor_sales', 'be_online_sales', 'be_sale_insurance_claims', 'be_recalls', 'be_assessments'];

async function moveRecalls(fromCid, toCid, log) {
  const toDoc = (await data().collection('be_customers').doc(toCid).get()).data();
  const name = resolveCustomerDisplayName(toDoc), hn = resolveCustomerHN(toDoc), phone = resolveCustomerPhone(toDoc);
  const snap = await data().collection('be_recalls').where('customerId', '==', fromCid).get();
  for (const d of snap.docs) {
    if (APPLY) await d.ref.update({ customerId: toCid, customerName: name, customerHN: hn || toCid, customerPhone: phone, _movedFrom: fromCid, _movedAt: FieldValue.serverTimestamp() });
    log.push(`recall ${d.id}: ${fromCid} → ${toCid} (name "${name}")`);
  }
  return snap.size;
}

async function freeClaim(cid, claimKey, log) {
  if (!claimKey) return;
  const ref = data().collection('be_customer_identity').doc(claimKey);
  if (!APPLY) { const s = await ref.get(); if (s.exists) log.push(`claim ${claimKey}: would free (owner ${s.data().customerId})`); return; }
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data();
    const linked = Array.isArray(d.linkedCustomerIds) ? d.linkedCustomerIds : [];
    if (d.customerId === cid) {
      if (linked.length > 0) { tx.update(ref, { customerId: linked[0], linkedCustomerIds: linked.slice(1) }); log.push(`claim ${claimKey}: promoted ${linked[0]}`); }
      else { tx.delete(ref); log.push(`claim ${claimKey}: deleted`); }
    } else if (linked.includes(cid)) { tx.update(ref, { linkedCustomerIds: linked.filter((x) => x !== cid) }); log.push(`claim ${claimKey}: removed ${cid} (owner ${d.customerId} kept)`); }
  });
}

async function cascadeDelete(cid, log) {
  const cDoc = await data().collection('be_customers').doc(cid).get();
  if (!cDoc.exists) { log.push(`${cid}: already gone`); return; }
  const claimKey = cDoc.data()._identityClaimKey || deriveClaimKey(cDoc.data().citizen_id, cDoc.data().passport_id) || null;
  await freeClaim(cid, claimKey, log);
  // subcollections (V74 T4) under the customer doc
  if (APPLY) { for (const sub of await data().collection('be_customers').doc(cid).listCollections()) { const ss = await sub.get(); for (const s of ss.docs) await s.ref.delete(); if (ss.size) log.push(`subcoll ${sub.id}: ${ss.size}`); } }
  // top-level customer-attached docs
  let deleted = 0;
  for (const col of COLS) { const s = await data().collection(col).where('customerId', '==', cid).get(); if (APPLY) for (const d of s.docs) await d.ref.delete(); deleted += s.size; if (s.size) log.push(`${col}: ${s.size}`); }
  if (APPLY) await data().collection('be_customers').doc(cid).delete();
  log.push(`be_customers ${cid} deleted (+${deleted} linked)`);
}

async function main() {
  console.log(`═══ fix dup-customer pairs — ${APPLY ? 'APPLY' : 'DRY-RUN'} ═══`);
  const audit = [];

  console.log('\n[Pair 2] move LC-26000125 recall → LC-26000123, then delete LC-26000125');
  { const log = []; const moved = await moveRecalls('LC-26000125', 'LC-26000123', log); await cascadeDelete('LC-26000125', log); console.log('  ' + log.join('\n  ')); audit.push({ op: 'move-recall-then-delete', from: 'LC-26000125', to: 'LC-26000123', recallsMoved: moved, log }); }

  console.log('\n[Pair 1] delete empty LC-26000069 (keep LC-26000074)');
  { const log = []; await cascadeDelete('LC-26000069', log); console.log('  ' + log.join('\n  ')); audit.push({ op: 'delete-empty-dup', cid: 'LC-26000069', keep: 'LC-26000074', log }); }

  console.log('\n[Pair 3] delete BOTH test customers LC-26000143 + LC-26000155');
  for (const cid of ['LC-26000155', 'LC-26000143']) { const log = []; await cascadeDelete(cid, log); console.log(`  ${cid}: ` + log.join(' | ')); audit.push({ op: 'delete-test-customer', cid, log }); }

  if (APPLY) {
    const auditId = `fix-dup-customer-pairs-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await data().collection('be_admin_audit').doc(auditId).set({ op: 'fix-dup-customer-pairs', actions: audit, appliedAt: FieldValue.serverTimestamp() });
    console.log('\naudit:', 'be_admin_audit/' + auditId);
  } else { console.log('\n(dry-run — re-run with --apply)'); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
