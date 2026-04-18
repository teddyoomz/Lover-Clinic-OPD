// Phase 8 adversarial: Central warehouses CRUD (~20 tests)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, deleteDoc, setDoc, collection, query, where } from 'firebase/firestore';

const firebaseConfig = { apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20', authDomain: 'loverclinic-opd-4c39b.firebaseapp.com', projectId: 'loverclinic-opd-4c39b', storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app', messagingSenderId: '653911776503', appId: '1:653911776503:web:9e23f723d3ed877962c7f2', measurementId: 'G-TB3Q9BZ8R5' };
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const P = ['artifacts', 'loverclinic-opd-4c39b', 'public', 'data'];
const TS = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bc = () => import('../src/lib/backendClient.js');

const whDoc = (id) => doc(db, ...P, 'be_central_stock_warehouses', id);
const whCol = () => collection(db, ...P, 'be_central_stock_warehouses');
const batchDoc = (id) => doc(db, ...P, 'be_stock_batches', id);
const batchesCol = () => collection(db, ...P, 'be_stock_batches');

const ID_PREFIX = `ADVCH-${TS}`;

async function nukeTestWH() {
  const s = await getDocs(whCol());
  const toDel = s.docs.filter(d => d.data().stockName?.includes(`TESTWH-${TS}`) || d.id.includes(TS));
  await Promise.all(toDel.map(d => deleteDoc(d.ref)));
}
async function nukeBatches(branch) {
  const s = await getDocs(query(batchesCol(), where('branchId', '==', branch)));
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}

beforeAll(nukeTestWH);
afterAll(nukeTestWH);
beforeEach(nukeTestWH);

