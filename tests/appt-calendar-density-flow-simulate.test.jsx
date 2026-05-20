// tests/appt-calendar-density-flow-simulate.test.jsx
//
// Calendar-density T7 (Rule I) — full-flow simulate. Chains the new inline
// logic (effectiveView, span→nameSizeCls, span/collision calc) via pure
// mirrors + a real-React harness that reproduces the grid's exact
// openDetail → popover → onEdit → openEdit wiring. AppointmentCalendarView
// itself is too heavy to mount (listeners + branch context + child tree), so
// — like every existing calendar test — we mirror its inline logic + render
// the real leaf components (popover + agenda) end-to-end.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppointmentDetailPopover from '../src/components/backend/AppointmentDetailPopover.jsx';
import AppointmentAgendaView from '../src/components/backend/AppointmentAgendaView.jsx';
import { TIME_SLOTS } from '../src/lib/staffScheduleValidation.js';

// ── Pure mirrors of the grid's new inline derivations ──────────────────────
function effectiveView(viewModeOverride, belowLg) {
  return viewModeOverride || (belowLg ? 'agenda' : 'grid');
}
function nameSizeCls(span) {
  const isShortBlock = span === 1;
  return isShortBlock ? 'text-[11px] leading-[18px]' : 'text-sm leading-tight';
}
function spanOf(appt) {
  const s = TIME_SLOTS.indexOf(appt.startTime);
  const e = appt.endTime ? TIME_SLOTS.indexOf(appt.endTime) : s + 1;
  return Math.max(1, e - s);
}
// Mirror of apptMap collision keying ${startTime}|${room}.
function buildApptMap(appts, roomOf) {
  const map = {};
  for (const a of appts) {
    if (!a.startTime) continue;
    const key = `${a.startTime}|${roomOf(a)}`;
    (map[key] ||= []).push(a);
  }
  return map;
}

describe('calendar-density flow-simulate · F1 effectiveView (responsive + toggle)', () => {
  it('F1.1 below lg + no override → agenda (mobile auto)', () => {
    expect(effectiveView(null, true)).toBe('agenda');
  });
  it('F1.2 >= lg + no override → grid (desktop default)', () => {
    expect(effectiveView(null, false)).toBe('grid');
  });
  it('F1.3 override pins regardless of viewport', () => {
    expect(effectiveView('grid', true)).toBe('grid');   // pinned grid on a phone
    expect(effectiveView('agenda', false)).toBe('agenda'); // pinned agenda on desktop
  });
});

describe('calendar-density flow-simulate · F2 span → density', () => {
  it('F2.1 15-min appt → span 1 → single-line 11px name', () => {
    const appt = { startTime: '17:00', endTime: '17:15' };
    expect(spanOf(appt)).toBe(1);
    expect(nameSizeCls(spanOf(appt))).toContain('text-[11px]');
  });
  it('F2.2 1-hour appt → span 4 → roomy text-sm name', () => {
    const appt = { startTime: '17:00', endTime: '18:00' };
    expect(spanOf(appt)).toBe(4);
    expect(nameSizeCls(spanOf(appt))).toContain('text-sm');
  });
  it('F2.3 missing endTime → span 1 (defensive single slot)', () => {
    expect(spanOf({ startTime: '17:00' })).toBe(1);
  });
});

describe('calendar-density flow-simulate · F3 collision rollup (+N)', () => {
  it('F3.1 two appts same time+room → dupCount 1 (+N badge fires)', () => {
    const roomOf = (a) => a.roomName;
    const appts = [
      { appointmentId: 'A', startTime: '17:00', roomName: 'R1' },
      { appointmentId: 'B', startTime: '17:00', roomName: 'R1' },
      { appointmentId: 'C', startTime: '17:00', roomName: 'R2' },
    ];
    const map = buildApptMap(appts, roomOf);
    expect(map['17:00|R1'].length).toBe(2); // dupCount = 1
    expect(map['17:00|R2'].length).toBe(1); // no rollup
  });
});

