import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Receipt, Sparkles } from 'lucide-react';
import ReportShell from '../src/components/backend/reports/ReportShell.jsx';
import { buildPresets } from '../src/components/backend/reports/DateRangePicker.jsx';
import {
  NAV_SECTIONS,
  PINNED_ITEMS,
  ALL_ITEM_IDS,
  itemById,
  sectionOf,
} from '../src/components/backend/nav/navConfig.js';

describe('ReportShell — renders header / counts / actions', () => {
  it('renders title + icon', () => {
    render(<ReportShell icon={Receipt} title="รายการขาย">body</ReportShell>);
    expect(screen.getByText('รายการขาย')).toBeInTheDocument();
  });

  it('shows counts when totalCount + filteredCount provided', () => {
    render(<ReportShell title="x" totalCount={100} filteredCount={42}>body</ReportShell>);
    const subtitle = screen.getByText(/100/);
    expect(subtitle.textContent).toMatch(/100/);
    expect(subtitle.textContent).toMatch(/42/);
  });

  it('omits "แสดง N" suffix when totalCount === filteredCount', () => {
    render(<ReportShell title="x" totalCount={5} filteredCount={5}>body</ReportShell>);
    const subtitle = screen.getByText(/5/);
    expect(subtitle.textContent).not.toMatch(/แสดง/);
  });

  it('renders refresh button + fires onRefresh', () => {
    const onRefresh = vi.fn();
    render(<ReportShell title="x" onRefresh={onRefresh}>body</ReportShell>);
    fireEvent.click(screen.getByTestId('report-refresh'));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('renders export button + fires onExport', () => {
    const onExport = vi.fn();
    render(<ReportShell title="x" onExport={onExport}>body</ReportShell>);
    fireEvent.click(screen.getByTestId('report-export'));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('disables export button when exportDisabled or loading', () => {
    const onExport = vi.fn();
    render(<ReportShell title="x" onExport={onExport} exportDisabled>body</ReportShell>);
    const btn = screen.getByTestId('report-export');
    expect(btn).toBeDisabled();
  });

  it('renders error banner when error string present', () => {
    render(<ReportShell title="x" error="โหลดข้อมูลล้มเหลว">body</ReportShell>);
    expect(screen.getByTestId('report-error')).toHaveTextContent('โหลดข้อมูลล้มเหลว');
  });

  it('renders loading indicator (and hides body) when loading', () => {
    render(<ReportShell title="x" loading>BODY</ReportShell>);
    expect(screen.getByTestId('report-loading')).toBeInTheDocument();
    expect(screen.queryByText('BODY')).not.toBeInTheDocument();
  });

  it('renders empty state when filteredCount === 0', () => {
    render(<ReportShell title="x" totalCount={0} filteredCount={0}>BODY</ReportShell>);
    expect(screen.getByTestId('report-empty')).toBeInTheDocument();
  });

  it('uses notFoundText when items exist but filtered to zero', () => {
    render(
      <ReportShell title="x" totalCount={5} filteredCount={0} emptyText="ยังไม่มี" notFoundText="ไม่พบ">
        body
      </ReportShell>
    );
    expect(screen.getByTestId('report-empty')).toHaveTextContent('ไม่พบ');
  });

  it('uses emptyText when totalCount === 0', () => {
    render(
      <ReportShell title="x" totalCount={0} filteredCount={0} emptyText="ยังไม่มี" notFoundText="ไม่พบ">
        body
      </ReportShell>
    );
    expect(screen.getByTestId('report-empty')).toHaveTextContent('ยังไม่มี');
  });

  it('renders body children when not loading + has filtered items', () => {
    render(<ReportShell title="x" totalCount={3} filteredCount={3}>BODY</ReportShell>);
    expect(screen.getByText('BODY')).toBeInTheDocument();
  });

  it('renders dateRangeSlot + filtersSlot inside the filter row', () => {
    render(
      <ReportShell
        title="x"
        dateRangeSlot={<div data-testid="dr">DR</div>}
        filtersSlot={<div data-testid="ef">EF</div>}
      >body</ReportShell>
    );
    expect(screen.getByTestId('dr')).toBeInTheDocument();
    expect(screen.getByTestId('ef')).toBeInTheDocument();
  });
});

describe('DateRangePicker.buildPresets', () => {
  it('returns 6 presets in standard order', () => {
    const p = buildPresets(new Date('2026-04-19T10:00:00+07:00'));
    expect(p.map(x => x.id)).toEqual(['today', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear']);
  });

  it('today range = single ISO date', () => {
    const p = buildPresets();
    const today = p.find(x => x.id === 'today');
    expect(today.from).toBe(today.to);
    expect(today.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('last7 spans 7 days inclusive (today + 6 prior)', () => {
    const p = buildPresets();
    const last7 = p.find(x => x.id === 'last7');
    const fromDate = new Date(last7.from);
    const toDate = new Date(last7.to);
    const days = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
    expect(days).toBe(7);
  });

  it('thisMonth.from is the 1st of current month', () => {
    const p = buildPresets(new Date('2026-04-19T10:00:00+07:00'));
    const m = p.find(x => x.id === 'thisMonth');
    expect(m.from.endsWith('-01')).toBe(true);
  });

  it('lastMonth crosses year boundary correctly when current month is January', () => {
    // Mock a January date — buildPresets will compute lastMonth = Dec of prior year
    const p = buildPresets(new Date('2026-01-15T10:00:00+07:00'));
    const lm = p.find(x => x.id === 'lastMonth');
    expect(lm.from.startsWith('2025-12')).toBe(true);
    expect(lm.to.startsWith('2025-12-31')).toBe(true);
  });

  it('thisYear.from is YYYY-01-01', () => {
    const p = buildPresets(new Date('2026-04-19T10:00:00+07:00'));
    const y = p.find(x => x.id === 'thisYear');
    expect(y.from.endsWith('-01-01')).toBe(true);
  });
});

describe('navConfig — Phase 10 reports section wired', () => {
  it('reports section exists with 13 items (8 P10 + 2 P10.X + 2 P12.8 + 1 P13.4 df-payout)', () => {
    // Phase 12.8 appended reports-pnl + reports-payment.
    // Phase 13.4 appended reports-df-payout.
    const reports = NAV_SECTIONS.find(s => s.id === 'reports');
    expect(reports).toBeDefined();
    expect(reports.items).toHaveLength(13);
  });

  it('all 8 report tab IDs are in ALL_ITEM_IDS whitelist (URL deep-link)', () => {
    const ids = ['reports', 'reports-sale', 'reports-customer', 'reports-appointment',
                 'reports-stock', 'reports-rfm', 'reports-revenue', 'reports-appt-analysis'];
    ids.forEach(id => expect(ALL_ITEM_IDS).toContain(id));
  });

  it('itemById finds reports landing tab', () => {
    expect(itemById('reports')?.label).toBe('หน้ารายงาน');
  });

  it('sectionOf returns "reports" for any reports-* tab', () => {
    expect(sectionOf('reports-rfm')).toBe('reports');
    expect(sectionOf('reports-sale')).toBe('reports');
  });

  it('reports section uses sky/amber/emerald colors (P12.8 added emerald for P&L + payment)', () => {
    const reports = NAV_SECTIONS.find(s => s.id === 'reports');
    const colors = new Set(reports.items.map(i => i.color));
    [...colors].forEach(c => expect(['sky', 'amber', 'emerald']).toContain(c));
  });

  it('does not break existing nav (Phase 9 marketing items still present)', () => {
    const marketing = NAV_SECTIONS.find(s => s.id === 'marketing');
    expect(marketing.items.map(i => i.id)).toEqual(['promotions', 'coupons', 'vouchers']);
  });

  it('PINNED_ITEMS unchanged (only "appointments")', () => {
    expect(PINNED_ITEMS).toHaveLength(1);
    expect(PINNED_ITEMS[0].id).toBe('appointments');
  });
});
