// ① (2026-05-26) — "เพิ่มนัดหมาย" all-types button replaces "เพิ่มคิว Walk-in".
// The button reuses the SAME AppointmentFormModal AppointmentHubView already
// renders (edit) — in create mode, lockedAppointmentType=null (all 5 types).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AppointmentHubFilterBar from '../src/components/admin/AppointmentHubFilterBar.jsx';
import AppointmentHubView from '../src/components/admin/AppointmentHubView.jsx';

describe('AppointmentHubFilterBar — all-types button (①)', () => {
  it('renders "เพิ่มนัดหมาย" (not Walk-in) and fires onAddAppointment', () => {
    const onAddAppointment = vi.fn();
    render(<AppointmentHubFilterBar onAddAppointment={onAddAppointment} />);
    const btn = screen.getByTestId('appt-hub-add-appt-btn');
    expect(btn).toHaveTextContent('เพิ่มนัดหมาย');
    expect(screen.queryByText(/เพิ่มคิว Walk-in/)).toBeNull();
    fireEvent.click(btn);
    expect(onAddAppointment).toHaveBeenCalledTimes(1);
  });
});

// ── T2 (① HubView create path) ──────────────────────────────────────────────
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-TEST', branches: [] }),
}));
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  getAppointmentsByDateRange: vi.fn().mockResolvedValue([]),
  getAllCustomers: vi.fn().mockResolvedValue([]),
  getAllDeposits: vi.fn().mockResolvedValue([]),
  getAllSales: vi.fn().mockResolvedValue([]),
  getAllMemberships: vi.fn().mockResolvedValue([]),
  getWalletsForCustomerIds: vi.fn().mockResolvedValue([]),
  listStaffSchedules: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadTreatmentsByDateRange: vi.fn().mockResolvedValue([]),
}));
// Capture the props AppointmentFormModal is mounted with.
let modalProps = null;
vi.mock('../src/components/backend/AppointmentFormModal.jsx', () => ({
  default: (props) => {
    modalProps = props;
    return <div data-testid="appt-form-modal" data-mode={props.mode} />;
  },
}));

describe('AppointmentHubView — create path (①)', () => {
  it('clicking เพิ่มนัดหมาย opens AppointmentFormModal in create mode, no locked type', async () => {
    modalProps = null;
    render(<AppointmentHubView />);
    await waitFor(() => expect(screen.getByTestId('appt-hub-add-appt-btn')).toBeInTheDocument());
    expect(screen.queryByTestId('appt-form-modal')).toBeNull();
    fireEvent.click(screen.getByTestId('appt-hub-add-appt-btn'));
    await waitFor(() => expect(screen.getByTestId('appt-form-modal')).toBeInTheDocument());
    expect(modalProps.mode).toBe('create');
    expect(modalProps.lockedAppointmentType).toBeNull();
    expect(typeof modalProps.onSaved).toBe('function');
    expect(typeof modalProps.onClose).toBe('function');
  });
});
