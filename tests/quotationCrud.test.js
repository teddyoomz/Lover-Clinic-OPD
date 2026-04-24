// ─── Phase 13.1.2 · quotation CRUD integration tests (mocked Firestore) ───
// Validates the 4 CRUD functions in backendClient.js call firestore correctly
// and integrate with the validator. No live Firestore — same mock pattern as
// tests/phase12-11-be-shape-adapters.test.js.

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
  runTransaction: vi.fn(),
  increment: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { now: vi.fn(), fromDate: vi.fn() },
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  documentId: vi.fn(),
  onSnapshot: vi.fn(),
}));

const mod = await import('../src/lib/backendClient.js');

beforeEach(() => { vi.resetAllMocks(); });

const validDoc = () => ({
  customerId: 'CUST-1',
  quotationDate: '2026-04-24',
  courses: [{ courseId: 'C1', qty: 1, price: 1000 }],
});

describe('Phase 13.1.2 — saveQuotation', () => {
  it('QC1: rejects empty id', async () => {
    await expect(mod.saveQuotation('', validDoc())).rejects.toThrow(/quotationId required/);
    await expect(mod.saveQuotation(null, validDoc())).rejects.toThrow(/quotationId required/);
  });

  it('QC2: propagates validator failure as thrown Error', async () => {
    await expect(mod.saveQuotation('QUO-0426-deadbeef', { customerId: '' }))
      .rejects.toThrow();
  });

  it('QC3: writes to be_quotations/{id} via setDoc', async () => {
    const { setDoc, doc } = await import('firebase/firestore');
    await mod.saveQuotation('QUO-0426-deadbeef', validDoc());
    expect(setDoc).toHaveBeenCalledOnce();
    // doc() should have been called with the be_quotations path segment
    const docCalls = doc.mock.calls;
    const quotationDocCall = docCalls.find((c) => c.includes('be_quotations'));
    expect(quotationDocCall).toBeDefined();
  });

  it('QC4: writes normalized + timestamped payload', async () => {
    const { setDoc } = await import('firebase/firestore');
    await mod.saveQuotation('QUO-0426-deadbeef', validDoc());
    const [, payload] = setDoc.mock.calls[0];
    expect(payload.id).toBe('QUO-0426-deadbeef');
    expect(payload.quotationId).toBe('QUO-0426-deadbeef');
    expect(payload.customerId).toBe('CUST-1');
    expect(payload.status).toBe('draft');
    expect(typeof payload.createdAt).toBe('string');
    expect(typeof payload.updatedAt).toBe('string');
  });
});

describe('Phase 13.1.2 — getQuotation', () => {
  it('QC5: returns null for empty id (no Firestore call)', async () => {
    const { getDoc } = await import('firebase/firestore');
    const r = await mod.getQuotation('');
    expect(r).toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('QC6: returns null when doc missing', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({ exists: () => false });
    const r = await mod.getQuotation('QUO-0426-missing');
    expect(r).toBeNull();
  });

  it('QC7: returns { id, ...data } when doc exists', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'QUO-0426-deadbeef',
      data: () => ({ customerId: 'CUST-1', quotationDate: '2026-04-24' }),
    });
    const r = await mod.getQuotation('QUO-0426-deadbeef');
    expect(r.id).toBe('QUO-0426-deadbeef');
    expect(r.customerId).toBe('CUST-1');
  });
});

describe('Phase 13.1.2 — listQuotations', () => {
  it('QC8: returns [] when collection empty', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({ docs: [] });
    const r = await mod.listQuotations();
    expect(r).toEqual([]);
  });

  it('QC9: sorts newest quotationDate first', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'Q1', data: () => ({ quotationDate: '2026-04-01', createdAt: '2026-04-01T10:00Z' }) },
        { id: 'Q3', data: () => ({ quotationDate: '2026-04-24', createdAt: '2026-04-24T10:00Z' }) },
        { id: 'Q2', data: () => ({ quotationDate: '2026-04-15', createdAt: '2026-04-15T10:00Z' }) },
      ],
    });
    const r = await mod.listQuotations();
    expect(r.map((q) => q.id)).toEqual(['Q3', 'Q2', 'Q1']);
  });

  it('QC10: ties on quotationDate break by createdAt desc', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'Q1', data: () => ({ quotationDate: '2026-04-24', createdAt: '2026-04-24T08:00Z' }) },
        { id: 'Q2', data: () => ({ quotationDate: '2026-04-24', createdAt: '2026-04-24T20:00Z' }) },
      ],
    });
    const r = await mod.listQuotations();
    expect(r.map((q) => q.id)).toEqual(['Q2', 'Q1']);
  });
});

describe('Phase 13.1.2 — deleteQuotation', () => {
  it('QC11: rejects empty id', async () => {
    await expect(mod.deleteQuotation('')).rejects.toThrow(/quotationId required/);
    await expect(mod.deleteQuotation(null)).rejects.toThrow(/quotationId required/);
  });

  it('QC12: blocks deletion of converted quotation (lock rule)', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'converted', convertedToSaleId: 'SALE-1' }),
    });
    await expect(mod.deleteQuotation('QUO-0426-deadbeef')).rejects.toThrow(/แปลงเป็นใบขายแล้ว/);
  });

  it('QC13: allows deletion of non-converted quotation', async () => {
    const { getDoc, deleteDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'draft' }),
    });
    const r = await mod.deleteQuotation('QUO-0426-deadbeef');
    expect(r.success).toBe(true);
    expect(deleteDoc).toHaveBeenCalledOnce();
  });

  it('QC14: allows deletion of non-existent (idempotent)', async () => {
    const { getDoc, deleteDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({ exists: () => false });
    const r = await mod.deleteQuotation('QUO-0426-missing');
    expect(r.success).toBe(true);
    expect(deleteDoc).toHaveBeenCalledOnce();
  });

  it('QC15: converted quotation WITHOUT convertedToSaleId still deletable (incomplete convert)', async () => {
    const { getDoc, deleteDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'converted' }), // convertedToSaleId missing
    });
    // Delete allowed — lock only fires when BOTH status=converted AND convertedToSaleId set
    const r = await mod.deleteQuotation('QUO-0426-deadbeef');
    expect(r.success).toBe(true);
    expect(deleteDoc).toHaveBeenCalledOnce();
  });
});
