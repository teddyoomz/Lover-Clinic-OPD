// Phase 8 adversarial: Sale integration deep (~50 tests)
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
const productDoc = (pid) => doc(db, ...P, 'master_data', 'products', 'items', pid);

const BR = `ADVS-BR-${TS}`;
const PA = `ADVS-PA-${TS}`;
const PB = `ADVS-PB-${TS}`;
const PUNT = `ADVS-PUNT-${TS}`;      // untracked
const POPT = `ADVS-POPT-${TS}`;      // opt-out

async function nuke() {
  for (const col of [batchesCol(), ordersCol(), movementsCol()]) {
    const s = await getDocs(query(col, where('branchId', '==', BR)));
    await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
  }
}
async function nukeProd() { for (const p of [PA, PB, PUNT, POPT]) { try { await deleteDoc(productDoc(p)); } catch {} } }
async function seedTracked(pid, name = pid) { await setDoc(productDoc(pid), { id: pid, name, stockConfig: { trackStock: true, unit: 'U' } }); }
async function seedUntracked(pid, name = pid) { await setDoc(productDoc(pid), { id: pid, name }); }
async function seedOptout(pid, name = pid) { await setDoc(productDoc(pid), { id: pid, name, stockConfig: { trackStock: false, unit: 'U' } }); }
async function seedBatch(pid, qty, opts = {}) {
  const { createStockOrder } = await bc();
  const { batchIds } = await createStockOrder({ branchId: BR, items: [{ productId: pid, productName: pid, qty, cost: opts.cost ?? 10, unit: 'U', expiresAt: opts.expiresAt ?? null, isPremium: opts.isPremium ?? false }] });
  return batchIds[0];
}
async function mvtsFor(saleId) { const q = query(movementsCol(), where('linkedSaleId', '==', saleId)); return (await getDocs(q)).docs.map(d => d.data()); }

beforeAll(async () => { await nuke(); await nukeProd(); await Promise.all([seedTracked(PA), seedTracked(PB), seedUntracked(PUNT), seedOptout(POPT)]); });
afterAll(async () => { await nuke(); await nukeProd(); });

