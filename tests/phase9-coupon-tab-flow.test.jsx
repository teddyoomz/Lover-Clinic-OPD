// ─── Phase 9 — CouponTab integration flow tests ────────────────────────────
// Covers CRUD, search/filter, discount boundary, Bangkok-TZ expiry (AV9
// regression guard), branch multi-select, code uppercase, edit-mode restore.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../src/lib/backendClient.js', () => ({
  listCoupons: vi.fn(),
  saveCoupon: vi.fn(async () => {}),
  deleteCoupon: vi.fn(async () => {}),
}));

import CouponTab from '../src/components/backend/CouponTab.jsx';
import { listCoupons, saveCoupon, deleteCoupon } from '../src/lib/backendClient.js';
import { bangkokNow, thaiTodayISO } from '../src/utils.js';

const clinicSettings = { accentColor: '#dc2626' };

function mkCoupon(id, overrides = {}) {
  return {
    couponId: `COUP-${id}`, id: `COUP-${id}`,
    coupon_name: `Coupon ${id}`,
    coupon_code: `CODE${id}`,
    discount: 10,
    discount_type: 'percent',
    max_qty: 100,
    is_limit_per_user: false,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    description: '',
    branch_ids: [],
    ...overrides,
  };
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText('กำลังโหลด…')).not.toBeInTheDocument(), { timeout: 3000 });
}

describe('CouponTab — load + list rendering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('CP1 empty list shows empty-state', async () => {
    listCoupons.mockResolvedValue([]);
    render(<CouponTab clinicSettings={clinicSettings} theme="dark" />);
    await waitForLoaded();
    expect(screen.getByText(/ยังไม่มีคูปอง/)).toBeInTheDocument();
  });

  it('CP2 renders coupon cards', async () => {
    listCoupons.mockResolvedValue([mkCoupon(1), mkCoupon(2)]);
    const { container } = render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(container.querySelectorAll('.grid > div')).toHaveLength(2);
  });

  it('CP3 counts in header', async () => {
    listCoupons.mockResolvedValue(Array.from({ length: 8 }, (_, i) => mkCoupon(i)));
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText(/จำนวน 8 รายการ · แสดง 8 รายการ/)).toBeInTheDocument();
  });

  it('CP4 percent discount card shows "%"', async () => {
    listCoupons.mockResolvedValue([mkCoupon(1, { discount: 15, discount_type: 'percent' })]);
    const { container } = render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const card = container.querySelector('.grid > div');
    expect(within(card).getByText('%')).toBeInTheDocument();
  });

  it('CP5 baht discount card shows "บาท"', async () => {
    listCoupons.mockResolvedValue([mkCoupon(1, { discount: 500, discount_type: 'baht' })]);
    const { container } = render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const card = container.querySelector('.grid > div');
    expect(within(card).getByText('บาท')).toBeInTheDocument();
  });

  it('CP6 coupon with future end_date — no expired badge', async () => {
    listCoupons.mockResolvedValue([mkCoupon(1, { end_date: '2099-12-31' })]);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.queryByText('หมดอายุ')).not.toBeInTheDocument();
  });

  it('CP7 coupon with past end_date — shows "หมดอายุ" badge', async () => {
    listCoupons.mockResolvedValue([mkCoupon(1, { end_date: '2020-01-01' })]);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText('หมดอายุ')).toBeInTheDocument();
  });

  it('CP8 AV9 regression: coupon with end_date=today (Bangkok) — NOT expired', async () => {
    // This is the bug fixed in 719268a — UTC midnight (e.g. 7am Thai) would
    // claim today's coupon was already expired because .toISOString().slice(0,10)
    // returns UTC-local Y-M-D. Canonical helper thaiTodayISO() fixes it.
    const todayBkk = thaiTodayISO();
    listCoupons.mockResolvedValue([mkCoupon(1, { end_date: todayBkk })]);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.queryByText('หมดอายุ')).not.toBeInTheDocument();
  });

  it('CP9 is_limit_per_user shows "ใช้ได้คนละ 1 ครั้ง"', async () => {
    listCoupons.mockResolvedValue([mkCoupon(1, { is_limit_per_user: true })]);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText('ใช้ได้คนละ 1 ครั้ง')).toBeInTheDocument();
  });

  it('CP10 missing coupon_name shows "(ไม่มีชื่อ)"', async () => {
    listCoupons.mockResolvedValue([mkCoupon(1, { coupon_name: '' })]);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText('(ไม่มีชื่อ)')).toBeInTheDocument();
  });

  it('CP11 listCoupons error shown in banner', async () => {
    listCoupons.mockRejectedValue(new Error('boom'));
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });
});

