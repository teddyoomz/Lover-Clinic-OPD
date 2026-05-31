#!/usr/bin/env node
// ═══ V142-quinquies — DIFFERENT-METHOD adversarial verification (Rule Q L2) ═══
//
// User: "หา situation หา flow หา scenario ที่ไม่เหมือนเทสที่แล้ว … เทสทุกรอบบั๊คทุกรอบ
// ลองอีกรอบครั้งสุดท้าย".
//
// The matrix (e2e-tfp-full-flow-matrix) threaded the `_courseDeducted` flag MANUALLY
// in-memory — it NEVER round-tripped the flag through the REAL persistence layer
// (createBackendTreatment → getTreatment → updateBackendTreatment). If `detailRest`
// drops it / getTreatment doesn't return it / an update wipes it, the matrix stays
// green while the REAL component double-deducts (the V66 mirror trap). These tests use
// DIFFERENT methods to close that gap:
//   A — flag persistence ROUND-TRIP through the real create/get/update functions
//   B — go-backward finalize→doctor→finalize driving the flag through REAL Firestore
//       (the flag is READ BACK from the persisted doc, NOT threaded) — the critical one
//   C — STOCK go-backward (different gate: hasStockChange, not the flag)
//   D — backward-compat derivation for pre-fix docs (no flag)
//   E — RANDOMIZED save-sequence fuzz vs an INDEPENDENT conservation reference
//
// Run: node scripts/e2e-tfp-flag-roundtrip-fuzz-stock.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { deleteField } from 'firebase/firestore';

