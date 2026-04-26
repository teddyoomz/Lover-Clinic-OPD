// ─── Phase 13.2.1 · staff schedule validator adversarial tests ────────────
import { describe, it, expect } from 'vitest';
import {
  validateStaffScheduleStrict, normalizeStaffSchedule, emptyStaffScheduleForm,
  generateStaffScheduleId, checkAppointmentCollision,
  TYPE_OPTIONS, TYPE_LABEL, TIME_SLOTS,
} from '../src/lib/staffScheduleValidation.js';

const base = (over = {}) => ({
  ...emptyStaffScheduleForm(),
  staffId: 'STAFF-1',
  date: '2026-04-24',
  type: 'work',
  startTime: '09:00',
  endTime: '18:00',
  ...over,
});

describe('validateStaffScheduleStrict — required + enums (SS-1..SS-3)', () => {
  it('SV1: null/array rejected', () => {
    expect(validateStaffScheduleStrict(null)?.[0]).toBe('form');
    expect(validateStaffScheduleStrict([])?.[0]).toBe('form');
  });
  it('SV2: missing staffId rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), staffId: '' })?.[0]).toBe('staffId');
  });
  it('SV3: missing date rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), date: '' })?.[0]).toBe('date');
  });
  it('SV4: dd/mm/yyyy date rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), date: '24/04/2026' })?.[0]).toBe('date');
  });
  it('SV5: invalid type rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), type: 'bogus' })?.[0]).toBe('type');
  });
  it('SV6: all 6 TYPE_OPTIONS accepted (recurring + 5 per-date)', () => {
    // Phase 13.2.6: TYPE_OPTIONS now includes 'recurring' (weekly shift,
    // dayOfWeek instead of date). All other types remain per-date.
    for (const t of TYPE_OPTIONS) {
      let f;
      if (t === 'recurring') {
        // recurring uses dayOfWeek + start/end; date forbidden
        f = { ...base(), type: t, date: undefined, dayOfWeek: 1, startTime: '09:00', endTime: '18:00' };
        delete f.date;
      } else if (t === 'work' || t === 'halfday') {
        f = base({ type: t });
        f.startTime = '09:00';
        f.endTime = '18:00';
      } else {
        f = base({ type: t });
        f.startTime = '';
        f.endTime = '';
      }
      expect(validateStaffScheduleStrict(f)).toBeNull();
    }
  });
});

describe('validateStaffScheduleStrict — time fields (SS-4, SS-5, SS-7)', () => {
  it('SV7: work without startTime rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), startTime: '' })?.[0]).toBe('startTime');
  });
  it('SV8: work without endTime rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), endTime: '' })?.[0]).toBe('endTime');
  });
  it('SV9: malformed startTime rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), startTime: '9:00' })?.[0]).toBe('startTime');
  });
  it('SV10: out-of-range hour rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), startTime: '25:00' })?.[0]).toBe('startTime');
  });
  it('SV11: out-of-range minute rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), endTime: '18:60' })?.[0]).toBe('endTime');
  });
  it('SV12: endTime = startTime rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), startTime: '10:00', endTime: '10:00' })?.[0]).toBe('endTime');
  });
  it('SV13: endTime before startTime rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), startTime: '18:00', endTime: '09:00' })?.[0]).toBe('endTime');
  });
  it('SV14: holiday without times accepted', () => {
    expect(validateStaffScheduleStrict({ ...base(), type: 'holiday', startTime: '', endTime: '' })).toBeNull();
  });
  it('SV15: leave + sick without times accepted', () => {
    expect(validateStaffScheduleStrict({ ...base(), type: 'leave', startTime: '', endTime: '' })).toBeNull();
    expect(validateStaffScheduleStrict({ ...base(), type: 'sick', startTime: '', endTime: '' })).toBeNull();
  });
});

describe('validateStaffScheduleStrict — id format (SS-6)', () => {
  it('SV16: malformed id rejected', () => {
    expect(validateStaffScheduleStrict({ ...base(), id: 'bad-id' })?.[0]).toBe('id');
  });
  it('SV17: valid id accepted', () => {
    expect(validateStaffScheduleStrict({ ...base(), id: 'STFSCH-0426-deadbeef' })).toBeNull();
  });
  it('SV18: empty id (new doc) accepted', () => {
    expect(validateStaffScheduleStrict({ ...base(), id: '' })).toBeNull();
  });
});

describe('normalizeStaffSchedule', () => {
  it('SV19: trims strings + default type to work', () => {
    const n = normalizeStaffSchedule({ staffId: '  X  ', date: '  2026-04-24  ' });
    expect(n.staffId).toBe('X');
    expect(n.date).toBe('2026-04-24');
    expect(n.type).toBe('work');
  });
  it('SV20: snake_case coerced to camelCase', () => {
    const n = normalizeStaffSchedule({
      staff_id: 'STAFF-1', start_time: '09:00', end_time: '18:00',
    });
    expect(n.staffId).toBe('STAFF-1');
    expect(n.startTime).toBe('09:00');
    expect(n.endTime).toBe('18:00');
  });
  it('SV21: holiday type scrubs time fields', () => {
    const n = normalizeStaffSchedule({ type: 'holiday', startTime: '09:00', endTime: '18:00' });
    expect(n.startTime).toBe('');
    expect(n.endTime).toBe('');
  });
  it('SV22: invalid type falls back to work', () => {
    expect(normalizeStaffSchedule({ type: 'bogus' }).type).toBe('work');
  });
});

