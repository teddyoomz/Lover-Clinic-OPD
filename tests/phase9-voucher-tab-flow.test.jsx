// ─── Phase 9 — VoucherTab integration flow tests ───────────────────────────
// Covers CRUD, platform filter, commission boundary, period toggle, edit-mode.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../src/lib/backendClient.js', () => ({
  listVouchers: vi.fn(),
  saveVoucher: vi.fn(async () => {}),
  deleteVoucher: vi.fn(async () => {}),
}));

import VoucherTab from '../src/components/backend/VoucherTab.jsx';
import { listVouchers, saveVoucher, deleteVoucher } from '../src/lib/backendClient.js';
import { VOUCHER_PLATFORMS } from '../src/lib/voucherValidation.js';

const clinicSettings = { accentColor: '#dc2626' };

function mkVoucher(id, overrides = {}) {
  return {
    voucherId: `VOUC-${id}`, id: `VOUC-${id}`,
    usage_type: 'clinic',
    voucher_name: `Voucher ${id}`,
    sale_price: 1500,
    commission_percent: 10,
    platform: 'HDmall',
    has_period: false,
    description: '',
    status: 'active',
    ...overrides,
  };
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText('กำลังโหลด…')).not.toBeInTheDocument(), { timeout: 3000 });
}

describe('VoucherTab — load + list rendering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('VP1 empty state', async () => {
    listVouchers.mockResolvedValue([]);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText(/ยังไม่มี Voucher/)).toBeInTheDocument();
  });

  it('VP2 renders voucher cards', async () => {
    listVouchers.mockResolvedValue([mkVoucher(1), mkVoucher(2)]);
    const { container } = render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(container.querySelectorAll('.grid > div')).toHaveLength(2);
  });

  it('VP3 counts header', async () => {
    listVouchers.mockResolvedValue(Array.from({ length: 9 }, (_, i) => mkVoucher(i)));
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText(/จำนวน 9 รายการ · แสดง 9 รายการ/)).toBeInTheDocument();
  });

  it('VP4 platform badge shows on card', async () => {
    listVouchers.mockResolvedValue([mkVoucher(1, { platform: 'GoWabi' })]);
    const { container } = render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const card = container.querySelector('.grid > div');
    expect(within(card).getByText('GoWabi')).toBeInTheDocument();
  });

  it('VP5 no platform → no badge', async () => {
    listVouchers.mockResolvedValue([mkVoucher(1, { platform: '' })]);
    const { container } = render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const card = container.querySelector('.grid > div');
    // No platform chip
    expect(within(card).queryByText(/HDmall|GoWabi|SkinX|Shopee|TikTok/)).not.toBeInTheDocument();
  });

  it('VP6 period shows when has_period + dates set', async () => {
    listVouchers.mockResolvedValue([mkVoucher(1, { has_period: true, period_start: '2026-06-01', period_end: '2026-06-30' })]);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText(/2026-06-01 — 2026-06-30/)).toBeInTheDocument();
  });

  it('VP7 sale_price formatted th-TH', async () => {
    listVouchers.mockResolvedValue([mkVoucher(1, { sale_price: 2500 })]);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText('2,500')).toBeInTheDocument();
  });

  it('VP8 missing voucher_name → "(ไม่มีชื่อ)"', async () => {
    listVouchers.mockResolvedValue([mkVoucher(1, { voucher_name: '' })]);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText('(ไม่มีชื่อ)')).toBeInTheDocument();
  });

  it('VP9 error banner on list failure', async () => {
    listVouchers.mockRejectedValue(new Error('net-err'));
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitFor(() => expect(screen.getByText('net-err')).toBeInTheDocument());
  });

  it('VP10 commission % shown in card', async () => {
    listVouchers.mockResolvedValue([mkVoucher(1, { commission_percent: 17 })]);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    expect(screen.getByText(/ค่าธรรมเนียม 17%/)).toBeInTheDocument();
  });
});

describe('VoucherTab — search + filter', () => {
  beforeEach(() => vi.clearAllMocks());
  const sample = [
    mkVoucher(1, { voucher_name: 'HDmall Summer', platform: 'HDmall' }),
    mkVoucher(2, { voucher_name: 'GoWabi Winter', platform: 'GoWabi' }),
    mkVoucher(3, { voucher_name: 'SkinX Package', platform: 'SkinX' }),
  ];

  it('VF1 search by name', async () => {
    listVouchers.mockResolvedValue(sample);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'GoWabi' } });
    expect(screen.getByText('GoWabi Winter')).toBeInTheDocument();
    expect(screen.queryByText('HDmall Summer')).not.toBeInTheDocument();
  });

  it('VF2 platform filter', async () => {
    listVouchers.mockResolvedValue(sample);
    const { container } = render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const platformSelect = container.querySelector('select');
    fireEvent.change(platformSelect, { target: { value: 'HDmall' } });
    expect(screen.getByText('HDmall Summer')).toBeInTheDocument();
    expect(screen.queryByText('GoWabi Winter')).not.toBeInTheDocument();
  });

  it('VF3 platform filter + search combined', async () => {
    listVouchers.mockResolvedValue(sample);
    const { container } = render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'Winter' } });
    fireEvent.change(container.querySelector('select'), { target: { value: 'GoWabi' } });
    expect(screen.getByText('GoWabi Winter')).toBeInTheDocument();
  });

  it('VF4 not-found state', async () => {
    listVouchers.mockResolvedValue(sample);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อ/), { target: { value: 'NONE' } });
    expect(screen.getByText('ไม่พบ Voucher')).toBeInTheDocument();
  });

  it('VF5 platform dropdown lists all VOUCHER_PLATFORMS', async () => {
    listVouchers.mockResolvedValue([]);
    const { container } = render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const options = Array.from(container.querySelector('select').options).map(o => o.value);
    for (const p of VOUCHER_PLATFORMS) expect(options).toContain(p);
  });
});

