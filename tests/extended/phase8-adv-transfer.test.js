// Phase 8 adversarial: Transfer state machine + stock mutations (~40 tests)
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
const transferDoc = (id) => doc(db, ...P, 'be_stock_transfers', id);
const transfersCol = () => collection(db, ...P, 'be_stock_transfers');
const warehouseDoc = (id) => doc(db, ...P, 'be_central_stock_warehouses', id);
const productDoc = (pid) => doc(db, ...P, 'master_data', 'products', 'items', pid);

const SRC = `ADVX-SRC-${TS}`;
const DST = `ADVX-DST-${TS}`;
const PA = `ADVX-PA-${TS}`;

async function nuke() {
  for (const col of [batchesCol(), ordersCol(), movementsCol(), transfersCol()]) {
    for (const branch of [SRC, DST]) {
      const s = await getDocs(query(col, where('branchId', '==', branch)));
      await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
    }
    // also clean by sourceLocationId for transfer docs
    if (col === transfersCol()) {
      for (const br of [SRC, DST]) {
        const s = await getDocs(query(col, where('sourceLocationId', '==', br)));
        await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
      }
    }
  }
}
async function nukeProd() { try { await deleteDoc(productDoc(PA)); } catch {} }
async function seedBatch(branch, qty, opts = {}) {
  const { createStockOrder } = await bc();
  const { batchIds } = await createStockOrder({ branchId: branch, items: [{ productId: PA, productName: PA, qty, cost: opts.cost ?? 10, unit: 'U', expiresAt: opts.expiresAt ?? null, isPremium: !!opts.isPremium }] });
  return batchIds[0];
}
async function mvtsForX(tid) { const q = query(movementsCol(), where('linkedTransferId', '==', tid)); return (await getDocs(q)).docs.map(d => d.data()); }

beforeAll(async () => {
  await nuke(); await nukeProd();
  await setDoc(productDoc(PA), { id: PA, name: 'PA', stockConfig: { trackStock: true, unit: 'U' } });
});
afterAll(async () => { await nuke(); await nukeProd(); });

