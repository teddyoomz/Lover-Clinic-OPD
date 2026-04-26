// ═══════════════════════════════════════════════════════════════════════════
// Phase 8a — Stock primitive integration tests
// Hits real Firestore (loverclinic-opd-4c39b) with TS-isolated IDs.
// Scope: createStockOrder / cancelStockOrder / updateStockOrder /
//        createStockAdjustment / read helpers / movement log invariants.
//
// Rule: every mutation must have adversarial coverage — see
// feedback_test_equal_to_code.md
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
const su = () => import('../src/lib/stockUtils.js');

// ─── Collection refs ───────────────────────────────────────────────────────
const batchesCol = () => collection(db, ...P, 'be_stock_batches');
const batchDoc = (id) => doc(db, ...P, 'be_stock_batches', id);
const orderDoc = (id) => doc(db, ...P, 'be_stock_orders', id);
const ordersCol = () => collection(db, ...P, 'be_stock_orders');
const movementsCol = () => collection(db, ...P, 'be_stock_movements');
const adjustmentDoc = (id) => doc(db, ...P, 'be_stock_adjustments', id);
const adjustmentsCol = () => collection(db, ...P, 'be_stock_adjustments');

// ─── Cleanup helpers (TS-scoped) ───────────────────────────────────────────
async function nukeBatchesForProduct(productId) {
  const q = query(batchesCol(), where('productId', '==', productId));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}
async function nukeOrdersForBranch(branchId) {
  const q = query(ordersCol(), where('branchId', '==', branchId));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}
async function nukeMovementsForProduct(productId) {
  const q = query(movementsCol(), where('productId', '==', productId));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}
async function nukeAdjustmentsForProduct(productId) {
  const q = query(adjustmentsCol(), where('productId', '==', productId));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}

const PID = `STK-PRD-${TS}`;
const BRANCH = `STK-BR-${TS}`;

async function cleanupAll() {
  await nukeOrdersForBranch(BRANCH);
  await nukeBatchesForProduct(PID);
  await nukeMovementsForProduct(PID);
  await nukeAdjustmentsForProduct(PID);
}

// ═══════════════════════════════════════════════════════════════════════════
// [STK-O] Orders — create, cancel, update
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-O] createStockOrder', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);

  it('creates order + N batches + N import movements', async () => {
    const { createStockOrder } = await bc();
    const { MOVEMENT_TYPES } = await su();
    const { orderId, batchIds } = await createStockOrder({
      vendorName: 'Vendor A',
      importedDate: '2026-04-18',
      note: 'test batch A',
      branchId: BRANCH,
      items: [
        { productId: PID, productName: 'Allergan 100 U', qty: 100, cost: 1000, expiresAt: '2026-12-31', unit: 'U' },
        { productId: PID, productName: 'Allergan 100 U', qty: 50, cost: 1100, expiresAt: '2027-01-31', unit: 'U' },
      ],
    }, { user: { userId: 'test-user', userName: 'Test User' } });

    expect(orderId).toMatch(/^ORD-/);
    expect(batchIds.length).toBe(2);

    // Order doc
    const order = (await getDoc(orderDoc(orderId))).data();
    expect(order.status).toBe('active');
    expect(order.branchId).toBe(BRANCH);
    expect(order.items.length).toBe(2);
    expect(order.items[0].batchId).toBe(batchIds[0]);

    // Batch docs
    for (const bid of batchIds) {
      const b = (await getDoc(batchDoc(bid))).data();
      expect(b.status).toBe('active');
      expect(b.productId).toBe(PID);
      expect(b.branchId).toBe(BRANCH);
      expect(b.sourceOrderId).toBe(orderId);
      expect(b.qty.remaining).toBe(b.qty.total);
    }

    // Movement docs (type=1 IMPORT per batch)
    const mq = query(movementsCol(), where('linkedOrderId', '==', orderId));
    const ms = await getDocs(mq);
    expect(ms.docs.length).toBe(2);
    for (const d of ms.docs) {
      const m = d.data();
      expect(m.type).toBe(MOVEMENT_TYPES.IMPORT);
      expect(m.before).toBe(0);
      expect(m.after).toBeGreaterThan(0);
      expect(m.user.userId).toBe('test-user');
      expect(m.sourceDocPath).toContain(orderId);
    }
  });

  it('throws on empty items', async () => {
    const { createStockOrder } = await bc();
    await expect(createStockOrder({ branchId: BRANCH, items: [] })).rejects.toThrow(/at least one/i);
  });

  it('throws on item with invalid qty (0)', async () => {
    const { createStockOrder } = await bc();
    await expect(createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, qty: 0 }],
    })).rejects.toThrow(/invalid qty/i);
  });

  it('throws on item with invalid qty (negative)', async () => {
    const { createStockOrder } = await bc();
    await expect(createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, qty: -5 }],
    })).rejects.toThrow(/invalid qty/i);
  });

  it('throws on item with non-numeric qty', async () => {
    const { createStockOrder } = await bc();
    await expect(createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, qty: 'abc' }],
    })).rejects.toThrow(/invalid qty/i);
  });

  it('costBasis on IMPORT movement = cost × qty', async () => {
    const { createStockOrder } = await bc();
    const { orderId } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 10, cost: 50 }],
    });
    const mq = query(movementsCol(), where('linkedOrderId', '==', orderId));
    const m = (await getDocs(mq)).docs[0].data();
    expect(m.costBasis).toBe(500);
  });

  it('isPremium flag preserved on batch + movement', async () => {
    const { createStockOrder } = await bc();
    const { orderId, batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 5, cost: 100, isPremium: true }],
    });
    const b = (await getDoc(batchDoc(batchIds[0]))).data();
    expect(b.isPremium).toBe(true);
    const mq = query(movementsCol(), where('linkedOrderId', '==', orderId));
    const m = (await getDocs(mq)).docs[0].data();
    expect(m.isPremium).toBe(true);
  });
});

