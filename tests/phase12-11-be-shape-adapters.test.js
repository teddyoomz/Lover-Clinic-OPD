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

describe('Phase 12.11 + 11.9 — getBeBackedMasterTypes', () => {
  it('BE1: exports 16 types covering all Phase 9/11/12/14 be_* collections', () => {
    const types = mod.getBeBackedMasterTypes();
    const expected = [
      'products', 'courses', 'staff', 'doctors',                   // Phase 12
      'promotions', 'coupons', 'vouchers',                         // Phase 9
      'product_groups', 'product_units', 'medical_instruments',    // Phase 11
      'holidays', 'branches', 'permission_groups',                 // Phase 11
      // Phase 14.x gap audit (2026-04-24) — added to be_* reader flip:
      'wallet_types', 'membership_types', 'medicine_labels',
    ];
    expect(types).toEqual(expect.arrayContaining(expected));
    expect(types).toHaveLength(16);
  });

  it('BE1a: every listed type maps be_ doc → master_data shape with id field', async () => {
    const { getDocs } = await import('firebase/firestore');
    // Minimal smoke test: every type returns at least id+name for a stubbed doc
    const typeToBeIdField = {
      promotions: 'promotionId', coupons: 'couponId', vouchers: 'voucherId',
      product_groups: 'groupId', product_units: 'unitGroupId',
      medical_instruments: 'instrumentId',
      holidays: 'holidayId', branches: 'branchId', permission_groups: 'permissionGroupId',
    };
    for (const [type, idField] of Object.entries(typeToBeIdField)) {
      getDocs.mockResolvedValueOnce({
        docs: [{ id: 'BE-1', data: () => ({ [idField]: 'BE-1', name: 'X' }) }],
      });
      const items = await mod.getAllMasterDataItems(type);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('BE-1');
    }
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
    getDocs
      .mockResolvedValueOnce({ docs: [] })  // be_products empty (no enrichment needed for this case)
      .mockResolvedValueOnce({
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
    expect(c.products).toEqual([]);  // Phase 12.11 bug fix: always emits products array
  });

  it('BE7a: courses adapter flattens courseProducts → products with unit enrichment from be_products', async () => {
    const { getDocs } = await import('firebase/firestore');
    // First getDocs call = be_products preload for unit lookup
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 'PROD-A', data: () => ({ productId: 'PROD-A', productName: 'Filler Restylane', mainUnitName: 'ซีซี' }) },
          { id: 'PROD-B', data: () => ({ productId: 'PROD-B', productName: 'Allergan 100 U', mainUnitName: 'U' }) },
        ],
      })
      // Second getDocs call = be_courses
      .mockResolvedValueOnce({
        docs: [{
          id: 'COURSE-2',
          data: () => ({
            courseId: 'COURSE-2',
            courseName: 'อ่อมลอง 2',
            salePrice: 4990,
            courseProducts: [
              { productId: 'PROD-A', productName: 'Filler Restylane', qty: 1 },
              { productId: 'PROD-B', productName: 'Allergan 100 U', qty: 100 },
            ],
            status: 'ใช้งาน',
          }),
        }],
      });
    const items = await mod.getAllMasterDataItems('courses');
    const c = items[0];
    expect(c.id).toBe('COURSE-2');
    expect(c.name).toBe('อ่อมลอง 2');
    expect(Array.isArray(c.products)).toBe(true);
    expect(c.products).toHaveLength(2);
    expect(c.products[0]).toEqual({ id: 'PROD-A', name: 'Filler Restylane', qty: 1, unit: 'ซีซี' });
    expect(c.products[1]).toEqual({ id: 'PROD-B', name: 'Allergan 100 U', qty: 100, unit: 'U' });
  });

  it('BE7b: courses adapter uses stored productName + default unit when be_products lookup misses', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs
      .mockResolvedValueOnce({ docs: [] })  // be_products empty — no enrichment
      .mockResolvedValueOnce({
        docs: [{
          id: 'COURSE-3',
          data: () => ({
            courseId: 'COURSE-3',
            courseName: 'Course with orphan products',
            courseProducts: [
              { productId: 'MISSING-1', productName: 'Stored Name', qty: 2 },
              { productId: 'MISSING-2', qty: 5 },  // no productName
            ],
          }),
        }],
      });
    const items = await mod.getAllMasterDataItems('courses');
    const c = items[0];
    expect(c.products).toHaveLength(2);
    expect(c.products[0]).toEqual({ id: 'MISSING-1', name: 'Stored Name', qty: 2, unit: 'ครั้ง' });
    expect(c.products[1]).toEqual({ id: 'MISSING-2', name: '', qty: 5, unit: 'ครั้ง' });
  });

  it('BE7c: courses adapter gracefully handles be_products read error', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs
      .mockRejectedValueOnce(new Error('products offline'))  // be_products fails
      .mockResolvedValueOnce({                                // be_courses still works
        docs: [{
          id: 'COURSE-4',
          data: () => ({
            courseId: 'COURSE-4',
            courseName: 'Resilient Course',
            courseProducts: [{ productId: 'P1', productName: 'FromCourse', qty: 1 }],
          }),
        }],
      });
    const items = await mod.getAllMasterDataItems('courses');
    expect(items[0].products[0]).toEqual({ id: 'P1', name: 'FromCourse', qty: 1, unit: 'ครั้ง' });
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