// ── Real-React harness mirroring the grid's exact wiring ───────────────────
// block onClick → openDetail(appt) → detailAppt set → popover renders;
// popover onEdit → setDetailAppt(null) + openEdit(appt) (close popover, open
// edit modal). This is the EXACT closure shape used at the grid render site.
function GridWiringHarness({ appt }) {
  const [detailAppt, setDetailAppt] = React.useState(null);
  const [editedId, setEditedId] = React.useState(null);
  const openDetail = (a) => setDetailAppt(a);
  const openEdit = (a) => setEditedId(a.appointmentId);
  return (
    <div>
      <div role="button" tabIndex={0} data-testid="fake-block" onClick={() => openDetail(appt)}>
        {appt.customerName}
      </div>
      {editedId && <div data-testid="edit-modal-open">edit:{editedId}</div>}
      {detailAppt && (
        <AppointmentDetailPopover
          appt={detailAppt}
          roomName="ห้องแพทย์"
          doctorMap={null}
          onEdit={() => { const a = detailAppt; setDetailAppt(null); openEdit(a); }}
          onClose={() => setDetailAppt(null)}
        />
      )}
    </div>
  );
}

describe('calendar-density flow-simulate · F4 block → popover → edit chain', () => {
  const appt = {
    appointmentId: 'BA-77',
    customerName: 'นาย วีรวัศ',
    customerPhone: '081-234-5678',
    startTime: '17:00',
    endTime: '17:15',
    status: 'confirmed',
    doctorName: 'หมอมายด์',
  };

  it('F4.1 popover not shown until block clicked', () => {
    render(<GridWiringHarness appt={appt} />);
    expect(screen.queryByTestId('appt-detail-popover')).toBeNull();
  });

  it('F4.2 block click → popover appears with details', () => {
    render(<GridWiringHarness appt={appt} />);
    fireEvent.click(screen.getByTestId('fake-block'));
    expect(screen.getByTestId('appt-detail-popover')).toBeInTheDocument();
    expect(screen.getByTestId('appt-detail-name')).toHaveTextContent('นาย วีรวัศ');
    expect(screen.getByTestId('appt-detail-phone').getAttribute('href')).toContain('0812345678');
  });

  it('F4.3 แก้ไข inside popover → edit modal opens + popover closes', () => {
    render(<GridWiringHarness appt={appt} />);
    fireEvent.click(screen.getByTestId('fake-block'));
    fireEvent.click(screen.getByTestId('appt-detail-edit'));
    expect(screen.getByTestId('edit-modal-open')).toHaveTextContent('edit:BA-77');
    expect(screen.queryByTestId('appt-detail-popover')).toBeNull(); // popover closed
  });

  it('F4.4 ปิด / backdrop: ESC closes, backdrop click does NOT (AV78)', () => {
    render(<GridWiringHarness appt={appt} />);
    fireEvent.click(screen.getByTestId('fake-block'));
    fireEvent.click(screen.getByTestId('appt-detail-popover')); // backdrop
    expect(screen.getByTestId('appt-detail-popover')).toBeInTheDocument(); // stays open
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('appt-detail-popover')).toBeNull(); // ESC closes
  });
});

describe('calendar-density flow-simulate · F5 agenda → popover (mobile path)', () => {
  it('F5.1 dense day renders chronological agenda cards; card tap → onSelect(appt)', () => {
    const onSelect = vi.fn();
    const dense = [
      { appointmentId: 'D2', startTime: '17:00', endTime: '17:15', customerName: 'สอง', status: 'pending', doctorName: 'ห' },
      { appointmentId: 'D1', startTime: '09:00', endTime: '09:15', customerName: 'หนึ่ง', status: 'confirmed', doctorName: 'ห', roomName: 'R1' },
    ];
    render(<AppointmentAgendaView appts={dense} onSelect={onSelect} />);
    const names = screen.getAllByTestId('appt-agenda-name').map((n) => n.textContent);
    expect(names[0]).toContain('หนึ่ง'); // 09:00 sorts first
    fireEvent.click(screen.getByTestId('appt-agenda-card-D1'));
    expect(onSelect.mock.calls[0][0].appointmentId).toBe('D1'); // → opens popover in real wiring
  });
});