describe('[STK-S] Sale deduct deep (25 tests)', () => {
  beforeEach(nuke);

  it('S1 single tracked item deducts', async () => {
    const b = await seedBatch(PA, 100); const { deductStockForSale } = await bc();
    await deductStockForSale(`S1-${TS}`, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR });
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(90);
  });
  it('S2 untracked (no stockConfig) → skipped not-tracked', async () => {
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`S2-${TS}`, [{ productId: PUNT, productName: 'U', qty: 5 }], { branchId: BR });
    expect(r.skippedItems[0].reason).toBe('not-tracked');
  });
  it('S3 trackStock=false → skipped with trackStock-false reason', async () => {
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`S3-${TS}`, [{ productId: POPT, productName: 'O', qty: 5 }], { branchId: BR });
    expect(r.skippedItems[0].reason).toBe('trackStock-false');
  });
  it('S4 missing productId → skipped no-productId', async () => {
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`S4-${TS}`, [{ productName: 'manual', qty: 5 }], { branchId: BR });
    expect(r.skippedItems[0].reason).toBe('no-productId');
  });
  it('S5 qty 0 → skipped zero-qty', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`S5-${TS}`, [{ productId: PA, productName: 'A', qty: 0 }], { branchId: BR });
    expect(r.skippedItems[0].reason).toBe('zero-qty');
  });
  it('S6 multi-item mixed tracked + untracked', async () => {
    await seedBatch(PA, 100); const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`S6-${TS}`, [
      { productId: PA, productName: 'A', qty: 5 },
      { productId: PUNT, productName: 'U', qty: 5 },
    ], { branchId: BR });
    expect(r.allocations.length).toBe(1);
    expect(r.skippedItems.length).toBe(1);
  });
  it('S7 FEFO split 2 batches', async () => {
    const a = await seedBatch(PA, 5, { expiresAt: '2027-01-01' });
    const b = await seedBatch(PA, 10, { expiresAt: '2027-02-01' });
    const { deductStockForSale } = await bc();
    await deductStockForSale(`S7-${TS}`, [{ productId: PA, productName: 'A', qty: 8 }], { branchId: BR });
    expect((await getDoc(batchDoc(a))).data().qty.remaining).toBe(0);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(7);
  });
  it('S8 insufficient throws', async () => {
    await seedBatch(PA, 5); const { deductStockForSale } = await bc();
    await expect(deductStockForSale(`S8-${TS}`, [{ productId: PA, productName: 'A', qty: 100 }], { branchId: BR }))
      .rejects.toThrow(/shortfall|insufficient/i);
  });
  it('S9 partial-failure saga: 1st succeeds, 2nd fails → rollback 1st', async () => {
    await seedBatch(PA, 100); await seedBatch(PB, 5);
    const { deductStockForSale, listStockBatches } = await bc();
    await expect(deductStockForSale(`S9-${TS}`, [
      { productId: PA, productName: 'A', qty: 20 },
      { productId: PB, productName: 'B', qty: 100 },
    ], { branchId: BR })).rejects.toThrow();
    const bA = await listStockBatches({ productId: PA, branchId: BR });
    expect(bA.reduce((s, x) => s + x.qty.remaining, 0)).toBe(100);
  });
  it('S10 isPremium flag propagated to movement', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const sid = `S10-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3, isPremium: true }], { branchId: BR });
    const m = (await mvtsFor(sid))[0];
    expect(m.isPremium).toBe(true); expect(m.revenueImpact).toBe(0);
  });
  it('S11 non-premium: revenueImpact null', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const sid = `S11-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await mvtsFor(sid))[0].revenueImpact).toBeNull();
  });
  it('S12 costBasis = batch cost × qty', async () => {
    await seedBatch(PA, 10, { cost: 20 }); const { deductStockForSale } = await bc();
    const sid = `S12-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await mvtsFor(sid))[0].costBasis).toBe(60);
  });
  it('S13 customerId on movement', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const sid = `S13-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR, customerId: 'C-99' });
    expect((await mvtsFor(sid))[0].customerId).toBe('C-99');
  });
  it('S14 user audit on movement', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const sid = `S14-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR, user: { userId: 'u1', userName: 'U' } });
    expect((await mvtsFor(sid))[0].user.userId).toBe('u1');
  });
  it('S15 sourceDocPath points to be_sales', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const sid = `S15-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await mvtsFor(sid))[0].sourceDocPath).toContain('be_sales');
  });
  it('S16 movement type=2 (SALE)', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const sid = `S16-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await mvtsFor(sid))[0].type).toBe(2);
  });
  it('S17 movementType=5 override for vendor sale', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const sid = `S17-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR, movementType: 5 });
    expect((await mvtsFor(sid))[0].type).toBe(5);
  });
  it('S18 flat array input', async () => {
    await seedBatch(PA, 10); const { deductStockForSale } = await bc();
    const sid = `S18-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    expect((await mvtsFor(sid)).length).toBe(1);
  });
  it('S19 object form {products, medications}', async () => {
    await seedBatch(PA, 10); await seedBatch(PB, 10); const { deductStockForSale } = await bc();
    const sid = `S19-${TS}`;
    await deductStockForSale(sid, { products: [{ productId: PA, productName: 'A', qty: 3 }], medications: [{ productId: PB, productName: 'B', qty: 2 }] }, { branchId: BR });
    expect((await mvtsFor(sid)).length).toBe(2);
  });
  it('S20 empty object form → no-op', async () => {
    const { deductStockForSale } = await bc();
    const r = await deductStockForSale(`S20-${TS}`, { products: [], medications: [] }, { branchId: BR });
    expect(r.allocations.length).toBe(0);
  });
  it('S21 missing saleId throws', async () => {
    const { deductStockForSale } = await bc();
    await expect(deductStockForSale('', [])).rejects.toThrow(/saleId/i);
  });
  it('S22 preferNewest consumes newest first', async () => {
    const { createStockOrder, deductStockForSale } = await bc();
    await createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: 5, cost: 1 }] });
    await new Promise(r => setTimeout(r, 20));
    const { batchIds: [newBid] } = await createStockOrder({ branchId: BR, items: [{ productId: PA, productName: 'A', qty: 5, cost: 1 }] });
    const sid = `S22-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR, preferNewest: true });
    expect((await getDoc(batchDoc(newBid))).data().qty.remaining).toBe(2);
  });
  it('S23 skip movement has batchId=null, skipped=true', async () => {
    const { deductStockForSale } = await bc();
    const sid = `S23-${TS}`;
    await deductStockForSale(sid, [{ productId: PUNT, productName: 'U', qty: 5 }], { branchId: BR });
    const m = (await mvtsFor(sid))[0];
    expect(m.skipped).toBe(true); expect(m.batchId).toBeNull();
  });
  it('S24 consumables kind included', async () => {
    await seedBatch(PA, 20); const { deductStockForSale } = await bc();
    const sid = `S24-${TS}`;
    await deductStockForSale(sid, { consumables: [{ productId: PA, productName: 'A', qty: 5 }] }, { branchId: BR });
    expect((await mvtsFor(sid))[0].qty).toBe(-5);
  });
  it('S25 treatmentItems kind included', async () => {
    await seedBatch(PA, 20); const { deductStockForSale } = await bc();
    const sid = `S25-${TS}`;
    await deductStockForSale(sid, { treatmentItems: [{ productId: PA, productName: 'A', qty: 5 }] }, { branchId: BR });
    expect((await mvtsFor(sid))[0].qty).toBe(-5);
  });
});

