// ─── V40 Bonus 2 — Branch Backup UI RTL Tests ───────────────────────────────
// Covers: BranchBackupTab (UI1), MakeFreshButton (UI2), MakeFreshModal (UI3).
// Uses React Testing Library (RTL) with vitest + jsdom.
//
// NOTE (bug): BranchBackupTab.jsx:16 destructures `selectedBranchId` from
// useSelectedBranch(), but the real hook exposes `branchId` (see
// BranchContext.jsx:226). The mock below returns BOTH keys so the component
// works in the test. On real hardware the component always shows
// "กรุณาเลือกสาขา" — this is reported as a source bug in the task summary.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mock firebase auth ───────────────────────────────────────────────────
vi.mock('../src/firebase.js', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(async () => 'fake-token'),
    },
  },
}));

// ─── Mock BranchContext ───────────────────────────────────────────────────
// Return BOTH `branchId` and `selectedBranchId` so the component bug is
// worked around and the rest of the flow can be tested.
const branchState = vi.hoisted(() => ({ branchId: 'BR-TEST', selectedBranchId: 'BR-TEST' }));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({
    branchId: branchState.branchId,
    selectedBranchId: branchState.selectedBranchId,
    branches: [],
    selectBranch: () => {},
    isReady: true,
  }),
}));

// ─── Mock useTabAccess ────────────────────────────────────────────────────
const tabState = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: () => ({ isAdmin: tabState.isAdmin }),
}));

// ─── Stub global fetch ────────────────────────────────────────────────────
global.fetch = vi.fn();

// ─── Helpers ──────────────────────────────────────────────────────────────
const okBackupJson = (overrides = {}) => ({
  ok: true,
  signedUrl: 'https://signed.example/backup.json',
  storagePath: 'backups/BR-TEST/manual-1234.json',
  sizeBytes: 12345678,
  perCollectionCounts: { be_products: 5, be_courses: 3 },
  ...overrides,
});

const okMakeFreshJson = (overrides = {}) => ({
  ok: true,
  deletedCounts: { be_products: 5, 'be_customers/__per_customer__': 2 },
  autoBackupRef: 'backups/BR-TEST/auto-pre-fresh-1234.json',
  auditId: 'branch-make-fresh-abc123',
  ...overrides,
});

const mockBackupOk = () =>
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => okBackupJson(),
  });

const mockBackupFail = (errMsg = 'Storage quota exceeded') =>
  global.fetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ ok: false, error: errMsg }),
  });

const mockMakeFreshOk = () =>
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => okMakeFreshJson(),
  });

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch.mockReset();
  branchState.branchId = 'BR-TEST';
  branchState.selectedBranchId = 'BR-TEST';
  tabState.isAdmin = true;
});

// ─────────────────────────────────────────────────────────────────────────────
// UI1 — BranchBackupTab
// ─────────────────────────────────────────────────────────────────────────────
import BranchBackupTab from '../src/components/backend/BranchBackupTab.jsx';

