// V71 Rule I — full-flow simulate chaining: load treatments → render row
// → stepper visible → click mark-complete → sub-pill filter + counts.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { markFn } = vi.hoisted(() => ({ markFn: vi.fn(() => Promise.resolve()) }));

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: vi.fn(),
  getAllCustomers: vi.fn(() => Promise.resolve([])),
  getAllDeposits: vi.fn(() => Promise.resolve([])),
  getAllSales: vi.fn(() => Promise.resolve([])),
  getAllMemberships: vi.fn(() => Promise.resolve([])),
  getWalletsForCustomerIds: vi.fn(() => Promise.resolve([])),
  listStaffSchedules: vi.fn(() => Promise.resolve([])),
  markAppointmentServiceCompleted: markFn,
}));
vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadTreatmentsByDateRange: vi.fn(),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-FLOW-V71' }),
}));

import { getAppointmentsByDateRange } from '../src/lib/scopedDataLayer.js';
import { loadTreatmentsByDateRange } from '../src/lib/reportsLoaders.js';
import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

function todayBangkok() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

describe('V71 Rule I — full-flow simulate', () => {
  beforeEach(() => {
    markFn.mockClear();
    const today = todayBangkok();
    getAppointmentsByDateRange.mockResolvedValue([
      { id: 'F1', date: today, startTime: '09:00', customerId: 'CF1', customerName: 'Flow-customer', status: 'confirmed', serviceCompletedAt: null },
    ]);
    loadTreatmentsByDateRange.mockResolvedValue([
      {
        id: 'TF1',
        customerId: 'CF1',
        detail: { treatmentDate: today },
        createdAt: '2026-05-15T08:00:00.000Z',
        vitalsignsRecordedAt: { toDate: () => new Date('2026-05-15T08:00:00') },
        status: 'vitalsigns-recorded',
      },
    ]);
  });

  it('F1.1 load → stepper visible → click mark-complete → moves to completed sub-pill', async () => {
    const onMark = vi.fn(() => Promise.resolve());
    render(<AppointmentHubView onMarkServiceComplete={onMark} />);

    // 1. Wait for load
    await waitFor(() => expect(screen.getByTestId('appt-hub-row')).toBeInTheDocument());

    // 2. Stepper present
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();

    // 3. Mark-complete button visible
    expect(screen.getByTestId('row-action-mark-complete')).toBeInTheDocument();

    // 4. Sub-pill counts: 1 waiting, 0 completed
    expect(screen.getByTestId('sub-pill-waiting')).toHaveTextContent('1');
    expect(screen.getByTestId('sub-pill-completed')).toHaveTextContent('0');

    // 5. Click mark-complete + confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTestId('row-action-mark-complete'));
    confirmSpy.mockRestore();

    // 6. onMark called with the appt
    await waitFor(() => expect(onMark).toHaveBeenCalled());
    expect(onMark.mock.calls[0][0].id).toBe('F1');

    // 7. Sub-pill counts updated optimistically: 0 waiting, 1 completed
    await waitFor(() => expect(screen.getByTestId('sub-pill-waiting')).toHaveTextContent('0'));
    expect(screen.getByTestId('sub-pill-completed')).toHaveTextContent('1');

    // 8. Default sub-pill = waiting → row disappears
    expect(screen.queryByText(/Flow-customer/)).toBeNull();

    // 9. Click completed sub-pill → row reappears
    fireEvent.click(screen.getByTestId('sub-pill-completed'));
    await waitFor(() => expect(screen.getByText(/Flow-customer/)).toBeInTheDocument());
  });
});
