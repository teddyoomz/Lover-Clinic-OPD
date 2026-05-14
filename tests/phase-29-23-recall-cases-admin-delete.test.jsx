/**
 * Phase 29.23 — RecallCasesAdminPanel delete button RTL tests.
 *
 * Per spec §4.5: 3rd button (after แก้/ซ่อน) — rose-500 accent + confirm
 * dialog + deleteRecallCase + reload + onCasesChanged callback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const listRecallCasesMock = vi.fn();
const saveRecallCaseMock = vi.fn();
const setRecallCaseHiddenMock = vi.fn();
const deleteRecallCaseMock = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', async () => {
  const actual = await vi.importActual('../src/lib/scopedDataLayer.js');
  return {
    ...actual,
    listRecallCases: (...args) => listRecallCasesMock(...args),
    saveRecallCase: (...args) => saveRecallCaseMock(...args),
    setRecallCaseHidden: (...args) => setRecallCaseHiddenMock(...args),
    deleteRecallCase: (...args) => deleteRecallCaseMock(...args),
  };
});

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'test-uid' } },
  db: {},
}));

import { RecallCasesAdminPanel } from '../src/components/backend/recall/RecallCasesAdminPanel.jsx';

const CASES_FIXTURE = [
  { id: 'CASE-1', caseName: 'ติดตามอาการ', defaultDays: 3, isHidden: false },
  { id: 'CASE-2', caseName: 'ครบรอบบริการ', defaultDays: 180, isHidden: false },
];

describe('Phase 29.23 C1 — RecallCasesAdminPanel delete button', () => {
  let confirmSpy;
  beforeEach(() => {
    listRecallCasesMock.mockReset();
    listRecallCasesMock.mockResolvedValue([...CASES_FIXTURE]);
    saveRecallCaseMock.mockReset();
    setRecallCaseHiddenMock.mockReset();
    deleteRecallCaseMock.mockReset();
    deleteRecallCaseMock.mockResolvedValue(undefined);
    // Default confirm spy: returns true (admin clicked OK)
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('C1.1 — delete button renders for each case row', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('recall-case-delete-CASE-2')).toBeInTheDocument();
  });

  it('C1.2 — delete button click → confirm dialog shown with case name', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('ติดตามอาการ');
  });

  it('C1.3 — confirm yes → deleteRecallCase called with case id', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      expect(deleteRecallCaseMock).toHaveBeenCalledTimes(1);
    });
    expect(deleteRecallCaseMock.mock.calls[0][0]).toBe('CASE-1');
  });

  it('C1.4 — confirm cancel → deleteRecallCase NOT called', async () => {
    confirmSpy.mockReturnValueOnce(false);
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    expect(deleteRecallCaseMock).not.toHaveBeenCalled();
  });

  it('C1.5 — onCasesChanged invoked after successful delete', async () => {
    const onCasesChanged = vi.fn();
    render(<RecallCasesAdminPanel onCasesChanged={onCasesChanged} />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      expect(onCasesChanged).toHaveBeenCalled();
    });
  });

  it('C1.6 — delete error → error banner shown', async () => {
    deleteRecallCaseMock.mockRejectedValueOnce(new Error('rules-denied'));
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/rules-denied|ลบไม่สำเร็จ/);
    });
  });

  it('C1.7 — confirm dialog contains "ถาวร" warning + "snapshot" reassurance', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    const msg = confirmSpy.mock.calls[0][0];
    expect(msg).toContain('ถาวร');
    expect(msg).toContain('snapshot');
  });

  it('C1.8 — reload called after successful delete (list re-fetched)', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    // First load counts: 1
    expect(listRecallCasesMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      // After delete, reload triggers a 2nd listRecallCases call
      expect(listRecallCasesMock).toHaveBeenCalledTimes(2);
    });
  });
});
