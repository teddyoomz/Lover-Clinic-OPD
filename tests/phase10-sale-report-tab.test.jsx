// Phase 10.2 — SaleReportTab UI render + interaction tests.
// Mocks Firestore loader so the tab can render in jsdom without auth.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FIXTURE_SALES, EXPECTED_APRIL_RANGE_TOTALS, EXPECTED_YEAR_2026_TOTALS } from './_fixtures/phase10-sales-fixture.js';

vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadSalesByDateRange: vi.fn(async () => FIXTURE_SALES),
  loadAllCustomersForReport: vi.fn(async () => []), // 10.3 backfill — empty by default
}));

vi.mock('../src/firebase.js', () => ({
  db: {}, appId: 'test-app',
}));

import SaleReportTab from '../src/components/backend/reports/SaleReportTab.jsx';

describe('SaleReportTab — render + interaction', () => {
  beforeEach(() => {
    // Override the default 30-day window in DateRangePicker so the fixture's
    // April 2026 dates land inside it. Easiest = freeze the preset to "thisYear".
  });

  it('renders header with title "รายการขาย"', async () => {
    render(<SaleReportTab clinicSettings={{ accentColor: '#06b6d4' }} />);
    await waitFor(() => expect(screen.getByText('รายการขาย')).toBeInTheDocument());
  });

  it('renders date range picker + status + saletype + search filters', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => {
      expect(screen.getByTestId('date-range-picker')).toBeInTheDocument();
      expect(screen.getByTestId('filter-status')).toBeInTheDocument();
      expect(screen.getByTestId('filter-saletype')).toBeInTheDocument();
      expect(screen.getByTestId('filter-search')).toBeInTheDocument();
      expect(screen.getByTestId('filter-include-cancelled')).toBeInTheDocument();
    });
  });

  it('renders 18 ProClinic column headers (no separate action col — whole row is clickable)', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('sale-report-table'));
    const ths = screen.getByTestId('sale-report-table').querySelectorAll('th');
    expect(ths.length).toBe(18);
  });

  it('renders rows from loader after mount', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('sale-report-table'));
    // After loader resolves with FIXTURE_SALES, find a known sale row
    await waitFor(() => {
      // Switch to "ปีนี้" preset to capture April 2026 dates
      const yearBtn = screen.getByText('ปีนี้');
      fireEvent.click(yearBtn);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('row-INV-20260415-0001')).toBeInTheDocument();
    });
  });

  it('footer reconciles to AR5: same numbers as aggregator (year range incl. March + April)', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => {
      const paid = screen.getByTestId('footer-paid');
      // "ปีนี้" preset captures BOTH the March #7 sale (7777) and April #1-5
      // = paidAmount 115777. EXPECTED_YEAR_2026_TOTALS keeps the constant
      // hand-computed in the fixture so the test won't drift if logic changes.
      expect(paid.textContent.replace(/,/g, '')).toContain(String(EXPECTED_YEAR_2026_TOTALS.paidAmount));
    });
  });

  it('changing status filter to "ชำระบางส่วน" narrows visible rows', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('row-INV-20260416-0001'));

    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'split' } });
    await waitFor(() => {
      // Only the split sale (#2) remains
      expect(screen.queryByTestId('row-INV-20260415-0001')).not.toBeInTheDocument();
      expect(screen.queryByTestId('row-INV-20260416-0001')).toBeInTheDocument();
    });
  });

  it('searchText filters rows matching the query', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('row-INV-20260416-0001'));

    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'INV-20260417-0002' } });
    await waitFor(() => {
      expect(screen.queryByTestId('row-INV-20260417-0002')).toBeInTheDocument();
      expect(screen.queryByTestId('row-INV-20260416-0001')).not.toBeInTheDocument();
    });
  });

  it('toggling includeCancelled shows the cancelled row', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('row-INV-20260415-0001'));

    fireEvent.click(screen.getByTestId('filter-include-cancelled'));
    // Loader will be re-called with includeCancelled:true (mock returns same fixture);
    // but the cancelled fixture (sale #6) is in FIXTURE_SALES already — aggregator
    // will display it now that includeCancelled:true is set.
    await waitFor(() => {
      const row = screen.queryByTestId('row-INV-20260418-0001');
      expect(row).toBeInTheDocument();
      expect(row.getAttribute('data-cancelled')).toBe('true');
    });
  });

  it('cancelled row stays visually struck-through (data-cancelled=true)', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    fireEvent.click(screen.getByTestId('filter-include-cancelled'));
    await waitFor(() => {
      const row = screen.getByTestId('row-INV-20260418-0001');
      expect(row.className).toMatch(/line-through/);
    });
  });

  it('export button is enabled when rows exist, disabled when empty', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('row-INV-20260415-0001'));
    expect(screen.getByTestId('report-export')).not.toBeDisabled();

    // narrow to no rows via impossible search
    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'NEVER_MATCHES_XYZ' } });
    await waitFor(() => expect(screen.getByTestId('report-export')).toBeDisabled());
  });

  it('renders subtitle "{from} → {to}" reflecting current range', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => {
      const subtitle = document.body.textContent;
      expect(subtitle).toMatch(/2026-01-01.*→/);
    });
  });
});

