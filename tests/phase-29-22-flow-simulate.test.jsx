// Phase 29.22 (2026-05-14) — Rule I full-flow simulate.
// Chains: admin opens panel → creates case → list refreshes → edit → re-list,
// + soft-archive flow + dedup collision flow.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const listRecallCasesMock = vi.fn();
const saveRecallCaseMock = vi.fn();
const setRecallCaseHiddenMock = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listRecallCases: (...a) => listRecallCasesMock(...a),
  saveRecallCase: (...a) => saveRecallCaseMock(...a),
  setRecallCaseHidden: (...a) => setRecallCaseHiddenMock(...a),
}));

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'admin-uid' } },
  db: {},
  appId: 'loverclinic-opd-4c39b',
}));

import { RecallCasesAdminPanel } from '../src/components/backend/recall/RecallCasesAdminPanel.jsx';

describe('Phase 29.22 · F1 — Rule I full-flow simulate', () => {
  beforeEach(() => {
    listRecallCasesMock.mockReset();
    saveRecallCaseMock.mockReset();
    setRecallCaseHiddenMock.mockReset();
  });

  it('F1.1 CRUD flow: create → reload → display in table', async () => {
    // Initial load: empty
    listRecallCasesMock.mockResolvedValueOnce([]);
    render(<RecallCasesAdminPanel />);
    await waitFor(() => expect(listRecallCasesMock).toHaveBeenCalledTimes(1));

    // Open add modal
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มเคส/ }));
    fireEvent.change(screen.getByLabelText(/ชื่อเคส/), { target: { value: 'PRP 7-day F/U' } });
    fireEvent.change(screen.getByLabelText(/ระยะเวลา/), { target: { value: '7' } });

    // Mock the reload response to include the new case
    listRecallCasesMock.mockResolvedValueOnce([
      { id: 'CASE-NEW', caseName: 'PRP 7-day F/U', defaultDays: 7, isHidden: false },
    ]);
    saveRecallCaseMock.mockResolvedValueOnce(undefined);

    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));

    await waitFor(() => {
      expect(saveRecallCaseMock).toHaveBeenCalledWith(
        { caseName: 'PRP 7-day F/U', defaultDays: 7, isHidden: false },
        { uid: 'admin-uid' }
      );
    });
    // After save → reload → table shows new row
    await waitFor(() => {
      expect(screen.getByText('PRP 7-day F/U')).toBeInTheDocument();
      expect(screen.getByText('7 วัน')).toBeInTheDocument();
    });
  });

  it('F1.2 soft-archive flow: hide → filtered out → toggle show → badge visible', async () => {
    // Initial: 1 visible case
    listRecallCasesMock.mockResolvedValueOnce([
      { id: 'CASE-1', caseName: 'X', defaultDays: 7, isHidden: false },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RecallCasesAdminPanel />);
    await screen.findByText('X');

    // After hide, reload shows it hidden
    listRecallCasesMock.mockResolvedValueOnce([
      { id: 'CASE-1', caseName: 'X', defaultDays: 7, isHidden: true },
    ]);
    setRecallCaseHiddenMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: /^ซ่อน$/ }));
    await waitFor(() => {
      expect(setRecallCaseHiddenMock).toHaveBeenCalledWith('CASE-1', true, { uid: 'admin-uid' });
    });

    // Row filtered out (default showHidden=false)
    await waitFor(() => {
      expect(screen.queryByText('X')).not.toBeInTheDocument();
    });

    // Toggle showHidden → row reappears with badge
    fireEvent.click(screen.getByLabelText(/แสดงที่ซ่อน/));
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('ซ่อน')).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('F1.3 dedup collision: existing case → form modal blocks save', async () => {
    listRecallCasesMock.mockResolvedValueOnce([
      { id: 'CASE-EXISTING', caseName: 'PRP 7d', defaultDays: 7, isHidden: false },
    ]);
    render(<RecallCasesAdminPanel />);
    await screen.findByText('PRP 7d');

    fireEvent.click(screen.getByRole('button', { name: /เพิ่มเคส/ }));
    fireEvent.change(screen.getByLabelText(/ชื่อเคส/), { target: { value: '  prp 7d  ' } });
    fireEvent.change(screen.getByLabelText(/ระยะเวลา/), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: /^บันทึก$/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/ซ้ำ|มีอยู่แล้ว/);
    expect(saveRecallCaseMock).not.toHaveBeenCalled();
  });
});
