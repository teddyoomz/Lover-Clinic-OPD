// ─── Phase 12.2 · ProductsTab + CoursesTab smoke + Rule E ──────────────────
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false, media: '', onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

const mockListProducts = vi.fn();
const mockDeleteProduct = vi.fn();
const mockSaveProduct = vi.fn();
const mockListCourses = vi.fn();
const mockDeleteCourse = vi.fn();
const mockSaveCourse = vi.fn();
const mockListProductGroups = vi.fn();
const mockListProductUnitGroups = vi.fn();

vi.mock('../src/lib/backendClient.js', () => ({
  listProducts: (...a) => mockListProducts(...a),
  deleteProduct: (...a) => mockDeleteProduct(...a),
  saveProduct: (...a) => mockSaveProduct(...a),
  listCourses: (...a) => mockListCourses(...a),
  deleteCourse: (...a) => mockDeleteCourse(...a),
  saveCourse: (...a) => mockSaveCourse(...a),
  listProductGroups: (...a) => mockListProductGroups(...a),
  listProductUnitGroups: (...a) => mockListProductUnitGroups(...a),
  getProduct: vi.fn(),
  getCourse: vi.fn(),
}));

import ProductsTab from '../src/components/backend/ProductsTab.jsx';
import ProductFormModal from '../src/components/backend/ProductFormModal.jsx';
import CoursesTab from '../src/components/backend/CoursesTab.jsx';
import CourseFormModal from '../src/components/backend/CourseFormModal.jsx';

function makeProduct(o = {}) {
  return {
    productId: 'PROD-1', productName: 'Paracetamol', productCode: 'P001',
    productType: 'ยา', genericName: 'Acetaminophen', categoryName: 'ยาเม็ด',
    mainUnitName: 'เม็ด', price: 5, priceInclVat: 5.35,
    isVatIncluded: false, isClaimDrugDiscount: true, isTakeawayProduct: true,
    status: 'ใช้งาน', createdAt: '2026-04-20', updatedAt: '2026-04-20',
    ...o,
  };
}

function makeCourse(o = {}) {
  return {
    courseId: 'COURSE-1', courseName: 'Laser 1 ครั้ง', courseCode: 'LAS-1',
    courseCategory: 'Laser', time: 30, salePrice: 2500,
    isVatIncluded: false, courseProducts: [{ productId: 'PROD-1', productName: 'Paracetamol', qty: 1 }],
    status: 'ใช้งาน', createdAt: '2026-04-20', updatedAt: '2026-04-20',
    ...o,
  };
}

/* ─── ProductsTab ─────────────────────────────────────────────────────── */

describe('ProductsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListProductGroups.mockResolvedValue([]);
    mockListProductUnitGroups.mockResolvedValue([]);
  });

  it('PT1: empty state', async () => {
    mockListProducts.mockResolvedValueOnce([]);
    render(<ProductsTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีสินค้า/)).toBeInTheDocument());
  });

  it('PT2: renders card with name + price', async () => {
    mockListProducts.mockResolvedValueOnce([makeProduct()]);
    render(<ProductsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Paracetamol'));
    const card = screen.getByTestId('product-card-PROD-1');
    expect(card).toHaveTextContent('ยา');
    expect(card).toHaveTextContent('5');
  });

  it('PT3: type filter isolates', async () => {
    mockListProducts.mockResolvedValueOnce([
      makeProduct(),
      makeProduct({ productId: 'PROD-2', productName: 'IV Drip', productType: 'บริการ' }),
    ]);
    render(<ProductsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Paracetamol'));
    fireEvent.change(screen.getByDisplayValue('ประเภททั้งหมด'), { target: { value: 'บริการ' } });
    expect(screen.queryByText('Paracetamol')).not.toBeInTheDocument();
    expect(screen.getByText('IV Drip')).toBeInTheDocument();
  });

  it('PT4: delete invokes backend', async () => {
    mockListProducts.mockResolvedValueOnce([makeProduct()]);
    mockListProducts.mockResolvedValueOnce([]);
    mockDeleteProduct.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProductsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Paracetamol'));
    fireEvent.click(screen.getByLabelText('ลบสินค้า Paracetamol'));
    await waitFor(() => expect(mockDeleteProduct).toHaveBeenCalledWith('PROD-1'));
    spy.mockRestore();
  });
});

