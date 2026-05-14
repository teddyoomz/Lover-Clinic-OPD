// tests/phase-29-recall-multi-surface-realtime.test.jsx
//
// Phase 29.14 (2026-05-14) — Multi-surface real-time integration tests
// (Layer 5 per spec §9). The CRITICAL layer per user directive — Phase 29
// is the FIRST feature with 3 simultaneous Firestore listener surfaces
// (Backend RecallTab + Frontend RecallFrontendView + CDV RecallCard).
//
// MS1-MS10 enforces anti-flicker discipline: simultaneous render across
// all 3 surfaces, listener swap doesn't unmount rows with stable id keys,
// optimistic updates merge silently, branch-switch isolation, modal
// portal-out doesn't unmount the parent list.
//
// "If admin reports 'list flickers when X happens', the bug is class-of-bug
// 'key instability' or 'useEffect dep churn' — investigate listener setup
// + memo deps before component logic." — spec §14 institutional memory

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';

// Mock the listener hook with a programmable response. Each test can call
// `setListenerResponse(...)` to swap data on the fly (simulating a Firestore
// onSnapshot fire); React re-renders all consumers.
const listenerResponses = new Map(); // key → {recalls, loading, error}

function makeKey(args) {
  return JSON.stringify(args || {});
}

const mockUseRecallListener = vi.fn((args) => {
  const key = makeKey(args);
  return listenerResponses.get(key) || listenerResponses.get('__default__') || { recalls: [], loading: false, error: '' };
});

vi.mock('../src/hooks/useRecallListener.js', () => ({
  useRecallListener: (...args) => mockUseRecallListener(...args),
}));

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  createRecall: vi.fn(async () => ({ id: 'RECALL-mock' })),
  createRecallPair: vi.fn(async () => ({ id1: 'R-new-1', id2: 'R-new-2' })),
  recordRecallOutcome: vi.fn(async () => {}),
  recordRecallLineSend: vi.fn(async () => {}),
  snoozeRecall: vi.fn(async () => {}),
  // Phase 29.22 (2026-05-14) — useRecallCases hook reads these.
  listRecallCases: vi.fn(async () => []),
  saveRecallCase: vi.fn(async () => ({ id: 'CASE-mock' })),
  setRecallCaseHidden: vi.fn(async () => {}),
  // Phase 29.21-fix2 customer picker.
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

// Phase 29.22 (2026-05-14) — RecallTab now imports useTabAccess for sub-pill gate.
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: () => ({
    isAdmin: true,
    permissions: {},
    loaded: true,
    hasPermission: () => true,
  }),
}));

import { RecallTab } from '../src/components/backend/recall/RecallTab.jsx';
import { RecallFrontendView } from '../src/components/backend/recall/RecallFrontendView.jsx';
import { RecallCard } from '../src/components/backend/customer-recall/RecallCard.jsx';

const customer = {
  id: 'LC-26000001',
  displayName: 'นาย Eee',
  phone: '081-1234567',
  lineUserId: 'U_xyz',
  hn: 'HN001',
};

const SAMPLE_RECALL = {
  id: 'R-x', customerId: 'LC-26000001', customerName: 'นาย Eee',
  slotType: 'aftercare', recallDate: '2026-05-14', status: 'pending',
  reason: 'ติดตามอาการ', pairedRecallId: null, noAnswerCount: 0,
};

beforeEach(() => {
  listenerResponses.clear();
  mockUseRecallListener.mockClear();
});

function setBranchListener(recalls) {
  listenerResponses.set('__default__', { recalls, loading: false, error: '' });
}

function setCustomerListener(customerId, recalls) {
  // CDV uses { customerId }; Backend/Frontend use { filters: {} }
  listenerResponses.set(makeKey({ customerId }), { recalls, loading: false, error: '' });
}

describe('Phase 29 · MS1 simultaneous render — both surfaces visible at once', () => {
  it('MS1.1 Backend RecallTab + CDV RecallCard render side-by-side; both show the same recall', () => {
    setBranchListener([SAMPLE_RECALL]);
    setCustomerListener('LC-26000001', [SAMPLE_RECALL]);
    render(
      <div>
        <div data-testid="surface-backend"><RecallTab /></div>
        <div data-testid="surface-cdv"><RecallCard customerId="LC-26000001" customer={customer} /></div>
      </div>,
    );
    // Both surfaces render the row (each as their own DOM node)
    const allRows = screen.getAllByTestId('recall-row-R-x');
    expect(allRows.length).toBe(2);
  });
});

