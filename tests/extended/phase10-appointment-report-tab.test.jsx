// Phase 10.4 — AppointmentReportTab UI render + interaction tests.
// Mocks Firestore loaders so the tab can render in jsdom without auth.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const FIX_CUSTOMERS = [
  { id: 'c1', proClinicId: 'c1', name: 'คุณต้น',
    patientData: { customerType2: 'ลูกค้ารีวิว', firstName: 'ต้น', lastName: 'ทดสอบ' } },
  { id: 'c2', proClinicId: 'c2', name: 'คุณนิด',
    patientData: { customerType2: 'Influencer', firstName: 'นิด', lastName: 'ตัวอย่าง' } },
];

const FIX_STAFF = [{ id: 'S1', name: 'พี่เอ็ม' }];

// Dates must fall within the tab's default "thisMonth" preset range
// (computed from bangkokNow → first-of-month → today). Using early-month
// dates keeps the fixture inside the range regardless of today's date
// within the month.
const FIX_APPTS = [
  {
    id: 'A1', appointmentId: 'A1', customerId: 'c1', customerHN: 'HN0001', customerName: 'คุณต้น',
    date: '2026-04-02', startTime: '10:00', endTime: '10:30',
    appointmentType: 'sales', status: 'confirmed',
    doctorId: 'D1', doctorName: 'หมอเอ', assistantIds: ['S1'],
    advisorName: 'พี่แอน',
    roomName: 'ห้องตรวจ 1', appointmentTo: 'Botox', preparation: 'งดกินยา', expectedSales: 5000,
  },
  {
    id: 'A2', appointmentId: 'A2', customerId: 'c2', customerHN: 'HN0002', customerName: 'คุณนิด',
    date: '2026-04-03', startTime: '14:00', endTime: '14:30',
    appointmentType: 'followup', status: 'pending',
    doctorId: 'D2', doctorName: 'หมอบี', assistantIds: [],
    advisorName: '',
    roomName: 'ห้องตรวจ 2', appointmentTo: '', preparation: '', expectedSales: 0,
  },
];

vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadAppointmentsByDateRange: vi.fn(async () => FIX_APPTS),
  loadAllCustomersForReport: vi.fn(async () => FIX_CUSTOMERS),
}));

vi.mock('../src/lib/backendClient.js', () => ({
  getAllMasterDataItems: vi.fn(async () => FIX_STAFF),
  // Phase 14.10-tris — be_* read helpers replaced legacy getAllMasterDataItems.
  // Stub all new entry points so any consumer that swapped over still mounts.
  listAllSellers: () => Promise.resolve([]),
  listProducts: () => Promise.resolve([]),
  listCourses: () => Promise.resolve([]),
  listPromotions: () => Promise.resolve([]),
  listStaff: () => Promise.resolve([]),
  listDoctors: () => Promise.resolve([]),
  listMembershipTypes: () => Promise.resolve([]),
  listWalletTypes: () => Promise.resolve([]),
}));

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

import AppointmentReportTab from '../src/components/backend/reports/AppointmentReportTab.jsx';

describe('AppointmentReportTab — render + interactions', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReset().mockImplementation(() => null);
  });

  it('renders header with title "นัดหมาย"', async () => {
    render(<AppointmentReportTab clinicSettings={{ accentColor: '#06b6d4' }} />);
    await waitFor(() => expect(screen.getByText('นัดหมาย')).toBeInTheDocument());
  });

  it('renders date range picker + 4 filter controls', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => {
      expect(screen.getByTestId('date-range-picker')).toBeInTheDocument();
      expect(screen.getByTestId('appt-filter-search')).toBeInTheDocument();
      expect(screen.getByTestId('appt-filter-customer-type')).toBeInTheDocument();
      expect(screen.getByTestId('appt-filter-status')).toBeInTheDocument();
      expect(screen.getByTestId('appt-filter-type')).toBeInTheDocument();
    });
  });

  it('renders 10 column headers (matches ProClinic spec)', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('appointment-report-table'));
    const ths = screen.getByTestId('appointment-report-table').querySelectorAll('thead th');
    expect(ths.length).toBe(10);
  });

  it('renders appointment rows from fixture', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^appt-row-/);
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('status filter narrows to pending only', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('appt-row-A1'));
    fireEvent.change(screen.getByTestId('appt-filter-status'), { target: { value: 'pending' } });
    await waitFor(() => {
      expect(screen.queryByTestId('appt-row-A1')).not.toBeInTheDocument(); // A1 was confirmed
      expect(screen.getByTestId('appt-row-A2')).toBeInTheDocument();
    });
  });

  it('type filter narrows to followup only', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('appt-row-A1'));
    fireEvent.change(screen.getByTestId('appt-filter-type'), { target: { value: 'followup' } });
    await waitFor(() => {
      expect(screen.queryByTestId('appt-row-A1')).not.toBeInTheDocument();
      expect(screen.getByTestId('appt-row-A2')).toBeInTheDocument();
    });
  });

  it('customer-type filter narrows to "ลูกค้ารีวิว"', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('appt-row-A1'));
    fireEvent.change(screen.getByTestId('appt-filter-customer-type'), { target: { value: 'ลูกค้ารีวิว' } });
    await waitFor(() => {
      expect(screen.getByTestId('appt-row-A1')).toBeInTheDocument();
      expect(screen.queryByTestId('appt-row-A2')).not.toBeInTheDocument();
    });
  });

  it('search input filters by HN', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('appt-row-A1'));
    fireEvent.change(screen.getByTestId('appt-filter-search'), { target: { value: 'HN0002' } });
    await waitFor(() => {
      expect(screen.queryByTestId('appt-row-A1')).not.toBeInTheDocument();
      expect(screen.getByTestId('appt-row-A2')).toBeInTheDocument();
    });
  });

  it('clicking customer link opens new tab', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('appt-customer-link-A1'));
    fireEvent.click(screen.getByTestId('appt-customer-link-A1'));
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open.mock.calls[0][0]).toMatch(/\?backend=1&customer=c1$/);
    expect(window.open.mock.calls[0][1]).toBe('_blank');
  });

  it('export button enabled when rows present, disabled when filtered empty', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByTestId('report-export')).not.toBeDisabled());
    // Filter to empty — appointmentType=sales + statusFilter=cancelled (no matches in fixture)
    fireEvent.change(screen.getByTestId('appt-filter-status'), { target: { value: 'cancelled' } });
    await waitFor(() => expect(screen.getByTestId('report-export')).toBeDisabled());
  });

  it('footer shows status buckets', async () => {
    render(<AppointmentReportTab clinicSettings={{}} />);
    await waitFor(() => screen.getByTestId('appointment-report-footer'));
    const footer = screen.getByTestId('appointment-report-footer');
    expect(footer.textContent).toContain('รอยืนยัน');
    expect(footer.textContent).toContain('ยืนยันแล้ว');
    expect(footer.textContent).toContain('เสร็จแล้ว');
  });
});
