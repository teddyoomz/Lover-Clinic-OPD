// ─── Phase 9 — PromotionTab integration flow tests ─────────────────────────
// End-to-end user journey through PromotionTab + PromotionFormModal with
// Firestore (listPromotions / savePromotion / deletePromotion) + master
// data (getAllMasterDataItems) + Firebase Storage (storageClient) all
// mocked. Covers CRUD, filter, edit-mode restore, validation branches,
// cover_image handling, and the JSX-gated UI toggles (VAT, flexible mode,
// period, LINE OA, status).
//
// These complement the existing pure-unit Phase 9 tests (362 scenarios
// across 10 files). Goal: catch wiring bugs the pure tests can't see.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../src/lib/backendClient.js', () => ({
  listPromotions: vi.fn(),
  savePromotion: vi.fn(async () => {}),
  deletePromotion: vi.fn(async () => {}),
  getAllMasterDataItems: vi.fn(async () => []),
  // Phase 14.10-tris — be_* read helpers replaced legacy getAllMasterDataItems
  // for some consumers. Stub all new entry points so any consumer that swapped
  // over still mounts. listCourses + listProducts default to [] which already
  // matches the C15 "ยังไม่มีคอร์สใน master_data" placeholder assertion.
  listAllSellers: () => Promise.resolve([]),
  listProducts: () => Promise.resolve([]),
  listCourses: () => Promise.resolve([]),
  listStaff: () => Promise.resolve([]),
  listDoctors: () => Promise.resolve([]),
  listMembershipTypes: () => Promise.resolve([]),
  listWalletTypes: () => Promise.resolve([]),
}));

vi.mock('../src/lib/storageClient.js', () => ({
  uploadFile: vi.fn(async (file, path) => ({ url: `https://fake.storage/${path}`, storagePath: path })),
  deleteFile: vi.fn(async () => {}),
  buildStoragePath: vi.fn((a, b, c, n) => `${a}/${b}/${c}_${n}`),
}));

// ConfirmDialog — window.confirm patched per test
vi.stubGlobal('crypto', {
  getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = i; return arr; },
});

import PromotionTab from '../src/components/backend/PromotionTab.jsx';
import { listPromotions, savePromotion, deletePromotion, getAllMasterDataItems } from '../src/lib/backendClient.js';

const clinicSettings = { accentColor: '#dc2626' };

function mk(id, overrides = {}) {
  return {
    promotionId: `PROMO-${id}`,
    id: `PROMO-${id}`,
    usage_type: 'clinic',
    promotion_name: `Promo ${id}`,
    promotion_code: `CODE${id}`,
    category_name: 'CHA01',
    procedure_type_name: 'laser',
    sale_price: 1000 * Number(id),
    deposit_price: 100,
    is_vat_included: false,
    promotion_type: 'fixed',
    status: 'active',
    has_promotion_period: false,
    enable_line_oa_display: false,
    courses: [],
    products: [],
    ...overrides,
  };
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText('กำลังโหลด…')).not.toBeInTheDocument(), { timeout: 3000 });
}

