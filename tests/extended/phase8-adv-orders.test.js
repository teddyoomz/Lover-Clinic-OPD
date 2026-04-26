// Phase 8 adversarial: Orders + Adjustments deep (~65 tests)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20', authDomain: 'loverclinic-opd-4c39b.firebaseapp.com',
  projectId: 'loverclinic-opd-4c39b', storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app',
  messagingSenderId: '653911776503', appId: '1:653911776503:web:9e23f723d3ed877962c7f2',
  measurementId: 'G-TB3Q9BZ8R5',
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const P = ['artifacts', 'loverclinic-opd-4c39b', 'public', 'data'];
const TS = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bc = () => import('../src/lib/backendClient.js');

const batchesCol = () => collection(db, ...P, 'be_stock_batches');
const batchDoc = (id) => doc(db, ...P, 'be_stock_batches', id);
const orderDoc = (id) => doc(db, ...P, 'be_stock_orders', id);
const ordersCol = () => collection(db, ...P, 'be_stock_orders');
const movementsCol = () => collection(db, ...P, 'be_stock_movements');
const adjustmentsCol = () => collection(db, ...P, 'be_stock_adjustments');
const adjustmentDoc = (id) => doc(db, ...P, 'be_stock_adjustments', id);
const mvtDoc = (id) => doc(db, ...P, 'be_stock_movements', id);
const productDoc = (pid) => doc(db, ...P, 'master_data', 'products', 'items', pid);

const BR = `ADVO-BR-${TS}`;
const PA = `ADVO-PA-${TS}`;
const PFRESH = `ADVO-PFRESH-${TS}`;    // starts with no stockConfig
const POPTOUT = `ADVO-POPT-${TS}`;     // explicit trackStock=false

async function nuke() {
  for (const col of [batchesCol(), ordersCol(), movementsCol(), adjustmentsCol()]) {
    const s = await getDocs(query(col, where('branchId', '==', BR)));
    await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
  }
}
async function nukeProd() {
  for (const pid of [PA, PFRESH, POPTOUT]) { try { await deleteDoc(productDoc(pid)); } catch {} }
}
async function seedBatch(pid, qty, opts = {}) {
  const { createStockOrder } = await bc();
  const { orderId, batchIds } = await createStockOrder({
    branchId: BR, items: [{ productId: pid, productName: pid, qty, cost: opts.cost ?? 10, unit: 'U', expiresAt: opts.expiresAt ?? null, isPremium: opts.isPremium ?? false }],
  });
  return { orderId, batchId: batchIds[0] };
}

beforeAll(async () => {
  await nuke(); await nukeProd();
  await setDoc(productDoc(PA), { id: PA, name: 'PA', stockConfig: { trackStock: true, unit: 'U' } });
});
afterAll(async () => { await nuke(); await nukeProd(); });

