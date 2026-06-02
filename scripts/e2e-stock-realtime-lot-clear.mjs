#!/usr/bin/env node
// ═══ V144 — real-time redundant-0-lot auto-clear · Rule Q L2 e2e (REAL prod) ═══
// User: "lot ที่เป็น 0 ... เป็น 0 แล้วมันไม่ได้ใช้อะไรแล้ว ... เมื่อใดมันกลายเป็น 0
// ปุ๊บ ลบไปเลย" + clarified "มันเป็น 0 ได้ ถ้ามี lot เดียว แต่ถ้ามี lot อื่นเข้ามา
// lot ที่เป็น 0 จะต้องหายไป" + "เทสมาแบบโหดๆ ... ทำงานได้ดีเหมือนเดิม 100%".
//
// Drives the SHIPPED CLIENT-SDK functions (the exact code path the UI calls) on
// REAL prod, authed as staff (admin claim → isClinicStaff()), with TEST- fixtures.
// Admin SDK is used ONLY to seed fixtures + read back + clean up (= "another
// surface" / a controlled starting state). The deletion itself goes through the
// real client SDK → exercises the REAL firestore.rules (V144 narrow delete).
//
// ⚠ REQUIRES the V144 firestore.rules deploy (be_stock_batches delete →
//   `isClinicStaff() && resource.data.qty.remaining == 0`). Run AFTER deploy.
//   Pre-deploy the client delete is denied (`if false`) → S1/S2/S4 will FAIL =
//   proof the rule is needed.
//
// Scenarios:
//   S1  new lot in → the 0-lot placeholder is deleted (createStockOrder)
//   S2  FIFO/adjust-drain a non-last lot to 0 → it's deleted, live sibling stays
//   S3  drain the LAST lot to 0 → exactly 1 placeholder KEPT (product still shows)
//   S4  a NEGATIVE (debt) lot is NEVER deleted (helper protects it)
//   S5  deleting a 0-lot does NOT break the Movement Log (movement survives + named)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import {
  createStockOrder,
  createStockAdjustment,
  listStockBatches,
  listStockMovements,
  _clearRedundantZeroLotsForProducts,
} from '../src/lib/backendClient.js';
import { BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-V144-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
const BR = `${NS}-BR`;
let pass = 0, fail = 0; const fails = [];
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ ${n} ${e}`); } };

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function seedProduct(data, pid, name) {
  await data.collection('be_products').doc(pid).set({ productId: pid, productName: name, name, unit: 'ชิ้น', stockConfig: { trackStock: true }, createdAt: new Date().toISOString() });
}
async function seedBatch(data, id, pid, remaining, status = BATCH_STATUS.ACTIVE, total = null) {
  await data.collection('be_stock_batches').doc(id).set({
    batchId: id, productId: pid, productName: `seed ${pid}`, branchId: BR, locationId: BR, locationType: 'branch',
    status, qty: { total: total == null ? Math.max(remaining, 0) : total, remaining }, receivedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
}
const lotsFor = async (pid) => listStockBatches({ productId: pid, branchId: BR });

async function main() {
  const adb = initAdmin(); const data = base(adb);
  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID} · branch ${BR}\n`);

    const P1 = `${NS}-P1`, P2 = `${NS}-P2`, P3 = `${NS}-P3`, P4 = `${NS}-P4`;
    await Promise.all([
      seedProduct(data, P1, 'V144 P1'), seedProduct(data, P2, 'V144 P2'),
      seedProduct(data, P3, 'V144 P3'), seedProduct(data, P4, 'V144 P4'),
    ]);

    // ─── S1 — new lot in → the 0-lot placeholder is deleted ───────────────────
    console.log('S1 — product has a 0-lot, then a NEW lot arrives → 0-lot must vanish');
    await seedBatch(data, `${NS}-P1-zero`, P1, 0, BATCH_STATUS.DEPLETED);
    await createStockOrder({ branchId: BR, vendorName: 'V144 TEST', items: [{ productId: P1, productName: 'V144 P1', qty: 50, cost: 10, unit: 'ชิ้น' }] }, { user: { userId: STAFF_UID, userName: 'e2e' } });
    const s1 = await lotsFor(P1);
    check('S1.1 ★ 0-lot deleted after a new lot arrived', !s1.some(b => b.id === `${NS}-P1-zero`), `lots=${s1.map(b => b.qty?.remaining)}`);
    check('S1.2 exactly one LIVE lot remains (remaining 50)', s1.filter(b => Number(b.qty?.remaining) !== 0).length === 1 && s1.some(b => Number(b.qty?.remaining) === 50), `lots=${s1.map(b => b.qty?.remaining)}`);

    // ─── S2 — drain a non-last lot to 0 → deleted; live sibling stays ─────────
    console.log('\nS2 — older lot drains to 0 while a newer lot is LIVE → older must vanish');
    await seedBatch(data, `${NS}-P2-old`, P2, 3);
    await seedBatch(data, `${NS}-P2-new`, P2, 5);
    const adj = await createStockAdjustment({ batchId: `${NS}-P2-old`, type: 'reduce', qty: 3, branchId: BR }, { user: { userId: STAFF_UID, userName: 'e2e' } });
    const s2 = await lotsFor(P2);
    check('S2.1 ★ drained-to-0 older lot deleted (live sibling exists)', !s2.some(b => b.id === `${NS}-P2-old`), `lots=${s2.map(b => b.id.slice(-6) + ':' + b.qty?.remaining)}`);
    check('S2.2 the live newer lot (5) remains', s2.some(b => b.id === `${NS}-P2-new` && Number(b.qty?.remaining) === 5));

    // ─── S5 — Movement Log safety (the deleted lot's movement survives) ──────
    console.log('S5 — deleting the 0-lot must NOT break the Movement Log');
    const mvts = await listStockMovements({ branchId: BR, includeReversed: true });
    const adjMvt = mvts.find(m => m.batchId === `${NS}-P2-old` && m.linkedAdjustId === adj.adjustmentId);
    check('S5.1 ★ ADJUST_REDUCE movement for the deleted batch STILL exists', !!adjMvt);
    check('S5.2 the surviving movement carries productName (Rule O — audit intact)', !!adjMvt && typeof adjMvt.productName === 'string' && adjMvt.productName.length > 0, `name=${adjMvt?.productName}`);

    // ─── S3 — drain the LAST lot to 0 → exactly 1 placeholder kept ───────────
    console.log('\nS3 — single lot drains to 0 → exactly 1 placeholder KEPT (product still shows)');
    await seedBatch(data, `${NS}-P3-only`, P3, 5);
    await createStockAdjustment({ batchId: `${NS}-P3-only`, type: 'reduce', qty: 5, branchId: BR }, { user: { userId: STAFF_UID, userName: 'e2e' } });
    const s3 = await lotsFor(P3);
    check('S3.1 ★ the last 0-lot is KEPT (placeholder — "เป็น 0 ได้ ถ้ามี lot เดียว")', s3.some(b => b.id === `${NS}-P3-only` && Number(b.qty?.remaining) === 0), `lots=${s3.length}`);
    check('S3.2 the product is still listable at remaining 0 (V143/AV166 — does not vanish)', s3.length === 1 && Number(s3[0].qty?.remaining) === 0);

    // ─── S4 — a NEGATIVE (debt) lot is NEVER deleted ─────────────────────────
    console.log('\nS4 — negative (debt) lot + a 0-lot → helper deletes the 0, NEVER the negative');
    await seedBatch(data, `${NS}-P4-neg`, P4, -4, BATCH_STATUS.ACTIVE, 4);
    await seedBatch(data, `${NS}-P4-zero`, P4, 0, BATCH_STATUS.DEPLETED);
    await _clearRedundantZeroLotsForProducts([{ productId: P4, locationId: BR }]);
    const s4 = await lotsFor(P4);
    check('S4.1 ★ the NEGATIVE (-4) debt lot survives (counts as LIVE — Rule O)', s4.some(b => b.id === `${NS}-P4-neg` && Number(b.qty?.remaining) === -4));
    check('S4.2 the redundant 0-lot beside it is deleted', !s4.some(b => b.id === `${NS}-P4-zero`), `lots=${s4.map(b => b.qty?.remaining)}`);
  } finally {
    console.log('\ncleanup (delete every TEST doc on the TEST branch)...');
    try {
      for (const col of ['be_stock_batches', 'be_stock_movements', 'be_stock_orders', 'be_stock_adjustments']) {
        const snap = await data.collection(col).where('branchId', '==', BR).get();
        for (const d of snap.docs) await d.ref.delete();
        console.log(`  ${col}: deleted ${snap.size}`);
      }
      for (const pid of [`${NS}-P1`, `${NS}-P2`, `${NS}-P3`, `${NS}-P4`]) await data.collection('be_products').doc(pid).delete();
      const orphan = (await data.collection('be_stock_batches').where('branchId', '==', BR).get()).size;
      console.log(orphan === 0 ? '  zero orphan ✓' : `  ⚠ ${orphan} orphan batches`);
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ V144 real-time lot-clear e2e: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error('FATAL', e); process.exit(1); });
