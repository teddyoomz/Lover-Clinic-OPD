#!/usr/bin/env node
// ─── Rule Q REPRO: finalize → doctor-save → finalize = DOUBLE-DEDUCT ───
//
// User clarification: "ปุ่มบันทึกสำหรับแพทย์ ไม่ต้องบันทึกพวกข้อมูลการตัดคอร์สนะ
// ที่จะบันทึกตัดคอร์สด้วยจะเป็นบันทึกด้านล่างของ TFP".
//
// HYPOTHESIS (Phase 1): the doctor-save button is "always shown" (TFP:3750-3754,
// Phase 27.2-bis — NOT gated on status, contradicting the V142-quater comment).
// So a COMPLETED treatment (course already deducted) can be re-saved as doctor
// (status→'doctor-recorded'), then finalized again. At the 2nd finalize,
// `priorSaveDeducted = loadedTreatmentStatus !== 'doctor-recorded'` is FALSE →
// the reverse is SKIPPED → the re-deduct DOUBLE-counts (course loses a session
// the customer never used). V142-quater fixed over-credit but its status-based
// heuristic mis-handles this "go-backward" flow.
//
// This drives the SHIPPED deduct/reverse fns on REAL prod through `currentSave()`
// — a faithful mirror of TFP's CURRENT handleSubmit gates (verified vs TFP this
// session). Assertions expect the CORRECT balance → R1/R2 FAIL on current code
// (proving the bug); R3/R4 are V142-quater/V142 regression guards (should pass).
//
// Run: node scripts/diag-finalize-doctor-finalize-double-deduct.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { reverseCourseDeduction, deductCourseItems } from '../src/lib/backendClient.js';
import { buildCourseItemsForSave, buildReDeductListWithCarryForward, isPurchasedSessionRowId } from '../src/lib/treatmentBuyHelpers.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-DBLDED-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); } }
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const cQty = async (db, cid, i) => ((await base(db).collection('be_customers').doc(cid).get()).data().courses[i].qty);

// ─── FAITHFUL mirror of TFP's CURRENT handleSubmit course flow (the BUGGY version) ───
// Returns { courseItems } persisted by this save. CURRENT behavior: courseItems
// serialized for ALL save modes (incl. doctor/vitals); priorSaveDeducted = status heuristic.
async function currentSave({ saveMode = 'staff', isEdit = false, customerId, treatmentId, selectedCourseItems, customerCourses, treatmentItems = [], savedCourseItems = [], loadedStatus }) {
  const deductGate = saveMode !== 'doctor' && saveMode !== 'vitals';
  const courseItems = buildCourseItemsForSave(selectedCourseItems, customerCourses, treatmentItems); // CURRENT: all modes serialize
  const freshExisting = courseItems.filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const freshPurchased = courseItems.filter(ci => isPurchasedSessionRowId(ci.rowId));
  const oldExisting = (savedCourseItems || []).filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const oldPurchased = (savedCourseItems || []).filter(ci => isPurchasedSessionRowId(ci.rowId));
  const priorSaveDeducted = loadedStatus !== 'doctor-recorded' && loadedStatus !== 'vitalsigns-recorded'; // CURRENT heuristic
  const existingDeductions = isEdit ? buildReDeductListWithCarryForward(freshExisting, oldExisting, selectedCourseItems) : freshExisting;
  const purchasedDeductions = isEdit ? buildReDeductListWithCarryForward(freshPurchased, oldPurchased, selectedCourseItems) : freshPurchased;
  if (deductGate && isEdit && priorSaveDeducted) {
    if (oldExisting.length) await reverseCourseDeduction(customerId, oldExisting);
    if (oldPurchased.length) await reverseCourseDeduction(customerId, oldPurchased, { preferNewest: true });
  }
  if (deductGate && existingDeductions.length) await deductCourseItems(customerId, existingDeductions, { treatmentId, staffName: 'แอดมิน' });
  if (deductGate && purchasedDeductions.length) await deductCourseItems(customerId, purchasedDeductions, { preferNewest: true, treatmentId, staffName: 'แอดมิน' });
  return { courseItems, statusAfter: saveMode === 'doctor' ? 'doctor-recorded' : saveMode === 'vitals' ? 'vitalsigns-recorded' : undefined };
}
const grp = (name, pid, total = 5) => ({ courseId: 'be-course-0', courseName: `${name} ${total} ครั้ง`, products: [{ rowId: 'be-row-0', courseIndex: 0, productId: pid, name, remaining: String(total), total: String(total), unit: 'ครั้ง' }] });
const docC = (name, pid, rem, total) => ({ name: `${name} ${total} ครั้ง`, product: name, qty: `${rem} / ${total} ครั้ง`, courseType: 'ระบุสินค้าและจำนวนสินค้า', productId: pid, branchId: NS });

