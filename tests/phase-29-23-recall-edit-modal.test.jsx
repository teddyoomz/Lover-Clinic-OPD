/**
 * Phase 29.23 — RecallEditModal RTL tests.
 *
 * Lightweight edit modal — date + reason only (forensic trail otherwise).
 * Customer/source header read-only. ESC + click-outside + cancel button close.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updateRecallMock = vi.fn();
vi.mock('../src/lib/scopedDataLayer.js', async () => {
  const actual = await vi.importActual('../src/lib/scopedDataLayer.js');
  return {
    ...actual,
    updateRecall: (...args) => updateRecallMock(...args),
  };
});

// Stable today for date validations
vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return { ...actual, thaiTodayISO: () => '2026-05-14' };
});

import { RecallEditModal } from '../src/components/backend/recall/RecallEditModal.jsx';

const RECALL_FIXTURE = {
  id: 'REC-TEST-1',
  customerId: 'LC-26000001',
  customerName: 'นายทดสอบ ทดลอง',
  customerHN: 'HN-8001',
  customerPhone: '0812345678',
  recallDate: '2026-05-20',
  reason: 'ติดตามอาการ',
  sourceProductName: 'Botox 100u',
  status: 'pending',
};

const RECALL_CASES_FIXTURE = [
  { caseId: 'CASE-1', caseName: 'ติดตามอาการ', defaultDays: 3 },
  { caseId: 'CASE-2', caseName: 'ครบรอบบริการ', defaultDays: 180 },
];

describe('Phase 29.23 E1 — RecallEditModal', () => {
  beforeEach(() => {
    updateRecallMock.mockReset();
    updateRecallMock.mockResolvedValue(undefined);
  });

  it('E1.1 — renders with prefilled date + reason from recall prop', () => {
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-modal')).toBeInTheDocument();
    // Customer header is read-only
    expect(screen.getByText(/นายทดสอบ ทดลอง/)).toBeInTheDocument();
    expect(screen.getByText(/HN-8001/)).toBeInTheDocument();
    // Reason typeahead prefilled
    expect(screen.getByDisplayValue('ติดตามอาการ')).toBeInTheDocument();
  });

  it('E1.2 — saves via updateRecall with patched date + reason', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(updateRecallMock).toHaveBeenCalledTimes(1);
    });
    const [id, patch] = updateRecallMock.mock.calls[0];
    expect(id).toBe('REC-TEST-1');
    expect(patch).toEqual({
      recallDate: '2026-05-20',
      reason: 'ติดตามอาการ',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('E1.3 — closes via cancel button', () => {
    const onClose = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('E1.4 — closes via ESC key', () => {
    const onClose = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('E1.5 — closes via backdrop click', () => {
    const onClose = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('E1.6 — backdrop click on inner card does NOT close', () => {
    const onClose = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-card'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('E1.7 — validation banner on empty reason; save disabled', () => {
    render(
      <RecallEditModal
        recall={{ ...RECALL_FIXTURE, reason: '' }}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-validation-reason')).toBeInTheDocument();
    expect(screen.getByTestId('recall-edit-save')).toBeDisabled();
  });

  it('E1.8 — validation banner on empty date; save disabled', () => {
    render(
      <RecallEditModal
        recall={{ ...RECALL_FIXTURE, recallDate: '' }}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-validation-date')).toBeInTheDocument();
    expect(screen.getByTestId('recall-edit-save')).toBeDisabled();
  });

  it('E1.9 — save error shows banner; save button re-enabled', async () => {
    updateRecallMock.mockRejectedValueOnce(new Error('rules-denied'));
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(screen.getByTestId('recall-edit-error')).toHaveTextContent(/rules-denied/);
    });
    expect(screen.getByTestId('recall-edit-save')).not.toBeDisabled();
  });

  it('E1.10 — customer header is read-only (no editable inputs in header)', () => {
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    const header = screen.getByTestId('recall-edit-customer-header');
    expect(header.querySelectorAll('input, select, textarea').length).toBe(0);
  });
});
