// ─── TFP buy-modal keystroke isolation (#20, 2026-07-19 EOD+2) ─────────────
// K1 source-grep: the view-filter state (query/cat/limit + filter memo) lives
// in TfpBuyModal, with ZERO code references left in TreatmentFormPage — a
// search keystroke can no longer re-render the 5.3k-line money form.
// K2 RTL (standalone modal): typing filters · type-switch resets · load-more.
// K3 anti-regression: money handlers stay prop-calls into TFP (V13/V42/V162).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';
import { TfpBuyModal } from '../src/components/treatment-form/TfpBuyModal.jsx';

const ROOT = path.resolve(__dirname, '..');
const tfp = readFileSync(path.join(ROOT, 'src', 'components', 'TreatmentFormPage.jsx'), 'utf8');
const modal = readFileSync(path.join(ROOT, 'src', 'components', 'treatment-form', 'TfpBuyModal.jsx'), 'utf8');

describe('K1 — state ownership (source-grep locks)', () => {
  it('K1.1 TFP carries ZERO code references to the moved view-filter state', () => {
    expect(tfp).not.toMatch(/const \[buyQuery/);
    expect(tfp).not.toMatch(/const \[buySelectedCat/);
    expect(tfp).not.toMatch(/const \[buyShowLimit/);
    expect(tfp).not.toMatch(/setBuyQuery\(/);
    expect(tfp).not.toMatch(/setBuySelectedCat\(/);
    expect(tfp).not.toMatch(/setBuyShowLimit\(/);
    expect(tfp).not.toMatch(/buyQuery=\{/);
    expect(tfp).not.toMatch(/buyFilteredItems=\{/);
    expect(tfp).not.toMatch(/buyVisibleItems[.=]/);
  });
  it('K1.2 TfpBuyModal owns the state + verbatim filter memo + type-switch reset effect', () => {
    expect(modal).toMatch(/const \[buyQuery, setBuyQuery\] = useState\(''\)/);
    expect(modal).toMatch(/const \[buySelectedCat, setBuySelectedCat\] = useState\(''\)/);
    expect(modal).toMatch(/const \[buyShowLimit, setBuyShowLimit\] = useState\(50\)/);
    expect(modal).toMatch(/buyItems\[buyModalType\] \|\| \[\]/);
    expect(modal).toMatch(/i\.name\.toLowerCase\(\)\.includes\(q\)/);
    expect(modal).toMatch(/useEffect\(\(\) => \{\s*setBuyQuery\(''\);\s*setBuySelectedCat\(''\);\s*setBuyShowLimit\(50\);\s*\}, \[buyModalType\]\)/);
  });
  it('K1.3 TFP callsite passes buyItems (not pre-filtered lists) + money state stays TFP-threaded', () => {
    expect(tfp).toMatch(/buyItems=\{buyItems\}/);
    expect(tfp).toMatch(/buyChecked=\{buyChecked\}/);
    expect(tfp).toMatch(/confirmBuyModal=\{confirmBuyModal\}/);
    // openBuyModal must NOT have dangling view-filter resets (they'd be
    // ReferenceErrors now — the V163 build-invisible class)
    const openFn = tfp.slice(tfp.indexOf('const openBuyModal'), tfp.indexOf('const openBuyModal') + 1200);
    expect(openFn).not.toMatch(/setBuyQuery|setBuySelectedCat|setBuyShowLimit/);
    expect(openFn).toMatch(/setBuyChecked\(new Set\(\)\)/); // money resets stay
  });
});

const ITEMS_60 = Array.from({ length: 60 }, (_, i) => ({
  id: `P${i}`, name: i === 0 ? 'Botox พิเศษ' : `สินค้า ${i}`, price: 100 + i,
  unit: 'ชิ้น', category: i % 2 ? 'หมวด A' : 'หมวด B',
}));
const baseProps = () => ({
  isDark: false, inputCls: 'inp', selectCls: 'sel',
  buyModalType: 'course', setBuyModalType: vi.fn(),
  buyItems: { course: ITEMS_60, promotion: [], product: [] },
  buyCategories: { course: ['หมวด A', 'หมวด B'], promotion: [], product: [] },
  buyLoading: false,
  buyChecked: new Set(), setBuyChecked: vi.fn(),
  buyQtyMap: {}, setBuyQtyMap: vi.fn(),
  buyDiscMap: {}, setBuyDiscMap: vi.fn(),
  buyVatMap: {}, setBuyVatMap: vi.fn(),
  toggleBuyCheck: vi.fn(), openBuyModal: vi.fn(),
  confirmBuyModal: vi.fn(), setBuyModalOpen: vi.fn(),
});

describe('K2 — standalone modal behavior (RTL)', () => {
  it('K2.1 typing in the search box filters the list (modal-internal state)', () => {
    render(<TfpBuyModal {...baseProps()} />);
    expect(screen.getByText(/รายการ \(60 รายการ\)/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('ค้นหาด้วยชื่อ'), { target: { value: 'Botox' } });
    expect(screen.getByText(/รายการ \(1 รายการ\)/)).toBeTruthy();
    expect(screen.getByText('Botox พิเศษ')).toBeTruthy();
  });
  it('K2.2 type switch (prop change) resets the query via the [buyModalType] effect', () => {
    const props = baseProps();
    const { rerender } = render(<TfpBuyModal {...props} />);
    const input = screen.getByPlaceholderText('ค้นหาด้วยชื่อ');
    fireEvent.change(input, { target: { value: 'Botox' } });
    expect(input.value).toBe('Botox');
    rerender(<TfpBuyModal {...props} buyModalType="promotion" />);
    expect(screen.getByPlaceholderText('ค้นหาด้วยชื่อ').value).toBe(''); // reset — pre-#20 openBuyModal semantics preserved
  });
  it('K2.3 50-cap + โหลดเพิ่ม +50 works from modal-internal buyShowLimit', () => {
    render(<TfpBuyModal {...baseProps()} />);
    expect(screen.getByText(/แสดง 50\/60/)).toBeTruthy();
    fireEvent.click(screen.getByText('โหลดเพิ่ม +50'));
    expect(screen.getByText(/แสดง 60\/60/)).toBeTruthy();
    expect(screen.queryByText('โหลดเพิ่ม +50')).toBeNull();
  });
  it('K2.4 category pick narrows the list (sidebar state modal-internal)', () => {
    render(<TfpBuyModal {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'หมวด A' }));
    expect(screen.getByText(/รายการ \(30 รายการ\)/)).toBeTruthy();
  });
});

describe('K3 — money contract untouched (anti-regression)', () => {
  it('K3.1 ยืนยัน disabled with empty selection; enabled selection calls the TFP confirmBuyModal prop', () => {
    const props = baseProps();
    const { rerender } = render(<TfpBuyModal {...props} />);
    const confirm = screen.getByText('ยืนยัน');
    expect(confirm.disabled).toBe(true);
    rerender(<TfpBuyModal {...props} buyChecked={new Set(['P0'])} />);
    fireEvent.click(screen.getByText('ยืนยัน'));
    expect(props.confirmBuyModal).toHaveBeenCalledTimes(1);
  });
  it('K3.2 row checkbox routes to the TFP toggleBuyCheck prop (money state stays in TFP)', () => {
    const props = baseProps();
    render(<TfpBuyModal {...props} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(props.toggleBuyCheck).toHaveBeenCalledWith('P0');
  });
  it('K3.3 type switch still triggers the TFP re-fetch (openBuyModal prop)', () => {
    const props = baseProps();
    render(<TfpBuyModal {...props} />);
    fireEvent.change(screen.getByDisplayValue('คอร์ส'), { target: { value: 'promotion' } });
    expect(props.setBuyModalType).toHaveBeenCalledWith('promotion');
    expect(props.openBuyModal).toHaveBeenCalledWith('promotion');
  });
});
