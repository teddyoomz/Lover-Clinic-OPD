import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentHubTabBar from '../src/components/admin/AppointmentHubTabBar.jsx';
import AppointmentHubDoctorCards from '../src/components/admin/AppointmentHubDoctorCards.jsx';
import AppointmentHubFilterBar from '../src/components/admin/AppointmentHubFilterBar.jsx';
import AppointmentHubRowCard from '../src/components/admin/AppointmentHubRowCard.jsx';

const FIXED_NOW = new Date('2026-05-08T07:00:00+07:00');

describe('V64.R AppointmentHubTabBar', () => {
  it('R1.1 renders 4 tabs', () => {
    render(<AppointmentHubTabBar activeTab="today" counts={{ today: 1, tomorrow: 2, future: 6, past: 116 }} />);
    expect(screen.getByTestId('appt-hub-tab-today')).toBeInTheDocument();
    expect(screen.getByTestId('appt-hub-tab-tomorrow')).toBeInTheDocument();
    expect(screen.getByTestId('appt-hub-tab-future')).toBeInTheDocument();
    expect(screen.getByTestId('appt-hub-tab-past')).toBeInTheDocument();
  });

  it('R1.2 active tab carries data-active=true', () => {
    render(<AppointmentHubTabBar activeTab="future" counts={{}} />);
    expect(screen.getByTestId('appt-hub-tab-future').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('appt-hub-tab-today').getAttribute('data-active')).toBe('false');
  });

  it('R1.3 click fires onTabChange with key', () => {
    const fn = vi.fn();
    render(<AppointmentHubTabBar activeTab="today" counts={{}} onTabChange={fn} />);
    fireEvent.click(screen.getByTestId('appt-hub-tab-past'));
    expect(fn).toHaveBeenCalledWith('past');
  });

  it('R1.4 bubble count rendered', () => {
    render(<AppointmentHubTabBar activeTab="past" counts={{ past: 116 }} />);
    expect(screen.getByTestId('appt-hub-tab-past').textContent).toMatch(/116/);
  });
});

describe('V64.R AppointmentHubDoctorCards (Q2=D)', () => {
  it('R2.1 renders cards on today tab', () => {
    render(<AppointmentHubDoctorCards
      tab="today"
      doctorShifts={[{ name: 'หมอ น้ำตาล', startTime: '10:30', endTime: '17:00' }]}
      assistantShifts={[{ name: 'นาสาว เอ', startTime: '09:00', endTime: '12:00' }]}
    />);
    expect(screen.getByTestId('appt-hub-doctor-cards')).toBeInTheDocument();
    expect(screen.getAllByTestId('appt-hub-doctor-card')).toHaveLength(1);
    expect(screen.getAllByTestId('appt-hub-assistant-card')).toHaveLength(1);
  });

  it('R2.2 hides on future tab', () => {
    render(<AppointmentHubDoctorCards tab="future" doctorShifts={[{ name: 'X', startTime: '08:00', endTime: '17:00' }]} />);
    expect(screen.queryByTestId('appt-hub-doctor-cards')).not.toBeInTheDocument();
  });

  it('R2.3 hides on past tab', () => {
    render(<AppointmentHubDoctorCards tab="past" doctorShifts={[{ name: 'X', startTime: '08:00', endTime: '17:00' }]} />);
    expect(screen.queryByTestId('appt-hub-doctor-cards')).not.toBeInTheDocument();
  });

  it('R2.4 empty state on tomorrow with no shifts', () => {
    render(<AppointmentHubDoctorCards tab="tomorrow" doctorShifts={[]} assistantShifts={[]} />);
    expect(screen.getByTestId('appt-hub-doctor-cards-empty')).toBeInTheDocument();
  });
});

