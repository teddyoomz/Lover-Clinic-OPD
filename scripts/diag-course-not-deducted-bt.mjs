#!/usr/bin/env node
// Rule R diag (READ-ONLY) — "ซื้อแล้วตัดคอร์สเลย แต่คอร์สไม่ตัดออกจากตัว".
// Symptom: be_course_changes shows -1 for 3 courses ref BT-1780203508072,
// but customer.courses[] still shows 1/1 (full). Find WHY: duplicate entries
// (double-assign) vs clobbered decrement vs wrong-index deduct.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a;
}, {});
if (getApps().length === 0) initializeApp({ credential: cert({
  projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
}), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const TID = process.argv[2] || 'BT-1780203508072';

const ts = (v) => { try { return v?.toDate ? v.toDate().toISOString() : (typeof v === 'string' ? v : JSON.stringify(v)); } catch { return String(v); } };

async function main() {
  console.log(`\n===== DIAG: course-not-deducted for treatment ${TID} =====\n`);

  // ── 1. be_treatments/<TID> ──
  const tSnap = await db.doc(`${BASE}/be_treatments/${TID}`).get();
  if (!tSnap.exists) { console.log('treatment NOT FOUND'); }
  const t = tSnap.data() || {};
  const customerId = t.customerId;
  console.log('── be_treatments doc ──');
  console.log(`  customerId=${customerId}  branchId=${t.branchId}  saveMode=${t.saveMode || t.detail?.saveMode || '(none)'}  linkedSaleId=${t.linkedSaleId || '(none)'}`);
  console.log(`  createdAt=${ts(t.createdAt)}  updatedAt=${ts(t.updatedAt)}  serverUpdateTime=${ts(tSnap.updateTime)}`);
  const courseItems = t.detail?.courseItems || [];
  const treatmentItems = t.detail?.treatmentItems || [];
  console.log(`  detail.courseItems (${courseItems.length}):`);
  for (const ci of courseItems) console.log(`     rowId=${ci.rowId}  name=${ci.name}  product=${ci.productName || ci.product}  qty=${ci.qty}  courseIndex=${ci.courseIndex}`);
  console.log(`  detail.treatmentItems (${treatmentItems.length}):`);
  for (const ti of treatmentItems) console.log(`     name=${ti.name}  product=${ti.productName || ti.product}  qty=${ti.qty}  rowId=${ti.rowId}`);

  // ── 2. be_course_changes ref this treatment ──
  let ccSnap = await db.collection(`${BASE}/be_course_changes`).where('treatmentId', '==', TID).get().catch(() => null);
  if (!ccSnap || ccSnap.empty) ccSnap = await db.collection(`${BASE}/be_course_changes`).where('referenceId', '==', TID).get().catch(() => null);
  console.log(`\n── be_course_changes (ref ${TID}): ${ccSnap?.size || 0} ──`);
  for (const d of (ccSnap?.docs || [])) {
    const c = d.data();
    console.log(`     kind=${c.kind} course=${c.courseName} product=${c.productName} delta=${c.delta ?? c.qtyDelta} before=${c.before} after=${c.after} createdAt=${ts(c.createdAt)} by=${c.staffName}`);
  }

  // ── 3. customer.courses[] FULL dump ──
  if (customerId) {
    const cuSnap = await db.doc(`${BASE}/be_customers/${customerId}`).get();
    const courses = cuSnap.data()?.courses || [];
    console.log(`\n── be_customers/${customerId} .courses[] : ${courses.length} entries ──`);
    courses.forEach((c, i) => {
      console.log(`  [${i}] name="${c.name}" product="${c.product}" qty="${c.qty}" status=${c.status} type=${c.courseType || ''}`);
      console.log(`        linkedSaleId=${c.linkedSaleId || '-'} linkedTreatmentId=${c.linkedTreatmentId || '-'} assignedAt=${c.assignedAt || '-'} value=${c.value || '-'}`);
    });
    // Duplicate detector: group by name+product
    const byKey = {};
    courses.forEach((c, i) => { const k = `${c.name}||${c.product}`; (byKey[k] ||= []).push({ i, qty: c.qty }); });
    console.log('\n── duplicate-key check (name||product → indexes) ──');
    for (const [k, arr] of Object.entries(byKey)) {
      if (arr.length > 1) console.log(`  DUP x${arr.length}: ${k}  →  ${arr.map(a => `[${a.i}]${a.qty}`).join('  ')}`);
    }
    const linkedHere = courses.map((c, i) => ({ i, c })).filter(x => x.c.linkedTreatmentId === TID);
    console.log(`\n── entries linkedTreatmentId==${TID}: ${linkedHere.length} ──`);
    linkedHere.forEach(({ i, c }) => console.log(`  [${i}] "${c.name}" / "${c.product}" qty="${c.qty}"  saleId=${c.linkedSaleId}`));
  }

  // ── 4. be_sales linked to this treatment ──
  const sSnap = await db.collection(`${BASE}/be_sales`).where('linkedTreatmentId', '==', TID).get().catch(() => null);
  console.log(`\n── be_sales linkedTreatmentId==${TID}: ${sSnap?.size || 0} ──`);
  for (const d of (sSnap?.docs || [])) {
    const s = d.data();
    const cs = s.items?.courses || [];
    console.log(`  saleId=${s.saleId} createdAt=${ts(s.createdAt)} status=${s.status} courses=${cs.length}`);
    cs.forEach(c => console.log(`     course="${c.name}" qty=${c.qty} unitPrice=${c.unitPrice} products=${(c.products || []).length}`));
  }
  console.log('\n===== END =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