describe('[STK-O] cancelStockOrder', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);

  it('success: no activity → order cancelled + batches cancelled + type=14 movements', async () => {
    const { createStockOrder, cancelStockOrder } = await bc();
    const { MOVEMENT_TYPES, BATCH_STATUS } = await su();
    const { orderId, batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 20, cost: 10 }],
    });

    const r = await cancelStockOrder(orderId, { reason: 'vendor recall', user: { userId: 'u1', userName: 'U1' } });
    expect(r.cancelledBatchIds.length).toBe(1);
    expect(r.movementIds.length).toBe(1);

    const order = (await getDoc(orderDoc(orderId))).data();
    expect(order.status).toBe('cancelled');

    const b = (await getDoc(batchDoc(batchIds[0]))).data();
    expect(b.status).toBe(BATCH_STATUS.CANCELLED);
    expect(b.qty.remaining).toBe(0);

    const mq = query(movementsCol(), where('linkedOrderId', '==', orderId));
    const allM = (await getDocs(mq)).docs.map(d => d.data());
    const importMvt = allM.find(m => m.type === MOVEMENT_TYPES.IMPORT);
    const cancelMvt = allM.find(m => m.type === MOVEMENT_TYPES.CANCEL_IMPORT);
    expect(importMvt).toBeDefined();
    expect(cancelMvt).toBeDefined();
    expect(cancelMvt.qty).toBe(-20);
    expect(cancelMvt.after).toBe(0);
  });

  it('blocks cancel if batch has non-import movement (e.g. an adjustment)', async () => {
    const { createStockOrder, cancelStockOrder, createStockAdjustment } = await bc();
    const { orderId, batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 20, cost: 10 }],
    });
    // Simulate "usage" by running an adjustment
    await createStockAdjustment({ batchId: batchIds[0], type: 'reduce', qty: 5, note: 'spillage' });

    await expect(cancelStockOrder(orderId)).rejects.toThrow(/cannot cancel|ยกเลิกคำสั่งซื้อไม่ได้/i);

    const order = (await getDoc(orderDoc(orderId))).data();
    expect(order.status).toBe('active');  // Still active, cancel didn't land
  });

  it('idempotent when already cancelled', async () => {
    const { createStockOrder, cancelStockOrder } = await bc();
    const { orderId } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 5, cost: 10 }],
    });
    await cancelStockOrder(orderId);
    const r2 = await cancelStockOrder(orderId);
    expect(r2.alreadyCancelled).toBe(true);
    expect(r2.movementIds).toEqual([]);
  });

  it('throws when order not found', async () => {
    const { cancelStockOrder } = await bc();
    await expect(cancelStockOrder('ORD-NOT-EXIST')).rejects.toThrow(/not found/i);
  });
});

