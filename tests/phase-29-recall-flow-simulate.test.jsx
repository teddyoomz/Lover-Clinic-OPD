// tests/phase-29-recall-flow-simulate.test.jsx
//
// Phase 29.14 (2026-05-14) — Rule I full-flow simulate test bank (Layer 4
// per spec §9). Realistic 8-recall fixture mirrors a real clinic's recall
// landscape and threads through bucket grouping, click → outcome,
// auto-snooze cycle, pair-badge resolution, search filter, lifecycle.
//
// F1-F10 covers the spec §9 Layer 4 contract verbatim.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUseRecallListener = vi.fn();
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
import {
  groupRecallsByTimeBucket,
  formatPairBadge,
  shouldFlagManualReview,
  computeAutoSnoozeUntil,
  getEffectiveRecallDate,
  isOverdue,
} from '../src/lib/recallResolvers.js';

const TODAY = '2026-05-14';

// Spec §9 Layer 4 — realistic 8-recall fixture (mixed slots / pairs / statuses)
const FIXTURE = [
  // Pair 1 — filler 14 พ.ค. — slot 1 done, slot 2 pending (6mo)
  {
    id: 'R1', customerId: 'LC-1', customerName: 'A filler-after',
    slotType: 'aftercare', recallDate: '2026-05-15', status: 'done',
    pairedRecallId: 'R2',
    outcome: 'will-come', outcomeNote: 'มาแน่', outcomeBy: { name: 'พี่ X' },
    reason: 'ติดตามอาการหลังฉีดฟิลเลอร์',
    sourceProductName: 'Neuramis Deep',
  },
  {
    id: 'R2', customerId: 'LC-1', customerName: 'A filler-revisit',
    slotType: 'revisit', recallDate: '2026-11-14', status: 'pending',
    pairedRecallId: 'R1',
    reason: 'ฟิลเลอร์ครบ 6 เดือน',
    sourceProductName: 'Neuramis Deep',
  },
  // Pair 2 — botox — both pending (3 + 4 mo)
  {
    id: 'R3', customerId: 'LC-2', customerName: 'B botox-after',
    slotType: 'aftercare', recallDate: '2026-05-14', status: 'pending',
    pairedRecallId: 'R4', reason: 'ติดตามอาการ botox',
    sourceProductName: 'Allergan Botox',
  },
  {
    id: 'R4', customerId: 'LC-2', customerName: 'B botox-revisit',
    slotType: 'revisit', recallDate: '2026-09-14', status: 'pending',
    pairedRecallId: 'R3', reason: 'botox ครบ 4 เดือน',
    sourceProductName: 'Allergan Botox',
  },
  // Single — circumcision aftercare only
  {
    id: 'R5', customerId: 'LC-3', customerName: 'C circ-after',
    slotType: 'aftercare', recallDate: '2026-05-15', status: 'pending',
    pairedRecallId: null, reason: 'ติดตามอาการขลิบ',
  },
  // Overdue
  {
    id: 'R6', customerId: 'LC-4', customerName: 'D PRP-overdue',
    slotType: 'revisit', recallDate: '2026-05-12', status: 'pending',
    pairedRecallId: null, reason: 'PRP ครบ 3 เดือน',
    sourceProductName: 'PRP Kit',
  },
  // No-answer cycle (count 2; snoozed to 13)
  {
    id: 'R7', customerId: 'LC-5', customerName: 'E no-answer',
    slotType: 'revisit', recallDate: '2026-05-10', status: 'no-answer',
    noAnswerCount: 2, snoozedUntil: '2026-05-13', pairedRecallId: null,
    reason: 'ติดตามอาการหลังการรักษา',
  },
  // Snoozed manually (originally overdue 2026-05-08, snoozed to later)
  {
    id: 'R8', customerId: 'LC-6', customerName: 'F snoozed',
    slotType: 'revisit', recallDate: '2026-05-08', status: 'pending',
    snoozedUntil: '2026-05-22', pairedRecallId: null,
    reason: 'นัดติดตามดูเปลือกตา',
  },
];

beforeEach(() => {
  mockUseRecallListener.mockReturnValue({ recalls: FIXTURE, loading: false, error: '' });
});

