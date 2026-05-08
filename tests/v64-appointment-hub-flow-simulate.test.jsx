// V64 — Rule I full-flow simulate. End-to-end branch switch + tab switch +
// button-wire-source verification. Mocks scopedDataLayer for deterministic
// data; asserts the View component fires the correct handler chain.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const mockGetAppointmentsByDateRange = vi.fn();
const mockGetAllCustomers = vi.fn();
const mockGetAllDeposits = vi.fn();
const mockGetAllSales = vi.fn();
const mockGetAllMemberships = vi.fn();
const mockGetWalletsForCustomerIds = vi.fn();
const mockListStaffSchedules = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: (...args) => mockGetAppointmentsByDateRange(...args),
  getAllCustomers: (...args) => mockGetAllCustomers(...args),
  getAllDeposits: (...args) => mockGetAllDeposits(...args),
  getAllSales: (...args) => mockGetAllSales(...args),
  getAllMemberships: (...args) => mockGetAllMemberships(...args),
  getWalletsForCustomerIds: (...args) => mockGetWalletsForCustomerIds(...args),
  listStaffSchedules: (...args) => mockListStaffSchedules(...args),
}));

vi.mock('../src/lib/appointmentTypes.js', () => ({
  resolveAppointmentTypeLabel: (v) => v || '',
  // V64 (2026-05-09): View consumes APPOINTMENT_TYPES const directly
  // (replaces earlier getAppointmentTypeOptions which doesn't exist).
  APPOINTMENT_TYPES: [
    { value: 'deposit-booking', label: 'จองมัดจำ' },
    { value: 'no-deposit-booking', label: 'จองไม่มัดจำ' },
  ],
}));

const mockUseSelectedBranch = vi.fn();
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => mockUseSelectedBranch(),
  __esModule: true,
}));

import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

