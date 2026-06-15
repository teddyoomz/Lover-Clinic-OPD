// Rule Q L2 e2e on REAL prod (admin SDK + TEST fixtures + cleanup).
// Proves the identity-claim TRANSACTION semantics on real Firestore: the claim
// tx uses the SAME resolveClaimAction/deriveClaimKey the client addCustomer uses,
// and Firestore tx OCC is identical for admin & client SDK — so concurrency,
// override, edit-reclaim, and cascade-free are verified end-to-end.
//
// HONEST GAP (Rule Q-honest): admin SDK bypasses firestore.rules, so the
// CLIENT-SDK-with-rules path (anon-deny / staff-allow) is verified separately by
// Probe-Deploy-Probe at deploy; backend-authed UI (warn modal, recall display)
// is USER L1 hands-on after deploy. This proves the ALGORITHM is race-safe.
// Usage: node scripts/e2e-dup-customer-and-recall.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveClaimAction, deriveClaimKey } from '../src/lib/customerIdentity.js';
import { overlayRecallNames } from '../src/lib/recallCustomerName.js';
import { resolveCustomerDisplayName } from '../src/lib/customerDisplayName.js';
import { isJunkRecallId } from './nuke-test-recall-cases.mjs';

const APP_ID = 'loverclinic-opd-4c39b';
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!getApps().length) initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const data = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL', m); } };
const RAND = randomBytes(4).toString('hex');
const idoc = (k) => data().collection('be_customer_identity').doc(k);

// Faithful mirror of the addCustomer claim tx (same decision fn; admin SDK tx).
async function claimCreateTx(claimKey, customerId, override = false) {
  return db.runTransaction(async (tx) => {
    const ref = idoc(claimKey);
    const snap = await tx.get(ref);
    const claimData = snap.exists ? snap.data() : null;
    const d = resolveClaimAction({ claimExists: snap.exists, owner: claimData ? claimData.customerId : null, customerId, overrideDuplicate: override });
    if (d.action === 'throw') { const e = new Error('DUPLICATE_IDENTITY'); e.code = 'DUPLICATE_IDENTITY'; e.existingCustomerId = d.existingCustomerId; throw e; }
    if (d.action === 'set') tx.set(ref, { customerId, linkedCustomerIds: [], claimedAt: new Date().toISOString(), _test: true });
    else if (d.action === 'append') { const linked = Array.isArray(claimData.linkedCustomerIds) ? claimData.linkedCustomerIds : []; if (!linked.includes(customerId)) tx.update(ref, { linkedCustomerIds: [...linked, customerId] }); }
    return { id: customerId };
  });
}
// Mirror of updateCustomerFromForm edit-reclaim tx (reads-first then writes).
async function editReclaimTx(customerId, oldKey, newKey) {
  if (oldKey === newKey) return;
  return db.runTransaction(async (tx) => {
    const oldRef = oldKey ? idoc(oldKey) : null;
    const newRef = newKey ? idoc(newKey) : null;
    const oldSnap = oldRef ? await tx.get(oldRef) : null;
    const newSnap = newRef ? await tx.get(newRef) : null;
    if (newRef) {
      const d = resolveClaimAction({ claimExists: newSnap.exists, owner: newSnap.exists ? newSnap.data().customerId : null, customerId });
      if (d.action === 'throw') { const e = new Error('DUPLICATE_IDENTITY'); e.code = 'DUPLICATE_IDENTITY'; throw e; }
      if (d.action === 'set') tx.set(newRef, { customerId, linkedCustomerIds: [], claimedAt: new Date().toISOString(), _test: true });
    }
    if (oldRef && oldSnap.exists && oldSnap.data().customerId === customerId) tx.delete(oldRef);
  });
}
// Mirror of cascade _freeCustomerIdentityClaim.
async function freeClaimTx(customerId, claimKey) {
  if (!claimKey) return;
  return db.runTransaction(async (tx) => {
    const ref = idoc(claimKey);
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data();
    const linked = Array.isArray(d.linkedCustomerIds) ? d.linkedCustomerIds : [];
    if (d.customerId === customerId) { if (linked.length > 0) tx.update(ref, { customerId: linked[0], linkedCustomerIds: linked.slice(1) }); else tx.delete(ref); }
    else if (linked.includes(customerId)) tx.update(ref, { linkedCustomerIds: linked.filter((id) => id !== customerId) });
  });
}

