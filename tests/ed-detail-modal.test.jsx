// ED chip → 2-panel COMPARE detail modal — RTL on the REAL EDScoreBox + EDDetailModal
// (real edQuestions/edScoreDisplay/edCompare/assessmentRoundsCore cores; only
// scopedDataLayer.deleteAssessmentRound + useLayoutPreference mocked — neither component
// has a Firestore query of its own → no mock-shadow).
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { thaiTodayISO } from '../src/utils.js';
import EDScoreBox from '../src/components/backend/EDScoreBox.jsx';

vi.mock('../src/lib/scopedDataLayer.js', () => ({ deleteAssessmentRound: vi.fn(() => Promise.resolve()) }));
// swap/layout: mock the persistence hook so the test drives panel order + spies the swap call.
const layout = vi.hoisted(() => ({ left: true, swap: vi.fn() }));
vi.mock('../src/hooks/useLayoutPreference.js', () => ({
  useLayoutPreference: () => ({ isPrimaryLeft: layout.left, swap: layout.swap, position: layout.left ? 'left' : 'right', setPosition: vi.fn() }),
}));

// intake = round 1 (adam 5/10 + iief 10, older). A2 = round 2 = hero (adam 4/10 + iief 13).
const intakePerf = {
  assessmentDate: '2026-05-13',
  adam_1: true, adam_2: true, adam_3: true, adam_4: true, adam_5: true,
  iief_1: 2, iief_2: 2, iief_3: 2, iief_4: 2, iief_5: 2,
};
const A2 = {
  id: 'A2', status: 'completed', assessmentDate: '2026-06-18', types: ['adam', 'iief'],
  rawAnswers: { adam_1: true, adam_2: true, adam_3: true, adam_4: true, iief_1: 3, iief_2: 3, iief_3: 3, iief_4: 2, iief_5: 2 },
};
const setup = (intake = intakePerf, assessments = [A2]) =>
  render(<EDScoreBox customerId="C1" intakePerf={intake} assessments={assessments} isDark onSend={vi.fn()} />);
const openModal = (type) => fireEvent.click(screen.getByTestId(`ed-chip-${type}`));

