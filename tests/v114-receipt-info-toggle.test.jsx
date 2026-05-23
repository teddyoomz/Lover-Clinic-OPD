// V114 (2026-05-23 EOD+1 LATE+2) — Receipt-info toggle in preview header.
//
// Test layers:
//   H1-H6   — useReceiptInfoToggle hook unit (default OFF, localStorage R/W,
//             cross-tab storage event, type coercion, private-mode graceful)
//   SG1-SG6 — Source-grep regression locks at SalePrintView + QuotationPrintView
//   R1-R10  — RTL render: switch toggle, compact HN+phone, block conditional,
//             no-phone edge, a11y (role=switch + aria-checked)
//   F1-F3   — Rule I cross-view flow-simulate: Sale ↔ Quotation shared state
//             via single localStorage key (Q5=A)
//
// Spec: docs/superpowers/specs/2026-05-23-receipt-info-toggle-design.html
// Plan: docs/superpowers/plans/2026-05-23-receipt-info-toggle.html
// Parent: V111 + V112-A + V113 + V113-C (AV111 + AV112 + AV113 all stay valid;
// V114 is additive UI over V113-C).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useReceiptInfoToggle } from '../src/hooks/useReceiptInfoToggle.js';

const STORAGE_KEY = 'lover_receipt_show_address';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ───────────────────────────────────────────────────────────────────────────
// V114.H — useReceiptInfoToggle hook unit tests
// ───────────────────────────────────────────────────────────────────────────

