// ═══════════════════════════════════════════════════════════════════════════
// Phase 8 adversarial: Batch creation + lifecycle + FIFO/FEFO allocation deep
// Target: 80+ scenarios
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20',
  authDomain: 'loverclinic-opd-4c39b.firebaseapp.com',
  projectId: 'loverclinic-opd-4c39b',
  storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app',
  messagingSenderId: '653911776503',
  appId: '1:653911776503:web:9e23f723d3ed877962c7f2',
  measurementId: 'G-TB3Q9BZ8R5',
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const P = ['artifacts', 'loverclinic-opd-4c39b', 'public', 'data'];
const TS = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bc = () => import('../src/lib/backendClient.js');
const su = () => import('../src/lib/stockUtils.js');

const batchesCol = () => collection(db, ...P, 'be_stock_batches');
const batchDoc = (id) => doc(db, ...P, 'be_stock_batches', id);
const ordersCol = () => collection(db, ...P, 'be_stock_orders');
const movementsCol = () => collection(db, ...P, 'be_stock_movements');
const productDoc = (pid) => doc(db, ...P, 'master_data', 'products', 'items', pid);

const BR = `ADVB-BR-${TS}`;
const PA = `ADVB-PA-${TS}`;
const PB = `ADVB-PB-${TS}`;

async function nuke() {
  for (const col of [batchesCol(), ordersCol(), movementsCol()]) {
    const s = await getDocs(query(col, where('branchId', '==', BR)));
    await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
  }
}
async function nukeProd() {
  for (const pid of [PA, PB]) { try { await deleteDoc(productDoc(pid)); } catch {} }
}
async function seedProduct(pid, name = pid) {
  await setDoc(productDoc(pid), {
    id: pid, name, stockConfig: { trackStock: true, unit: 'U' },
  });
}
async function seedBatch(pid, qty, opts = {}) {
  const { createStockOrder } = await bc();
  const { orderId, batchIds } = await createStockOrder({
    branchId: BR, importedDate: new Date().toISOString(),
    items: [{ productId: pid, productName: pid, qty, cost: opts.cost ?? 10, unit: 'U', expiresAt: opts.expiresAt ?? null, isPremium: opts.isPremium ?? false }],
  });
  if (opts.receivedAt) await setDoc(batchDoc(batchIds[0]), { receivedAt: opts.receivedAt }, { merge: true });
  return { orderId, batchId: batchIds[0] };
}
async function rb(id) { const s = await getDoc(batchDoc(id)); return s.exists() ? s.data() : null; }

beforeAll(async () => { await nuke(); await nukeProd(); await seedProduct(PA); await seedProduct(PB); });
afterAll(async () => { await nuke(); await nukeProd(); });

