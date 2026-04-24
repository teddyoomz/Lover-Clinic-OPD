// ─── Phase 13.1.4 · convertQuotationToSale integration tests ──────────────
// Mocked Firestore pattern from phase12-11-be-shape-adapters.test.js.
// Focused per feedback_test_per_subphase; full regression at end of Phase 13.1.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), update: vi.fn(), set: vi.fn(), commit: vi.fn().mockResolvedValue() })),
  runTransaction: vi.fn((_db, fn) => fn({
    get: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
    set: vi.fn(),
  })),
  increment: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { now: vi.fn(), fromDate: vi.fn() },
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  documentId: vi.fn(),
  onSnapshot: vi.fn(),
}));

const mod = await import('../src/lib/backendClient.js');

beforeEach(async () => {
  vi.resetAllMocks();
  // Default: any subsequent getDoc call (e.g. createBackendSale's id-collision
  // safety check) returns a non-existent doc so it doesn't blow up.
  // Per-test mockResolvedValueOnce still gets popped first from the queue.
  const { getDoc, runTransaction } = await import('firebase/firestore');
  getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
  // runTransaction re-bound per test because resetAllMocks clears the impl.
  runTransaction.mockImplementation((_db, fn) => fn({
    get: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
    set: vi.fn(),
  }));
});

const validQ = (over = {}) => ({
  customerId: 'CUST-1',
  customerName: 'สมชาย',
  customerHN: 'HN0001',
  quotationDate: '2026-04-24',
  sellerId: 'S-1',
  sellerName: 'พนักงาน A',
  courses: [{ courseId: 'C1', courseName: 'Laser', qty: 1, price: 2500, itemDiscount: 0 }],
  products: [],
  promotions: [],
  takeawayMeds: [],
  subtotal: 2500,
  netTotal: 2500,
  discount: 0,
  discountType: '',
  status: 'draft',
  note: '',
  ...over,
});

