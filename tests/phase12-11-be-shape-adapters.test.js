// ─── Phase 12.11 · be_* → master_data shape adapter tests ────────────────
// Validates that the 4 adapters in backendClient.js (products/courses/staff/
// doctors) produce shapes that downstream master_data callers expect.
// Import via dynamic require so we can stub Firestore but still reach the
// getBeBackedMasterTypes enumerator.

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

describe('Phase 12.11 — getBeBackedMasterTypes', () => {
  it('BE1: exports exactly 4 types (products/courses/staff/doctors)', () => {
    const types = mod.getBeBackedMasterTypes();
    expect(types).toEqual(expect.arrayContaining(['products', 'courses', 'staff', 'doctors']));
    expect(types).toHaveLength(4);
  });
});

describe('Phase 12.11 — clearMasterDataItems', () => {
  it('BE2: throws if type is empty', async () => {
    await expect(mod.clearMasterDataItems('')).rejects.toThrow(/type required/);
    await expect(mod.clearMasterDataItems(null)).rejects.toThrow(/type required/);
  });

  it('BE3: returns { type, deleted: 0 } when nothing to delete', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const r = await mod.clearMasterDataItems('products');
    expect(r).toEqual({ type: 'products', deleted: 0 });
  });

  it('BE4: batches deletes and returns count', async () => {
    const { getDocs, writeBatch } = await import('firebase/firestore');
    const batchDelete = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue();
    writeBatch.mockReturnValueOnce({ delete: batchDelete, commit: batchCommit });
    const mockDocs = Array.from({ length: 5 }, (_, i) => ({
      ref: { path: `master_data/products/items/P${i}` },
    }));
    getDocs
      .mockResolvedValueOnce({ empty: false, docs: mockDocs })
      .mockResolvedValueOnce({ empty: true, docs: [] });
    const r = await mod.clearMasterDataItems('products');
    expect(r).toEqual({ type: 'products', deleted: 5 });
    expect(batchDelete).toHaveBeenCalledTimes(5);
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });
});

/* ─── Shape adapter round-trip via getAllMasterDataItems ────────────────── */
// Each adapter maps be_* shape → master_data shape. Test by stubbing getDocs
// to return the be_* collection when getAllMasterDataItems() is called.