describe('PromotionTab — load + list rendering', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('L1 shows loading state before list resolves', async () => {
    listPromotions.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<PromotionTab clinicSettings={clinicSettings} theme="dark" />);
    expect(screen.getByText('กำลังโหลด…')).toBeInTheDocument();
  });

  it('L2 empty list shows empty-state message', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} theme="dark" />);
    await waitForLoaded();
    expect(screen.getByText(/ยังไม่มีโปรโมชัน/)).toBeInTheDocument();
  });

  it('L3 renders all promotions from listPromotions', async () => {
    listPromotions.mockResolvedValue([mk(1), mk(2), mk(3)]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(container.querySelectorAll('.grid > div')).toHaveLength(3);
    expect(screen.getByText('Promo 1')).toBeInTheDocument();
    expect(screen.getByText('Promo 3')).toBeInTheDocument();
  });

  it('L4 counts shown in header (total · filtered)', async () => {
    listPromotions.mockResolvedValue(Array.from({ length: 17 }, (_, i) => mk(i)));
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText(/จำนวน 17 รายการ · แสดง 17 รายการ/)).toBeInTheDocument();
  });

  it('L5 listPromotions failure sets error state', async () => {
    listPromotions.mockRejectedValue(new Error('Firestore down'));
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('Firestore down')).toBeInTheDocument());
  });

  it('L6 card shows promotion_code with # prefix', async () => {
    listPromotions.mockResolvedValue([mk(1, { promotion_code: 'XYZ' })]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText('#XYZ')).toBeInTheDocument();
  });

  it('L7 card shows sale_price formatted in th-TH', async () => {
    listPromotions.mockResolvedValue([mk(1, { sale_price: 60000 })]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText('60,000')).toBeInTheDocument();
  });

  it('L8 status badge "ใช้งาน" for active', async () => {
    listPromotions.mockResolvedValue([mk(1, { status: 'active' })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    // Card has a badge span with active label. Select also has an option
    // with the same text — scope to the grid card.
    const card = container.querySelector('.grid > div');
    expect(within(card).getByText('ใช้งาน')).toBeInTheDocument();
  });

  it('L9 status badge "พักใช้งาน" for suspended', async () => {
    listPromotions.mockResolvedValue([mk(1, { status: 'suspended' })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const card = container.querySelector('.grid > div');
    expect(within(card).getByText('พักใช้งาน')).toBeInTheDocument();
  });

  it('L10 VAT-included shows "incl. VAT" badge', async () => {
    listPromotions.mockResolvedValue([mk(1, { is_vat_included: true })]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText('incl. VAT')).toBeInTheDocument();
  });

  it('L11 period visible when has_promotion_period', async () => {
    listPromotions.mockResolvedValue([mk(1, { has_promotion_period: true, promotion_period_start: '2026-01-01', promotion_period_end: '2026-12-31' })]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText(/2026-01-01 — 2026-12-31/)).toBeInTheDocument();
  });

  it('L12 legacy promotion without promotion_code hides code line', async () => {
    listPromotions.mockResolvedValue([mk(1, { promotion_code: '' })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    // Should NOT render any '#...' code text
    const code = container.querySelector('p.font-mono');
    expect(code).toBeNull();
  });

  it('L13 unknown status defaults to active badge', async () => {
    listPromotions.mockResolvedValue([mk(1, { status: 'nonsense' })]);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const card = container.querySelector('.grid > div');
    // Fallback to active label
    expect(within(card).getByText('ใช้งาน')).toBeInTheDocument();
  });

  it('L14 missing promotion_name shows "(ไม่มีชื่อ)"', async () => {
    listPromotions.mockResolvedValue([mk(1, { promotion_name: '' })]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText('(ไม่มีชื่อ)')).toBeInTheDocument();
  });
});

describe('PromotionTab — search + filter', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const sample = [
    mk(1, { promotion_name: 'หน้ายก01', promotion_code: 'FACE01', category_name: 'CHA01', status: 'active' }),
    mk(2, { promotion_name: 'Botox Deep', promotion_code: 'BTX02', category_name: 'BOT', status: 'suspended' }),
    mk(3, { promotion_name: 'หน้าใสกันยา', promotion_code: 'CLEAR09', category_name: 'CHA01', status: 'active' }),
  ];

  it('F1 search filters by promotion_name (substring)', async () => {
    listPromotions.mockResolvedValue(sample);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'หน้ายก' } });
    expect(screen.getByText('หน้ายก01')).toBeInTheDocument();
    expect(screen.queryByText('Botox Deep')).not.toBeInTheDocument();
  });

  it('F2 search filters by promotion_code', async () => {
    listPromotions.mockResolvedValue(sample);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'BTX' } });
    expect(screen.getByText('Botox Deep')).toBeInTheDocument();
    expect(screen.queryByText('หน้ายก01')).not.toBeInTheDocument();
  });

  it('F3 search is case-insensitive', async () => {
    listPromotions.mockResolvedValue(sample);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'botox' } });
    expect(screen.getByText('Botox Deep')).toBeInTheDocument();
  });

  it('F4 category filter populates from unique items', async () => {
    listPromotions.mockResolvedValue(sample);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const categorySelect = container.querySelectorAll('select')[0];
    const options = Array.from(categorySelect.querySelectorAll('option')).map(o => o.value);
    expect(options).toEqual(expect.arrayContaining(['', 'BOT', 'CHA01']));
  });

  it('F5 category filter applied', async () => {
    listPromotions.mockResolvedValue(sample);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const categorySelect = container.querySelectorAll('select')[0];
    fireEvent.change(categorySelect, { target: { value: 'BOT' } });
    expect(screen.getByText('Botox Deep')).toBeInTheDocument();
    expect(screen.queryByText('หน้ายก01')).not.toBeInTheDocument();
  });

  it('F6 status filter "suspended" shows only suspended', async () => {
    listPromotions.mockResolvedValue(sample);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const statusSelect = container.querySelectorAll('select')[1];
    fireEvent.change(statusSelect, { target: { value: 'suspended' } });
    expect(screen.getByText('Botox Deep')).toBeInTheDocument();
    expect(screen.queryByText('หน้ายก01')).not.toBeInTheDocument();
  });

  it('F7 combined filters: search + status', async () => {
    listPromotions.mockResolvedValue(sample);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'หน้า' } });
    const statusSelect = container.querySelectorAll('select')[1];
    fireEvent.change(statusSelect, { target: { value: 'active' } });
    // Matches both "หน้ายก01" and "หน้าใสกันยา"
    expect(screen.getByText('หน้ายก01')).toBeInTheDocument();
    expect(screen.getByText('หน้าใสกันยา')).toBeInTheDocument();
    expect(screen.queryByText('Botox Deep')).not.toBeInTheDocument();
  });

  it('F8 not-found state when filter returns empty', async () => {
    listPromotions.mockResolvedValue(sample);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'NOMATCH' } });
    expect(screen.getByText('ไม่พบโปรโมชันที่ตรงกับตัวกรอง')).toBeInTheDocument();
  });

  it('F9 clear search shows all items again', async () => {
    listPromotions.mockResolvedValue(sample);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: '' } });
    expect(screen.getByText('หน้ายก01')).toBeInTheDocument();
    expect(screen.getByText('Botox Deep')).toBeInTheDocument();
  });

  it('F10 case-insensitive category search substring match', async () => {
    listPromotions.mockResolvedValue(sample);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'cha' } });
    expect(screen.getByText('หน้ายก01')).toBeInTheDocument();
    expect(screen.getByText('หน้าใสกันยา')).toBeInTheDocument();
    expect(screen.queryByText('Botox Deep')).not.toBeInTheDocument();
  });
});

