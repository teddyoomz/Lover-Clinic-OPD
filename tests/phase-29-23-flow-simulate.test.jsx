/**
 * Phase 29.23 — Rule I full-flow simulate.
 *
 * Chains the user-visible flow end-to-end:
 *   F1 — edit recall round-trip
 *   F2 — delete case round-trip
 *   F3 — customer-name <a> contains backend deep-link URL
 *   F4 — edit on done recall — modal opens + save works
 *   F5 — customerId missing → plain <span> fallback (no <a>)
 *   F6 — onEdit prop wired through RecallList → RecallRow
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mocks — must come BEFORE any imports that use these modules
const updateRecallMock = vi.fn();
const deleteRecallCaseMock = vi.fn();
const listRecallCasesMock = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', async () => {
  const actual = await vi.importActual('../src/lib/scopedDataLayer.js');
  return {
    ...actual,
    updateRecall: (...args) => updateRecallMock(...args),
    deleteRecallCase: (...args) => deleteRecallCaseMock(...args),
    listRecallCases: (...args) => listRecallCasesMock(...args),
    saveRecallCase: vi.fn().mockResolvedValue(undefined),
    setRecallCaseHidden: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'test-uid' } },
  db: {},
}));

vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return { ...actual, thaiTodayISO: () => '2026-05-14' };
});

import { RecallRow } from '../src/components/backend/recall/RecallRow.jsx';
import { RecallEditModal } from '../src/components/backend/recall/RecallEditModal.jsx';
import { RecallList } from '../src/components/backend/recall/RecallList.jsx';
import { RecallCasesAdminPanel } from '../src/components/backend/recall/RecallCasesAdminPanel.jsx';

const RECALL_PENDING = {
  id: 'REC-PENDING',
  customerId: 'LC-26000001',
  customerName: 'นายทดสอบ',
  recallDate: '2026-05-20',
  reason: 'ติดตามอาการ',
  status: 'pending',
};

const RECALL_DONE = {
  id: 'REC-DONE',
  customerId: 'LC-26000002',
  customerName: 'นางสาวทดสอบ',
  recallDate: '2026-05-10',
  reason: 'ครบรอบบริการ',
  status: 'done',
};

describe('Phase 29.23 F1 — edit recall round-trip', () => {
  beforeEach(() => {
    updateRecallMock.mockReset();
    updateRecallMock.mockResolvedValue(undefined);
  });

  it('F1.1 — row click edit → onEdit fired with id → modal opens with prefill', async () => {
    let editingRecall = null;
    function Harness() {
      const [editModal, setEditModal] = React.useState(null);
      return (
        <>
          <RecallRow
            recall={RECALL_PENDING}
            todayISO="2026-05-14"
            onEdit={(id) => {
              editingRecall = id;
              setEditModal({ recall: RECALL_PENDING });
            }}
          />
          {editModal && (
            <RecallEditModal
              recall={editModal.recall}
              recallCases={[]}
              onClose={() => setEditModal(null)}
              onSaved={() => setEditModal(null)}
            />
          )}
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByTestId('recall-edit-REC-PENDING'));
    expect(editingRecall).toBe('REC-PENDING');
    await waitFor(() => {
      expect(screen.getByTestId('recall-edit-modal')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('ติดตามอาการ')).toBeInTheDocument();
  });

  it('F1.2 — save in modal → updateRecall called with patch + modal closes', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return open ? (
        <RecallEditModal
          recall={RECALL_PENDING}
          recallCases={[]}
          onClose={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      ) : (
        <div data-testid="modal-closed" />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(updateRecallMock).toHaveBeenCalledWith('REC-PENDING', {
        recallDate: '2026-05-20',
        reason: 'ติดตามอาการ',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('modal-closed')).toBeInTheDocument();
    });
  });
});

describe('Phase 29.23 F2 — delete case round-trip', () => {
  beforeEach(() => {
    deleteRecallCaseMock.mockReset();
    deleteRecallCaseMock.mockResolvedValue(undefined);
    listRecallCasesMock.mockReset();
    listRecallCasesMock.mockResolvedValue([
      { id: 'CASE-1', caseName: 'ติดตามอาการ', defaultDays: 3, isHidden: false },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('F2.1 — admin panel → click ลบ → confirm → deleteRecallCase + reload + onCasesChanged', async () => {
    const onCasesChanged = vi.fn();
    render(<RecallCasesAdminPanel onCasesChanged={onCasesChanged} />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      expect(deleteRecallCaseMock).toHaveBeenCalledWith('CASE-1', expect.any(Object));
    });
    expect(onCasesChanged).toHaveBeenCalled();
    expect(listRecallCasesMock).toHaveBeenCalledTimes(2);
  });
});

describe('Phase 29.23 F3 — customer-name deep-link', () => {
  it('F3.1 — <a href> contains /?backend=1&customer={encoded id}', () => {
    render(<RecallRow recall={RECALL_PENDING} todayISO="2026-05-14" />);
    const link = screen.getByTestId('recall-customer-link-REC-PENDING');
    expect(link.getAttribute('href')).toMatch(/^\/\?backend=1&customer=LC-26000001$/);
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

describe('Phase 29.23 F4 — edit on done recall', () => {
  beforeEach(() => {
    updateRecallMock.mockReset();
    updateRecallMock.mockResolvedValue(undefined);
  });

  it('F4.1 — edit button renders on done recall', () => {
    render(<RecallRow recall={RECALL_DONE} todayISO="2026-05-14" onEdit={() => {}} />);
    expect(screen.getByTestId('recall-edit-REC-DONE')).toBeInTheDocument();
  });

  it('F4.2 — save updateRecall works on done recall', async () => {
    render(
      <RecallEditModal
        recall={RECALL_DONE}
        recallCases={[]}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(updateRecallMock).toHaveBeenCalledWith('REC-DONE', {
        recallDate: '2026-05-10',
        reason: 'ครบรอบบริการ',
      });
    });
  });
});

describe('Phase 29.23 F5 — customerId missing fallback', () => {
  it('F5.1 — renders plain <span>, no <a>', () => {
    const recall = { ...RECALL_PENDING, customerId: '' };
    render(<RecallRow recall={recall} todayISO="2026-05-14" />);
    expect(screen.queryByTestId('recall-customer-link-REC-PENDING')).toBeNull();
    expect(screen.getByTestId('recall-customer-name-plain-REC-PENDING')).toBeInTheDocument();
  });
});

describe('Phase 29.23 F6 — onEdit prop wired through RecallList → RecallRow', () => {
  it('F6.1 — onEdit on RecallList propagates to row button', () => {
    const onEdit = vi.fn();
    render(
      <RecallList
        recalls={[RECALL_PENDING]}
        todayISO="2026-05-14"
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-REC-PENDING'));
    expect(onEdit).toHaveBeenCalledWith('REC-PENDING');
  });
});
