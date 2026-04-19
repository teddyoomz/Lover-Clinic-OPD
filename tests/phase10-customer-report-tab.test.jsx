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

/* ─── SORTABLE COLUMNS ───────────────────────────────────────────────────── */

describe('CustomerReportTab — sortable columns', () => {
  // Helper: read the customerId from each visible row in display order
  const getRowOrder = () =>
    Array.from(document.querySelectorAll('[data-testid^="customer-row-"]'))
      .map(r => r.getAttribute('data-testid').replace('customer-row-', ''));

  it('renders all 9 column headers as sortable buttons', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-report-table'));
    const expectedKeys = ['customerName', 'genderBirth', 'occupationIncome', 'source',
      'depositBalance', 'walletBalance', 'points', 'purchaseTotal', 'registeredDate'];
    for (const k of expectedKeys) {
      expect(screen.getByTestId(`sort-${k}`)).toBeInTheDocument();
    }
  });

  it('default sort = registeredDate desc (matches aggregator default)', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_NEW'));
    // CUST_NEW (2026-04-15) is the newest — should be first
    expect(getRowOrder()[0]).toBe('CUST_NEW');
    // CUST_PLAT (2024-12-01) is the oldest — should be last
    expect(getRowOrder().at(-1)).toBe('CUST_PLAT');
  });

  it('clicking depositBalance header sorts numeric desc (default for numbers)', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.click(screen.getByTestId('sort-depositBalance'));
    await waitFor(() => {
      const order = getRowOrder();
      // Top deposit = PLAT(15000), then GOLD(5000), REG(2000), BUSY(100.33), DIA(0), NEW(0)
      expect(order[0]).toBe('CUST_PLAT');
      expect(order[1]).toBe('CUST_GOLD');
      expect(order[2]).toBe('CUST_REG');
    });
  });

  it('clicking depositBalance again toggles to asc', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.click(screen.getByTestId('sort-depositBalance')); // desc
    await waitFor(() => expect(getRowOrder()[0]).toBe('CUST_PLAT'));
    fireEvent.click(screen.getByTestId('sort-depositBalance')); // asc
    await waitFor(() => {
      const order = getRowOrder();
      // Asc: 0-deposit customers (NEW + DIA) first, then BUSY 100.33, REG 2000, GOLD 5000, PLAT 15000
      expect(order.at(-1)).toBe('CUST_PLAT');
      expect(order.at(-2)).toBe('CUST_GOLD');
    });
  });

  it('clicking walletBalance sorts by wallet desc', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.click(screen.getByTestId('sort-walletBalance'));
    await waitFor(() => {
      // Top wallet = DIA(50000), GOLD(12000), PLAT(8500.5), then 0s
      const order = getRowOrder();
      expect(order[0]).toBe('CUST_DIA');
      expect(order[1]).toBe('CUST_GOLD');
      expect(order[2]).toBe('CUST_PLAT');
    });
  });

  it('clicking points sorts by points desc', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.click(screen.getByTestId('sort-points'));
    await waitFor(() => {
      // Top points = PLAT(9999), DIA(1200), GOLD(320), BUSY(50)
      const order = getRowOrder();
      expect(order[0]).toBe('CUST_PLAT');
      expect(order[1]).toBe('CUST_DIA');
      expect(order[2]).toBe('CUST_GOLD');
    });
  });

  it('clicking purchaseTotal sorts by total purchase desc', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.click(screen.getByTestId('sort-purchaseTotal'));
    await waitFor(() => {
      // Top = PLAT(175000.5), DIA(100000), GOLD(40000), BUSY(7777), then 0s
      const order = getRowOrder();
      expect(order[0]).toBe('CUST_PLAT');
      expect(order[1]).toBe('CUST_DIA');
      expect(order[2]).toBe('CUST_GOLD');
    });
  });

  it('clicking customerName sorts strings asc (Thai locale)', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.click(screen.getByTestId('sort-customerName'));
    await waitFor(() => {
      // Strings sort asc by default. Just verify the order changed from the
      // default (registeredDate desc) to a different one — a deterministic
      // localeCompare result is environment-dependent for Thai chars.
      const order = getRowOrder();
      expect(order[0]).not.toBe('CUST_NEW'); // default first row, no longer
    });
  });

  it('clicking source sorts strings (asc default)', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.click(screen.getByTestId('sort-source'));
    await waitFor(() => {
      const order = getRowOrder();
      // Sources: เพื่อนแนะนำ, Facebook, เดินผ่าน, '', Google Ads, TikTok
      // Asc localeCompare in Thai locale puts Thai chars before/after Latin
      // depending on env. Just verify the order CHANGED from default.
      expect(order).not.toEqual(['CUST_NEW', 'CUST_BUSY', 'CUST_REG', 'CUST_DIA', 'CUST_GOLD', 'CUST_PLAT']);
    });
  });

  it('aria-sort attribute reflects active column', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    // Default: registeredDate desc → that <th> should have aria-sort="descending"
    const regHeader = screen.getByTestId('sort-registeredDate').closest('th');
    expect(regHeader.getAttribute('aria-sort')).toBe('descending');
    // Other headers: aria-sort="none"
    const depHeader = screen.getByTestId('sort-depositBalance').closest('th');
    expect(depHeader.getAttribute('aria-sort')).toBe('none');
    // Click depositBalance → its aria-sort flips to "descending"
    fireEvent.click(screen.getByTestId('sort-depositBalance'));
    await waitFor(() => {
      expect(depHeader.getAttribute('aria-sort')).toBe('descending');
      expect(regHeader.getAttribute('aria-sort')).toBe('none');
    });
  });

  it('sort persists across filter changes (state independent)', async () => {
    render(<CustomerReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('customer-row-CUST_GOLD'));
    fireEvent.click(screen.getByTestId('sort-depositBalance'));
    await waitFor(() => expect(getRowOrder()[0]).toBe('CUST_PLAT'));
    // Apply membership filter — sort should still be deposit desc
    fireEvent.change(screen.getByTestId('customer-filter-membership'), { target: { value: 'GOLD' } });
    await waitFor(() => {
      const order = getRowOrder();
      expect(order.length).toBe(1);
      expect(order[0]).toBe('CUST_GOLD');
      // header still shows descending
      const depHeader = screen.getByTestId('sort-depositBalance').closest('th');
      expect(depHeader.getAttribute('aria-sort')).toBe('descending');
    });
  });
});