describe('ProductFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListProductGroups.mockResolvedValue([]);
    mockListProductUnitGroups.mockResolvedValue([]);
  });

  it('PM1: empty name rejected', async () => {
    render(<ProductFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/กรุณากรอกชื่อสินค้า/)).toBeInTheDocument());
    expect(mockSaveProduct).not.toHaveBeenCalled();
  });

  it('PM2: valid save generates PROD- id', async () => {
    mockSaveProduct.mockResolvedValueOnce();
    render(<ProductFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.change(screen.getByPlaceholderText('ชื่อสินค้า'), { target: { value: 'NewProduct' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSaveProduct).toHaveBeenCalled());
    expect(mockSaveProduct.mock.calls[0][0]).toMatch(/^PROD-/);
  });

  it('PM3: edit mode preserves id', async () => {
    mockSaveProduct.mockResolvedValueOnce();
    render(<ProductFormModal product={makeProduct()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(mockSaveProduct).toHaveBeenCalled());
    expect(mockSaveProduct.mock.calls[0][0]).toBe('PROD-1');
  });

  it('PM4: dosage cluster hidden for non-ยา type', async () => {
    render(<ProductFormModal product={makeProduct({ productType: 'บริการ' })} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.queryByText(/ข้อมูลยา/)).not.toBeInTheDocument();
  });

  it('PM5: dosage cluster visible for ยา type', async () => {
    render(<ProductFormModal product={makeProduct()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    expect(screen.getByText(/ข้อมูลยา/)).toBeInTheDocument();
  });
});

/* ─── CoursesTab ──────────────────────────────────────────────────────── */

describe('CoursesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListProducts.mockResolvedValue([]);
  });

  it('CT1: empty state', async () => {
    mockListCourses.mockResolvedValueOnce([]);
    render(<CoursesTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีคอร์ส/)).toBeInTheDocument());
  });

  it('CT2: renders card with category + price + sub-items count', async () => {
    mockListCourses.mockResolvedValueOnce([makeCourse()]);
    render(<CoursesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Laser 1 ครั้ง'));
    const card = screen.getByTestId('course-card-COURSE-1');
    expect(card).toHaveTextContent('Laser');
    expect(card).toHaveTextContent('2,500');
    expect(card).toHaveTextContent('สินค้า 1 รายการ');
  });

  it('CT3: delete invokes backend', async () => {
    mockListCourses.mockResolvedValueOnce([makeCourse()]);
    mockListCourses.mockResolvedValueOnce([]);
    mockDeleteCourse.mockResolvedValueOnce();
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CoursesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Laser 1 ครั้ง'));
    fireEvent.click(screen.getByLabelText('ลบคอร์ส Laser 1 ครั้ง'));
    await waitFor(() => expect(mockDeleteCourse).toHaveBeenCalledWith('COURSE-1'));
    spy.mockRestore();
  });
});

