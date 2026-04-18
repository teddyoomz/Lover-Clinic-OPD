// ═══════════════════════════════════════════════════════════════════════════
// Phase 8b — Sale/Treatment stock integration tests
// Scope: deductStockForSale / reverseStockForSale / analyzeStockImpact /
//        deductStockForTreatment / reverseStockForTreatment
//
// Adversarial coverage per feedback_test_equal_to_code.md.
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
// TS unique per test file — `Date.now() + random` prevents cross-file collisions
// when vitest runs files in parallel (default) and two modules load in the same ms.
const TS = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bc = () => import('../src/lib/backendClient.js');
const su = () => import('../src/lib/stockUtils.js');

// ─── Collection refs ───────────────────────────────────────────────────────
const batchDoc = (id) => doc(db, ...P, 'be_stock_batches', id);
const batchesCol = () => collection(db, ...P, 'be_stock_batches');
const movementsCol = () => collection(db, ...P, 'be_stock_movements');
const ordersCol = () => collection(db, ...P, 'be_stock_orders');
const adjustmentsCol = () => collection(db, ...P, 'be_stock_adjustments');
const productDoc = (pid) => doc(db, ...P, 'master_data', 'products', 'items', pid);

// ─── Test scope IDs ────────────────────────────────────────────────────────
const PID_A = `STK-SALE-P-A-${TS}`;
const PID_B = `STK-SALE-P-B-${TS}`;
const PID_NOTRACK = `STK-SALE-P-NT-${TS}`;
const BRANCH = `STK-SALE-BR-${TS}`;
const SALE_PREFIX = `STK-SALE-${TS}-`;
const TX_PREFIX = `STK-TX-${TS}-`;

// ─── Cleanup ───────────────────────────────────────────────────────────────
async function nukeByField(col, field, value) {
  const q = query(col, where(field, '==', value));
  const s = await getDocs(q);
  await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
}
async function nukeByBranch(branchId) {
  await nukeByField(batchesCol(), 'branchId', branchId);
  await nukeByField(movementsCol(), 'branchId', branchId);
  await nukeByField(ordersCol(), 'branchId', branchId);
  await nukeByField(adjustmentsCol(), 'branchId', branchId);
}
async function nukeProducts() {
  for (const pid of [PID_A, PID_B, PID_NOTRACK]) {
    try { await deleteDoc(productDoc(pid)); } catch {}
  }
}
async function fullCleanup() {
  await nukeByBranch(BRANCH);
  await nukeProducts();
}

// ─── Seed helpers ──────────────────────────────────────────────────────────
async function seedProduct(pid, { trackStock = true } = {}) {
  await setDoc(productDoc(pid), {
    id: pid,
    name: pid,
    stockConfig: { trackStock, minAlert: 0, unit: 'U', isControlled: false },
  });
}
async function seedBatch(pid, qty, { expiresAt = null, receivedAt, cost = 10, branch = BRANCH, isPremium = false } = {}) {
  const { createStockOrder } = await bc();
  const { orderId, batchIds } = await createStockOrder({
    branchId: branch,
    importedDate: receivedAt || new Date().toISOString(),
    items: [{
      productId: pid, productName: pid, qty, cost,
      expiresAt, isPremium, unit: 'U',
    }],
  });
  // Patch batch's receivedAt if specified (createStockOrder uses now())
  if (receivedAt) {
    await setDoc(batchDoc(batchIds[0]), { receivedAt }, { merge: true });
  }
  return { orderId, batchId: batchIds[0] };
}

beforeAll(async () => {
  await fullCleanup();
  await seedProduct(PID_A, { trackStock: true });
  await seedProduct(PID_B, { trackStock: true });
  await seedProduct(PID_NOTRACK, { trackStock: false });
});
afterAll(fullCleanup);

// Each describe cleans batches/movements between its tests so FIFO state is deterministic
async function resetStock() {
  await nukeByBranch(BRANCH);
}