describe('[STK-SR] Sale reverse deep (15 tests)', () => {
  beforeEach(nuke);

  it('SR1 full reverse restores batch exactly', async () => {
    const b = await seedBatch(PA, 100); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR1-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 30 }], { branchId: BR });
    await reverseStockForSale(sid);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(100);
  });
  it('SR2 idempotent — 2nd call no-op', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR2-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    await reverseStockForSale(sid);
    const r2 = await reverseStockForSale(sid);
    expect(r2.reversedCount).toBe(0);
  });
  it('SR3 reverse on nonexistent saleId → 0', async () => {
    const { reverseStockForSale } = await bc();
    const r = await reverseStockForSale(`SR3-404-${TS}`);
    expect(r.reversedCount).toBe(0);
  });
  it('SR4 missing saleId throws', async () => {
    const { reverseStockForSale } = await bc();
    await expect(reverseStockForSale('')).rejects.toThrow(/saleId/i);
  });
  it('SR5 reverse emits new movement with reverseOf', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR5-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    await reverseStockForSale(sid);
    const q = query(movementsCol(), where('linkedSaleId', '==', sid));
    const ms = (await getDocs(q)).docs.map(d => d.data());
    const orig = ms.find(m => !m.reverseOf);
    const rev = ms.find(m => m.reverseOf);
    expect(orig.reversedByMovementId).toBe(rev.movementId);
    expect(rev.reverseOf).toBe(orig.movementId);
  });
  it('SR6 depleted batch → active after reverse', async () => {
    const b = await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR6-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 10 }], { branchId: BR });
    expect((await getDoc(batchDoc(b))).data().status).toBe('depleted');
    await reverseStockForSale(sid);
    expect((await getDoc(batchDoc(b))).data().status).toBe('active');
  });
  it('SR7 per-sale isolation (other sale untouched)', async () => {
    const b = await seedBatch(PA, 100); const { deductStockForSale, reverseStockForSale } = await bc();
    const sX = `SR7-X-${TS}`, sY = `SR7-Y-${TS}`;
    await deductStockForSale(sX, [{ productId: PA, productName: 'A', qty: 20 }], { branchId: BR });
    await deductStockForSale(sY, [{ productId: PA, productName: 'A', qty: 15 }], { branchId: BR });
    await reverseStockForSale(sX);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(85); // 100 - 15 sY
  });
  it('SR8 reverse trackStock-false skipped movement (audit flip)', async () => {
    const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR8-${TS}`;
    await deductStockForSale(sid, [{ productId: POPT, productName: 'O', qty: 2 }], { branchId: BR });
    const r = await reverseStockForSale(sid);
    expect(r.skippedCount).toBe(1);
  });
  it('SR9 costBasis preserved on reverse', async () => {
    await seedBatch(PA, 10, { cost: 30 }); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR9-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 2 }], { branchId: BR });
    await reverseStockForSale(sid);
    const q = query(movementsCol(), where('linkedSaleId', '==', sid));
    const ms = (await getDocs(q)).docs.map(d => d.data());
    const orig = ms.find(m => !m.reverseOf);
    const rev = ms.find(m => m.reverseOf);
    expect(rev.costBasis).toBe(orig.costBasis);
  });
  it('SR10 reverse of 3-batch split restores all', async () => {
    const a = await seedBatch(PA, 3, { expiresAt: '2027-01-01' });
    const b = await seedBatch(PA, 3, { expiresAt: '2027-02-01' });
    const c = await seedBatch(PA, 3, { expiresAt: '2027-03-01' });
    const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR10-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 8 }], { branchId: BR });
    await reverseStockForSale(sid);
    expect((await getDoc(batchDoc(a))).data().qty.remaining).toBe(3);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(3);
    expect((await getDoc(batchDoc(c))).data().qty.remaining).toBe(3);
  });
  it('SR11 listStockMovements includeReversed=false hides pair', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale, listStockMovements } = await bc();
    const sid = `SR11-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 1 }], { branchId: BR });
    await reverseStockForSale(sid);
    expect((await listStockMovements({ linkedSaleId: sid })).length).toBe(0);
    expect((await listStockMovements({ linkedSaleId: sid, includeReversed: true })).length).toBe(2);
  });
  it('SR12 reverse preserves original createdAt', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR12-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 2 }], { branchId: BR });
    const q = query(movementsCol(), where('linkedSaleId', '==', sid));
    const origBefore = (await getDocs(q)).docs[0].data().createdAt;
    await reverseStockForSale(sid);
    const ms = (await getDocs(q)).docs.map(d => d.data());
    const orig = ms.find(m => !m.reverseOf);
    expect(orig.createdAt).toBe(origBefore);
  });
  it('SR13 multi-item sale reversed atomically', async () => {
    const a = await seedBatch(PA, 10); const b = await seedBatch(PB, 10);
    const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR13-${TS}`;
    await deductStockForSale(sid, [
      { productId: PA, productName: 'A', qty: 3 },
      { productId: PB, productName: 'B', qty: 4 },
    ], { branchId: BR });
    await reverseStockForSale(sid);
    expect((await getDoc(batchDoc(a))).data().qty.remaining).toBe(10);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(10);
  });
  it('SR14 reverse respects batchId per movement (FIFO unwinds correctly)', async () => {
    const a = await seedBatch(PA, 5, { expiresAt: '2027-01-01' });
    const b = await seedBatch(PA, 10, { expiresAt: '2027-02-01' });
    const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR14-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 8 }], { branchId: BR });
    await reverseStockForSale(sid);
    expect((await getDoc(batchDoc(a))).data().qty.remaining).toBe(5);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(10);
  });
  it('SR15 reverse → depleted batch status now active', async () => {
    const b = await seedBatch(PA, 5); const { deductStockForSale, reverseStockForSale } = await bc();
    const sid = `SR15-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    await reverseStockForSale(sid);
    expect((await getDoc(batchDoc(b))).data().status).toBe('active');
  });
});

