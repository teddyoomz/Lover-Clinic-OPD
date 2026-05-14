// tests/phase-29-recall-row-rtl.test.jsx
//
// Phase 29.4 (2026-05-14) — RTL test bank for RecallRow + RecallPairBadge.
// R-Row.1-R-Row.13 + PB1.1-PB1.6 — covers rendering, LINE button visibility,
// click → stopPropagation, status chip per status, overdue styling, snoozed
// fade, pair badge rendering, action-chip visibility per status.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecallRow } from '../src/components/backend/recall/RecallRow.jsx';
import { RecallPairBadge } from '../src/components/backend/recall/RecallPairBadge.jsx';

const TODAY = '2026-05-14';

const baseRecall = {
  id: 'R1',
  branchId: 'BR-1',
  customerId: 'LC-1',
  customerName: 'นาย Aaa',
  customerPhone: '081-1234567',
  customerLineUserId: 'U_xyz',
  customerHN: 'HN001',
  slotType: 'aftercare',
  source: 'manual',
  sourceProductName: 'Filler Brand X',
  recallDate: '2026-05-15',
  reason: 'ติดตามอาการหลังฉีดฟิลเลอร์',
  status: 'pending',
  noAnswerCount: 0,
  requiresManualReview: false,
  lineMessageSent: false,
};

