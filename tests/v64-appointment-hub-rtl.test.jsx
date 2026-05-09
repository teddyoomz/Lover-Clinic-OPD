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

  // V64-fix6 — auto-confirm via same-day treatment lookup
  describe('V64.R6 V64-fix6 — auto-confirm via apptDateTreatments', () => {
    const apptPastPending = { id: 'A1', customerId: 'C1', date: '2026-05-07', status: 'pending' };
    const apptPastConfirmed = { id: 'A2', customerId: 'C1', date: '2026-05-07', status: 'confirmed' };
    const apptTodayPending = { id: 'A3', customerId: 'C1', date: '2026-05-08', status: 'pending' };
    const sameDayTreatment = { id: 'BT-LATEST', customerId: 'C1', detail: { treatmentDate: '2026-05-07' }, createdAt: '2026-05-07T10:00:00Z' };

    it('R6.1 past pending + same-day treatment → status auto-flips to เสร็จแล้ว', () => {
      render(<AppointmentHubRowCard appt={apptPastPending} summary={baseSummary} apptDateTreatments={[sameDayTreatment]} now={FIXED_NOW} />);
      expect(screen.getByTestId('row-status').textContent).toBe('เสร็จแล้ว');
    });

    it('R6.2 past pending + same-day treatment → "แก้ไขบันทึกการรักษา" button (no missed badge)', () => {
      render(<AppointmentHubRowCard appt={apptPastPending} summary={baseSummary} apptDateTreatments={[sameDayTreatment]} now={FIXED_NOW} />);
      const btn = screen.getByTestId('row-action-edit-treatment');
      expect(btn.textContent).toMatch(/แก้ไขบันทึกการรักษา/);
      expect(screen.queryByTestId('row-missed-chip')).not.toBeInTheDocument();
    });

    it('R6.3 past pending + NO treatment → "สร้างบันทึกการรักษา" button + missed badge', () => {
      render(<AppointmentHubRowCard appt={apptPastPending} summary={baseSummary} apptDateTreatments={[]} now={FIXED_NOW} />);
      const btn = screen.getByTestId('row-action-create-treatment');
      expect(btn.textContent).toMatch(/สร้างบันทึกการรักษา/);
      expect(screen.getByTestId('row-missed-chip')).toBeInTheDocument();
    });

    it('R6.4 past confirmed + NO treatment → still missed badge + "สร้าง" button', () => {
      render(<AppointmentHubRowCard appt={apptPastConfirmed} summary={baseSummary} apptDateTreatments={[]} now={FIXED_NOW} />);
      expect(screen.getByTestId('row-missed-chip')).toBeInTheDocument();
      expect(screen.getByTestId('row-action-create-treatment').textContent).toMatch(/สร้างบันทึกการรักษา/);
    });

    it('R6.5 today pending + NO treatment → existing "คอนเฟิร์มนัด" flow', () => {
      render(<AppointmentHubRowCard appt={apptTodayPending} summary={baseSummary} apptDateTreatments={[]} now={FIXED_NOW} />);
      expect(screen.getByTestId('row-action-confirm')).toBeInTheDocument();
      expect(screen.queryByTestId('row-missed-chip')).not.toBeInTheDocument();
    });

    it('R6.6 click on edit-treatment passes appt with linkedTreatmentId=latestTreatment.id', () => {
      const fn = vi.fn();
      render(<AppointmentHubRowCard appt={apptPastPending} summary={baseSummary} apptDateTreatments={[sameDayTreatment]} now={FIXED_NOW} onEditTreatment={fn} />);
      fireEvent.click(screen.getByTestId('row-action-edit-treatment'));
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn.mock.calls[0][0].linkedTreatmentId).toBe('BT-LATEST');
      expect(fn.mock.calls[0][0].id).toBe('A1');
    });

    it('R6.7 multiple same-day treatments → uses latest (sorted by createdAt DESC)', () => {
      const earlier = { id: 'BT-EARLIER', customerId: 'C1', detail: { treatmentDate: '2026-05-07' }, createdAt: '2026-05-07T08:00:00Z' };
      const later = { id: 'BT-LATER', customerId: 'C1', detail: { treatmentDate: '2026-05-07' }, createdAt: '2026-05-07T18:00:00Z' };
      // Caller passes pre-sorted DESC array
      const fn = vi.fn();
      render(<AppointmentHubRowCard appt={apptPastPending} summary={baseSummary} apptDateTreatments={[later, earlier]} now={FIXED_NOW} onEditTreatment={fn} />);
      fireEvent.click(screen.getByTestId('row-action-edit-treatment'));
      expect(fn.mock.calls[0][0].linkedTreatmentId).toBe('BT-LATER');
    });
  });

  // V64-fix8 (2026-05-09) — patient name → clickable link that opens
  // customer detail page in a NEW BROWSER TAB. Mirrors Phase 15.7-septies
  // pattern (buildCustomerDetailUrl + target="_blank" + rel="noopener noreferrer").
  describe('V64.R8 V64-fix8 — patient name link to customer detail', () => {
    it('R8.1 name renders as <a href> when customerId present', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'LC-26000006', date: '2026-05-08', status: 'pending' }}
        summary={baseSummary}
        now={FIXED_NOW}
      />);
      const link = screen.getByTestId('row-name');
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toMatch(/[?&]customer=LC-26000006/);
      expect(link.getAttribute('href')).toMatch(/[?&]backend=1/);
    });

    it('R8.2 anchor opens in new tab with rel=noopener noreferrer (security defense)', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'LC-26000006', date: '2026-05-08', status: 'pending' }}
        summary={baseSummary}
        now={FIXED_NOW}
      />);
      const link = screen.getByTestId('row-name');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toMatch(/noopener/);
      expect(link.getAttribute('rel')).toMatch(/noreferrer/);
    });

    it('R8.3 anchor encodes customerId in URL', () => {
      // V33-aware: customerId may include special chars; encodeURIComponent must apply
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'CUST/ABC#1', date: '2026-05-08', status: 'pending' }}
        summary={baseSummary}
        now={FIXED_NOW}
      />);
      const link = screen.getByTestId('row-name');
      expect(link.getAttribute('href')).toMatch(/customer=CUST%2FABC%231/);
    });

    it('R8.4 fallback to <div> when customerId is absent (no clickable link)', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: '', date: '2026-05-08', status: 'pending', customerName: 'Walk-in' }}
        summary={null}
        now={FIXED_NOW}
      />);
      const node = screen.getByTestId('row-name');
      expect(node.tagName).toBe('DIV');
      expect(node.getAttribute('href')).toBe(null);
      expect(node.textContent).toBe('Walk-in');
    });

    it('R8.5 anchor displays summary.name (preferred over appt.customerName)', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'LC-26000006', date: '2026-05-08', status: 'pending', customerName: 'Stale Name' }}
        summary={{ ...baseSummary, name: 'นาย ภูมรศักดิ์ มงคล' }}
        now={FIXED_NOW}
      />);
      const link = screen.getByTestId('row-name');
      expect(link.textContent).toBe('นาย ภูมรศักดิ์ มงคล');
    });

    it('R8.6 anchor carries data-customer-id attribute equal to appt.customerId', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'LC-26000011', date: '2026-05-08', status: 'pending' }}
        summary={baseSummary}
        now={FIXED_NOW}
      />);
      const link = screen.getByTestId('row-name');
      expect(link.getAttribute('data-customer-id')).toBe('LC-26000011');
    });

    it('R8.7 anchor falls back to appt.customerName when summary missing', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'LC-26000006', date: '2026-05-08', status: 'pending', customerName: 'Backup Name' }}
        summary={null}
        now={FIXED_NOW}
      />);
      const link = screen.getByTestId('row-name');
      expect(link.tagName).toBe('A');
      expect(link.textContent).toBe('Backup Name');
    });
  });

  // V64-fix9 (2026-05-09) — visual emphasis + on-theme color
  describe('V64.R9 V64-fix9 — visual emphasis (time chip + purpose chip + name color)', () => {
    it('R9.1 row-time-emphasis chip rendered with amber styling + start-end times', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', startTime: '16:30', endTime: '17:30', status: 'pending' }}
        summary={baseSummary}
        now={FIXED_NOW}
      />);
      const time = screen.getByTestId('row-time-emphasis');
      expect(time).toBeInTheDocument();
      expect(time.textContent).toMatch(/16:30/);
      expect(time.textContent).toMatch(/17:30/);
      expect(time.className).toMatch(/amber/);
    });

    it('R9.2 row-purpose chip renders appointmentTo with emerald emphasis', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending', appointmentTo: 'รักษาสิว' }}
        summary={baseSummary}
        now={FIXED_NOW}
      />);
      const purpose = screen.getByTestId('row-purpose');
      expect(purpose).toBeInTheDocument();
      expect(purpose.textContent).toBe('รักษาสิว');
      expect(purpose.className).toMatch(/emerald/);
    });

    it('R9.3 row-purpose chip shows em-dash when appointmentTo missing', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending' }}
        summary={baseSummary}
        now={FIXED_NOW}
      />);
      expect(screen.getByTestId('row-purpose').textContent).toBe('—');
    });

    it('R9.4 patient name uses sky color (NOT red — Thai-culture iron-clad)', () => {
      render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', status: 'pending' }}
        summary={baseSummary}
        now={FIXED_NOW}
      />);
      const name = screen.getByTestId('row-name');
      expect(name.className).toMatch(/sky-/);
      expect(name.className).not.toMatch(/(text-red|text-rose)/);
    });

    it('R9.5 redundant "เวลานัด:" row removed (V64-fix9 — info now in top time chip)', () => {
      const { container } = render(<AppointmentHubRowCard
        appt={{ id: 'A1', customerId: 'C1', date: '2026-05-08', startTime: '16:30', endTime: '17:30', status: 'pending' }}
        summary={baseSummary}
        now={FIXED_NOW}
      />);
      // The middle column should NOT have a separate "เวลานัด:" muted line
      // (was duplicate of the top emphasized chip).
      expect(container.textContent).not.toMatch(/เวลานัด:/);
    });
  });
});
