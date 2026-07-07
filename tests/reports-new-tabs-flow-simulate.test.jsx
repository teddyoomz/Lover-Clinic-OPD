// Rule I flow-simulate — reports-home: every wired/new card, when clicked in a
// real render, routes to its exact registered tabId (the user click path the
// drift-guard protects at build time). ReportsHomeTab is presentational
// (onNavigate prop, no providers needed).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import ReportsHomeTab from '../src/components/backend/reports/ReportsHomeTab.jsx';
import { ALL_ITEM_IDS } from '../src/components/backend/nav/navConfig.js';

afterEach(() => cleanup());

// label → the tabId it MUST navigate to (unique labels only)
const CARD_ROUTES = [
  // wired (previously mislabeled/hidden)
  ['กำไร/ขาดทุน (P&L)', 'reports-pnl'],
  ['สรุปบัญชีรับชำระ', 'reports-payment'],
  ['คอร์สคงเหลือ', 'reports-remaining-course'],
  ['รายจ่ายทั้งหมด (แยกหมวดในแท็บ)', 'expense-report'],
  ['ค่ามือแพทย์ (DF)', 'reports-df-payout'],
  ['รายงานคลินิก (ภาพรวม)', 'clinic-report'],
  ['Smart Audience', 'smart-audience'],
  // new data-ready report tabs
  ['การขายออนไลน์', 'reports-alt-sales'],
  ['ยอดขายคู่ค้า', 'reports-alt-sales'],
  ['รายการขายค้างชำระ', 'reports-outstanding'],
  ['รายการเคลื่อนไหวสต็อค', 'reports-stock-movements'],
  ['ล็อตสินค้าใกล้หมดอายุ', 'reports-stock-alert'],
  ['ล็อตสินค้าหมดอายุ', 'reports-stock-alert'],
  ['สินค้าใกล้หมดสต็อค', 'reports-stock-alert'],
];

describe('F1 reports-home card → correct tab route (real click)', () => {
  it.each(CARD_ROUTES)('clicking "%s" navigates to %s', (label, expectedTab) => {
    const onNavigate = vi.fn();
    render(<ReportsHomeTab onNavigate={onNavigate} clinicSettings={{}} />);
    fireEvent.click(screen.getByText(label));
    expect(onNavigate).toHaveBeenCalledWith(expectedTab);
  });

  it('F1.end every routed tabId is a registered navConfig id (no dead route at runtime)', () => {
    CARD_ROUTES.forEach(([, tab]) => expect(ALL_ITEM_IDS).toContain(tab));
  });

  it('F1.no-disabled every card renders enabled (no disabled/soon button)', () => {
    const onNavigate = vi.fn();
    const { container } = render(<ReportsHomeTab onNavigate={onNavigate} clinicSettings={{}} />);
    const disabled = container.querySelectorAll('button[disabled]');
    expect(disabled.length).toBe(0);
  });
});