describe('Phase 29 · F1 bucket grouping is deterministic + Bangkok-stable', () => {
  it('F1.1 8-fixture buckets correctly: overdue=R6+R7 / today=R3 / tomorrow=R1+R5 / thisWeek=[] / later=R2+R4+R8', () => {
    const b = groupRecallsByTimeBucket(FIXTURE, TODAY);
    // R6 (2026-05-12 overdue) + R7 (snoozedUntil=2026-05-13 < today, status=no-answer not 'done' → overdue)
    expect(b.overdue.map(r => r.id).sort()).toEqual(['R6', 'R7'].sort());
    // R3 (2026-05-14)
    expect(b.today.map(r => r.id)).toEqual(['R3']);
    // R1 (status=done — pre-V14 lock: snoozedUntil null so effective is recallDate 2026-05-15 = tomorrow)
    // R5 (2026-05-15)
    expect(b.tomorrow.map(r => r.id).sort()).toEqual(['R1', 'R5'].sort());
    // No rows fall in thisWeek (2026-05-16 to 2026-05-21)
    expect(b.thisWeek).toEqual([]);
    // R2 (2026-11-14) + R4 (2026-09-14) + R8 (snoozedUntil 2026-05-22)
    expect(b.later.map(r => r.id).sort()).toEqual(['R2', 'R4', 'R8'].sort());
  });

  it('F1.2 total bucket count == fixture length', () => {
    const b = groupRecallsByTimeBucket(FIXTURE, TODAY);
    const total = b.overdue.length + b.today.length + b.tomorrow.length + b.thisWeek.length + b.later.length;
    expect(total).toBe(FIXTURE.length);
  });
});

describe('Phase 29 · F2 row click opens detail (outcome modal)', () => {
  it('F2.1 clicking row body opens outcome modal with that recall', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    // Phase 29.23 Task 3 V21-class fixup: customer-name is now <a> with
    // stopPropagation → click row OUTER (data-testid="recall-row-<id>") to
    // hit the outcome-modal handler instead of the new-tab link.
    // Fixture "B botox-after" maps to recall id 'R3' (see FIXTURE above).
    await user.click(screen.getByTestId('recall-row-R3'));
    expect(screen.getByTestId('recall-outcome-modal')).toBeInTheDocument();
  });
});

describe('Phase 29 · F3 outcome save flows optimistically', () => {
  it('F3.1 R3 select will-come + save → modal closes via parent', async () => {
    const user = userEvent.setup();
    const { recordRecallOutcome } = await import('../src/lib/scopedDataLayer.js');
    render(<RecallTab />);
    await user.click(screen.getByTestId('recall-record-R3'));
    await user.click(screen.getByTestId('recall-outcome-card-will-come'));
    await user.click(screen.getByTestId('recall-outcome-save'));
    expect(recordRecallOutcome).toHaveBeenCalledWith('R3', expect.objectContaining({
      outcome: 'will-come',
      currentNoAnswerCount: 0,
    }));
  });
});

describe('Phase 29 · F4 single recall (R5) shows no pair badge', () => {
  it('F4.1 R5 row HAS NO pair badge', () => {
    render(<RecallTab />);
    const r5 = screen.getByTestId('recall-row-R5');
    expect(within(r5).queryByTestId(/recall-pair-badge-/)).not.toBeInTheDocument();
  });
});

describe('Phase 29 · F5 R1 pair badge: "🔗 จับคู่กับ: 📅 ฟิลเลอร์ครบ 6 เดือน · 14 พ.ย. · รอ Recall"', () => {
  it('F5.1 R1 pair badge resolves R2 (revisit, pending)', () => {
    render(<RecallTab />);
    const r1 = screen.getByTestId('recall-row-R1');
    const badge = within(r1).getByTestId('recall-pair-badge-R2');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toMatch(/ฟิลเลอร์ครบ 6 เดือน/);
    expect(badge.textContent).toMatch(/14 พ.ย./);
    expect(badge.textContent).toMatch(/รอ Recall/);
  });
});

describe('Phase 29 · F6 R2 pair badge: "🔗 จับคู่กับ: 🩹 ติดตามอาการหลังฉีดฟิลเลอร์ · 15 พ.ค. · เสร็จแล้ว"', () => {
  it('F6.1 R2 pair badge resolves R1 (aftercare, done)', () => {
    render(<RecallTab />);
    const r2 = screen.getByTestId('recall-row-R2');
    const badge = within(r2).getByTestId('recall-pair-badge-R1');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toMatch(/ติดตามอาการหลังฉีดฟิลเลอร์/);
    expect(badge.textContent).toMatch(/15 พ.ค./);
    expect(badge.textContent).toMatch(/เสร็จแล้ว/);
  });
});

