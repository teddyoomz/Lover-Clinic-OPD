// EDScoreBox round-select — RTL on the REAL component (real assessmentRoundsCore +
// edScoreDisplay cores; only scopedDataLayer.deleteAssessmentRound mocked → no
// mock-shadow because EDScoreBox has NO Firestore query of its own; it renders props).
// Feature: click any history row → chips show THAT round's snapshot + "← ไปที่ครั้งล่าสุด"
// back pill. Default (no selection) = unchanged merged latestPerType view.
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import EDScoreBox from '../src/components/backend/EDScoreBox.jsx';

const mockDelete = vi.fn(() => Promise.resolve());
vi.mock('../src/lib/scopedDataLayer.js', () => ({ deleteAssessmentRound: (...a) => mockDelete(...a) }));

// REAL field names (utils.js): adam_1..10 (bool), iief_1..5 (int), mrs_1..11 (int), symp_pe (bool).
// intake = ADAM 5/10 (positive) + IIEF 10 (dated earlier); followup A2 = ADAM 4/10 + IIEF 13 (today-ish) — mirrors the user screenshot.
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

describe('EDScoreBox round-select', () => {
  beforeEach(() => { mockDelete.mockClear(); window.confirm = vi.fn(() => true); });

  it('R1 default view: header "ครั้งล่าสุด", no back pill', () => {
    setup();
    expect(screen.getByText(/ครั้งล่าสุด:/)).toBeInTheDocument();
    expect(screen.queryByTestId('ed-back-to-latest')).toBeNull();
  });

  it('R2 click round-1 row → header "กำลังดู: ครั้งที่ 1" + back pill appears', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.click(screen.getByTestId('ed-history-__intake__'));
    // header switched to "viewing"; scope to the header span (the row ALSO shows "ครั้งที่ 1" — both correct)
    expect(screen.getByText(/กำลังดู:/)).toHaveTextContent('ครั้งที่ 1');
    expect(screen.getByTestId('ed-back-to-latest')).toBeInTheDocument();
  });

  it('R3 selected round-1 chips show that round only (MRS dash, ADAM no olderTag)', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.click(screen.getByTestId('ed-history-__intake__'));
    expect(within(screen.getByTestId('ed-chip-mrs')).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByTestId('ed-chip-adam')).queryByText(/\(ครั้งที่/)).toBeNull();
  });

  it('R4 back pill → returns to default (header ครั้งล่าสุด, pill gone)', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.click(screen.getByTestId('ed-history-__intake__'));
    fireEvent.click(screen.getByTestId('ed-back-to-latest'));
    expect(screen.getByText(/ครั้งล่าสุด:/)).toBeInTheDocument();
    expect(screen.queryByTestId('ed-back-to-latest')).toBeNull();
  });

  it('R5 delete icon does NOT select the row (stopPropagation)', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.click(screen.getByTestId('ed-delete-A2'));
    expect(mockDelete).toHaveBeenCalledWith('A2');
    expect(screen.queryByText(/กำลังดู:/)).toBeNull();
  });

  it('R6 selecting then deleting that (past) round resets to default (handleDelete reset)', async () => {
    // need a PAST deletable round: intake(r1) + A1(r2) + A2(r3=hero). A1 is past + deletable.
    const twoFollowups = [
      { id: 'A1', status: 'completed', assessmentDate: '2026-06-01', types: ['adam', 'iief'], rawAnswers: { adam_1: true, iief_1: 2, iief_2: 2, iief_3: 2, iief_4: 2, iief_5: 2 } },
      ...assessments, // A2 (2026-06-18) = hero
    ];
    render(<EDScoreBox customerId="C1" intakePerf={intakePerf} assessments={twoFollowups} isDark onSend={vi.fn()} />);
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.click(screen.getByTestId('ed-history-A1')); // select the PAST followup (viewing state)
    expect(screen.getByText(/กำลังดู:/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ed-delete-A1'));
    await screen.findByText(/ครั้งล่าสุด:/);
    expect(screen.queryByTestId('ed-back-to-latest')).toBeNull();
  });

  it('R7 row aria-pressed reflects selection + keyboard (Enter) selects', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    const row = screen.getByTestId('ed-history-__intake__');
    expect(row).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByTestId('ed-history-__intake__')).toHaveAttribute('aria-pressed', 'true');
  });

  it('R8 intake row (รับเข้า, not deletable) is still selectable', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.click(screen.getByTestId('ed-history-__intake__'));
    expect(screen.getByText(/· รับเข้า/)).toBeInTheDocument();
  });

  it('R9 keyboard Enter on the delete button does NOT also select the row (no double-fire)', () => {
    setup();
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.keyDown(screen.getByTestId('ed-delete-A2'), { key: 'Enter' });
    expect(screen.queryByText(/กำลังดู:/)).toBeNull(); // keydown on nested button must not bubble-select the row
  });
});