describe('CourseFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListProducts.mockResolvedValue([makeProduct(), makeProduct({ productId: 'PROD-2', productName: 'Aspirin' })]);
  });

  it('CM1: empty name rejected', async () => {
    render(<CourseFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(screen.getByText(/กรุณากรอกชื่อคอร์ส/)).toBeInTheDocument());
  });

  it('CM2: valid save generates COURSE- id', async () => {
    mockSaveCourse.mockResolvedValueOnce();
    render(<CourseFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const nameInput = document.querySelector('[data-field="courseName"] input');
    fireEvent.change(nameInput, { target: { value: 'NewCourse' } });
    fireEvent.click(screen.getByText('สร้าง'));
    await waitFor(() => expect(mockSaveCourse).toHaveBeenCalled());
    expect(mockSaveCourse.mock.calls[0][0]).toMatch(/^COURSE-/);
  });

  it('CM3: sub-item removal', async () => {
    mockSaveCourse.mockResolvedValueOnce();
    render(<CourseFormModal course={makeCourse()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText('Paracetamol')).toBeInTheDocument());
    // Phase 12.2b rewrite (2026-04-24): aria-label shortened from
    // "ลบสินค้า X จากคอร์ส" → "ลบสินค้า X" in the sub-item table.
    fireEvent.click(screen.getByLabelText(/ลบสินค้า Paracetamol/));
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(mockSaveCourse).toHaveBeenCalled());
    const savedForm = mockSaveCourse.mock.calls[0][1];
    expect(savedForm.courseProducts).toHaveLength(0);
  });

  // Phase 12.2b follow-up (2026-04-24): category + procedureType dropdowns
  // read distinct values from be_courses via listCourses(). Rule H-tris
  // (be_* only) — no master_data fallback, no ProClinic fetch.

  it('CM4: courseCategory datalist populated from distinct be_courses values', async () => {
    mockListCourses.mockResolvedValue([
      makeCourse({ courseId: 'C-A', courseCategory: 'Laser' }),
      makeCourse({ courseId: 'C-B', courseCategory: 'Botox' }),
      makeCourse({ courseId: 'C-C', courseCategory: 'Laser' }), // dup → dedup
    ]);
    render(<CourseFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => {
      const datalist = document.getElementById('course-category-options');
      expect(datalist).toBeTruthy();
      const options = datalist.querySelectorAll('option');
      expect(options).toHaveLength(2);
      const values = Array.from(options).map(o => o.value);
      expect(values).toContain('Laser');
      expect(values).toContain('Botox');
    });
  });

  it('CM5: empty be_courses → hint suggests sync from MasterDataTab', async () => {
    mockListCourses.mockResolvedValue([]);
    render(<CourseFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีหมวดหมู่ใน be_courses/)).toBeInTheDocument());
  });

  it('CM6: procedureType datalist populated from distinct be_courses values', async () => {
    mockListCourses.mockResolvedValue([
      makeCourse({ courseId: 'C-A', procedureType: 'ฉีดฟิลเลอร์' }),
      makeCourse({ courseId: 'C-B', procedureType: 'เลเซอร์' }),
    ]);
    render(<CourseFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => {
      const datalist = document.getElementById('procedure-type-options');
      expect(datalist).toBeTruthy();
      const options = datalist.querySelectorAll('option');
      expect(options).toHaveLength(2);
      const values = Array.from(options).map(o => o.value);
      expect(values).toContain('ฉีดฟิลเลอร์');
      expect(values).toContain('เลเซอร์');
    });
  });

  it('CM7: case-insensitive dedup preserves first-seen casing', async () => {
    mockListCourses.mockResolvedValue([
      makeCourse({ courseId: 'C-A', courseCategory: 'Botox' }),
      makeCourse({ courseId: 'C-B', courseCategory: 'botox' }), // case variant → dedup
    ]);
    render(<CourseFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => {
      const options = document.querySelectorAll('#course-category-options option');
      expect(options).toHaveLength(1);
      expect(options[0].value).toBe('Botox'); // first-seen preserved
    });
  });

  it('CM8: datalist skips empty / whitespace courseCategory', async () => {
    mockListCourses.mockResolvedValue([
      makeCourse({ courseId: 'C-A', courseCategory: '' }),
      makeCourse({ courseId: 'C-B', courseCategory: '   ' }),
      makeCourse({ courseId: 'C-C', courseCategory: 'Real' }),
    ]);
    render(<CourseFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => {
      const options = document.querySelectorAll('#course-category-options option');
      expect(options).toHaveLength(1);
      expect(options[0].value).toBe('Real');
    });
  });

  it('CM9: listCourses throw → datalist empty, no crash (graceful degrade)', async () => {
    mockListCourses.mockRejectedValue(new Error('network down'));
    render(<CourseFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => {
      // Empty-state hint renders in place of datalist options
      expect(screen.getByText(/ยังไม่มีหมวดหมู่ใน be_courses/)).toBeInTheDocument();
    });
  });
});

/* ─── Rule E + file hygiene ───────────────────────────────────────────── */

