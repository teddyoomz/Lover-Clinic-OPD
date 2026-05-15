// V71 — AppointmentHubView sub-pill bar renders on today tab, filters by waiting/completed.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock scopedDataLayer — return today's appts (some completed, some waiting)
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: vi.fn(),
  getAllCustomers: vi.fn(() => Promise.resolve([])),
  getAllDeposits: vi.fn(() => Promise.resolve([])),
  getAllSales: vi.fn(() => Promise.resolve([])),
  getAllMemberships: vi.fn(() => Promise.resolve([])),
  getWalletsForCustomerIds: vi.fn(() => Promise.resolve([])),
  listStaffSchedules: vi.fn(() => Promise.resolve([])),
  markAppointmentServiceCompleted: vi.fn(() => Promise.resolve()),
}));
vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadTreatmentsByDateRange: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-V71-test' }),
}));

import { getAppointmentsByDateRange } from '../src/lib/scopedDataLayer.js';
import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

function todayBangkok() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

describe('V71 AppointmentHubView sub-pill bar', () => {
  beforeEach(() => {
    const today = todayBangkok();
    getAppointmentsByDateRange.mockResolvedValue([
      { id: 'A1', date: today, startTime: '10:00', customerId: 'C1', customerName: 'Waiter 1', status: 'confirmed', serviceCompletedAt: null },
      { id: 'A2', date: today, startTime: '11:00', customerId: 'C2', customerName: 'Done 1',   status: 'confirmed', serviceCompletedAt: { seconds: 1 } },
      { id: 'A3', date: today, startTime: '12:00', customerId: 'C3', customerName: 'Waiter 2', status: 'pending',   serviceCompletedAt: null },
    ]);
  });

  it('VS1.1 sub-pill bar renders on today tab with correct counts', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getByTestId('appt-hub-today-sub-pill-bar')).toBeInTheDocument());
    expect(screen.getByTestId('sub-pill-waiting')).toHaveTextContent('2');
    expect(screen.getByTestId('sub-pill-completed')).toHaveTextContent('1');
  });

  it('VS1.2 default sub-pill = waiting; only 2 waiting rows visible', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getAllByTestId('appt-hub-row').length).toBe(2));
  });

  it('VS1.3 clicking completed sub-pill → only 1 completed row visible', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getByTestId('sub-pill-completed')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('sub-pill-completed'));
    await waitFor(() => expect(screen.getAllByTestId('appt-hub-row').length).toBe(1));
    expect(screen.getByText(/Done 1/)).toBeInTheDocument();
  });

  it('VS1.4 sub-pill bar hidden on tomorrow tab', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getByTestId('appt-hub-today-sub-pill-bar')).toBeInTheDocument());
    fireEvent.click(screen.getByText(/พรุ่งนี้/));
    await waitFor(() => expect(screen.queryByTestId('appt-hub-today-sub-pill-bar')).toBeNull());
  });

  it('VS1.5 sub-pill resets to waiting when activeTab changes back to today from elsewhere', async () => {
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getByTestId('sub-pill-waiting')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('sub-pill-completed'));
    await waitFor(() => expect(screen.getByTestId('sub-pill-completed')).toHaveAttribute('aria-selected', 'true'));
    fireEvent.click(screen.getByText(/พรุ่งนี้/));
    fireEvent.click(screen.getByText(/วันนี้/));
    await waitFor(() => expect(screen.getByTestId('sub-pill-waiting')).toHaveAttribute('aria-selected', 'true'));
  });
});