describe('Phase 29 · F7 R7 no-answer count 2 — escalation rule (next save → manual review)', () => {
  it('F7.1 shouldFlagManualReview(3) = true (escalates at 3rd no-answer)', () => {
    expect(shouldFlagManualReview(3)).toBe(true);
  });

  it('F7.2 outcome modal opened for R7 shows escalation warning when selecting no-answer', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.click(screen.getByTestId('recall-record-R7'));
    await user.click(screen.getByTestId('recall-outcome-card-no-answer'));
    expect(screen.getByTestId('recall-outcome-escalate-warning')).toBeInTheDocument();
  });
});

describe('Phase 29 · F8 snooze date passes → R8 moves bucket on next render', () => {
  it('F8.1 with today=2026-05-22 R8 moves from later → today', () => {
    const b1 = groupRecallsByTimeBucket(FIXTURE, '2026-05-14');
    expect(b1.later.find(r => r.id === 'R8')).toBeTruthy();
    const b2 = groupRecallsByTimeBucket(FIXTURE, '2026-05-22');
    expect(b2.today.find(r => r.id === 'R8')).toBeTruthy();
    expect(b2.later.find(r => r.id === 'R8')).toBeUndefined();
  });

  it('F8.2 snoozeRecall computes auto-snooze date correctly', () => {
    expect(computeAutoSnoozeUntil('2026-05-14', 3)).toBe('2026-05-17');
  });
});

describe('Phase 29 · F9 filter "วันนี้" — search "today" reveals R3 only', () => {
  it('F9.1 search "B botox-after" filters to R3 only', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.type(screen.getByTestId('recall-header-search'), 'B botox-after');
    expect(screen.getByTestId('recall-row-R3')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-row-R1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recall-row-R2')).not.toBeInTheDocument();
  });
});

describe('Phase 29 · F10 search "ฟิลเลอร์" reveals R1+R2', () => {
  it('F10.1 search "ฟิลเลอร์" matches R1 reason + R2 reason', async () => {
    const user = userEvent.setup();
    render(<RecallTab />);
    await user.type(screen.getByTestId('recall-header-search'), 'ฟิลเลอร์');
    expect(screen.getByTestId('recall-row-R1')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R2')).toBeInTheDocument();
    // Other reasons don't contain "ฟิลเลอร์"
    expect(screen.queryByTestId('recall-row-R6')).not.toBeInTheDocument();
  });
});

describe('Phase 29 · F11 pair-badge helper sanity', () => {
  it('F11.1 formatPairBadge for done returns "เสร็จแล้ว"', () => {
    const out = formatPairBadge({ id: 'R1', slotType: 'aftercare', reason: 'x', recallDate: '2026-05-15', status: 'done' }, TODAY);
    expect(out.statusSuffix).toBe('เสร็จแล้ว');
  });

  it('F11.2 formatPairBadge for snoozed returns "เลื่อนไป <date>"', () => {
    const out = formatPairBadge({ id: 'R8', slotType: 'revisit', reason: 'x', recallDate: '2026-05-08', status: 'pending', snoozedUntil: '2026-05-22' }, TODAY);
    expect(out.statusSuffix).toBe('เลื่อนไป 22 พ.ค.');
  });
});

describe('Phase 29 · F12 isOverdue + getEffectiveRecallDate parity', () => {
  it('F12.1 R6 (recallDate 2026-05-12 pending) is overdue', () => {
    expect(isOverdue(FIXTURE.find(r => r.id === 'R6'), TODAY)).toBe(true);
  });

  it('F12.2 R7 (snoozedUntil 2026-05-13 < today) is overdue via effective date', () => {
    const r7 = FIXTURE.find(r => r.id === 'R7');
    expect(getEffectiveRecallDate(r7)).toBe('2026-05-13');
    expect(isOverdue(r7, TODAY)).toBe(true);
  });

  it('F12.3 R8 (snoozedUntil 2026-05-22 > today) is NOT overdue', () => {
    expect(isOverdue(FIXTURE.find(r => r.id === 'R8'), TODAY)).toBe(false);
  });

  it('F12.4 R1 (status=done) is NEVER overdue', () => {
    expect(isOverdue(FIXTURE.find(r => r.id === 'R1'), TODAY)).toBe(false);
  });
});
