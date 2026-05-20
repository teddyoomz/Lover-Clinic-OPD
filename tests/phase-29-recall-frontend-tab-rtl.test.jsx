// tests/phase-29-recall-frontend-tab-rtl.test.jsx
//
// Phase 29.11 (2026-05-14) — RTL test bank for RecallFrontendView + RecallTogglePill.
// F1.1-F4.3 covers compact-mode bucket filtering, frontend create flow,
// modal wire, badge count for toggle pill.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUseRecallListener = vi.fn();

vi.mock('../src/hooks/useRecallListener.js', () => ({
  useRecallListener: (...args) => mockUseRecallListener(...args),
}));

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  createRecall: vi.fn(async () => ({ id: 'RECALL-mock' })),
  createRecallPair: vi.fn(async () => ({ id1: 'R1', id2: 'R2' })),
  recordRecallOutcome: vi.fn(async () => {}),
  recordRecallLineSend: vi.fn(async () => {}),
  snoozeRecall: vi.fn(async () => {}),
  // 2026-05-20 (Q2=B) — RecallOutcomeModal staff dropdown.
  listStaff: vi.fn(async () => [{ id: 'S1', firstName: 'พิมพ์ชนก', lastName: 'ใจดี' }]),
  // Phase 29.22 (2026-05-14) — useRecallCases shared hook reads these.
  listRecallCases: vi.fn(async () => []),
  saveRecallCase: vi.fn(async () => ({ id: 'CASE-mock' })),
  setRecallCaseHidden: vi.fn(async () => {}),
  // Phase 29.21-fix2 customer picker — RecallCreateModal needs this.
  getAllCustomers: vi.fn(async () => []),
}));

vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return { ...actual, thaiTodayISO: () => '2026-05-14' };
});

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'TEST', getIdToken: async () => 'mock' } },
  db: {},
  appId: 'loverclinic-opd-4c39b',
}));

import { RecallFrontendView } from '../src/components/backend/recall/RecallFrontendView.jsx';
import { RecallTogglePill } from '../src/components/backend/recall/RecallTogglePill.jsx';

const fixture = [
  { id: 'O1', recallDate: '2026-05-12', status: 'pending', customerName: 'A overdue', reason: 'r1' },
  { id: 'T1', recallDate: '2026-05-14', status: 'pending', customerName: 'B today', reason: 'r2', customerLineUserId: 'U_y' },
  // 2026-05-20: "Recall วันนี้" compact now shows tomorrow too; later stays hidden
  { id: 'TM1', recallDate: '2026-05-15', status: 'pending', customerName: 'C tomorrow', reason: 'r3' },
  { id: 'LT1', recallDate: '2026-06-14', status: 'pending', customerName: 'D later', reason: 'r4' },
  // Done — shouldn't count
  { id: 'D1', recallDate: '2026-05-10', status: 'done', customerName: 'E done', reason: 'r5' },
];

beforeEach(() => {
  mockUseRecallListener.mockReturnValue({ recalls: fixture, loading: false, error: '' });
});

describe('Phase 29 · F1 RecallFrontendView compact rendering', () => {
  it('F1.1 renders today + overdue + tomorrow sections (NO thisWeek/later) — 2026-05-20 Recall วันนี้', () => {
    render(<RecallFrontendView />);
    expect(screen.getByTestId('recall-section-today')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-overdue')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-tomorrow')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-section-thisWeek')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recall-section-later')).not.toBeInTheDocument();
  });

  it('F1.1b today section is prominent (data-prominent="true")', () => {
    render(<RecallFrontendView />);
    expect(screen.getByTestId('recall-section-today')).toHaveAttribute('data-prominent', 'true');
    expect(screen.getByTestId('recall-section-overdue')).toHaveAttribute('data-prominent', 'false');
  });

  it('F1.1c "Recall วันนี้" heading rendered', () => {
    render(<RecallFrontendView />);
    expect(screen.getByTestId('recall-frontend-heading')).toHaveTextContent('Recall วันนี้');
  });

  it('F1.2 list mode is compact', () => {
    render(<RecallFrontendView />);
    expect(screen.getByTestId('recall-list')).toHaveAttribute('data-mode', 'compact');
  });

  it('F1.3 footer hint rendered', () => {
    render(<RecallFrontendView />);
    expect(screen.getByText(/ดู recall อนาคต/)).toBeInTheDocument();
    expect(screen.getByText(/Backend/)).toBeInTheDocument();
  });

  it('F1.4 create button at footer', () => {
    render(<RecallFrontendView />);
    expect(screen.getByTestId('recall-frontend-create')).toBeInTheDocument();
  });

  it('F1.5 rows render for today + overdue + tomorrow (NOT later) — 2026-05-20', () => {
    render(<RecallFrontendView />);
    expect(screen.getByTestId('recall-row-O1')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-T1')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-TM1')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-row-LT1')).not.toBeInTheDocument();
  });
});

