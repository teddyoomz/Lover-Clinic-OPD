// ═══════════════════════════════════════════════════════════════════════════
// Phase 8c — Treatment hook adversarial tests
// Focus on the medications split between treatment-side and auto-sale side,
// the purchasedItems exclusion, and the full edit/delete lifecycle.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, query, where,
} from 'firebase/firestore';

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

const batchDoc = (id) => doc(db, ...P, 'be_stock_batches', id);
const batchesCol = () => collection(db, ...P, 'be_stock_batches');
const movementsCol = () => collection(db, ...P, 'be_stock_movements');
const ordersCol = () => collection(db, ...P, 'be_stock_orders');
const adjustmentsCol = () => collection(db, ...P, 'be_stock_adjustments');
const productDoc = (pid) => doc(db, ...P, 'master_data', 'products', 'items', pid);

const PID_MED = `STK-TRT-MED-${TS}`;
const PID_CON = `STK-TRT-CON-${TS}`;
const PID_ITEM = `STK-TRT-ITEM-${TS}`;
const PID_PROD = `STK-TRT-PROD-${TS}`;
const BRANCH = `STK-TRT-BR-${TS}`;

async function nukeByField(col, field, value) {
  const q = query(col, where(field, '==', value));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}
async function nukeAll() {
  await nukeByField(batchesCol(), 'branchId', BRANCH);
  await nukeByField(movementsCol(), 'branchId', BRANCH);
  await nukeByField(ordersCol(), 'branchId', BRANCH);
  await nukeByField(adjustmentsCol(), 'branchId', BRANCH);
  for (const pid of [PID_MED, PID_CON, PID_ITEM, PID_PROD]) {
    try { await deleteDoc(productDoc(pid)); } catch {}
  }
}
async function seedProduct(pid) {
  await setDoc(productDoc(pid), {
    id: pid, name: pid,
    stockConfig: { trackStock: true, unit: 'U', isControlled: false },
  });
}
async function seedBatch(pid, qty) {
  const { createStockOrder } = await bc();
  const { batchIds } = await createStockOrder({
    branchId: BRANCH,
    items: [{ productId: pid, productName: pid, qty, cost: 10, unit: 'U' }],
  });
  return batchIds[0];
}

beforeAll(async () => {
  await nukeAll();
  await Promise.all([seedProduct(PID_MED), seedProduct(PID_CON), seedProduct(PID_ITEM), seedProduct(PID_PROD)]);
});
afterAll(nukeAll);
beforeEach(async () => {
  await nukeByField(batchesCol(), 'branchId', BRANCH);
  await nukeByField(movementsCol(), 'branchId', BRANCH);
  await nukeByField(ordersCol(), 'branchId', BRANCH);
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-T-HOOK] Treatment hook scenarios simulating TreatmentFormPage flows
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-T-HOOK] hasSale split — medications exclusion', () => {
  it('hasSale=false → treatment hook deducts medications+consumables+treatmentItems (all 3)', async () => {
    const { deductStockForTreatment } = await bc();
    const bMed = await seedBatch(PID_MED, 100);
    const bCon = await seedBatch(PID_CON, 100);
    const bItem = await seedBatch(PID_ITEM, 100);
    const treatmentId = `TRT-NOSALE-${TS}`;

    const hasSale = false;
    const detail = {
      medications: [{ productId: PID_MED, productName: PID_MED, qty: 5 }],
      consumables: [{ productId: PID_CON, productName: PID_CON, qty: 3 }],
      treatmentItems: [{ productId: PID_ITEM, productName: PID_ITEM, qty: 2 }],
    };

    await deductStockForTreatment(treatmentId, {
      consumables: detail.consumables,
      treatmentItems: detail.treatmentItems,
      ...(hasSale ? {} : { medications: detail.medications }),
    }, { branchId: BRANCH });

    const med = (await getDoc(batchDoc(bMed))).data();
    const con = (await getDoc(batchDoc(bCon))).data();
    const item = (await getDoc(batchDoc(bItem))).data();
    expect(med.qty.remaining).toBe(95);
    expect(con.qty.remaining).toBe(97);
    expect(item.qty.remaining).toBe(98);
  });

  it('hasSale=true → treatment hook SKIPS medications (sale will deduct them), still deducts consumables+treatmentItems', async () => {
    const { deductStockForTreatment, deductStockForSale } = await bc();
    const bMed = await seedBatch(PID_MED, 100);
    const bCon = await seedBatch(PID_CON, 100);
    const treatmentId = `TRT-HASSALE-${TS}`;
    const saleId = `TRT-HASSALE-SALE-${TS}`;

    const hasSale = true;
    const detail = {
      medications: [{ productId: PID_MED, productName: PID_MED, qty: 10 }],
      consumables: [{ productId: PID_CON, productName: PID_CON, qty: 5 }],
    };

    // Treatment hook (simulates TreatmentFormPage :1561+)
    await deductStockForTreatment(treatmentId, {
      consumables: detail.consumables,
      ...(hasSale ? {} : { medications: detail.medications }),
    }, { branchId: BRANCH });

    // Auto-sale hook (simulates TreatmentFormPage :1603+)
    await deductStockForSale(saleId, {
      medications: detail.medications,
      products: [],
    }, { branchId: BRANCH });

    const med = (await getDoc(batchDoc(bMed))).data();
    const con = (await getDoc(batchDoc(bCon))).data();
    // Medications deducted ONCE (by sale), NOT twice
    expect(med.qty.remaining).toBe(90);
    expect(con.qty.remaining).toBe(95);

    // Verify linkedSaleId vs linkedTreatmentId movements are separate
    const mq = query(movementsCol(), where('branchId', '==', BRANCH));
    const ms = (await getDocs(mq)).docs.map(d => d.data()).filter(m => m.type !== 1); // exclude IMPORTs
    const saleMvts = ms.filter(m => m.linkedSaleId === saleId);
    const trtMvts = ms.filter(m => m.linkedTreatmentId === treatmentId);
    expect(saleMvts.length).toBe(1); // only medications
    expect(trtMvts.length).toBe(1); // only consumables
  });
});

