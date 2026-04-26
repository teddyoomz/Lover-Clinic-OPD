// Phase 8 adversarial: Withdrawal state machine (~30 tests)
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
const withdrawalDoc = (id) => doc(db, ...P, 'be_stock_withdrawals', id);
const withdrawalsCol = () => collection(db, ...P, 'be_stock_withdrawals');
const productDoc = (pid) => doc(db, ...P, 'master_data', 'products', 'items', pid);

const SRC = `ADVW-SRC-${TS}`;
const DST = `ADVW-DST-${TS}`;
const PA = `ADVW-PA-${TS}`;

async function nuke() {
  for (const col of [batchesCol(), ordersCol(), movementsCol(), withdrawalsCol()]) {
    for (const br of [SRC, DST]) {
      const s = await getDocs(query(col, where('branchId', '==', br)));
      await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
    }
  }
  for (const br of [SRC, DST]) {
    const s = await getDocs(query(withdrawalsCol(), where('sourceLocationId', '==', br)));
    await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
  }
}
async function nukeProd() { try { await deleteDoc(productDoc(PA)); } catch {} }
async function seedBatch(branch, qty, opts = {}) {
  const { createStockOrder } = await bc();
  const { batchIds } = await createStockOrder({ branchId: branch, items: [{ productId: PA, productName: PA, qty, cost: opts.cost ?? 10, unit: 'U' }] });
  return batchIds[0];
}
async function mvtsForW(wid) { const q = query(movementsCol(), where('linkedWithdrawalId', '==', wid)); return (await getDocs(q)).docs.map(d => d.data()); }

beforeAll(async () => { await nuke(); await nukeProd(); await setDoc(productDoc(PA), { id: PA, name: 'PA', stockConfig: { trackStock: true, unit: 'U' } }); });
afterAll(async () => { await nuke(); await nukeProd(); });