async function main() {
  const adb = initAdmin(); const data = base(adb); const ids = [];
  const mk = async (suffix, courses) => { const id = `${NS}-${suffix}`; ids.push(id); await data.collection('be_customers').doc(id).set({ customerId: id, patientData: { firstName: NS, lastName: suffix, hn: id }, courses, createdAt: new Date().toISOString() }); return id; };
  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID}\n`);

    // R1 — finalize → DOCTOR-save → finalize (existing course). Should stay 4/5; bug = 3/5.
    console.log('R1 — finalize(5/5→4/5) → บันทึกสำหรับแพทย์ → finalize again → ควรคงที่ 4/5');
    const c1 = await mk('R1', [docC('PhysioA', 'PHYA', 5, 5)]);
    const sel = new Set(['be-row-0']); const cc = [grp('PhysioA', 'PHYA')]; const ti = [{ id: 'be-row-0', name: 'PhysioA', qty: 1, productId: 'PHYA' }];
    const s1 = await currentSave({ saveMode: 'staff', isEdit: false, customerId: c1, treatmentId: `${NS}-T1`, selectedCourseItems: sel, customerCourses: cc, treatmentItems: ti });
    console.log(`     after finalize#1: ${await cQty(adb, c1, 0)}`);
    const s2 = await currentSave({ saveMode: 'doctor', isEdit: true, loadedStatus: s1.statusAfter, customerId: c1, treatmentId: `${NS}-T1`, selectedCourseItems: sel, customerCourses: cc, treatmentItems: ti, savedCourseItems: s1.courseItems });
    console.log(`     after doctor-save: ${await cQty(adb, c1, 0)} (status now ${s2.statusAfter})`);
    await currentSave({ saveMode: 'staff', isEdit: true, loadedStatus: s2.statusAfter, customerId: c1, treatmentId: `${NS}-T1`, selectedCourseItems: sel, customerCourses: cc, treatmentItems: ti, savedCourseItems: s2.courseItems });
    const r1 = await cQty(adb, c1, 0);
    check('R1 ★ finalize→doctor→finalize keeps 4/5 (NOT 3/5 double-deduct)', r1 === '4 / 5 ครั้ง', `got ${r1}  ← 3/5 = DOUBLE-DEDUCT BUG CONFIRMED`);

    // R2 — finalize → VITALS-save → finalize. Same class via vitals.
    console.log('R2 — finalize → บันทึกข้อมูลซักประวัติ → finalize → ควรคงที่ 4/5');
    const c2 = await mk('R2', [docC('PhysioB', 'PHYB', 5, 5)]);
    const cc2 = [grp('PhysioB', 'PHYB')]; const ti2 = [{ id: 'be-row-0', name: 'PhysioB', qty: 1, productId: 'PHYB' }];
    const v1 = await currentSave({ saveMode: 'staff', isEdit: false, customerId: c2, treatmentId: `${NS}-T2`, selectedCourseItems: sel, customerCourses: cc2, treatmentItems: ti2 });
    const v2 = await currentSave({ saveMode: 'vitals', isEdit: true, loadedStatus: v1.statusAfter, customerId: c2, treatmentId: `${NS}-T2`, selectedCourseItems: sel, customerCourses: cc2, treatmentItems: ti2, savedCourseItems: v1.courseItems });
    await currentSave({ saveMode: 'staff', isEdit: true, loadedStatus: v2.statusAfter, customerId: c2, treatmentId: `${NS}-T2`, selectedCourseItems: sel, customerCourses: cc2, treatmentItems: ti2, savedCourseItems: v2.courseItems });
    const r2 = await cQty(adb, c2, 0);
    check('R2 ★ finalize→vitals→finalize keeps 4/5 (NOT 3/5)', r2 === '4 / 5 ครั้ง', `got ${r2}  ← 3/5 = DOUBLE-DEDUCT via vitals`);

    // R3 — REGRESSION GUARD V142-quater: create→vitals→doctor→finalize must be 4/5 (over-credit guard).
    console.log('R3 — (regression) vitals→doctor→finalize → 4/5 (V142-quater, ไม่ over-credit)');
    const c3 = await mk('R3', [docC('PhysioC', 'PHYC', 5, 5)]);
    const cc3 = [grp('PhysioC', 'PHYC')]; const ti3 = [{ id: 'be-row-0', name: 'PhysioC', qty: 1, productId: 'PHYC' }];
    const w1 = await currentSave({ saveMode: 'vitals', isEdit: false, customerId: c3, treatmentId: `${NS}-T3`, selectedCourseItems: sel, customerCourses: cc3, treatmentItems: ti3 });
    const w2 = await currentSave({ saveMode: 'doctor', isEdit: true, loadedStatus: w1.statusAfter, customerId: c3, treatmentId: `${NS}-T3`, selectedCourseItems: sel, customerCourses: cc3, treatmentItems: ti3, savedCourseItems: w1.courseItems });
    await currentSave({ saveMode: 'staff', isEdit: true, loadedStatus: w2.statusAfter, customerId: c3, treatmentId: `${NS}-T3`, selectedCourseItems: sel, customerCourses: cc3, treatmentItems: ti3, savedCourseItems: w2.courseItems });
    check('R3 ★ vitals→doctor→finalize = 4/5 (V142-quater preserved)', (await cQty(adb, c3, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c3, 0)}`);

    // R4 — REGRESSION GUARD V142: create→finalize→edit-finalize (completed re-save) = 4/5.
    console.log('R4 — (regression) finalize→edit-finalize(completed) → 4/5 (V142 edit-resave)');
    const c4 = await mk('R4', [docC('PhysioD', 'PHYD', 5, 5)]);
    const cc4 = [grp('PhysioD', 'PHYD')]; const ti4 = [{ id: 'be-row-0', name: 'PhysioD', qty: 1, productId: 'PHYD' }];
    const x1 = await currentSave({ saveMode: 'staff', isEdit: false, customerId: c4, treatmentId: `${NS}-T4`, selectedCourseItems: sel, customerCourses: cc4, treatmentItems: ti4 });
    await currentSave({ saveMode: 'staff', isEdit: true, loadedStatus: x1.statusAfter, customerId: c4, treatmentId: `${NS}-T4`, selectedCourseItems: sel, customerCourses: cc4, treatmentItems: ti4, savedCourseItems: x1.courseItems });
    check('R4 ★ finalize→edit-finalize = 4/5 (V142 preserved)', (await cQty(adb, c4, 0)) === '4 / 5 ครั้ง', `got ${await cQty(adb, c4, 0)}`);
  } finally {
    console.log('\ncleanup...');
    try {
      for (const id of ids) await data.collection('be_customers').doc(id).delete().catch(() => {});
      for (const c of ['be_course_changes']) { const snap = await data.collection(c).get(); for (const d of snap.docs) { const v = d.data(); if ([v.customerId, v.linkedTreatmentId, d.id].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); } }
      let orphans = 0; for (const id of ids) if ((await data.collection('be_customers').doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {}); await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ double-deduct repro: ${pass} passed / ${fail} failed (R1/R2 FAIL = bug confirmed) ━━━`);
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error('FATAL', e); process.exit(1); });
