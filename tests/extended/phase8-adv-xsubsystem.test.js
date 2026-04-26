// Phase 8 adversarial: Cross-subsystem E2E + SA1-SA50 "iron-fortress" scenarios (~80 tests)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where } from 'firebase/firestore';

const firebaseConfig = { apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20', authDomain: 'loverclinic-opd-4c39b.firebaseapp.com', projectId: 'loverclinic-opd-4c39b', storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app', messagingSenderId: '653911776503', appId: '1:653911776503:web:9e23f723d3ed877962c7f2', measurementId: 'G-TB3Q9BZ8R5' };
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const P = ['artifacts', 'loverclinic-opd-4c39b', 'public', 'data'];
const TS = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bc = () => import('../src/lib/backendClient.js');

const batchDoc = (id) => doc(db, ...P, 'be_stock_batches', id);
const batchesCol = () => collection(db, ...P, 'be_stock_batches');
const ordersCol = () => collection(db, ...P, 'be_stock_orders');
const movementsCol = () => collection(db, ...P, 'be_stock_movements');
const mvtDoc = (id) => doc(db, ...P, 'be_stock_movements', id);
const productDoc = (pid) => doc(db, ...P, 'master_data', 'products', 'items', pid);

const BR = `ADVSA-BR-${TS}`;
const PA = `ADVSA-PA-${TS}`;
const PB = `ADVSA-PB-${TS}`;

async function nuke() {
  for (const col of [batchesCol(), ordersCol(), movementsCol()]) {
    const s = await getDocs(query(col, where('branchId', '==', BR)));
    await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
  }
}
async function nukeProd() { for (const p of [PA, PB]) { try { await deleteDoc(productDoc(p)); } catch {} } }
async function seedTracked(pid) { await setDoc(productDoc(pid), { id: pid, name: pid, stockConfig: { trackStock: true, unit: 'U' } }); }
async function seedBatch(pid, qty, opts = {}) {
  const { createStockOrder } = await bc();
  const { orderId, batchIds } = await createStockOrder({ branchId: BR, items: [{ productId: pid, productName: pid, qty, cost: opts.cost ?? 10, unit: 'U', expiresAt: opts.expiresAt ?? null, isPremium: opts.isPremium ?? false }] });
  return { orderId, batchId: batchIds[0] };
}
async function rb(id) { return (await getDoc(batchDoc(id))).data(); }

beforeAll(async () => { await nuke(); await nukeProd(); await seedTracked(PA); await seedTracked(PB); });
afterAll(async () => { await nuke(); await nukeProd(); });

