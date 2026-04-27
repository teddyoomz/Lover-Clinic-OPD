// ─── Phase 15.4 post-deploy bug 3 — AdjustDetailModal regression bank ───────
// User report (s19 EOD):
//   "รายการหน้าปรับสต็อคจะต้องกดเข้าไปดูรายละเอียดในแต่ละรายการได้เหมือนหน้าอื่นๆ"
//
// Coverage:
//   AD.A — AdjustDetailModal exists + renders shape (RTL)
//   AD.B — getStockAdjustment helper exists in backendClient
//   AD.C — StockAdjustPanel rows are clickable + open detail modal
//   AD.D — modal displays type/product/batch/qty/note/actor/date
//   AD.E — modal handles loading + error + missing data
//   AD.F — V12 backward compat: old adjustments without all fields render gracefully
//   AD.G — branch resolution uses resolveBranchName helper (V22 lock — never raw id)

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const adjustModalSrc = read('src/components/backend/AdjustDetailModal.jsx');
const adjustPanelSrc = read('src/components/backend/StockAdjustPanel.jsx');
const backendSrc = read('src/lib/backendClient.js');

// Mock backendClient before importing the modal — focus on render contract.
vi.mock('../src/lib/backendClient.js', () => ({
  getStockAdjustment: vi.fn(),
  getStockBatch: vi.fn(),
  listStockLocations: vi.fn(),
}));

import AdjustDetailModal from '../src/components/backend/AdjustDetailModal.jsx';
import {
  getStockAdjustment,
  getStockBatch,
  listStockLocations,
} from '../src/lib/backendClient.js';

// ============================================================================
describe('Phase 15.4 AD.A — AdjustDetailModal renders + structural contract', () => {
  it('AD.A.1 — AdjustDetailModal.jsx exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/components/backend/AdjustDetailModal.jsx'))).toBe(true);
  });

  it('AD.A.2 — exports default function', () => {
    expect(typeof AdjustDetailModal).toBe('function');
  });

  it('AD.A.3 — renders Thai header "รายละเอียดการปรับสต็อก"', () => {
    expect(adjustModalSrc).toContain('รายละเอียดการปรับสต็อก');
  });

  it('AD.A.4 — has 6 standard data-testids for preview_eval addressability', () => {
    const ids = [
      'adjust-detail-modal',
      'adjust-detail-id',
      'adjust-detail-type-badge',
      'adjust-detail-date',
      'adjust-detail-branch',
      'adjust-detail-actor',
      'adjust-detail-product',
      'adjust-detail-batch',
      'adjust-detail-qty',
      'adjust-detail-close',
    ];
    for (const id of ids) {
      expect(adjustModalSrc).toContain(`data-testid="${id}"`);
    }
  });
});

// ============================================================================
describe('Phase 15.4 AD.B — backendClient.getStockAdjustment exists', () => {
  it('AD.B.1 — exported from backendClient', () => {
    expect(backendSrc).toMatch(/export\s+async\s+function\s+getStockAdjustment\(/);
  });

  it('AD.B.2 — fetches via stockAdjustmentDoc + returns null if not exists', () => {
    const fnIdx = backendSrc.indexOf('export async function getStockAdjustment');
    const body = backendSrc.slice(fnIdx, fnIdx + 400);
    expect(body).toContain('getDoc');
    expect(body).toContain('stockAdjustmentDoc');
    expect(body).toMatch(/snap\.exists\(\)\s*\?\s*\{[^}]*id:[^}]*\}\s*:\s*null/);
  });
});