// ═══════════════════════════════════════════════════════════════════════════
// [STK-S] deductStockForSale — happy paths
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-S] deductStockForSale — happy paths', () => {
  beforeEach(resetStock);
  afterAll(resetStock);

  it('single item, single batch → movement + batch remaining decreases', async () => {
    const { deductStockForSale } = await bc();
    const { batchId } = await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'h1';
    const r = await deductStockForSale(saleId, {
      products: [{ productId: PID_A, productName: PID_A, qty: 30, unit: 'U' }],
    }, { branchId: BRANCH });

    expect(r.allocations.length).toBe(1);
    expect(r.allocations[0].movements.length).toBe(1);
    expect(r.allocations[0].movements[0].qty).toBe(30);

    const b = (await getDoc(batchDoc(batchId))).data();
    expect(b.qty.remaining).toBe(70);
    expect(b.status).toBe('active');

    const mq = query(movementsCol(), where('linkedSaleId', '==', saleId));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    expect(ms.length).toBe(1);
    expect(ms[0].type).toBe(2); // SALE
    expect(ms[0].qty).toBe(-30);
    expect(ms[0].before).toBe(100);
    expect(ms[0].after).toBe(70);
    expect(ms[0].sourceDocPath).toContain(saleId);
  });

  it('single item split across 2 batches — FEFO', async () => {
    const { deductStockForSale } = await bc();
    // seedBatch writes IMPORT movements; to force FEFO ordering, set distinct expiresAt
    const b1 = await seedBatch(PID_A, 50, { expiresAt: '2026-06-30' });
    const b2 = await seedBatch(PID_A, 50, { expiresAt: '2026-12-31' });
    const saleId = SALE_PREFIX + 'split';
    const r = await deductStockForSale(saleId, {
      products: [{ productId: PID_A, productName: PID_A, qty: 70, unit: 'U' }],
    }, { branchId: BRANCH });

    expect(r.allocations[0].movements.length).toBe(2);

    const bA = (await getDoc(batchDoc(b1.batchId))).data();
    const bB = (await getDoc(batchDoc(b2.batchId))).data();
    // FEFO: b1 (June) consumed first (50), b2 (Dec) consumed remainder (20)
    expect(bA.qty.remaining).toBe(0);
    expect(bA.status).toBe('depleted');
    expect(bB.qty.remaining).toBe(30);
    expect(bB.status).toBe('active');
  });

  it('multiple items in one sale', async () => {
    const { deductStockForSale } = await bc();
    await seedBatch(PID_A, 100);
    await seedBatch(PID_B, 100);
    const saleId = SALE_PREFIX + 'multi';
    const r = await deductStockForSale(saleId, {
      products: [
        { productId: PID_A, productName: PID_A, qty: 10, unit: 'U' },
        { productId: PID_B, productName: PID_B, qty: 20, unit: 'U' },
      ],
    }, { branchId: BRANCH });

    expect(r.allocations.length).toBe(2);
    const mq = query(movementsCol(), where('linkedSaleId', '==', saleId));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    expect(ms.length).toBe(2);
    const totalOut = ms.reduce((s, m) => s + m.qty, 0);
    expect(totalOut).toBe(-30);
  });

  it('products + medications normalized together', async () => {
    const { deductStockForSale } = await bc();
    await seedBatch(PID_A, 100);
    await seedBatch(PID_B, 100);
    const saleId = SALE_PREFIX + 'prodmed';
    const r = await deductStockForSale(saleId, {
      products: [{ productId: PID_A, productName: PID_A, qty: 5 }],
      medications: [{ productId: PID_B, productName: PID_B, qty: 3 }],
    }, { branchId: BRANCH });
    expect(r.allocations.length).toBe(2);
  });

  it('flat array input works equivalently', async () => {
    const { deductStockForSale } = await bc();
    await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'flat';
    const r = await deductStockForSale(saleId,
      [{ productId: PID_A, productName: PID_A, qty: 7 }],
      { branchId: BRANCH },
    );
    expect(r.allocations[0].movements[0].qty).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-S] skipped items (no productId / qty=0 / trackStock=false)
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-S] skipped items', () => {
  beforeEach(resetStock);

  it('item with no productId → skipped (no throw)', async () => {
    const { deductStockForSale } = await bc();
    const saleId = SALE_PREFIX + 'nopid';
    const r = await deductStockForSale(saleId, {
      products: [{ productName: 'manual item', qty: 5 }],
    }, { branchId: BRANCH });
    expect(r.allocations.length).toBe(0);
    expect(r.skippedItems.length).toBe(1);
    expect(r.skippedItems[0].reason).toBe('no-productId');
  });

  it('zero qty item → skipped', async () => {
    const { deductStockForSale } = await bc();
    await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'zero';
    const r = await deductStockForSale(saleId, {
      products: [{ productId: PID_A, productName: PID_A, qty: 0 }],
    }, { branchId: BRANCH });
    expect(r.allocations.length).toBe(0);
    expect(r.skippedItems[0].reason).toBe('zero-qty');
  });

  it('trackStock=false → movement written with skipped:true, batch untouched', async () => {
    const { deductStockForSale } = await bc();
    await seedBatch(PID_NOTRACK, 100);  // batch exists but shouldn't be touched
    const saleId = SALE_PREFIX + 'notrack';
    const r = await deductStockForSale(saleId, {
      products: [{ productId: PID_NOTRACK, productName: PID_NOTRACK, qty: 10 }],
    }, { branchId: BRANCH });
    expect(r.skippedItems[0].reason).toBe('trackStock-false');

    // Batch remaining should be unchanged (100)
    const q = query(batchesCol(), where('productId', '==', PID_NOTRACK));
    const bs = (await getDocs(q)).docs.map(d => d.data());
    for (const b of bs) expect(b.qty.remaining).toBe(100);

    // But a movement WAS written for audit
    const mq = query(movementsCol(), where('linkedSaleId', '==', saleId));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    expect(ms.length).toBe(1);
    expect(ms[0].skipped).toBe(true);
    expect(ms[0].batchId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-S] insufficient stock + rollback
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-S] insufficient stock + saga rollback', () => {
  beforeEach(resetStock);

  it('insufficient stock → throws, no partial writes', async () => {
    const { deductStockForSale } = await bc();
    await seedBatch(PID_A, 10);  // only 10 units
    const saleId = SALE_PREFIX + 'insuf';
    await expect(
      deductStockForSale(saleId,
        { products: [{ productId: PID_A, productName: PID_A, qty: 50 }] },
        { branchId: BRANCH },
      )
    ).rejects.toThrow(/insufficient|shortfall/i);

    // Batch remains at 10 (nothing written) after compensation
    const q = query(batchesCol(), where('productId', '==', PID_A));
    const batches = (await getDocs(q)).docs.map(d => d.data());
    const totalRemaining = batches.reduce((s, b) => s + b.qty.remaining, 0);
    expect(totalRemaining).toBe(10);

    // No SALE movements linked to this saleId either
    const mq = query(movementsCol(), where('linkedSaleId', '==', saleId));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    // Might have a reversal entry if mid-deduct failed, but no net negative impact
    const net = ms.reduce((s, m) => s + m.qty, 0);
    expect(net).toBe(0);
  });

  it('2nd item fails → 1st item rolled back', async () => {
    const { deductStockForSale } = await bc();
    await seedBatch(PID_A, 100);   // plenty
    await seedBatch(PID_B, 5);     // not enough for the 2nd item's 50
    const saleId = SALE_PREFIX + 'rb2';
    await expect(
      deductStockForSale(saleId, {
        products: [
          { productId: PID_A, productName: PID_A, qty: 20 },   // would succeed alone
          { productId: PID_B, productName: PID_B, qty: 50 },   // forces the throw
        ],
      }, { branchId: BRANCH })
    ).rejects.toThrow(/insufficient|shortfall/i);

    // PID_A batch should be back to 100 after compensation
    const q = query(batchesCol(), where('productId', '==', PID_A));
    const bs = (await getDocs(q)).docs.map(d => d.data());
    const totalA = bs.reduce((s, b) => s + b.qty.remaining, 0);
    expect(totalA).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-S] reverseStockForSale
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-S] reverseStockForSale', () => {
  beforeEach(resetStock);

  it('full reverse restores batch exactly, emits reverse movement', async () => {
    const { deductStockForSale, reverseStockForSale } = await bc();
    const { batchId } = await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'rev1';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_A, productName: PID_A, qty: 40 }] },
      { branchId: BRANCH });
    const r = await reverseStockForSale(saleId);
    expect(r.reversedCount).toBe(1);

    const b = (await getDoc(batchDoc(batchId))).data();
    expect(b.qty.remaining).toBe(100);

    // Original movement should now have reversedByMovementId populated
    const mq = query(movementsCol(), where('linkedSaleId', '==', saleId));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    const original = ms.find(m => m.qty === -40);
    const reverse = ms.find(m => m.qty === 40);
    expect(original).toBeDefined();
    expect(reverse).toBeDefined();
    expect(original.reversedByMovementId).toBe(reverse.movementId);
    expect(reverse.reverseOf).toBe(original.movementId);
  });

  it('reverse restores a DEPLETED batch back to active', async () => {
    const { deductStockForSale, reverseStockForSale } = await bc();
    const { batchId } = await seedBatch(PID_A, 30);
    const saleId = SALE_PREFIX + 'depl';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_A, productName: PID_A, qty: 30 }] },
      { branchId: BRANCH });
    const b1 = (await getDoc(batchDoc(batchId))).data();
    expect(b1.status).toBe('depleted');

    await reverseStockForSale(saleId);
    const b2 = (await getDoc(batchDoc(batchId))).data();
    expect(b2.qty.remaining).toBe(30);
    expect(b2.status).toBe('active');
  });

  it('idempotent — second call is a no-op', async () => {
    const { deductStockForSale, reverseStockForSale } = await bc();
    const { batchId } = await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'idem';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_A, productName: PID_A, qty: 10 }] },
      { branchId: BRANCH });
    await reverseStockForSale(saleId);
    const r2 = await reverseStockForSale(saleId);
    expect(r2.reversedCount).toBe(0);
    expect(r2.skippedCount).toBe(0);
    // Batch still 100
    const b = (await getDoc(batchDoc(batchId))).data();
    expect(b.qty.remaining).toBe(100);
  });

  it('only reverses movements for THIS sale (other sales untouched)', async () => {
    const { deductStockForSale, reverseStockForSale } = await bc();
    const { batchId } = await seedBatch(PID_A, 100);
    const saleX = SALE_PREFIX + 'x';
    const saleY = SALE_PREFIX + 'y';
    await deductStockForSale(saleX,
      { products: [{ productId: PID_A, productName: PID_A, qty: 30 }] },
      { branchId: BRANCH });
    await deductStockForSale(saleY,
      { products: [{ productId: PID_A, productName: PID_A, qty: 20 }] },
      { branchId: BRANCH });
    // Only cancel sale X
    await reverseStockForSale(saleX);
    const b = (await getDoc(batchDoc(batchId))).data();
    expect(b.qty.remaining).toBe(80);  // 100 - 20 (saleY still active)
  });

  it('reverses trackStock=false skipped movement (audit flip)', async () => {
    const { deductStockForSale, reverseStockForSale } = await bc();
    const saleId = SALE_PREFIX + 'rskip';
    await deductStockForSale(saleId, {
      products: [{ productId: PID_NOTRACK, productName: PID_NOTRACK, qty: 10 }],
    }, { branchId: BRANCH });
    const r = await reverseStockForSale(saleId);
    expect(r.skippedCount).toBe(1);
    const mq = query(movementsCol(), where('linkedSaleId', '==', saleId));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    const original = ms.find(m => !m.reverseOf);
    expect(original.reversedByMovementId).toBeTruthy();
  });

  it('reverseStockForSale on nonexistent sale → safe no-op', async () => {
    const { reverseStockForSale } = await bc();
    const r = await reverseStockForSale(SALE_PREFIX + 'doesnotexist');
    expect(r.reversedCount).toBe(0);
  });

  it('missing saleId throws', async () => {
    const { reverseStockForSale } = await bc();
    await expect(reverseStockForSale()).rejects.toThrow(/required/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-S] preferNewest for in-session batches
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-S] preferNewest', () => {
  beforeEach(resetStock);

  it('preferNewest=true consumes newest batch first (LIFO)', async () => {
    const { deductStockForSale } = await bc();
    const old = await seedBatch(PID_A, 50, { receivedAt: '2026-01-01T00:00:00Z' });
    const fresh = await seedBatch(PID_A, 50, { receivedAt: '2026-04-15T00:00:00Z' });
    const saleId = SALE_PREFIX + 'lifo';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_A, productName: PID_A, qty: 30 }] },
      { branchId: BRANCH, preferNewest: true });

    const bOld = (await getDoc(batchDoc(old.batchId))).data();
    const bFresh = (await getDoc(batchDoc(fresh.batchId))).data();
    expect(bFresh.qty.remaining).toBe(20);  // consumed from newest
    expect(bOld.qty.remaining).toBe(50);    // untouched
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-S] premium items
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-S] premium (ของแถม)', () => {
  beforeEach(resetStock);

  it('isPremium flag propagated to movement, stock still deducted', async () => {
    const { deductStockForSale } = await bc();
    await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'premium';
    await deductStockForSale(saleId, {
      products: [{ productId: PID_A, productName: PID_A, qty: 5, isPremium: true }],
    }, { branchId: BRANCH });
    const mq = query(movementsCol(), where('linkedSaleId', '==', saleId));
    const m = (await getDocs(mq)).docs.map(d => d.data())[0];
    expect(m.isPremium).toBe(true);
    expect(m.qty).toBe(-5);  // still deducted
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-S] analyzeStockImpact
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-S] analyzeStockImpact', () => {
  beforeEach(resetStock);

  it('returns movements + batchesAffected + totals', async () => {
    const { deductStockForSale, analyzeStockImpact } = await bc();
    await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'analyze';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_A, productName: PID_A, qty: 25 }] },
      { branchId: BRANCH });

    const a = await analyzeStockImpact({ saleId });
    expect(a.movements.length).toBe(1);
    expect(a.batchesAffected.length).toBe(1);
    expect(a.batchesAffected[0].willRestore).toBe(25);
    expect(a.totalQtyToRestore).toBe(25);
    expect(a.canReverseFully).toBe(true);
    expect(a.warnings.length).toBe(0);
  });

  it('warns when batch cancelled mid-life', async () => {
    const { deductStockForSale, analyzeStockImpact } = await bc();
    const { batchId } = await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'cancbatch';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_A, productName: PID_A, qty: 10 }] },
      { branchId: BRANCH });
    // Admin manually marks batch cancelled
    await setDoc(batchDoc(batchId), { status: 'cancelled' }, { merge: true });

    const a = await analyzeStockImpact({ saleId });
    expect(a.warnings.some(w => w.includes('cancelled'))).toBe(true);
  });

  it('canReverseFully=false when batch doc is missing', async () => {
    const { deductStockForSale, analyzeStockImpact } = await bc();
    const { batchId } = await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'missing';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_A, productName: PID_A, qty: 10 }] },
      { branchId: BRANCH });
    await deleteDoc(batchDoc(batchId));  // nuke batch

    const a = await analyzeStockImpact({ saleId });
    expect(a.canReverseFully).toBe(false);
    expect(a.warnings.length).toBeGreaterThan(0);
  });

  it('flags skipped (trackStock=false) movements', async () => {
    const { deductStockForSale, analyzeStockImpact } = await bc();
    const saleId = SALE_PREFIX + 'analyze-nt';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_NOTRACK, productName: PID_NOTRACK, qty: 10 }] },
      { branchId: BRANCH });
    const a = await analyzeStockImpact({ saleId });
    expect(a.warnings.some(w => w.includes('trackStock=false'))).toBe(true);
  });

  it('empty sale → zero impact, canReverseFully=true', async () => {
    const { analyzeStockImpact } = await bc();
    const a = await analyzeStockImpact({ saleId: SALE_PREFIX + 'empty' });
    expect(a.movements.length).toBe(0);
    expect(a.batchesAffected.length).toBe(0);
    expect(a.totalQtyToRestore).toBe(0);
    expect(a.canReverseFully).toBe(true);
  });

  it('throws without saleId or treatmentId', async () => {
    const { analyzeStockImpact } = await bc();
    await expect(analyzeStockImpact({})).rejects.toThrow(/required/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-T] Treatment integration
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-T] deductStockForTreatment / reverseStockForTreatment', () => {
  beforeEach(resetStock);

  it('uses movementType=6 (TREATMENT) by default', async () => {
    const { deductStockForTreatment } = await bc();
    await seedBatch(PID_A, 100);
    const treatmentId = TX_PREFIX + 't1';
    await deductStockForTreatment(treatmentId, {
      consumables: [{ productId: PID_A, productName: PID_A, qty: 5 }],
    }, { branchId: BRANCH });
    const mq = query(movementsCol(), where('linkedTreatmentId', '==', treatmentId));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    expect(ms[0].type).toBe(6);
  });

  it('opts.movementType=7 for take-home meds', async () => {
    const { deductStockForTreatment } = await bc();
    await seedBatch(PID_A, 100);
    const treatmentId = TX_PREFIX + 't2';
    await deductStockForTreatment(treatmentId, {
      medications: [{ productId: PID_A, productName: PID_A, qty: 5 }],
    }, { branchId: BRANCH, movementType: 7 });
    const mq = query(movementsCol(), where('linkedTreatmentId', '==', treatmentId));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    expect(ms[0].type).toBe(7);
  });

  it('treatmentItems + consumables + medications all normalized', async () => {
    const { deductStockForTreatment } = await bc();
    await seedBatch(PID_A, 200);
    const treatmentId = TX_PREFIX + 't3';
    await deductStockForTreatment(treatmentId, {
      medications: [{ productId: PID_A, productName: PID_A, qty: 5 }],
      consumables: [{ productId: PID_A, productName: PID_A, qty: 3 }],
      treatmentItems: [{ productId: PID_A, productName: PID_A, qty: 7 }],
    }, { branchId: BRANCH });
    const mq = query(movementsCol(), where('linkedTreatmentId', '==', treatmentId));
    const ms = (await getDocs(mq)).docs.map(d => d.data());
    expect(ms.length).toBe(3);
    const total = ms.reduce((s, m) => s + m.qty, 0);
    expect(total).toBe(-15);
  });

  it('reverseStockForTreatment restores batches', async () => {
    const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    const { batchId } = await seedBatch(PID_A, 100);
    const treatmentId = TX_PREFIX + 't4';
    await deductStockForTreatment(treatmentId,
      { consumables: [{ productId: PID_A, productName: PID_A, qty: 40 }] },
      { branchId: BRANCH });
    await reverseStockForTreatment(treatmentId);
    const b = (await getDoc(batchDoc(batchId))).data();
    expect(b.qty.remaining).toBe(100);
  });

  it('reverseStockForTreatment idempotent', async () => {
    const { deductStockForTreatment, reverseStockForTreatment } = await bc();
    await seedBatch(PID_A, 100);
    const treatmentId = TX_PREFIX + 't5';
    await deductStockForTreatment(treatmentId,
      { consumables: [{ productId: PID_A, productName: PID_A, qty: 10 }] },
      { branchId: BRANCH });
    await reverseStockForTreatment(treatmentId);
    const r2 = await reverseStockForTreatment(treatmentId);
    expect(r2.reversedCount).toBe(0);
  });

  it('missing treatmentId throws', async () => {
    const { deductStockForTreatment } = await bc();
    await expect(deductStockForTreatment('', {})).rejects.toThrow(/required/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [STK-E] Cross-subsystem: sale then treatment on same batch
// ═══════════════════════════════════════════════════════════════════════════
describe('[STK-E] cross-subsystem sale + treatment on shared batch', () => {
  beforeEach(resetStock);

  it('sale + treatment each take from same batch, cancel sale only restores its share', async () => {
    const { deductStockForSale, deductStockForTreatment, reverseStockForSale } = await bc();
    const { batchId } = await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'shared-s';
    const treatmentId = TX_PREFIX + 'shared-t';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_A, productName: PID_A, qty: 30 }] },
      { branchId: BRANCH });
    await deductStockForTreatment(treatmentId,
      { consumables: [{ productId: PID_A, productName: PID_A, qty: 20 }] },
      { branchId: BRANCH });
    const b1 = (await getDoc(batchDoc(batchId))).data();
    expect(b1.qty.remaining).toBe(50);

    await reverseStockForSale(saleId);
    const b2 = (await getDoc(batchDoc(batchId))).data();
    expect(b2.qty.remaining).toBe(80);  // only sale (30) restored; treatment (20) still out
  });

  it('sourceDocPath distinguishes sale vs treatment origins', async () => {
    const { deductStockForSale, deductStockForTreatment } = await bc();
    await seedBatch(PID_A, 100);
    const saleId = SALE_PREFIX + 'origin-s';
    const treatmentId = TX_PREFIX + 'origin-t';
    await deductStockForSale(saleId,
      { products: [{ productId: PID_A, productName: PID_A, qty: 5 }] },
      { branchId: BRANCH });
    await deductStockForTreatment(treatmentId,
      { consumables: [{ productId: PID_A, productName: PID_A, qty: 5 }] },
      { branchId: BRANCH });
    const saleM = (await getDocs(query(movementsCol(), where('linkedSaleId', '==', saleId)))).docs[0].data();
    const tM = (await getDocs(query(movementsCol(), where('linkedTreatmentId', '==', treatmentId)))).docs[0].data();
    expect(saleM.sourceDocPath).toContain('be_sales');
    expect(tM.sourceDocPath).toContain('be_treatments');
  });
});
