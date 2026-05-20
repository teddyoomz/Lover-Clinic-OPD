// tests/appointment-detail-popover-rtl.test.jsx
//
// Calendar-density T2 (2026-05-20) — RTL bank for AppointmentDetailPopover.
// Read-only quick view opened from the grid block + agenda card.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentDetailPopover from '../src/components/backend/AppointmentDetailPopover.jsx';

const appt = {
  appointmentId: 'BA-1',
  customerName: 'นาย วีรวัศ รจิราเกียรติ',
  customerHN: 'HN-26-0042',
  customerPhone: '081-234-5678',
  startTime: '17:00',
  endTime: '17:15',
  appointmentTo: 'Shock wave',
  doctorName: 'หมอมายด์',
  assistantNames: ['ยาหยี'],
  status: 'confirmed',
};

function renderPopover(overrides = {}) {
  const onEdit = vi.fn();
  const onClose = vi.fn();
  render(
    <AppointmentDetailPopover
      appt={appt}
      roomName="ห้องแพทย์"
      doctorMap={null}
      onEdit={onEdit}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onEdit, onClose };
}

describe('AppointmentDetailPopover · DP1 rendering', () => {
  it('DP1.1 renders the customer name', () => {
    renderPopover();
    expect(screen.getByTestId('appt-detail-name')).toHaveTextContent('นาย วีรวัศ รจิราเกียรติ');
  });

  it('DP1.2 meta = HN · time-range · room', () => {
    renderPopover();
    const meta = screen.getByTestId('appt-detail-meta');
    expect(meta).toHaveTextContent('HN-26-0042');
    expect(meta).toHaveTextContent('17:00–17:15');
    expect(meta).toHaveTextContent('ห้องแพทย์');
  });

  it('DP1.3 phone renders as a tel: link with stripped digits', () => {
    renderPopover();
    const phoneEl = screen.getByTestId('appt-detail-phone');
    expect(phoneEl.tagName).toBe('A');
    expect(phoneEl.getAttribute('href')).toMatch(/^tel:/);
    expect(phoneEl.getAttribute('href')).toContain('0812345678');
  });

  it('DP1.4 service line shows 🎯 + appointmentTo', () => {
    renderPopover();
    expect(screen.getByTestId('appt-detail-service')).toHaveTextContent('Shock wave');
  });

  it('DP1.5 doctor + assistant line', () => {
    renderPopover();
    const doc = screen.getByTestId('appt-detail-doctor');
    expect(doc).toHaveTextContent('หมอมายด์');
    expect(doc).toHaveTextContent('ยาหยี');
  });

  it('DP1.6 status pill shows resolved label', () => {
    renderPopover();
    expect(screen.getByTestId('appt-detail-status')).toHaveTextContent('ยืนยันแล้ว');
  });
});

describe('AppointmentDetailPopover · DP2 interaction', () => {
  it('DP2.1 แก้ไข → onEdit', () => {
    const { onEdit, onClose } = renderPopover();
    fireEvent.click(screen.getByTestId('appt-detail-edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('DP2.2 X button → onClose', () => {
    const { onClose } = renderPopover();
    fireEvent.click(screen.getByTestId('appt-detail-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('DP2.3 ESC → onClose', () => {
    const { onClose } = renderPopover();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('DP2.4 backdrop click does NOT close (AV78 explicit-close-only)', () => {
    const { onClose } = renderPopover();
    fireEvent.click(screen.getByTestId('appt-detail-popover'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('AppointmentDetailPopover · DP3 edge cases + Thai-culture', () => {
  it('DP3.1 name element is NOT red (Thai-culture)', () => {
    renderPopover();
    expect(screen.getByTestId('appt-detail-name').className).not.toMatch(/text-red/);
  });

  it('DP3.2 null appt → renders nothing', () => {
    renderPopover({ appt: null });
    expect(screen.queryByTestId('appt-detail-popover')).toBeNull();
  });

  it('DP3.3 fallbacks: no name → "-", no doctor → ไม่ระบุแพทย์, no phone → no link', () => {
    renderPopover({ appt: { startTime: '09:00', status: 'pending' } });
    expect(screen.getByTestId('appt-detail-name')).toHaveTextContent('-');
    expect(screen.getByTestId('appt-detail-doctor')).toHaveTextContent('ไม่ระบุแพทย์');
    expect(screen.queryByTestId('appt-detail-phone')).toBeNull();
  });

  it('DP3.4 customerNameTemp + customerPhoneTemp used when no linked customer', () => {
    renderPopover({ appt: { customerNameTemp: 'ลูกค้าใหม่', customerPhoneTemp: '0998887777', startTime: '10:00', status: 'pending' } });
    expect(screen.getByTestId('appt-detail-name')).toHaveTextContent('ลูกค้าใหม่');
    expect(screen.getByTestId('appt-detail-phone').getAttribute('href')).toContain('0998887777');
  });
});