// Adversarial-Workflow coverage gaps (2026-06-18): select-hero values, direct round→round,
// prop-change stale-id guard, Space key, cross-round olderTag in the merged default view.
describe('EDScoreBox round-select — adversarial coverage', () => {
  beforeEach(() => { window.confirm = vi.fn(() => true); });
  const expand = () => fireEvent.click(screen.getByTestId('ed-history-toggle'));

  it('C1 selecting the hero (latest) row STAYS in the default view (it IS home — no viewing state)', () => {
    setup(); expand();
    fireEvent.click(screen.getByTestId('ed-history-A2')); // hero / latest
    expect(screen.getByText(/ครั้งล่าสุด:/)).toBeInTheDocument();
    expect(screen.queryByText(/กำลังดู:/)).toBeNull();
    expect(screen.queryByTestId('ed-back-to-latest')).toBeNull();
    expect(screen.getByTestId('ed-history-A2')).toHaveAttribute('aria-pressed', 'false'); // no highlight on the hero
    expect(within(screen.getByTestId('ed-chip-iief')).getByText('13')).toBeInTheDocument(); // still shows latest (merged)
  });

  it('C2 select a PAST round → viewing state (aria + กำลังดู + IIEF 10); clicking the hero returns to default', () => {
    setup(); expand();
    fireEvent.click(screen.getByTestId('ed-history-__intake__')); // past (round 1)
    expect(screen.getByTestId('ed-history-__intake__')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/กำลังดู:/)).toHaveTextContent('ครั้งที่ 1');
    expect(within(screen.getByTestId('ed-chip-iief')).getByText('10')).toBeInTheDocument(); // intake iief = 2×5 snapshot
    fireEvent.click(screen.getByTestId('ed-history-A2')); // hero → back to default
    expect(screen.getByText(/ครั้งล่าสุด:/)).toBeInTheDocument();
    expect(screen.getByTestId('ed-history-__intake__')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('ed-back-to-latest')).toBeNull();
  });

  it('C3 Space key selects a PAST round (spec requires Enter/Space) → viewing state', () => {
    setup(); expand();
    fireEvent.keyDown(screen.getByTestId('ed-history-__intake__'), { key: ' ' });
    expect(screen.getByTestId('ed-history-__intake__')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/กำลังดู:/)).toHaveTextContent('ครั้งที่ 1');
  });

  it('C4 prop-change removes the selected PAST round → derived guard auto-resets to default', () => {
    const { rerender } = setup();
    expand();
    fireEvent.click(screen.getByTestId('ed-history-__intake__')); // select the past (intake) round
    expect(screen.getByText(/กำลังดู:/)).toHaveTextContent('ครั้งที่ 1');
    // intake round vanishes (its source prop emptied) → selectedRoundId '__intake__' no longer resolves → guard → default
    rerender(<EDScoreBox customerId="C1" intakePerf={{}} assessments={assessments} isDark onSend={vi.fn()} />);
    expect(screen.getByText(/ครั้งล่าสุด:/)).toBeInTheDocument();
    expect(screen.queryByText(/กำลังดู:/)).toBeNull();
    expect(screen.queryByTestId('ed-back-to-latest')).toBeNull();
  });

  it('C6 selecting the LATEST round (hero) shows NO back button; a past round does', () => {
    setup(); expand();
    fireEvent.click(screen.getByTestId('ed-history-A2')); // A2 = round 2 = hero (latest)
    expect(screen.queryByTestId('ed-back-to-latest')).toBeNull(); // already at latest → no "ไปที่ครั้งล่าสุด"
    fireEvent.click(screen.getByTestId('ed-history-__intake__')); // round 1 = past
    expect(screen.getByTestId('ed-back-to-latest')).toBeInTheDocument(); // past round → button shows
  });

  it('C5 cross-round olderTag in the merged DEFAULT view + round-trip via the PAST round restores it', () => {
    // intake measures adam+iief+MRS; hero A2 measures only adam+iief → latestPerType[mrs] = intake (round 1, older than hero).
    const intakeV = { ...intakePerf, mrs_1: 2, mrs_2: 2 };
    render(<EDScoreBox customerId="C1" intakePerf={intakeV} assessments={assessments} isDark onSend={vi.fn()} />);
    // default merged view: MRS chip carries the older value + "(ครั้งที่ 1)" tag (NOT a dash)
    const mrsDefault = screen.getByTestId('ed-chip-mrs');
    expect(within(mrsDefault).getByText(/\(ครั้งที่ 1\)/)).toBeInTheDocument();
    expect(within(mrsDefault).queryByText('—')).toBeNull();
    // select the PAST round (intake — it DID measure MRS) → single-round snapshot: MRS shown WITHOUT the cross-round tag
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.click(screen.getByTestId('ed-history-__intake__'));
    expect(within(screen.getByTestId('ed-chip-mrs')).queryByText(/\(ครั้งที่/)).toBeNull(); // single round → no olderTag
    expect(within(screen.getByTestId('ed-chip-mrs')).queryByText('—')).toBeNull(); // intake measured MRS → a value
    // back to default → olderTag reappears (merged view restored exactly)
    fireEvent.click(screen.getByTestId('ed-back-to-latest'));
    expect(within(screen.getByTestId('ed-chip-mrs')).getByText(/\(ครั้งที่ 1\)/)).toBeInTheDocument();
  });
});
