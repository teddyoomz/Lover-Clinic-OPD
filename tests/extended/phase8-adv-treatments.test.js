// Phase 8 adversarial: Treatment integration deep (~40 tests)
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

const BR = `ADVT-BR-${TS}`;
const PMED = `ADVT-MED-${TS}`;
const PCON = `ADVT-CON-${TS}`;
const PITEM = `ADVT-ITEM-${TS}`;
const PROD = `ADVT-PRD-${TS}`;
const PUNT = `ADVT-UNT-${TS}`;

async function nuke() {
  for (const col of [batchesCol(), ordersCol(), movementsCol()]) {
    const s = await getDocs(query(col, where('branchId', '==', BR)));
    await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
  }
}
async function nukeProd() { for (const p of [PMED, PCON, PITEM, PROD, PUNT]) { try { await deleteDoc(productDoc(p)); } catch {} } }
async function seedTracked(pid) { await setDoc(productDoc(pid), { id: pid, name: pid, stockConfig: { trackStock: true, unit: 'U' } }); }
async function seedBatch(pid, qty, opts = {}) {
  const { createStockOrder } = await bc();
  const { batchIds } = await createStockOrder({ branchId: BR, items: [{ productId: pid, productName: pid, qty, cost: opts.cost ?? 10, unit: 'U' }] });
  return batchIds[0];
}
async function mvtsForT(tid) { const q = query(movementsCol(), where('linkedTreatmentId', '==', tid)); return (await getDocs(q)).docs.map(d => d.data()); }
async function mvtsForS(sid) { const q = query(movementsCol(), where('linkedSaleId', '==', sid)); return (await getDocs(q)).docs.map(d => d.data()); }

beforeAll(async () => { await nuke(); await nukeProd(); await Promise.all([seedTracked(PMED), seedTracked(PCON), seedTracked(PITEM), seedTracked(PROD)]); await setDoc(productDoc(PUNT), { id: PUNT, name: PUNT }); });
afterAll(async () => { await nuke(); await nukeProd(); });

