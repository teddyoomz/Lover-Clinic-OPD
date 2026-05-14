import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecallCaseSelectField } from '../src/components/backend/recall/RecallCaseSelectField.jsx';

const cases = [
  { caseId: 'C1', caseName: 'PRP 7-day F/U', defaultDays: 7 },
  { caseId: 'C2', caseName: 'Botox 14-day revisit', defaultDays: 14 },
  { caseId: 'C3', caseName: 'Filler 30-day check', defaultDays: 30 },
];

describe('Phase 29.22 · L7 — RecallCaseSelectField', () => {
  it('L7.1 renders value as text', () => {
    render(<RecallCaseSelectField value="hello" recallCases={cases} onChange={() => {}} onPick={() => {}} />);
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument();
  });

  it('L7.2 typing fires onChange', () => {
    const onChange = vi.fn();
    render(<RecallCaseSelectField value="" recallCases={cases} onChange={onChange} onPick={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PRP' } });
    expect(onChange).toHaveBeenCalledWith('PRP');
  });

  it('L7.3 focus shows dropdown with all visible cases', () => {
    render(<RecallCaseSelectField value="" recallCases={cases} onChange={() => {}} onPick={() => {}} />);
    fireEvent.focus(screen.getByRole('textbox'));
    expect(screen.getByText('PRP 7-day F/U')).toBeInTheDocument();
    expect(screen.getByText('Botox 14-day revisit')).toBeInTheDocument();
  });

  it('L7.4 typing filters dropdown (case-insensitive substring)', () => {
    render(<RecallCaseSelectField value="" recallCases={cases} onChange={() => {}} onPick={() => {}} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'BOTOX' } });
    expect(screen.getByText('Botox 14-day revisit')).toBeInTheDocument();
    expect(screen.queryByText('PRP 7-day F/U')).not.toBeInTheDocument();
  });

  it('L7.5 click row → onPick fires with {caseName, defaultDays}', () => {
    const onPick = vi.fn();
    render(<RecallCaseSelectField value="" recallCases={cases} onChange={() => {}} onPick={onPick} />);
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.mouseDown(screen.getByText('PRP 7-day F/U'));
    expect(onPick).toHaveBeenCalledWith({ caseName: 'PRP 7-day F/U', defaultDays: 7 });
  });

  it('L7.6 empty recallCases → no dropdown rows but input still works', () => {
    const { container } = render(
      <RecallCaseSelectField value="X" recallCases={[]} onChange={() => {}} onPick={() => {}} />
    );
    fireEvent.focus(screen.getByRole('textbox'));
    expect(container.querySelectorAll('[data-recall-case-row]').length).toBe(0);
  });

  it('L7.7 data-field attribute set for scrollToError compatibility', () => {
    render(
      <RecallCaseSelectField value="" recallCases={cases} onChange={() => {}} onPick={() => {}} data-field="my-field" />
    );
    expect(screen.getByRole('textbox').closest('[data-field="my-field"]')).toBeInTheDocument();
  });
});