describe('generateStaffScheduleId', () => {
  it('SV23: format STFSCH-MMYY-8hex with Thai TZ', () => {
    // 12:00 UTC April 24 = 19:00 Bangkok April 24 → 0426.
    const id = generateStaffScheduleId(Date.UTC(2026, 3, 24, 12));
    expect(id).toMatch(/^STFSCH-0426-[0-9a-f]{8}$/);
  });
  it('SV24: Dec 31 UTC 23:00 → Thai Jan next year → 0127', () => {
    const id = generateStaffScheduleId(Date.UTC(2026, 11, 31, 23));
    expect(id).toMatch(/^STFSCH-0127-[0-9a-f]{8}$/);
  });
  it('SV25: 100 ids unique', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(generateStaffScheduleId());
    expect(ids.size).toBe(100);
  });
});

describe('checkAppointmentCollision — Phase 13.2.4 helper', () => {
  it('CC1: no schedule entries → available (legacy behaviour)', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', '10:00', '11:00', []);
    expect(r.available).toBe(true);
  });
  it('CC2: holiday entry → blocks', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', '10:00', '11:00', [
      { staffId: 'S1', date: '2026-04-24', type: 'holiday' },
    ]);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('วันหยุด');
  });
  it('CC3: leave entry → blocks', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', '10:00', '11:00', [
      { staffId: 'S1', date: '2026-04-24', type: 'leave' },
    ]);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('ลา');
  });
  it('CC4: work entry + appointment inside → available', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', '10:00', '11:00', [
      { staffId: 'S1', date: '2026-04-24', type: 'work', startTime: '09:00', endTime: '18:00' },
    ]);
    expect(r.available).toBe(true);
  });
  it('CC5: work entry + appointment outside → blocks', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', '19:00', '20:00', [
      { staffId: 'S1', date: '2026-04-24', type: 'work', startTime: '09:00', endTime: '18:00' },
    ]);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('นอกเวลาทำงาน');
  });
  it('CC6: work entry + appointment partial-overlap → blocks (must fit ENTIRELY)', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', '17:30', '18:30', [
      { staffId: 'S1', date: '2026-04-24', type: 'work', startTime: '09:00', endTime: '18:00' },
    ]);
    expect(r.available).toBe(false);
  });
  it('CC7: different staffId entries ignored', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', '10:00', '11:00', [
      { staffId: 'S2', date: '2026-04-24', type: 'holiday' },
    ]);
    expect(r.available).toBe(true);
  });
  it('CC8: different date entries ignored', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', '10:00', '11:00', [
      { staffId: 'S1', date: '2026-04-23', type: 'holiday' },
    ]);
    expect(r.available).toBe(true);
  });
  it('CC9: halfday + appointment inside → available', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', '09:30', '10:30', [
      { staffId: 'S1', date: '2026-04-24', type: 'halfday', startTime: '09:00', endTime: '12:00' },
    ]);
    expect(r.available).toBe(true);
    expect(r.reason).toBe('ครึ่งวัน');
  });
  it('CC10: malformed appointment time → blocks defensively', () => {
    const r = checkAppointmentCollision('S1', '2026-04-24', 'bad', '10:00', [
      { staffId: 'S1', date: '2026-04-24', type: 'work', startTime: '09:00', endTime: '18:00' },
    ]);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('เวลานัดไม่ถูกต้อง');
  });
});

describe('frozen constants', () => {
  it('SV26: TYPE_OPTIONS frozen with 6 entries (recurring + 5 per-date)', () => {
    // Phase 13.2.6 added 'recurring' for ProClinic-fidelity weekly shifts.
    expect(Object.isFrozen(TYPE_OPTIONS)).toBe(true);
    expect(TYPE_OPTIONS.length).toBe(6);
    expect(TYPE_OPTIONS).toContain('recurring');
  });
  it('SV27: TYPE_LABEL has Thai labels', () => {
    expect(TYPE_LABEL.work).toBe('ทำงาน');
    expect(TYPE_LABEL.holiday).toBe('วันหยุด');
  });
  it('SV28: TIME_SLOTS covers 08:30-22:00 at 30-min steps', () => {
    expect(Object.isFrozen(TIME_SLOTS)).toBe(true);
    expect(TIME_SLOTS[0]).toBe('08:30');
    expect(TIME_SLOTS[TIME_SLOTS.length - 1]).toBe('22:00');
    expect(TIME_SLOTS.length).toBe(28);
  });
});