describe('[STK-T-HOOK] purchasedItems exclusion', () => {
  it('treatment hook does NOT deduct purchasedItems (they go to the auto-sale only)', async () => {
    const { deductStockForTreatment, deductStockForSale } = await bc();
    const bProd = await seedBatch(PID_PROD, 100);
    const bCon = await seedBatch(PID_CON, 100);
    const treatmentId = `TRT-EXCLUDE-${TS}`;
    const saleId = `TRT-EXCLUDE-SALE-${TS}`;

    const purchasedItems = [{ productId: PID_PROD, productName: PID_PROD, qty: 8, itemType: 'product' }];
    const detail = {
      consumables: [{ productId: PID_CON, productName: PID_CON, qty: 2 }],
    };

    // Correct: treatment hook passes ONLY treatment-side items, NOT purchasedItems
    await deductStockForTreatment(treatmentId, {
      consumables: detail.consumables,
      // NO purchasedItems here — verifying the hook contract
    }, { branchId: BRANCH });

    // Auto-sale hook handles purchasedItems (mapped into grouped.products in real flow)
    await deductStockForSale(saleId, {
      products: purchasedItems,
    }, { branchId: BRANCH });

    const prod = (await getDoc(batchDoc(bProd))).data();
    const con = (await getDoc(batchDoc(bCon))).data();
    // Purchased product deducted ONCE (by sale), NOT twice
    expect(prod.qty.remaining).toBe(92);
    expect(con.qty.remaining).toBe(98);
  });
});

describe('[STK-T-HOOK] edit saga roundtrip', () => {
  it('reverse old + deduct new = net mutation matches new detail only', async () => {
    const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    const bCon = await seedBatch(PID_CON, 100);
    const treatmentId = `TRT-EDIT-${TS}`;

    // Create: deduct 20 consumables
    await deductStockForTreatment(treatmentId, {
      consumables: [{ productId: PID_CON, productName: PID_CON, qty: 20 }],
    }, { branchId: BRANCH });
    let b = (await getDoc(batchDoc(bCon))).data();
    expect(b.qty.remaining).toBe(80);

    // Edit: user changed qty to 5. Saga = reverse old, deduct new.
    await reverseStockForTreatment(treatmentId);
    b = (await getDoc(batchDoc(bCon))).data();
    expect(b.qty.remaining).toBe(100);  // fully restored

    await deductStockForTreatment(treatmentId, {
      consumables: [{ productId: PID_CON, productName: PID_CON, qty: 5 }],
    }, { branchId: BRANCH });
    b = (await getDoc(batchDoc(bCon))).data();
    expect(b.qty.remaining).toBe(95);  // only new qty deducted
  });

  it('edit that removes an item entirely → after roundtrip that item is fully restored', async () => {
    const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    const bCon = await seedBatch(PID_CON, 100);
    const bItem = await seedBatch(PID_ITEM, 100);
    const treatmentId = `TRT-EDIT-RM-${TS}`;

    await deductStockForTreatment(treatmentId, {
      consumables: [{ productId: PID_CON, productName: PID_CON, qty: 10 }],
      treatmentItems: [{ productId: PID_ITEM, productName: PID_ITEM, qty: 15 }],
    }, { branchId: BRANCH });
    await reverseStockForTreatment(treatmentId);
    // Edit: user removed the treatmentItem entirely, kept consumable
    await deductStockForTreatment(treatmentId, {
      consumables: [{ productId: PID_CON, productName: PID_CON, qty: 10 }],
      treatmentItems: [],
    }, { branchId: BRANCH });

    const con = (await getDoc(batchDoc(bCon))).data();
    const item = (await getDoc(batchDoc(bItem))).data();
    expect(con.qty.remaining).toBe(90);  // deducted once
    expect(item.qty.remaining).toBe(100); // fully restored (removed from new detail)
  });
});

