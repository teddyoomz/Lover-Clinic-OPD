// tests/phase-29-recall-list-rtl.test.jsx
//
// Phase 29.5 (2026-05-14) — RTL test bank for RecallList + RecallSectionHeader +
// RecallEmptyState. Covers section render order, empty-section hide, pair map
// resolution, compact-mode bucket filtering, and anti-flicker key stability.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RecallList } from '../src/components/backend/recall/RecallList.jsx';
import { RecallSectionHeader } from '../src/components/backend/recall/RecallSectionHeader.jsx';
import { RecallEmptyState } from '../src/components/backend/recall/RecallEmptyState.jsx';

const TODAY = '2026-05-14';

function mkRecall(over) {
  return {
    id: 'R',
    branchId: 'BR-1',
    customerId: 'LC',
    customerName: 'Cust',
    customerLineUserId: null,
    slotType: 'aftercare',
    recallDate: TODAY,
    reason: 'r',
    status: 'pending',
    noAnswerCount: 0,
    ...over,
  };
}

const FIXTURE = [
  mkRecall({ id: 'R1', recallDate: '2026-05-12', status: 'pending', customerName: 'A-overdue' }),
  mkRecall({ id: 'R2', recallDate: '2026-05-14', status: 'pending', customerName: 'B-today' }),
  mkRecall({ id: 'R3', recallDate: '2026-05-14', status: 'done', customerName: 'B-today-done' }),
  mkRecall({ id: 'R4', recallDate: '2026-05-15', status: 'pending', customerName: 'C-tomorrow' }),
  mkRecall({ id: 'R5', recallDate: '2026-05-18', status: 'pending', customerName: 'D-week' }),
  mkRecall({ id: 'R6', recallDate: '2026-06-14', status: 'pending', customerName: 'E-later', pairedRecallId: 'R7' }),
  mkRecall({ id: 'R7', recallDate: '2026-06-14', status: 'pending', customerName: 'F-paired', pairedRecallId: 'R6' }),
];

describe('Phase 29 · L1 RecallList section render', () => {
  it('L1.1 renders all 5 sections in full mode when each has data', () => {
    render(<RecallList recalls={FIXTURE} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-section-overdue')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-today')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-tomorrow')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-thisWeek')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-later')).toBeInTheDocument();
  });

  it('L1.2 empty section hidden (overdue+today only)', () => {
    const only = [
      mkRecall({ id: 'X', recallDate: '2026-05-12', status: 'pending', customerName: 'O' }),
      mkRecall({ id: 'Y', recallDate: '2026-05-14', status: 'pending', customerName: 'T' }),
    ];
    render(<RecallList recalls={only} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-section-overdue')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-today')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-section-tomorrow')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recall-section-thisWeek')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recall-section-later')).not.toBeInTheDocument();
  });

  it('L1.3 today section shows done count "X/N"', () => {
    render(<RecallList recalls={FIXTURE} todayISO={TODAY} />);
    const todaySection = screen.getByTestId('recall-section-today');
    // FIXTURE has 2 today: R2 pending + R3 done → "เสร็จ 1/2"
    expect(todaySection).toHaveTextContent('เสร็จ 1/2');
  });

  it('L1.4 other sections do NOT show done count', () => {
    render(<RecallList recalls={FIXTURE} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-section-tomorrow')).not.toHaveTextContent('เสร็จ');
    expect(screen.getByTestId('recall-section-later')).not.toHaveTextContent('เสร็จ');
  });

  it('L1.5 compact mode renders today + overdue + tomorrow, today first + prominent (NOT thisWeek/later) — 2026-05-20 Recall วันนี้', () => {
    render(<RecallList recalls={FIXTURE} todayISO={TODAY} mode="compact" />);
    expect(screen.getByTestId('recall-section-today')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-overdue')).toBeInTheDocument();
    expect(screen.getByTestId('recall-section-tomorrow')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-section-thisWeek')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recall-section-later')).not.toBeInTheDocument();
    expect(screen.getByTestId('recall-list')).toHaveAttribute('data-mode', 'compact');
    // today on top + prominent
    expect(screen.getByTestId('recall-section-today')).toHaveAttribute('data-prominent', 'true');
    const sections = screen.getByTestId('recall-list').querySelectorAll('[data-testid^="recall-section-"]');
    expect(sections[0].getAttribute('data-bucket')).toBe('today');
    expect(sections[1].getAttribute('data-bucket')).toBe('overdue');
    expect(sections[2].getAttribute('data-bucket')).toBe('tomorrow');
  });

  it('L1.6 rows render with stable id keys', () => {
    render(<RecallList recalls={FIXTURE} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-row-R1')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R2')).toBeInTheDocument();
    expect(screen.getByTestId('recall-row-R6')).toBeInTheDocument();
  });

  it('L1.7 paired recall resolved + badge rendered', () => {
    render(<RecallList recalls={FIXTURE} todayISO={TODAY} />);
    // R6 is paired with R7 → R6 row should have RecallPairBadge for R7
    const r6 = screen.getByTestId('recall-row-R6');
    expect(within(r6).getByTestId('recall-pair-badge-R7')).toBeInTheDocument();
  });

  it('L1.8 callback wiring — onRowClick fires on row click', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<RecallList recalls={FIXTURE} todayISO={TODAY} onRowClick={onClick} />);
    // Phase 29.23 Task 3 V21-class fixup: customer-name is now an <a> with
    // stopPropagation (opens customer in new tab) → click the row OUTER
    // instead of customer-name text to trigger outcome modal.
    await user.click(screen.getByTestId('recall-row-R1'));
    expect(onClick).toHaveBeenCalledWith('R1');
  });
});