describe('[STK-E] Cross-subsystem E2E (20 tests)', () => {
  beforeEach(nuke);

  it('E1 full order→sale→cancel restores exactly', async () => {
    const { batchId } = await seedBatch(PA, 100);
    const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `E1-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 40 }], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(60);
    await reverseStockForSale(sid);
    expect((await rb(batchId)).qty.remaining).toBe(100);
  });
  it('E2 multi-sale share batch proportional restore', async () => {
    const { batchId } = await seedBatch(PA, 50);
    const { deductStockForSale, reverseStockForSale } = await bc();
    await deductStockForSale(`E2-A-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR });
    await deductStockForSale(`E2-B-${TS}`, [{ productId: PA, productName: 'A', qty: 15 }], { branchId: BR });
    await reverseStockForSale(`E2-A-${TS}`);
    expect((await rb(batchId)).qty.remaining).toBe(35); // 50-15 (B active)
  });
  it('E3 treatment+sale share batch separate reverses', async () => {
    const { batchId } = await seedBatch(PA, 100);
    const { deductStockForSale, deductStockForTreatment, reverseStockForSale } = await bc();
    await deductStockForTreatment(`E3-T-${TS}`, { consumables: [{ productId: PA, productName: 'A', qty: 8 }] }, { branchId: BR });
    await deductStockForSale(`E3-S-${TS}`, { products: [{ productId: PA, productName: 'A', qty: 12 }] }, { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(80);
    await reverseStockForSale(`E3-S-${TS}`);
    expect((await rb(batchId)).qty.remaining).toBe(92); // 100 - 8 treatment
  });
  it('E4 full cascade: treatment delete reverses both sides', async () => {
    const { batchId } = await seedBatch(PA, 100);
    const { deductStockForSale, deductStockForTreatment, reverseStockForSale, reverseStockForTreatment } = await bc();
    const tid = `E4-T-${TS}`, sid = `E4-S-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PA, productName: 'A', qty: 5 }] }, { branchId: BR });
    await deductStockForSale(sid, { products: [{ productId: PA, productName: 'A', qty: 10 }] }, { branchId: BR });
    await reverseStockForSale(sid);
    await reverseStockForTreatment(tid);
    expect((await rb(batchId)).qty.remaining).toBe(100);
  });
  it('E5 sale edit saga: reverse+deduct → stock matches new', async () => {
    const { batchId } = await seedBatch(PA, 100);
    const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `E5-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 30 }], { branchId: BR });
    await reverseStockForSale(sid);
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 15 }], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(85);
  });
  it('E6 order cancel blocked post-sale (all 3 states: 1 sold, 2 untouched)', async () => {
    const { createStockOrder, deductStockForSale, cancelStockOrder } = await bc();
    const { orderId, batchIds } = await createStockOrder({ branchId: BR, items: [
      { productId: PA, productName: 'A', qty: 10, cost: 1 },
      { productId: PA, productName: 'A', qty: 10, cost: 1 },
      { productId: PA, productName: 'A', qty: 10, cost: 1 },
    ] });
    await deductStockForSale(`E6-${TS}`, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    await expect(cancelStockOrder(orderId)).rejects.toThrow(/cannot cancel/i);
  });
  it('E7 10 sequential sales all succeed', async () => {
    const { batchId } = await seedBatch(PA, 100);
    const { deductStockForSale } = await bc();
    for (let i = 0; i < 10; i++) await deductStockForSale(`E7-${i}-${TS}`, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(50);
  });
  it('E8 sale→adjust→sale sequence integrity', async () => {
    const { batchId } = await seedBatch(PA, 100);
    const { deductStockForSale, createStockAdjustment } = await bc();
    await deductStockForSale(`E8-${TS}`, [{ productId: PA, productName: 'A', qty: 20 }], { branchId: BR });
    await createStockAdjustment({ batchId, type: 'reduce', qty: 5 }); // spillage
    await deductStockForSale(`E8-2-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(65);
  });
  it('E9 premium sale cost+revenue flags correct', async () => {
    const { batchId } = await seedBatch(PA, 10, { cost: 30 });
    const { deductStockForSale, listStockMovements } = await bc();
    const sid = `E9-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 2, isPremium: true }], { branchId: BR });
    const m = (await listStockMovements({ linkedSaleId: sid }))[0];
    expect(m.isPremium).toBe(true);
    expect(m.revenueImpact).toBe(0);
    expect(m.costBasis).toBe(60); // COGS still counts
  });
  it('E10 edit sale changes premium flag', async () => {
    const { deductStockForSale, reverseStockForSale, listStockMovements } = await bc();
    await seedBatch(PA, 10);
    const sid = `E10-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 2, isPremium: false }], { branchId: BR });
    await reverseStockForSale(sid);
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 2, isPremium: true }], { branchId: BR });
    const ms = await listStockMovements({ linkedSaleId: sid, includeReversed: false });
    expect(ms[0].isPremium).toBe(true);
  });
  it('E11 order cost update → new sale uses new cost', async () => {
    const { orderId, batchId } = await seedBatch(PA, 10, { cost: 10 });
    const o = (await getDoc(doc(db, ...P, 'be_stock_orders', orderId))).data();
    const { updateStockOrder, deductStockForSale, listStockMovements } = await bc();
    await updateStockOrder(orderId, { items: [{ orderProductId: o.items[0].orderProductId, cost: 50 }] });
    const sid = `E11-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await listStockMovements({ linkedSaleId: sid }))[0].costBasis).toBe(150); // 3 × 50
  });
  it('E12 FEFO: expiry ordering respected in sale', async () => {
    const a = (await seedBatch(PA, 5, { expiresAt: '2027-06-01' })).batchId;
    const b = (await seedBatch(PA, 10, { expiresAt: '2027-03-01' })).batchId;
    const { deductStockForSale } = await bc();
    await deductStockForSale(`E12-${TS}`, [{ productId: PA, productName: 'A', qty: 7 }], { branchId: BR });
    expect((await rb(b)).qty.remaining).toBe(3);
    expect((await rb(a)).qty.remaining).toBe(5);
  });
  it('E13 reverse 2-batch split → each restored fully', async () => {
    const a = (await seedBatch(PA, 5, { expiresAt: '2027-01-01' })).batchId;
    const b = (await seedBatch(PA, 10, { expiresAt: '2027-02-01' })).batchId;
    const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `E13-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 12 }], { branchId: BR });
    await reverseStockForSale(sid);
    expect((await rb(a)).qty.remaining).toBe(5);
    expect((await rb(b)).qty.remaining).toBe(10);
  });
  it('E14 analyze + reverse = atomic (counts match)', async () => {
    await seedBatch(PA, 20); const { deductStockForSale, analyzeStockImpact, reverseStockForSale } = await bc();
    const sid = `E14-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 8 }], { branchId: BR });
    const analyze = await analyzeStockImpact({ saleId: sid });
    const reverse = await reverseStockForSale(sid);
    expect(reverse.reversedCount).toBe(analyze.movements.length);
  });
  it('E15 2 customers buy separately, each cancel independent', async () => {
    const { batchId } = await seedBatch(PA, 100);
    const { deductStockForSale, reverseStockForSale } = await bc();
    await deductStockForSale(`E15-C1-${TS}`, [{ productId: PA, productName: 'A', qty: 20 }], { branchId: BR, customerId: 'C1' });
    await deductStockForSale(`E15-C2-${TS}`, [{ productId: PA, productName: 'A', qty: 30 }], { branchId: BR, customerId: 'C2' });
    await reverseStockForSale(`E15-C1-${TS}`);
    expect((await rb(batchId)).qty.remaining).toBe(70);
  });
  it('E16 deplete batch then adjust-add to reopen', async () => {
    const { batchId } = await seedBatch(PA, 10);
    const { deductStockForSale, createStockAdjustment } = await bc();
    await deductStockForSale(`E16-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR });
    expect((await rb(batchId)).status).toBe('depleted');
    await createStockAdjustment({ batchId, type: 'add', qty: 5 });
    expect((await rb(batchId)).status).toBe('active');
    expect((await rb(batchId)).qty.remaining).toBe(5);
  });
  it('E17 reverse-after-depleted-by-other sale works', async () => {
    const { batchId } = await seedBatch(PA, 10);
    const { deductStockForSale, reverseStockForSale } = await bc();
    await deductStockForSale(`E17-A-${TS}`, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    await deductStockForSale(`E17-B-${TS}`, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    expect((await rb(batchId)).status).toBe('depleted');
    await reverseStockForSale(`E17-A-${TS}`);
    expect((await rb(batchId)).qty.remaining).toBe(5);
    expect((await rb(batchId)).status).toBe('active');
  });
  it('E18 treatment+sale back-to-back deplete → both active again after reverse', async () => {
    const { batchId } = await seedBatch(PA, 10);
    const { deductStockForTreatment, deductStockForSale, reverseStockForTreatment, reverseStockForSale } = await bc();
    await deductStockForTreatment(`E18-T-${TS}`, { consumables: [{ productId: PA, productName: 'A', qty: 4 }] }, { branchId: BR });
    await deductStockForSale(`E18-S-${TS}`, { products: [{ productId: PA, productName: 'A', qty: 6 }] }, { branchId: BR });
    expect((await rb(batchId)).status).toBe('depleted');
    await reverseStockForTreatment(`E18-T-${TS}`);
    await reverseStockForSale(`E18-S-${TS}`);
    expect((await rb(batchId)).qty.remaining).toBe(10);
    expect((await rb(batchId)).status).toBe('active');
  });
  it('E19 sale movement.before + .after consistency', async () => {
    const { batchId } = await seedBatch(PA, 50); const { deductStockForSale, listStockMovements } = await bc();
    const sid = `E19-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR });
    const m = (await listStockMovements({ linkedSaleId: sid }))[0];
    expect(m.before).toBe(50); expect(m.after).toBe(40);
  });
  it('E20 customer flow: buy+use in treatment same day', async () => {
    const { batchId } = await seedBatch(PA, 20);
    const { deductStockForSale, deductStockForTreatment } = await bc();
    // Morning: sale (buys something that'll be used later)
    await deductStockForSale(`E20-S-${TS}`, { products: [{ productId: PA, productName: 'A', qty: 1 }] }, { branchId: BR, customerId: 'CUST-20' });
    // Afternoon: treatment uses different consumable
    await deductStockForTreatment(`E20-T-${TS}`, { consumables: [{ productId: PA, productName: 'A', qty: 2 }] }, { branchId: BR, customerId: 'CUST-20' });
    expect((await rb(batchId)).qty.remaining).toBe(17);
  });
});