describe('[STK-SA] Sale analyze deep (10 tests)', () => {
  beforeEach(nuke);

  it('SA1 analyze happy path', async () => {
    await seedBatch(PA, 20); const { deductStockForSale, analyzeStockImpact } = await bc();
    const sid = `SA1-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 7 }], { branchId: BR });
    const a = await analyzeStockImpact({ saleId: sid });
    expect(a.movements.length).toBe(1);
    expect(a.totalQtyToRestore).toBe(7);
    expect(a.canReverseFully).toBe(true);
  });
  it('SA2 analyze on empty sale returns zero', async () => {
    const { analyzeStockImpact } = await bc();
    const a = await analyzeStockImpact({ saleId: `SA2-${TS}` });
    expect(a.totalQtyToRestore).toBe(0);
    expect(a.canReverseFully).toBe(true);
  });
  it('SA3 analyze throws without id', async () => {
    const { analyzeStockImpact } = await bc();
    await expect(analyzeStockImpact({})).rejects.toThrow(/required/i);
  });
  it('SA4 canReverseFully=false when batch deleted externally', async () => {
    const b = await seedBatch(PA, 10); const { deductStockForSale, analyzeStockImpact } = await bc();
    const sid = `SA4-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    await deleteDoc(batchDoc(b));
    const a = await analyzeStockImpact({ saleId: sid });
    expect(a.canReverseFully).toBe(false);
    expect(a.warnings.length).toBeGreaterThan(0);
  });
  it('SA5 warns on skipped trackStock=false', async () => {
    const { deductStockForSale, analyzeStockImpact } = await bc();
    const sid = `SA5-${TS}`;
    await deductStockForSale(sid, [{ productId: POPT, productName: 'O', qty: 2 }], { branchId: BR });
    const a = await analyzeStockImpact({ saleId: sid });
    expect(a.warnings.some(w => w.includes('trackStock'))).toBe(true);
  });
  it('SA6 warns on cancelled batch', async () => {
    const b = await seedBatch(PA, 20); const { deductStockForSale, analyzeStockImpact } = await bc();
    const sid = `SA6-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 5 }], { branchId: BR });
    await setDoc(batchDoc(b), { status: 'cancelled' }, { merge: true });
    const a = await analyzeStockImpact({ saleId: sid });
    expect(a.warnings.some(w => w.includes('cancelled'))).toBe(true);
  });
  it('SA7 batchesAffected count matches', async () => {
    await seedBatch(PA, 5, { expiresAt: '2027-01-01' });
    await seedBatch(PA, 10, { expiresAt: '2027-02-01' });
    const { deductStockForSale, analyzeStockImpact } = await bc();
    const sid = `SA7-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 12 }], { branchId: BR });
    const a = await analyzeStockImpact({ saleId: sid });
    expect(a.batchesAffected.length).toBe(2);
  });
  it('SA8 willRestore sums correctly', async () => {
    await seedBatch(PA, 5, { expiresAt: '2027-01-01' });
    await seedBatch(PA, 10, { expiresAt: '2027-02-01' });
    const { deductStockForSale, analyzeStockImpact } = await bc();
    const sid = `SA8-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 12 }], { branchId: BR });
    const a = await analyzeStockImpact({ saleId: sid });
    expect(a.batchesAffected.reduce((s, b) => s + b.willRestore, 0)).toBe(12);
  });
  it('SA9 excludes already-reversed movements', async () => {
    await seedBatch(PA, 10); const { deductStockForSale, reverseStockForSale, analyzeStockImpact } = await bc();
    const sid = `SA9-${TS}`;
    await deductStockForSale(sid, [{ productId: PA, productName: 'A', qty: 3 }], { branchId: BR });
    await reverseStockForSale(sid);
    const a = await analyzeStockImpact({ saleId: sid });
    expect(a.movements.length).toBe(0);
  });
  it('SA10 with treatmentId works symmetrically', async () => {
    await seedBatch(PA, 10); const { deductStockForTreatment, analyzeStockImpact } = await bc();
    const tid = `SA10-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PA, productName: 'A', qty: 3 }] }, { branchId: BR });
    const a = await analyzeStockImpact({ treatmentId: tid });
    expect(a.totalQtyToRestore).toBe(3);
  });
});