describe('Phase 29 · R-Row.1-13 RecallRow rendering', () => {
  it('R-Row.1 renders customer name + reason', () => {
    render(<RecallRow recall={baseRecall} todayISO={TODAY} />);
    expect(screen.getByText('นาย Aaa')).toBeInTheDocument();
    expect(screen.getByText(/ติดตามอาการหลังฉีดฟิลเลอร์/)).toBeInTheDocument();
  });

  it('R-Row.2 renders status chip with Thai label', () => {
    render(<RecallRow recall={baseRecall} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-status-chip-R1')).toHaveTextContent('รอโทร');
  });

  it('R-Row.3 renders dd/mm date in time column', () => {
    render(<RecallRow recall={baseRecall} todayISO={TODAY} />);
    expect(screen.getByText('15/05')).toBeInTheDocument();
  });

  it('R-Row.4 LINE button visible when customerLineUserId present', () => {
    const onLine = vi.fn();
    render(<RecallRow recall={baseRecall} todayISO={TODAY} onLineSend={onLine} />);
    expect(screen.getByTestId('recall-line-R1')).toBeInTheDocument();
  });

  it('R-Row.5 LINE button HIDDEN when customerLineUserId is null', () => {
    const onLine = vi.fn();
    render(<RecallRow recall={{ ...baseRecall, customerLineUserId: null }} todayISO={TODAY} onLineSend={onLine} />);
    expect(screen.queryByTestId('recall-line-R1')).not.toBeInTheDocument();
  });

  it('R-Row.6 click body fires onClick(recall.id)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<RecallRow recall={baseRecall} todayISO={TODAY} onClick={onClick} />);
    await user.click(screen.getByText('นาย Aaa'));
    expect(onClick).toHaveBeenCalledWith('R1');
  });

  it('R-Row.7 click action chip stopPropagation — onClick NOT fired', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onRecord = vi.fn();
    render(<RecallRow recall={baseRecall} todayISO={TODAY} onClick={onClick} onRecordOutcome={onRecord} />);
    await user.click(screen.getByTestId('recall-record-R1'));
    expect(onRecord).toHaveBeenCalledWith('R1');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('R-Row.8 outcome callout appears when status=done', () => {
    const recall = {
      ...baseRecall,
      status: 'done',
      outcome: 'will-come',
      outcomeNote: 'ลูกค้าจะมา',
      outcomeBy: { name: 'พี่ X' },
    };
    render(<RecallRow recall={recall} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-outcome-callout-R1')).toHaveTextContent('ลูกค้าจะมา');
    expect(screen.getByTestId('recall-outcome-callout-R1')).toHaveTextContent('พี่ X');
  });

  it('R-Row.9 record button HIDDEN when status=done', () => {
    const onRecord = vi.fn();
    render(<RecallRow recall={{ ...baseRecall, status: 'done' }} todayISO={TODAY} onRecordOutcome={onRecord} />);
    expect(screen.queryByTestId('recall-record-R1')).not.toBeInTheDocument();
  });

  it('R-Row.10 overdue row gets data-overdue=true', () => {
    const recall = { ...baseRecall, recallDate: '2026-05-10', status: 'pending' };
    render(<RecallRow recall={recall} todayISO={TODAY} />);
    expect(screen.getByTestId('recall-row-R1')).toHaveAttribute('data-overdue', 'true');
  });

  it('R-Row.11 snoozed row gets data-snoozed=true and reduced opacity class', () => {
    const recall = { ...baseRecall, snoozedUntil: '2026-05-20', status: 'pending' };
    render(<RecallRow recall={recall} todayISO={TODAY} />);
    const row = screen.getByTestId('recall-row-R1');
    expect(row).toHaveAttribute('data-snoozed', 'true');
    // Phase 29.22 visual polish — snoozed dim shifted from opacity-65 → opacity-60
    // alongside dashed-border treatment for clearer "paused/dim" semantics.
    expect(row.className).toMatch(/opacity-60/);
  });

  it('R-Row.12 requiresManualReview shows badge', () => {
    render(<RecallRow recall={{ ...baseRecall, requiresManualReview: true, noAnswerCount: 3, status: 'no-answer' }} todayISO={TODAY} />);
    expect(screen.getByText('🚨 ตรวจสอบ')).toBeInTheDocument();
  });

  it('R-Row.13 lineMessageSent badge appears', () => {
    render(<RecallRow recall={{ ...baseRecall, lineMessageSent: true }} todayISO={TODAY} />);
    expect(screen.getByText(/ส่ง LINE แล้ว/)).toBeInTheDocument();
  });
});

describe('Phase 29 · PB1 RecallPairBadge', () => {
  const pairedPending = {
    id: 'R2',
    slotType: 'revisit',
    reason: 'ฟิลเลอร์ครบ 6 เดือน',
    recallDate: '2026-11-14',
    status: 'pending',
  };

  it('PB1.1 renders with full format pending', () => {
    render(<RecallPairBadge paired={pairedPending} todayISO={TODAY} />);
    expect(screen.getByText('จับคู่กับ:')).toBeInTheDocument();
    expect(screen.getByText('ฟิลเลอร์ครบ 6 เดือน')).toBeInTheDocument();
    expect(screen.getByText(/14 พ.ย./)).toBeInTheDocument();
    expect(screen.getByText(/รอ Recall/)).toBeInTheDocument();
  });

  it('PB1.2 renders done suffix', () => {
    render(<RecallPairBadge paired={{ ...pairedPending, status: 'done' }} todayISO={TODAY} />);
    expect(screen.getByText(/เสร็จแล้ว/)).toBeInTheDocument();
  });

  it('PB1.3 renders no-answer count', () => {
    render(<RecallPairBadge paired={{ ...pairedPending, status: 'no-answer', noAnswerCount: 2 }} todayISO={TODAY} />);
    expect(screen.getByText(/ติดต่อไม่ได้ครั้งที่ 2/)).toBeInTheDocument();
  });

  it('PB1.4 renders snoozed suffix', () => {
    render(<RecallPairBadge paired={{ ...pairedPending, snoozedUntil: '2026-05-20' }} todayISO={TODAY} />);
    expect(screen.getByText(/เลื่อนไป 20 พ.ค./)).toBeInTheDocument();
  });

  it('PB1.5 renders overdue suffix', () => {
    render(<RecallPairBadge paired={{ ...pairedPending, recallDate: '2026-05-12' }} todayISO={TODAY} />);
    expect(screen.getByText(/เกินกำหนด 2 วัน/)).toBeInTheDocument();
  });

  it('PB1.6 click stopPropagation + fires onClick(pairedId)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <RecallPairBadge paired={pairedPending} todayISO={TODAY} onClick={onClick} />
      </div>,
    );
    await user.click(screen.getByTestId('recall-pair-badge-R2'));
    expect(onClick).toHaveBeenCalledWith('R2');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('PB1.7 null paired returns null (no render)', () => {
    const { container } = render(<RecallPairBadge paired={null} todayISO={TODAY} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Phase 29 · R-Row pair-badge integration', () => {
  it('R-Row.14 renders pair badge when pairedRecall prop provided', () => {
    const pairedRecall = {
      id: 'R2',
      slotType: 'revisit',
      reason: 'ฟิลเลอร์ครบ 6 เดือน',
      recallDate: '2026-11-14',
      status: 'pending',
    };
    render(<RecallRow recall={baseRecall} todayISO={TODAY} pairedRecall={pairedRecall} />);
    expect(screen.getByTestId('recall-pair-badge-R2')).toBeInTheDocument();
  });

  it('R-Row.15 no pair badge when pairedRecall is null', () => {
    render(<RecallRow recall={baseRecall} todayISO={TODAY} pairedRecall={null} />);
    expect(screen.queryByTestId(/recall-pair-badge-/)).not.toBeInTheDocument();
  });
});