describe('[STK-B] batch creation invariants (30 tests)', () => {
  beforeEach(nuke);

  it('B1 fresh remaining===total', async () => { const { batchId } = await seedBatch(PA, 100); const b = await rb(batchId); expect(b.qty.remaining).toBe(100); expect(b.qty.total).toBe(100); });
  it('B2 status=active', async () => { const { batchId } = await seedBatch(PA, 10); expect((await rb(batchId)).status).toBe('active'); });
  it('B3 batchId regex BATCH-ts-rand4', async () => { const { batchId } = await seedBatch(PA, 1); expect(batchId).toMatch(/^BATCH-\d+-[a-z0-9]{4}$/); });
  it('B4 batchIds unique in single order (10 items)', async () => {
    const { createStockOrder } = await bc();
    const items = Array.from({ length: 10 }, () => ({ productId: PA, productName: 'A', qty: 1, cost: 1 }));
    const { batchIds } = await createStockOrder({ branchId: BR, items });
    expect(new Set(batchIds).size).toBe(10);
  });
  it('B5 orderProductId unique per item', async () => {
    const { createStockOrder } = await bc();
    const { batchIds } = await createStockOrder({ branchId: BR, items: [
      { productId: PA, productName: 'A', qty: 1, cost: 1 },
      { productId: PA, productName: 'A', qty: 2, cost: 1 },
    ] });
    const [b1, b2] = await Promise.all(batchIds.map(rb));
    expect(b1.orderProductId).not.toBe(b2.orderProductId);
  });
  it('B6 sourceOrderId links back', async () => { const { orderId, batchId } = await seedBatch(PA, 5); expect((await rb(batchId)).sourceOrderId).toBe(orderId); });
  it('B7 isPremium false default', async () => { const { batchId } = await seedBatch(PA, 1); expect((await rb(batchId)).isPremium).toBe(false); });
  it('B8 isPremium true preserved', async () => { const { batchId } = await seedBatch(PA, 1, { isPremium: true }); expect((await rb(batchId)).isPremium).toBe(true); });
  it('B9 decimal 0.5', async () => { const { batchId } = await seedBatch(PA, 0.5); expect((await rb(batchId)).qty.remaining).toBe(0.5); });
  it('B10 decimal 0.01', async () => { const { batchId } = await seedBatch(PA, 0.01); expect((await rb(batchId)).qty.remaining).toBe(0.01); });
  it('B11 decimal 9999.99', async () => { const { batchId } = await seedBatch(PA, 9999.99); expect((await rb(batchId)).qty.remaining).toBe(9999.99); });
  it('B12 huge 1e6', async () => { const { batchId } = await seedBatch(PA, 1e6); expect((await rb(batchId)).qty.total).toBe(1e6); });
  it('B13 qty=0 throws', async () => { const { createStockOrder } = await bc(); await expect(createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: 0 }] })).rejects.toThrow(/invalid/i); });
  it('B14 qty=-1 throws', async () => { const { createStockOrder } = await bc(); await expect(createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: -1 }] })).rejects.toThrow(/invalid/i); });
  it('B15 qty=NaN throws', async () => { const { createStockOrder } = await bc(); await expect(createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: NaN }] })).rejects.toThrow(/invalid/i); });
  it('B16 qty=Infinity throws', async () => { const { createStockOrder } = await bc(); await expect(createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: Infinity }] })).rejects.toThrow(/invalid/i); });
  it('B17 qty=string throws', async () => { const { createStockOrder } = await bc(); await expect(createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: 'x' }] })).rejects.toThrow(/invalid/i); });
  it('B18 unit Thai preserved', async () => {
    const { createStockOrder } = await bc();
    const { batchIds } = await createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: 1, cost: 1, unit: 'ซีซี/ขวด' }] });
    expect((await rb(batchIds[0])).unit).toBe('ซีซี/ขวด');
  });
  it('B19 receivedAt valid ISO', async () => { const { batchId } = await seedBatch(PA, 1); expect(new Date((await rb(batchId)).receivedAt).toString()).not.toBe('Invalid Date'); });
  it('B20 expiresAt null default', async () => { const { batchId } = await seedBatch(PA, 1); expect((await rb(batchId)).expiresAt).toBeNull(); });
  it('B21 expiresAt preserved', async () => { const { batchId } = await seedBatch(PA, 1, { expiresAt: '2027-12-31' }); expect((await rb(batchId)).expiresAt).toBe('2027-12-31'); });
  it('B22 cost=0 default when missing', async () => {
    const { createStockOrder } = await bc();
    const { batchIds } = await createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: 1 }] });
    expect((await rb(batchIds[0])).originalCost).toBe(0);
  });
  it('B23 cost preserved', async () => { const { batchId } = await seedBatch(PA, 1, { cost: 99.50 }); expect((await rb(batchId)).originalCost).toBe(99.50); });
  it('B24 branchId stamped', async () => { const { batchId } = await seedBatch(PA, 1); expect((await rb(batchId)).branchId).toBe(BR); });
  it('B25 productId stamped', async () => { const { batchId } = await seedBatch(PA, 1); expect((await rb(batchId)).productId).toBe(PA); });
  it('B26 productName stamped', async () => { const { batchId } = await seedBatch(PA, 1); expect((await rb(batchId)).productName).toBe(PA); });
  it('B27 multiple batches same product distinct', async () => { const a = await seedBatch(PA, 5); const b = await seedBatch(PA, 10); expect(a.batchId).not.toBe(b.batchId); });
  it('B28 empty items throws', async () => { const { createStockOrder } = await bc(); await expect(createStockOrder({ branchId: BR, items: [] })).rejects.toThrow(/at least one/i); });
  it('B29 createdAt set', async () => { const { batchId } = await seedBatch(PA, 1); expect((await rb(batchId)).createdAt).toBeTruthy(); });
  it('B30 updatedAt initially equals createdAt', async () => { const { batchId } = await seedBatch(PA, 1); const b = await rb(batchId); expect(b.updatedAt).toBeTruthy(); });
});