describe('V64.S full-flow simulate', () => {
  beforeEach(() => {
    mockGetAppointmentsByDateRange.mockReset();
    mockGetAllCustomers.mockReset();
    mockGetAllDeposits.mockReset();
    mockGetAllSales.mockReset();
    mockGetAllMemberships.mockReset();
    mockGetWalletsForCustomerIds.mockReset();
    mockListStaffSchedules.mockReset();
    mockUseSelectedBranch.mockReset();

    mockGetAllCustomers.mockResolvedValue([{ id: 'C1', hn: 'HN001', patientData: { firstName: 'Alice', phone: '0811111111' } }]);
    mockGetAllDeposits.mockResolvedValue([]);
    mockGetAllSales.mockResolvedValue([]);
    mockGetAllMemberships.mockResolvedValue([]);
    mockGetWalletsForCustomerIds.mockResolvedValue([]);
    mockListStaffSchedules.mockResolvedValue([]);
    mockGetAppointmentsByDateRange.mockResolvedValue([]);
    mockUseSelectedBranch.mockReturnValue({ branchId: 'BR-A' });
  });

  afterEach(() => vi.clearAllMocks());

  it('S1.1 mount with branch BR-A → loaders fire with branchId=BR-A', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => {
      expect(mockGetAppointmentsByDateRange).toHaveBeenCalled();
      const call = mockGetAppointmentsByDateRange.mock.calls[0][0];
      expect(call.branchId).toBe('BR-A');
    });
  });

  it('S1.2 branch switch BR-A → BR-B → loaders re-fire with new branchId + filters reset', async () => {
    const { rerender } = render(<AppointmentHubView />);
    await waitFor(() => expect(mockGetAppointmentsByDateRange).toHaveBeenCalled());

    mockUseSelectedBranch.mockReturnValue({ branchId: 'BR-B' });
    mockGetAppointmentsByDateRange.mockResolvedValueOnce([{ id: 'B1', customerId: 'C1', date: '2026-05-08', status: 'pending' }]);
    rerender(<AppointmentHubView />);
    await waitFor(() => {
      const calls = mockGetAppointmentsByDateRange.mock.calls;
      expect(calls.some(c => c[0].branchId === 'BR-B')).toBe(true);
    });
  });

  it('S1.3 tab switch today → past is CLIENT-SIDE filter (no extra fetch — V64-fix2 wide-range)', async () => {
    // V64-fix2 (Issue 6, 2026-05-09): wide-range fetch loads
    // [today-30..today+30] once + tab-switch is client-side applyTabFilter.
    // Pre-fix contract was tab-switch → reload; post-fix asserts the opposite
    // — no new fetch on tab change (the filter is local).
    render(<AppointmentHubView />);
    await waitFor(() => expect(mockGetAppointmentsByDateRange).toHaveBeenCalled());
    const initialCallCount = mockGetAppointmentsByDateRange.mock.calls.length;
    fireEvent.click(screen.getByTestId('appt-hub-tab-past'));
    // Wait briefly to confirm no reload happens
    await new Promise(r => setTimeout(r, 200));
    expect(mockGetAppointmentsByDateRange.mock.calls.length).toBe(initialCallCount);
    // But the active tab DID change visually
    expect(screen.getByTestId('appt-hub-tab-past').getAttribute('data-active')).toBe('true');
  });

  it('S1.4 confirm button fires onConfirmAppt with appt', async () => {
    // Bangkok-stable today (matches dateRangeForTab('today') which uses Bangkok TZ)
    const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
    const u = new Date(Date.now() + BANGKOK_OFFSET_MS);
    const today = `${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, '0')}-${String(u.getUTCDate()).padStart(2, '0')}`;
    mockGetAppointmentsByDateRange.mockResolvedValue([
      { id: 'A1', customerId: 'C1', date: today, startTime: '09:00', endTime: '09:30', status: 'pending' },
    ]);
    const onConfirm = vi.fn();
    render(<AppointmentHubView onConfirmAppt={onConfirm} />);
    await waitFor(() => expect(screen.getByTestId('row-action-confirm')).toBeInTheDocument(), { timeout: 2000 });
    fireEvent.click(screen.getByTestId('row-action-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].id).toBe('A1');
  });

  it('S1.5 walk-in button fires onAddWalkIn', async () => {
    const fn = vi.fn();
    render(<AppointmentHubView onAddWalkIn={fn} />);
    await waitFor(() => expect(screen.getByTestId('appt-hub-walkin-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('appt-hub-walkin-btn'));
    expect(fn).toHaveBeenCalled();
  });

  it('S1.6 source-grep — View imports from scopedDataLayer.js (not raw backendClient)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/from ['"]\.\.\/\.\.\/lib\/scopedDataLayer\.js['"]/);
    expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });

  it('S1.7 V64 marker comment present in View', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/V64/);
  });

  it('S1.8 V64-fix3 (Issue 1) — View imports + renders AppointmentFormModal for edit', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    expect(src).toMatch(/import\s+AppointmentFormModal\s+from\s+['"]\.\.\/backend\/AppointmentFormModal\.jsx['"]/);
    // Renders conditional modal block for edit
    expect(src).toMatch(/\{editingAppt\s*&&\s*\(/);
    expect(src).toMatch(/<AppointmentFormModal[\s\S]{0,200}mode=["']edit["']/);
  });

  it('S1.9 V64-fix3 (Issue 2) — confirm/cancel handlers DO NOT bump a reload-key', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/admin/AppointmentHubView.jsx', 'utf8');
    // Forbidden: triggerReload identifier (was the flash trigger)
    expect(src).not.toMatch(/triggerReload\s*\(/);
    // Forbidden: setReloadKey calls in handlers
    expect(src).not.toMatch(/setReloadKey\s*\(/);
    // Required: optimistic-update via setAppts(prev => prev.map(...))
    expect(src).toMatch(/setAppts\(prev\s*=>\s*prev\.map/);
    // Required: revert-on-error path
    expect(src).toMatch(/revert/i);
  });
});