describe('[STK-O] Order CRUD deep (30 tests)', () => {
  beforeEach(nuke);

  it('O1 order doc has orderId + createdAt', async () => { const { orderId } = await seedBatch(PA, 5); const o = (await getDoc(orderDoc(orderId))).data(); expect(o.orderId).toBe(orderId); expect(o.createdAt).toBeTruthy(); });
  it('O2 order status=active on create', async () => { const { orderId } = await seedBatch(PA, 5); expect((await getDoc(orderDoc(orderId))).data().status).toBe('active'); });
  it('O3 order items.length matches input', async () => {
    const { createStockOrder } = await bc();
    const { orderId } = await createStockOrder({ branchId: BR, items: [
      { productId: PA, productName: 'A', qty: 1, cost: 1 },
      { productId: PA, productName: 'A', qty: 2, cost: 1 },
    ] });
    expect((await getDoc(orderDoc(orderId))).data().items.length).toBe(2);
  });
  it('O4 order.branchId preserved', async () => { const { orderId } = await seedBatch(PA, 1); expect((await getDoc(orderDoc(orderId))).data().branchId).toBe(BR); });
  it('O5 order.vendorName preserved', async () => {
    const { createStockOrder } = await bc();
    const { orderId } = await createStockOrder({ branchId: BR, vendorName: 'ACME Co', items: [{ productId: PA, productName: 'A', qty: 1, cost: 1 }] });
    expect((await getDoc(orderDoc(orderId))).data().vendorName).toBe('ACME Co');
  });
  it('O6 cancel clean (no consumption) → all batches cancelled', async () => {
    const { createStockOrder, cancelStockOrder } = await bc();
    const { orderId, batchIds } = await createStockOrder({ branchId: BR, items: [
      { productId: PA, productName: 'A', qty: 1, cost: 1 },
      { productId: PA, productName: 'A', qty: 2, cost: 1 },
    ] });
    const r = await cancelStockOrder(orderId);
    expect(r.cancelledBatchIds.length).toBe(2);
    for (const bid of batchIds) { expect((await getDoc(batchDoc(bid))).data().status).toBe('cancelled'); }
  });
  it('O7 cancel idempotent', async () => {
    const { orderId } = await seedBatch(PA, 5); const { cancelStockOrder } = await bc();
    await cancelStockOrder(orderId); const r = await cancelStockOrder(orderId);
    expect(r.alreadyCancelled).toBe(true);
  });
  it('O8 cancel blocked when batch consumed by sale', async () => {
    const { orderId } = await seedBatch(PA, 10); const { deductStockForSale, cancelStockOrder } = await bc();
    await deductStockForSale(`O8-${TS}`, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR });
    await expect(cancelStockOrder(orderId)).rejects.toThrow(/cannot cancel|ยกเลิกคำสั่งซื้อ/i);
  });
  it('O9 cancel blocked when batch consumed by adjust', async () => {
    const { orderId, batchId } = await seedBatch(PA, 10); const { createStockAdjustment, cancelStockOrder } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    await expect(cancelStockOrder(orderId)).rejects.toThrow(/cannot cancel/i);
  });
  it('O10 cancel non-existent throws', async () => {
    const { cancelStockOrder } = await bc();
    await expect(cancelStockOrder('ORD-NOPE')).rejects.toThrow(/not found/i);
  });
  it('O11 update note', async () => {
    const { orderId } = await seedBatch(PA, 1); const { updateStockOrder } = await bc();
    await updateStockOrder(orderId, { note: 'X' });
    expect((await getDoc(orderDoc(orderId))).data().note).toBe('X');
  });
  it('O12 update vendorName', async () => {
    const { orderId } = await seedBatch(PA, 1); const { updateStockOrder } = await bc();
    await updateStockOrder(orderId, { vendorName: 'V2' });
    expect((await getDoc(orderDoc(orderId))).data().vendorName).toBe('V2');
  });
  it('O13 update discount + discountType percent', async () => {
    const { orderId } = await seedBatch(PA, 1); const { updateStockOrder } = await bc();
    await updateStockOrder(orderId, { discount: 10, discountType: 'percent' });
    const o = (await getDoc(orderDoc(orderId))).data();
    expect(o.discount).toBe(10); expect(o.discountType).toBe('percent');
  });
  it('O14 update qty on item throws', async () => {
    const { orderId } = await seedBatch(PA, 1); const o = (await getDoc(orderDoc(orderId))).data();
    const { updateStockOrder } = await bc();
    await expect(updateStockOrder(orderId, { items: [{ orderProductId: o.items[0].orderProductId, qty: 99 }] }))
      .rejects.toThrow(/qty edits are blocked/i);
  });
  it('O15 update cost cascades to batch.originalCost', async () => {
    const { orderId, batchId } = await seedBatch(PA, 5, { cost: 20 });
    const o = (await getDoc(orderDoc(orderId))).data();
    const { updateStockOrder } = await bc();
    await updateStockOrder(orderId, { items: [{ orderProductId: o.items[0].orderProductId, cost: 99 }] });
    expect((await getDoc(batchDoc(batchId))).data().originalCost).toBe(99);
  });
  it('O16 update expiresAt cascades to batch.expiresAt', async () => {
    const { orderId, batchId } = await seedBatch(PA, 5);
    const o = (await getDoc(orderDoc(orderId))).data();
    const { updateStockOrder } = await bc();
    await updateStockOrder(orderId, { items: [{ orderProductId: o.items[0].orderProductId, expiresAt: '2028-01-01' }] });
    expect((await getDoc(batchDoc(batchId))).data().expiresAt).toBe('2028-01-01');
  });
  it('O17 update cancelled order throws', async () => {
    const { orderId } = await seedBatch(PA, 1); const { cancelStockOrder, updateStockOrder } = await bc();
    await cancelStockOrder(orderId);
    await expect(updateStockOrder(orderId, { note: 'x' })).rejects.toThrow(/cancelled/i);
  });
  it('O18 update unknown orderProductId throws', async () => {
    const { orderId } = await seedBatch(PA, 1); const { updateStockOrder } = await bc();
    await expect(updateStockOrder(orderId, { items: [{ orderProductId: 'X', cost: 1 }] })).rejects.toThrow(/not found/i);
  });
  it('O19 IMPORT movement has linkedOrderId + costBasis', async () => {
    const { orderId } = await seedBatch(PA, 5, { cost: 10 });
    const q = query(movementsCol(), where('linkedOrderId', '==', orderId));
    const m = (await getDocs(q)).docs[0].data();
    expect(m.type).toBe(1); expect(m.costBasis).toBe(50);
  });
  it('O20 CANCEL_IMPORT movement emitted on cancel', async () => {
    const { orderId } = await seedBatch(PA, 7); const { cancelStockOrder } = await bc();
    await cancelStockOrder(orderId);
    const q = query(movementsCol(), where('linkedOrderId', '==', orderId));
    const ms = (await getDocs(q)).docs.map(d => d.data());
    const cancel = ms.find(m => m.type === 14);
    expect(cancel).toBeDefined(); expect(cancel.qty).toBe(-7);
  });
  it('O21 auto-upsert stockConfig on fresh product', async () => {
    // Pre-seed product WITHOUT stockConfig so createStockOrder can auto-upsert
    await setDoc(productDoc(PFRESH), { id: PFRESH, name: 'fresh' });
    const { orderId } = await seedBatch(PFRESH, 5);
    const prod = (await getDoc(productDoc(PFRESH))).data();
    expect(prod?.stockConfig?.trackStock).toBe(true);
  });
  it('O22 auto-upsert respects opt-out (trackStock=false)', async () => {
    await setDoc(productDoc(POPTOUT), { id: POPTOUT, name: 'OP', stockConfig: { trackStock: false, unit: 'U' } });
    await seedBatch(POPTOUT, 5);
    expect((await getDoc(productDoc(POPTOUT))).data().stockConfig.trackStock).toBe(false);
  });
  it('O23 auto-upsert does NOT touch already trackStock=true', async () => {
    await seedBatch(PA, 1);
    const prod = (await getDoc(productDoc(PA))).data();
    expect(prod.stockConfig.trackStock).toBe(true);
    expect(prod._stockConfigSetBy).toBeUndefined();
  });
  it('O24 listStockOrders filters by status', async () => {
    const a = await seedBatch(PA, 1); const b = await seedBatch(PA, 2);
    const { cancelStockOrder, listStockOrders } = await bc();
    await cancelStockOrder(a.orderId);
    const active = await listStockOrders({ branchId: BR, status: 'active' });
    const cancelled = await listStockOrders({ branchId: BR, status: 'cancelled' });
    expect(active.some(o => o.orderId === b.orderId)).toBe(true);
    expect(cancelled.some(o => o.orderId === a.orderId)).toBe(true);
  });
  it('O25 listStockOrders sorts importedDate DESC', async () => {
    const { createStockOrder, listStockOrders } = await bc();
    await createStockOrder({ branchId: BR, importedDate: '2026-01-01', items: [{ productId: PA, productName: 'A', qty: 1, cost: 1 }] });
    await createStockOrder({ branchId: BR, importedDate: '2026-04-01', items: [{ productId: PA, productName: 'A', qty: 1, cost: 1 }] });
    const orders = await listStockOrders({ branchId: BR });
    expect(orders[0].importedDate.startsWith('2026-04')).toBe(true);
  });
  it('O26 getStockOrder returns full doc', async () => {
    const { orderId } = await seedBatch(PA, 5); const { getStockOrder } = await bc();
    const o = await getStockOrder(orderId);
    expect(o.orderId).toBe(orderId); expect(o.items.length).toBe(1);
  });
  it('O27 getStockOrder missing → null', async () => {
    const { getStockOrder } = await bc();
    expect(await getStockOrder('ORD-XX')).toBeNull();
  });
  it('O28 isPremium preserved through order', async () => {
    const { orderId, batchId } = await seedBatch(PA, 5, { isPremium: true });
    expect((await getDoc(batchDoc(batchId))).data().isPremium).toBe(true);
    const q = query(movementsCol(), where('linkedOrderId', '==', orderId));
    expect((await getDocs(q)).docs[0].data().isPremium).toBe(true);
  });
  it('O29 order.createdBy user fields', async () => {
    const { createStockOrder } = await bc();
    const { orderId } = await createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: 1, cost: 1 }] }, { user: { userId: 'u1', userName: 'U One' } });
    expect((await getDoc(orderDoc(orderId))).data().createdBy.userId).toBe('u1');
  });
  it('O30 cancelledBy stamped on cancel', async () => {
    const { orderId } = await seedBatch(PA, 1); const { cancelStockOrder } = await bc();
    await cancelStockOrder(orderId, { user: { userId: 'u2', userName: 'U2' }, reason: 'test' });
    expect((await getDoc(orderDoc(orderId))).data().cancelledBy.userId).toBe('u2');
  });
});

