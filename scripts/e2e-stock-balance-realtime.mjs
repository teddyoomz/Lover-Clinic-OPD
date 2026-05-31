#!/usr/bin/env node
// ═══ V143-ter — real-time stock balance (Task B) Rule Q L2 e2e ═══
// User: "หน้ายอดคงเหลือไม่แสดง real time ... ไม่ว่าจะตัดมาจากไหน เครื่องไหน ที่ไหน
// หน้าไหน ... ทุกคนที่เปิดหน้านี้ต้องเห็นเหมือนกันแบบ real time ทันที".
//
// Proves the SHIPPED client-SDK listener `listenToStockBatchesByBranch` (the one
// StockBalancePanel subscribes to) PUSHES every batch change live: a write from a
// DIFFERENT surface (admin SDK = "another device/page") fires the subscriber's
// onChange immediately — create, deduct, delete. TEST- fixtures, zero-orphan.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth as clientAuth } from '../src/firebase.js';
import { listenToStockBatchesByBranch } from '../src/lib/backendClient.js';
import { BATCH_STATUS } from '../src/lib/stockUtils.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NS = `TEST-STKRT-${Date.now()}-${randomBytes(3).toString('hex')}`;
const STAFF_UID = `${NS}-staff`;
let pass = 0, fail = 0; const fails = [];
const check = (n, c, e = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(n); console.log(`  ✗ ${n} ${e}`); } };
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const fires = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(pred, label, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { const l = fires[fires.length - 1]; if (l && pred(l)) return l; await sleep(150); }
  throw new Error(`timeout waiting for: ${label}`);
}

async function main() {
  const adb = initAdmin(); const data = base(adb);
  const BR = `${NS}-BR`, BATCH = `${NS}-BATCH`; let unsub;
  try {
    const token = await adminAuth().createCustomToken(STAFF_UID, { admin: true });
    await signInWithCustomToken(clientAuth, token);
    console.log(`signed in ${STAFF_UID}\n`);

    // Subscriber = an open ยอดคงเหลือ page (client SDK, the SHIPPED listener)
    console.log('subscribe listenToStockBatchesByBranch (= an open balance page)');
    unsub = listenToStockBatchesByBranch({ branchId: BR }, (list) => fires.push(Array.isArray(list) ? list : []), (e) => { console.error('listener err', e.message); });
    await waitFor(l => Array.isArray(l), 'initial fire');
    check('R1 initial subscribe fires (empty branch)', fires.length >= 1 && fires[fires.length - 1].length === 0, `len=${fires[fires.length - 1]?.length}`);

    // "Another device/page" writes a batch (admin SDK = import on a different surface)
    console.log('\n[other surface] create batch 10 → page must update LIVE');
    await data.collection('be_stock_batches').doc(BATCH).set({ batchId: BATCH, productId: `${NS}-P`, productName: 'RT Test', branchId: BR, locationId: BR, locationType: 'branch', status: BATCH_STATUS.ACTIVE, qty: { total: 10, remaining: 10 }, receivedAt: new Date().toISOString() });
    const f1 = await waitFor(l => l.some(b => b.id === BATCH && b.qty?.remaining === 10), 'batch=10 appears');
    check('R2 ★ create from another surface → listener pushes batch=10 LIVE', f1.some(b => b.id === BATCH && b.qty?.remaining === 10));

    // "Another device" deducts (remaining 10 → 3)
    console.log('[other surface] deduct 10 → 3 → page must update LIVE');
    await data.collection('be_stock_batches').doc(BATCH).update({ 'qty.remaining': 3 });
    const f2 = await waitFor(l => l.find(b => b.id === BATCH)?.qty?.remaining === 3, 'batch=3');
    check('R3 ★ deduct on another device → listener pushes remaining=3 LIVE', f2.find(b => b.id === BATCH)?.qty?.remaining === 3);

    // drain to exactly 0 (depleted) — must STILL appear (V143 active|depleted)
    console.log('[other surface] drain 3 → 0 (depleted) → product must STAY visible at 0');
    await data.collection('be_stock_batches').doc(BATCH).update({ 'qty.remaining': 0, status: BATCH_STATUS.DEPLETED });
    const f3 = await waitFor(l => l.find(b => b.id === BATCH)?.qty?.remaining === 0, 'batch=0');
    check('R4 ★ drained-to-0 batch still PRESENT in live feed (V143 depleted shows at 0)', f3.some(b => b.id === BATCH && b.status === 'depleted'));

    // lot-cleanup deletes a redundant lot → page must update LIVE
    console.log('[lot-cleanup] delete the batch → page must update LIVE (removed)');
    await data.collection('be_stock_batches').doc(BATCH).delete();
    const f4 = await waitFor(l => !l.some(b => b.id === BATCH), 'batch removed');
    check('R5 ★ lot-cleanup delete → listener pushes removal LIVE', !f4.some(b => b.id === BATCH));
    console.log(`\n  total listener fires observed: ${fires.length}`);
  } finally {
    if (typeof unsub === 'function') unsub();
    console.log('\ncleanup...');
    try {
      await data.collection('be_stock_batches').doc(BATCH).delete().catch(() => {});
      const orphan = (await data.collection('be_stock_batches').doc(BATCH).get()).exists;
      console.log(orphan ? 'cleanup WARNING — orphan batch' : 'cleanup done — zero orphan.');
      await adminAuth().deleteUser(STAFF_UID).catch(() => {});
      await signOut(clientAuth).catch(() => {});
    } catch (e) { console.warn('cleanup warning:', e.message); }
  }
  console.log(`\n━━━ stock-balance real-time e2e: ${pass} passed / ${fail} failed ━━━`);
  if (fail) { console.log('FAILED:', fails.join(' · ')); process.exit(1); }
  process.exit(0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error('FATAL', e); process.exit(1); });