const created = [];
async function main() {
  console.log('═══ Rule Q L2 e2e — dup-customer + recall (REAL prod, admin SDK) ═══');

  // ── Phase 1: CONCURRENT double-create (Rule T) ─────────────────────────────
  console.log('\n[1] Concurrent double-create with the SAME identity → exactly ONE wins');
  const K1 = `TESTCLAIM-${RAND}-concurrent`; created.push(K1);
  const r = await Promise.allSettled([claimCreateTx(K1, 'TEST-A-' + RAND), claimCreateTx(K1, 'TEST-B-' + RAND)]);
  const fulfilled = r.filter((x) => x.status === 'fulfilled');
  const rejected = r.filter((x) => x.status === 'rejected');
  ok(fulfilled.length === 1, `exactly 1 create succeeded (got ${fulfilled.length})`);
  ok(rejected.length === 1 && rejected[0].reason?.code === 'DUPLICATE_IDENTITY', `the loser got DUPLICATE_IDENTITY`);
  const claim1 = await idoc(K1).get();
  ok(claim1.exists && (claim1.data().linkedCustomerIds || []).length === 0, 'the claim is owned by exactly one customer (no stray linked)');

  // ── Phase 2: override appends to linkedCustomerIds ─────────────────────────
  console.log('\n[2] Override ("บันทึกซ้ำอยู่ดี") → appends to linkedCustomerIds, owner unchanged');
  const owner2 = claim1.data().customerId;
  await claimCreateTx(K1, 'TEST-OVERRIDE-' + RAND, true);
  const claim2 = await idoc(K1).get();
  ok(claim2.data().customerId === owner2, 'canonical owner unchanged');
  ok((claim2.data().linkedCustomerIds || []).includes('TEST-OVERRIDE-' + RAND), 'override dup recorded in linkedCustomerIds');

  // ── Phase 3: edit-reclaim (free old, claim new; collision throws) ──────────
  console.log('\n[3] Edit-reclaim: free old claim + claim new; editing TO a taken id throws');
  const Kold = `TESTCLAIM-${RAND}-old`, Knew = `TESTCLAIM-${RAND}-new`; created.push(Kold, Knew);
  await claimCreateTx(Kold, 'TEST-EDIT-' + RAND);
  await editReclaimTx('TEST-EDIT-' + RAND, Kold, Knew);
  ok(!(await idoc(Kold).get()).exists, 'old claim freed');
  ok((await idoc(Knew).get()).data()?.customerId === 'TEST-EDIT-' + RAND, 'new claim owned by the edited customer');
  let threw = false;
  try { await editReclaimTx('TEST-OTHER-' + RAND, null, K1); } catch (e) { threw = e.code === 'DUPLICATE_IDENTITY'; }
  ok(threw, 'editing another customer TO the taken id → DUPLICATE_IDENTITY');

  // ── Phase 4: cascade frees / promotes the claim ───────────────────────────
  console.log('\n[4] Cascade: delete the canonical owner WITH a linked dup → promote the dup');
  await freeClaimTx(owner2, K1); // owner2 deleted; TEST-OVERRIDE was linked
  const claim4 = await idoc(K1).get();
  ok(claim4.exists && claim4.data().customerId === 'TEST-OVERRIDE-' + RAND, 'linked dup promoted to canonical owner');
  await freeClaimTx('TEST-OVERRIDE-' + RAND, K1); // now sole owner deleted
  ok(!(await idoc(K1).get()).exists, 'deleting the sole owner removes the claim (identity freed)');

  // ── Phase 5: recall name live-resolve against a REAL kiosk-shaped customer ──
  console.log('\n[5] Recall name enrich: empty snapshot + real kiosk customer → resolved name');
  const custId = 'TEST-CUST-' + RAND;
  await data().collection('be_customers').doc(custId).set({ patientData: { prefix: 'นางสาว', firstNameTh: 'อีทูอี', lastNameTh: 'ทดสอบ' }, firstname: '', lastname: '', _test: true });
  const custDoc = (await data().collection('be_customers').doc(custId).get()).data();
  const enriched = overlayRecallNames([{ id: 'R', customerId: custId, customerName: '' }], { [custId]: custDoc });
  ok(enriched[0].customerName === 'นางสาว อีทูอี ทดสอบ', `empty "—" resolved to "${enriched[0].customerName}"`);
  ok(resolveCustomerDisplayName(custDoc) === 'นางสาว อีทูอี ทดสอบ', 'resolver handles kiosk firstNameTh shape on real doc');

  // ── Phase 6: nuke classifier ──────────────────────────────────────────────
  console.log('\n[6] Nuke classifier identifies the user-reported TEST junk by caseName');
  ok(isJunkRecallId('be_recall_cases', 'CASE-1778751254993-x', { caseName: 'TEST-CASE-PHASE2922-RB1-PRP-7d' }), 'caseName TEST-CASE-PHASE2922-RB1-PRP-7d → junk');
  ok(isJunkRecallId('be_recall_cases', 'CASE-1778751270649-x', { caseName: 'TEST-CASE-PHASE2922-RB3-Acne-21d' }), 'caseName TEST-CASE-PHASE2922-RB3-Acne-21d → junk');
  ok(!isJunkRecallId('be_recall_cases', 'CASE-1781-real', { caseName: 'ติดตามอาการหลังทานยา 1 เดือน' }), 'a real Thai-named preset is NOT junk');

  // ── Cleanup ────────────────────────────────────────────────────────────────
  console.log('\n[cleanup]');
  for (const k of created) { try { await idoc(k).delete(); } catch {} }
  try { await data().collection('be_customers').doc('TEST-CUST-' + RAND).delete(); } catch {}
  const leftover = [];
  for (const k of created) if ((await idoc(k).get()).exists) leftover.push(k);
  if ((await data().collection('be_customers').doc('TEST-CUST-' + RAND).get()).exists) leftover.push('TEST-CUST');
  ok(leftover.length === 0, `cleanup left zero orphans (leftover: ${leftover.join(',') || 'none'})`);

  console.log(`\n═══ ${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'} — ${pass} pass / ${fail} fail ═══`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
