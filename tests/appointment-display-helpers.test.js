import { describe, test, expect } from 'vitest';
import {
  getApptStatusMeta,
  apptDisplayName,
  apptPhoneValue,
  apptTimeRange,
  APPT_STATUSES,
} from '../src/lib/appointmentDisplay.js';

// Calendar-density (2026-05-20) — shared display helpers feeding the
// AppointmentDetailPopover + AppointmentAgendaView + the grid block.
describe('appointmentDisplay helpers', () => {
  test('APPT_STATUSES mirrors the grid STATUSES (real 4 entries, pending first)', () => {
    expect(Array.isArray(APPT_STATUSES)).toBe(true);
    expect(APPT_STATUSES).toHaveLength(4);
    expect(APPT_STATUSES.map((s) => s.value)).toEqual(['pending', 'confirmed', 'done', 'cancelled']);
    // every entry carries the render shape the grid/popover/agenda rely on
    for (const s of APPT_STATUSES) {
      expect(s).toEqual(
        expect.objectContaining({
          value: expect.any(String),
          label: expect.any(String),
          bg: expect.any(String),
          text: expect.any(String),
          dot: expect.any(String),
          accent: expect.any(String),
        }),
      );
    }
  });

  test('getApptStatusMeta resolves known status + falls back to first (pending)', () => {
    expect(getApptStatusMeta('confirmed').label).toBe('ยืนยันแล้ว');
    expect(getApptStatusMeta('done').label).toBe('เสร็จแล้ว');
    expect(getApptStatusMeta('cancelled').label).toBe('ยกเลิก');
    // unknown + undefined both fall back to APPT_STATUSES[0] (pending)
    expect(getApptStatusMeta('???')).toEqual(getApptStatusMeta(undefined));
    expect(getApptStatusMeta('???')).toBe(APPT_STATUSES[0]);
    expect(getApptStatusMeta(undefined).value).toBe('pending');
  });

  test('apptDisplayName falls back customerName → customerNameTemp → -', () => {
    expect(apptDisplayName({ customerName: 'A' })).toBe('A');
    expect(apptDisplayName({ customerNameTemp: 'T' })).toBe('T');
    expect(apptDisplayName({ customerName: 'A', customerNameTemp: 'T' })).toBe('A');
    expect(apptDisplayName({})).toBe('-');
    expect(apptDisplayName(null)).toBe('-');
    expect(apptDisplayName(undefined)).toBe('-');
  });

  test('apptPhoneValue prefers customerPhone then customerPhoneTemp then ""', () => {
    expect(apptPhoneValue({ customerPhone: '081', customerPhoneTemp: '099' })).toBe('081');
    expect(apptPhoneValue({ customerPhoneTemp: '099' })).toBe('099');
    expect(apptPhoneValue({})).toBe('');
    expect(apptPhoneValue(null)).toBe('');
  });

  test('apptTimeRange formats start–end, start only, or ""', () => {
    expect(apptTimeRange({ startTime: '17:00', endTime: '17:15' })).toBe('17:00–17:15');
    expect(apptTimeRange({ startTime: '17:00' })).toBe('17:00');
    expect(apptTimeRange({})).toBe('');
    expect(apptTimeRange(null)).toBe('');
  });
});