describe('Phase 13.1.4 — convertQuotationToSale', () => {
  it('QCV1: rejects empty id', async () => {
    await expect(mod.convertQuotationToSale('')).rejects.toThrow(/quotationId required/);
    await expect(mod.convertQuotationToSale(null)).rejects.toThrow(/quotationId required/);
  });

  it('QCV2: throws when quotation not found', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({ exists: () => false });
    await expect(mod.convertQuotationToSale('QUO-0426-missing')).rejects.toThrow(/ไม่พบใบเสนอราคา/);
  });

  it('QCV3: idempotent — returns existing saleId on second call', async () => {
    const { getDoc, setDoc, updateDoc } = await import('firebase/firestore');
    // First call: quotation exists with convertedToSaleId already set.
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ...validQ(), status: 'converted', convertedToSaleId: 'INV-20260424-0001' }),
    });
    const r = await mod.convertQuotationToSale('QUO-0426-x');
    expect(r).toEqual({ saleId: 'INV-20260424-0001', alreadyConverted: true });
    // No new sale written, no quotation update.
    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('QCV4: rejects non-convertible status (expired/rejected/cancelled)', async () => {
    const { getDoc } = await import('firebase/firestore');
    for (const bad of ['expired', 'rejected', 'cancelled']) {
      getDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ ...validQ(), status: bad }),
      });
      await expect(mod.convertQuotationToSale('QUO-0426-x')).rejects.toThrow(/ไม่สามารถแปลง/);
    }
  });

  it('QCV5: flattens all 4 sub-item categories into sale.items[]', async () => {
    const { getDoc, setDoc, updateDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => validQ({
        courses: [{ courseId: 'C1', courseName: 'Laser', qty: 1, price: 1000 }],
        products: [{ productId: 'P1', productName: 'Cream', qty: 2, price: 500, isPremium: false }],
        promotions: [{ promotionId: 'PR1', promotionName: 'Combo', qty: 1, price: 0 }],
        takeawayMeds: [{ productId: 'M1', productName: 'Paracetamol', qty: 1, price: 30 }],
      }),
    });
    // Sale counter runs inside a transaction — mock default returns seq=1 already set.
    await mod.convertQuotationToSale('QUO-0426-x');
    expect(setDoc).toHaveBeenCalled();
    // The last setDoc (sale write) payload should have items.
    const saleCalls = setDoc.mock.calls.filter((c) => c[1] && Array.isArray(c[1].items));
    expect(saleCalls.length).toBeGreaterThan(0);
    const [, salePayload] = saleCalls[0];
    // courses + products + takeawayMeds = 3 items. Promotions dropped (no productId/courseId slot).
    expect(salePayload.items.length).toBe(3);
    expect(salePayload.items.find((i) => i.courseId === 'C1')).toBeTruthy();
    expect(salePayload.items.find((i) => i.productId === 'P1')).toBeTruthy();
    expect(salePayload.items.find((i) => i.productId === 'M1')?.isTakeaway).toBe(true);
    expect(updateDoc).toHaveBeenCalled();
  });

  it('QCV6: preserves takeaway med medication fields', async () => {
    const { getDoc, setDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => validQ({
        courses: [],
        takeawayMeds: [{
          productId: 'M1', productName: 'Paracetamol', qty: 1, price: 30,
          genericName: 'Acetaminophen', indications: 'ลดไข้',
          dosageAmount: '1', dosageUnit: 'เม็ด', timesPerDay: '3',
          administrationMethod: 'after_meal',
          administrationTimes: ['morning', 'evening'],
        }],
      }),
    });
    await mod.convertQuotationToSale('QUO-0426-x');
    const saleCalls = setDoc.mock.calls.filter((c) => c[1] && Array.isArray(c[1].items));
    const [, salePayload] = saleCalls[0];
    const med = salePayload.items[0];
    expect(med.isTakeaway).toBe(true);
    expect(med.medication.genericName).toBe('Acetaminophen');
    expect(med.medication.administrationMethod).toBe('after_meal');
    expect(med.medication.administrationTimes).toEqual(['morning', 'evening']);
  });

  it('QCV7: builds sellers[] from single quotation sellerId at 100%', async () => {
    const { getDoc, setDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => validQ({ sellerId: 'S-1', sellerName: 'พนักงาน A', netTotal: 2500 }),
    });
    await mod.convertQuotationToSale('QUO-0426-x');
    const saleCalls = setDoc.mock.calls.filter((c) => c[1] && Array.isArray(c[1].items));
    const [, salePayload] = saleCalls[0];
    expect(salePayload.sellers.length).toBe(1);
    expect(salePayload.sellers[0].sellerId).toBe('S-1');
    expect(salePayload.sellers[0].percent).toBe(100);
    expect(salePayload.sellers[0].total).toBe(2500);
  });

  it('QCV8: updates quotation to converted + sets convertedToSaleId + convertedAt', async () => {
    const { getDoc, updateDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => validQ(),
    });
    const res = await mod.convertQuotationToSale('QUO-0426-x');
    expect(updateDoc).toHaveBeenCalled();
    const updatePayload = updateDoc.mock.calls[0][1];
    expect(updatePayload.status).toBe('converted');
    expect(updatePayload.convertedToSaleId).toBe(res.saleId);
    expect(typeof updatePayload.convertedAt).toBe('string');
    expect(res.alreadyConverted).toBe(false);
  });

  it('QCV9: empty sellerId → sellers[] empty (no invariant violation)', async () => {
    const { getDoc, setDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => validQ({ sellerId: '', sellerName: '' }),
    });
    await mod.convertQuotationToSale('QUO-0426-x');
    const saleCalls = setDoc.mock.calls.filter((c) => c[1] && Array.isArray(c[1].items));
    const [, salePayload] = saleCalls[0];
    expect(salePayload.sellers).toEqual([]);
  });

  it('QCV10: promotions dropped into saleNote for seller review', async () => {
    const { getDoc, setDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => validQ({
        promotions: [
          { promotionId: 'PR1', promotionName: 'Combo A', qty: 1, price: 1000 },
          { promotionId: 'PR2', promotionName: 'Combo B', qty: 1, price: 2000 },
        ],
      }),
    });
    await mod.convertQuotationToSale('QUO-0426-x');
    const saleCalls = setDoc.mock.calls.filter((c) => c[1] && Array.isArray(c[1].items));
    const [, salePayload] = saleCalls[0];
    expect(salePayload.saleNote).toContain('Combo A');
    expect(salePayload.saleNote).toContain('Combo B');
    expect(salePayload.source).toBe('quotation');
    expect(salePayload.sourceDetail).toBe('QUO-0426-x');
    expect(salePayload.linkedQuotationId).toBe('QUO-0426-x');
  });
});
