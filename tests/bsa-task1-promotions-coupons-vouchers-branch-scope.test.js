import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firestore SDK BEFORE importing backendClient
const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockQuery = vi.fn((col, ...constraints) => ({ __col: col, __constraints: constraints }));
const mockWhere = vi.fn((field, op, val) => ({ __where: [field, op, val] }));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDocs: (...a) => mockGetDocs(...a),
    setDoc: (...a) => mockSetDoc(...a),
    query: (...a) => mockQuery(...a),
    where: (...a) => mockWhere(...a),
    collection: vi.fn(() => ({ __col: 'be_promotions' })),
    doc: vi.fn(() => ({ __doc: true })),
    deleteDoc: vi.fn(),
    getDoc: vi.fn(),
    runTransaction: vi.fn(),
  };
});
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));

beforeEach(() => {
  vi.clearAllMocks();
  try { window.localStorage.removeItem('selectedBranchId'); } catch {}
});

describe('Task 1 — Promotions/Coupons/Vouchers branch-scope', () => {
  describe('T1.A listPromotions', () => {
    it('T1.A.1 with {branchId:"BR-A"} runs 2 queries: branchId==BR-A AND allBranches==true', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'P1', data: () => ({ promotion_name: 'A only', branchId: 'BR-A' }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'P2', data: () => ({ promotion_name: 'all', allBranches: true }) }] });
      const { listPromotions } = await import('../src/lib/backendClient.js');
      const items = await listPromotions({ branchId: 'BR-A' });
      expect(mockGetDocs).toHaveBeenCalledTimes(2);
      expect(items).toHaveLength(2);
      expect(items.map(i => i.id).sort()).toEqual(['P1', 'P2']);
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
      expect(mockWhere).toHaveBeenCalledWith('allBranches', '==', true);
    });

    it('T1.A.2 with {allBranches:true} runs 1 query (no filter)', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'P1', data: () => ({}) }, { id: 'P2', data: () => ({}) }] });
      const { listPromotions } = await import('../src/lib/backendClient.js');
      const items = await listPromotions({ allBranches: true });
      expect(mockGetDocs).toHaveBeenCalledTimes(1);
      expect(items).toHaveLength(2);
    });

    it('T1.A.3 dedupes when same doc matches both queries (allBranches doc with branchId set)', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'DUP', data: () => ({ branchId: 'BR-A', allBranches: true }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'DUP', data: () => ({ branchId: 'BR-A', allBranches: true }) }] });
      const { listPromotions } = await import('../src/lib/backendClient.js');
      const items = await listPromotions({ branchId: 'BR-A' });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('DUP');
    });

    it('T1.A.4 no opts (legacy callers) returns all docs (no filter, single query)', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'P1', data: () => ({}) }] });
      const { listPromotions } = await import('../src/lib/backendClient.js');
      const items = await listPromotions();
      expect(mockGetDocs).toHaveBeenCalledTimes(1);
      expect(items).toHaveLength(1);
    });
  });

  describe('T1.B listCoupons (mirror)', () => {
    it('T1.B.1 with {branchId} runs 2 queries + merge', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'C1', data: () => ({ coupon_name: 'a', coupon_code: 'A1' }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'C2', data: () => ({ coupon_name: 'all', coupon_code: 'B1', allBranches: true }) }] });
      const { listCoupons } = await import('../src/lib/backendClient.js');
      const items = await listCoupons({ branchId: 'BR-A' });
      expect(mockGetDocs).toHaveBeenCalledTimes(2);
      expect(items.map(i => i.id).sort()).toEqual(['C1', 'C2']);
    });

    it('T1.B.2 dedupes when coupon doc matches both queries', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'CDUP', data: () => ({ coupon_name: 'd', coupon_code: 'D1', branchId: 'BR-A', allBranches: true }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'CDUP', data: () => ({ coupon_name: 'd', coupon_code: 'D1', branchId: 'BR-A', allBranches: true }) }] });
      const { listCoupons } = await import('../src/lib/backendClient.js');
      const items = await listCoupons({ branchId: 'BR-A' });
      expect(items).toHaveLength(1);
    });
  });

  describe('T1.C listVouchers (mirror)', () => {
    it('T1.C.1 with {branchId} runs 2 queries + merge', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'V1', data: () => ({}) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'V2', data: () => ({ allBranches: true }) }] });
      const { listVouchers } = await import('../src/lib/backendClient.js');
      const items = await listVouchers({ branchId: 'BR-A' });
      expect(items).toHaveLength(2);
    });

    it('T1.C.2 dedupes when voucher doc matches both queries', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'VDUP', data: () => ({ allBranches: true, branchId: 'BR-A' }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'VDUP', data: () => ({ allBranches: true, branchId: 'BR-A' }) }] });
      const { listVouchers } = await import('../src/lib/backendClient.js');
      const items = await listVouchers({ branchId: 'BR-A' });
      expect(items).toHaveLength(1);
    });
  });

  describe('T1.D writers stamp branchId via _resolveBranchIdForWrite', () => {
    it('T1.D.1 savePromotion stamps current branchId on create', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-WRITE'); } catch {}
      const { savePromotion } = await import('../src/lib/backendClient.js');
      await savePromotion('P-NEW', { promotion_name: 'x', sale_price: 0 });
      const written = mockSetDoc.mock.calls[0][1];
      expect(written.branchId).toBe('BR-WRITE');
    });

    it('T1.D.2 savePromotion preserves existing branchId on edit (data.branchId provided)', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-CURRENT'); } catch {}
      const { savePromotion } = await import('../src/lib/backendClient.js');
      await savePromotion('P-EDIT', { promotion_name: 'x', sale_price: 0, branchId: 'BR-ORIGINAL' });
      const written = mockSetDoc.mock.calls[0][1];
      expect(written.branchId).toBe('BR-ORIGINAL');
    });

    it('T1.D.3 saveCoupon stamps branchId', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-X'); } catch {}
      const { saveCoupon } = await import('../src/lib/backendClient.js');
      await saveCoupon('C-1', { coupon_name: 'x', coupon_code: 'CC' });
      expect(mockSetDoc.mock.calls[0][1].branchId).toBe('BR-X');
    });

    it('T1.D.4 saveVoucher stamps branchId', async () => {
      try { window.localStorage.setItem('selectedBranchId', 'BR-Y'); } catch {}
      const { saveVoucher } = await import('../src/lib/backendClient.js');
      await saveVoucher('V-1', { voucher_name: 'x', voucher_code: 'VV', sale_price: 0 });
      expect(mockSetDoc.mock.calls[0][1].branchId).toBe('BR-Y');
    });
  });
});
