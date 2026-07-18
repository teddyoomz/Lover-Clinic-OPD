// TFP extraction step 3 (2026-07-19) — buy modal moved VERBATIM to
// treatment-form/TfpBuyModal.jsx. Money-critical surface (V13 whitelist ·
// V42 qty multiplier · V162 purchaseUid) → strictest extraction gates:
// the component must contain ZERO buy logic (openBuyModal / toggleBuyCheck /
// confirmBuyModal remain TFP closures, threaded as props) and the callsite
// keeps the {buyModalOpen && ...} mount model (V160).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TfpBuyModal } from '../src/components/treatment-form/TfpBuyModal.jsx';

const TFP = readFileSync(path.resolve(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf8');
const MODAL = readFileSync(path.resolve(process.cwd(), 'src/components/treatment-form/TfpBuyModal.jsx'), 'utf8');

const baseProps = () => ({
  isDark: true, inputCls: 'in', selectCls: 'sel',
  buyModalType: 'course', setBuyModalType: vi.fn(),
  buyQuery: '', setBuyQuery: vi.fn(),
  buySelectedCat: '', setBuySelectedCat: vi.fn(),
  buyCategories: { course: ['หมวด A'], promotion: [], product: [] },
  buyLoading: false,
  buyChecked: new Set(), setBuyChecked: vi.fn(),
  buyQtyMap: {}, setBuyQtyMap: vi.fn(),
  buyDiscMap: {}, setBuyDiscMap: vi.fn(),
  buyVatMap: {}, setBuyVatMap: vi.fn(),
  buyFilteredItems: [{ id: 'c1', name: 'คอร์ส ทดสอบ', price: 1000, unit: '' }],
  buyVisibleItems: [{ id: 'c1', name: 'คอร์ส ทดสอบ', price: 1000, unit: '' }],
  buyShowLimit: 50, setBuyShowLimit: vi.fn(),
  toggleBuyCheck: vi.fn(), openBuyModal: vi.fn(),
  confirmBuyModal: vi.fn(), setBuyModalOpen: vi.fn(),
});

describe('BM1 — TfpBuyModal RTL execution (real render, real handlers)', () => {
  it('BM1.1 renders header + item row + net price (1000.00, no disc/vat)', () => {
    render(<TfpBuyModal {...baseProps()} />);
    expect(screen.getByText('ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน')).toBeInTheDocument();
    expect(screen.getByText('คอร์ส ทดสอบ')).toBeInTheDocument();
    expect(screen.getAllByText('1000.00').length).toBeGreaterThanOrEqual(2); // unit price + net
  });

  it('BM1.2 checkbox toggle calls the TFP closure toggleBuyCheck with the item id', () => {
    const p = baseProps();
    render(<TfpBuyModal {...p} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(p.toggleBuyCheck).toHaveBeenCalledWith('c1');
  });

  it('BM1.3 ยืนยัน disabled at 0 checked; enabled + calls confirmBuyModal when checked', () => {
    const p0 = baseProps();
    render(<TfpBuyModal {...p0} />);
    const confirm0 = screen.getByText('ยืนยัน');
    expect(confirm0).toBeDisabled();
    fireEvent.click(confirm0);
    expect(p0.confirmBuyModal).not.toHaveBeenCalled();

    const p1 = { ...baseProps(), buyChecked: new Set(['c1']) };
    render(<TfpBuyModal {...p1} />);
    const confirm1 = screen.getAllByText('ยืนยัน')[1];
    expect(confirm1).not.toBeDisabled();
    fireEvent.click(confirm1);
    expect(p1.confirmBuyModal).toHaveBeenCalledTimes(1);
  });

  it('BM1.4 type switch resets selection state + re-fetches via openBuyModal (Phase 17.2-quinquies)', () => {
    const p = baseProps();
    render(<TfpBuyModal {...p} />);
    fireEvent.change(screen.getByDisplayValue('คอร์ส'), { target: { value: 'promotion' } });
    expect(p.setBuyModalType).toHaveBeenCalledWith('promotion');
    expect(p.setBuyChecked).toHaveBeenCalled();
    expect(p.openBuyModal).toHaveBeenCalledWith('promotion');
  });

  it('BM1.5 ยกเลิก + ESC close via setBuyModalOpen(false); backdrop click does NOT close (AV78)', () => {
    const p = baseProps();
    const { container } = render(<TfpBuyModal {...p} />);
    fireEvent.click(container.querySelector('[role="dialog"]'));
    expect(p.setBuyModalOpen).not.toHaveBeenCalled(); // backdrop = no-op
    fireEvent.click(screen.getByText('ยกเลิก'));
    expect(p.setBuyModalOpen).toHaveBeenCalledWith(false);
    fireEvent.keyDown(container.querySelector('[role="dialog"]'), { key: 'Escape' });
    expect(p.setBuyModalOpen).toHaveBeenCalledTimes(2);
  });

  it('BM1.6 net-price math verbatim: disc + VAT per unit (1000 - 100 = 900 × 1.07 = 963.00)', () => {
    const p = { ...baseProps(), buyDiscMap: { c1: '100' }, buyVatMap: { c1: true } };
    render(<TfpBuyModal {...p} />);
    expect(screen.getByText('963.00')).toBeInTheDocument();
  });

  it('BM1.7 load-more appears only when buyShowLimit < filtered length + bumps by 50', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `x${i}`, name: `รายการ ${i}`, price: 1 }));
    const p = { ...baseProps(), buyFilteredItems: many, buyVisibleItems: many.slice(0, 50), buyShowLimit: 50 };
    render(<TfpBuyModal {...p} />);
    fireEvent.click(screen.getByText('โหลดเพิ่ม +50'));
    expect(p.setBuyShowLimit).toHaveBeenCalled();
  });
});