// ============================================================================
describe('Phase 15.4 AD.C — StockAdjustPanel rows are clickable + open modal', () => {
  it('AD.C.1 — imports AdjustDetailModal', () => {
    expect(adjustPanelSrc).toMatch(/import\s+AdjustDetailModal\s+from\s+['"]\.\/AdjustDetailModal\.jsx['"]/);
  });

  it('AD.C.2 — has detailId state hook', () => {
    expect(adjustPanelSrc).toMatch(/const\s+\[detailId,\s*setDetailId\]\s*=\s*useState\(null\)/);
  });

  it('AD.C.3 — row onClick sets detailId', () => {
    expect(adjustPanelSrc).toMatch(/onClick=\{\(\)\s*=>\s*setDetailId\(a\.adjustmentId\)\}/);
  });

  it('AD.C.4 — row has cursor-pointer + data-testid="adjust-row"', () => {
    expect(adjustPanelSrc).toMatch(/cursor-pointer/);
    expect(adjustPanelSrc).toMatch(/data-testid="adjust-row"/);
  });

  it('AD.C.5 — modal rendered conditionally on detailId', () => {
    expect(adjustPanelSrc).toMatch(/\{detailId\s*&&\s*\(\s*<AdjustDetailModal/);
  });

  it('AD.C.6 — modal receives adjustmentId + onClose + branches', () => {
    expect(adjustPanelSrc).toMatch(/<AdjustDetailModal[\s\S]{0,300}adjustmentId=\{detailId\}/);
    expect(adjustPanelSrc).toMatch(/<AdjustDetailModal[\s\S]{0,300}onClose=\{\(\)\s*=>\s*setDetailId\(null\)\}/);
    expect(adjustPanelSrc).toMatch(/<AdjustDetailModal[\s\S]{0,300}branches=\{branches\}/);
  });
});

// ============================================================================
describe('Phase 15.4 AD.D — RTL render of AdjustDetailModal happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AD.D.1 — renders all key fields when data loads', async () => {
    getStockAdjustment.mockResolvedValue({
      id: 'adj-123',
      adjustmentId: 'adj-123',
      type: 'reduce',
      qty: 5,
      note: 'นับสต็อกพบขาด 5',
      productId: 'p-1',
      productName: 'Botox 100u',
      batchId: 'batch-abc-1234567890ab',
      branchId: 'BR-1',
      user: { userId: 'u-1', userName: 'Admin Foo' },
      createdAt: '2026-04-28T12:00:00.000+07:00',
    });
    getStockBatch.mockResolvedValue({
      batchId: 'batch-abc-1234567890ab',
      unit: 'ขวด',
      qty: { remaining: 10, total: 15 },
      originalCost: 250,
      status: 'active',
      expiresAt: '2026-12-31',
    });
    listStockLocations.mockResolvedValue([
      { id: 'BR-1', name: 'สาขาหลัก' },
    ]);

    render(<AdjustDetailModal adjustmentId="adj-123" onClose={() => {}} branches={[]} />);

    await waitFor(() => expect(screen.getByTestId('adjust-detail-product')).toBeTruthy());
    expect(screen.getByTestId('adjust-detail-id').textContent).toContain('adj-123');
    expect(screen.getByTestId('adjust-detail-product').textContent).toContain('Botox 100u');
    expect(screen.getByTestId('adjust-detail-actor').textContent).toContain('Admin Foo');
    expect(screen.getByTestId('adjust-detail-qty').textContent).toContain('5');
    // type=reduce → minus prefix
    expect(screen.getByTestId('adjust-detail-qty').textContent).toMatch(/[−-]\s*5/);
    expect(screen.getByTestId('adjust-detail-note').textContent).toContain('นับสต็อกพบขาด 5');
  });

  it('AD.D.2 — type=add renders + sign + emerald label', async () => {
    getStockAdjustment.mockResolvedValue({
      id: 'adj-2', adjustmentId: 'adj-2', type: 'add', qty: 3,
      productName: 'X', batchId: 'b-2', branchId: 'BR-1',
      user: { userName: 'A' }, createdAt: '2026-04-28T00:00:00Z',
    });
    getStockBatch.mockResolvedValue(null);
    listStockLocations.mockResolvedValue([]);
    render(<AdjustDetailModal adjustmentId="adj-2" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('adjust-detail-qty')).toBeTruthy());
    expect(screen.getByTestId('adjust-detail-qty').textContent).toContain('+');
    expect(screen.getByTestId('adjust-detail-type-badge').textContent).toContain('เพิ่ม');
  });
});

// ============================================================================
describe('Phase 15.4 AD.E — error + edge cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AD.E.1 — shows "กำลังโหลด..." while loading', () => {
    let resolve;
    getStockAdjustment.mockReturnValue(new Promise((r) => { resolve = r; }));
    listStockLocations.mockResolvedValue([]);
    render(<AdjustDetailModal adjustmentId="adj-x" onClose={() => {}} />);
    expect(screen.queryByText(/กำลังโหลด/)).toBeTruthy();
    resolve(null);
  });

  it('AD.E.2 — shows error banner when getStockAdjustment returns null', async () => {
    getStockAdjustment.mockResolvedValue(null);
    listStockLocations.mockResolvedValue([]);
    render(<AdjustDetailModal adjustmentId="adj-missing" onClose={() => {}} />);
    await waitFor(() => expect(screen.queryByText(/Adjustment not found/)).toBeTruthy());
  });

  it('AD.E.3 — handles missing batch gracefully (continues without throwing)', async () => {
    getStockAdjustment.mockResolvedValue({
      id: 'adj-3', adjustmentId: 'adj-3', type: 'add', qty: 1,
      productName: 'P', batchId: 'b-gone', branchId: 'BR-1',
      user: { userName: 'A' }, createdAt: '2026-04-28T00:00:00Z',
    });
    getStockBatch.mockRejectedValue(new Error('not found'));
    listStockLocations.mockResolvedValue([]);
    render(<AdjustDetailModal adjustmentId="adj-3" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('adjust-detail-product')).toBeTruthy());
    // batch info card should be absent
    expect(screen.queryByText(/ข้อมูล Batch ปัจจุบัน/)).toBeNull();
  });

  it('AD.E.4 — onClose callback fires when X button clicked', async () => {
    getStockAdjustment.mockResolvedValue({
      id: 'a', adjustmentId: 'a', type: 'add', qty: 1, productName: 'P',
      batchId: 'b', branchId: 'B', user: { userName: 'U' }, createdAt: '2026-04-28T00:00:00Z',
    });
    getStockBatch.mockResolvedValue(null);
    listStockLocations.mockResolvedValue([]);
    const onClose = vi.fn();
    render(<AdjustDetailModal adjustmentId="a" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('adjust-detail-close')).toBeTruthy());
    fireEvent.click(screen.getByTestId('adjust-detail-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

// ============================================================================
describe('Phase 15.4 AD.F — V12 backward compat: missing fields render gracefully', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AD.F.1 — missing user.userName renders "-"', async () => {
    getStockAdjustment.mockResolvedValue({
      id: 'a', adjustmentId: 'a', type: 'add', qty: 1, productName: 'P',
      batchId: 'b', branchId: 'B',
      // user field missing entirely (legacy doc)
      createdAt: '2026-04-28T00:00:00Z',
    });
    getStockBatch.mockResolvedValue(null);
    listStockLocations.mockResolvedValue([]);
    render(<AdjustDetailModal adjustmentId="a" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('adjust-detail-actor')).toBeTruthy());
    expect(screen.getByTestId('adjust-detail-actor').textContent).toBe('-');
  });

  it('AD.F.2 — missing note hides the note section', async () => {
    getStockAdjustment.mockResolvedValue({
      id: 'a', adjustmentId: 'a', type: 'add', qty: 1, productName: 'P',
      batchId: 'b', branchId: 'B', user: { userName: 'U' },
      // note missing
      createdAt: '2026-04-28T00:00:00Z',
    });
    getStockBatch.mockResolvedValue(null);
    listStockLocations.mockResolvedValue([]);
    render(<AdjustDetailModal adjustmentId="a" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('adjust-detail-product')).toBeTruthy());
    expect(screen.queryByTestId('adjust-detail-note')).toBeNull();
  });
});

// ============================================================================
describe('Phase 15.4 AD.G — V22 lock: branch resolved via resolveBranchName helper', () => {
  it('AD.G.1 — modal source uses resolveBranchName (no raw branch-id leak)', () => {
    expect(adjustModalSrc).toMatch(/import\s*\{\s*resolveBranchName\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/BranchContext\.jsx['"]/);
    expect(adjustModalSrc).toMatch(/resolveBranchName\(data\.branchId,\s*branches\)/);
  });
});