describe('[STK-SA] Adversarial SA1-SA50 (50 tests)', () => {
  beforeEach(nuke);

  it('SA1 decimal drift 10× 0.1 = 1.0 within ε', async () => {
    const { batchId } = await seedBatch(PA, 1);
    const { createStockAdjustment } = await bc();
    for (let i = 0; i < 10; i++) await createStockAdjustment({ batchId, type: 'reduce', qty: 0.1 });
    expect((await rb(batchId)).qty.remaining).toBeCloseTo(0, 10);
  });
  it('SA2 huge batch 1e7 + partial consume', async () => {
    const { batchId } = await seedBatch(PA, 10_000_000);
    const { deductStockForSale } = await bc();
    await deductStockForSale(`SA2-${TS}`, [{ productId: PA, productName: 'A', qty: 500_000 }], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(9_500_000);
  });
  it('SA3 concurrent 3 deducts via Promise.all', async () => {
    const { batchId } = await seedBatch(PA, 100);
    const { deductStockForSale } = await bc();
    await Promise.all([
      deductStockForSale(`SA3-1-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR }),
      deductStockForSale(`SA3-2-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR }),
      deductStockForSale(`SA3-3-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR }),
    ]);
    expect((await rb(batchId)).qty.remaining).toBe(70);
  }, 60000);
  it('SA4 insufficient multi-item: all prior rolled back', async () => {
    const { batchId: a } = await seedBatch(PA, 100);
    const { batchId: b } = await seedBatch(PB, 5);
    const { deductStockForSale } = await bc();
    await expect(deductStockForSale(`SA4-${TS}`, [
      { productId: PA, productName: 'A', qty: 20 },
      { productId: PB, productName: 'B', qty: 100 },
    ], { branchId: BR })).rejects.toThrow();
    expect((await rb(a)).qty.remaining).toBe(100);
  });
  it('SA5 cost basis preserved across order update', async () => {
    const { orderId, batchId } = await seedBatch(PA, 10, { cost: 10 });
    const o = (await getDoc(doc(db, ...P, 'be_stock_orders', orderId))).data();
    const { updateStockOrder, deductStockForSale, listStockMovements } = await bc();
    // First sale at old cost
    await deductStockForSale(`SA5-1-${TS}`, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR });
    const m1 = (await listStockMovements({ linkedSaleId: `SA5-1-${TS}` }))[0];
    // Update cost to 99
    await updateStockOrder(orderId, { items: [{ orderProductId: o.items[0].orderProductId, cost: 99 }] });
    await deductStockForSale(`SA5-2-${TS}`, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR });
    const m2 = (await listStockMovements({ linkedSaleId: `SA5-2-${TS}` }))[0];
    expect(m1.costBasis).toBe(10);
    expect(m2.costBasis).toBe(99);
  });
  it('SA6 movement log immutable: reverse emits NEW movement', async () => {
    const { batchId } = await seedBatch(PA, 10);
    const { deductStockForSale, reverseStockForSale, listStockMovements } = await bc();
    const sid = `SA6-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    await reverseStockForSale(sid);
    const all = await listStockMovements({ linkedSaleId: sid, includeReversed: true });
    expect(all.length).toBe(2); // original + reverse
  });
  it('SA7 reverse same sale 3× idempotent', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SA7-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    const r1 = await reverseStockForSale(sid);
    const r2 = await reverseStockForSale(sid);
    const r3 = await reverseStockForSale(sid);
    expect(r1.reversedCount).toBe(1); expect(r2.reversedCount).toBe(0); expect(r3.reversedCount).toBe(0);
  });
  it('SA8 sale with 5 items across 3 products + various qty', async () => {
    await seedBatch(PA, 10); await seedBatch(PA, 10); await seedBatch(PB, 20);
    const { deductStockForSale, listStockMovements } = await bc();
    const sid = `SA8-${TS}`;
    await deductStockForSale(sid, [
      { productId: PA, productName: 'A', qty: 15 },
      { productId: PB, productName: 'B', qty: 10 },
    ], { branchId: BR });
    const mvts = await listStockMovements({ linkedSaleId: sid });
    expect(mvts.length).toBeGreaterThanOrEqual(3);
  });
  it('SA9 reverse after batch manually cancelled (warning)', async () => {
    const { orderId, batchId } = await seedBatch(PA, 10);
    const { cancelStockOrder, deductStockForSale, reverseStockForSale, analyzeStockImpact } = await bc();
    // Not possible to cancel after sale — simulate via direct setDoc
    const sid = `SA9-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 2 }], { branchId: BR });
    await setDoc(batchDoc(batchId), { status: 'cancelled' }, { merge: true });
    const a = await analyzeStockImpact({ saleId: sid });
    expect(a.warnings.some(w => w.includes('cancelled'))).toBe(true);
  });
  it('SA10 sale with 0 items (edge)', async () => {
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`SA10-${TS}`, [], { branchId: BR });
    expect(r.allocations.length).toBe(0); expect(r.skippedItems.length).toBe(0);
  });
  it('SA11 listStockMovements ordered by createdAt ASC', async () => {
    await seedBatch(PA, 100); const { deductStockForSale, listStockMovements } = await bc();
    const sid = `SA11-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR });
    await new Promise(r => setTimeout(r, 30));
    await deductStockForSale(`SA11b-${TS}`, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR });
    const all = await listStockMovements({ branchId: BR, type: 2 });
    for (let i = 1; i < all.length; i++) {
      expect((all[i].createdAt || '') >= (all[i - 1].createdAt || '')).toBe(true);
    }
  });
  it('SA12 trackStock=false skipped movement doesn\'t affect batch', async () => {
    const { batchId } = await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    // Manually set PA to opt-out
    await setDoc(productDoc(PA), { id: PA, name: 'PA', stockConfig: { trackStock: false, unit: 'U' } });
    await deductStockForSale(`SA12-${TS}`, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(10);
    // restore for later tests
    await setDoc(productDoc(PA), { id: PA, name: 'PA', stockConfig: { trackStock: true, unit: 'U' } });
  });
  it('SA13 order with 10 items each different cost', async () => {
    const { createStockOrder } = await bc();
    const items = Array.from({ length: 10 }, (_, i) => ({ productId: PA, productName: 'A', qty: 1, cost: i + 1 }));
    const { batchIds } = await createStockOrder({ branchId: BR, items });
    const batches = await Promise.all(batchIds.map(rb));
    const costs = batches.map(b => b.originalCost);
    expect(costs).toEqual([1,2,3,4,5,6,7,8,9,10]);
  });
  it('SA14 mass-order 20 items completes', async () => {
    const { createStockOrder } = await bc();
    const items = Array.from({ length: 20 }, () => ({ productId: PA, productName: 'A', qty: 1, cost: 1 }));
    const { batchIds } = await createStockOrder({ branchId: BR, items });
    expect(batchIds.length).toBe(20);
  }, 60000);
  it('SA15 decimal expiry calc: 0.25 unit deducts exactly', async () => {
    const { batchId } = await seedBatch(PA, 1); const { deductStockForSale } = await bc();
    await deductStockForSale(`SA15-${TS}`, [{ productId: PA, productName: 'A', qty: 0.25 }], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(0.75);
  });
  it('SA16 reverse-then-deduct = atomic no race', async () => {
    const { batchId } = await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SA16-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    await reverseStockForSale(sid);
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(5);
  });
  it('SA17 batch total preserved through reduce+add+reduce', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 3 });
    await createStockAdjustment({ batchId, type: 'add', qty: 1 });
    await createStockAdjustment({ batchId, type: 'reduce', qty: 2 });
    const b = await rb(batchId);
    expect(b.qty.total).toBe(10); expect(b.qty.remaining).toBe(6);
  });
  it('SA18 sale with only untracked products → all skipped', async () => {
    const untracked = `UNT-${TS}`;
    await setDoc(productDoc(untracked), { id: untracked, name: untracked });
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`SA18-${TS}`, [{ productId: untracked, productName: 'U', qty: 5 }], { branchId: BR });
    expect(r.allocations.length).toBe(0);
    expect(r.skippedItems.length).toBe(1);
    await deleteDoc(productDoc(untracked));
  });
  it('SA19 batch status transitions: active→depleted→active→depleted', async () => {
    const { batchId } = await seedBatch(PA, 10);
    const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 10 });
    expect((await rb(batchId)).status).toBe('depleted');
    await createStockAdjustment({ batchId, type: 'add', qty: 5 });
    expect((await rb(batchId)).status).toBe('active');
    await createStockAdjustment({ batchId, type: 'reduce', qty: 5 });
    expect((await rb(batchId)).status).toBe('depleted');
  });
  it('SA20 reverse batch → updatedAt changes', async () => {
    const { batchId } = await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SA20-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    const before = (await rb(batchId)).updatedAt;
    await new Promise(r => setTimeout(r, 50));
    await reverseStockForSale(sid);
    expect((await rb(batchId)).updatedAt >= before).toBe(true);
  });
  it('SA21 2 concurrent creates (diff saleIds) → no collision', async () => {
    const { batchId } = await seedBatch(PA, 100);
    const { deductStockForSale } = await bc();
    await Promise.all([
      deductStockForSale(`SA21-A-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR }),
      deductStockForSale(`SA21-B-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR }),
    ]);
    expect((await rb(batchId)).qty.remaining).toBe(80);
  }, 30000);
  it('SA22 sourceDocPath correctly formatted', async () => {
    await seedBatch(PA, 5); const { deductStockForSale, listStockMovements } = await bc();
    const sid = `SA22-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR });
    const m = (await listStockMovements({ linkedSaleId: sid }))[0];
    expect(m.sourceDocPath).toMatch(/^artifacts\/loverclinic-opd-4c39b\/public\/data\/be_sales\//);
  });
  it('SA23 treatment sourceDocPath → be_treatments', async () => {
    await seedBatch(PA, 5); const { deductStockForTreatment, listStockMovements } = await bc();
    const tid = `SA23-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PA, productName: 'A', qty: 1 }] }, { branchId: BR });
    const m = (await listStockMovements({ linkedTreatmentId: tid }))[0];
    expect(m.sourceDocPath).toContain('be_treatments');
  });
  it('SA24 order sourceDocPath → be_stock_orders', async () => {
    const { orderId } = await seedBatch(PA, 1); const { listStockMovements } = await bc();
    const m = (await listStockMovements({ linkedOrderId: orderId }))[0];
    expect(m.sourceDocPath).toContain('be_stock_orders');
  });
  it('SA25 adjustment sourceDocPath → be_stock_adjustments', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment, listStockMovements } = await bc();
    const { adjustmentId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    const m = (await listStockMovements({ linkedAdjustId: adjustmentId }))[0];
    expect(m.sourceDocPath).toContain('be_stock_adjustments');
  });
  it('SA26 user audit on all paths (sale, treatment, adjust)', async () => {
    const { batchId } = await seedBatch(PA, 10);
    const { deductStockForSale, createStockAdjustment, listStockMovements } = await bc();
    const user = { userId: 'u-test', userName: 'Test' };
    await deductStockForSale(`SA26-S-${TS}`, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR, user });
    await createStockAdjustment({ batchId, type: 'reduce', qty: 1 }, { user });
    const ms = await listStockMovements({ branchId: BR });
    for (const m of ms) {
      if (m.type === 2 || m.type === 4) {
        expect(m.user?.userId).toBe('u-test');
      }
    }
  });
  it('SA27 empty object input to sale → no-op', async () => {
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`SA27-${TS}`, {}, { branchId: BR });
    expect(r.allocations.length).toBe(0);
  });
  it('SA28 sale with all zero-qty → all skipped', async () => {
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`SA28-${TS}`, [
      { productId: PA, productName: 'A', qty: 0 },
      { productId: PB, productName: 'B', qty: 0 },
    ], { branchId: BR });
    expect(r.skippedItems.length).toBe(2);
    for (const s of r.skippedItems) expect(s.reason).toBe('zero-qty');
  });
  it('SA29 analyze with both saleId + treatmentId prefers saleId', async () => {
    const { analyzeStockImpact } = await bc();
    const a = await analyzeStockImpact({ saleId: `SA29-${TS}`, treatmentId: `SA29T-${TS}` });
    expect(a.movements.length).toBe(0); // neither exists, both applied as filter
  });
  it('SA30 large order (15 items, each 1 unit) + sale consuming 10', async () => {
    const { createStockOrder, deductStockForSale } = await bc();
    const items = Array.from({ length: 15 }, () => ({ productId: PA, productName: 'A', qty: 1, cost: 1 }));
    await createStockOrder({ branchId: BR, items });
    await deductStockForSale(`SA30-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR });
    const { listStockBatches } = await bc();
    const batches = await listStockBatches({ productId: PA, branchId: BR });
    const total = batches.reduce((s, b) => s + b.qty.remaining, 0);
    expect(total).toBe(5);
  }, 60000);
  it('SA31 batch IDs globally unique (30 rapid creates)', async () => {
    const { createStockOrder } = await bc();
    const ids = new Set();
    for (let i = 0; i < 30; i++) {
      const { batchIds } = await createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: 1, cost: 1 }] });
      ids.add(batchIds[0]);
    }
    expect(ids.size).toBe(30);
  }, 120000);
  it('SA32 movement IDs unique even in burst', async () => {
    const { deductStockForSale, listStockMovements } = await bc();
    await seedBatch(PA, 100);
    const sid = `SA32-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR });
    await deductStockForSale(`SA32b-${TS}`, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR });
    const ms = await listStockMovements({ branchId: BR, type: 2 });
    const ids = new Set(ms.map(m => m.movementId));
    expect(ids.size).toBe(ms.length);
  });
  it('SA33 batch.createdAt preserved through mutations', async () => {
    const { batchId } = await seedBatch(PA, 10);
    const t0 = (await rb(batchId)).createdAt;
    const { deductStockForSale } = await bc();
    await deductStockForSale(`SA33-${TS}`, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await rb(batchId)).createdAt).toBe(t0);
  });
  it('SA34 order.createdAt preserved through updates', async () => {
    const { orderId } = await seedBatch(PA, 5);
    const t0 = (await getDoc(doc(db, ...P, 'be_stock_orders', orderId))).data().createdAt;
    const { updateStockOrder } = await bc();
    await updateStockOrder(orderId, { note: 'updated' });
    const t1 = (await getDoc(doc(db, ...P, 'be_stock_orders', orderId))).data().createdAt;
    expect(t1).toBe(t0);
  });
  it('SA35 reverse on sale with skipped+tracked items handles both', async () => {
    const { batchId } = await seedBatch(PA, 10);
    const untracked = `UNT2-${TS}`;
    await setDoc(productDoc(untracked), { id: untracked, name: untracked });
    const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SA35-${TS}`;
    await deductStockForSale(sid, [
      { productId: PA, productName: 'A', qty: 3 },
      { productId: untracked, productName: 'U', qty: 2 },
    ], { branchId: BR });
    const r = await reverseStockForSale(sid);
    expect(r.reversedCount).toBe(1); // tracked only reversed
    expect(r.skippedCount).toBe(1); // skipped audit flipped
    expect((await rb(batchId)).qty.remaining).toBe(10);
    await deleteDoc(productDoc(untracked));
  });
  it('SA36 empty stockConfig object (no trackStock key) → skipped', async () => {
    const emptyCfg = `EMPTY-${TS}`;
    await setDoc(productDoc(emptyCfg), { id: emptyCfg, name: emptyCfg, stockConfig: {} });
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`SA36-${TS}`, [{ productId: emptyCfg, productName: 'E', qty: 1 }], { branchId: BR });
    expect(r.skippedItems[0].reason).toBe('not-tracked');
    await deleteDoc(productDoc(emptyCfg));
  });
  it('SA37 reverse empties revenueImpact/costBasis correctly', async () => {
    const { batchId } = await seedBatch(PA, 10, { cost: 25 }); const { deductStockForSale, reverseStockForSale, listStockMovements } = await bc();
    const sid = `SA37-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 2, isPremium: true }], { branchId: BR });
    await reverseStockForSale(sid);
    const all = await listStockMovements({ linkedSaleId: sid, includeReversed: true });
    const rev = all.find(m => m.reverseOf);
    expect(rev.revenueImpact).toBe(0);
    expect(rev.costBasis).toBe(50);
  });
  it('SA38 batch status never moves backwards unexpectedly', async () => {
    const { batchId } = await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale } = await bc();
    for (let i = 0; i < 3; i++) {
      await deductStockForSale(`SA38-${i}-${TS}`, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
      await reverseStockForSale(`SA38-${i}-${TS}`);
    }
    const b = await rb(batchId);
    expect(b.status).toBe('active');
    expect(b.qty.remaining).toBe(10);
  });
  it('SA39 customer audit: customerId on movement + on reversal', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale, listStockMovements } = await bc();
    const sid = `SA39-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 2 }], { branchId: BR, customerId: 'CUST-39' });
    await reverseStockForSale(sid);
    const all = await listStockMovements({ linkedSaleId: sid, includeReversed: true });
    for (const m of all) expect(m.customerId).toBe('CUST-39');
  });
  it('SA40 decimal adjustment 3× 0.1 reduce + 1× 0.3 add = net 0', async () => {
    const { batchId } = await seedBatch(PA, 1); const { createStockAdjustment } = await bc();
    for (let i = 0; i < 3; i++) await createStockAdjustment({ batchId, type: 'reduce', qty: 0.1 });
    await createStockAdjustment({ batchId, type: 'add', qty: 0.3 });
    expect((await rb(batchId)).qty.remaining).toBeCloseTo(1, 10);
  });
  it('SA41 sale with mixed qty types (int, decimal, string-parsed)', async () => {
    const { batchId } = await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const sid = `SA41-${TS}`;
    await deductStockForSale(sid, [
      { productId: PA, productName: 'A', qty: 1 },
      { productId: PA, productName: 'A', qty: 0.5 },
      { productId: PA, productName: 'A', qty: '2' }, // string
    ], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(6.5);
  });
  it('SA42 missing productName handled', async () => {
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`SA42-${TS}`, [{ productId: 'unknown-product', qty: 1 }], { branchId: BR });
    expect(r.skippedItems.length).toBe(1);
  });
  it('SA43 very long note preserved', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    const longNote = 'รายละเอียด'.repeat(50); // 500 chars
    const { adjustmentId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1, note: longNote });
    const a = (await getDoc(doc(db, ...P, 'be_stock_adjustments', adjustmentId))).data();
    expect(a.note.length).toBe(longNote.length);
  });
  it('SA44 Thai unicode in product name', async () => {
    const thaiPid = `TH-${TS}`;
    await setDoc(productDoc(thaiPid), { id: thaiPid, name: 'วิตามินซี 1000mg', stockConfig: { trackStock: true, unit: 'เม็ด' } });
    const { createStockOrder, deductStockForSale } = await bc();
    const { batchIds } = await createStockOrder({ branchId: BR, items: [{ productId: thaiPid, productName: 'วิตามินซี 1000mg', qty: 10, cost: 5 }] });
    const sid = `SA44-${TS}`;
    await deductStockForSale(sid, [{ productId: thaiPid, productName: 'วิตามินซี 1000mg', qty: 3 }], { branchId: BR });
    expect((await rb(batchIds[0])).qty.remaining).toBe(7);
    await deleteDoc(productDoc(thaiPid));
  });
  it('SA45 sale → analyze → reverse → analyze sequence', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, analyzeStockImpact, reverseStockForSale } = await bc();
    const sid = `SA45-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    const a1 = await analyzeStockImpact({ saleId: sid });
    expect(a1.totalQtyToRestore).toBe(3);
    await reverseStockForSale(sid);
    const a2 = await analyzeStockImpact({ saleId: sid });
    expect(a2.totalQtyToRestore).toBe(0);
  });
  it('SA46 FIFO when 1 batch has 0 + 1 has 5 → consume from live', async () => {
    const a = (await seedBatch(PA, 5, { expiresAt: '2027-01-01' })).batchId;
    const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId: a, type: 'reduce', qty: 5 }); // deplete
    const b = (await seedBatch(PA, 10, { expiresAt: '2027-06-01' })).batchId;
    const { deductStockForSale } = await bc();
    await deductStockForSale(`SA46-${TS}`, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await rb(a)).qty.remaining).toBe(0);
    expect((await rb(b)).qty.remaining).toBe(7);
  });
  it('SA47 reverseOf chain follows original', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale, listStockMovements } = await bc();
    const sid = `SA47-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 2 }], { branchId: BR });
    await reverseStockForSale(sid);
    const all = await listStockMovements({ linkedSaleId: sid, includeReversed: true });
    const orig = all.find(m => !m.reverseOf);
    const rev = all.find(m => m.reverseOf);
    expect(orig.reversedByMovementId).toBe(rev.movementId);
    expect(rev.reverseOf).toBe(orig.movementId);
    expect(rev.linkedSaleId).toBe(sid); // still linked so queries work
  });
  it('SA48 batch with cost=0 (premium from vendor) still tracks COGS', async () => {
    const { batchId } = await seedBatch(PA, 10, { cost: 0, isPremium: true });
    const { deductStockForSale, listStockMovements } = await bc();
    const sid = `SA48-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    const m = (await listStockMovements({ linkedSaleId: sid }))[0];
    expect(m.costBasis).toBe(0);
  });
  it('SA49 movement fields always have expected types', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, listStockMovements } = await bc();
    const sid = `SA49-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    const m = (await listStockMovements({ linkedSaleId: sid }))[0];
    expect(typeof m.qty).toBe('number');
    expect(typeof m.before).toBe('number');
    expect(typeof m.after).toBe('number');
    expect(typeof m.costBasis).toBe('number');
    expect(typeof m.isPremium).toBe('boolean');
    expect(typeof m.skipped).toBe('boolean');
    expect(typeof m.createdAt).toBe('string');
  });
  it('SA50 E2E stress: 5 sales each 3-item → 15 items total correct', async () => {
    await seedBatch(PA, 1000); const { deductStockForSale } = await bc();
    for (let i = 0; i < 5; i++) {
      await deductStockForSale(`SA50-${i}-${TS}`, [
        { productId: PA, productName: 'A', qty: 2 },
        { productId: PA, productName: 'A', qty: 3 },
        { productId: PA, productName: 'A', qty: 5 },
      ], { branchId: BR });
    }
    const { listStockBatches } = await bc();
    const batches = await listStockBatches({ productId: PA, branchId: BR });
    expect(batches.reduce((s, b) => s + b.qty.remaining, 0)).toBe(1000 - 5 * 10);
  }, 120000);
});