describe('[STK-T-HOOK] delete with linked sale — both sides reversed', () => {
  it('treatment+sale shared consumption, delete restores everything', async () => {
    const { deductStockForTreatment, deductStockForSale, reverseStockForTreatment, reverseStockForSale } = await bc();
    const bMed = await seedBatch(PID_MED, 100);
    const bCon = await seedBatch(PID_CON, 100);
    const bProd = await seedBatch(PID_PROD, 100);
    const treatmentId = `TRT-DEL-${TS}`;
    const saleId = `TRT-DEL-SALE-${TS}`;

    // hasSale=true create flow:
    await deductStockForTreatment(treatmentId, {
      consumables: [{ productId: PID_CON, productName: PID_CON, qty: 5 }],
    }, { branchId: BRANCH });
    await deductStockForSale(saleId, {
      products: [{ productId: PID_PROD, productName: PID_PROD, qty: 3 }],
      medications: [{ productId: PID_MED, productName: PID_MED, qty: 2 }],
    }, { branchId: BRANCH });

    // Delete: BackendDashboard onDeleteTreatment flow calls BOTH reverses
    await reverseStockForSale(saleId);
    await reverseStockForTreatment(treatmentId);

    const med = (await getDoc(batchDoc(bMed))).data();
    const con = (await getDoc(batchDoc(bCon))).data();
    const prod = (await getDoc(batchDoc(bProd))).data();
    expect(med.qty.remaining).toBe(100);
    expect(con.qty.remaining).toBe(100);
    expect(prod.qty.remaining).toBe(100);
  });

  // C3 regression: `deleteBackendTreatment` must reverse stock internally so
  // that any caller (not just the defensive BackendDashboard wrapper) is
  // guaranteed safe. Before the fix, the function hard-deleted the doc and
  // orphaned batch deductions forever.
  it('C3 — deleteBackendTreatment reverses stock even without external wrapper', async () => {
    const { deductStockForTreatment, deleteBackendTreatment, listStockMovements } = await bc();
    const bCon = await seedBatch(PID_CON, 100);
    const bItem = await seedBatch(PID_ITEM, 100);
    const treatmentId = `TRT-C3-${TS}`;

    // Simulate a treatment that deducted some consumables + items
    await deductStockForTreatment(treatmentId, {
      consumables: [{ productId: PID_CON, productName: PID_CON, qty: 4 }],
      treatmentItems: [{ productId: PID_ITEM, productName: PID_ITEM, qty: 6 }],
    }, { branchId: BRANCH });

    // Pre-check: both batches depleted
    let con = (await getDoc(batchDoc(bCon))).data();
    let item = (await getDoc(batchDoc(bItem))).data();
    expect(con.qty.remaining).toBe(96);
    expect(item.qty.remaining).toBe(94);

    // Seed treatment doc so deleteDoc has something to remove
    await setDoc(doc(db, ...P, 'be_treatments', treatmentId), {
      treatmentId, customerId: 'TEST', detail: {}, createdAt: new Date().toISOString(),
    });

    // Under fix: deleteBackendTreatment internally calls reverseStockForTreatment
    await deleteBackendTreatment(treatmentId);

    con = (await getDoc(batchDoc(bCon))).data();
    item = (await getDoc(batchDoc(bItem))).data();
    expect(con.qty.remaining).toBe(100);
    expect(item.qty.remaining).toBe(100);

    // Reverse movement was appended (not removed — append-only log)
    const mvts = await listStockMovements({ linkedTreatmentId: treatmentId, includeReversed: true });
    const originals = mvts.filter(m => m.reversedByMovementId);
    const reverses = mvts.filter(m => m.reverseOf);
    expect(originals.length).toBe(reverses.length);
    expect(originals.length).toBeGreaterThan(0);
  });
});