describe('PromotionTab — create + save flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savePromotion.mockResolvedValue({});
  });

  it('C1 clicking "สร้างโปรโมชัน" opens modal with empty form', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => expect(screen.getByText('สร้างโปรโมชันใหม่')).toBeInTheDocument());
  });

  it('C2 save empty promotion_name → error banner', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    const saveBtn = screen.getByRole('button', { name: /^สร้าง$/ });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(screen.getByText('กรุณากรอกชื่อโปรโมชัน')).toBeInTheDocument());
    expect(savePromotion).not.toHaveBeenCalled();
  });

  it('C3 valid save calls savePromotion with generated id', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    const nameInput = screen.getByPlaceholderText('กรอกชื่อโปรโมชัน');
    fireEvent.change(nameInput, { target: { value: 'My Promo' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(savePromotion).toHaveBeenCalledTimes(1));
    const [id, payload] = savePromotion.mock.calls[0];
    expect(id).toMatch(/^PROMO-\d{13,}-[0-9a-f]{8}$/);
    expect(payload.promotion_name).toBe('My Promo');
    expect(payload.promotionId).toBe(id);
    expect(payload.createdAt).toBeTruthy();
  });

  it('C4 save with negative sale_price blocks', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อโปรโมชัน'), { target: { value: 'P' } });
    const salePriceInput = screen.getAllByPlaceholderText('0')[1];
    fireEvent.change(salePriceInput, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText(/ราคาขายต้อง ≥ 0/)).toBeInTheDocument());
  });

  it('C5 save success → modal closes + list reloads', async () => {
    listPromotions.mockResolvedValueOnce([]).mockResolvedValueOnce([mk(1)]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อโปรโมชัน'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.queryByText('สร้างโปรโมชันใหม่')).not.toBeInTheDocument());
    expect(listPromotions).toHaveBeenCalledTimes(2);
  });

  it('C6 backend error surfaces in modal', async () => {
    listPromotions.mockResolvedValue([]);
    savePromotion.mockRejectedValueOnce(new Error('Firestore write failed'));
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อโปรโมชัน'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText('Firestore write failed')).toBeInTheDocument());
    // Modal stays open so user can retry
    expect(screen.getByText('สร้างโปรโมชันใหม่')).toBeInTheDocument();
  });

  it('C7 flexible mode: min > max blocks save', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อโปรโมชัน'), { target: { value: 'P' } });
    // Switch to flexible
    fireEvent.click(screen.getByLabelText(/เลือกคอร์สตามจริง/));
    // Set min > max
    const minInputs = screen.getAllByDisplayValue('1');
    fireEvent.change(minInputs[0], { target: { value: '5' } });
    fireEvent.change(minInputs[1], { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText(/ต่ำสุดต้อง ≤ สูงสุด/)).toBeInTheDocument());
  });

  it('C8 has_promotion_period requires start + end', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อโปรโมชัน'), { target: { value: 'P' } });
    // Toggle period
    fireEvent.click(screen.getByLabelText('กำหนดช่วงเวลา'));
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText(/กรุณาเลือกวันเริ่ม/)).toBeInTheDocument());
  });

  it('C9 VAT toggle recomputes inclVat display', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    const salePriceInput = screen.getAllByPlaceholderText('0')[1];
    fireEvent.change(salePriceInput, { target: { value: '1000' } });
    fireEvent.click(screen.getByLabelText(/มีภาษีมูลค่าเพิ่ม/));
    // Inc. VAT: 1000 * 1.07 = 1070
    await waitFor(() => expect(screen.getByText('1,070')).toBeInTheDocument());
  });

  it('C10 cancel button closes modal without save', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    fireEvent.click(screen.getByText('ยกเลิก'));
    await waitFor(() => expect(screen.queryByText('สร้างโปรโมชันใหม่')).not.toBeInTheDocument());
    expect(savePromotion).not.toHaveBeenCalled();
  });

  it('C11 ESC closes modal without save', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('สร้างโปรโมชันใหม่')).not.toBeInTheDocument());
    expect(savePromotion).not.toHaveBeenCalled();
  });

  it('C12 X close button closes modal', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    fireEvent.click(screen.getByLabelText('ปิด'));
    await waitFor(() => expect(screen.queryByText('สร้างโปรโมชันใหม่')).not.toBeInTheDocument());
  });

  it('C13 flexible mode switches visible sub-fields', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    // flexible hidden by default
    expect(screen.queryByText(/จำนวนคอร์ส ต่ำสุด/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/เลือกคอร์สตามจริง/));
    await waitFor(() => expect(screen.getByText('จำนวนคอร์ส ต่ำสุด')).toBeInTheDocument());
  });

  it('C14 LINE OA toggle shows button_label field', async () => {
    listPromotions.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    expect(screen.queryByPlaceholderText(/จองเลย/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/แสดงผลใน Line OA/));
    await waitFor(() => expect(screen.getByPlaceholderText(/จองเลย/)).toBeInTheDocument());
  });

  it('C15 course picker shows placeholder when no master data', async () => {
    listPromotions.mockResolvedValue([]);
    getAllMasterDataItems.mockResolvedValue([]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างโปรโมชัน'));
    await waitFor(() => screen.getByText('สร้างโปรโมชันใหม่'));
    await waitFor(() => expect(screen.getByText(/ยังไม่มีคอร์สใน master_data/)).toBeInTheDocument());
  });
});

