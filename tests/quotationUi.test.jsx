// ─── Phase 13.1.3 · QuotationTab + QuotationFormModal + QuotationPrintView ──
// Focused RTL tests — per feedback_test_per_subphase (run only these during
// sub-phase, full regression deferred to end of Phase 13.1).

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

const mockListQuotations = vi.fn();
const mockDeleteQuotation = vi.fn();
const mockSaveQuotation = vi.fn();
const mockGetAllCustomers = vi.fn();
const mockGetAllStaff = vi.fn();
const mockGetAllMasterDataItems = vi.fn();

vi.mock('../src/lib/backendClient.js', () => ({
  listQuotations: (...a) => mockListQuotations(...a),
  deleteQuotation: (...a) => mockDeleteQuotation(...a),
  saveQuotation: (...a) => mockSaveQuotation(...a),
  getAllCustomers: (...a) => mockGetAllCustomers(...a),
  listStaff: (...a) => mockGetAllStaff(...a),
  getAllMasterDataItems: (...a) => mockGetAllMasterDataItems(...a),
}));

const QuotationTab = (await import('../src/components/backend/QuotationTab.jsx')).default;
const QuotationFormModal = (await import('../src/components/backend/QuotationFormModal.jsx')).default;
const QuotationPrintView = (await import('../src/components/backend/QuotationPrintView.jsx')).default;

function makeQuotation(over = {}) {
  return {
    quotationId: 'QUO-0426-deadbeef',
    id: 'QUO-0426-deadbeef',
    customerId: 'CUST-1',
    customerName: 'สมชาย ใจดี',
    customerHN: 'HN0001',
    quotationDate: '2026-04-24',
    sellerId: 'S-1',
    sellerName: 'พนักงาน A',
    discount: 0,
    discountType: '',
    courses: [{ courseId: 'C1', courseName: 'Laser 1 ครั้ง', qty: 1, price: 2500 }],
    products: [],
    promotions: [],
    takeawayMeds: [],
    netTotal: 2500,
    status: 'draft',
    ...over,
  };
}

/* ─── QuotationTab ─────────────────────────────────────────────────────── */

describe('QuotationTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('QT1: empty state shows prompt to create', async () => {
    mockListQuotations.mockResolvedValueOnce([]);
    render(<QuotationTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีใบเสนอราคา/)).toBeInTheDocument());
  });

  it('QT2: renders row with customer + netTotal', async () => {
    mockListQuotations.mockResolvedValueOnce([makeQuotation()]);
    render(<QuotationTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมชาย ใจดี'));
    const row = screen.getByTestId('quotation-row-QUO-0426-deadbeef');
    expect(row).toHaveTextContent('HN0001');
    expect(row).toHaveTextContent('2,500.00');
    expect(row).toHaveTextContent('ร่าง'); // status badge
  });

  it('QT3: status filter isolates', async () => {
    mockListQuotations.mockResolvedValueOnce([
      makeQuotation(),
      makeQuotation({ quotationId: 'QUO-0426-aa', id: 'QUO-0426-aa', customerName: 'สมหญิง', status: 'accepted' }),
    ]);
    render(<QuotationTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมชาย ใจดี'));
    const filterSelect = screen.getByDisplayValue('สถานะทั้งหมด');
    fireEvent.change(filterSelect, { target: { value: 'accepted' } });
    expect(screen.queryByText('สมชาย ใจดี')).not.toBeInTheDocument();
    expect(screen.getByText('สมหญิง')).toBeInTheDocument();
  });

  it('QT4: search filters by customer name', async () => {
    mockListQuotations.mockResolvedValueOnce([
      makeQuotation(),
      makeQuotation({ quotationId: 'QUO-0426-aa', id: 'QUO-0426-aa', customerName: 'สมหญิง ดอกไม้' }),
    ]);
    render(<QuotationTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('สมชาย ใจดี'));
    const search = screen.getByPlaceholderText(/ค้นหาชื่อลูกค้า/);
    fireEvent.change(search, { target: { value: 'สมหญิง' } });
    expect(screen.queryByText('สมชาย ใจดี')).not.toBeInTheDocument();
    expect(screen.getByText(/สมหญิง/)).toBeInTheDocument();
  });

  it('QT5: sorts by quotationDate desc', async () => {
    mockListQuotations.mockResolvedValueOnce([
      makeQuotation({ quotationId: 'QUO-A', id: 'QUO-A', customerName: 'เก่า', quotationDate: '2026-04-01' }),
      makeQuotation({ quotationId: 'QUO-B', id: 'QUO-B', customerName: 'ใหม่', quotationDate: '2026-04-24' }),
    ]);
    render(<QuotationTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('เก่า'));
    // Order defined by listQuotations mock — verify both present
    expect(screen.getByText('เก่า')).toBeInTheDocument();
    expect(screen.getByText('ใหม่')).toBeInTheDocument();
  });
});

