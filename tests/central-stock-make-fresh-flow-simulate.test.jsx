import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CentralMakeFreshModal from '../src/components/backend/CentralMakeFreshModal.jsx';
import { CENTRAL_BUCKETS } from '../src/lib/centralStockBuckets.js';

// Mock firebase auth — auth.currentUser.getIdToken returns a fake token
vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'mock-id-token' } },
  db: {},
}));

// V67 (2026-05-15) AV41 fix — capture original fetch + restore in afterAll
// to prevent worker-pool leak per V55.3 (Phase 17.1 isolation V-entry).
const ORIGINAL_FETCH = global.fetch;

const SAMPLE_WAREHOUSE = { stockId: 'WH-A', stockName: 'คลังกลาง 1' };

describe('CF1 CentralMakeFreshModal — Rule I full-flow simulate', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });
  afterAll(() => {
    if (ORIGINAL_FETCH === undefined) delete global.fetch;
    else global.fetch = ORIGINAL_FETCH;
  });

  it('CF1.1 — opens with all 4 buckets checked (no opt-in-only in central)', () => {
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    for (const id of Object.keys(CENTRAL_BUCKETS)) {
      expect(screen.getByTestId(`cs-bucket-${id}`).checked, `cs-bucket-${id}`).toBe(true);
    }
  });

  it('CF1.2 — preview button disabled when zero buckets ticked', () => {
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    for (const id of Object.keys(CENTRAL_BUCKETS)) {
      fireEvent.click(screen.getByTestId(`cs-bucket-${id}`));
    }
    expect(screen.getByTestId('cs-preview-btn').disabled).toBe(true);
  });

  it('CF1.3 — preview displays per-bucket counts from dryRun response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true, dryRun: true,
        perBucket: {
          cs_po: { docs: 12, sizeBytes: 1200 },
          cs_stock_ledger: { docs: 45, sizeBytes: 5000 },
          cs_transfers_withdrawals: { docs: 8, sizeBytes: 800 },
          cs_adjustments: { docs: 3, sizeBytes: 300 },
        },
        totalDocs: 68,
        estSizeBytes: 7300,
      }),
    });
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('cs-preview-btn'));
    await waitFor(() => expect(screen.getByTestId('cs-impact-panel')).toBeInTheDocument());
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/68/)).toBeInTheDocument();
  });

  it('CF1.4 — confirm requires typed warehouse name match', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, dryRun: true, perBucket: { cs_po: { docs: 5, sizeBytes: 100 } }, totalDocs: 5, estSizeBytes: 100 }),
    });
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('cs-preview-btn'));
    await waitFor(() => screen.getByTestId('cs-continue-btn'));
    fireEvent.click(screen.getByTestId('cs-continue-btn'));
    expect(screen.getByTestId('cs-confirm-btn').disabled).toBe(true);
    fireEvent.change(screen.getByTestId('cs-confirm-input'), { target: { value: 'wrong' } });
    expect(screen.getByTestId('cs-confirm-btn').disabled).toBe(true);
    fireEvent.change(screen.getByTestId('cs-confirm-input'), { target: { value: 'คลังกลาง 1' } });
    expect(screen.getByTestId('cs-confirm-btn').disabled).toBe(false);
  });

  it('CF1.5 — full success flow: preview → confirm → backup → wipe → done', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: { cs_po: { docs: 5, sizeBytes: 100 } }, totalDocs: 5, estSizeBytes: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, storagePath: 'backups/central/WH-A/p1.json', bodyHash: 'a'.repeat(64) }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, deletedCounts: { 'be_central_stock_orders/WH-A': 5 }, bodyHash: 'a'.repeat(64), auditId: 'central-mf-1', warehouseIds: ['WH-A'], bucketIds: ['cs_po'] }) });
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('cs-preview-btn'));
    await waitFor(() => screen.getByTestId('cs-continue-btn'));
    fireEvent.click(screen.getByTestId('cs-continue-btn'));
    fireEvent.change(screen.getByTestId('cs-confirm-input'), { target: { value: 'คลังกลาง 1' } });
    fireEvent.click(screen.getByTestId('cs-confirm-btn'));
    await waitFor(() => expect(screen.getByText(/เสร็จสิ้น/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/central-mf-1/)).toBeInTheDocument();
  });

  it('CF1.6 — error path: BACKUP_INTEGRITY_FAIL shows error + preserves backup path', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: { cs_po: { docs: 5, sizeBytes: 100 } }, totalDocs: 5, estSizeBytes: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, storagePath: 'backups/central/WH-A/p1.json', bodyHash: 'a'.repeat(64) }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'BACKUP_INTEGRITY_FAIL' }) });
    render(<CentralMakeFreshModal warehouse={SAMPLE_WAREHOUSE} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('cs-preview-btn'));
    await waitFor(() => screen.getByTestId('cs-continue-btn'));
    fireEvent.click(screen.getByTestId('cs-continue-btn'));
    fireEvent.change(screen.getByTestId('cs-confirm-input'), { target: { value: 'คลังกลาง 1' } });
    fireEvent.click(screen.getByTestId('cs-confirm-btn'));
    await waitFor(() => expect(screen.getByText(/BACKUP_INTEGRITY_FAIL/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/backups\/central\/WH-A\/p1\.json/)).toBeInTheDocument();
  });

  it('CF1.7 — allWarehouses bulk mode shows ทุกคลังกลาง label + count', () => {
    render(
      <CentralMakeFreshModal
        allWarehouses={true}
        allWarehouseList={[{ stockId: 'WH-A' }, { stockId: 'WH-B' }, { stockId: 'WH-C' }]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/เคลีย Central Stock ทั้งหมด/)).toBeInTheDocument();
    expect(screen.getByText(/ทุกคลังกลาง/)).toBeInTheDocument();
    expect(screen.getByText(/3 คลัง/)).toBeInTheDocument();
  });
});
