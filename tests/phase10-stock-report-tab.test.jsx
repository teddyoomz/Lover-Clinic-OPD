// Phase 10.5 — StockReportTab UI render + interaction tests.
// Mocks Firestore loaders so the tab can render in jsdom without auth.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const FIX_PRODUCTS = [
  { id: 'P001', name: 'Botox 100U', type: 'ยา', category: 'Botox',
    status: 'ใช้งาน', stockConfig: { unit: 'U' } },
  { id: 'P002', name: 'Acetin', type: 'ยา', category: 'ยาฉีด',
    status: 'ใช้งาน', stockConfig: { unit: 'amp.' } },
  { id: 'P004', name: 'Paused Product', type: 'สินค้าหน้าร้าน', category: 'Mask',
    status: 'พักใช้งาน', stockConfig: { unit: 'ชิ้น' } },
];

const FIX_BATCHES = [
  {
    batchId: 'B1', productId: 'P001', productName: 'Botox 100U',
    qty: { remaining: 2000, total: 2000 }, originalCost: 57.5, unit: 'U',
    expiresAt: null, status: 'active',
  },
  {
    batchId: 'B2', productId: 'P002', productName: 'Acetin',
    qty: { remaining: 50, total: 50 }, originalCost: 100, unit: 'amp.',
    expiresAt: '2026-05-10T00:00:00.000Z', status: 'active',
  },
  {
    batchId: 'B3', productId: 'P004', productName: 'Paused Product',
    qty: { remaining: 5, total: 5 }, originalCost: 200, unit: 'ชิ้น',
    expiresAt: null, status: 'active',
  },
];

vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadAllStockBatchesForReport: vi.fn(async () => FIX_BATCHES),
}));

vi.mock('../src/lib/backendClient.js', () => ({
  getAllMasterDataItems: vi.fn(async () => FIX_PRODUCTS),
}));

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

import StockReportTab from '../src/components/backend/reports/StockReportTab.jsx';

describe('StockReportTab — render + interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header with title "สต็อคสินค้า"', async () => {
    render(<StockReportTab clinicSettings={{ accentColor: '#06b6d4' }} />);
    await waitFor(() => expect(screen.getByText('สต็อคสินค้า')).toBeInTheDocument());
  });

  it('renders 4 filter controls + show-zero-qty checkbox', async () => {
    render(<StockReportTab clinicSettings={{}} />);
    await waitFor(() => {
      expect(screen.getByTestId('stock-filter-search')).toBeInTheDocument();
      expect(screen.getByTestId('stock-filter-category')).toBeInTheDocument();
      expect(screen.getByTestId('stock-filter-type')).toBeInTheDocument();
      expect(screen.getByTestId('stock-filter-status')).toBeInTheDocument();
      expect(screen.getByTestId('stock-filter-zero-qty')).toBeInTheDocument();
    });
  });

  it('renders 9 column headers (matches ProClinic spec)', async () => {
    render(<StockReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('stock-report-table'));
    const ths = screen.getByTestId('stock-report-table').querySelectorAll('thead th');
    expect(ths.length).toBe(9);
  });

  it('renders stock rows from fixture', async () => {
    render(<StockReportTab clinicSettings={{}} />);
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^stock-row-/);
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('status filter narrows to paused only', async () => {
    render(<StockReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('stock-row-P001'));
    fireEvent.change(screen.getByTestId('stock-filter-status'), { target: { value: 'พักใช้งาน' } });
    await waitFor(() => {
      expect(screen.queryByTestId('stock-row-P001')).not.toBeInTheDocument();
      expect(screen.getByTestId('stock-row-P004')).toBeInTheDocument();
    });
  });

  it('type filter narrows to สินค้าหน้าร้าน only', async () => {
    render(<StockReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('stock-row-P001'));
    fireEvent.change(screen.getByTestId('stock-filter-type'), { target: { value: 'สินค้าหน้าร้าน' } });
    await waitFor(() => {
      expect(screen.queryByTestId('stock-row-P001')).not.toBeInTheDocument();
      expect(screen.getByTestId('stock-row-P004')).toBeInTheDocument();
    });
  });

  it('search narrows by product name', async () => {
    render(<StockReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('stock-row-P001'));
    fireEvent.change(screen.getByTestId('stock-filter-search'), { target: { value: 'Acetin' } });
    await waitFor(() => {
      expect(screen.queryByTestId('stock-row-P001')).not.toBeInTheDocument();
      expect(screen.getByTestId('stock-row-P002')).toBeInTheDocument();
    });
  });

  it('footer shows aggregated quantities', async () => {
    render(<StockReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('stock-report-footer'));
    const footer = screen.getByTestId('stock-report-footer');
    expect(footer.querySelector('[data-testid="footer-total-qty"]')).toBeInTheDocument();
    expect(footer.querySelector('[data-testid="footer-total-value"]')).toBeInTheDocument();
    expect(footer.querySelector('[data-testid="footer-near-expiry"]')).toBeInTheDocument();
    expect(footer.querySelector('[data-testid="footer-expired"]')).toBeInTheDocument();
  });

  it('paused product shows พักใช้งาน badge in name cell', async () => {
    render(<StockReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('stock-row-P004'));
    const row = screen.getByTestId('stock-row-P004');
    expect(row.textContent).toContain('พักใช้งาน');
  });

  it('category dropdown derives options from product data', async () => {
    render(<StockReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('stock-filter-category'));
    const select = screen.getByTestId('stock-filter-category');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(options).toContain('Botox');
    expect(options).toContain('ยาฉีด');
    expect(options).toContain('Mask');
  });
});