describe('[STK-X] Transfer state machine deep (40 tests)', () => {
  beforeEach(nuke);

  it('X1 create status=0', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 5 }] });
    expect((await getDoc(transferDoc(transferId))).data().status).toBe(0);
  });
  it('X2 create empty items throws', async () => {
    const { createStockTransfer } = await bc();
    await expect(createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [] })).rejects.toThrow(/at least one/i);
  });
  it('X3 create same src=dst throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer } = await bc();
    await expect(createStockTransfer({ sourceLocationId: SRC, destinationLocationId: SRC, items: [{ sourceBatchId: b, qty: 1 }] })).rejects.toThrow(/ไม่ใช่ที่เดียวกัน|same/i);
  });
  it('X4 missing source throws', async () => {
    const { createStockTransfer } = await bc();
    await expect(createStockTransfer({ destinationLocationId: DST, items: [] })).rejects.toThrow(/required/i);
  });
  it('X5 missing dest throws', async () => {
    const { createStockTransfer } = await bc();
    await expect(createStockTransfer({ sourceLocationId: SRC, items: [] })).rejects.toThrow(/required/i);
  });
  it('X6 item missing sourceBatchId throws', async () => {
    const { createStockTransfer } = await bc();
    await expect(createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ qty: 1 }] })).rejects.toThrow(/sourceBatchId/i);
  });
  it('X7 item invalid qty throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer } = await bc();
    await expect(createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 0 }] })).rejects.toThrow(/invalid qty/i);
  });
  it('X8 nonexistent batch throws', async () => {
    const { createStockTransfer } = await bc();
    await expect(createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: 'no-such', qty: 1 }] })).rejects.toThrow(/not found/i);
  });
  it('X9 batch belongs to different branch throws', async () => {
    const b = await seedBatch(DST, 10); const { createStockTransfer } = await bc();
    await expect(createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] })).rejects.toThrow(/belongs to/i);
  });
  it('X10 insufficient remaining throws', async () => {
    const b = await seedBatch(SRC, 2); const { createStockTransfer } = await bc();
    await expect(createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 100 }] })).rejects.toThrow(/insufficient remaining/i);
  });
  it('X11 create snapshots cost/expiry/isPremium', async () => {
    const b = await seedBatch(SRC, 10, { cost: 50, expiresAt: '2027-06-01', isPremium: true });
    const { createStockTransfer } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    const t = (await getDoc(transferDoc(transferId))).data();
    expect(t.items[0].cost).toBe(50); expect(t.items[0].expiresAt).toBe('2027-06-01'); expect(t.items[0].isPremium).toBe(true);
  });
  it('X12 0→1 deducts source + type=8 movement', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 1);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(6);
    const ms = await mvtsForX(transferId);
    expect(ms.some(m => m.type === 8)).toBe(true);
  });
  it('X13 1→2 creates NEW batch at dest + type=9 movement', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus, listStockBatches } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 2);
    const dstBatches = await listStockBatches({ branchId: DST, status: 'active' });
    const newBatch = dstBatches.find(x => x.sourceBatchId === b);
    expect(newBatch).toBeDefined();
    expect(newBatch.qty.remaining).toBe(4);
    const ms = await mvtsForX(transferId);
    expect(ms.some(m => m.type === 9)).toBe(true);
  });
  it('X14 destination batch inherits cost', async () => {
    const b = await seedBatch(SRC, 10, { cost: 77 }); const { createStockTransfer, updateStockTransferStatus, listStockBatches } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 2);
    const dst = (await listStockBatches({ branchId: DST, status: 'active' })).find(x => x.sourceBatchId === b);
    expect(dst.originalCost).toBe(77);
  });
  it('X15 destination batch inherits expiresAt', async () => {
    const b = await seedBatch(SRC, 10, { expiresAt: '2027-09-30' }); const { createStockTransfer, updateStockTransferStatus, listStockBatches } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 2);
    const dst = (await listStockBatches({ branchId: DST, status: 'active' })).find(x => x.sourceBatchId === b);
    expect(dst.expiresAt).toBe('2027-09-30');
  });
  it('X16 isPremium inherited', async () => {
    const b = await seedBatch(SRC, 10, { isPremium: true }); const { createStockTransfer, updateStockTransferStatus, listStockBatches } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 2);
    const dst = (await listStockBatches({ branchId: DST, status: 'active' })).find(x => x.sourceBatchId === b);
    expect(dst.isPremium).toBe(true);
  });
  it('X17 destinationBatchId filled on receive', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 2);
    const t = (await getDoc(transferDoc(transferId))).data();
    expect(t.items[0].destinationBatchId).toBeTruthy();
  });
  it('X18 0→3 clean cancel no stock mutation', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 3);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(10);
    expect((await getDoc(transferDoc(transferId))).data().status).toBe(3);
  });
  it('X19 1→3 reverses source exactly', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 3);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(10);
  });
  it('X20 1→4 rejected reverses source exactly', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 4);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(10);
  });
  it('X21 invalid transition 2→3 throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 2);
    await expect(updateStockTransferStatus(transferId, 3)).rejects.toThrow(/Invalid transfer status transition/i);
  });
  it('X22 invalid transition 2→4 throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 2);
    await expect(updateStockTransferStatus(transferId, 4)).rejects.toThrow(/Invalid/i);
  });
  it('X23 invalid transition 3→1 throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 3);
    await expect(updateStockTransferStatus(transferId, 1)).rejects.toThrow(/Invalid/i);
  });
  it('X24 invalid transition 0→2 throws', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await expect(updateStockTransferStatus(transferId, 2)).rejects.toThrow(/Invalid/i);
  });
  it('X25 update on nonexistent transfer throws', async () => {
    const { updateStockTransferStatus } = await bc();
    await expect(updateStockTransferStatus('TRF-X', 1)).rejects.toThrow(/not found/i);
  });
  it('X26 canceledNote saved on cancel', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 3, { canceledNote: 'emergency stop' });
    expect((await getDoc(transferDoc(transferId))).data().canceledNote).toBe('emergency stop');
  });
  it('X27 rejectedNote saved on reject', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 4, { rejectedNote: 'damaged' });
    expect((await getDoc(transferDoc(transferId))).data().rejectedNote).toBe('damaged');
  });
  it('X28 deliveredTrackingNumber saved on send', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 4 }] });
    await updateStockTransferStatus(transferId, 1, { deliveredTrackingNumber: 'TH123456' });
    expect((await getDoc(transferDoc(transferId))).data().deliveredTrackingNumber).toBe('TH123456');
  });
  it('X29 multi-item transfer deducts all on send', async () => {
    const a = await seedBatch(SRC, 10); const b = await seedBatch(SRC, 20);
    const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [
      { sourceBatchId: a, qty: 3 }, { sourceBatchId: b, qty: 5 },
    ] });
    await updateStockTransferStatus(transferId, 1);
    expect((await getDoc(batchDoc(a))).data().qty.remaining).toBe(7);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(15);
  });
  it('X30 multi-item receive creates multiple dest batches', async () => {
    const a = await seedBatch(SRC, 10); const b = await seedBatch(SRC, 20);
    const { createStockTransfer, updateStockTransferStatus, listStockBatches } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [
      { sourceBatchId: a, qty: 3 }, { sourceBatchId: b, qty: 5 },
    ] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 2);
    const dst = await listStockBatches({ branchId: DST });
    expect(dst.length).toBe(2);
  });
  it('X31 source deducted depleted sets status depleted', async () => {
    const b = await seedBatch(SRC, 5); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 5 }] });
    await updateStockTransferStatus(transferId, 1);
    expect((await getDoc(batchDoc(b))).data().status).toBe('depleted');
  });
  it('X32 cancel at 1→3 restores status back to active', async () => {
    const b = await seedBatch(SRC, 5); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 5 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 3);
    expect((await getDoc(batchDoc(b))).data().status).toBe('active');
  });
  it('X33 listStockTransfers filters by locationId', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, listStockTransfers } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] });
    const list = await listStockTransfers({ locationId: SRC });
    expect(list.some(t => t.transferId === transferId)).toBe(true);
  });
  it('X34 listStockTransfers filters by status', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus, listStockTransfers } = await bc();
    const a = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] });
    await updateStockTransferStatus(a.transferId, 3);
    const cancelled = await listStockTransfers({ status: 3, locationId: SRC });
    expect(cancelled.some(t => t.transferId === a.transferId)).toBe(true);
  });
  it('X35 getStockTransfer returns full doc', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, getStockTransfer } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 2 }] });
    const t = await getStockTransfer(transferId);
    expect(t.transferId).toBe(transferId);
    expect(t.items.length).toBe(1);
  });
  it('X36 getStockTransfer missing → null', async () => {
    const { getStockTransfer } = await bc();
    expect(await getStockTransfer('TRF-404')).toBeNull();
  });
  it('X37 transferId format TRF-ts-rand4', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 1 }] });
    expect(transferId).toMatch(/^TRF-\d+-[a-z0-9]{4}$/);
  });
  it('X38 reverse-on-cancel does not create new batch at dest', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus, listStockBatches } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockTransferStatus(transferId, 1);
    await updateStockTransferStatus(transferId, 3);
    const dst = await listStockBatches({ branchId: DST });
    expect(dst.length).toBe(0);
  });
  it('X39 cancel from 0 no type=8 movement', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 3 }] });
    await updateStockTransferStatus(transferId, 3);
    const ms = await mvtsForX(transferId);
    expect(ms.length).toBe(0);
  });
  it('X40 user audit on state transitions', async () => {
    const b = await seedBatch(SRC, 10); const { createStockTransfer, updateStockTransferStatus } = await bc();
    const { transferId } = await createStockTransfer({ sourceLocationId: SRC, destinationLocationId: DST, items: [{ sourceBatchId: b, qty: 2 }] }, { user: { userId: 'u1', userName: 'U' } });
    await updateStockTransferStatus(transferId, 1, { user: { userId: 'u2', userName: 'U2' } });
    const ms = await mvtsForX(transferId);
    expect(ms[0].user.userId).toBe('u2');
  });
});
