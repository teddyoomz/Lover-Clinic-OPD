import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecallCaseFormModal } from '../src/components/backend/recall/RecallCaseFormModal.jsx';

describe('Phase 29.22 · L8 — RecallCaseFormModal', () => {
  it('L8.1 add mode: blank form, enter values, save fires onSave with normalized payload', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<RecallCaseFormModal initial={null} existingCases={[]} onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/ชื่อเคส/), { target: { value: '  PRP 7-day F/U  ' } });
    fireEvent.change(screen.getByLabelText(/ระยะเวลา/), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ caseName: 'PRP 7-day F/U', defaultDays: 7, isHidden: false });
    });
  });

  it('L8.2 edit mode: prefilled from initial; preserves id on save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <RecallCaseFormModal
        initial={{ id: 'CASE-EXIST', caseName: 'X', defaultDays: 14, isHidden: false }}
        existingCases={[]}
        onSave={onSave}
        onClose={() => {}}
      />
    );
    expect(screen.getByDisplayValue('X')).toBeInTheDocument();
    expect(screen.getByDisplayValue('14')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'CASE-EXIST', caseName: 'X', defaultDays: 14 }));
    });
  });

  it('L8.3 empty caseName → validation error; onSave NOT called', async () => {
    const onSave = vi.fn();
    render(<RecallCaseFormModal initial={null} existingCases={[]} onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/ระยะเวลา/), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/กรุณากรอก|ชื่อเคส/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('L8.4 caseName collision (case-insensitive trim) → validation error', async () => {
    const onSave = vi.fn();
    render(
      <RecallCaseFormModal
        initial={null}
        existingCases={[{ caseId: 'C1', caseName: 'PRP 7-day', defaultDays: 7, isHidden: false }]}
        onSave={onSave}
        onClose={() => {}}
      />
    );
    fireEvent.change(screen.getByLabelText(/ชื่อเคส/), { target: { value: '  prp 7-day  ' } });
    fireEvent.change(screen.getByLabelText(/ระยะเวลา/), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/ซ้ำ|มีอยู่แล้ว/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('L8.5 edit mode allows same name as self', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <RecallCaseFormModal
        initial={{ id: 'C1', caseName: 'PRP 7-day', defaultDays: 7, isHidden: false }}
        existingCases={[{ caseId: 'C1', caseName: 'PRP 7-day', defaultDays: 7, isHidden: false }]}
        onSave={onSave}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it('L8.6 ESC closes modal', () => {
    const onClose = vi.fn();
    render(<RecallCaseFormModal initial={null} existingCases={[]} onSave={() => {}} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
