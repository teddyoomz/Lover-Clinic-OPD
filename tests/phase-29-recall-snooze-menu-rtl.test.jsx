// tests/phase-29-recall-snooze-menu-rtl.test.jsx
//
// Phase 29.9 (2026-05-14) — RTL test bank for RecallSnoozeMenu.
// SN1.1-SN4.4 covering quick picks, custom date, save flow, modal close.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSnooze = vi.fn(async () => {});

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  snoozeRecall: (...args) => mockSnooze(...args),
}));

vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return {
    ...actual,
    thaiTodayISO: () => '2026-05-14',
  };
});

import { RecallSnoozeMenu } from '../src/components/backend/recall/RecallSnoozeMenu.jsx';

const recall = { id: 'RECALL-test-1', customerName: 'นาย Eee' };

beforeEach(() => {
  mockSnooze.mockClear();
});

describe('Phase 29 · SN1 RecallSnoozeMenu rendering', () => {
  it('SN1.1 renders header with customer name', () => {
    render(<RecallSnoozeMenu recall={recall} onClose={() => {}} />);
    expect(screen.getByText(/เลื่อน Recall.+นาย Eee/)).toBeInTheDocument();
  });

  it('SN1.2 renders 5 quick-pick chips', () => {
    render(<RecallSnoozeMenu recall={recall} onClose={() => {}} />);
    expect(screen.getByTestId('recall-snooze-quick-1')).toBeInTheDocument();
    expect(screen.getByTestId('recall-snooze-quick-3')).toBeInTheDocument();
    expect(screen.getByTestId('recall-snooze-quick-7')).toBeInTheDocument();
    expect(screen.getByTestId('recall-snooze-quick-14')).toBeInTheDocument();
    expect(screen.getByTestId('recall-snooze-quick-30')).toBeInTheDocument();
  });

  it('SN1.3 quick-pick labels Thai', () => {
    render(<RecallSnoozeMenu recall={recall} onClose={() => {}} />);
    expect(screen.getByText('+1 วัน')).toBeInTheDocument();
    expect(screen.getByText('+1 สัปดาห์')).toBeInTheDocument();
    expect(screen.getByText('+1 เดือน')).toBeInTheDocument();
  });

  it('SN1.4 no quick-pick selected by default', () => {
    render(<RecallSnoozeMenu recall={recall} onClose={() => {}} />);
    expect(screen.getByTestId('recall-snooze-quick-1')).toHaveAttribute('data-selected', 'false');
  });

  it('SN1.5 save button disabled when no date picked', () => {
    render(<RecallSnoozeMenu recall={recall} onClose={() => {}} />);
    expect(screen.getByTestId('recall-snooze-save')).toBeDisabled();
  });

  it('SN1.6 initialDate prop pre-fills picker', () => {
    render(<RecallSnoozeMenu recall={recall} initialDate="2026-05-20" onClose={() => {}} />);
    expect(screen.getByTestId('recall-snooze-save')).not.toBeDisabled();
  });
});

describe('Phase 29 · SN2 quick-pick selection', () => {
  it('SN2.1 click quick-pick → selected + enable save', async () => {
    const user = userEvent.setup();
    render(<RecallSnoozeMenu recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-snooze-quick-3'));
    expect(screen.getByTestId('recall-snooze-quick-3')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('recall-snooze-save')).not.toBeDisabled();
  });

  it('SN2.2 mutex — only one quick-pick selected', async () => {
    const user = userEvent.setup();
    render(<RecallSnoozeMenu recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-snooze-quick-3'));
    await user.click(screen.getByTestId('recall-snooze-quick-7'));
    expect(screen.getByTestId('recall-snooze-quick-3')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('recall-snooze-quick-7')).toHaveAttribute('data-selected', 'true');
  });
});

describe('Phase 29 · SN3 save dispatch', () => {
  it('SN3.1 +3 days fires snoozeRecall with computed date', async () => {
    const user = userEvent.setup();
    const onSnoozed = vi.fn();
    const onClose = vi.fn();
    render(<RecallSnoozeMenu recall={recall} onClose={onClose} onSnoozed={onSnoozed} />);
    await user.click(screen.getByTestId('recall-snooze-quick-3'));
    await user.click(screen.getByTestId('recall-snooze-save'));
    expect(mockSnooze).toHaveBeenCalledWith('RECALL-test-1', '2026-05-17');
    expect(onSnoozed).toHaveBeenCalledWith('2026-05-17');
    expect(onClose).toHaveBeenCalled();
  });

  it('SN3.2 +30 days fires snoozeRecall with date', async () => {
    const user = userEvent.setup();
    render(<RecallSnoozeMenu recall={recall} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-snooze-quick-30'));
    await user.click(screen.getByTestId('recall-snooze-save'));
    expect(mockSnooze).toHaveBeenCalledWith('RECALL-test-1', '2026-06-13');
  });

  it('SN3.3 save failure → error + modal stays open', async () => {
    const user = userEvent.setup();
    mockSnooze.mockImplementationOnce(async () => { throw new Error('snooze-fail'); });
    const onClose = vi.fn();
    render(<RecallSnoozeMenu recall={recall} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-snooze-quick-1'));
    await user.click(screen.getByTestId('recall-snooze-save'));
    // Wait a tick for async error path
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByTestId('recall-snooze-error')).toHaveTextContent('snooze-fail');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Phase 29 · SN4 modal close behaviors', () => {
  it('SN4.1 ESC closes', () => {
    const onClose = vi.fn();
    render(<RecallSnoozeMenu recall={recall} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('SN4.2 close button closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallSnoozeMenu recall={recall} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-snooze-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('SN4.3 cancel button closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallSnoozeMenu recall={recall} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-snooze-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('SN4.4 V83/AV78: backdrop click does NOT close (explicit close only)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallSnoozeMenu recall={recall} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-snooze-menu'));
    // V83 (EOD8 2026-05-18): modals only close via X / Cancel / ESC. See AV78.
    expect(onClose).not.toHaveBeenCalled();
  });
});