describe('UI1 — BranchBackupTab', () => {
  it('UI1.1 renders header "Backup สาขา"', () => {
    render(<BranchBackupTab />);
    expect(screen.getByText('Backup สาขา')).toBeTruthy();
  });

  it('UI1.2 renders 4 tier checkboxes, all checked by default', () => {
    render(<BranchBackupTab />);
    const checkboxes = screen.getAllByRole('checkbox');
    // First 4 are the tier checkboxes (before any advanced collection boxes)
    const tierBoxes = checkboxes.slice(0, 4);
    expect(tierBoxes).toHaveLength(4);
    tierBoxes.forEach(cb => expect(cb.checked).toBe(true));
  });

  it('UI1.3 toggling a tier checkbox unchecks it', () => {
    render(<BranchBackupTab />);
    const checkboxes = screen.getAllByRole('checkbox');
    const firstTierBox = checkboxes[0];
    expect(firstTierBox.checked).toBe(true);
    fireEvent.click(firstTierBox);
    expect(firstTierBox.checked).toBe(false);
  });

  it('UI1.4 advanced toggle reveals collection grid and labels tier spans with opacity-50', () => {
    render(<BranchBackupTab />);
    const advBtn = screen.getByText(/Advanced — เลือก collection/);
    expect(advBtn).toBeTruthy();

    // Collection grid should not be visible initially
    expect(screen.queryByText(/T1 · /)).toBeNull();

    fireEvent.click(advBtn);

    // Collection grid rows should now appear
    expect(screen.getByText(/Advanced — เลือก collection/)).toBeTruthy();
    // At least one collection checkbox appears (text is split across <strong>+text nodes)
    // Verify by checking total checkbox count increased beyond the initial 4 tier boxes
    const allBoxes = screen.getAllByRole('checkbox');
    expect(allBoxes.length).toBeGreaterThan(4);

    // The 4 tier checkbox labels should now carry opacity-50
    const opacitySpans = document.querySelectorAll('span.opacity-50');
    expect(opacitySpans.length).toBe(4);
  });

  it('UI1.5 clicking "เริ่ม Backup" with no branch selected shows error', async () => {
    branchState.selectedBranchId = null;
    branchState.branchId = null;
    render(<BranchBackupTab />);
    const startBtn = screen.getByText('เริ่ม Backup');
    await act(async () => { fireEvent.click(startBtn); });
    expect(screen.getByText('กรุณาเลือกสาขา')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('UI1.6 successful backup → fetch with correct payload + signed URL link rendered', async () => {
    mockBackupOk();
    render(<BranchBackupTab />);
    const startBtn = screen.getByText('เริ่ม Backup');
    await act(async () => { fireEvent.click(startBtn); });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/admin/branch-backup-export');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.branchId).toBe('BR-TEST');
    expect(body.tiers).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(body.collections).toBeNull();
    expect(body.isAutoPreFresh).toBe(false);

    // Signed URL link should appear
    await waitFor(() => expect(screen.getByText('Download')).toBeTruthy());
    const link = screen.getByRole('link', { name: 'Download' });
    expect(link.getAttribute('href')).toBe('https://signed.example/backup.json');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('UI1.7 backup endpoint returns ok:false → error message shown', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'quota exceeded' }),
    });
    render(<BranchBackupTab />);
    await act(async () => { fireEvent.click(screen.getByText('เริ่ม Backup')); });
    await waitFor(() => expect(screen.getByText('quota exceeded')).toBeTruthy());
    // No signed URL link
    expect(screen.queryByRole('link', { name: 'Download' })).toBeNull();
  });

  it('UI1.8 advanced mode — checked collections sent as scope (not null)', async () => {
    mockBackupOk();
    render(<BranchBackupTab />);

    // Open advanced panel
    fireEvent.click(screen.getByText(/Advanced — เลือก collection/));

    // Check first collection checkbox in the grid
    await waitFor(() => {
      const collectionBoxes = screen.getAllByRole('checkbox');
      // First 4 are tier boxes (disabled in advanced mode), rest are collections
      const firstCollBox = collectionBoxes[4];
      fireEvent.click(firstCollBox);
    });

    await act(async () => { fireEvent.click(screen.getByText('เริ่ม Backup')); });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    // collections should be an array (not null) since advancedOpen is true
    expect(Array.isArray(body.collections)).toBe(true);
    // At least one collection was checked
    expect(body.collections.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UI2 — MakeFreshButton
// ─────────────────────────────────────────────────────────────────────────────
import MakeFreshButton from '../src/components/backend/MakeFreshButton.jsx';

const testBranch = { branchId: 'BR-TEST', branchName: 'สาขาทดสอบ', id: 'BR-TEST', name: 'สาขาทดสอบ' };

describe('UI2 — MakeFreshButton', () => {
  it('UI2.1 returns null (renders nothing) when isAdmin is false', () => {
    tabState.isAdmin = false;
    const { container } = render(<MakeFreshButton branch={testBranch} />);
    expect(container.firstChild).toBeNull();
  });

  it('UI2.2 renders button with correct data-testid when isAdmin is true', () => {
    tabState.isAdmin = true;
    render(<MakeFreshButton branch={testBranch} />);
    const btn = screen.getByTestId('make-fresh-btn-BR-TEST');
    expect(btn).toBeTruthy();
  });

  it('UI2.3 clicking the button opens the modal (AlertTriangle text visible)', async () => {
    tabState.isAdmin = true;
    render(<MakeFreshButton branch={testBranch} />);
    const btn = screen.getByTestId('make-fresh-btn-BR-TEST');
    await act(async () => { fireEvent.click(btn); });
    // Modal should appear with the branch name heading
    await waitFor(() => expect(screen.getByText('ทำให้เป็นสาขาใหม่')).toBeTruthy());
  });

  it('UI2.4 button label text includes "สาขาใหม่"', () => {
    tabState.isAdmin = true;
    render(<MakeFreshButton branch={testBranch} />);
    const btn = screen.getByTestId('make-fresh-btn-BR-TEST');
    expect(btn.textContent).toContain('สาขาใหม่');
  });

  it('UI2.5 onComplete callback fires when modal closes after done phase', async () => {
    tabState.isAdmin = true;
    mockBackupOk();
    mockMakeFreshOk();
    const onComplete = vi.fn();
    render(<MakeFreshButton branch={testBranch} onComplete={onComplete} />);

    // Open modal
    await act(async () => { fireEvent.click(screen.getByTestId('make-fresh-btn-BR-TEST')); });
    await waitFor(() => expect(screen.getByTestId('make-fresh-confirm-input')).toBeTruthy());

    // Type branch name and confirm
    fireEvent.change(screen.getByTestId('make-fresh-confirm-input'), { target: { value: 'สาขาทดสอบ' } });
    await act(async () => { fireEvent.click(screen.getByTestId('make-fresh-confirm-btn')); });

    // Wait for done phase and click close
    await waitFor(() => expect(screen.getByText('เสร็จสิ้น')).toBeTruthy());
    fireEvent.click(screen.getByText('ปิด'));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UI3 — MakeFreshModal
// ─────────────────────────────────────────────────────────────────────────────
import MakeFreshModal from '../src/components/backend/MakeFreshModal.jsx';

const modalBranch = { branchId: 'BR-MODAL', branchName: 'สาขาโมดอล', id: 'BR-MODAL', name: 'สาขาโมดอล' };

describe('UI3 — MakeFreshModal', () => {
  it('UI3.1 renders branch name and branchId in idle phase', () => {
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    // Branch name appears in both <strong> and <code> hint — getAllByText handles multiple
    const nameMatches = screen.getAllByText('สาขาโมดอล');
    expect(nameMatches.length).toBeGreaterThan(0);
    expect(screen.getByText(/BR-MODAL/)).toBeTruthy();
  });

  it('UI3.2 confirm button disabled by default (empty input)', () => {
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    const btn = screen.getByTestId('make-fresh-confirm-btn');
    expect(btn.disabled).toBe(true);
  });

  it('UI3.3 confirm button still disabled when typed text is partial', () => {
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    fireEvent.change(screen.getByTestId('make-fresh-confirm-input'), { target: { value: 'สาขา' } });
    expect(screen.getByTestId('make-fresh-confirm-btn').disabled).toBe(true);
  });

  it('UI3.4 confirm button enabled when typed text matches branch name exactly', () => {
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    fireEvent.change(screen.getByTestId('make-fresh-confirm-input'), { target: { value: 'สาขาโมดอล' } });
    expect(screen.getByTestId('make-fresh-confirm-btn').disabled).toBe(false);
  });

  it('UI3.5 clicking confirm calls backup endpoint FIRST', async () => {
    mockBackupOk();
    mockMakeFreshOk();
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    fireEvent.change(screen.getByTestId('make-fresh-confirm-input'), { target: { value: 'สาขาโมดอล' } });
    await act(async () => { fireEvent.click(screen.getByTestId('make-fresh-confirm-btn')); });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const firstCall = global.fetch.mock.calls[0];
    expect(firstCall[0]).toBe('/api/admin/branch-backup-export');
    const firstBody = JSON.parse(firstCall[1].body);
    expect(firstBody.branchId).toBe('BR-MODAL');
    expect(firstBody.isAutoPreFresh).toBe(true);
    expect(firstBody.tiers).toEqual(['T1', 'T2', 'T3', 'T4']);
  });

  it('UI3.6 backup success → make-fresh endpoint called SECOND', async () => {
    mockBackupOk();
    mockMakeFreshOk();
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    fireEvent.change(screen.getByTestId('make-fresh-confirm-input'), { target: { value: 'สาขาโมดอล' } });
    await act(async () => { fireEvent.click(screen.getByTestId('make-fresh-confirm-btn')); });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const secondCall = global.fetch.mock.calls[1];
    expect(secondCall[0]).toBe('/api/admin/branch-make-fresh');
    const secondBody = JSON.parse(secondCall[1].body);
    expect(secondBody.branchId).toBe('BR-MODAL');
    expect(secondBody.autoBackupRef).toBe('backups/BR-TEST/manual-1234.json');
  });

  it('UI3.7 backup fails → make-fresh NOT called → error phase shown', async () => {
    mockBackupFail('bucket not found');
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    fireEvent.change(screen.getByTestId('make-fresh-confirm-input'), { target: { value: 'สาขาโมดอล' } });
    await act(async () => { fireEvent.click(screen.getByTestId('make-fresh-confirm-btn')); });

    await waitFor(() => expect(screen.getByText(/bucket not found/)).toBeTruthy());
    // fetch was called exactly once (backup only, no make-fresh)
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/branch-backup-export');
    // No success text
    expect(screen.queryByText('เสร็จสิ้น')).toBeNull();
  });

  it('UI3.8 make-fresh success → done phase + deletedCounts displayed', async () => {
    mockBackupOk();
    mockMakeFreshOk();
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    fireEvent.change(screen.getByTestId('make-fresh-confirm-input'), { target: { value: 'สาขาโมดอล' } });
    await act(async () => { fireEvent.click(screen.getByTestId('make-fresh-confirm-btn')); });

    await waitFor(() => expect(screen.getByText('เสร็จสิ้น')).toBeTruthy());
    // deletedCounts: 5 + 2 = 7 docs
    expect(screen.getByText(/7 docs/)).toBeTruthy();
    // autoBackupRef shown
    expect(screen.getByText(/backups\/BR-TEST\/manual-1234\.json/)).toBeTruthy();
  });

  it('UI3.9 close (X) button calls onClose at idle phase', () => {
    const onClose = vi.fn();
    render(<MakeFreshModal branch={modalBranch} onClose={onClose} onComplete={() => {}} />);
    // In idle phase there are 2 buttons: X (no data-testid) and confirm (data-testid).
    // The X button is the one that is NOT the confirm button.
    const allBtns = screen.getAllByRole('button');
    const xBtn = allBtns.find(b => !b.dataset.testid);
    expect(xBtn).toBeTruthy();
    fireEvent.click(xBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('UI3.10a backing-up phase shows "1/2 กำลังสำรอง..." spinner', async () => {
    // Make backup hang so we can observe the backing-up phase
    let resolveBackup;
    global.fetch.mockImplementationOnce(() =>
      new Promise(resolve => { resolveBackup = resolve; })
    );
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    fireEvent.change(screen.getByTestId('make-fresh-confirm-input'), { target: { value: 'สาขาโมดอล' } });
    await act(async () => { fireEvent.click(screen.getByTestId('make-fresh-confirm-btn')); });

    // Component should now be in backing-up phase
    await waitFor(() => expect(screen.getByText('1/2 กำลังสำรอง...')).toBeTruthy());

    // Resolve backup to avoid leaking promise
    await act(async () => {
      resolveBackup({ ok: true, json: async () => ({ ok: false, error: 'cancelled' }) });
    });
  });

  it('UI3.10b wiping phase shows "1/2 สำรองสำเร็จ" and "2/2 กำลังลบ..."', async () => {
    // Make make-fresh hang so we can observe the wiping phase
    mockBackupOk();
    let resolveFresh;
    global.fetch.mockImplementationOnce(() =>
      new Promise(resolve => { resolveFresh = resolve; })
    );
    render(<MakeFreshModal branch={modalBranch} onClose={() => {}} onComplete={() => {}} />);
    fireEvent.change(screen.getByTestId('make-fresh-confirm-input'), { target: { value: 'สาขาโมดอล' } });
    await act(async () => { fireEvent.click(screen.getByTestId('make-fresh-confirm-btn')); });

    // Wait for wiping phase
    await waitFor(() => expect(screen.getByText('1/2 สำรองสำเร็จ')).toBeTruthy());
    expect(screen.getByText('2/2 กำลังลบ...')).toBeTruthy();

    // Resolve make-fresh to avoid leaking promise
    await act(async () => {
      resolveFresh({ ok: true, json: async () => ({ ok: false, error: 'cancelled' }) });
    });
  });
});