describe('[STK-A] Adjustments deep (30 tests)', () => {
  beforeEach(nuke);

  it('A1 add happy', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 5 });
    const r = await createStockAdjustment({ batchId, type: 'add', qty: 3 });
    expect(r.before).toBe(5); expect(r.after).toBe(8);
  });
  it('A2 reduce happy', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    const r = await createStockAdjustment({ batchId, type: 'reduce', qty: 4 });
    expect(r.after).toBe(6);
  });
  it('A3 reduce to 0 → depleted', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 5 });
    expect((await getDoc(batchDoc(batchId))).data().status).toBe('depleted');
  });
  it('A4 add from depleted → active', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 10 });
    await createStockAdjustment({ batchId, type: 'add', qty: 4 });
    expect((await getDoc(batchDoc(batchId))).data().status).toBe('active');
  });
  it('A5 add caps at total', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'add', qty: 999 });
    expect((await getDoc(batchDoc(batchId))).data().qty.remaining).toBe(10);
  });
  it('A6 reduce insufficient throws + rollback', async () => {
    const { batchId } = await seedBatch(PA, 3); const { createStockAdjustment } = await bc();
    await expect(createStockAdjustment({ batchId, type: 'reduce', qty: 100 })).rejects.toThrow(/insufficient|stock/i);
    expect((await getDoc(batchDoc(batchId))).data().qty.remaining).toBe(3);
  });
  it('A7 cancelled batch blocks adjust', async () => {
    const { orderId, batchId } = await seedBatch(PA, 5); const { cancelStockOrder, createStockAdjustment } = await bc();
    await cancelStockOrder(orderId);
    await expect(createStockAdjustment({ batchId, type: 'reduce', qty: 1 })).rejects.toThrow(/cancelled/i);
  });
  it('A8 missing batchId throws', async () => {
    const { createStockAdjustment } = await bc();
    await expect(createStockAdjustment({ type: 'add', qty: 1 })).rejects.toThrow(/batchId/i);
  });
  it('A9 invalid type throws', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    await expect(createStockAdjustment({ batchId, type: 'xxx', qty: 1 })).rejects.toThrow(/invalid/i);
  });
  it('A10 qty=0 throws', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    await expect(createStockAdjustment({ batchId, type: 'add', qty: 0 })).rejects.toThrow(/invalid qty/i);
  });
  it('A11 qty negative throws', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    await expect(createStockAdjustment({ batchId, type: 'reduce', qty: -1 })).rejects.toThrow(/invalid qty/i);
  });
  it('A12 qty NaN throws', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    await expect(createStockAdjustment({ batchId, type: 'reduce', qty: NaN })).rejects.toThrow(/invalid qty/i);
  });
  it('A13 note preserved', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { adjustmentId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1, note: 'ของเสีย' });
    expect((await getDoc(adjustmentDoc(adjustmentId))).data().note).toBe('ของเสีย');
  });
  it('A14 adjustment doc links to movement', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { adjustmentId, movementId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    expect((await getDoc(adjustmentDoc(adjustmentId))).data().movementId).toBe(movementId);
  });
  it('A15 movement has correct qty sign (reduce negative)', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { movementId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 2 });
    expect((await getDoc(mvtDoc(movementId))).data().qty).toBe(-2);
  });
  it('A16 movement qty positive for add', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 5 });
    const { movementId } = await createStockAdjustment({ batchId, type: 'add', qty: 2 });
    expect((await getDoc(mvtDoc(movementId))).data().qty).toBe(2);
  });
  it('A17 movement costBasis = cost × qty', async () => {
    const { batchId } = await seedBatch(PA, 5, { cost: 20 }); const { createStockAdjustment } = await bc();
    const { movementId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 3 });
    expect((await getDoc(mvtDoc(movementId))).data().costBasis).toBe(60);
  });
  it('A18 movement type=3 for add', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 5 });
    const { movementId } = await createStockAdjustment({ batchId, type: 'add', qty: 1 });
    expect((await getDoc(mvtDoc(movementId))).data().type).toBe(3);
  });
  it('A19 movement type=4 for reduce', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { movementId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    expect((await getDoc(mvtDoc(movementId))).data().type).toBe(4);
  });
  it('A20 compensating opposite restores exactly', async () => {
    const { batchId } = await seedBatch(PA, 10); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 3 });
    await createStockAdjustment({ batchId, type: 'add', qty: 3 });
    expect((await getDoc(batchDoc(batchId))).data().qty.remaining).toBe(10);
  });
  it('A21 decimal 0.25 preserved', async () => {
    const { batchId } = await seedBatch(PA, 1); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 0.25 });
    expect((await getDoc(batchDoc(batchId))).data().qty.remaining).toBe(0.75);
  });
  it('A22 user audit fields populated', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { adjustmentId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 }, { user: { userId: 'u1', userName: 'U' } });
    expect((await getDoc(adjustmentDoc(adjustmentId))).data().user.userId).toBe('u1');
  });
  it('A23 movement user audit', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { movementId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 }, { user: { userId: 'u1', userName: 'U' } });
    expect((await getDoc(mvtDoc(movementId))).data().user.userId).toBe('u1');
  });
  it('A24 movement.sourceDocPath contains be_stock_adjustments', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { movementId, adjustmentId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    const m = (await getDoc(mvtDoc(movementId))).data();
    expect(m.sourceDocPath).toContain('be_stock_adjustments');
    expect(m.sourceDocPath).toContain(adjustmentId);
  });
  it('A25 movement.linkedAdjustId = adjustmentId', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { movementId, adjustmentId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    expect((await getDoc(mvtDoc(movementId))).data().linkedAdjustId).toBe(adjustmentId);
  });
  it('A26 huge reduce 1e6', async () => {
    const { batchId } = await seedBatch(PA, 1_000_000); const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 999_999 });
    expect((await getDoc(batchDoc(batchId))).data().qty.remaining).toBe(1);
  });
  it('A27 adjustment has branchId', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { adjustmentId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    expect((await getDoc(adjustmentDoc(adjustmentId))).data().branchId).toBe(BR);
  });
  it('A28 adjustment has createdAt', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { adjustmentId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    expect((await getDoc(adjustmentDoc(adjustmentId))).data().createdAt).toBeTruthy();
  });
  it('A29 batch.updatedAt changes on adjust', async () => {
    const { batchId } = await seedBatch(PA, 5);
    const beforeTs = (await getDoc(batchDoc(batchId))).data().updatedAt;
    await new Promise(r => setTimeout(r, 50));
    const { createStockAdjustment } = await bc();
    await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    const afterTs = (await getDoc(batchDoc(batchId))).data().updatedAt;
    expect(afterTs >= beforeTs).toBe(true);
  });
  it('A30 adjustmentId format ADJ-ts-rand4', async () => {
    const { batchId } = await seedBatch(PA, 5); const { createStockAdjustment } = await bc();
    const { adjustmentId } = await createStockAdjustment({ batchId, type: 'reduce', qty: 1 });
    expect(adjustmentId).toMatch(/^ADJ-\d+-[a-z0-9]{4}$/);
  });
});
