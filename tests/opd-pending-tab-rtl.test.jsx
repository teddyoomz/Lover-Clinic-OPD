// ② (2026-05-26) — "รอ/ยังไม่ลง OPD" pill renders + counts B+C+D + filters list.
// Real timers + Bangkok-relative dates (avoids fake-timer/waitFor conflict).
// APPTS/SESSIONS built via vi.hoisted so the hoisted vi.mock factory can use them.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const { APPTS, SESSIONS } = vi.hoisted(() => {
  const BKK_OFFSET = 7 * 3600 * 1000;
  const bkkPlus = (days) => {
    const u = new Date(Date.now() + BKK_OFFSET + days * 86400000);
    return `${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, '0')}-${String(u.getUTCDate()).padStart(2, '0')}`;
  };
  return {
    // 3 OPD-pending (B/C/D, future) + 1 state-A (existing customer) → A excluded.
    APPTS: [
      { id: 'B1', date: bkkPlus(3), startTime: '10:00', appointmentType: 'no-deposit-booking', status: 'pending' }, // B
      { id: 'C1', date: bkkPlus(4), startTime: '10:00', appointmentType: 'deposit-booking', status: 'pending', linkedOpdSessionId: 'sC' }, // C
      { id: 'D1', date: bkkPlus(6), startTime: '10:00', appointmentType: 'no-deposit-booking', status: 'pending', linkedOpdSessionId: 'sD' }, // D
      { id: 'A1', date: bkkPlus(5), startTime: '10:00', appointmentType: 'follow-up', status: 'confirmed', customerId: 'cust-1' }, // A
    ],
    SESSIONS: { sC: { patientData: {} }, sD: { patientData: { firstName: 'x' } } },
  };
});

vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-TEST', branches: [] }) }));
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: vi.fn().mockResolvedValue(APPTS),
  getAllCustomers: vi.fn().mockResolvedValue([]), getAllDeposits: vi.fn().mockResolvedValue([]),
  getAllSales: vi.fn().mockResolvedValue([]), getAllMemberships: vi.fn().mockResolvedValue([]),
  getWalletsForCustomerIds: vi.fn().mockResolvedValue([]), listStaffSchedules: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/lib/reportsLoaders.js', () => ({ loadTreatmentsByDateRange: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/components/backend/AppointmentFormModal.jsx', () => ({ default: () => null }));

import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

describe('opd-pending pill (②)', () => {
  const resolveLinkedSession = (a) => (a.linkedOpdSessionId ? SESSIONS[a.linkedOpdSessionId] || null : null);

  it('renders the 5th pill with count=3 (B+C+D, A excluded)', async () => {
    render(<AppointmentHubView resolveLinkedSession={resolveLinkedSession} />);
    const pill = await screen.findByTestId('appt-hub-tab-opd-pending');
    expect(pill).toHaveTextContent('รอ/ยังไม่ลง OPD');
    expect(pill).toHaveTextContent('3');
  });

  it('clicking the pill filters the list to exactly the 3 pending appts', async () => {
    render(<AppointmentHubView resolveLinkedSession={resolveLinkedSession} />);
    const pill = await screen.findByTestId('appt-hub-tab-opd-pending');
    fireEvent.click(pill);
    // resultCount reflects filteredAppts.length — A1 (state A) excluded → 3.
    await waitFor(() => expect(screen.getByTestId('appt-hub-result-count')).toHaveTextContent('3'));
  });
});