describe('PromotionTab — edit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savePromotion.mockResolvedValue({});
  });

  const editable = mk(5, {
    promotion_name: 'Original Name',
    promotion_code: 'ORIG',
    sale_price: 5000,
    category_name: 'TEST',
    is_vat_included: true,
    has_promotion_period: true,
    promotion_period_start: '2026-01-01',
    promotion_period_end: '2026-06-30',
    description: 'Some description',
    status: 'suspended',
  });

  it('E1 edit button opens modal with edit title', async () => {
    listPromotions.mockResolvedValue([editable]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => expect(screen.getByText('แก้ไขโปรโมชัน')).toBeInTheDocument());
  });

  it('E2 all field values restored in edit mode', async () => {
    listPromotions.mockResolvedValue([editable]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => screen.getByText('แก้ไขโปรโมชัน'));
    expect(screen.getByDisplayValue('Original Name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ORIG')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('TEST')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Some description')).toBeInTheDocument();
  });

  it('E3 save preserves existing id (not regenerated)', async () => {
    listPromotions.mockResolvedValue([editable]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => screen.getByText('แก้ไขโปรโมชัน'));
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => expect(savePromotion).toHaveBeenCalled());
    const [id] = savePromotion.mock.calls[0];
    expect(id).toBe('PROMO-5');
  });

  it('E4 save preserves original createdAt', async () => {
    const withDate = { ...editable, createdAt: '2026-01-15T00:00:00.000Z' };
    listPromotions.mockResolvedValue([withDate]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => screen.getByText('แก้ไขโปรโมชัน'));
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => expect(savePromotion).toHaveBeenCalled());
    const [, payload] = savePromotion.mock.calls[0];
    expect(payload.createdAt).toBe('2026-01-15T00:00:00.000Z');
  });

  it('E5 edit-mode button label is "บันทึก" (not "สร้าง")', async () => {
    listPromotions.mockResolvedValue([editable]);
    render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => screen.getByText('แก้ไขโปรโมชัน'));
    expect(screen.getByRole('button', { name: /^บันทึก$/ })).toBeInTheDocument();
  });
});

