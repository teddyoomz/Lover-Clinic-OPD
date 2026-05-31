#!/usr/bin/env node
// ─── V143 Rule M — นครราชสีมา stock RESET to zero (prepare for real stock entry) ───
//
// User: "Dry run แก้จำนวนสินค้าในยอดคงเหลือสต็อคของสาขานครราชสีมาให้มียอดเป็น 0 ให้หมด
// ไม่ติดลบ และไม่มีเกิน 0 เพื่อเตรียมตัวสำหรับลงสต็อคจริง และฝากลบรายการนำเข้าและรายการ
// ปรับเปลี่ยน และ movement stock ... ยกเว้น product ที่เคยนำเข้า ให้มียอดเป็น 0".
//
// PLAN (two-phase — dry-run by default; pass --apply to commit):
//   1. be_stock_batches (NK): zero each IN PLACE → qty={total:0, remaining:0},
//      status='active' (so EVERY imported product shows at 0 — no negatives, none >0,
//      depleted/cancelled normalized to active-0). KEEP the batch (= the product's
//      balance row). Forensic: _v143ResetAt + _v143ResetFrom:{total,remaining,status}.
//   2. be_stock_movements (NK): DELETE all (clean slate).
//   3. be_stock_orders (NK): DELETE all (รายการนำเข้า).
//   4. be_stock_adjustments (NK): DELETE all (รายการปรับเปลี่ยน).
//   5. be_stock_transfers / be_stock_withdrawals (NK): DELETE all.
//   6. be_products: UNTOUCHED (the imported products survive, now at 0).
//   + audit doc to be_admin_audit. Idempotent (re-run --apply → 0 writes).
//
// Run (DRY-RUN):  node scripts/v143-nakhon-stock-reset.mjs
// Run (APPLY):    node scripts/v143-nakhon-stock-reset.mjs --apply
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a; }, {});
if (getApps().length === 0) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b', clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n') }), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const col = (c) => db.collection(`${BASE}/${c}`);
const inBranch = (v, BR) => v.branchId === BR || v.locationId === BR || v.fromLocationId === BR || v.toLocationId === BR || v.sourceLocationId === BR || v.destLocationId === BR;
const already = (b) => b.status === 'active' && Number(b.qty?.total) === 0 && Number(b.qty?.remaining) === 0;

async function main() {
  console.log(`\n===== V143 นครราชสีมา stock reset — ${APPLY ? '★ APPLY ★' : 'DRY-RUN'} =====\n`);
  const branches = await col('be_branches').get();
  const nk = branches.docs.find(d => String(d.data()?.branchName || d.data()?.name || '').includes('นครราชสีมา'));
  if (!nk) { console.log('นครราชสีมา NOT FOUND'); return; }
  const BR = nk.id; console.log(`branch = ${BR} (${nk.data()?.branchName || nk.data()?.name})\n`);

  // 1. batches → zero in place
  const batchesSnap = await col('be_stock_batches').get();
  const nkBatches = batchesSnap.docs.filter(d => inBranch(d.data(), BR));
  const toReset = nkBatches.filter(d => !already(d.data()));
  console.log(`be_stock_batches: NK=${nkBatches.length} · need reset (not already 0/0 active)=${toReset.length}`);
  // distribution before
  const dist = { pos: 0, zeroActive: 0, depletedZero: 0, cancelledZero: 0, neg: 0, other: 0 };
  for (const d of nkBatches) { const b = d.data(); const r = Number(b.qty?.remaining) || 0; if (r > 0) dist.pos++; else if (r < 0) dist.neg++; else if (b.status === 'active') dist.zeroActive++; else if (b.status === 'depleted') dist.depletedZero++; else if (b.status === 'cancelled') dist.cancelledZero++; else dist.other++; }
  console.log(`  before: positive=${dist.pos} · active-0=${dist.zeroActive} · depleted-0=${dist.depletedZero} · cancelled-0=${dist.cancelledZero} · negative=${dist.neg} · other=${dist.other}`);
  console.log(`  → ALL become {total:0, remaining:0, status:'active'} (every imported product shows at 0)`);

  // 2-5. transactional records → delete
  const delPlan = {};
  for (const c of ['be_stock_movements', 'be_stock_orders', 'be_stock_adjustments', 'be_stock_transfers', 'be_stock_withdrawals']) {
    const snap = await col(c).get();
    delPlan[c] = snap.docs.filter(d => inBranch(d.data(), BR));
    console.log(`${c}: NK=${delPlan[c].length} → DELETE`);
  }
  const totalDeletes = Object.values(delPlan).reduce((s, a) => s + a.length, 0);
  console.log(`\nSUMMARY: reset ${toReset.length} batches · delete ${totalDeletes} transactional docs · be_products UNTOUCHED`);

  if (!APPLY) {
    console.log('\n(DRY-RUN — no writes. Re-run with --apply to execute.)');
    console.log('===== END (dry-run) =====\n');
    return;
  }

  // ── APPLY ──
  const now = FieldValue.serverTimestamp();
  let resetN = 0, delN = 0;
  // batch resets (chunked)
  for (let i = 0; i < toReset.length; i += 400) {
    const wb = db.batch();
    for (const d of toReset.slice(i, i + 400)) {
      const b = d.data();
      wb.update(d.ref, { qty: { total: 0, remaining: 0 }, status: 'active', _v143ResetAt: now, _v143ResetFrom: { total: Number(b.qty?.total) || 0, remaining: Number(b.qty?.remaining) || 0, status: b.status || '' }, updatedAt: new Date().toISOString() });
    }
    await wb.commit(); resetN += toReset.slice(i, i + 400).length;
  }
  // deletes (chunked)
  for (const [c, docs] of Object.entries(delPlan)) {
    for (let i = 0; i < docs.length; i += 400) {
      const wb = db.batch();
      for (const d of docs.slice(i, i + 400)) wb.delete(d.ref);
      await wb.commit(); delN += docs.slice(i, i + 400).length;
    }
  }
  // audit
  const auditId = `v143-nakhon-stock-reset-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await col('be_admin_audit').doc(auditId).set({ phase: 'v143-nakhon-stock-reset', branchId: BR, batchesReset: resetN, docsDeleted: delN, deleteBreakdown: Object.fromEntries(Object.entries(delPlan).map(([c, a]) => [c, a.length])), beforeDistribution: dist, appliedAt: now });
  console.log(`\n★ APPLIED: ${resetN} batches reset · ${delN} docs deleted · audit ${auditId}`);
  console.log('===== END (applied) =====\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
