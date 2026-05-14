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

// Phase 29.23-bis — mock RecallCaseSelectField to expose onPick via click-able
// buttons (real typeahead uses React Portal which is hard to drive in jsdom).
// Mock preserves the <input value={value}> shape so existing E1.1 getByDisplayValue
// assertion still works.
vi.mock('../src/components/backend/recall/RecallCaseSelectField.jsx', () => ({
  RecallCaseSelectField: ({ value, onChange, onPick, recallCases }) => (
    <div data-testid="mock-recall-case-select">
      <input
        data-testid="mock-recall-case-input"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {(recallCases || []).map((c) => (
        <button
          key={c.caseId}
          type="button"
          data-testid={`mock-recall-case-pick-${c.caseId}`}
          onClick={() => onPick?.(c)}
        >
          {c.caseName}
        </button>
      ))}
    </div>
  ),
}));

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

  // Phase 29.23-bis (2026-05-14) — case-pick auto-fill recallDate
  //
  // User report (verbatim): "ลองเลือกเหตุผลที่มีบันทึกอยู่ผ่าน dropdown แต่บั๊ค
  // คือ ดันไม่ดึงวันในข้อมูลเหตุผลมาเปลี่ยนวันที่ ทำให้แก้ไขเปลี่ยนเหตุผล
  // แล้วดึงข้อมูลวันมาเปลี่ยนตรงช่อง วันที่ Recall แบบ auto ด้วย แต่ถ้า user
  // เลือกกดเพื่อเปลี่ยนวันก็สามารถ override ได้".
  //
  // Fix: onPick now sets BOTH reason AND recallDate (today + defaultDays).
  // Mirror of RecallSlotCard.jsx create-mode behavior.

  it('E1.11 — picking case via dropdown auto-fills recallDate from today + defaultDays', async () => {
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    // Pick CASE-2: caseName='ครบรอบบริการ', defaultDays=180
    // todayISO mocked to '2026-05-14' → +180 days = '2026-11-10'
    fireEvent.click(screen.getByTestId('mock-recall-case-pick-CASE-2'));

    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(updateRecallMock).toHaveBeenCalledTimes(1);
    });
    const patch = updateRecallMock.mock.calls[0][1];
    expect(patch.reason).toBe('ครบรอบบริการ');
    expect(patch.recallDate).toBe('2026-11-10');
  });

  it('E1.12 — picking case with defaultDays=0 → only reason updates, recallDate preserved', async () => {
    const RECALL_CASES_WITH_ZERO = [
      { caseId: 'CASE-ZERO', caseName: 'เคสไม่มีระยะ', defaultDays: 0 },
    ];
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_WITH_ZERO}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('mock-recall-case-pick-CASE-ZERO'));

    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(updateRecallMock).toHaveBeenCalledTimes(1);
    });
    const patch = updateRecallMock.mock.calls[0][1];
    expect(patch.reason).toBe('เคสไม่มีระยะ');
    // recallDate stays at initial RECALL_FIXTURE.recallDate (2026-05-20),
    // NOT overwritten — defaultDays=0 means "no auto-fill". Same defensive
    // gate as RecallSlotCard.
    expect(patch.recallDate).toBe('2026-05-20');
  });
});