describe('SaleReportTab — customer link + sale detail interactions', () => {
  beforeEach(() => {
    // Stub window.open so customer-link clicks don't actually open tabs.
    // mockReset clears per-test history so call counts don't leak between tests.
    vi.spyOn(window, 'open').mockReset().mockImplementation(() => null);
  });

  it('customer cells render as clickable buttons (HN + name)', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => {
      const hnLink = screen.getByTestId('customer-link-INV-20260415-0001-customerHN');
      expect(hnLink).toBeInTheDocument();
      expect(hnLink.tagName).toBe('BUTTON');
    });
  });

  it('clicking customer HN calls window.open with backend customer URL', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('customer-link-INV-20260415-0001-customerHN'));
    fireEvent.click(screen.getByTestId('customer-link-INV-20260415-0001-customerHN'));
    expect(window.open).toHaveBeenCalledTimes(1);
    const url = window.open.mock.calls[0][0];
    // FIXTURE_SALES customerId default = 'CUST_1'
    expect(url).toMatch(/\?backend=1&customer=CUST_1$/);
    expect(window.open.mock.calls[0][1]).toBe('_blank');
  });

  it('every row is clickable (cursor-pointer + onClick handler)', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => {
      // 5 active April + 1 March = 6 rows by default (no cancelled)
      const rows = screen.getAllByTestId(/^row-INV-/);
      expect(rows.length).toBe(6);
      rows.forEach(r => expect(r.className).toMatch(/cursor-pointer/));
    });
  });

  it('clicking anywhere on a row opens SaleDetailModal with correct sale ID', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('row-INV-20260416-0001'));
    fireEvent.click(screen.getByTestId('row-INV-20260416-0001'));
    await waitFor(() => {
      const modal = screen.getByTestId('sale-detail-modal');
      expect(modal).toBeInTheDocument();
      expect(modal.querySelector('#sale-detail-title')?.textContent).toContain('INV-20260416-0001');
    });
  });

  it('clicking customer link does NOT also open the row detail modal (stopPropagation)', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('customer-link-INV-20260415-0001-customerName'));
    fireEvent.click(screen.getByTestId('customer-link-INV-20260415-0001-customerName'));
    // window.open fires once for the customer link, modal stays closed
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sale-detail-modal')).not.toBeInTheDocument();
  });

  it('SaleDetailModal renders item names + payment channels for split-payment sale', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('row-INV-20260416-0001'));
    fireEvent.click(screen.getByTestId('row-INV-20260416-0001'));
    await waitFor(() => {
      const modal = screen.getByTestId('sale-detail-modal');
      // Sale #2 from fixture: courses Botox + Filler, product ครีมกันแดด, channels SCB + เงินสด
      expect(modal.textContent).toContain('Botox Hugel');
      expect(modal.textContent).toContain('Filler 0.5cc');
      expect(modal.textContent).toContain('ครีมกันแดด');
      expect(modal.textContent).toContain('SCB');
      expect(modal.textContent).toContain('เงินสด');
    });
  });

  it('SaleDetailModal close button dismisses the modal', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('row-INV-20260415-0001'));
    fireEvent.click(screen.getByTestId('row-INV-20260415-0001'));
    await waitFor(() => screen.getByTestId('sale-detail-modal'));
    fireEvent.click(screen.getByTestId('close-modal'));
    await waitFor(() => {
      expect(screen.queryByTestId('sale-detail-modal')).not.toBeInTheDocument();
    });
  });

  it('SaleDetailModal "ดูข้อมูลลูกค้า" footer link opens customer in new tab', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    await waitFor(() => screen.getByTestId('row-INV-20260415-0001'));
    fireEvent.click(screen.getByTestId('row-INV-20260415-0001'));
    await waitFor(() => screen.getByTestId('footer-open-customer'));
    fireEvent.click(screen.getByTestId('footer-open-customer'));
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open.mock.calls[0][0]).toMatch(/\?backend=1&customer=CUST_1$/);
  });

  it('SaleDetailModal Esc key closes modal', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    fireEvent.click(screen.getByTestId('row-INV-20260415-0001'));
    await waitFor(() => screen.getByTestId('sale-detail-modal'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('sale-detail-modal')).not.toBeInTheDocument();
    });
  });

  it('SaleDetailModal shows cancelled badge for cancelled sales', async () => {
    render(<SaleReportTab clinicSettings={{}} />);
    await waitFor(() => fireEvent.click(screen.getByText('ปีนี้')));
    fireEvent.click(screen.getByTestId('filter-include-cancelled'));
    await waitFor(() => screen.getByTestId('row-INV-20260418-0001'));
    fireEvent.click(screen.getByTestId('row-INV-20260418-0001'));
    await waitFor(() => {
      const modal = screen.getByTestId('sale-detail-modal');
      expect(modal.textContent).toContain('ยกเลิก');
    });
  });
});
