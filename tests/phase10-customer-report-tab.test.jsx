// Phase 10.3 — CustomerReportTab UI render + interaction tests.
// Mocks Firestore loaders so the tab can render in jsdom without auth.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FIXTURE_CUSTOMERS, FIXTURE_SALES, EXPECTED_TOTALS_NO_FILTER } from './_fixtures/phase10-customers-fixture.js';

vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadAllCustomersForReport: vi.fn(async () => FIXTURE_CUSTOMERS),
  loadSalesByDateRange:      vi.fn(async () => FIXTURE_SALES),
}));

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

import CustomerReportTab from '../src/components/backend/reports/CustomerReportTab.jsx';

describe('CustomerReportTab — render + interactions', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReset().mockImplementation(() => null);
  });

  it('renders header with title "ลูกค้าสาขา"', async () => {
    render(<CustomerReportTab clinicSettings={{ accentColor: '#06b6d4' }} />);
    await waitFor(() => expect(screen.getByText('ลูกค้าสาขา')).toBeInTheDocument());
  });

  it('renders date range picker + 4 filter controls', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => {
      expect(screen.getByTestId('date-range-picker')).toBeInTheDocument();
      expect(screen.getByTestId('customer-filter-search')).toBeInTheDocument();
      expect(screen.getByTestId('customer-filter-membership')).toBeInTheDocument();
      expect(screen.getByTestId('customer-filter-source')).toBeInTheDocument();
      expect(screen.getByTestId('customer-filter-marketing')).toBeInTheDocument();
    });
  });

  it('renders 9 column headers (matches ProClinic spec)', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-report-table'));
    const ths = screen.getByTestId('customer-report-table').querySelectorAll('th');
    expect(ths.length).toBe(9);
  });

  it('renders 6 customer rows from fixture', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-report-table'));
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^customer-row-/);
      expect(rows.length).toBe(6);
    });
  });

  it('clicking customer name link opens new tab with customer URL', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-link-CUST_GOLD'));
    fireEvent.click(screen.getByTestId('customer-link-CUST_GOLD'));
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open.mock.calls[0][0]).toMatch(/\?backend=1&customer=CUST_GOLD$/);
    expect(window.open.mock.calls[0][1]).toBe('_blank');
  });

  it('clicking row also opens customer (whole-row click pattern)', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_DIA'));
    fireEvent.click(screen.getByTestId('customer-row-CUST_DIA'));
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open.mock.calls[0][0]).toMatch(/customer=CUST_DIA$/);
  });

  it('membership filter narrows to GOLD only', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.change(screen.getByTestId('customer-filter-membership'), { target: { value: 'GOLD' } });
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^customer-row-/);
      expect(rows.length).toBe(1);
      expect(screen.queryByTestId('customer-row-CUST_DIA')).not.toBeInTheDocument();
    });
  });

  it('marketing-consent toggle hides non-consenting customers', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_DIA'));
    fireEvent.click(screen.getByTestId('customer-filter-marketing'));
    await waitFor(() => {
      // GOLD, REG, PLAT consented; DIA + NEW + BUSY did not
      expect(screen.queryByTestId('customer-row-CUST_DIA')).not.toBeInTheDocument();
      expect(screen.queryByTestId('customer-row-CUST_GOLD')).toBeInTheDocument();
    });
  });

  it('search by HN narrows to single match', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.change(screen.getByTestId('customer-filter-search'), { target: { value: 'HN66' } });
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^customer-row-/);
      expect(rows.length).toBe(1);
      expect(screen.queryByTestId('customer-row-CUST_PLAT')).toBeInTheDocument();
    });
  });

  it('footer reconciles to AR5: matches aggregator totals', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('footer-deposit'));
    const dep = screen.getByTestId('footer-deposit');
    expect(dep.textContent.replace(/,/g, '')).toContain(String(EXPECTED_TOTALS_NO_FILTER.depositBalance));
  });

  it('export button enabled when rows present, disabled when empty', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    expect(screen.getByTestId('report-export')).not.toBeDisabled();
    fireEvent.change(screen.getByTestId('customer-filter-search'), { target: { value: 'NEVER_MATCH_XYZ' } });
    await waitFor(() => expect(screen.getByTestId('report-export')).toBeDisabled());
  });

  it('source dropdown is derived from actual customer data (not hardcoded)', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-filter-source'));
    const select = screen.getByTestId('customer-filter-source');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
    // Fixture sources: เพื่อนแนะนำ, Facebook, เดินผ่าน, Google Ads, TikTok
    expect(options).toContain('เพื่อนแนะนำ');
    expect(options).toContain('Facebook');
    expect(options).toContain('Google Ads');
    expect(options).toContain('TikTok');
    expect(options).toContain('ทุกที่มา');
  });

  it('cancelled sale (99999) NEVER appears in customer purchase total (AR3)', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    const goldRow = screen.getByTestId('customer-row-CUST_GOLD');
    // GOLD purchase = 40000 (excludes the 99999 cancelled). Number must NOT
    // appear anywhere in the GOLD row.
    expect(goldRow.textContent).not.toContain('99,999');
    expect(goldRow.textContent).toContain('40,000');
  });
});
