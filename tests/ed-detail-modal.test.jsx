// ED chip → per-question detail modal — RTL on the REAL EDScoreBox + EDDetailModal
// (real edQuestions/edScoreDisplay/assessmentRoundsCore cores; only deleteAssessmentRound
// mocked — neither component has a Firestore query of its own → no mock-shadow).
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import EDScoreBox from '../src/components/backend/EDScoreBox.jsx';

vi.mock('../src/lib/scopedDataLayer.js', () => ({ deleteAssessmentRound: vi.fn(() => Promise.resolve()) }));

// base: intake (adam 5/10 + iief 10) + A2 (adam 4/10 + iief 13). No mrs/pe → mrs/pe chips = "—".
const intakePerf = {
  assessmentDate: '2026-05-13',
  adam_1: true, adam_2: true, adam_3: true, adam_4: true, adam_5: true,
  iief_1: 2, iief_2: 2, iief_3: 2, iief_4: 2, iief_5: 2,
};
const assessments = [{
  id: 'A2', status: 'completed', assessmentDate: '2026-06-18', types: ['adam', 'iief'],
  rawAnswers: { adam_1: true, adam_2: true, adam_3: true, adam_4: true, iief_1: 3, iief_2: 3, iief_3: 3, iief_4: 2, iief_5: 2 },
}];
const setup = (props = {}) =>
  render(<EDScoreBox customerId="C1" intakePerf={intakePerf} assessments={assessments} isDark onSend={vi.fn()} {...props} />);

describe('ED chip → detail modal', () => {
  beforeEach(() => { window.confirm = vi.fn(() => true); });

  it('D1 click IIEF chip → modal opens with 5 rows + score 13', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-chip-iief'));
    expect(screen.getByTestId('ed-detail-modal')).toBeInTheDocument();
    expect(screen.getByTestId('ed-detail-row-5')).toBeInTheDocument();
    expect(screen.queryByTestId('ed-detail-row-6')).toBeNull(); // exactly 5 iief questions
    expect(within(screen.getByTestId('ed-detail-modal')).getByText('13')).toBeInTheDocument();
  });

  it('D2 row shows full question text + the chosen option label (A2 iief_1=3 → "ปานกลาง (3)")', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-chip-iief'));
    const row1 = screen.getByTestId('ed-detail-row-1');
    expect(within(row1).getByText(/ความมั่นใจ/)).toBeInTheDocument();
    expect(within(row1).getByText('ปานกลาง (3)')).toBeInTheDocument();
    expect(within(screen.getByTestId('ed-detail-row-4')).getByText('ยากมาก (2)')).toBeInTheDocument();
  });

  it('D3 click ADAM chip → 10 rows; a "true" answer renders "มีอาการ"', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-chip-adam'));
    expect(screen.getByTestId('ed-detail-row-10')).toBeInTheDocument();
    expect(within(screen.getByTestId('ed-detail-row-1')).getByText('มีอาการ')).toBeInTheDocument();
  });

  it('D4 ✕ closes the modal', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-chip-iief'));
    fireEvent.click(screen.getByTestId('ed-detail-close'));
    expect(screen.queryByTestId('ed-detail-modal')).toBeNull();
  });

  it('D5 ESC closes the modal', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-chip-iief'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByTestId('ed-detail-modal')).toBeNull();
  });

  it('D6 backdrop click does NOT close (AV78)', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-chip-iief'));
    fireEvent.click(screen.getByTestId('ed-detail-backdrop'));
    expect(screen.getByTestId('ed-detail-modal')).toBeInTheDocument();
  });

  it('D7 a "—" chip (no data: MRS in base fixture) is NOT clickable → no modal', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-chip-mrs'));
    expect(screen.queryByTestId('ed-detail-modal')).toBeNull();
  });

  it('D8 after selecting a past round, the chip detail shows THAT round (intake → "ครั้งที่ 1" + iief 2→"น้อย (2)")', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.click(screen.getByTestId('ed-history-__intake__'));
    fireEvent.click(screen.getByTestId('ed-chip-iief'));
    const modal = screen.getByTestId('ed-detail-modal');
    expect(within(modal).getByText(/ครั้งที่ 1/)).toBeInTheDocument();
    expect(within(screen.getByTestId('ed-detail-row-1')).getByText('น้อย (2)')).toBeInTheDocument(); // intake iief_1 = 2
  });

  it('D9 PE chip (single question) → 1 row "มีอาการ"', () => {
    render(<EDScoreBox customerId="C1" intakePerf={{ ...intakePerf, symp_pe: true }} assessments={assessments} isDark onSend={vi.fn()} />);
    fireEvent.click(screen.getByTestId('ed-chip-pe'));
    expect(screen.getByTestId('ed-detail-row-1')).toBeInTheDocument();
    expect(screen.queryByTestId('ed-detail-row-2')).toBeNull();
    expect(within(screen.getByTestId('ed-detail-row-1')).getByText('มีอาการ')).toBeInTheDocument();
  });

  it('D10 keyboard Enter on a chip opens the modal', () => {
    setup();
    fireEvent.keyDown(screen.getByTestId('ed-chip-adam'), { key: 'Enter' });
    expect(screen.getByTestId('ed-detail-modal')).toBeInTheDocument();
  });
});