describe('V64.R AppointmentHubFilterBar', () => {
  it('R3.1 search input fires onSearchChange', () => {
    const fn = vi.fn();
    render(<AppointmentHubFilterBar search="" onSearchChange={fn} resultCount={0} />);
    fireEvent.change(screen.getByTestId('appt-hub-search'), { target: { value: 'alice' } });
    expect(fn).toHaveBeenCalledWith('alice');
  });

  it('R3.2 status dropdown fires onStatusFilterChange', () => {
    const fn = vi.fn();
    render(<AppointmentHubFilterBar statusFilter="__all__" onStatusFilterChange={fn} resultCount={0} />);
    fireEvent.change(screen.getByTestId('appt-hub-status-filter'), { target: { value: 'pending' } });
    expect(fn).toHaveBeenCalledWith('pending');
  });

  it('R3.3 print button fires onPrint', () => {
    const fn = vi.fn();
    render(<AppointmentHubFilterBar onPrint={fn} resultCount={0} />);
    fireEvent.click(screen.getByTestId('appt-hub-print-btn'));
    expect(fn).toHaveBeenCalled();
  });

  it('R3.4 walk-in button fires onAddWalkIn', () => {
    const fn = vi.fn();
    render(<AppointmentHubFilterBar onAddWalkIn={fn} resultCount={0} />);
    fireEvent.click(screen.getByTestId('appt-hub-walkin-btn'));
    expect(fn).toHaveBeenCalled();
  });

  it('R3.5 result count rendered', () => {
    render(<AppointmentHubFilterBar resultCount={42} />);
    expect(screen.getByText(/42 คน/)).toBeInTheDocument();
  });
});

describe('V64.R AppointmentHubRowCard', () => {
  const baseSummary = { hn: 'HN001', name: 'Alice', gender: 'F', phone: '0811111111', membershipTier: 'GOLD', membershipDaysLeft: 340, walletBalance: 12000, activeDepositTotal: 5000, outstandingTotal: 1500, lifetimeSaleTotal: 100000 };

  it('R4.1 pending row shows confirm + edit + cancel', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', startTime: '09:00', endTime: '09:30', status: 'pending', doctorName: 'D' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByTestId('row-action-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('row-action-edit')).toBeInTheDocument();
    expect(screen.getByTestId('row-action-cancel')).toBeInTheDocument();
    expect(screen.queryByTestId('row-action-create-treatment')).not.toBeInTheDocument();
  });

  it('R4.2 confirmed row shows create-treatment + edit + cancel', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', startTime: '09:00', endTime: '09:30', status: 'confirmed' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByTestId('row-action-create-treatment')).toBeInTheDocument();
  });

  it('R4.3 done with linkedTreatment shows edit-treatment', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'done', linkedTreatmentId: 'T1' }} summary={baseSummary} now={FIXED_NOW} />);
    const btn = screen.getByTestId('row-action-edit-treatment');
    expect(btn.textContent).toMatch(/แก้ไขการรักษา/);
  });

  it('R4.4 done without linkedTreatment shows fallback create-treatment', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'done' }} summary={baseSummary} now={FIXED_NOW} />);
    const btn = screen.getByTestId('row-action-edit-treatment');
    expect(btn.textContent).toMatch(/บันทึกการรักษา/);
  });

  it('R4.5 cancelled row is read-only', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'cancelled' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.queryByTestId('row-action-confirm')).not.toBeInTheDocument();
    expect(screen.getByText(/ยกเลิกแล้ว/)).toBeInTheDocument();
  });

  it('R4.6 missed-chip shown for confirmed past-date', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-01', status: 'confirmed' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByTestId('row-missed-chip')).toBeInTheDocument();
  });

  it('R4.7 missed-chip NOT shown for confirmed today', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'confirmed' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.queryByTestId('row-missed-chip')).not.toBeInTheDocument();
  });

  it('R4.8 LINE button rendered when customerLineUserId present', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending', customerLineUserId: 'U123' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByTestId('row-action-line')).toBeInTheDocument();
  });

  it('R4.9 LINE button hidden when no lineUserId', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.queryByTestId('row-action-line')).not.toBeInTheDocument();
  });

  it('R4.10 click on confirm fires onConfirm with appt', () => {
    const fn = vi.fn();
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending' }} summary={baseSummary} now={FIXED_NOW} onConfirm={fn} />);
    fireEvent.click(screen.getByTestId('row-action-confirm'));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].id).toBe('A1');
  });

  it('R4.11 customer summary chips rendered when present', () => {
    render(<AppointmentHubRowCard appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending' }} summary={baseSummary} now={FIXED_NOW} />);
    expect(screen.getByText(/GOLD คงเหลือ 340 วัน/)).toBeInTheDocument();
    expect(screen.getByText(/Wallet 12,000 ฿/)).toBeInTheDocument();
    expect(screen.getByText(/มัดจำ 5,000 ฿/)).toBeInTheDocument();
    expect(screen.getByText(/ค่างชำระ 1,500 ฿/)).toBeInTheDocument();
    expect(screen.getByText(/ยอดสั่งซื้อ 100,000 ฿/)).toBeInTheDocument();
  });
});