describe('Phase 29 · F2 RecallFrontendView interactions', () => {
  it('F2.1 create button opens create modal', async () => {
    const user = userEvent.setup();
    render(<RecallFrontendView />);
    await user.click(screen.getByTestId('recall-frontend-create'));
    expect(screen.getByTestId('recall-create-modal')).toBeInTheDocument();
  });

  it('F2.2 click row opens outcome modal', async () => {
    // V72 (2026-05-16): RecallRow renders mobile + desktop header trees
    // (jsdom keeps both — CSS @media not applied). Click the first match.
    const user = userEvent.setup();
    render(<RecallFrontendView />);
    await user.click(screen.getAllByText('A overdue')[0]);
    expect(screen.getByTestId('recall-outcome-modal')).toBeInTheDocument();
  });

  it('F2.3 click LINE chip opens LINE template modal', async () => {
    const user = userEvent.setup();
    render(<RecallFrontendView />);
    await user.click(screen.getByTestId('recall-line-T1'));
    expect(screen.getByTestId('recall-line-template-modal')).toBeInTheDocument();
  });

  it('F2.4 click snooze chip opens snooze menu', async () => {
    const user = userEvent.setup();
    render(<RecallFrontendView />);
    await user.click(screen.getByTestId('recall-snooze-O1'));
    expect(screen.getByTestId('recall-snooze-menu')).toBeInTheDocument();
  });
});

describe('Phase 29 · F3 RecallFrontendView empty + loading + error states', () => {
  it('F3.1 loading state', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: true, error: '' });
    render(<RecallFrontendView />);
    expect(screen.getByTestId('recall-frontend-loading')).toBeInTheDocument();
  });

  it('F3.2 error banner', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: false, error: 'failed' });
    render(<RecallFrontendView />);
    expect(screen.getByTestId('recall-frontend-error')).toHaveTextContent('failed');
  });

  it('F3.3 empty list renders empty state', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: false, error: '' });
    render(<RecallFrontendView />);
    expect(screen.getByTestId('recall-empty-state')).toBeInTheDocument();
  });
});

describe('Phase 29 · F4 RecallTogglePill', () => {
  it('F4.1 pill renders with active prop', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<RecallTogglePill active={false} onClick={onClick} />);
    expect(screen.getByTestId('appt-view-toggle-recall')).toBeInTheDocument();
    expect(screen.getByText(/Recall/)).toBeInTheDocument();
    await user.click(screen.getByTestId('appt-view-toggle-recall'));
    expect(onClick).toHaveBeenCalled();
  });

  it('F4.2 count badge shows when count > 0', () => {
    mockUseRecallListener.mockReturnValue({ recalls: fixture, loading: false, error: '' });
    render(<RecallTogglePill active={false} onClick={() => {}} />);
    expect(screen.getByTestId('appt-view-toggle-recall-badge')).toBeInTheDocument();
    // fixture has 2 today-or-earlier-not-done: O1 (overdue) + T1 (today)
    // E1 (done) excluded, TM1 + LT1 (future) excluded
    expect(screen.getByTestId('appt-view-toggle-recall-badge')).toHaveTextContent('2');
  });

  it('F4.3 count badge HIDDEN when count = 0', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: false, error: '' });
    render(<RecallTogglePill active={false} onClick={() => {}} />);
    expect(screen.queryByTestId('appt-view-toggle-recall-badge')).not.toBeInTheDocument();
  });

  it('F4.4 active pill has fire-red bg styling', () => {
    render(<RecallTogglePill active={true} onClick={() => {}} />);
    const pill = screen.getByTestId('appt-view-toggle-recall');
    expect(pill.className).toMatch(/bg-red-600/);
  });
});
