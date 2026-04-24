// ─── SalePrintView — grouped vs legacy-flat items regression ───────────────
// Phase 14.x (2026-04-24): SalePrintView previously assumed `sale.items` was
// a flat array and called `.map()` on it. After the Phase 14 converter fix
// produced the canonical GROUPED shape ({promotions, courses, products,
// medications}), `.map` on an object threw TypeError and crashed the
// print preview immediately after convert → print flow. These tests pin
// both shapes so the reader doesn't regress.
//
// User report that triggered this: "แปลงเป็นใบขายล่าสุดแล้วเปิดใบขาย
// ไม่ได้เลยจ้าาา" (commit d56b5cf reverted the broken writer; this suite
// guards the FIXED writer + reader pair going forward).

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';

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

import SalePrintView from '../src/components/backend/SalePrintView.jsx';

const groupedSale = {
  saleId: 'INV-20260424-0001',
  saleDate: '2026-04-24',
  customerName: 'สมชาย',
  items: {
    promotions: [
      { promotionId: 'PR1', name: 'Combo', qty: 1, unitPrice: 1500, itemType: 'promotion' },
    ],
    courses: [
      { courseId: 'C1', name: 'Laser', qty: 1, unitPrice: 1000, itemType: 'course' },
    ],
    products: [
      { productId: 'P1', name: 'Cream', qty: 2, unitPrice: 500, itemType: 'product' },
      { productId: 'M1', name: 'Paracetamol', qty: 1, unitPrice: 30, itemType: 'product', isTakeaway: true,
        medication: { genericName: 'Acetaminophen', dosageUnit: 'เม็ด', timesPerDay: '3' } },
    ],
    medications: [],
  },
  billing: { subtotal: 4030, netTotal: 4030 },
  totalPaidAmount: 0,
  status: 'draft',
};

const flatSale = {
  saleId: 'INV-LEGACY-0001',
  saleDate: '2026-04-20',
  customerName: 'LegacyCustomer',
  items: [
    { courseId: 'C1', courseName: 'Legacy Laser', qty: 1, price: 2500 },
    { productId: 'M1', productName: 'Legacy Med', qty: 1, price: 100, isTakeaway: true,
      medication: { genericName: 'x', dosageAmount: '1' } },
  ],
  billing: { subtotal: 2600, netTotal: 2600 },
  status: 'draft',
};

describe('SalePrintView — grouped-items shape (Phase 14.x canonical)', () => {
  it('SPV1: renders without crash when items is a GROUPED object', () => {
    const { baseElement } = render(
      <SalePrintView sale={groupedSale} clinicSettings={{}} onClose={() => {}} />
    );
    expect(baseElement.querySelector('[data-testid="sale-print-overlay"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-testid="sale-print-surface"]')).toBeTruthy();
  });

  it('SPV2: lists every item across all 4 buckets (promotion + course + product + takeaway med)', () => {
    const { baseElement } = render(
      <SalePrintView sale={groupedSale} clinicSettings={{}} onClose={() => {}} />
    );
    const html = baseElement.textContent || '';
    expect(html).toContain('Combo');           // promotion
    expect(html).toContain('Laser');           // course
    expect(html).toContain('Cream');           // regular product
    expect(html).toContain('Paracetamol');     // takeaway med
  });

  it('SPV3: computes line total using unitPrice (grouped) not price', () => {
    const { baseElement } = render(
      <SalePrintView sale={groupedSale} clinicSettings={{}} onClose={() => {}} />
    );
    const txt = baseElement.textContent || '';
    // Cream qty=2 unitPrice=500 → 1000
    expect(txt).toContain('1,000');
    // Combo qty=1 unitPrice=1500 → 1500
    expect(txt).toContain('1,500');
  });

  it('SPV4: handles empty grouped buckets without crash', () => {
    const empty = { ...groupedSale, items: { promotions: [], courses: [], products: [], medications: [] } };
    const { baseElement } = render(
      <SalePrintView sale={empty} clinicSettings={{}} onClose={() => {}} />
    );
    expect(baseElement.querySelector('[data-testid="sale-print-surface"]')).toBeTruthy();
  });

  it('SPV5: handles missing items field (treats as empty)', () => {
    const noItems = { ...groupedSale, items: undefined };
    const { baseElement } = render(
      <SalePrintView sale={noItems} clinicSettings={{}} onClose={() => {}} />
    );
    expect(baseElement.querySelector('[data-testid="sale-print-surface"]')).toBeTruthy();
  });
});

describe('SalePrintView — legacy flat items backward-compat', () => {
  it('SPV6: renders without crash when items is a LEGACY FLAT array (pre-Phase-14 docs)', () => {
    const { baseElement } = render(
      <SalePrintView sale={flatSale} clinicSettings={{}} onClose={() => {}} />
    );
    expect(baseElement.querySelector('[data-testid="sale-print-surface"]')).toBeTruthy();
  });

  it('SPV7: lists legacy flat items using courseName/productName fallback', () => {
    const { baseElement } = render(
      <SalePrintView sale={flatSale} clinicSettings={{}} onClose={() => {}} />
    );
    const txt = baseElement.textContent || '';
    expect(txt).toContain('Legacy Laser');
    expect(txt).toContain('Legacy Med');
  });

  it('SPV8: computes line total using price (legacy flat) fallback', () => {
    const { baseElement } = render(
      <SalePrintView sale={flatSale} clinicSettings={{}} onClose={() => {}} />
    );
    const txt = baseElement.textContent || '';
    // Legacy Laser qty=1 price=2500 → 2500
    expect(txt).toContain('2,500');
  });
});
