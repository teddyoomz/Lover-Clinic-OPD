// tests/phase-29-recall-cdv-card-rtl.test.jsx
//
// Phase 29.12 (2026-05-14) — RTL test bank for RecallCard (CDV).
// CDV1.1-CDV4.4 covers card rendering, per-customer listener, ดูทั้งหมด toggle,
// + เพิ่ม Recall flow, footer hint, empty state.

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

import { RecallCard } from '../src/components/backend/customer-recall/RecallCard.jsx';

const customer = {
  id: 'LC-26000001',
  displayName: 'นาย Eee',
  phone: '081-1234567',
  lineUserId: 'U_xyz',
  hn: 'HN001',
};

const fixture = [
  { id: 'R1', customerId: 'LC-26000001', recallDate: '2026-05-12', status: 'pending', customerName: 'A overdue', reason: 'r1' },
  { id: 'R2', customerId: 'LC-26000001', recallDate: '2026-05-14', status: 'pending', customerName: 'B today', reason: 'r2', customerLineUserId: 'U_y' },
  { id: 'R3', customerId: 'LC-26000001', recallDate: '2026-05-20', status: 'pending', customerName: 'C upcoming', reason: 'r3' },
  { id: 'R4', customerId: 'LC-26000001', recallDate: '2026-05-10', status: 'done', customerName: 'D done', reason: 'r4' },
];

const sixRecalls = Array.from({ length: 6 }, (_, i) => ({
  id: `R${i + 10}`,
  customerId: 'LC-26000001',
  recallDate: `2026-05-${10 + i}`,
  status: 'pending',
  customerName: `Cust ${i}`,
  reason: `reason ${i}`,
}));

beforeEach(() => {
  mockUseRecallListener.mockReturnValue({ recalls: fixture, loading: false, error: '' });
});

describe('Phase 29 · CDV1 RecallCard rendering', () => {
  it('CDV1.1 renders header with Recall title + count badge', () => {
    render(<RecallCard customerId={customer.id} customer={customer} />);
    expect(screen.getByTestId('recall-card')).toBeInTheDocument();
    expect(screen.getByText('Recall')).toBeInTheDocument();
    // pendingCount = 3 (R1+R2+R3 pending; R4 done excluded)
    expect(screen.getByTestId('recall-card-count')).toHaveTextContent('3');
  });

  it('CDV1.2 renders rows for all recalls (≤5 default)', () => {
    render(<RecallCard customerId={customer.id} customer={customer} />);
    expect(screen.getByTestId('recall-row-R1')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R2')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R3')).toBeInTheDocument();
    // R4 is past + done — still in sorted list (4 < 5 limit)
    expect(screen.getByTestId('recall-row-R4')).toBeInTheDocument();
  });

  it('CDV1.3 add button present', () => {
    render(<RecallCard customerId={customer.id} customer={customer} />);
    expect(screen.getByTestId('recall-card-add')).toBeInTheDocument();
  });

  it('CDV1.4 useRecallListener called with customerId (universal mode)', () => {
    render(<RecallCard customerId="LC-XYZ" customer={customer} />);
    expect(mockUseRecallListener).toHaveBeenCalledWith({ customerId: 'LC-XYZ' });
  });

  it('CDV1.5 NO LINE button in CDV row (per spec §4.3 — admin uses Backend)', () => {
    render(<RecallCard customerId={customer.id} customer={customer} />);
    expect(screen.queryByTestId('recall-line-R2')).not.toBeInTheDocument();
  });
});

describe('Phase 29 · CDV2 sort order — overdue first, then pending, then done', () => {
  it('CDV2.1 overdue R1 renders before today R2', () => {
    render(<RecallCard customerId={customer.id} customer={customer} />);
    const rows = screen.getByTestId('recall-card').querySelectorAll('[data-testid^="recall-row-"]');
    const orderedIds = Array.from(rows).map(el => el.getAttribute('data-testid'));
    const overdueIdx = orderedIds.indexOf('recall-row-R1');
    const todayIdx = orderedIds.indexOf('recall-row-R2');
    expect(overdueIdx).toBeLessThan(todayIdx);
  });

  it('CDV2.2 done R4 renders LAST (after pending rows)', () => {
    render(<RecallCard customerId={customer.id} customer={customer} />);
    const rows = screen.getByTestId('recall-card').querySelectorAll('[data-testid^="recall-row-"]');
    const orderedIds = Array.from(rows).map(el => el.getAttribute('data-testid'));
    const doneIdx = orderedIds.indexOf('recall-row-R4');
    const todayIdx = orderedIds.indexOf('recall-row-R2');
    expect(doneIdx).toBeGreaterThan(todayIdx);
  });
});