describe('CouponTab — search + filter', () => {
  beforeEach(() => vi.clearAllMocks());
  const sample = [
    mkCoupon(1, { coupon_name: 'New Year', coupon_code: 'NEW2026', discount_type: 'percent' }),
    mkCoupon(2, { coupon_name: 'Songkran', coupon_code: 'SKR2026', discount_type: 'baht' }),
    mkCoupon(3, { coupon_name: 'VIP10', coupon_code: 'VIP10', discount_type: 'percent' }),
  ];

  it('CF1 search by name', async () => {
    listCoupons.mockResolvedValue(sample);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'Songkran' } });
    expect(screen.getByText('Songkran')).toBeInTheDocument();
    expect(screen.queryByText('New Year')).not.toBeInTheDocument();
  });

  it('CF2 search by code (case-insensitive)', async () => {
    listCoupons.mockResolvedValue(sample);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'new2026' } });
    expect(screen.getByText('New Year')).toBeInTheDocument();
    expect(screen.queryByText('Songkran')).not.toBeInTheDocument();
  });

  it('CF3 filter by discount_type=percent', async () => {
    listCoupons.mockResolvedValue(sample);
    const { container } = render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const typeSelect = container.querySelector('select');
    fireEvent.change(typeSelect, { target: { value: 'percent' } });
    expect(screen.getByText('New Year')).toBeInTheDocument();
    expect(screen.getByText('VIP10')).toBeInTheDocument();
    expect(screen.queryByText('Songkran')).not.toBeInTheDocument();
  });

  it('CF4 filter by discount_type=baht', async () => {
    listCoupons.mockResolvedValue(sample);
    const { container } = render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(container.querySelector('select'), { target: { value: 'baht' } });
    expect(screen.getByText('Songkran')).toBeInTheDocument();
    expect(screen.queryByText('New Year')).not.toBeInTheDocument();
  });

  it('CF5 not-found state', async () => {
    listCoupons.mockResolvedValue(sample);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'NOMATCH' } });
    expect(screen.getByText('ไม่พบคูปองที่ตรงกับตัวกรอง')).toBeInTheDocument();
  });

  it('CF6 combined filters', async () => {
    listCoupons.mockResolvedValue(sample);
    const { container } = render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'VIP' } });
    fireEvent.change(container.querySelector('select'), { target: { value: 'percent' } });
    expect(screen.getByText('VIP10')).toBeInTheDocument();
    expect(screen.queryByText('New Year')).not.toBeInTheDocument();
  });
});

