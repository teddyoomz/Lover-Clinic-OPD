// tests/phase-29-recall-outcome-modal-rtl.test.jsx
//
// Phase 29.7 (2026-05-14) — RTL test bank for RecallOutcomeModal.
// O1.1-25 covering 4 outcome cards, selection, auto-snooze hint, escalation
// warning, save dispatches, ESC + close, textarea binding.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRecord = vi.fn(async () => {});
const MOCK_STAFF = [
  { id: 'S1', firstName: 'พิมพ์ชนก', lastName: 'ใจดี' },
  { id: 'S2', firstName: 'สมชาย', lastName: 'มั่นคง' },
];

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  recordRecallOutcome: (...args) => mockRecord(...args),
  listStaff: vi.fn(async () => MOCK_STAFF),
}));

import { RecallOutcomeModal } from '../src/components/backend/recall/RecallOutcomeModal.jsx';

const recall = {
  id: 'RECALL-test-1',
  customerId: 'LC-1',
  customerName: 'นาย Eee',
  status: 'pending',
  noAnswerCount: 0,
};

// 2026-05-20 (Q2=B) — staff dropdown is required; pick a staff before Save.
async function pickStaff(user, name = 'พิมพ์ชนก ใจดี') {
  const wrap = screen.getByTestId('staff-select-outcomeStaff');
  const input = wrap.querySelector('input');
  await user.click(input);
  const opt = await screen.findByText(name);
  await user.click(opt);
}

beforeEach(() => {
  mockRecord.mockClear();
});

describe('Phase 29 · O1 RecallOutcomeModal rendering', () => {
  it('O1.1 renders header with customer name', () => {
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    expect(screen.getByText(/บันทึกผลการ Recall.+นาย Eee/)).toBeInTheDocument();
  });

  it('O1.2 renders 4 outcome cards', () => {
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    expect(screen.getByTestId('recall-outcome-card-will-come')).toBeInTheDocument();
    expect(screen.getByTestId('recall-outcome-card-reschedule')).toBeInTheDocument();
    expect(screen.getByTestId('recall-outcome-card-not-interested')).toBeInTheDocument();
    expect(screen.getByTestId('recall-outcome-card-no-answer')).toBeInTheDocument();
  });

  it('O1.3 outcome card Thai labels correct', () => {
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    expect(screen.getByText('จะมาตามนัด')).toBeInTheDocument();
    expect(screen.getByText('ขอเลื่อน')).toBeInTheDocument();
    expect(screen.getByText('ไม่สนใจ / ไม่ต้องการ')).toBeInTheDocument();
    expect(screen.getByText('ติดต่อไม่ได้')).toBeInTheDocument();
  });

  it('O1.4 no outcome selected by default', () => {
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    expect(screen.getByTestId('recall-outcome-card-will-come')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('recall-outcome-card-no-answer')).toHaveAttribute('data-selected', 'false');
  });

  it('O1.5 save disabled by default (no outcome picked)', () => {
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    expect(screen.getByTestId('recall-outcome-save')).toBeDisabled();
  });
});

describe('Phase 29 · O2 outcome selection', () => {
  it('O2.1 click outcome card → selected', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-will-come'));
    expect(screen.getByTestId('recall-outcome-card-will-come')).toHaveAttribute('data-selected', 'true');
  });

  it('O2.2 only one outcome selected at a time (mutex)', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-will-come'));
    await user.click(screen.getByTestId('recall-outcome-card-no-answer'));
    expect(screen.getByTestId('recall-outcome-card-will-come')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('recall-outcome-card-no-answer')).toHaveAttribute('data-selected', 'true');
  });

  it('O2.3 save enabled only after outcome AND staff picked (Q2=B)', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-will-come'));
    // 2026-05-20: staff is required → still disabled until picked
    expect(screen.getByTestId('recall-outcome-save')).toBeDisabled();
    await pickStaff(user);
    expect(screen.getByTestId('recall-outcome-save')).not.toBeDisabled();
  });
});

describe('Phase 29 · O3 auto-snooze hint visibility', () => {
  it('O3.1 hint HIDDEN by default', () => {
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    expect(screen.queryByTestId('recall-outcome-auto-snooze-hint')).not.toBeInTheDocument();
  });

  it('O3.2 hint HIDDEN when will-come selected', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-will-come'));
    expect(screen.queryByTestId('recall-outcome-auto-snooze-hint')).not.toBeInTheDocument();
  });

  it('O3.3 hint VISIBLE when no-answer selected', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-no-answer'));
    expect(screen.getByTestId('recall-outcome-auto-snooze-hint')).toBeInTheDocument();
    expect(screen.getByTestId('recall-outcome-auto-snooze-hint')).toHaveTextContent(/auto-snooze 3 วัน/);
  });

  it('O3.4 escalation warning HIDDEN when count < 2', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-no-answer'));
    expect(screen.queryByTestId('recall-outcome-escalate-warning')).not.toBeInTheDocument();
  });

  it('O3.5 escalation warning VISIBLE when next save would hit 3', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={{ ...recall, noAnswerCount: 2 }} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-no-answer'));
    expect(screen.getByTestId('recall-outcome-escalate-warning')).toBeInTheDocument();
    expect(screen.getByTestId('recall-outcome-escalate-warning')).toHaveTextContent(/ครั้งที่ 3/);
    expect(screen.getByTestId('recall-outcome-escalate-warning')).toHaveTextContent(/requiresManualReview/);
  });
});

