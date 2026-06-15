import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const { deleteAssessmentRound } = vi.hoisted(() => ({ deleteAssessmentRound: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/lib/scopedDataLayer.js', () => ({ deleteAssessmentRound }));

import EDScoreBox from '../src/components/backend/EDScoreBox.jsx';

const intake = { adam_1: true, adam_2: true, adam_3: true, adam_6: true, assessmentDate: '2026-05-20' };
const fuA = {
  id: 'A', status: 'completed', assessmentDate: '2026-06-14', types: ['adam', 'iief'],
  rawAnswers: { adam_1: true, adam_3: true, adam_6: true, iief_1: '4', iief_2: '4', iief_3: '4', iief_4: '4', iief_5: '3' },
};

beforeEach(() => { deleteAssessmentRound.mockClear(); });

describe('EDScoreBox', () => {
  it('renders latest round as hero + 4 type chips + derived next-round on send button', () => {
    render(<EDScoreBox customerId="LC-1" intakePerf={intake} assessments={[fuA]} isDark onSend={() => {}} />);
    expect(screen.getByText(/ครั้งล่าสุด/)).toBeInTheDocument();
    expect(screen.getByText(/ครั้งที่ 2/)).toBeInTheDocument();          // hero = derived round 2
    expect(screen.getByTestId('ed-chip-adam')).toBeInTheDocument();
    expect(screen.getByTestId('ed-chip-iief')).toBeInTheDocument();
    expect(screen.getByTestId('ed-chip-mrs')).toHaveTextContent('—');    // never measured
    expect(screen.getByTestId('ed-send-btn')).toHaveTextContent('ครั้งที่ 3'); // next derived
  });

  it('history expands → followup deletable, intake NOT', () => {
    render(<EDScoreBox customerId="LC-1" intakePerf={intake} assessments={[fuA]} isDark onSend={() => {}} />);
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    expect(screen.getByTestId('ed-history-A')).toBeInTheDocument();
    expect(screen.getByTestId('ed-history-__intake__')).toBeInTheDocument();
    expect(screen.getByTestId('ed-delete-A')).toBeInTheDocument();        // followup deletable
    expect(screen.queryByTestId('ed-delete-__intake__')).toBeNull();      // intake NOT deletable
  });

  it('delete confirm → calls deleteAssessmentRound(id)', () => {
    const orig = window.confirm; window.confirm = () => true;
    render(<EDScoreBox customerId="LC-1" intakePerf={intake} assessments={[fuA]} isDark onSend={() => {}} />);
    fireEvent.click(screen.getByTestId('ed-history-toggle'));
    fireEvent.click(screen.getByTestId('ed-delete-A'));
    expect(deleteAssessmentRound).toHaveBeenCalledWith('A');
    window.confirm = orig;
  });

  it('empty state when no rounds → send button = ครั้งที่ 1', () => {
    render(<EDScoreBox customerId="LC-1" intakePerf={{}} assessments={[]} isDark onSend={() => {}} />);
    expect(screen.getByTestId('ed-empty')).toBeInTheDocument();
    expect(screen.getByTestId('ed-send-btn')).toHaveTextContent('ครั้งที่ 1');
  });

  it('onSend receives the derived next-round number', () => {
    const onSend = vi.fn();
    render(<EDScoreBox customerId="LC-1" intakePerf={intake} assessments={[fuA]} isDark onSend={onSend} />);
    fireEvent.click(screen.getByTestId('ed-send-btn'));
    expect(onSend).toHaveBeenCalledWith(3);
  });

  it('chip for a type measured only in an OLDER round shows a (ครั้งที่ X) tag', () => {
    // intake has adam; a later followup has ONLY iief → adam chip should tag ครั้งที่ 1
    const fuIief = { id: 'B', status: 'completed', assessmentDate: '2026-06-20', types: ['iief'],
      rawAnswers: { iief_1: '5', iief_2: '5', iief_3: '5', iief_4: '5', iief_5: '5' } };
    render(<EDScoreBox customerId="LC-1" intakePerf={intake} assessments={[fuIief]} isDark onSend={() => {}} />);
    // hero = round 2 (iief); adam came from round 1 → tagged
    expect(screen.getByTestId('ed-chip-adam')).toHaveTextContent('ครั้งที่ 1');
  });
});