describe('Phase 29 · CDV3 ดูทั้งหมด expand', () => {
  beforeEach(() => {
    mockUseRecallListener.mockReturnValue({ recalls: sixRecalls, loading: false, error: '' });
  });

  it('CDV3.1 ดูทั้งหมด button visible when > 5 recalls', () => {
    render(<RecallCard customerId={customer.id} customer={customer} />);
    expect(screen.getByTestId('recall-card-view-all')).toBeInTheDocument();
  });

  it('CDV3.2 default shows only first 5 + footer hint', () => {
    render(<RecallCard customerId={customer.id} customer={customer} />);
    const rows = screen.getAllByTestId(/^recall-row-/);
    expect(rows).toHaveLength(5);
    expect(screen.getByTestId('recall-card-footer-hint')).toHaveTextContent('1');
  });

  it('CDV3.3 click ดูทั้งหมด expands to all 6 + hides hint', async () => {
    const user = userEvent.setup();
    render(<RecallCard customerId={customer.id} customer={customer} />);
    await user.click(screen.getByTestId('recall-card-view-all'));
    const rows = screen.getAllByTestId(/^recall-row-/);
    expect(rows).toHaveLength(6);
    expect(screen.queryByTestId('recall-card-footer-hint')).not.toBeInTheDocument();
  });

  it('CDV3.4 ดูทั้งหมด HIDDEN when ≤ 5 recalls', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: fixture, loading: false, error: '' });
    render(<RecallCard customerId={customer.id} customer={customer} />);
    expect(screen.queryByTestId('recall-card-view-all')).not.toBeInTheDocument();
  });
});

describe('Phase 29 · CDV4 add flow + empty + loading + error', () => {
  it('CDV4.1 + เพิ่ม Recall opens create modal pre-filled with customer', async () => {
    const user = userEvent.setup();
    render(<RecallCard customerId={customer.id} customer={customer} />);
    await user.click(screen.getByTestId('recall-card-add'));
    expect(screen.getByTestId('recall-create-modal')).toBeInTheDocument();
    // Customer name + LC id appear in modal header
    const modal = screen.getByTestId('recall-create-modal');
    expect(modal.textContent).toMatch(/นาย Eee/);
    expect(modal.textContent).toMatch(/LC-26000001/);
  });

  it('CDV4.2 empty state when no recalls', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: false, error: '' });
    render(<RecallCard customerId={customer.id} customer={customer} />);
    expect(screen.getByTestId('recall-card-empty')).toBeInTheDocument();
  });

  it('CDV4.3 loading state', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: true, error: '' });
    render(<RecallCard customerId={customer.id} customer={customer} />);
    expect(screen.getByTestId('recall-card-loading')).toBeInTheDocument();
  });

  it('CDV4.4 error banner', () => {
    mockUseRecallListener.mockReturnValueOnce({ recalls: [], loading: false, error: 'fetch-failed' });
    render(<RecallCard customerId={customer.id} customer={customer} />);
    expect(screen.getByTestId('recall-card-error')).toHaveTextContent('fetch-failed');
  });

  it('CDV4.5 row click opens outcome modal', async () => {
    const user = userEvent.setup();
    render(<RecallCard customerId={customer.id} customer={customer} />);
    // Phase 29.23 Task 3 V21-class fixup: customer-name is now <a> with
    // stopPropagation → click row OUTER (data-testid="recall-row-<id>") to
    // hit the outcome-modal handler instead of the new-tab link.
    // Fixture "A overdue" maps to recall id 'R1' (see fixture above).
    await user.click(screen.getByTestId('recall-row-R1'));
    expect(screen.getByTestId('recall-outcome-modal')).toBeInTheDocument();
  });
});
