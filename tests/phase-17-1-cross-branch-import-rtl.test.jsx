// ─── Phase 17.1 — modal RTL tests (V21 mitigation) ────────────────────────
// Mount CrossBranchImportModal with mocked adapter + scopedDataLayer +
// branches; simulate source-pick + select + Import + verify endpoint POST.

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from 'react';

// Phase 26.2g-fillin-bis-followup-2 (2026-05-13) — defensive isolation against
// intermittent full-suite-load flake. 4 test files (this + branch-backup-ui-rtl
// + phase15.5b-withdrawal-approval-endpoint + extended/adminUsersClient) all
// assign global.fetch without afterAll restore. Under vitest worker parallelism
// this CAN leak mock instances across files mid-test. Defensive fixes here:
//   - afterAll restores original global.fetch
//   - afterEach calls vi.clearAllMocks for full mock-state isolation
//   - WAIT_FOR_OPTS = {timeout: 3000} gives ~3x headroom over default 1000ms
const ORIGINAL_FETCH = global.fetch;
const WAIT_FOR_OPTS = { timeout: 3000 };

// Mock scopedDataLayer.
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listBranches: vi.fn(async () => ([
    { branchId: 'BR-A', name: 'Branch A', status: 'ใช้งาน' },
    { branchId: 'BR-B', name: 'Branch B', status: 'ใช้งาน' },
  ])),
  listProducts: vi.fn(async ({ branchId } = {}) => {
    if (branchId === 'BR-A') return [
      { productId: 'P-1', id: 'P-1', productName: 'Acetin', productType: 'ยา', branchId: 'BR-A' },
      { productId: 'P-2', id: 'P-2', productName: 'Aloe', productType: 'สินค้าสิ้นเปลือง', branchId: 'BR-A' },
    ];
    if (branchId === 'BR-B') return [
      { productId: 'P-OLD', id: 'P-OLD', productName: 'Acetin', productType: 'ยา', branchId: 'BR-B' },
    ];
    return [];
  }),
  listProductGroups: vi.fn(async () => []),
  listProductUnitGroups: vi.fn(async () => []),
  listMedicalInstruments: vi.fn(async () => []),
  listHolidays: vi.fn(async () => []),
  listCourses: vi.fn(async () => []),
  listDfGroups: vi.fn(async () => []),
}));

const branchState = { branchId: 'BR-B' };
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: branchState.branchId }),
}));

vi.mock('../src/firebase.js', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(async () => 'fake-id-token'),
    },
  },
}));

// global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

import CrossBranchImportModal from '../src/components/backend/CrossBranchImportModal.jsx';
import { getAdapter } from '../src/lib/crossBranchImportAdapters/index.js';

beforeEach(() => {
  fetchMock.mockReset();
  branchState.branchId = 'BR-B';
});

afterEach(() => {
  // Full mock-state isolation prevents call-log leakage across tests within
  // this file when running under parallel-worker load.
  vi.clearAllMocks();
});

afterAll(() => {
  // Restore original global.fetch (preferably undefined) to prevent leakage
  // into subsequent test files that may also set global.fetch.
  if (ORIGINAL_FETCH === undefined) delete global.fetch;
  else global.fetch = ORIGINAL_FETCH;
});

describe('Phase 17.1 RTL — CrossBranchImportModal', () => {
  it('R1.1 renders source-branch dropdown', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy(), WAIT_FOR_OPTS);
  });

  it('R1.2 source dropdown excludes the current target branch', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy(), WAIT_FOR_OPTS);
    const select = screen.getByTestId('cross-branch-source-picker');
    const options = Array.from(select.querySelectorAll('option'));
    const values = options.map(o => o.value);
    expect(values).not.toContain('BR-B');  // target excluded
    expect(values).toContain('BR-A');       // source available
  });

  it('R1.3 selecting source branch fetches preview rows', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy(), WAIT_FOR_OPTS);
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-1')).toBeTruthy(), WAIT_FOR_OPTS);
  });

  it('R1.4 duplicate row (Acetin in target) renders with status=dup', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy(), WAIT_FOR_OPTS);
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-1')).toBeTruthy(), WAIT_FOR_OPTS);
    const dupRow = screen.getByTestId('cross-branch-row-P-1');
    expect(dupRow.getAttribute('data-status')).toBe('dup');
  });

  it('R1.5 importable row (Aloe not in target) renders with status=ok', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy(), WAIT_FOR_OPTS);
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-2')).toBeTruthy(), WAIT_FOR_OPTS);
    const okRow = screen.getByTestId('cross-branch-row-P-2');
    expect(okRow.getAttribute('data-status')).toBe('ok');
  });

  it('R1.6 select-all toggles importable rows only', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy(), WAIT_FOR_OPTS);
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-2')).toBeTruthy(), WAIT_FOR_OPTS);
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-branch-select-all'));
    });
    // Aloe (P-2) should be checked; Acetin (P-1) should NOT be (it's a dup)
    expect(screen.getByTestId('cross-branch-row-checkbox-P-2').checked).toBe(true);
    expect(screen.getByTestId('cross-branch-row-checkbox-P-1').checked).toBe(false);
  });

  it('R1.7 Import button POSTs to /api/admin/cross-branch-import', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ imported: [{ sourceId: 'P-2', newId: 'P-NEW' }], skippedDup: [], skippedFK: [], auditId: 'audit-1' }),
    });
    const onImported = vi.fn();
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={onImported} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy(), WAIT_FOR_OPTS);
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-2')).toBeTruthy(), WAIT_FOR_OPTS);
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-branch-row-checkbox-P-2'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-branch-import-confirm-btn'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), WAIT_FOR_OPTS);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/cross-branch-import');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer fake-id-token');
    const body = JSON.parse(init.body);
    expect(body.entityType).toBe('products');
    expect(body.sourceBranchId).toBe('BR-A');
    expect(body.targetBranchId).toBe('BR-B');
    expect(body.itemIds).toEqual(['P-2']);
    expect(onImported).toHaveBeenCalledTimes(1);
  });
});