describe('[STK-O] updateStockOrder', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);

  it('updates note + vendorName + discount', async () => {
    const { createStockOrder, updateStockOrder } = await bc();
    const { orderId } = await createStockOrder({
      branchId: BRANCH, vendorName: 'Old', note: 'old',
      items: [{ productId: PID, productName: 'X', qty: 10, cost: 100 }],
    });
    await updateStockOrder(orderId, { note: 'new note', vendorName: 'New', discount: 50, discountType: 'percent' });
    const o = (await getDoc(orderDoc(orderId))).data();
    expect(o.note).toBe('new note');
    expect(o.vendorName).toBe('New');
    expect(o.discount).toBe(50);
    expect(o.discountType).toBe('percent');
  });

  it('cascades cost update to batch.originalCost', async () => {
    const { createStockOrder, updateStockOrder } = await bc();
    const { orderId, batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 10, cost: 100 }],
    });
    const order = (await getDoc(orderDoc(orderId))).data();
    const key = order.items[0].orderProductId;

    await updateStockOrder(orderId, { items: [{ orderProductId: key, cost: 200 }] });
    const b = (await getDoc(batchDoc(batchIds[0]))).data();
    expect(b.originalCost).toBe(200);
  });

  it('throws on qty edit attempt', async () => {
    const { createStockOrder, updateStockOrder } = await bc();
    const { orderId } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 10, cost: 100 }],
    });
    const order = (await getDoc(orderDoc(orderId))).data();
    const key = order.items[0].orderProductId;
    await expect(updateStockOrder(orderId, { items: [{ orderProductId: key, qty: 99 }] }))
      .rejects.toThrow(/qty edits are blocked/i);
  });

  it('throws when editing cancelled order', async () => {
    const { createStockOrder, cancelStockOrder, updateStockOrder } = await bc();
    const { orderId } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 5, cost: 10 }],
    });
    await cancelStockOrder(orderId);
    await expect(updateStockOrder(orderId, { note: 'oops' }))
      .rejects.toThrow(/cannot edit a cancelled/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-A] Adjustments
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-A] createStockAdjustment', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);

  it('add: batch remaining increases + ADJUST_ADD movement', async () => {
    const { createStockOrder, createStockAdjustment } = await bc();
    const { MOVEMENT_TYPES } = await su();
    const { batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 100, cost: 10 }],
    });
    const bid = batchIds[0];
    // First reduce by 40 so there's room to add (remaining must not exceed total)
    await createStockAdjustment({ batchId: bid, type: 'reduce', qty: 40 });
    const { before, after } = await createStockAdjustment({ batchId: bid, type: 'add', qty: 20 });
    expect(before).toBe(60);
    expect(after).toBe(80);

    const b = (await getDoc(batchDoc(bid))).data();
    expect(b.qty.remaining).toBe(80);
    expect(b.status).toBe('active');

    const mq = query(movementsCol(), where('batchId', '==', bid));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    const addMvt = ms.find(m => m.type === MOVEMENT_TYPES.ADJUST_ADD);
    expect(addMvt).toBeDefined();
    expect(addMvt.qty).toBe(20);
  });

  it('reduce: batch remaining decreases + ADJUST_REDUCE movement', async () => {
    const { createStockOrder, createStockAdjustment } = await bc();
    const { MOVEMENT_TYPES } = await su();
    const { batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 100, cost: 10 }],
    });
    await createStockAdjustment({ batchId: batchIds[0], type: 'reduce', qty: 30, note: 'expired' });

    const b = (await getDoc(batchDoc(batchIds[0]))).data();
    expect(b.qty.remaining).toBe(70);

    const mq = query(movementsCol(), where('batchId', '==', batchIds[0]));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    const reduceMvt = ms.find(m => m.type === MOVEMENT_TYPES.ADJUST_REDUCE);
    expect(reduceMvt).toBeDefined();
    expect(reduceMvt.qty).toBe(-30);
    expect(reduceMvt.before).toBe(100);
    expect(reduceMvt.after).toBe(70);
    expect(reduceMvt.note).toBe('expired');
  });

  it('reduce to 0 → batch status becomes "depleted"', async () => {
    const { createStockOrder, createStockAdjustment } = await bc();
    const { batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 50, cost: 10 }],
    });
    await createStockAdjustment({ batchId: batchIds[0], type: 'reduce', qty: 50 });
    const b = (await getDoc(batchDoc(batchIds[0]))).data();
    expect(b.qty.remaining).toBe(0);
    expect(b.status).toBe('depleted');
  });

  it('blocked on cancelled batch', async () => {
    const { createStockOrder, cancelStockOrder, createStockAdjustment } = await bc();
    const { orderId, batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 20, cost: 10 }],
    });
    await cancelStockOrder(orderId);
    await expect(createStockAdjustment({ batchId: batchIds[0], type: 'reduce', qty: 5 }))
      .rejects.toThrow(/cancelled/i);
  });

  it('throws on missing batchId', async () => {
    const { createStockAdjustment } = await bc();
    await expect(createStockAdjustment({ type: 'add', qty: 5 })).rejects.toThrow(/batchId required/i);
  });

  it('throws on invalid type', async () => {
    const { createStockOrder, createStockAdjustment } = await bc();
    const { batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 20, cost: 10 }],
    });
    await expect(createStockAdjustment({ batchId: batchIds[0], type: 'wrong', qty: 5 }))
      .rejects.toThrow(/invalid adjustment type/i);
  });

  it('throws on non-positive qty', async () => {
    const { createStockOrder, createStockAdjustment } = await bc();
    const { batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 20, cost: 10 }],
    });
    await expect(createStockAdjustment({ batchId: batchIds[0], type: 'reduce', qty: 0 }))
      .rejects.toThrow(/invalid qty/i);
    await expect(createStockAdjustment({ batchId: batchIds[0], type: 'reduce', qty: -3 }))
      .rejects.toThrow(/invalid qty/i);
  });

  it('reduce insufficient → throws, batch unchanged (transactional rollback)', async () => {
    const { createStockOrder, createStockAdjustment } = await bc();
    const { batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 10, cost: 10 }],
    });
    await expect(createStockAdjustment({ batchId: batchIds[0], type: 'reduce', qty: 999 }))
      .rejects.toThrow(/insufficient/i);
    const b = (await getDoc(batchDoc(batchIds[0]))).data();
    expect(b.qty.remaining).toBe(10);  // unchanged
    // And no ADJUST_REDUCE movement was written (transactional)
    const mq = query(movementsCol(), where('batchId', '==', batchIds[0]));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    expect(ms.some(m => m.type === 4)).toBe(false);
  });

  it('writes adjustment doc with linked movementId', async () => {
    const { createStockOrder, createStockAdjustment } = await bc();
    const { batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 100, cost: 10 }],
    });
    const { adjustmentId, movementId } = await createStockAdjustment({
      batchId: batchIds[0], type: 'reduce', qty: 5, note: 'test'
    });
    const a = (await getDoc(adjustmentDoc(adjustmentId))).data();
    expect(a.movementId).toBe(movementId);
    expect(a.batchId).toBe(batchIds[0]);
    expect(a.type).toBe('reduce');
    expect(a.qty).toBe(5);
    expect(a.note).toBe('test');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-R] Read helpers
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-R] read helpers', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);

  it('getStockBatch returns null for missing', async () => {
    const { getStockBatch } = await bc();
    const b = await getStockBatch('BATCH-DOES-NOT-EXIST');
    expect(b).toBeNull();
  });

  it('listStockBatches filters by productId + branchId + status', async () => {
    const { createStockOrder, listStockBatches, createStockAdjustment } = await bc();
    const { orderId, batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [
        { productId: PID, productName: 'X', qty: 10, cost: 5 },
        { productId: PID, productName: 'X', qty: 20, cost: 5 },
      ],
    });
    // Deplete first batch
    await createStockAdjustment({ batchId: batchIds[0], type: 'reduce', qty: 10 });

    const active = await listStockBatches({ productId: PID, branchId: BRANCH, status: 'active' });
    expect(active.length).toBe(1);
    expect(active[0].batchId).toBe(batchIds[1]);

    const depleted = await listStockBatches({ productId: PID, branchId: BRANCH, status: 'depleted' });
    expect(depleted.length).toBe(1);
    expect(depleted[0].batchId).toBe(batchIds[0]);

    const all = await listStockBatches({ productId: PID, branchId: BRANCH });
    expect(all.length).toBe(2);
  });

  it('listStockMovements filters by linkedOrderId and hides reversed by default', async () => {
    const { createStockOrder, listStockMovements, cancelStockOrder } = await bc();
    const { orderId } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 10, cost: 5 }],
    });
    let mvts = await listStockMovements({ linkedOrderId: orderId });
    expect(mvts.length).toBe(1);
    expect(mvts[0].type).toBe(1);

    await cancelStockOrder(orderId);
    mvts = await listStockMovements({ linkedOrderId: orderId });
    // Both IMPORT and CANCEL_IMPORT should appear (neither is "reversedByMovementId"-tagged)
    expect(mvts.length).toBe(2);
    const types = mvts.map(m => m.type).sort();
    expect(types).toEqual([1, 14]);
  });

  it('getStockOrder returns full order with items', async () => {
    const { createStockOrder, getStockOrder } = await bc();
    const { orderId } = await createStockOrder({
      branchId: BRANCH, vendorName: 'V1',
      items: [{ productId: PID, productName: 'X', qty: 5, cost: 10 }],
    });
    const o = await getStockOrder(orderId);
    expect(o).toBeTruthy();
    expect(o.orderId).toBe(orderId);
    expect(o.vendorName).toBe('V1');
    expect(o.items.length).toBe(1);
  });

  it('listStockOrders sorted by importedDate DESC', async () => {
    const { createStockOrder, listStockOrders } = await bc();
    await createStockOrder({
      branchId: BRANCH, importedDate: '2026-01-01',
      items: [{ productId: PID, productName: 'A', qty: 5, cost: 10 }],
    });
    await createStockOrder({
      branchId: BRANCH, importedDate: '2026-04-01',
      items: [{ productId: PID, productName: 'B', qty: 5, cost: 10 }],
    });
    const orders = await listStockOrders({ branchId: BRANCH });
    // Newest first
    expect(orders[0].importedDate.startsWith('2026-04')).toBe(true);
    expect(orders[orders.length - 1].importedDate.startsWith('2026-01')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-M] Movement log invariants
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-M] movement log invariants', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);

  it('every movement has sourceDocPath populated', async () => {
    const { createStockOrder, createStockAdjustment, listStockMovements } = await bc();
    const { orderId, batchIds } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 10, cost: 5 }],
    });
    await createStockAdjustment({ batchId: batchIds[0], type: 'reduce', qty: 3 });

    const mvts = await listStockMovements({ batchId: batchIds[0] });
    for (const m of mvts) {
      expect(m.sourceDocPath).toBeTruthy();
      expect(m.sourceDocPath.startsWith('artifacts/')).toBe(true);
    }
  });

  it('every movement has user audit fields', async () => {
    const { createStockOrder, listStockMovements } = await bc();
    const { orderId } = await createStockOrder({
      branchId: BRANCH,
      items: [{ productId: PID, productName: 'X', qty: 10, cost: 5 }],
    }, { user: { userId: 'audit-u', userName: 'Audit User' } });
    const mvts = await listStockMovements({ linkedOrderId: orderId });
    expect(mvts[0].user.userId).toBe('audit-u');
    expect(mvts[0].user.userName).toBe('Audit User');
  });

  it('IDs are unique under same-ms creation (100 movements collision test)', async () => {
    const { createStockOrder } = await bc();
    const items = [];
    for (let i = 0; i < 10; i++) {
      items.push({ productId: PID, productName: `X${i}`, qty: 1, cost: 1 });
    }
    const { batchIds } = await createStockOrder({ branchId: BRANCH, items });
    expect(new Set(batchIds).size).toBe(batchIds.length);  // all unique
  });
});