describe('VoucherTab — create + validate', () => {
  beforeEach(() => { vi.clearAllMocks(); saveVoucher.mockResolvedValue({}); });

  const openModal = async () => {
    listVouchers.mockResolvedValue([]);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('สร้าง Voucher'));
    await waitFor(() => screen.getByText('สร้าง Voucher ใหม่'));
  };

  it('VC1 empty name blocks save', async () => {
    await openModal();
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText('กรุณากรอกชื่อ Voucher')).toBeInTheDocument());
  });

  it('VC2 negative sale_price blocks', async () => {
    await openModal();
    fireEvent.change(screen.getByPlaceholderText(/กรอกชื่อ Voucher/), { target: { value: 'X' } });
    const saleInput = screen.getAllByPlaceholderText('0.00')[0];
    fireEvent.change(saleInput, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText(/ราคาขายต้อง ≥ 0/)).toBeInTheDocument());
  });

  it('VC3 commission > 100 blocks', async () => {
    await openModal();
    fireEvent.change(screen.getByPlaceholderText(/กรอกชื่อ Voucher/), { target: { value: 'X' } });
    const saleInput = screen.getAllByPlaceholderText('0.00')[0];
    fireEvent.change(saleInput, { target: { value: '1000' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(screen.getByText(/ค่าธรรมเนียมต้อง ≤ 100/)).toBeInTheDocument());
  });

  it('VC4 valid save fires saveVoucher with VOUC- id', async () => {
    await openModal();
    fireEvent.change(screen.getByPlaceholderText(/กรอกชื่อ Voucher/), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: /^สร้าง$/ }));
    await waitFor(() => expect(saveVoucher).toHaveBeenCalled());
    const [id] = saveVoucher.mock.calls[0];
    expect(id).toMatch(/^VOUC-\d{13,}-[0-9a-f]{8}$/);
  });

  it('VC5 period toggle shows DateField', async () => {
    await openModal();
    expect(screen.queryByText('วันเริ่ม')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('กำหนดช่วงเวลา'));
    await waitFor(() => expect(screen.getByText('วันเริ่ม')).toBeInTheDocument());
  });

  it('VC6 cancel button closes modal', async () => {
    await openModal();
    fireEvent.click(screen.getByText('ยกเลิก'));
    await waitFor(() => expect(screen.queryByText('สร้าง Voucher ใหม่')).not.toBeInTheDocument());
    expect(saveVoucher).not.toHaveBeenCalled();
  });

  it('VC7 ESC closes modal', async () => {
    await openModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('สร้าง Voucher ใหม่')).not.toBeInTheDocument());
  });

  it('VC8 usage_type radio toggles clinic ↔ branch', async () => {
    await openModal();
    const branchRadio = screen.getByLabelText('ระดับสาขา');
    fireEvent.click(branchRadio);
    expect(branchRadio.checked).toBe(true);
  });

  it('VC9 platform dropdown includes all 6', async () => {
    await openModal();
    const modal = document.querySelector('.max-w-2xl');
    const platformSelect = modal.querySelector('select');
    const options = Array.from(platformSelect.options).map(o => o.textContent);
    for (const p of VOUCHER_PLATFORMS) expect(options).toContain(p);
  });
});

describe('VoucherTab — edit + delete', () => {
  beforeEach(() => { vi.clearAllMocks(); saveVoucher.mockResolvedValue({}); deleteVoucher.mockResolvedValue(); });

  it('VE1 edit opens with existing values', async () => {
    listVouchers.mockResolvedValue([mkVoucher(5, { voucher_name: 'Big Sale', sale_price: 3000, platform: 'Shopee' })]);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => expect(screen.getByText('แก้ไข Voucher')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Big Sale')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3000')).toBeInTheDocument();
  });

  it('VE2 edit preserves voucherId', async () => {
    listVouchers.mockResolvedValue([mkVoucher(7)]);
    render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    fireEvent.click(screen.getByText('แก้ไข'));
    await waitFor(() => screen.getByText('แก้ไข Voucher'));
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => expect(saveVoucher).toHaveBeenCalled());
    expect(saveVoucher.mock.calls[0][0]).toBe('VOUC-7');
  });

  it('VD1 delete confirmed', async () => {
    listVouchers.mockResolvedValueOnce([mkVoucher(1)]).mockResolvedValueOnce([]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const { container } = render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.querySelector('.lucide-trash2'));
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(deleteVoucher).toHaveBeenCalledWith('VOUC-1'));
  });

  it('VD2 delete cancelled', async () => {
    listVouchers.mockResolvedValue([mkVoucher(1)]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const { container } = render(<VoucherTab clinicSettings={clinicSettings} />);
    await waitForLoaded();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(b => b.querySelector('.lucide-trash2'));
    fireEvent.click(deleteBtn);
    expect(deleteVoucher).not.toHaveBeenCalled();
  });
});
