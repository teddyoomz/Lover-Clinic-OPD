// tests/phase-29-recall-tab-rtl.test.jsx
//
// Phase 29.10 (2026-05-14) — RTL test bank for RecallTab + RecallHeader.
// T1-T5 covering composer wiring, search filter, create button, branch-aware
// listener subscription, error/loading states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the hook BEFORE importing RecallTab
const mockUseRecallListener = vi.fn();
vi.mock('../src/hooks/useRecallListener.js', () => ({
  useRecallListener: (...args) => mockUseRecallListener(...args),
}));

// Mock scopedDataLayer functions used downstream
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  createRecall: vi.fn(async () => ({ id: 'RECALL-mock-1' })),
  createRecallPair: vi.fn(async () => ({ id1: 'RECALL-1', id2: 'RECALL-2' })),
  recordRecallOutcome: vi.fn(async () => {}),
  recordRecallLineSend: vi.fn(async () => {}),
  snoozeRecall: vi.fn(async () => {}),
}));

// Mock thaiTodayISO + firebase auth
vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return { ...actual, thaiTodayISO: () => '2026-05-14' };
});

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'TEST', getIdToken: async () => 'mock-tok' } },
  db: {},
  appId: 'loverclinic-opd-4c39b',
}));

// Phase 29.22 (2026-05-14) — RecallTab now imports useTabAccess for the
// "จัดการเคส" sub-pill gate. Mock it as admin so existing T1-T5 tests
// continue to exercise the list view; sub-pill behaviour is covered
// by tests/phase-29-22-recall-tab-cases-view.test.jsx.
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: () => ({
    isAdmin: true,
    permissions: {},
    loaded: true,
    hasPermission: () => true,
  }),
}));

import { RecallTab } from '../src/components/backend/recall/RecallTab.jsx';

const sampleRecalls = [
  { id: 'R1', recallDate: '2026-05-12', status: 'pending', customerName: 'A overdue', reason: 'ฟิลเลอร์', customerLineUserId: null },
  { id: 'R2', recallDate: '2026-05-14', status: 'pending', customerName: 'B today', reason: 'botox', customerLineUserId: 'U_y' },
  { id: 'R3', recallDate: '2026-05-15', status: 'pending', customerName: 'C tomorrow', reason: 'PRP', customerLineUserId: null },
];

beforeEach(() => {
  mockUseRecallListener.mockReturnValue({ recalls: sampleRecalls, loading: false, error: '' });
});

describe('Phase 29 · T1 RecallTab composer', () => {
  it('T1.1 renders header + list', () => {
    render(<RecallTab />);
    expect(screen.getByTestId('recall-tab')).toBeInTheDocument();
    expect(screen.getByTestId('recall-header')).toBeInTheDocument();
    expect(screen.getByTestId('recall-list')).toBeInTheDocument();
  });

  it('T1.2 header count matches recalls', () => {
    render(<RecallTab />);
    expect(screen.getByTestId('recall-header-count')).toHaveTextContent('3');
  });

  it('T1.3 5-bucket sections render correctly', () => {
    render(<RecallTab />);
    expect(screen.getByTestId('recall-section-overdue')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-today')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-tomorrow')).toBeInTheDocument();
  });

  it('T1.4 rows render with stable id keys', () => {
    render(<RecallTab />);
    expect(screen.getByTestId('recall-row-R1')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R2')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R3')).toBeInTheDocument();
  });

  it('T1.5 useRecallListener invoked with empty filters', () => {
    render(<RecallTab />);
    expect(mockUseRecallListener).toHaveBeenCalledWith({ filters: {} });
  });
});

describe('Phase 29 · T2 search filter', () => {
  it('T2.1 search by customer name', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.type(screen.getByTestId('recall-header-search'), 'overdue');
    expect(screen.getByTestId('recall-row-R1')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-row-R2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recall-row-R3')).not.toBeInTheDocument();
  });

  it('T2.2 search by reason', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.type(screen.getByTestId('recall-header-search'), 'botox');
    expect(screen.queryByTestId('recall-row-R1')).not.toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R2')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-row-R3')).not.toBeInTheDocument();
  });

  it('T2.3 search case-insensitive', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.type(screen.getByTestId('recall-header-search'), 'TODAY');
    expect(screen.getByTestId('recall-row-R2')).toBeInTheDocument();
  });

  it('T2.4 empty search → all rows visible', () => {
    render(<RecallTab />);
    expect(screen.getByTestId('recall-row-R1')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R2')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R3')).toBeInTheDocument();
  });
});

describe('Phase 29 · T3 create flow', () => {
  it('T3.1 create button opens create modal', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.click(screen.getByTestId('recall-header-create'));
    expect(screen.getByTestId('recall-create-modal')).toBeInTheDocument();
  });

  it('T3.2 close create modal hides it', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.click(screen.getByTestId('recall-header-create'));
    expect(screen.getByTestId('recall-create-modal')).toBeInTheDocument();
    await user.click(screen.getByTestId('recall-create-close'));
    expect(screen.queryByTestId('recall-create-modal')).not.toBeInTheDocument();
  });
});

describe('Phase 29 · T4 row interactions', () => {
  it('T4.1 click record button opens outcome modal', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.click(screen.getByTestId('recall-record-R1'));
    const modal = screen.getByTestId('recall-outcome-modal');
    expect(modal).toBeInTheDocument();
    // Customer name appears in both row + modal header — scope to modal
    expect(modal.textContent).toMatch(/A overdue/);
  });

  it('T4.2 click LINE button opens template modal (when lineUserId)', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.click(screen.getByTestId('recall-line-R2'));
    expect(screen.getByTestId('recall-line-template-modal')).toBeInTheDocument();
  });

  it('T4.3 click snooze button opens snooze menu', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.click(screen.getByTestId('recall-snooze-R1'));
    expect(screen.getByTestId('recall-snooze-menu')).toBeInTheDocument();
  });

  it('T4.4 click row body opens outcome modal', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.click(screen.getByText('A overdue'));
    expect(screen.getByTestId('recall-outcome-modal')).toBeInTheDocument();
  });
});

describe('Phase 29 · T5 loading + error states', () => {
  it('T5.1 loading state renders skeleton', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: true, error: '' });
    render(<RecallTab />);
    expect(screen.getByTestId('recall-tab-loading')).toBeInTheDocument();
  });

  it('T5.2 error banner renders when listener fails', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: false, error: 'fetch-failed' });
    render(<RecallTab />);
    expect(screen.getByTestId('recall-tab-error')).toHaveTextContent('fetch-failed');
  });

  it('T5.3 empty list renders empty state', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: false, error: '' });
    render(<RecallTab />);
    expect(screen.getByTestId('recall-empty-state')).toBeInTheDocument();
  });
});