describe('Phase 29 · L2 RecallList empty state', () => {
  it('L2.1 empty recalls → renders RecallEmptyState', () => {
    render(<RecallList recalls={[]} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-empty-state')).toBeInTheDocument();
  });

  it('L2.2 null recalls → renders empty state', () => {
    render(<RecallList recalls={null} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-empty-state')).toBeInTheDocument();
  });

  it('L2.3 custom emptyState prop overrides default', () => {
    render(<RecallList recalls={[]} todayISO={TODAY} emptyState={<div data-testid="custom-empty">เห่ง</div>} />);
    expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-empty-state')).not.toBeInTheDocument();
  });

  it('L2.4 compact mode with no overdue+today renders 3 always-on sections + ✓ boxes (Q2=A 2026-07-05 — later data stays invisible in compact)', () => {
    const later = [mkRecall({ id: 'L1', recallDate: '2026-06-14', status: 'pending' })];
    render(<RecallList recalls={later} todayISO={TODAY} mode="compact" />);
    expect(screen.getByTestId('recall-bucket-empty-today')).toBeInTheDocument();
    expect(screen.getByTestId('recall-bucket-empty-overdue')).toBeInTheDocument();
    expect(screen.getByTestId('recall-bucket-empty-tomorrow')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recall-row-L1')).not.toBeInTheDocument(); // later ยังไม่โชว์ใน compact
  });
});

describe('Phase 29 · L3 RecallSectionHeader bucket themes', () => {
  it('L3.1 overdue theme renders 🚨 + "เกินกำหนด"', () => {
    render(<RecallSectionHeader bucketKey="overdue" count={3} />);
    expect(screen.getByTestId('recall-section-overdue')).toHaveTextContent('🚨');
    expect(screen.getByTestId('recall-section-overdue')).toHaveTextContent('เกินกำหนด');
  });

  it('L3.2 today theme renders 📅 + "วันนี้"', () => {
    render(<RecallSectionHeader bucketKey="today" count={2} doneCount={1} />);
    expect(screen.getByTestId('recall-section-today')).toHaveTextContent('วันนี้');
    expect(screen.getByTestId('recall-section-today')).toHaveTextContent('เสร็จ 1/2');
  });

  it('L3.3 tomorrow theme renders "พรุ่งนี้"', () => {
    render(<RecallSectionHeader bucketKey="tomorrow" count={1} />);
    expect(screen.getByTestId('recall-section-tomorrow')).toHaveTextContent('พรุ่งนี้');
  });

  it('L3.4 thisWeek theme renders 📆 + "ภายใน 7 วัน"', () => {
    render(<RecallSectionHeader bucketKey="thisWeek" count={1} />);
    expect(screen.getByTestId('recall-section-thisWeek')).toHaveTextContent('ภายใน 7 วัน');
  });

  it('L3.5 later theme renders 📋 + "ภายหลัง"', () => {
    render(<RecallSectionHeader bucketKey="later" count={5} />);
    expect(screen.getByTestId('recall-section-later')).toHaveTextContent('ภายหลัง');
  });

  it('L3.6 unknown bucket → null render', () => {
    const { container } = render(<RecallSectionHeader bucketKey="bogus" count={1} />);
    expect(container.firstChild).toBeNull();
  });

  it('L3.7 zero count → null render', () => {
    const { container } = render(<RecallSectionHeader bucketKey="today" count={0} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Phase 29 · L4 RecallEmptyState', () => {
  it('L4.1 renders default Thai message + hint', () => {
    render(<RecallEmptyState />);
    expect(screen.getByTestId('recall-empty-state')).toBeInTheDocument();
    expect(screen.getByText('ไม่มี Recall')).toBeInTheDocument();
    expect(screen.getByText('กดปุ่ม + เพื่อเพิ่ม')).toBeInTheDocument();
  });

  it('L4.2 custom message + hint override defaults', () => {
    render(<RecallEmptyState message="ไม่พบรายการ" hint="ลองล้าง filter" />);
    expect(screen.getByText('ไม่พบรายการ')).toBeInTheDocument();
    expect(screen.getByText('ลองล้าง filter')).toBeInTheDocument();
  });
});