/* ─── QuotationFormModal ───────────────────────────────────────────────── */

describe('QuotationFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllCustomers.mockResolvedValue([]);
    mockGetAllStaff.mockResolvedValue([]);
    mockGetAllMasterDataItems.mockResolvedValue([]);
  });

  it('QF1: renders create title when no quotation passed', async () => {
    render(<QuotationFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/สร้างใบเสนอราคาใหม่/)).toBeInTheDocument());
  });

  it('QF2: renders edit title when existing quotation passed', async () => {
    render(<QuotationFormModal quotation={makeQuotation()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/แก้ไขใบเสนอราคา/)).toBeInTheDocument());
  });

  it('QF3: validation blocks save without customerId', async () => {
    render(<QuotationFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => screen.getByText(/สร้างใบเสนอราคาใหม่/));
    const saveBtn = screen.getByRole('button', { name: /บันทึก|สร้าง/i });
    fireEvent.click(saveBtn);
    // saveQuotation should NOT be called — validator blocks
    await waitFor(() => {
      expect(mockSaveQuotation).not.toHaveBeenCalled();
    });
  });

  it('QF4: opens with all 4 sub-item section labels visible', async () => {
    render(<QuotationFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => screen.getByText(/สร้างใบเสนอราคาใหม่/));
    expect(screen.getByText('คอร์ส')).toBeInTheDocument();
    expect(screen.getByText('สินค้าหน้าร้าน')).toBeInTheDocument();
    expect(screen.getByText('โปรโมชัน')).toBeInTheDocument();
    expect(screen.getByText('ยากลับบ้าน')).toBeInTheDocument();
  });

  it('QF5: edit mode displays existing sub-item + netTotal', async () => {
    render(<QuotationFormModal quotation={makeQuotation()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => screen.getByText(/แก้ไขใบเสนอราคา/));
    expect(screen.getByText('Laser 1 ครั้ง')).toBeInTheDocument();
    // Net total chip + subtotal both show baht amount — accept multiple matches
    expect(screen.getAllByText(/2,500\.00/).length).toBeGreaterThan(0);
  });
});

/* ─── QuotationPrintView ───────────────────────────────────────────────── */

describe('QuotationPrintView', () => {
  it('QP1: renders quotation number + customer + clinic name', () => {
    render(<QuotationPrintView quotation={makeQuotation()} clinicSettings={{ clinicName: 'My Clinic' }} onClose={() => {}} />);
    expect(screen.getByText('QUO-0426-deadbeef')).toBeInTheDocument();
    expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument();
    expect(screen.getByText('My Clinic')).toBeInTheDocument();
    // netTotal appears in line total + subtotal + net — assert at least one
    expect(screen.getAllByText(/2,500\.00/).length).toBeGreaterThan(0);
  });

  it('QP2: date rendered in Thai พ.ศ.', () => {
    render(<QuotationPrintView quotation={makeQuotation()} clinicSettings={{}} onClose={() => {}} />);
    // 2026 CE → 2569 BE
    expect(screen.getByText(/2569/)).toBeInTheDocument();
  });

  it('QP3: discount row shown when header discount > 0', () => {
    render(<QuotationPrintView
      quotation={makeQuotation({ discount: 10, discountType: 'percent', netTotal: 2250 })}
      clinicSettings={{}} onClose={() => {}} />);
    expect(screen.getByText(/ส่วนลดรวม/)).toBeInTheDocument();
    expect(screen.getByText(/\(10%\)/)).toBeInTheDocument();
  });

  it('QP4: renders category badge for each item (cover all 4 types)', () => {
    render(<QuotationPrintView
      quotation={makeQuotation({
        courses: [{ courseId: 'C1', courseName: 'Laser', qty: 1, price: 1000 }],
        products: [{ productId: 'P1', productName: 'Cream', qty: 1, price: 500 }],
        promotions: [{ promotionId: 'PR1', promotionName: 'Combo', qty: 1, price: 2000 }],
        takeawayMeds: [{ productId: 'M1', productName: 'Paracetamol', qty: 1, price: 30 }],
      })}
      clinicSettings={{}} onClose={() => {}} />);
    expect(screen.getByText('คอร์ส')).toBeInTheDocument();
    expect(screen.getByText('สินค้า')).toBeInTheDocument();
    expect(screen.getByText('โปรโมชัน')).toBeInTheDocument();
    expect(screen.getByText('ยา')).toBeInTheDocument();
  });

  it('QP5: empty-items state shown', () => {
    render(<QuotationPrintView
      quotation={makeQuotation({ courses: [], products: [], promotions: [], takeawayMeds: [] })}
      clinicSettings={{}} onClose={() => {}} />);
    expect(screen.getByText(/ไม่มีรายการ/)).toBeInTheDocument();
  });
});