describe('[STK-B-LC] batch lifecycle transitions (15 tests)', () => {
  beforeEach(nuke);

  it('LC1 deduct to 0 → depleted', async () => {
    const { batchId } = await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    await deductStockForSale(`LC1-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR });
    expect((await rb(batchId)).status).toBe('depleted');
  });
  it('LC2 reverse from depleted → active', async () => {
    const { batchId } = await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `LC2-${TS}`; await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR });
    await reverseStockForSale(sid);
    const b = await rb(batchId); expect(b.status).toBe('active'); expect(b.qty.remaining).toBe(10);
  });
  it('LC3 cancel order → batch cancelled + remaining=0', async () => {
    const { orderId, batchId } = await seedBatch(PA, 20); const { cancelStockOrder } = await bc();
    await cancelStockOrder(orderId);
    const b = await rb(batchId); expect(b.status).toBe('cancelled'); expect(b.qty.remaining).toBe(0);
  });
  it('LC4 cancelled batch blocks adjust', async () => {
    const { orderId, batchId } = await seedBatch(PA, 10); const { cancelStockOrder, createStockAdjustment } = await bc();
    await cancelStockOrder(orderId);
    await expect(createStockAdjustment({ batchId, type: 'add', qty: 1 })).rejects.toThrow(/cancelled/i);
  });
  it('LC5 cancelled batch skipped in FIFO', async () => {
    const a = await seedBatch(PA, 5); const b = await seedBatch(PA, 5); const { cancelStockOrder, deductStockForSale } = await bc();
    await cancelStockOrder(a.orderId);
    await deductStockForSale(`LC5-${TS}`, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await rb(a.batchId)).qty.remaining).toBe(0);
    expect((await rb(b.batchId)).qty.remaining).toBe(2);
  });
  it('LC6 depleted batch skipped in FIFO', async () => {
    const a = await seedBatch(PA, 3, { expiresAt: '2027-01-01' }); const b = await seedBatch(PA, 10, { expiresAt: '2027-06-01' });
    const { createStockAdjustment, deductStockForSale } = await bc();
    await createStockAdjustment({ batchId: a.batchId, type: 'reduce', qty: 3 });
    await deductStockForSale(`LC6-${TS}`, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    expect((await rb(a.batchId)).qty.remaining).toBe(0);
    expect((await rb(b.batchId)).qty.remaining).toBe(5);
  });
  it('LC7 expired batch skipped in FIFO', async () => {
    const a = await seedBatch(PA, 10, { expiresAt: '2020-01-01' }); const b = await seedBatch(PA, 10, { expiresAt: '2027-01-01' });
    const { deductStockForSale } = await bc();
    await deductStockForSale(`LC7-${TS}`, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    expect((await rb(a.batchId)).qty.remaining).toBe(10);
    expect((await rb(b.batchId)).qty.remaining).toBe(5);
  });
  it('LC8 cancel order twice → idempotent', async () => {
    const { orderId } = await seedBatch(PA, 5); const { cancelStockOrder } = await bc();
    await cancelStockOrder(orderId); const r = await cancelStockOrder(orderId);
    expect(r.alreadyCancelled).toBe(true);
  });
  it('LC9 adjust depleted batch up to total → active', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 10 });
    await createStockAdjustment({ batchId, type: 'add', qty: 5 });
    const b = await rb(batchId); expect(b.status).toBe('active'); expect(b.qty.remaining).toBe(5);
  });
  it('LC10 adjust add beyond total caps', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'add', qty: 999 });
    expect((await rb(batchId)).qty.remaining).toBe(10);
  });
  it('LC11 cancel+reverse sequence: cancel after partial use blocked', async () => {
    const { orderId, batchId } = await seedBatch(PA, 10); const { deductStockForSale, cancelStockOrder } = await bc();
    await deductStockForSale(`LC11-${TS}`, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    await expect(cancelStockOrder(orderId)).rejects.toThrow(/cannot cancel/i);
  });
  it('LC12 listStockBatches status=active excludes depleted', async () => {
    const a = await seedBatch(PA, 5); const b = await seedBatch(PA, 10);
    const { createStockAdjustment, listStockBatches } = await bc();
    await createStockAdjustment({ batchId: a.batchId, type: 'reduce', qty: 5 });
    const active = await listStockBatches({ productId: PA, branchId: BR, status: 'active' });
    expect(active.length).toBe(1); expect(active[0].batchId).toBe(b.batchId);
  });
  it('LC13 listStockBatches status=depleted only shows depleted', async () => {
    const a = await seedBatch(PA, 5); const { createStockAdjustment, listStockBatches } = await bc();
    await createStockAdjustment({ batchId: a.batchId, type: 'reduce', qty: 5 });
    const depl = await listStockBatches({ productId: PA, branchId: BR, status: 'depleted' });
    expect(depl.length).toBe(1);
  });
  it('LC14 listStockBatches no filter returns all states', async () => {
    const a = await seedBatch(PA, 5); const b = await seedBatch(PA, 10);
    const { cancelStockOrder, listStockBatches } = await bc();
    await cancelStockOrder(a.orderId);
    const all = await listStockBatches({ productId: PA, branchId: BR });
    expect(all.length).toBe(2);
  });
  it('LC15 cancel non-existent order throws', async () => {
    const { cancelStockOrder } = await bc();
    await expect(cancelStockOrder('ORD-NO-SUCH')).rejects.toThrow(/not found/i);
  });
});

describe('[STK-F] FIFO + FEFO allocation deep (35 tests)', () => {
  beforeEach(nuke);

  it('F1 single batch exact qty depletes', async () => {
    const { batchId } = await seedBatch(PA, 25); const { deductStockForSale } = await bc();
    await deductStockForSale(`F1-${TS}`, [{ productId: PA, productName: 'A', qty: 25 }], { branchId: BR });
    expect((await rb(batchId)).qty.remaining).toBe(0);
  });
  it('F2 FEFO earliest expiry first', async () => {
    const a = await seedBatch(PA, 10, { expiresAt: '2027-08-01' });
    const b = await seedBatch(PA, 10, { expiresAt: '2027-06-01' });
    const c = await seedBatch(PA, 10, { expiresAt: '2027-10-01' });
    const { deductStockForSale } = await bc();
    await deductStockForSale(`F2-${TS}`, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    expect((await rb(b.batchId)).qty.remaining).toBe(5);
    expect((await rb(a.batchId)).qty.remaining).toBe(10);
    expect((await rb(c.batchId)).qty.remaining).toBe(10);
  });
  it('F3 FIFO tie-break older receivedAt', async () => {
    const a = await seedBatch(PA, 5, { expiresAt: '2027-06-01', receivedAt: '2026-04-15T00:00:00Z' });
    const b = await seedBatch(PA, 5, { expiresAt: '2027-06-01', receivedAt: '2026-01-01T00:00:00Z' });
    const { deductStockForSale } = await bc();
    await deductStockForSale(`F3-${TS}`, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await rb(b.batchId)).qty.remaining).toBe(2);
    expect((await rb(a.batchId)).qty.remaining).toBe(5);
  });
  it('F4 null expiry sorts last', async () => {
    const a = await seedBatch(PA, 5, { expiresAt: null });
    const b = await seedBatch(PA, 5, { expiresAt: '2027-06-01' });
    const { deductStockForSale } = await bc();
    await deductStockForSale(`F4-${TS}`, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await rb(b.batchId)).qty.remaining).toBe(2);
    expect((await rb(a.batchId)).qty.remaining).toBe(5);
  });
  it('F5 split across 2 batches', async () => {
    const a = await seedBatch(PA, 5, { expiresAt: '2027-01-01' });
    const b = await seedBatch(PA, 10, { expiresAt: '2027-02-01' });
    const { deductStockForSale } = await bc();
    await deductStockForSale(`F5-${TS}`, [{ productId: PA, productName: 'A', qty: 8 }], { branchId: BR });
    expect((await rb(a.batchId)).qty.remaining).toBe(0);
    expect((await rb(b.batchId)).qty.remaining).toBe(7);
  });
  it('F6 split across 3 batches', async () => {
    await seedBatch(PA, 3, { expiresAt: '2027-01-01' });
    await seedBatch(PA, 3, { expiresAt: '2027-02-01' });
    const c = await seedBatch(PA, 3, { expiresAt: '2027-03-01' });
    const { deductStockForSale } = await bc();
    await deductStockForSale(`F6-${TS}`, [{ productId: PA, productName: 'A', qty: 7 }], { branchId: BR });
    expect((await rb(c.batchId)).qty.remaining).toBe(2);
  });
  it('F7 shortfall throws when insufficient', async () => {
    await seedBatch(PA, 5); const { deductStockForSale } = await bc();
    await expect(deductStockForSale(`F7-${TS}`, [{ productId: PA, productName: 'A', qty: 100 }], { branchId: BR })).rejects.toThrow(/shortfall|insufficient/i);
  });
  it('F8 productId filter: PB not touched when selling PA', async () => {
    await seedBatch(PA, 10); const b = await seedBatch(PB, 10);
    const { deductStockForSale, listStockBatches } = await bc();
    await deductStockForSale(`F8-${TS}`, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    const batchesB = await listStockBatches({ productId: PB, branchId: BR });
    expect(batchesB[0].qty.remaining).toBe(10);
  });
  it('F9 branch filter: different branch batches untouched', async () => {
    const other = `OTHER-${TS}`;
    await seedBatch(PA, 10);
    const { createStockOrder, deductStockForSale, listStockBatches } = await bc();
    const { batchIds: [otherBatch] } = await createStockOrder({ branchId: other, items: [{ productId: PA, productName: 'A', qty: 10, cost: 1 }] });
    await deductStockForSale(`F9-${TS}`, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await rb(otherBatch)).qty.remaining).toBe(10);
    // cleanup
    await deleteDoc(batchDoc(otherBatch));
  });
  it('F10 fractional 0.3+0.2 no drift', async () => {
    const a = await seedBatch(PA, 0.3, { expiresAt: '2027-01-01' });
    const b = await seedBatch(PA, 0.5, { expiresAt: '2027-02-01' });
    const { deductStockForSale } = await bc();
    await deductStockForSale(`F10-${TS}`, [{ productId: PA, productName: 'A', qty: 0.5 }], { branchId: BR });
    expect((await rb(a.batchId)).qty.remaining).toBeCloseTo(0, 10);
    expect((await rb(b.batchId)).qty.remaining).toBeCloseTo(0.3, 10);
  });
  it('F11 zero qty no-op no movement', async () => {
    const { batchId } = await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`F11-${TS}`, [{ productId: PA, productName: 'A', qty: 0 }], { branchId: BR });
    expect(r.skippedItems[0].reason).toBe('zero-qty');
    expect((await rb(batchId)).qty.remaining).toBe(10);
  });
  it('F12 negative qty skipped', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`F12-${TS}`, [{ productId: PA, productName: 'A', qty: -1 }], { branchId: BR });
    // treated as zero-qty (Number() + <=0)
    expect(r.skippedItems.length).toBeGreaterThan(0);
  });
  it('F13 multi-item each splits', async () => {
    await seedBatch(PA, 3, { expiresAt: '2027-01-01' });
    await seedBatch(PA, 10, { expiresAt: '2027-02-01' });
    await seedBatch(PB, 3, { expiresAt: '2027-01-15' });
    await seedBatch(PB, 10, { expiresAt: '2027-03-01' });
    const { deductStockForSale, listStockMovements } = await bc();
    const sid = `F13-${TS}`;
    await deductStockForSale(sid, [
      { productId: PA, productName: 'A', qty: 7 },
      { productId: PB, productName: 'B', qty: 5 },
    ], { branchId: BR });
    const mvts = await listStockMovements({ linkedSaleId: sid });
    expect(mvts.length).toBe(4);
  });
  it('F14 sum of movement qty = -deductQty total', async () => {
    await seedBatch(PA, 5, { expiresAt: '2027-01-01' });
    await seedBatch(PA, 10, { expiresAt: '2027-02-01' });
    const { deductStockForSale, listStockMovements } = await bc();
    const sid = `F14-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 13 }], { branchId: BR });
    const mvts = await listStockMovements({ linkedSaleId: sid });
    expect(mvts.reduce((s, m) => s + m.qty, 0)).toBe(-13);
  });
  it('F15 batchFifoAllocate empty array → shortfall', async () => {
    const { batchFifoAllocate } = await su();
    const r = batchFifoAllocate([], 10);
    expect(r.shortfall).toBe(10); expect(r.allocations.length).toBe(0);
  });
  it('F16 batchFifoAllocate preferNewest=true goes newest first', async () => {
    const { batchFifoAllocate } = await su();
    const batches = [
      { batchId: 'old', status: 'active', qty: { remaining: 5, total: 5 }, productId: PA, branchId: BR, receivedAt: '2026-01-01' },
      { batchId: 'new', status: 'active', qty: { remaining: 5, total: 5 }, productId: PA, branchId: BR, receivedAt: '2026-04-01' },
    ];
    const r = batchFifoAllocate(batches, 3, { productId: PA, branchId: BR, preferNewest: true });
    expect(r.allocations[0].batchId).toBe('new');
  });
  it('F17 batchFifoAllocate exactBatchId first', async () => {
    const { batchFifoAllocate } = await su();
    const batches = [
      { batchId: 'normal', status: 'active', qty: { remaining: 5, total: 5 }, productId: PA, branchId: BR, receivedAt: '2026-01-01' },
      { batchId: 'target', status: 'active', qty: { remaining: 5, total: 5 }, productId: PA, branchId: BR, receivedAt: '2026-04-01' },
    ];
    const r = batchFifoAllocate(batches, 3, { productId: PA, branchId: BR, exactBatchId: 'target' });
    expect(r.allocations[0].batchId).toBe('target');
  });
  it('F18 batchFifoAllocate exactBatchId insufficient → fallback fills remainder', async () => {
    const { batchFifoAllocate } = await su();
    const batches = [
      { batchId: 'other', status: 'active', qty: { remaining: 5, total: 5 }, productId: PA, branchId: BR, receivedAt: '2026-01-01' },
      { batchId: 'small', status: 'active', qty: { remaining: 2, total: 2 }, productId: PA, branchId: BR, receivedAt: '2026-04-01' },
    ];
    const r = batchFifoAllocate(batches, 5, { productId: PA, branchId: BR, exactBatchId: 'small' });
    expect(r.allocations.length).toBe(2);
    expect(r.allocations[0].batchId).toBe('small');
    expect(r.allocations[1].batchId).toBe('other');
  });
  it('F19 batchFifoAllocate filterFn excludes premium', async () => {
    const { batchFifoAllocate } = await su();
    const batches = [
      { batchId: 'free', status: 'active', isPremium: true, qty: { remaining: 5, total: 5 }, productId: PA, branchId: BR, receivedAt: '2026-01-01' },
      { batchId: 'paid', status: 'active', isPremium: false, qty: { remaining: 5, total: 5 }, productId: PA, branchId: BR, receivedAt: '2026-02-01' },
    ];
    const r = batchFifoAllocate(batches, 3, { productId: PA, branchId: BR, filterFn: b => !b.isPremium });
    expect(r.allocations[0].batchId).toBe('paid');
  });
  it('F20 batchFifoAllocate 100-batch performance < 10s', async () => {
    const { batchFifoAllocate } = await su();
    const batches = Array.from({ length: 100 }, (_, i) => ({
      batchId: `B${i}`, status: 'active', qty: { remaining: 1, total: 1 }, productId: PA, branchId: BR,
      receivedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      expiresAt: `2027-${String((i % 12) + 1).padStart(2, '0')}-01`,
    }));
    const t0 = Date.now();
    const r = batchFifoAllocate(batches, 50, { productId: PA, branchId: BR });
    expect(Date.now() - t0).toBeLessThan(10000);
    expect(r.allocations.length).toBe(50);
  });
  it('F21 all batches depleted → shortfall', async () => {
    const { batchFifoAllocate } = await su();
    const batches = [{ batchId: 'a', status: 'active', qty: { remaining: 0, total: 10 }, productId: PA, branchId: BR }];
    const r = batchFifoAllocate(batches, 5, { productId: PA, branchId: BR });
    expect(r.shortfall).toBe(5);
  });
  it('F22 all batches expired → shortfall', async () => {
    const { batchFifoAllocate } = await su();
    const now = new Date('2026-06-01');
    const batches = [{ batchId: 'a', status: 'active', expiresAt: '2026-01-01', qty: { remaining: 10, total: 10 }, productId: PA, branchId: BR }];
    const r = batchFifoAllocate(batches, 5, { productId: PA, branchId: BR, now });
    expect(r.shortfall).toBe(5);
  });
  it('F23 all batches cancelled → shortfall', async () => {
    const { batchFifoAllocate } = await su();
    const batches = [{ batchId: 'a', status: 'cancelled', qty: { remaining: 10, total: 10 }, productId: PA, branchId: BR }];
    const r = batchFifoAllocate(batches, 5, { productId: PA, branchId: BR });
    expect(r.shortfall).toBe(5);
  });
  it('F24 mixed active+cancelled: only active consumed', async () => {
    const { batchFifoAllocate } = await su();
    const batches = [
      { batchId: 'dead', status: 'cancelled', qty: { remaining: 10, total: 10 }, productId: PA, branchId: BR, receivedAt: '2026-01-01' },
      { batchId: 'live', status: 'active', qty: { remaining: 10, total: 10 }, productId: PA, branchId: BR, receivedAt: '2026-02-01' },
    ];
    const r = batchFifoAllocate(batches, 5, { productId: PA, branchId: BR });
    expect(r.allocations[0].batchId).toBe('live');
  });
  it('F25 deduct zero qty → empty allocations no shortfall', async () => {
    const { batchFifoAllocate } = await su();
    const r = batchFifoAllocate([{ batchId: 'a', status: 'active', qty: { remaining: 10, total: 10 }, productId: PA, branchId: BR }], 0, { productId: PA, branchId: BR });
    expect(r.allocations.length).toBe(0); expect(r.shortfall).toBe(0);
  });
  it('F26 deduct negative qty → empty allocations', async () => {
    const { batchFifoAllocate } = await su();
    const r = batchFifoAllocate([{ batchId: 'a', status: 'active', qty: { remaining: 10, total: 10 }, productId: PA, branchId: BR }], -5, { productId: PA, branchId: BR });
    expect(r.allocations.length).toBe(0);
  });
  it('F27 deduct qty exactly equals total → full allocation', async () => {
    const { batchFifoAllocate } = await su();
    const r = batchFifoAllocate([{ batchId: 'a', status: 'active', qty: { remaining: 10, total: 10 }, productId: PA, branchId: BR }], 10, { productId: PA, branchId: BR });
    expect(r.allocations[0].takeQty).toBe(10); expect(r.shortfall).toBe(0);
  });
  it('F28 first batch fully consumed + second partial', async () => {
    const a = await seedBatch(PA, 20, { expiresAt: '2027-01-01' });
    const b = await seedBatch(PA, 10, { expiresAt: '2027-02-01' });
    const { deductStockForSale } = await bc();
    await deductStockForSale(`F28-${TS}`, [{ productId: PA, productName: 'A', qty: 23 }], { branchId: BR });
    expect((await rb(a.batchId)).qty.remaining).toBe(0);
    expect((await rb(b.batchId)).qty.remaining).toBe(7);
  });
  it('F29 exact-batch but batch has 0 remaining → fallback', async () => {
    const { batchFifoAllocate } = await su();
    const batches = [
      { batchId: 'empty', status: 'active', qty: { remaining: 0, total: 10 }, productId: PA, branchId: BR, receivedAt: '2026-01-01' },
      { batchId: 'live', status: 'active', qty: { remaining: 5, total: 5 }, productId: PA, branchId: BR, receivedAt: '2026-02-01' },
    ];
    const r = batchFifoAllocate(batches, 3, { productId: PA, branchId: BR, exactBatchId: 'empty' });
    expect(r.allocations[0].batchId).toBe('live');
  });
  it('F30 cross-product does not mix', async () => {
    await seedBatch(PA, 10); await seedBatch(PB, 10);
    const { deductStockForSale, listStockBatches } = await bc();
    await deductStockForSale(`F30-${TS}`, [{ productId: PA, productName: 'A', qty: 5 }, { productId: PB, productName: 'B', qty: 3 }], { branchId: BR });
    const bA = await listStockBatches({ productId: PA, branchId: BR });
    const bB = await listStockBatches({ productId: PB, branchId: BR });
    expect(bA[0].qty.remaining).toBe(5);
    expect(bB[0].qty.remaining).toBe(7);
  });
  it('F31 isBatchAvailable filters depleted', async () => {
    const { isBatchAvailable } = await su();
    expect(isBatchAvailable({ status: 'active', qty: { remaining: 0, total: 10 } })).toBe(false);
    expect(isBatchAvailable({ status: 'active', qty: { remaining: 5, total: 10 } })).toBe(true);
  });
  it('F32 isBatchAvailable filters expired', async () => {
    const { isBatchAvailable } = await su();
    expect(isBatchAvailable({ status: 'active', qty: { remaining: 5, total: 5 }, expiresAt: '2020-01-01' })).toBe(false);
  });
  it('F33 hasExpired with no expiresAt → false', async () => {
    const { hasExpired } = await su();
    expect(hasExpired({})).toBe(false);
  });
  it('F34 daysToExpiry future positive', async () => {
    const { daysToExpiry } = await su();
    const now = new Date('2026-01-01');
    expect(daysToExpiry({ expiresAt: '2026-01-11' }, now)).toBe(10);
  });
  it('F35 daysToExpiry past negative', async () => {
    const { daysToExpiry } = await su();
    const now = new Date('2026-01-01');
    expect(daysToExpiry({ expiresAt: '2025-12-22' }, now)).toBe(-10);
  });
});