describe('[STK-W] Withdrawal state machine deep (30 tests)', () => {
  beforeEach(nuke);

  it('W1 create status=0 central_to_branch', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    expect((await getDoc(withdrawalDoc(withdrawalId))).data().status).toBe(0);
  });
  it('W2 create direction branch_to_central', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'branch_to_central', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 2 }] });
    expect((await getDoc(withdrawalDoc(withdrawalId))).data().direction).toBe('branch_to_central');
  });
  it('W3 invalid direction throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal } = await bc();
    await expect(createStockWithdrawal({ direction: 'invalid', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] })).rejects.toThrow(/direction/i);
  });
  it('W4 create empty items throws', async () => {
    const { createStockWithdrawal } = await bc();
    await expect(createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [] })).rejects.toThrow(/at least one/i);
  });
  it('W5 create same src=dst throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal } = await bc();
    await expect(createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: SRC, items: [{ sourceBatchId: b, qty: 1 }] })).rejects.toThrow(/ไม่ใช่ที่เดียวกัน|same/i);
  });
  it('W6 batch wrong branch throws', async () => {
    const b = await seedBatch(DST, 10); const { createStockWithdrawal } = await bc();
    await expect(createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] })).rejects.toThrow(/belongs to/i);
  });
  it('W7 insufficient remaining throws', async () => {
    const b = await seedBatch(SRC, 2); const { createStockWithdrawal } = await bc();
    await expect(createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 10 }] })).rejects.toThrow(/insufficient/i);
  });
  it('W8 0→1 (approve+send) deducts source + type=10 movement', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(6);
    expect((await mvtsForW(withdrawalId)).some(m => m.type === 10)).toBe(true);
  });
  it('W9 1→2 creates dest batch + type=13 movement', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus, listStockBatches } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    await updateStockWithdrawalStatus(withdrawalId, 2);
    const dst = (await listStockBatches({ branchId: DST })).find(x => x.sourceBatchId === b);
    expect(dst).toBeDefined(); expect(dst.qty.remaining).toBe(4);
    expect((await mvtsForW(withdrawalId)).some(m => m.type === 13)).toBe(true);
  });
  it('W10 0→3 clean cancel no mutation', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockWithdrawalStatus(withdrawalId, 3);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(10);
  });
  it('W11 1→3 reverses source', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    await updateStockWithdrawalStatus(withdrawalId, 3);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(10);
  });
  it('W12 invalid 2→3 throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    await updateStockWithdrawalStatus(withdrawalId, 2);
    await expect(updateStockWithdrawalStatus(withdrawalId, 3)).rejects.toThrow(/Invalid/i);
  });
  it('W13 invalid 0→2 throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await expect(updateStockWithdrawalStatus(withdrawalId, 2)).rejects.toThrow(/Invalid/i);
  });
  it('W14 update nonexistent throws', async () => {
    const { updateStockWithdrawalStatus } = await bc();
    await expect(updateStockWithdrawalStatus('WDR-404', 1)).rejects.toThrow(/not found/i);
  });
  it('W15 withdrawalId format WDR-ts-rand4', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] });
    expect(withdrawalId).toMatch(/^WDR-\d+-[a-z0-9]{4}$/);
  });
  it('W16 canceledNote preserved', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] });
    await updateStockWithdrawalStatus(withdrawalId, 3, { canceledNote: 'test' });
    expect((await getDoc(withdrawalDoc(withdrawalId))).data().canceledNote).toBe('test');
  });
  it('W17 multi-item 0→1 deducts all', async () => {
    const a = await seedBatch(SRC, 10); const b = await seedBatch(SRC, 5);
    const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [
      { sourceBatchId: a, qty: 3 }, { sourceBatchId: b, qty: 2 },
    ] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    expect((await getDoc(batchDoc(a))).data().qty.remaining).toBe(7);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(3);
  });
  it('W18 multi-item 1→2 creates multiple dest batches', async () => {
    const a = await seedBatch(SRC, 10); const b = await seedBatch(SRC, 5);
    const { createStockWithdrawal, updateStockWithdrawalStatus, listStockBatches } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [
      { sourceBatchId: a, qty: 3 }, { sourceBatchId: b, qty: 2 },
    ] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    await updateStockWithdrawalStatus(withdrawalId, 2);
    const dst = await listStockBatches({ branchId: DST });
    expect(dst.length).toBe(2);
  });
  it('W19 dest batch inherits cost', async () => {
    const b = await seedBatch(SRC, 10, { cost: 88 }); const { createStockWithdrawal, updateStockWithdrawalStatus, listStockBatches } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    await updateStockWithdrawalStatus(withdrawalId, 2);
    const dst = (await listStockBatches({ branchId: DST })).find(x => x.sourceBatchId === b);
    expect(dst.originalCost).toBe(88);
  });
  it('W20 destinationBatchId filled on receive', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    await updateStockWithdrawalStatus(withdrawalId, 2);
    const w = (await getDoc(withdrawalDoc(withdrawalId))).data();
    expect(w.items[0].destinationBatchId).toBeTruthy();
  });
  it('W21 listStockWithdrawals filters by location', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, listStockWithdrawals } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] });
    const list = await listStockWithdrawals({ locationId: SRC });
    expect(list.some(w => w.withdrawalId === withdrawalId)).toBe(true);
  });
  it('W22 getStockWithdrawal returns full doc', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, getStockWithdrawal } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 2 }] });
    const w = await getStockWithdrawal(withdrawalId);
    expect(w.direction).toBe('central_to_branch'); expect(w.items.length).toBe(1);
  });
  it('W23 getStockWithdrawal missing → null', async () => {
    const { getStockWithdrawal } = await bc();
    expect(await getStockWithdrawal('WDR-404')).toBeNull();
  });
  it('W24 cancel 1→3 no dest batch created', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus, listStockBatches } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    await updateStockWithdrawalStatus(withdrawalId, 3);
    expect((await listStockBatches({ branchId: DST })).length).toBe(0);
  });
  it('W25 cancel at 0 no movement', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockWithdrawalStatus(withdrawalId, 3);
    expect((await mvtsForW(withdrawalId)).length).toBe(0);
  });
  it('W26 source deducted fully → depleted', async () => {
    const b = await seedBatch(SRC, 5); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 5 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    expect((await getDoc(batchDoc(b))).data().status).toBe('depleted');
  });
  it('W27 reverse restores status active', async () => {
    const b = await seedBatch(SRC, 5); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 5 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    await updateStockWithdrawalStatus(withdrawalId, 3);
    expect((await getDoc(batchDoc(b))).data().status).toBe('active');
  });
  it('W28 user audit on creation + transitions', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] }, { user: { userId: 'u1', userName: 'U1' } });
    await updateStockWithdrawalStatus(withdrawalId, 1, { user: { userId: 'u2', userName: 'U2' } });
    expect((await mvtsForW(withdrawalId))[0].user.userId).toBe('u2');
  });
  it('W29 missing sourceBatchId throws', async () => {
    const { createStockWithdrawal } = await bc();
    await expect(createStockWithdrawal({ direction: 'central_to_branch', sourceLocationId: SRC, destinationLocationId: DST, items: [{ qty: 1 }] })).rejects.toThrow(/sourceBatchId/i);
  });
  it('W30 direction branch_to_central end-to-end', async () => {
    const b = await seedBatch(SRC, 10); const { createStockWithdrawal, updateStockWithdrawalStatus, listStockBatches } = await bc();
    const { withdrawalId } = await createStockWithdrawal({ direction: 'branch_to_central', sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockWithdrawalStatus(withdrawalId, 1);
    await updateStockWithdrawalStatus(withdrawalId, 2);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(7);
    const dst = await listStockBatches({ branchId: DST });
    expect(dst.length).toBe(1); expect(dst[0].qty.remaining).toBe(3);
  });
});