import { auth as clientAuth } from '../src/firebase.js';
import {
  reverseCourseDeduction, deductCourseItems, createBackendTreatment, updateBackendTreatment,
  getTreatment, deductStockForTreatment, reverseStockForTreatment,
} from '../src/lib/backendClient.js';
import { buildReDeductListWithCarryForward, isPurchasedSessionRowId } from '../src/lib/treatmentBuyHelpers.js';
import { hasStockChange } from '../src/lib/treatmentStockDiff.js';
import { MOVEMENT_TYPES, BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-FLAGRT-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra = '') { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); } }
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const cQty = async (db, cid, i) => ((await base(db).collection('be_customers').doc(cid).get()).data().courses[i].qty);
const remN = (q) => { const m = String(q || '').match(/^([\d.,]+)\s*\//); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };
const bRem = async (db, bid) => ((await base(db).collection('be_stock_batches').doc(bid).get()).data()?.qty?.remaining);
// mulberry32 deterministic PRNG (no Math.random — reproducible)
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// the TFP edit-load derivation (exact mirror)
const deriveFlag = (ex) => typeof ex?.detail?._courseDeducted === 'boolean'
  ? ex.detail._courseDeducted
  : (ex?.status !== 'doctor-recorded' && ex?.status !== 'vitalsigns-recorded');

// ─── realSave: drives the FULL real flow — load flag from the PERSISTED doc (not
// threaded), compute deduct decision, run REAL deduct/reverse, persist via REAL
// create/update. Returns treatmentId. This is what the matrix never did. ───
async function realSave(customerId, treatmentId, { saveMode = 'staff', selected, course, branchId }) {
  const isEdit = !!treatmentId;
  const isNeutral = saveMode === 'doctor' || saveMode === 'vitals';
  const deductGate = !isNeutral;
  let loadedCourseDeducted = false, savedCI = [];
  if (isEdit) { const ex = await getTreatment(treatmentId); loadedCourseDeducted = deriveFlag(ex); savedCI = ex?.detail?.courseItems || []; }
  const selCI = selected ? [{ courseName: course.cName, productName: course.pName, rowId: course.rowId, courseIndex: course.idx, deductQty: 1, unit: 'ครั้ง' }] : [];
  const courseItems = isNeutral ? savedCI : selCI;                       // Part A
  const oldExisting = savedCI.filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const freshExisting = courseItems.filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const selSet = new Set(selected ? [course.rowId] : []);
  const existingDed = isEdit ? buildReDeductListWithCarryForward(freshExisting, oldExisting, selSet) : freshExisting;
  const courseDeducted = isNeutral ? loadedCourseDeducted : existingDed.length > 0;
  const detail = { courseItems, _courseDeducted: courseDeducted, branchId };
  const statusField = saveMode === 'doctor' ? { status: 'doctor-recorded' } : saveMode === 'vitals' ? { status: 'vitalsigns-recorded' } : (isEdit ? { status: deleteField() } : {});
  if (!isEdit) {
    const res = await createBackendTreatment(customerId, { ...detail, ...statusField });
    if (deductGate && existingDed.length) await deductCourseItems(customerId, existingDed, { treatmentId: res.treatmentId, staffName: 'rt' });
    return res.treatmentId;
  }
  if (deductGate && loadedCourseDeducted && oldExisting.length) await reverseCourseDeduction(customerId, oldExisting);
  await updateBackendTreatment(treatmentId, { ...detail, ...statusField });
  if (deductGate && existingDed.length) await deductCourseItems(customerId, existingDed, { treatmentId, staffName: 'rt' });
  return treatmentId;
}

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const BR = `${NS}-BR`, MED = `${NS}-MED`, BATCH = `${NS}-BATCH`; const ids = [];
  const mkCust = async (sfx, courses) => { const id = `${NS}-${sfx}`; ids.push(id); await data.collection('be_customers').doc(id).set({ customerId: id, patientData: { firstName: NS, lastName: sfx, hn: id }, courses, createdAt: new Date().toISOString() }); return id; };
  const docC = (name, pid, rem, total) => ({ name: `${name} ${total} ครั้ง`, product: name, qty: `${rem} / ${total} ครั้ง`, courseType: 'ระบุสินค้าและจำนวนสินค้า', productId: pid, branchId: BR });
  const COURSE = (pid) => ({ cName: `C 5 ครั้ง`, pName: 'C', rowId: 'be-row-0', idx: 0, productId: pid });
  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID}\n`);
    await data.collection('be_branches').doc(BR).set({ branchId: BR, branchName: 'FlagRT', isDefault: false });
    await data.collection('be_products').doc(MED).set({ productId: MED, productName: 'Med', productType: 'ยา', branchId: BR, stockConfig: { trackStock: true, minAlert: 0, unit: 'กล่อง' }, status: 'ใช้งาน', createdAt: new Date().toISOString() });
    await data.collection('be_stock_batches').doc(BATCH).set({ batchId: BATCH, productId: MED, productName: 'Med', branchId: BR, locationId: BR, locationType: 'branch', status: BATCH_STATUS.ACTIVE, qty: { total: 50, remaining: 50 }, receivedAt: new Date().toISOString() });

    // ═════ A — flag persistence ROUND-TRIP through the REAL functions ═════
    console.log('═══ A — _courseDeducted round-trip (createBackendTreatment → getTreatment → update → get) ═══');
    const ca = await mkCust('A', []);
    const ta = await createBackendTreatment(ca, { courseItems: [{ courseName: 'X', productName: 'X', rowId: 'be-row-0', courseIndex: 0, deductQty: 1 }], _courseDeducted: true, branchId: BR });
    const g1 = await getTreatment(ta.treatmentId);
    check('A1 ★ _courseDeducted=true SURVIVES createBackendTreatment → getTreatment (detail)', g1?.detail?._courseDeducted === true, `got ${JSON.stringify(g1?.detail?._courseDeducted)}`);
    check('A2 derived loadedCourseDeducted=true', deriveFlag(g1) === true);
    // doctor-style update: spread detail (preserve) + status flip (EditAttributionModal pattern + TFP doctor)
    await updateBackendTreatment(ta.treatmentId, { ...g1.detail, status: 'doctor-recorded' });
    const g2 = await getTreatment(ta.treatmentId);
    check('A3 ★ _courseDeducted=true PRESERVED through update + status→doctor-recorded', g2?.detail?._courseDeducted === true && g2?.status === 'doctor-recorded', `flag=${g2?.detail?._courseDeducted} status=${g2?.status}`);
    check('A4 ★ derived flag STILL true despite status=doctor-recorded (flag overrides heuristic)', deriveFlag(g2) === true);
    // false round-trips too (not coerced/dropped)
    const tf = await createBackendTreatment(ca, { courseItems: [], _courseDeducted: false, branchId: BR });
    check('A5 _courseDeducted=false round-trips as false (not undefined)', (await getTreatment(tf.treatmentId))?.detail?._courseDeducted === false);

    // ═════ B — go-backward via REAL persistence (flag read back, NOT threaded) ═════
    console.log('\n═══ B — finalize→doctor→finalize through REAL Firestore round-trip ═══');
    const cb = await mkCust('B', [docC('C', 'CB', 5, 5)]);
    let t = await realSave(cb, null, { saveMode: 'staff', selected: true, course: COURSE('CB'), branchId: BR });
    check('B1 finalize#1: 5/5 → 4/5 + flag persisted true', remN(await cQty(adb, cb, 0)) === 4 && (await getTreatment(t))?.detail?._courseDeducted === true, `q=${await cQty(adb, cb, 0)}`);
    t = await realSave(cb, t, { saveMode: 'doctor', selected: true, course: COURSE('CB'), branchId: BR });
    check('B2 doctor-save: 4/5 unchanged + flag READ-BACK true + status doctor-recorded', remN(await cQty(adb, cb, 0)) === 4 && deriveFlag(await getTreatment(t)) === true, `q=${await cQty(adb, cb, 0)}`);
    t = await realSave(cb, t, { saveMode: 'staff', selected: true, course: COURSE('CB'), branchId: BR });
    check('B3 ★★★ finalize#2 (flag round-tripped via Firestore) STAYS 4/5 — NOT 3/5 double-deduct', remN(await cQty(adb, cb, 0)) === 4, `q=${await cQty(adb, cb, 0)} ← 3/5 = flag did NOT survive persistence`);

    // ═════ C — STOCK go-backward (gate = hasStockChange, not the flag) ═════
    console.log('\n═══ C — STOCK go-backward: finalize(med) → doctor → finalize, no double-deduct ═══');
    const cc = await mkCust('C', []);
    const medItems = (q) => ({ treatmentItems: [], consumables: [], medications: [{ id: `m-${MED}`, name: 'Med', qty: q, unit: 'กล่อง', productId: MED }] });
    // snapshot must mirror the SAME normalized shape (productId/productName/qty/unit)
    // the current submit produces — else hasStockChange trips on the unit field.
    const snap0 = { treatmentItems: [], consumables: [], medications: [{ id: `m-${MED}`, name: 'Med', qty: 2, unit: 'กล่อง', productId: MED }] };
    const tc = `${NS}-TC`;
    await deductStockForTreatment(tc, medItems(2), { customerId: cc, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT_MED }); // finalize#1
    check('C1 finalize#1: stock 50 → 48 (med ×2)', (await bRem(adb, BATCH)) === 48, `got ${await bRem(adb, BATCH)}`);
    // doctor-save: hasStockChange(snapshot=same meds) === false → no reverse, no re-deduct
    check('C2 hasStockChange(unchanged meds) === false (doctor-save skips stock)', hasStockChange(snap0, medItems(2)) === false);
    // finalize#2 with UNCHANGED meds: hasStockChange false → no reverse, no re-deduct → stock stays 48
    if (hasStockChange(snap0, medItems(2))) { await reverseStockForTreatment(tc); await deductStockForTreatment(tc, medItems(2), { customerId: cc, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT_MED }); }
    check('C3 ★ finalize→doctor→finalize (unchanged meds): stock STAYS 48 (no double-deduct)', (await bRem(adb, BATCH)) === 48, `got ${await bRem(adb, BATCH)}`);
    // and a CHANGED-meds edit: hasStockChange true → reverse(+2)+re-deduct(−3) → net −3 from 50 = 47
    if (hasStockChange(snap0, medItems(3))) { await reverseStockForTreatment(tc); await deductStockForTreatment(tc, medItems(3), { customerId: cc, branchId: BR, movementType: MOVEMENT_TYPES.TREATMENT_MED }); }
    check('C4 ★ changed-meds edit (2→3): stock reverse+re-deduct → 47 (net −3)', (await bRem(adb, BATCH)) === 47, `got ${await bRem(adb, BATCH)}`);

    // ═════ D — backward-compat: pre-fix doc (no _courseDeducted) derivation ═════
    console.log('\n═══ D — backward-compat: pre-fix doc (no flag) → status heuristic ═══');
    check('D1 completed (status absent, no flag) → derived TRUE (was deducted)', deriveFlag({ detail: { courseItems: [] }, status: undefined }) === true);
    check('D2 doctor-recorded (no flag) → derived FALSE (never deducted)', deriveFlag({ detail: {}, status: 'doctor-recorded' }) === false);
    check('D3 vitals-recorded (no flag) → derived FALSE', deriveFlag({ detail: {}, status: 'vitalsigns-recorded' }) === false);
    check('D4 explicit flag OVERRIDES status (flag false + status absent → FALSE)', deriveFlag({ detail: { _courseDeducted: false }, status: undefined }) === false);

    // ═════ E — RANDOMIZED fuzz vs INDEPENDENT conservation reference ═════
    console.log('\n═══ E — randomized save-sequence fuzz (REAL funcs + flag round-trip) vs independent reference ═══');
    const rng = mulberry32(0xC0FFEE);
    const MODES = ['staff', 'doctor', 'vitals'];
    let fuzzPass = 0;
    for (let s = 0; s < 14; s++) {
      const ce = await mkCust(`E${s}`, [docC('C', `CE${s}`, 5, 5)]);
      const len = 2 + Math.floor(rng() * 4); // 2-5 saves
      const seq = []; let tid = null;
      // independent reference: balance = 5 - (1 if the MOST RECENT staff/course save had it selected)
      let refSelectedAtLastDeduct = null;
      for (let k = 0; k < len; k++) {
        const saveMode = k === 0 ? 'staff' : MODES[Math.floor(rng() * MODES.length)]; // first = create-finalize
        const selected = rng() < 0.75; // mostly selected
        seq.push(`${saveMode}${selected ? '+' : '-'}`);
        if (saveMode === 'staff') refSelectedAtLastDeduct = selected;
        tid = await realSave(ce, tid, { saveMode, selected, course: COURSE(`CE${s}`), branchId: BR });
      }
      const expected = 5 - (refSelectedAtLastDeduct ? 1 : 0);
      const actual = remN(await cQty(adb, ce, 0));
      const ok = actual === expected;
      if (ok) fuzzPass++;
      check(`E.seq${s} [${seq.join(' ')}] → ${actual}/5 (expected ${expected})`, ok, `got ${actual} expected ${expected}`);
    }
    console.log(`     fuzz: ${fuzzPass}/14 sequences match the independent conservation reference`);
  } finally {
    console.log('\ncleanup...');
    try {
      for (const id of ids) await data.collection('be_customers').doc(id).delete().catch(() => {});
      for (const [c, id] of [['be_branches', BR], ['be_products', MED], ['be_stock_batches', BATCH]]) await data.collection(c).doc(id).delete().catch(() => {});
      for (const c of ['be_stock_movements', 'be_course_changes', 'be_treatments']) { const snap = await data.collection(c).get(); for (const d of snap.docs) { const v = d.data(); if ([v.customerId, v.linkedTreatmentId, v.treatmentId, d.id].some(x => String(x || '').startsWith(NS))) await d.ref.delete().catch(() => {}); } }
      let orphans = 0; for (const id of ids) if ((await data.collection('be_customers').doc(id).get()).exists) orphans++;
      console.log(orphans === 0 ? 'cleanup done — zero orphan.' : `cleanup WARNING — ${orphans} orphan(s).`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {}); await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ flag round-trip + fuzz + stock: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error('FATAL', e); process.exit(1); });