describe('V114.H — useReceiptInfoToggle hook', () => {
  beforeEach(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  });

  it('H1: defaults to false when localStorage empty (Q3=B PDPA-friendly)', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(false);
  });

  it('H2: reads existing "true" from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(true);
  });

  it('H2b: reads existing "false" from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(false);
  });

  it('H3: setShowAddress(true) persists "true" to localStorage', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => result.current.setShowAddress(true));
    expect(result.current.showAddress).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('H3b: setShowAddress(false) persists "false" to localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => result.current.setShowAddress(false));
    expect(result.current.showAddress).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('H4: cross-tab storage event updates state', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(false);
    act(() => {
      localStorage.setItem(STORAGE_KEY, 'true');
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'true' }));
    });
    expect(result.current.showAddress).toBe(true);
  });

  it('H4b: storage event for UNRELATED key does NOT affect state', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'some_other_key', newValue: 'whatever' }));
    });
    expect(result.current.showAddress).toBe(false);
  });

  it('H5: invalid localStorage value falls back to default false', () => {
    localStorage.setItem(STORAGE_KEY, 'garbage');
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(false);
  });

  it('H6: setShowAddress coerces truthy non-bool to boolean true', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => result.current.setShowAddress(1));
    expect(result.current.showAddress).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('H6b: setShowAddress coerces falsy to boolean false', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => result.current.setShowAddress(true));
    act(() => result.current.setShowAddress(null));
    expect(result.current.showAddress).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('H6c: localStorage throw (private mode) — set still updates in-memory state', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceeded'); };
    try {
      act(() => result.current.setShowAddress(true));
      expect(result.current.showAddress).toBe(true); // in-memory state still updated
    } finally {
      Storage.prototype.setItem = origSet;
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// V114.SG — SalePrintView source-grep regression locks
// ───────────────────────────────────────────────────────────────────────────

const SALE_PRINT_VIEW_PATH = path.resolve(__dirname, '../src/components/backend/SalePrintView.jsx');
const SALE_SRC = fs.readFileSync(SALE_PRINT_VIEW_PATH, 'utf8');

describe('V114.SG — SalePrintView source-grep', () => {
  it('SG1: imports useReceiptInfoToggle from hooks', () => {
    expect(SALE_SRC).toMatch(/import\s*\{\s*useReceiptInfoToggle\s*\}\s*from\s*['"][.\/]*hooks\/useReceiptInfoToggle(\.js)?['"]/);
  });

  it('SG1b: calls the hook in the component body', () => {
    expect(SALE_SRC).toMatch(/const\s*\{\s*showAddress\s*,\s*setShowAddress\s*\}\s*=\s*useReceiptInfoToggle\s*\(\s*\)/);
  });

  it('SG2: receipt-info block conditional gated on showAddress', () => {
    // The existing V113-C block conditional must be wrapped so the FULL
    // block only renders when showAddress is true.
    expect(SALE_SRC).toMatch(/showAddress\s*&&[\s\S]{0,200}mergedReceiptInfo\.taxId/);
  });

  it('SG2b: HN line appends phone when !showAddress and phone exists', () => {
    // Compact mode: HN line gets " · โทร. <phone>" appended.
    expect(SALE_SRC).toMatch(/!showAddress[\s\S]{0,160}โทร\./);
  });

  it('SG3: switch wrapper sits inside the print:hidden sticky header (role=switch + aria-checked)', () => {
    const headerStart = SALE_SRC.indexOf('print:hidden sticky');
    expect(headerStart).toBeGreaterThan(-1);
    const headerEndApprox = SALE_SRC.indexOf('sale-print-surface');
    const headerBlock = SALE_SRC.slice(headerStart, headerEndApprox);
    expect(headerBlock).toMatch(/role=['"]switch['"]/);
    expect(headerBlock).toMatch(/aria-checked/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// V114.R — SalePrintView RTL render
// Sale shape mirrors V113 tests (s.saleId / s.items.courses / s.billing /
// s.payment / s.receiptInfo). Mocks scopedDataLayer + BranchContext per
// the established V113 pattern.
// ───────────────────────────────────────────────────────────────────────────

const FAKE_SALE_V114 = {
  saleId: 'INV-TEST-V114',
  customerId: 'cust-v114',
  customerName: 'นาย นิรุต ชำนาญปรุ',
  customerHN: 'LC-26000074',
  items: { courses: [], products: [], promotions: [], medications: [] },
  billing: { netTotal: 0 },
  payment: { status: 'paid' },
  receiptInfo: {
    type: 'personal',
    name: 'นาย นิรุต ชำนาญปรุ',
    taxId: '3309901263672',
    address: '369 ถนนสืบศิริ',
    phone: '0989149195',
  },
};

describe('V114.R — SalePrintView RTL render', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch {}
    vi.resetModules();
    vi.doMock('../src/lib/scopedDataLayer.js', () => ({
      getCourse: vi.fn().mockResolvedValue(null),
      getCustomer: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock('../src/lib/BranchContext.jsx', () => ({
      useEffectiveClinicSettings: () => ({ clinicName: 'Lover Clinic', branchName: 'นครราชสีมา', accentColor: '#dc2626' }),
    }));
  });
  afterEach(() => { cleanup(); vi.doUnmock('../src/lib/scopedDataLayer.js'); vi.doUnmock('../src/lib/BranchContext.jsx'); });

  it('R1: default OFF — renders compact HN · โทร. line, hides full block', async () => {
    const { default: SalePrintView } = await import('../src/components/backend/SalePrintView.jsx');
    render(<SalePrintView sale={FAKE_SALE_V114} onClose={() => {}} />);
    // Compact: HN + middle-dot + phone in a single line
    expect(screen.getByText(/HN LC-26000074.*·.*โทร\.\s*0989149195/)).toBeTruthy();
    // Full block NOT rendered (taxId hidden)
    expect(screen.queryByText(/เลขประจำตัวผู้เสียภาษี/)).toBeFalsy();
  });

  it('R2: click switch → toggles ON → full block appears, HN line drops phone', async () => {
    const { default: SalePrintView } = await import('../src/components/backend/SalePrintView.jsx');
    render(<SalePrintView sale={FAKE_SALE_V114} onClose={() => {}} />);
    const sw = screen.getByTestId('receipt-info-toggle-sale');
    fireEvent.click(sw);
    expect(screen.getByText(/เลขประจำตัวผู้เสียภาษี:\s*3309901263672/)).toBeTruthy();
    expect(screen.getByText(/369 ถนนสืบศิริ/)).toBeTruthy();
    // HN line: no " · โทร." trailing
    expect(screen.getByText('HN LC-26000074')).toBeTruthy();
  });

  it('R3: click switch again → back to OFF → compact returns', async () => {
    const { default: SalePrintView } = await import('../src/components/backend/SalePrintView.jsx');
    render(<SalePrintView sale={FAKE_SALE_V114} onClose={() => {}} />);
    const sw = screen.getByTestId('receipt-info-toggle-sale');
    fireEvent.click(sw); // ON
    fireEvent.click(sw); // OFF
    expect(screen.getByText(/HN LC-26000074.*·.*โทร\.\s*0989149195/)).toBeTruthy();
    expect(screen.queryByText(/เลขประจำตัวผู้เสียภาษี/)).toBeFalsy();
  });

  it('R4: edge case — no phone → HN alone (no trailing dot, no "โทร." label)', async () => {
    const { default: SalePrintView } = await import('../src/components/backend/SalePrintView.jsx');
    const SALE_NO_PHONE = {
      ...FAKE_SALE_V114,
      receiptInfo: { ...FAKE_SALE_V114.receiptInfo, phone: '' },
    };
    render(<SalePrintView sale={SALE_NO_PHONE} onClose={() => {}} />);
    // OFF mode + no phone → HN line is bare; NO middle-dot, NO "โทร." label
    const hnText = screen.getByText('HN LC-26000074');
    expect(hnText.textContent).not.toMatch(/·/);
    expect(hnText.textContent).not.toMatch(/โทร\./);
  });

  it('R5: a11y — switch has role=switch, aria-checked reflects state', async () => {
    const { default: SalePrintView } = await import('../src/components/backend/SalePrintView.jsx');
    render(<SalePrintView sale={FAKE_SALE_V114} onClose={() => {}} />);
    const sw = screen.getByRole('switch', { name: /ที่อยู่/ });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });
});