describe('PromotionTab — delete flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deletePromotion.mockResolvedValue();
  });

  it('D1 delete button triggers window.confirm', async () => {
    listPromotions.mockResolvedValue([mk(1)]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const deleteBtns = container.querySelectorAll('button');
    const deleteBtn = Array.from(deleteBtns).find(b => b.querySelector('svg') && b.textContent === '');
    fireEvent.click(deleteBtn);
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('D2 confirm no → no API call', async () => {
    listPromotions.mockResolvedValue([mk(1)]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const deleteBtn = Array.from(container.querySelectorAll('button')).filter(b => b.querySelector('.lucide-trash2'))[0];
    fireEvent.click(deleteBtn);
    expect(deletePromotion).not.toHaveBeenCalled();
  });

  it('D3 confirm yes → deletePromotion + reload', async () => {
    listPromotions.mockResolvedValueOnce([mk(1)]).mockResolvedValueOnce([]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const deleteBtn = Array.from(container.querySelectorAll('button')).filter(b => b.querySelector('.lucide-trash2'))[0];
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(deletePromotion).toHaveBeenCalledWith('PROMO-1'));
    await waitFor(() => expect(listPromotions).toHaveBeenCalledTimes(2));
  });

  it('D4 delete failure shows error banner', async () => {
    listPromotions.mockResolvedValue([mk(1)]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    deletePromotion.mockRejectedValueOnce(new Error('nope'));
    const { container } = render(<PromotionTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const deleteBtn = Array.from(container.querySelectorAll('button')).filter(b => b.querySelector('.lucide-trash2'))[0];
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
  });
});
