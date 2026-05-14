import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const listRecallCasesMock = vi.fn();
const saveRecallCaseMock = vi.fn();
const setRecallCaseHiddenMock = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listRecallCases: (...args) => listRecallCasesMock(...args),
  saveRecallCase: (...args) => saveRecallCaseMock(...args),
  setRecallCaseHidden: (...args) => setRecallCaseHiddenMock(...args),
}));
vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'admin-uid' } },
  db: {},
  appId: 'loverclinic-opd-4c39b',
}));

import { RecallCasesAdminPanel } from '../src/components/backend/recall/RecallCasesAdminPanel.jsx';

describe('Phase 29.22 · L9 — RecallCasesAdminPanel', () => {
  beforeEach(() => {
    listRecallCasesMock.mockReset();
    saveRecallCaseMock.mockReset();
    setRecallCaseHiddenMock.mockReset();
  });

  it('L9.1 mount calls listRecallCases({includeHidden: true})', async () => {
    listRecallCasesMock.mockResolvedValue([]);
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(listRecallCasesMock).toHaveBeenCalledWith({ includeHidden: true });
    });
  });

  it('L9.2 renders table rows with caseName + days', async () => {
    listRecallCasesMock.mockResolvedValue([
      { id: 'C1', caseName: 'A', defaultDays: 7, isHidden: false },
      { id: 'C2', caseName: 'B', defaultDays: 14, isHidden: true },
    ]);
    render(<RecallCasesAdminPanel />);
    expect(await screen.findByText('A')).toBeInTheDocument();
    expect(screen.getByText('7 วัน')).toBeInTheDocument();
  });

  it('L9.3 default filter hides isHidden rows; toggle shows them', async () => {
    listRecallCasesMock.mockResolvedValue([
      { id: 'C1', caseName: 'Active', defaultDays: 7, isHidden: false },
      { id: 'C2', caseName: 'Hidden', defaultDays: 14, isHidden: true },
    ]);
    render(<RecallCasesAdminPanel />);
    await screen.findByText('Active');
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/แสดงที่ซ่อน/));
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('L9.4 search filter (case-insensitive substring)', async () => {
    listRecallCasesMock.mockResolvedValue([
      { id: 'C1', caseName: 'PRP 7d', defaultDays: 7, isHidden: false },
      { id: 'C2', caseName: 'Botox 14d', defaultDays: 14, isHidden: false },
    ]);
    render(<RecallCasesAdminPanel />);
    await screen.findByText('PRP 7d');
    fireEvent.change(screen.getByPlaceholderText(/ค้นหา/), { target: { value: 'BOTOX' } });
    expect(screen.queryByText('PRP 7d')).not.toBeInTheDocument();
    expect(screen.getByText('Botox 14d')).toBeInTheDocument();
  });

  it('L9.5 click "เพิ่มเคส" opens modal', async () => {
    listRecallCasesMock.mockResolvedValue([]);
    render(<RecallCasesAdminPanel />);
    await waitFor(() => expect(listRecallCasesMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มเคส/ }));
    expect(screen.getByText(/เพิ่มเคส Recall ใหม่/)).toBeInTheDocument();
  });

  it('L9.6 hide button calls setRecallCaseHidden(id, true) + reloads', async () => {
    listRecallCasesMock.mockResolvedValue([{ id: 'C1', caseName: 'A', defaultDays: 7, isHidden: false }]);
    setRecallCaseHiddenMock.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RecallCasesAdminPanel />);
    await screen.findByText('A');
    fireEvent.click(screen.getByRole('button', { name: /^ซ่อน$/ }));
    await waitFor(() => {
      expect(setRecallCaseHiddenMock).toHaveBeenCalledWith('C1', true, { uid: 'admin-uid' });
      expect(listRecallCasesMock).toHaveBeenCalledTimes(2);
    });
    confirmSpy.mockRestore();
  });
});