describe('Phase 29 · MS2 listener fires update → all surfaces re-render', () => {
  it('MS2.1 changing listener response → all surfaces show new status chip', async () => {
    const recall = { ...SAMPLE_RECALL };
    setBranchListener([recall]);
    setCustomerListener('LC-26000001', [recall]);

    const { rerender } = render(
      <div>
        <RecallTab />
        <RecallCard customerId="LC-26000001" customer={customer} />
      </div>,
    );
    // Pre-update: 2 status chips with "รอโทร"
    const initial = screen.getAllByTestId('recall-status-chip-R-x');
    initial.forEach(c => expect(c).toHaveTextContent('รอโทร'));

    // Simulate listener firing with status=done (e.g. admin saved outcome elsewhere)
    const updated = { ...recall, status: 'done', outcome: 'will-come', outcomeNote: 'มา', outcomeBy: { name: 'X' } };
    setBranchListener([updated]);
    setCustomerListener('LC-26000001', [updated]);
    rerender(
      <div>
        <RecallTab />
        <RecallCard customerId="LC-26000001" customer={customer} />
      </div>,
    );

    // Both surfaces now show "เสร็จแล้ว"
    await waitFor(() => {
      const chips = screen.getAllByTestId('recall-status-chip-R-x');
      chips.forEach(c => expect(c).toHaveTextContent('เสร็จแล้ว'));
    });
  });
});

describe('Phase 29 · MS3 listener fires delete → all surfaces remove row', () => {
  it('MS3.1 listener response without the row → both surfaces unmount', async () => {
    setBranchListener([SAMPLE_RECALL]);
    setCustomerListener('LC-26000001', [SAMPLE_RECALL]);
    const { rerender } = render(
      <div>
        <RecallTab />
        <RecallCard customerId="LC-26000001" customer={customer} />
      </div>,
    );
    expect(screen.getAllByTestId('recall-row-R-x').length).toBe(2);

    setBranchListener([]);
    setCustomerListener('LC-26000001', []);
    rerender(
      <div>
        <RecallTab />
        <RecallCard customerId="LC-26000001" customer={customer} />
      </div>,
    );
    await waitFor(() => {
      expect(screen.queryAllByTestId('recall-row-R-x')).toHaveLength(0);
    });
  });
});

describe('Phase 29 · MS4 cross-surface — 3 simultaneous after 1 mutation', () => {
  it('MS4.1 1 mutation update propagates to 3 surfaces (Backend + Frontend + CDV)', async () => {
    setBranchListener([SAMPLE_RECALL]);
    setCustomerListener('LC-26000001', [SAMPLE_RECALL]);
    const { rerender } = render(
      <div>
        <RecallTab />
        <RecallFrontendView />
        <RecallCard customerId="LC-26000001" customer={customer} />
      </div>,
    );
    expect(screen.getAllByTestId('recall-row-R-x').length).toBe(3);

    const updated = { ...SAMPLE_RECALL, reason: 'ติดตามอาการใหม่' };
    setBranchListener([updated]);
    setCustomerListener('LC-26000001', [updated]);
    rerender(
      <div>
        <RecallTab />
        <RecallFrontendView />
        <RecallCard customerId="LC-26000001" customer={customer} />
      </div>,
    );

    await waitFor(() => {
      const rows = screen.getAllByTestId('recall-row-R-x');
      rows.forEach(r => expect(r.textContent).toMatch(/ติดตามอาการใหม่/));
    });
  });
});

describe('Phase 29 · MS5 branch-scoped surfaces re-fetch on branch switch; universal unchanged', () => {
  it('MS5.1 branch listener response differs between branches; customer listener stays the same', () => {
    // Initial: branch A has recall, customer (universal) has 1
    setBranchListener([SAMPLE_RECALL]);
    setCustomerListener('LC-26000001', [SAMPLE_RECALL]);
    const { rerender } = render(
      <div>
        <RecallTab />
        <RecallCard customerId="LC-26000001" customer={customer} />
      </div>,
    );
    expect(screen.getAllByTestId('recall-row-R-x').length).toBe(2);

    // Simulate branch switch: branch listener now returns empty (different branch)
    // but customer listener remains (universal)
    setBranchListener([]);
    // (do NOT touch customer listener — universal stays put)
    rerender(
      <div>
        <RecallTab />
        <RecallCard customerId="LC-26000001" customer={customer} />
      </div>,
    );

    // Backend tab now empty; CDV card still has the recall
    expect(screen.queryAllByTestId('recall-row-R-x').length).toBe(1);
  });
});

describe('Phase 29 · MS6 optimistic — row appears immediately, listener confirms silently', () => {
  it('MS6.1 React key={r.id} stability — re-rendering with same id does NOT unmount row', () => {
    setBranchListener([SAMPLE_RECALL]);
    const { rerender } = render(<RecallTab />);
    const initialRow = screen.getByTestId('recall-row-R-x');
    const initialEl = initialRow; // reference

    // Listener fires update with same id (server confirms our optimistic write)
    setBranchListener([{ ...SAMPLE_RECALL, customerName: 'นาย Eee (สด)' }]);
    rerender(<RecallTab />);

    const afterRow = screen.getByTestId('recall-row-R-x');
    // Same DOM node reference (no unmount; React reused via stable id key)
    expect(afterRow).toBe(initialEl);
    expect(afterRow.textContent).toMatch(/นาย Eee \(สด\)/);
  });
});

