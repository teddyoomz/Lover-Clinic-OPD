// tests/appointment-agenda-view-rtl.test.jsx
//
// Calendar-density T5 (2026-05-20) — RTL bank for AppointmentAgendaView.
// Chronological full-detail cards; card tap → onSelect (opens popover).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentAgendaView from '../src/components/backend/AppointmentAgendaView.jsx';

// Deliberately out of start-time order to prove the view sorts.
const appts = [
  { appointmentId: 'A3', startTime: '17:00', endTime: '17:15', customerName: 'ซี', status: 'pending', doctorName: 'หมอ C' },
  { appointmentId: 'A1', startTime: '09:00', endTime: '09:30', customerName: 'เอ', customerHN: 'HN-1', appointmentTo: 'Botox', customerPhone: '081-111-1111', status: 'confirmed', doctorName: 'หมอ A', roomName: 'ห้อง 1' },
  { appointmentId: 'A2', startTime: '13:00', endTime: '13:15', customerName: 'บี', status: 'done', doctorName: 'หมอ B' },
];

describe('AppointmentAgendaView · AG1 rendering', () => {
  it('AG1.1 renders cards sorted chronologically by startTime', () => {
    render(<AppointmentAgendaView appts={appts} onSelect={() => {}} />);
    const names = screen.getAllByTestId('appt-agenda-name').map((n) => n.textContent);
    expect(names[0]).toContain('เอ');   // 09:00
    expect(names[1]).toContain('บี');   // 13:00
    expect(names[2]).toContain('ซี');   // 17:00
  });

  it('AG1.2 room tag rendered via resolveRoom prop', () => {
    const resolveRoom = vi.fn((a) => (a.appointmentId === 'A1' ? 'ห้องแพทย์' : ''));
    render(<AppointmentAgendaView appts={appts} onSelect={() => {}} resolveRoom={resolveRoom} />);
    expect(resolveRoom).toHaveBeenCalled();
    expect(screen.getByText('ห้องแพทย์')).toBeInTheDocument();
  });

  it('AG1.3 room tag falls back to appt.roomName when no resolveRoom', () => {
    render(<AppointmentAgendaView appts={appts} onSelect={() => {}} />);
    expect(screen.getByText('ห้อง 1')).toBeInTheDocument(); // from A1.roomName
  });

  it('AG1.4 name + HN + service render', () => {
    render(<AppointmentAgendaView appts={appts} onSelect={() => {}} />);
    expect(screen.getByText('HN-1')).toBeInTheDocument();
    expect(screen.getByText(/Botox/)).toBeInTheDocument();
  });

  it('AG1.5 doctor + tap-to-call phone link', () => {
    render(<AppointmentAgendaView appts={appts} onSelect={() => {}} />);
    expect(screen.getByText(/หมอ A/)).toBeInTheDocument();
    const phoneEl = screen.getByTestId('appt-agenda-phone');
    expect(phoneEl.tagName).toBe('A');
    expect(phoneEl.getAttribute('href')).toContain('0811111111');
  });

  it('AG1.6 status pill resolves label', () => {
    render(<AppointmentAgendaView appts={appts} onSelect={() => {}} />);
    expect(screen.getByText(/ยืนยันแล้ว/)).toBeInTheDocument();
    expect(screen.getByText(/เสร็จแล้ว/)).toBeInTheDocument();
  });
});

describe('AppointmentAgendaView · AG2 interaction + edge', () => {
  it('AG2.1 card click → onSelect(appt)', () => {
    const onSelect = vi.fn();
    render(<AppointmentAgendaView appts={appts} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('appt-agenda-card-A1'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].appointmentId).toBe('A1');
  });

  it('AG2.2 Enter key on card → onSelect', () => {
    const onSelect = vi.fn();
    render(<AppointmentAgendaView appts={appts} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId('appt-agenda-card-A2'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].appointmentId).toBe('A2');
  });

  it('AG2.3 empty list → empty state', () => {
    render(<AppointmentAgendaView appts={[]} onSelect={() => {}} />);
    expect(screen.getByTestId('appt-agenda-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('appt-agenda-view')).toBeNull();
  });

  it('AG2.4 name is NOT red (Thai-culture)', () => {
    render(<AppointmentAgendaView appts={appts} onSelect={() => {}} />);
    for (const nameEl of screen.getAllByTestId('appt-agenda-name')) {
      expect(nameEl.className).not.toMatch(/text-red/);
    }
  });

  it('AG2.5 missing fields → "-" name + ไม่ระบุแพทย์', () => {
    render(<AppointmentAgendaView appts={[{ appointmentId: 'X', startTime: '08:00' }]} onSelect={() => {}} />);
    expect(screen.getByTestId('appt-agenda-name')).toHaveTextContent('-');
    expect(screen.getByText(/ไม่ระบุแพทย์/)).toBeInTheDocument();
  });
});