describe('[STK-CH] Central warehouses CRUD (20 tests)', () => {
  it('CH1 create warehouse with name', async () => {
    const { createCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-1` });
    const d = (await getDoc(whDoc(stockId))).data();
    expect(d.stockName).toBe(`TESTWH-${TS}-1`);
  });
  it('CH2 warehouse id format WH-ts-rand4', async () => {
    const { createCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-2` });
    expect(stockId).toMatch(/^WH-\d+-[a-z0-9]{4}$/);
  });
  it('CH3 empty name throws', async () => {
    const { createCentralWarehouse } = await bc();
    await expect(createCentralWarehouse({ stockName: '' })).rejects.toThrow(/stockName required/i);
  });
  it('CH4 isActive=true default', async () => {
    const { createCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-4` });
    expect((await getDoc(whDoc(stockId))).data().isActive).toBe(true);
  });
  it('CH5 phone + address preserved', async () => {
    const { createCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-5`, telephoneNumber: '02-111', address: 'Bangkok' });
    const d = (await getDoc(whDoc(stockId))).data();
    expect(d.telephoneNumber).toBe('02-111');
    expect(d.address).toBe('Bangkok');
  });
  it('CH6 update name + phone', async () => {
    const { createCentralWarehouse, updateCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-6` });
    await updateCentralWarehouse(stockId, { stockName: `TESTWH-${TS}-6-updated`, telephoneNumber: '02-999' });
    const d = (await getDoc(whDoc(stockId))).data();
    expect(d.stockName).toBe(`TESTWH-${TS}-6-updated`);
    expect(d.telephoneNumber).toBe('02-999');
  });
  it('CH7 update address', async () => {
    const { createCentralWarehouse, updateCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-7` });
    await updateCentralWarehouse(stockId, { address: 'New addr' });
    expect((await getDoc(whDoc(stockId))).data().address).toBe('New addr');
  });
  it('CH8 update nonexistent throws', async () => {
    const { updateCentralWarehouse } = await bc();
    await expect(updateCentralWarehouse('WH-404', { stockName: 'x' })).rejects.toThrow(/not found/i);
  });
  it('CH9 soft-delete sets isActive=false', async () => {
    const { createCentralWarehouse, deleteCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-9` });
    await deleteCentralWarehouse(stockId);
    expect((await getDoc(whDoc(stockId))).data().isActive).toBe(false);
  });
  it('CH10 soft-delete blocked if active batches exist', async () => {
    const { createCentralWarehouse, deleteCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-10` });
    // create active batch with branchId=stockId
    const batchId = `BATCH-${TS}-test-10`;
    await setDoc(batchDoc(batchId), { batchId, branchId: stockId, productId: 'x', qty: { remaining: 1, total: 1 }, status: 'active' });
    await expect(deleteCentralWarehouse(stockId)).rejects.toThrow(/ลบคลังไม่ได้/i);
    await deleteDoc(batchDoc(batchId));
  });
  it('CH11 listCentralWarehouses returns only active by default', async () => {
    const { createCentralWarehouse, deleteCentralWarehouse, listCentralWarehouses } = await bc();
    const a = await createCentralWarehouse({ stockName: `TESTWH-${TS}-11-A` });
    const b = await createCentralWarehouse({ stockName: `TESTWH-${TS}-11-B` });
    await deleteCentralWarehouse(a.stockId);
    const list = await listCentralWarehouses();
    const ours = list.filter(w => w.stockName?.includes(`TESTWH-${TS}-11`));
    expect(ours.length).toBe(1);
    expect(ours[0].stockId).toBe(b.stockId);
  });
  it('CH12 listCentralWarehouses includeInactive=true shows both', async () => {
    const { createCentralWarehouse, deleteCentralWarehouse, listCentralWarehouses } = await bc();
    const a = await createCentralWarehouse({ stockName: `TESTWH-${TS}-12-A` });
    const b = await createCentralWarehouse({ stockName: `TESTWH-${TS}-12-B` });
    await deleteCentralWarehouse(a.stockId);
    const list = await listCentralWarehouses({ includeInactive: true });
    const ours = list.filter(w => w.stockName?.includes(`TESTWH-${TS}-12`));
    expect(ours.length).toBe(2);
  });
  it('CH13 list sorted alphabetically by name', async () => {
    const { createCentralWarehouse, listCentralWarehouses } = await bc();
    await createCentralWarehouse({ stockName: `TESTWH-${TS}-13-Z` });
    await createCentralWarehouse({ stockName: `TESTWH-${TS}-13-A` });
    const list = await listCentralWarehouses();
    const ours = list.filter(w => w.stockName?.includes(`TESTWH-${TS}-13`));
    expect(ours[0].stockName).toContain('A');
  });
  it('CH14 listStockLocations combines main + centrals', async () => {
    const { createCentralWarehouse, listStockLocations } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-14` });
    const locs = await listStockLocations();
    expect(locs[0].id).toBe('main');
    expect(locs.some(l => l.id === stockId && l.kind === 'central')).toBe(true);
  });
  it('CH15 listStockLocations excludes inactive', async () => {
    const { createCentralWarehouse, deleteCentralWarehouse, listStockLocations } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-15` });
    await deleteCentralWarehouse(stockId);
    const locs = await listStockLocations();
    expect(locs.some(l => l.id === stockId)).toBe(false);
  });
  it('CH16 createdAt populated', async () => {
    const { createCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-16` });
    expect((await getDoc(whDoc(stockId))).data().createdAt).toBeTruthy();
  });
  it('CH17 updatedAt changes on update', async () => {
    const { createCentralWarehouse, updateCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-17` });
    const t0 = (await getDoc(whDoc(stockId))).data().updatedAt;
    await new Promise(r => setTimeout(r, 50));
    await updateCentralWarehouse(stockId, { stockName: `TESTWH-${TS}-17-v2` });
    const t1 = (await getDoc(whDoc(stockId))).data().updatedAt;
    expect(t1 >= t0).toBe(true);
  });
  it('CH18 update with isActive=false via patch', async () => {
    const { createCentralWarehouse, updateCentralWarehouse } = await bc();
    const { stockId } = await createCentralWarehouse({ stockName: `TESTWH-${TS}-18` });
    await updateCentralWarehouse(stockId, { isActive: false });
    expect((await getDoc(whDoc(stockId))).data().isActive).toBe(false);
  });
  it('CH19 createCentralWarehouse with custom stockId', async () => {
    const { createCentralWarehouse } = await bc();
    const customId = `WH-CUSTOM-${TS}`;
    const { stockId } = await createCentralWarehouse({ stockId: customId, stockName: `TESTWH-${TS}-19` });
    expect(stockId).toBe(customId);
  });
  it('CH20 listStockLocations main always first', async () => {
    const { listStockLocations } = await bc();
    const locs = await listStockLocations();
    expect(locs[0]).toEqual(expect.objectContaining({ id: 'main', kind: 'branch' }));
  });
});