describe('Phase 29 · MS7 server-shape differs from optimistic shape', () => {
  it('MS7.1 different shape merges into same DOM row (stable id key)', () => {
    // Initial render with partial recall (optimistic)
    setBranchListener([{ ...SAMPLE_RECALL, outcomeNote: null }]);
    const { rerender } = render(<RecallTab />);
    const row = screen.getByTestId('recall-row-R-x');
    // Now server returns full shape with done + outcomeNote
    setBranchListener([{
      ...SAMPLE_RECALL,
      status: 'done',
      outcome: 'will-come',
      outcomeNote: 'มาแน่ใจ',
      outcomeBy: { name: 'นางสาว Y' },
    }]);
    rerender(<RecallTab />);
    // Same DOM node still here
    expect(screen.getByTestId('recall-row-R-x')).toBe(row);
    // Outcome callout now visible
    expect(screen.getByTestId('recall-outcome-callout-R-x')).toHaveTextContent('มาแน่ใจ');
  });
});

describe('Phase 29 · MS8 anti-flicker — listener change does NOT trigger row remount', () => {
  it('MS8.1 multiple consecutive listener updates → row DOM node stable (proves no unmount)', () => {
    setBranchListener([SAMPLE_RECALL]);
    const { rerender } = render(<RecallTab />);
    const firstNode = screen.getByTestId('recall-row-R-x');

    // 5 consecutive listener fires with slight state changes
    for (let i = 0; i < 5; i++) {
      setBranchListener([{ ...SAMPLE_RECALL, customerName: `นาย Eee #${i}` }]);
      rerender(<RecallTab />);
      const node = screen.getByTestId('recall-row-R-x');
      expect(node).toBe(firstNode);
    }
  });
});

describe('Phase 29 · MS9 key stability — runtime verification (no key={index})', () => {
  it('MS9.1 list reorder via listener → row identities preserved', () => {
    const r1 = { ...SAMPLE_RECALL, id: 'R-a', customerName: 'A', recallDate: '2026-05-14' };
    const r2 = { ...SAMPLE_RECALL, id: 'R-b', customerName: 'B', recallDate: '2026-05-15' };

    setBranchListener([r1, r2]);
    const { rerender } = render(<RecallTab />);
    const a = screen.getByTestId('recall-row-R-a');
    const b = screen.getByTestId('recall-row-R-b');

    // Reverse order in listener (would cause unmount if key was index)
    setBranchListener([r2, r1]);
    rerender(<RecallTab />);

    // Both DOM nodes preserved (proves key is recall.id, NOT index)
    expect(screen.getByTestId('recall-row-R-a')).toBe(a);
    expect(screen.getByTestId('recall-row-R-b')).toBe(b);
  });
});

describe('Phase 29 · MS10 modal close → list re-render preserves component instance', () => {
  it('MS10.1 opening + closing outcome modal does NOT unmount the underlying list row', async () => {
    const user = userEvent.setup();
    setBranchListener([SAMPLE_RECALL]);
    render(<RecallTab />);
    const rowBefore = screen.getByTestId('recall-row-R-x');

    // Open modal (click record button)
    await user.click(screen.getByTestId('recall-record-R-x'));
    expect(screen.getByTestId('recall-outcome-modal')).toBeInTheDocument();
    // Row still rendered (modal is portal'd at z-index above)
    expect(screen.getByTestId('recall-row-R-x')).toBe(rowBefore);

    // Close modal (cancel)
    await user.click(screen.getByTestId('recall-outcome-cancel'));
    await waitFor(() => expect(screen.queryByTestId('recall-outcome-modal')).not.toBeInTheDocument());

    // Row STILL the same DOM node — no unmount/remount
    expect(screen.getByTestId('recall-row-R-x')).toBe(rowBefore);
  });
});

describe('Phase 29 · MS11 useRecallListener invoked correctly per surface', () => {
  it('MS11.1 Backend tab subscribes branch-scoped ({filters:{}}); CDV subscribes per-customer ({customerId})', () => {
    setBranchListener([SAMPLE_RECALL]);
    setCustomerListener('LC-26000001', [SAMPLE_RECALL]);
    render(
      <div>
        <RecallTab />
        <RecallCard customerId="LC-26000001" customer={customer} />
      </div>,
    );
    // Branch-scoped call (filters: {})
    expect(mockUseRecallListener).toHaveBeenCalledWith({ filters: {} });
    // Universal call (customerId)
    expect(mockUseRecallListener).toHaveBeenCalledWith({ customerId: 'LC-26000001' });
  });
});