describe('Phase 12.11 — getAllMasterDataItems reads be_* first for backed types', () => {
  it('BE5: products adapter maps be_products → master-data shape', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [{
        id: 'PROD-1',
        data: () => ({
          productId: 'PROD-1',
          productName: 'Paracetamol',
          productCode: 'P001',
          productType: 'ยา',
          categoryName: 'ยาเม็ด',
          mainUnitName: 'เม็ด',
          price: 5,
          priceInclVat: 5.35,
          genericName: 'Acetaminophen',
          status: 'ใช้งาน',
        }),
      }],
    });
    const items = await mod.getAllMasterDataItems('products');
    expect(items).toHaveLength(1);
    const p = items[0];
    expect(p.id).toBe('PROD-1');
    expect(p.name).toBe('Paracetamol');
    expect(p.price).toBe(5);
    expect(p.unit).toBe('เม็ด');
    expect(p.type).toBe('ยา');
    expect(p.category).toBe('ยาเม็ด');
    expect(p.category_name).toBe('ยาเม็ด');  // legacy alias
    expect(p.code).toBe('P001');
    expect(p.product_code).toBe('P001');  // legacy alias
    expect(p.generic_name).toBe('Acetaminophen');
    expect(p.status).toBe(1);  // 'ใช้งาน' → 1 (active)
  });

  it('BE6: products disabled status maps to 0', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 'X', data: () => ({ productId: 'X', productName: 'N', status: 'พักใช้งาน' }) }],
    });
    const items = await mod.getAllMasterDataItems('products');
    expect(items[0].status).toBe(0);
  });

  it('BE7: courses adapter maps be_courses', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [{
        id: 'COURSE-1',
        data: () => ({
          courseId: 'COURSE-1',
          courseName: 'Laser',
          courseCode: 'L01',
          receiptCourseName: 'เลเซอร์',
          salePrice: 2500,
          salePriceInclVat: 2675,
          time: 30,
          courseCategory: 'Laser',
          status: 'ใช้งาน',
        }),
      }],
    });
    const items = await mod.getAllMasterDataItems('courses');
    const c = items[0];
    expect(c.id).toBe('COURSE-1');
    expect(c.name).toBe('Laser');
    expect(c.course_name).toBe('Laser');
    expect(c.code).toBe('L01');
    expect(c.course_code).toBe('L01');
    expect(c.receipt_course_name).toBe('เลเซอร์');
    expect(c.sale_price).toBe(2500);
    expect(c.price).toBe(2500);  // callers also read .price
    expect(c.category).toBe('Laser');
    expect(c.status).toBe(1);
  });

  it('BE8: staff adapter composes firstname+lastname into name', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [{
        id: 'STAFF-1',
        data: () => ({
          staffId: 'STAFF-1',
          firstname: 'สมชาย',
          lastname: 'ใจดี',
          email: 'som@clinic.com',
          color: '#111',
          position: 'พนักงานต้อนรับ',
          branchIds: ['BR-1', 'BR-2'],
          status: 'ใช้งาน',
        }),
      }],
    });
    const items = await mod.getAllMasterDataItems('staff');
    const s = items[0];
    expect(s.id).toBe('STAFF-1');
    expect(s.name).toBe('สมชาย ใจดี');
    expect(s.email).toBe('som@clinic.com');
    expect(s.position).toBe('พนักงานต้อนรับ');
    expect(s.branches).toEqual(['BR-1', 'BR-2']);
    expect(s.status).toBe(1);
  });

  it('BE9: staff with no lastname falls back to firstname', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 'S', data: () => ({ staffId: 'S', firstname: 'Alice', lastname: '' }) }],
    });
    const items = await mod.getAllMasterDataItems('staff');
    expect(items[0].name).toBe('Alice');
  });

  it('BE10: doctors adapter composes name + maps hourlyIncome to hourlyRate', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [{
        id: 'DOC-1',
        data: () => ({
          doctorId: 'DOC-1',
          firstname: 'สมหญิง',
          lastname: 'เก่งจริง',
          firstnameEn: 'Dr.',
          lastnameEn: 'Smith',
          position: 'แพทย์',
          hourlyIncome: 2000,
          color: '#222',
          branchIds: ['BR-1'],
          status: 'ใช้งาน',
        }),
      }],
    });
    const items = await mod.getAllMasterDataItems('doctors');
    const d = items[0];
    expect(d.id).toBe('DOC-1');
    expect(d.name).toBe('สมหญิง เก่งจริง');
    expect(d.firstname_en).toBe('Dr.');
    expect(d.lastname_en).toBe('Smith');
    expect(d.position).toBe('แพทย์');
    expect(d.hourlyRate).toBe(2000);
    expect(d.branches).toEqual(['BR-1']);
    expect(d.status).toBe(1);
  });
});

describe('Phase 12.11 — fallback behavior', () => {
  it('BE11: falls back to master_data when be_* is empty', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs
      .mockResolvedValueOnce({ docs: [] })  // be_products empty
      .mockResolvedValueOnce({                // master_data fallback
        docs: [{
          id: 'legacy-P1',
          data: () => ({ name: 'Legacy Product', price: 50, unit: 'ชิ้น', type: 'ยา', category: 'X', status: 1 }),
        }],
      });
    const items = await mod.getAllMasterDataItems('products');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('legacy-P1');
    expect(items[0].name).toBe('Legacy Product');
  });

  it('BE12: non-be-backed types always read master_data (e.g. wallet_types)', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 'W1', data: () => ({ name: 'Wallet Type A' }) }],
    });
    const items = await mod.getAllMasterDataItems('wallet_types');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Wallet Type A');
    // Only 1 getDocs call (no be_wallet_types attempt)
  });

  it('BE13: be_* read error falls back to master_data silently', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        docs: [{ id: 'fallback-P1', data: () => ({ name: 'Fallback' }) }],
      });
    const items = await mod.getAllMasterDataItems('products');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Fallback');
  });
});