describe('Phase 29 · O4 save dispatch', () => {
  it('O4.1 save will-come → calls recordRecallOutcome with payload', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<RecallOutcomeModal recall={recall} onClose={onClose} onSaved={onSaved} />);
    await user.click(screen.getByTestId('recall-outcome-card-will-come'));
    await pickStaff(user);
    await user.click(screen.getByTestId('recall-outcome-save'));
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith('RECALL-test-1', expect.objectContaining({
      outcome: 'will-come',
      outcomeNote: '',
      currentNoAnswerCount: 0,
      recordedBy: expect.objectContaining({ name: 'พิมพ์ชนก ใจดี', staffId: 'S1' }),
    }));
    expect(onSaved).toHaveBeenCalledWith('will-come');
    expect(onClose).toHaveBeenCalled();
  });

  it('O4.2 save with note → note included in payload', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-will-come'));
    await user.type(screen.getByTestId('recall-outcome-note'), 'มาแน่');
    await pickStaff(user);
    await user.click(screen.getByTestId('recall-outcome-save'));
    expect(mockRecord.mock.calls[0][1]).toMatchObject({
      outcome: 'will-come',
      outcomeNote: 'มาแน่',
    });
  });

  it('O4.3 save no-answer → currentNoAnswerCount forwarded', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={{ ...recall, noAnswerCount: 1 }} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-no-answer'));
    await pickStaff(user);
    await user.click(screen.getByTestId('recall-outcome-save'));
    expect(mockRecord.mock.calls[0][1]).toMatchObject({
      outcome: 'no-answer',
      currentNoAnswerCount: 1,
    });
  });

  it('O4.4 reschedule → fires onReschedule callback then close', async () => {
    const user = userEvent.setup();
    const onReschedule = vi.fn();
    const onClose = vi.fn();
    render(<RecallOutcomeModal recall={recall} onClose={onClose} onReschedule={onReschedule} />);
    await user.click(screen.getByTestId('recall-outcome-card-reschedule'));
    await pickStaff(user);
    await user.click(screen.getByTestId('recall-outcome-save'));
    expect(onReschedule).toHaveBeenCalledWith('RECALL-test-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('O4.5 save failure shows error + keeps modal open', async () => {
    const user = userEvent.setup();
    mockRecord.mockImplementationOnce(async () => { throw new Error('boom'); });
    const onClose = vi.fn();
    render(<RecallOutcomeModal recall={recall} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-outcome-card-will-come'));
    await pickStaff(user);
    await user.click(screen.getByTestId('recall-outcome-save'));
    expect(screen.getByTestId('recall-outcome-error')).toHaveTextContent('boom');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Phase 29 · O5 modal close behaviors', () => {
  it('O5.1 ESC closes', () => {
    const onClose = vi.fn();
    render(<RecallOutcomeModal recall={recall} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('O5.2 V83/AV78: backdrop click does NOT close (explicit close only)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallOutcomeModal recall={recall} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-outcome-modal'));
    // V83 (EOD8 2026-05-18): modals only close via X / Cancel / ESC. See AV78.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('O5.3 close button (X) closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallOutcomeModal recall={recall} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-outcome-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('O5.4 cancel button closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallOutcomeModal recall={recall} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-outcome-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Phase 29 · O6 note textarea', () => {
  it('O6.1 textarea binds to state', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    const ta = screen.getByTestId('recall-outcome-note');
    await user.type(ta, 'ทดสอบ');
    expect(ta).toHaveValue('ทดสอบ');
  });

  it('O6.2 maxLength 1000 enforced', () => {
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    expect(screen.getByTestId('recall-outcome-note')).toHaveAttribute('maxLength', '1000');
  });
});

describe('Phase 29 · O7 required staff dropdown (2026-05-20, Q2=B)', () => {
  it('O7.1 renders the required "พนักงานผู้ลงบันทึก" dropdown', () => {
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    expect(screen.getByTestId('staff-select-outcomeStaff')).toBeInTheDocument();
    expect(screen.getByText(/พนักงานผู้ลงบันทึก/)).toBeInTheDocument();
  });

  it('O7.2 save stays disabled with outcome picked but no staff', async () => {
    const user = userEvent.setup();
    render(<RecallOutcomeModal recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-outcome-card-will-come'));
    expect(screen.getByTestId('recall-outcome-save')).toBeDisabled();
  });
});