describe('BM2 — extraction source-grep locks', () => {
  it('BM2.1 the modal JSX left TFP (dialog id lives ONLY in TfpBuyModal)', () => {
    expect(TFP).not.toMatch(/modal-title-treat-buy/);
    expect(MODAL).toMatch(/modal-title-treat-buy/);
  });

  it('BM2.2 TFP callsite keeps the mount model + threads every prop explicitly', () => {
    const i = TFP.indexOf('{buyModalOpen && (');
    expect(i).toBeGreaterThan(-1);
    const w = TFP.slice(i, i + 1400);
    expect(w).toMatch(/<TfpBuyModal/);
    for (const prop of [
      'buyModalType', 'setBuyModalType', 'buyQuery', 'setBuyQuery',
      'buySelectedCat', 'setBuySelectedCat', 'buyCategories', 'buyLoading',
      'buyChecked', 'setBuyChecked', 'buyQtyMap', 'setBuyQtyMap',
      'buyDiscMap', 'setBuyDiscMap', 'buyVatMap', 'setBuyVatMap',
      'buyFilteredItems', 'buyVisibleItems', 'buyShowLimit', 'setBuyShowLimit',
      'toggleBuyCheck', 'openBuyModal', 'confirmBuyModal', 'setBuyModalOpen',
    ]) {
      expect(w, `callsite must thread ${prop}`).toMatch(new RegExp(`${prop}=\\{${prop}\\}`));
    }
  });

  it('BM2.3 buy LOGIC stays in TFP (component carries zero business logic)', () => {
    // the money-path closures remain TFP-defined
    expect(TFP).toMatch(/const openBuyModal = async/);
    expect(TFP).toMatch(/const confirmBuyModal = \(\)/);
    // the component never imports backend/data layers
    expect(MODAL).not.toMatch(/scopedDataLayer|backendClient|treatmentBuyHelpers/);
  });

  it('BM2.4 AV78 + AV205 preserved verbatim in the moved JSX', () => {
    expect(MODAL).toMatch(/AV78 \(EOD8\): backdrop click does NOT close/);
    expect(MODAL).toMatch(/<ModalScrollLock \/>/);
    expect(MODAL).toMatch(/overflow-y-auto overscroll-contain/);
  });
});
