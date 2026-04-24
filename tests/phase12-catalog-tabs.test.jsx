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
});