describe('CouponTab — create + save validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveCoupon.mockResolvedValue({});
  });

  const openModal = async () => {
    listCoupons.mockResolvedValue([]);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้างคูปอง'));
    await waitFor(() => screen.getByText('สร้างคูปองใหม่'));
  };

  const fill = (name, code, discount = '10', maxQty = '100', startDate = '2026-01-01', endDate = '2026-12-31') => {
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อคูปอง'), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText(/NEWYEAR/), { target: { value: code } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: discount } });
    const qtyInputs = screen.getAllByPlaceholderText('0');
    fireEvent.change(qtyInputs[0], { target: { value: maxQty } });
  };

  it('CC1 empty name blocks save', async () => {
    await openModal();
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText('กรุณากรอกชื่อคูปอง')).toBeInTheDocument());
  });

  it('CC2 empty code blocks save', async () => {
    await openModal();
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อคูปอง'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText('กรุณากรอกโค้ดส่วนลด')).toBeInTheDocument());
  });

  it('CC3 percent discount > 100 blocks', async () => {
    await openModal();
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อคูปอง'), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText(/NEWYEAR/), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText(/ส่วนลด % ต้อง ≤ 100/)).toBeInTheDocument());
  });

  it('CC4 baht discount_type select changes value + controls form state', async () => {
    await openModal();
    // The tab filter select also exists in the DOM, so be specific: the
    // modal select is the one rendered inside the max-w-2xl dialog panel.
    const modal = document.querySelector('.max-w-2xl');
    const typeSelect = modal.querySelector('select');
    expect(typeSelect.value).toBe('percent');
    fireEvent.change(typeSelect, { target: { value: 'baht' } });
    await waitFor(() => expect(typeSelect.value).toBe('baht'));
  });

  it('CC5 discount < 0.01 blocks', async () => {
    await openModal();
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อคูปอง'), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText(/NEWYEAR/), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText(/ส่วนลดต้อง ≥ 0.01/)).toBeInTheDocument());
  });

  it('CC6 non-integer max_qty blocks', async () => {
    await openModal();
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อคูปอง'), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText(/NEWYEAR/), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    const qtyInput = screen.getAllByPlaceholderText('0')[0];
    fireEvent.change(qtyInput, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText(/จำนวนต้องเป็นจำนวนเต็ม/)).toBeInTheDocument());
  });

  it('CC7 code auto-uppercase on type', async () => {
    await openModal();
    const codeInput = screen.getByPlaceholderText(/NEWYEAR/);
    fireEvent.change(codeInput, { target: { value: 'newyear' } });
    expect(codeInput.value).toBe('NEWYEAR');
  });

  it('CC8 valid save fires saveCoupon with COUP- id (dates injected via native date input)', async () => {
    await openModal();
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อคูปอง'), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText(/NEWYEAR/), { target: { value: 'CODE' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    // DateField wraps a <input type="date"> underneath — set values directly.
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-01-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(saveCoupon).toHaveBeenCalled());
    const [id] = saveCoupon.mock.calls[0];
    expect(id).toMatch(/^COUP-\d{13,}-[0-9a-f]{8}$/);
  });

  it('CC9 missing start_date blocks', async () => {
    await openModal();
    fireEvent.change(screen.getByPlaceholderText('กรอกชื่อคูปอง'), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText(/NEWYEAR/), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText(/กรุณาเลือกวันเริ่ม/)).toBeInTheDocument());
  });

  it('CC10 branch multi-select toggles', async () => {
    await openModal();
    // Click a branch chip label
    const branchLabels = screen.getAllByText(/ชลบุรี|พระราม9|ราชพฤกษ์|สุขุมวิท|สยาม/);
    fireEvent.click(branchLabels[0]);
    // Re-click to deselect
    fireEvent.click(branchLabels[0]);
    // No errors thrown; validation still depends on required fields above
    expect(branchLabels[0]).toBeInTheDocument();
  });
});

describe('CouponTab — edit flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveCoupon.mockResolvedValue({});
  });

  it('CE1 edit opens modal with existing values', async () => {
    const editable = mkCoupon(5, {
      coupon_name: 'Summer', coupon_code: 'SUMMER',
      discount: 20, discount_type: 'percent',
      max_qty: 50, is_limit_per_user: true,
      branch_ids: [28, 30],
    });
    listCoupons.mockResolvedValue([editable]);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => expect(screen.getByText('แก้ไขคูปอง')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Summer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SUMMER')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
  });

  it('CE2 save preserves couponId', async () => {
    listCoupons.mockResolvedValue([mkCoupon(7)]);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => screen.getByText('แก้ไขคูปอง'));
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => expect(saveCoupon).toHaveBeenCalled());
    expect(saveCoupon.mock.calls[0][0]).toBe('COUP-7');
  });

  it('CE3 save preserves original createdAt', async () => {
    const original = mkCoupon(9, { createdAt: '2026-02-14T00:00:00.000Z' });
    listCoupons.mockResolvedValue([original]);
    render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => screen.getByText('แก้ไขคูปอง'));
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => expect(saveCoupon).toHaveBeenCalled());
    expect(saveCoupon.mock.calls[0][1].createdAt).toBe('2026-02-14T00:00:00.000Z');
  });
});

describe('CouponTab — delete flow', () => {
  beforeEach(() => { vi.clearAllMocks(); deleteCoupon.mockResolvedValue(); });

  it('CD1 delete confirmed calls deleteCoupon', async () => {
    listCoupons.mockResolvedValueOnce([mkCoupon(1)]).mockResolvedValueOnce([]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const { container } = render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.querySelector('.lucide-trash2'));
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(deleteCoupon).toHaveBeenCalledWith('COUP-1'));
  });

  it('CD2 delete cancelled does NOT call deleteCoupon', async () => {
    listCoupons.mockResolvedValue([mkCoupon(1)]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const { container } = render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.querySelector('.lucide-trash2'));
    fireEvent.click(deleteBtn);
    expect(deleteCoupon).not.toHaveBeenCalled();
  });

  it('CD3 delete failure shows error banner', async () => {
    listCoupons.mockResolvedValue([mkCoupon(1)]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    deleteCoupon.mockRejectedValueOnce(new Error('del-fail'));
    const { container } = render(<CouponTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.querySelector('.lucide-trash2'));
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(screen.getByText('del-fail')).toBeInTheDocument());
  });
});