describe('ED chip → 2-panel compare modal', () => {
  beforeEach(() => { window.confirm = vi.fn(() => true); layout.left = true; layout.swap.mockClear(); });

  it('CM1 ≥2 rounds w/ type → 2 panels; both scores visible (primary 13, compare 10)', () => {
    setup(); openModal('iief');
    expect(screen.getByTestId('ed-detail-modal')).toBeInTheDocument();
    const p = screen.getByTestId('ed-panel-primary');
    const c = screen.getByTestId('ed-panel-compare');
    expect(within(p).getByText('13')).toBeInTheDocument();   // primary = A2 (latest)
    expect(within(c).getByText('10')).toBeInTheDocument();   // compare = intake (prior)
    expect(within(p).getByTestId('ed-panel-primary-row-5')).toBeInTheDocument(); // 5 iief rows
    expect(within(p).queryByTestId('ed-panel-primary-row-6')).toBeNull();
  });

  it('CM2 only ONE round → single panel + hint, no swap, no compare panel', () => {
    setup(intakePerf, []); // intake only
    openModal('iief');
    expect(screen.getByTestId('ed-compare-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('ed-panel-compare')).toBeNull();
    expect(screen.queryByTestId('ed-swap')).toBeNull();
    expect(screen.getByTestId('ed-panel-primary-row-1')).toBeInTheDocument();
  });

  it('CM3 type tab switches BOTH panels; primary lacking type → empty, compare auto-finds it', () => {
    // intake measures mrs; A2 does not → tab MRS: primary(A2) empty, compare(intake) shows mrs
    setup({ ...intakePerf, mrs_1: 2, mrs_2: 1 });
    openModal('adam');                 // primary = A2 (hero, has adam)
    expect(screen.queryByTestId('ed-panel-primary-empty')).toBeNull();
    fireEvent.click(screen.getByTestId('ed-tab-mrs'));
    expect(screen.getByTestId('ed-panel-primary-empty')).toHaveTextContent('ไม่ได้ประเมิน MRS');
    expect(within(screen.getByTestId('ed-panel-compare')).getByTestId('ed-panel-compare-row-1')).toBeInTheDocument();
  });

  it('CM4 per-panel picker changes that panel (primary → intake, score 10)', () => {
    setup(); openModal('iief');
    expect(within(screen.getByTestId('ed-panel-primary')).getByText('13')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('ed-panel-primary-pick'), { target: { value: '__intake__' } });
    expect(within(screen.getByTestId('ed-panel-primary')).getByText('10')).toBeInTheDocument();
  });

  it('CM5 swap button present + calls the hook swap', () => {
    setup(); openModal('iief');
    fireEvent.click(screen.getByTestId('ed-swap'));
    expect(layout.swap).toHaveBeenCalled();
  });

  it('CM6 panel order follows isPrimaryLeft (true → primary first; false → compare first)', () => {
    setup(); openModal('iief');
    let p = screen.getByTestId('ed-panel-primary');
    let c = screen.getByTestId('ed-panel-compare');
    expect(p.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // primary before compare
    layout.left = false;
    fireEvent.click(screen.getByTestId('ed-tab-adam')); // force a re-render
    p = screen.getByTestId('ed-panel-primary');
    c = screen.getByTestId('ed-panel-compare');
    expect(c.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // compare before primary
  });

  it('CM7 rows that changed get the sky highlight; identical rows do not (ADAM row 5 vs row 1)', () => {
    setup(); openModal('adam'); // A2 adam_5 false (ไม่มี) vs intake adam_5 true (มีอาการ) → changed
    const row5 = screen.getByTestId('ed-panel-primary-row-5');
    const row1 = screen.getByTestId('ed-panel-primary-row-1'); // both true → identical
    expect(row5.className).toContain('sky');
    expect(row1.className).not.toContain('sky');
  });

  it('CM8 "ล่าสุด" badge only on the hero panel; "วันนี้" when the round date is today', () => {
    const todayA2 = { ...A2, assessmentDate: thaiTodayISO() };
    setup(intakePerf, [todayA2]);
    openModal('iief');
    expect(screen.getByTestId('ed-panel-primary-badge-latest')).toBeInTheDocument();
    expect(screen.getByTestId('ed-panel-primary-badge-today')).toBeInTheDocument();
    expect(screen.queryByTestId('ed-panel-compare-badge-latest')).toBeNull(); // intake is NOT the hero
  });

  it('CM9 badges never squeeze: flex:none + centered + nowrap classes', () => {
    setup(); openModal('iief');
    const badge = screen.getByTestId('ed-panel-primary-badge-latest');
    expect(badge.className).toContain('whitespace-nowrap');
    expect(badge.className).toContain('shrink-0');
    expect(badge.className).toContain('justify-center');
  });

  it('CM10 PE (single question, only in intake) → single panel, 1 row "มีอาการ", hint', () => {
    setup({ ...intakePerf, symp_pe: true });
    openModal('pe');
    expect(screen.getByTestId('ed-panel-primary-row-1')).toHaveTextContent('มีอาการ');
    expect(screen.queryByTestId('ed-panel-primary-row-2')).toBeNull();
    expect(screen.getByTestId('ed-compare-hint')).toBeInTheDocument();
  });

  it('CM11 AV78: backdrop click does NOT close; ✕ closes; ESC closes', () => {
    setup(); openModal('iief');
    fireEvent.click(screen.getByTestId('ed-detail-backdrop'));
    expect(screen.getByTestId('ed-detail-modal')).toBeInTheDocument(); // backdrop → stays open
    fireEvent.click(screen.getByTestId('ed-detail-close'));
    expect(screen.queryByTestId('ed-detail-modal')).toBeNull();        // ✕ → closes
    openModal('iief');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByTestId('ed-detail-modal')).toBeNull();        // ESC → closes
  });

  it('CM12 keyboard Enter on a chip opens the modal; tab is a real button (Enter/Space native)', () => {
    setup();
    fireEvent.keyDown(screen.getByTestId('ed-chip-adam'), { key: 'Enter' });
    expect(screen.getByTestId('ed-detail-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('ed-tab-mrs')).toBeNull(); // mrs not a tab (no round measures it) — sanity
  });

  it('CM13 row shows full question text + the chosen option label (intake panel iief_1=2 → "น้อย (2)")', () => {
    setup(); openModal('iief');
    const compareRow1 = within(screen.getByTestId('ed-panel-compare')).getByTestId('ed-panel-compare-row-1');
    expect(within(compareRow1).getByText(/ความมั่นใจ/)).toBeInTheDocument();
    expect(within(compareRow1).getByText('น้อย (2)')).toBeInTheDocument(); // intake iief_1 = 2
  });

  // ── adversarial-review fixes (2026-06-18): compare-picker type filter + state-edge re-anchor ──

  it('CM14 compare picker lists ONLY rounds measuring the active type (no silent-fallback mismatch)', () => {
    // intake(adam+iief+mrs, r1) · A1(iief only, r2) · A2(adam only, r3=hero)
    const A1 = { id: 'A1', status: 'completed', assessmentDate: '2026-06-01', types: ['iief'], rawAnswers: { iief_1: 4, iief_2: 4, iief_3: 4, iief_4: 4, iief_5: 4 } };
    const A2adam = { id: 'A2', status: 'completed', assessmentDate: '2026-06-18', types: ['adam'], rawAnswers: { adam_1: true, adam_2: true } };
    setup({ ...intakePerf, mrs_1: 2 }, [A1, A2adam]);
    openModal('adam'); // primary = A2 (latest adam); compare picker = adam-having rounds excl A2 = intake only
    const compareSel = screen.getByTestId('ed-panel-compare-pick');
    expect(within(compareSel).getByText(/ครั้งที่ 1/)).toBeInTheDocument();  // intake (has adam)
    expect(within(compareSel).queryByText(/ครั้งที่ 2/)).toBeNull();          // A1 (iief-only) EXCLUDED
    // switch to IIEF → A1 (round 2) becomes a valid compare option
    fireEvent.click(screen.getByTestId('ed-tab-iief'));
    expect(within(screen.getByTestId('ed-panel-compare-pick')).getByText(/ครั้งที่ 2/)).toBeInTheDocument();
  });

  it('CM15 a manual compare pick persists across a type switch (when the round has both types)', () => {
    // 3 rounds all adam+iief; manually pick intake as compare on ADAM → persists on IIEF
    const A1 = { id: 'A1', status: 'completed', assessmentDate: '2026-06-01', types: ['adam', 'iief'], rawAnswers: { adam_1: true, iief_1: 4, iief_2: 4, iief_3: 4, iief_4: 4, iief_5: 4 } };
    setup(intakePerf, [A1, A2]); // intake r1, A1 r2, A2 r3=hero
    openModal('adam'); // primary = A2; compare auto = A1 (nearest prior adam)
    fireEvent.change(screen.getByTestId('ed-panel-compare-pick'), { target: { value: '__intake__' } });
    expect(screen.getByTestId('ed-panel-compare-pick').value).toBe('__intake__');
    fireEvent.click(screen.getByTestId('ed-tab-iief')); // intake has iief → manual pick persists
    expect(screen.getByTestId('ed-panel-compare-pick').value).toBe('__intake__');
    expect(within(screen.getByTestId('ed-panel-compare')).getByText('10')).toBeInTheDocument(); // intake iief = 2×5
  });

  it('CM16 primary round deleted mid-modal (rounds prop shrinks) → re-anchors to a valid round, no broken select', () => {
    const { rerender } = setup(); // intake + A2; open 2-panel
    openModal('iief');
    expect(screen.getByTestId('ed-panel-compare')).toBeInTheDocument();
    // A2 (the primary) vanishes from a background listener re-fire
    rerender(<EDScoreBox customerId="C1" intakePerf={intakePerf} assessments={[]} isDark onSend={vi.fn()} />);
    expect(screen.getByTestId('ed-detail-modal')).toBeInTheDocument();          // still open, no crash
    expect(screen.queryByTestId('ed-panel-compare')).toBeNull();                // only intake left → single
    expect(screen.getByTestId('ed-panel-primary-pick').value).toBe('__intake__'); // re-anchored to a REAL round (not stale A2)
  });
});

// Source-grep regression locks (the contract that mocks can't see).
import { readFileSync } from 'node:fs';
describe('EDDetailModal source contract', () => {
  const src = readFileSync('src/components/backend/EDDetailModal.jsx', 'utf8');
  it('SG1 AV78: backdrop div opening tag has NO onClick (check JSX, not the comment)', () => {
    const i = src.indexOf('data-testid="ed-detail-backdrop"');
    const openingTag = src.slice(src.lastIndexOf('<div', i), src.indexOf('>', i));
    expect(openingTag).toContain('role="dialog"');   // sanity: we sliced the right tag
    expect(openingTag).not.toMatch(/onClick/);
  });
  it('SG2 uses useLayoutPreference(\'ed-compare\')', () => {
    expect(src).toMatch(/useLayoutPreference\(\s*['"]ed-compare['"]/);
  });
  it('SG3 reuses buildEdAnswerRows + scoreForType (no re-impl)', () => {
    expect(src).toMatch(/buildEdAnswerRows\(/);
    expect(src).toMatch(/scoreForType\(/);
  });
  it('SG4 imports the pure compare helpers', () => {
    expect(src).toMatch(/autoPickCompareRound/);
    expect(src).toMatch(/markChangedRows/);
  });
  it('SG5 badge classes are no-squeeze (whitespace-nowrap + shrink-0)', () => {
    const badge = src.slice(src.indexOf('function Badge'), src.indexOf('function Badge') + 400);
    expect(badge).toMatch(/whitespace-nowrap/);
    expect(badge).toMatch(/shrink-0/);
  });
});