describe('[STK-T] Treatment deduct deep (20 tests)', () => {
  beforeEach(nuke);

  it('T1 consumables deducts, movementType=6', async () => {
    await seedBatch(PCON, 50); const { deductStockForTreatment } = await bc();
    const tid = `T1-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 5 }] }, { branchId: BR });
    expect((await mvtsForT(tid))[0].type).toBe(6);
  });
  it('T2 movementType=7 override', async () => {
    await seedBatch(PMED, 50); const { deductStockForTreatment } = await bc();
    const tid = `T2-${TS}`;
    await deductStockForTreatment(tid, { medications: [{ productId: PMED, productName: 'M', qty: 2 }] }, { branchId: BR, movementType: 7 });
    expect((await mvtsForT(tid))[0].type).toBe(7);
  });
  it('T3 all 3 scopes normalized', async () => {
    await seedBatch(PMED, 100); await seedBatch(PCON, 100); await seedBatch(PITEM, 100);
    const { deductStockForTreatment } = await bc();
    const tid = `T3-${TS}`;
    await deductStockForTreatment(tid, {
      medications: [{ productId: PMED, productName: 'M', qty: 2 }],
      consumables: [{ productId: PCON, productName: 'C', qty: 3 }],
      treatmentItems: [{ productId: PITEM, productName: 'I', qty: 4 }],
    }, { branchId: BR });
    const ms = await mvtsForT(tid);
    expect(ms.length).toBe(3);
    expect(ms.reduce((s, m) => s + m.qty, 0)).toBe(-9);
  });
  it('T4 hasSale=true split: treatment skips meds (sale does it)', async () => {
    const med = await seedBatch(PMED, 100); const con = await seedBatch(PCON, 100);
    const { deductStockForTreatment, deductStockForSale } = await bc();
    const tid = `T4-t-${TS}`, sid = `T4-s-${TS}`;
    const hasSale = true;
    await deductStockForTreatment(tid, {
      consumables: [{ productId: PCON, productName: 'C', qty: 3 }],
      ...(hasSale ? {} : { medications: [{ productId: PMED, productName: 'M', qty: 2 }] }),
    }, { branchId: BR });
    await deductStockForSale(sid, { medications: [{ productId: PMED, productName: 'M', qty: 2 }] }, { branchId: BR });
    expect((await getDoc(batchDoc(med))).data().qty.remaining).toBe(98); // ONLY sale
    expect((await getDoc(batchDoc(con))).data().qty.remaining).toBe(97);
  });
  it('T5 hasSale=false: treatment deducts meds', async () => {
    const med = await seedBatch(PMED, 100); const { deductStockForTreatment } = await bc();
    const tid = `T5-${TS}`;
    await deductStockForTreatment(tid, {
      medications: [{ productId: PMED, productName: 'M', qty: 4 }],
    }, { branchId: BR });
    expect((await getDoc(batchDoc(med))).data().qty.remaining).toBe(96);
  });
  it('T6 purchasedItems never in treatment hook (no double-deduct)', async () => {
    const prod = await seedBatch(PROD, 100); const { deductStockForTreatment, deductStockForSale } = await bc();
    const tid = `T6-t-${TS}`, sid = `T6-s-${TS}`;
    // Simulate real flow: treatment passes only consumables; sale passes products (purchasedItems flattened)
    await deductStockForTreatment(tid, { consumables: [] }, { branchId: BR });
    await deductStockForSale(sid, { products: [{ productId: PROD, productName: 'P', qty: 8 }] }, { branchId: BR });
    expect((await getDoc(batchDoc(prod))).data().qty.remaining).toBe(92);
  });
  it('T7 reverse treatment restores only treatment-linked', async () => {
    const con = await seedBatch(PCON, 100); const prod = await seedBatch(PROD, 100);
    const { deductStockForTreatment, deductStockForSale, reverseStockForTreatment } = await bc();
    const tid = `T7-t-${TS}`, sid = `T7-s-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 10 }] }, { branchId: BR });
    await deductStockForSale(sid, { products: [{ productId: PROD, productName: 'P', qty: 5 }] }, { branchId: BR });
    await reverseStockForTreatment(tid);
    expect((await getDoc(batchDoc(con))).data().qty.remaining).toBe(100);
    expect((await getDoc(batchDoc(prod))).data().qty.remaining).toBe(95);
  });
  it('T8 reverse idempotent', async () => {
    await seedBatch(PCON, 10); const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    const tid = `T8-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 3 }] }, { branchId: BR });
    await reverseStockForTreatment(tid);
    const r2 = await reverseStockForTreatment(tid);
    expect(r2.reversedCount).toBe(0);
  });
  it('T9 reverse on nonexistent safe', async () => {
    const { reverseStockForTreatment } = await bc();
    const r = await reverseStockForTreatment(`T9-404-${TS}`);
    expect(r.reversedCount).toBe(0);
  });
  it('T10 missing treatmentId throws', async () => {
    const { deductStockForTreatment } = await bc();
    await expect(deductStockForTreatment('', {})).rejects.toThrow(/treatmentId/i);
  });
  it('T11 reverse-missing-treatmentId throws', async () => {
    const { reverseStockForTreatment } = await bc();
    await expect(reverseStockForTreatment('')).rejects.toThrow(/treatmentId/i);
  });
  it('T12 untracked product in consumables → skipped', async () => {
    const { deductStockForTreatment } = await bc();
    const tid = `T12-${TS}`;
    const r = await deductStockForTreatment(tid, { consumables: [{ productId: PUNT, productName: 'U', qty: 2 }] }, { branchId: BR });
    expect(r.skippedItems[0].reason).toBe('not-tracked');
  });
  it('T13 sourceDocPath → be_treatments', async () => {
    await seedBatch(PCON, 10); const { deductStockForTreatment } = await bc();
    const tid = `T13-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 1 }] }, { branchId: BR });
    expect((await mvtsForT(tid))[0].sourceDocPath).toContain('be_treatments');
  });
  it('T14 user audit populated', async () => {
    await seedBatch(PCON, 10); const { deductStockForTreatment } = await bc();
    const tid = `T14-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 1 }] }, { branchId: BR, user: { userId: 'u1', userName: 'U' } });
    expect((await mvtsForT(tid))[0].user.userId).toBe('u1');
  });
  it('T15 customerId on movement', async () => {
    await seedBatch(PCON, 10); const { deductStockForTreatment } = await bc();
    const tid = `T15-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 1 }] }, { branchId: BR, customerId: 'CUST-7' });
    expect((await mvtsForT(tid))[0].customerId).toBe('CUST-7');
  });
  it('T16 decimal treatment qty 0.5', async () => {
    await seedBatch(PCON, 10); const { deductStockForTreatment } = await bc();
    const tid = `T16-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 0.5 }] }, { branchId: BR });
    expect((await mvtsForT(tid))[0].qty).toBe(-0.5);
  });
  it('T17 treatment partial-failure rolls back', async () => {
    await seedBatch(PCON, 5); // only 5
    const { deductStockForTreatment, listStockBatches } = await bc();
    const tid = `T17-${TS}`;
    await expect(deductStockForTreatment(tid, {
      consumables: [{ productId: PCON, productName: 'C', qty: 5 }, { productId: PITEM, productName: 'I', qty: 10 }],
    }, { branchId: BR })).rejects.toThrow();
    const b = await listStockBatches({ productId: PCON, branchId: BR });
    expect(b[0].qty.remaining).toBe(5); // unchanged
  });
  it('T18 treatmentId used in movement linkedTreatmentId', async () => {
    await seedBatch(PCON, 10); const { deductStockForTreatment } = await bc();
    const tid = `T18-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 1 }] }, { branchId: BR });
    expect((await mvtsForT(tid))[0].linkedTreatmentId).toBe(tid);
  });
  it('T19 treatment with empty scope → no-op', async () => {
    const { deductStockForTreatment } = await bc();
    const tid = `T19-${TS}`;
    const r = await deductStockForTreatment(tid, { consumables: [], treatmentItems: [] }, { branchId: BR });
    expect(r.allocations.length).toBe(0);
  });
  it('T20 reverse restores depleted batch to active', async () => {
    const b = await seedBatch(PCON, 5); const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    const tid = `T20-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 5 }] }, { branchId: BR });
    expect((await getDoc(batchDoc(b))).data().status).toBe('depleted');
    await reverseStockForTreatment(tid);
    expect((await getDoc(batchDoc(b))).data().status).toBe('active');
  });
});

describe('[STK-TE] Treatment cross-subsystem (15 tests)', () => {
  beforeEach(nuke);

  it('TE1 treatment+sale share batch, reverse sale restores only its share', async () => {
    const b = await seedBatch(PMED, 100); const { deductStockForTreatment, deductStockForSale, reverseStockForSale } = await bc();
    const tid = `TE1-t-${TS}`, sid = `TE1-s-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PMED, productName: 'M', qty: 10 }] }, { branchId: BR });
    await deductStockForSale(sid, { medications: [{ productId: PMED, productName: 'M', qty: 5 }] }, { branchId: BR });
    await reverseStockForSale(sid);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(90);
  });
  it('TE2 full delete cascade: both reverse functions called → full restore', async () => {
    const b = await seedBatch(PMED, 100); const { deductStockForTreatment, deductStockForSale, reverseStockForTreatment, reverseStockForSale } = await bc();
    const tid = `TE2-t-${TS}`, sid = `TE2-s-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PMED, productName: 'M', qty: 5 }] }, { branchId: BR });
    await deductStockForSale(sid, { medications: [{ productId: PMED, productName: 'M', qty: 10 }] }, { branchId: BR });
    await reverseStockForSale(sid);
    await reverseStockForTreatment(tid);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(100);
  });
  it('TE3 treatment edit roundtrip (reverse+deduct equals new state)', async () => {
    const b = await seedBatch(PCON, 100); const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    const tid = `TE3-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 20 }] }, { branchId: BR });
    await reverseStockForTreatment(tid);
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 5 }] }, { branchId: BR });
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(95);
  });
  it('TE4 treatment edit remove item → fully restored', async () => {
    const con = await seedBatch(PCON, 100); const item = await seedBatch(PITEM, 100);
    const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    const tid = `TE4-${TS}`;
    await deductStockForTreatment(tid, {
      consumables: [{ productId: PCON, productName: 'C', qty: 5 }],
      treatmentItems: [{ productId: PITEM, productName: 'I', qty: 10 }],
    }, { branchId: BR });
    await reverseStockForTreatment(tid);
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 5 }], treatmentItems: [] }, { branchId: BR });
    expect((await getDoc(batchDoc(con))).data().qty.remaining).toBe(95);
    expect((await getDoc(batchDoc(item))).data().qty.remaining).toBe(100);
  });
  it('TE5 sale + treatment different products, no interference', async () => {
    const med = await seedBatch(PMED, 10); const prod = await seedBatch(PROD, 10);
    const { deductStockForTreatment, deductStockForSale } = await bc();
    await deductStockForTreatment(`TE5-t-${TS}`, { consumables: [{ productId: PMED, productName: 'M', qty: 3 }] }, { branchId: BR });
    await deductStockForSale(`TE5-s-${TS}`, { products: [{ productId: PROD, productName: 'P', qty: 4 }] }, { branchId: BR });
    expect((await getDoc(batchDoc(med))).data().qty.remaining).toBe(7);
    expect((await getDoc(batchDoc(prod))).data().qty.remaining).toBe(6);
  });
  it('TE6 hasSale=true auto-sale creates own stock movements (linked)', async () => {
    await seedBatch(PROD, 100); const { deductStockForTreatment, deductStockForSale } = await bc();
    const tid = `TE6-t-${TS}`, sid = `TE6-s-${TS}`;
    await deductStockForTreatment(tid, { consumables: [] }, { branchId: BR });
    await deductStockForSale(sid, { products: [{ productId: PROD, productName: 'P', qty: 3 }] }, { branchId: BR });
    expect((await mvtsForS(sid)).length).toBe(1);
    expect((await mvtsForT(tid)).length).toBe(0);
  });
  it('TE7 treatment delete reverses ONLY treatment movements', async () => {
    const prod = await seedBatch(PROD, 100); const con = await seedBatch(PCON, 100);
    const { deductStockForTreatment, deductStockForSale, reverseStockForTreatment } = await bc();
    const tid = `TE7-t-${TS}`, sid = `TE7-s-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 5 }] }, { branchId: BR });
    await deductStockForSale(sid, { products: [{ productId: PROD, productName: 'P', qty: 10 }] }, { branchId: BR });
    await reverseStockForTreatment(tid);
    expect((await getDoc(batchDoc(con))).data().qty.remaining).toBe(100);
    expect((await getDoc(batchDoc(prod))).data().qty.remaining).toBe(90);
  });
  it('TE8 consumables deduct respects FIFO expiry', async () => {
    await seedBatch(PCON, 5, { expiresAt: '2027-01-01' });
    await seedBatch(PCON, 10, { expiresAt: '2027-02-01' });
    const { deductStockForTreatment } = await bc();
    const tid = `TE8-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 8 }] }, { branchId: BR });
    const ms = await mvtsForT(tid);
    expect(ms.length).toBe(2);
  });
  it('TE9 multiple consumables each allocate', async () => {
    await seedBatch(PCON, 10); await seedBatch(PITEM, 10); const { deductStockForTreatment } = await bc();
    const tid = `TE9-${TS}`;
    await deductStockForTreatment(tid, {
      consumables: [{ productId: PCON, productName: 'C', qty: 3 }, { productId: PITEM, productName: 'I', qty: 4 }],
    }, { branchId: BR });
    expect((await mvtsForT(tid)).length).toBe(2);
  });
  it('TE10 treatment + sale same batch, cancel sale → correct share', async () => {
    const b = await seedBatch(PMED, 100); const { deductStockForTreatment, deductStockForSale, reverseStockForSale } = await bc();
    const tid = `TE10-t-${TS}`, sid = `TE10-s-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PMED, productName: 'M', qty: 20 }] }, { branchId: BR });
    await deductStockForSale(sid, { medications: [{ productId: PMED, productName: 'M', qty: 30 }] }, { branchId: BR });
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(50);
    await reverseStockForSale(sid);
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(80);
  });
  it('TE11 treatment edit saga: reverse old + deduct new → net equals new', async () => {
    const b = await seedBatch(PCON, 100); const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    const tid = `TE11-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 10 }] }, { branchId: BR });
    // Edit scenario: change qty to 15
    await reverseStockForTreatment(tid);
    await deductStockForTreatment(tid, { consumables: [{ productId: PCON, productName: 'C', qty: 15 }] }, { branchId: BR });
    expect((await getDoc(batchDoc(b))).data().qty.remaining).toBe(85);
  });
  it('TE12 purchased items flattened to sale side only', async () => {
    const prod = await seedBatch(PROD, 50); const { deductStockForTreatment, deductStockForSale } = await bc();
    const tid = `TE12-t-${TS}`, sid = `TE12-s-${TS}`;
    await deductStockForTreatment(tid, { consumables: [] }, { branchId: BR });
    await deductStockForSale(sid, { products: [{ productId: PROD, productName: 'P', qty: 6 }] }, { branchId: BR });
    expect((await getDoc(batchDoc(prod))).data().qty.remaining).toBe(44);
    expect((await mvtsForT(tid)).length).toBe(0);
  });
  it('TE13 medications + consumables + treatmentItems order irrelevant', async () => {
    await seedBatch(PMED, 50); await seedBatch(PCON, 50); await seedBatch(PITEM, 50);
    const { deductStockForTreatment } = await bc();
    const tid = `TE13-${TS}`;
    await deductStockForTreatment(tid, {
      treatmentItems: [{ productId: PITEM, productName: 'I', qty: 2 }],
      medications: [{ productId: PMED, productName: 'M', qty: 3 }],
      consumables: [{ productId: PCON, productName: 'C', qty: 4 }],
    }, { branchId: BR });
    const ms = await mvtsForT(tid);
    expect(ms.length).toBe(3);
  });
  it('TE14 edit changes movementType → new movement with new type (if override)', async () => {
    await seedBatch(PMED, 100); const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    const tid = `TE14-${TS}`;
    await deductStockForTreatment(tid, { consumables: [{ productId: PMED, productName: 'M', qty: 2 }] }, { branchId: BR });
    await reverseStockForTreatment(tid);
    await deductStockForTreatment(tid, { consumables: [{ productId: PMED, productName: 'M', qty: 2 }] }, { branchId: BR, movementType: 7 });
    const ms = await mvtsForT(tid);
    const fresh = ms.find(m => !m.reversedByMovementId && !m.reverseOf);
    expect(fresh.type).toBe(7);
  });
  it('TE15 flat array for treatment', async () => {
    await seedBatch(PMED, 10); const { deductStockForTreatment } = await bc();
    const tid = `TE15-${TS}`;
    await deductStockForTreatment(tid, [{ productId: PMED, productName: 'M', qty: 3 }], { branchId: BR });
    expect((await mvtsForT(tid))[0].qty).toBe(-3);
  });
});