describe('Phase 12.2 — Rule E', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;

  it('RE1: validators clean', () => {
    for (const f of ['src/lib/productValidation.js', 'src/lib/courseValidation.js']) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src).not.toMatch(IMPORT_BROKER);
      expect(src).not.toMatch(FETCH_PROCLINIC);
    }
  });

  it('RE2: Tabs + Modals clean', () => {
    for (const f of [
      'src/components/backend/ProductsTab.jsx',
      'src/components/backend/ProductFormModal.jsx',
      'src/components/backend/CoursesTab.jsx',
      'src/components/backend/CourseFormModal.jsx',
    ]) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src).not.toMatch(IMPORT_BROKER);
      expect(src).not.toMatch(FETCH_PROCLINIC);
    }
  });

  // Phase 12.2b follow-up (2026-04-24): regression guard for the
  // stockConfig-reads-wrong-collection bug. Previously _getProductStockConfig
  // read master_data/products/items/{id} but products have lived in
  // be_products since Phase 11.9 → every sale/treatment stock deduction
  // was silently skipped. This test fails if anyone reverts the fix
  // (forces the lookup to read be_products FIRST).
  it('RE3: stockConfig lookup reads be_products before master_data', () => {
    const src = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
    // Extract the _getProductStockConfig body.
    const match = src.match(/async function _getProductStockConfig[^{]*\{([\s\S]*?)\n\}/);
    expect(match).toBeTruthy();
    const body = match[1];
    // be_products read MUST come before master_data read.
    const beIdx = body.indexOf("'be_products'");
    const masterIdx = body.indexOf("'master_data'");
    expect(beIdx).toBeGreaterThan(-1);
    // master_data may still appear as a legacy fallback, but only AFTER be_products.
    if (masterIdx > -1) {
      expect(beIdx).toBeLessThan(masterIdx);
    }
  });

  it('RE4: createStockOrder auto-opt-in writes stockConfig to be_products', () => {
    const src = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
    // The createStockOrder auto-opt-in block must write to be_products
    // (not master_data). We assert the string `'be_products'` appears
    // within 400 chars after the "_stockConfigSetBy: 'createStockOrder'"
    // sentinel — ensures the fix didn't get split off elsewhere.
    const sentinelIdx = src.indexOf("_stockConfigSetBy: 'createStockOrder'");
    expect(sentinelIdx).toBeGreaterThan(-1);
    const contextBefore = src.slice(Math.max(0, sentinelIdx - 400), sentinelIdx);
    expect(contextBefore).toContain("'be_products'");
  });

  // Phase 12.2b follow-up (2026-04-24): fill-later consume-on-use guards.
  // User directive: "หากกดบันทึกการรักษาของคอร์สเหมาตามจริง จะไม่ต้อง
  // ไปเช็คว่าลูกค้าเหลือคอร์สติดตัวเท่าไหร่". These regression tests
  // fail loud if anyone removes the short-circuit.

  it('RE5: deductCourseItems short-circuits fill-later courseType to zero (no remaining check)', () => {
    const src = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
    // Extract the deductCourseItems body.
    const match = src.match(/export async function deductCourseItems[^{]*\{([\s\S]*?)\n\}/);
    expect(match).toBeTruthy();
    const body = match[1];
    // Must reference courseType === 'เหมาตามจริง' somewhere in the loop
    // AND a zero-remaining emit via formatQtyString(0, ...).
    expect(body).toContain("'เหมาตามจริง'");
    expect(body).toContain('formatQtyString(0');
  });

  it('RE6: assignCourseToCustomer captures productId on each customer course entry', () => {
    const src = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
    // Look at the assignCourseToCustomer function body.
    const match = src.match(/export async function assignCourseToCustomer[^{]*\{([\s\S]*?)\n\}/);
    expect(match).toBeTruthy();
    const body = match[1];
    // `productId:` must appear in the pushed entry so late-visit
    // stock deductions can resolve be_products.
    expect(body).toContain('productId:');
    expect(body).toContain('p.id');
  });

  it('RE7: customerCoursesForForm propagates courseType + isRealQty + fillLater', () => {
    const src = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    // The customerCoursesForForm builder must carry these three flags so
    // a bought-but-unused fill-later course renders correctly next visit.
    const sentinelIdx = src.indexOf('customerCoursesForForm = rawCourses');
    expect(sentinelIdx).toBeGreaterThan(-1);
    // Grab 4500 chars of context (bumped from 2500 on 2026-04-24 after
    // the pick-at-treatment late-visit branch landed BEFORE the
    // specific-qty mapper — pushing isRealQty/fillLater past 2500).
    const ctx = src.slice(sentinelIdx, sentinelIdx + 4500);
    expect(ctx).toContain('courseType');
    expect(ctx).toContain('isRealQty');
    expect(ctx).toContain('fillLater');
  });
});
