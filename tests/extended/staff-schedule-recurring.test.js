// ─── Phase 13.2.6 — recurring schedule schema + merge helper tests ───────
// SR group — verifies:
//   - validator accepts type='recurring' with dayOfWeek, rejects bad shapes
//   - normalizer scrubs date when type='recurring' and vice versa
//   - dayOfWeekFromDate computes JS getUTCDay() correctly
//   - mergeSchedulesForDate: per-date override wins over recurring;
//     multi-shift recurring kept; date format validation
//   - checkAppointmentCollision now honors recurring shifts via merge
//
// V13/V14/V21 lessons applied: pair shape grep with runtime outcome.

import { describe, it, expect } from 'vitest';
import {
  TYPE_OPTIONS,
  TYPE_LABEL,
  DAY_OF_WEEK_LABEL,
  validateStaffScheduleStrict,
  normalizeStaffSchedule,
  emptyStaffScheduleForm,
  dayOfWeekFromDate,
  mergeSchedulesForDate,
  checkAppointmentCollision,
} from '../src/lib/staffScheduleValidation.js';

describe('SR — Phase 13.2.6 recurring schedule schema + merge', () => {
  describe('SR1 — TYPE_OPTIONS includes "recurring" first', () => {
    it('SR1.1 includes recurring before per-date types', () => {
      expect(TYPE_OPTIONS).toContain('recurring');
      expect(TYPE_OPTIONS.indexOf('recurring')).toBeLessThan(TYPE_OPTIONS.indexOf('work'));
    });

    it('SR1.2 keeps all 5 legacy per-date types', () => {
      for (const t of ['work', 'halfday', 'holiday', 'leave', 'sick']) {
        expect(TYPE_OPTIONS).toContain(t);
      }
    });

    it('SR1.3 TYPE_LABEL has Thai for recurring', () => {
      expect(TYPE_LABEL.recurring).toBe('ประจำสัปดาห์');
    });

    it('SR1.4 DAY_OF_WEEK_LABEL covers all 7 days (0=Sun..6=Sat)', () => {
      for (let i = 0; i <= 6; i++) {
        expect(typeof DAY_OF_WEEK_LABEL[i]).toBe('string');
        expect(DAY_OF_WEEK_LABEL[i].length).toBeGreaterThan(0);
      }
    });
  });

  describe('SR2 — validator: recurring type', () => {
    const baseRec = {
      staffId: '102', type: 'recurring',
      dayOfWeek: 1, startTime: '09:00', endTime: '17:00',
    };

    it('SR2.1 accepts valid recurring with dayOfWeek + start + end', () => {
      expect(validateStaffScheduleStrict(baseRec)).toBe(null);
    });

    it('SR2.2 rejects recurring without dayOfWeek', () => {
      const fail = validateStaffScheduleStrict({ ...baseRec, dayOfWeek: undefined });
      expect(fail?.[0]).toBe('dayOfWeek');
    });

    it('SR2.3 rejects recurring with dayOfWeek out of range', () => {
      expect(validateStaffScheduleStrict({ ...baseRec, dayOfWeek: 7 })?.[0]).toBe('dayOfWeek');
      expect(validateStaffScheduleStrict({ ...baseRec, dayOfWeek: -1 })?.[0]).toBe('dayOfWeek');
      expect(validateStaffScheduleStrict({ ...baseRec, dayOfWeek: 'mon' })?.[0]).toBe('dayOfWeek');
    });

    it('SR2.4 ACCEPTS dayOfWeek as a string number (form serialization tolerance)', () => {
      expect(validateStaffScheduleStrict({ ...baseRec, dayOfWeek: '3' })).toBe(null);
    });

    it('SR2.5 rejects recurring WITH date (mutually exclusive)', () => {
      const fail = validateStaffScheduleStrict({ ...baseRec, date: '2026-04-26' });
      expect(fail?.[0]).toBe('date');
      expect(fail?.[1]).toContain('recurring');
    });

    it('SR2.6 rejects recurring without startTime', () => {
      const fail = validateStaffScheduleStrict({ ...baseRec, startTime: '' });
      expect(fail?.[0]).toBe('startTime');
    });

    it('SR2.7 rejects recurring with endTime <= startTime', () => {
      const fail = validateStaffScheduleStrict({ ...baseRec, startTime: '17:00', endTime: '09:00' });
      expect(fail?.[0]).toBe('endTime');
    });
  });

  describe('SR3 — validator: per-date types still work', () => {
    it('SR3.1 work entry with date passes', () => {
      expect(validateStaffScheduleStrict({
        staffId: '102', type: 'work', date: '2026-04-26',
        startTime: '09:00', endTime: '17:00',
      })).toBe(null);
    });

    it('SR3.2 leave entry with date but no time passes', () => {
      expect(validateStaffScheduleStrict({
        staffId: '102', type: 'leave', date: '2026-04-26',
      })).toBe(null);
    });

    it('SR3.3 per-date entry WITH dayOfWeek is rejected (mutually exclusive)', () => {
      const fail = validateStaffScheduleStrict({
        staffId: '102', type: 'work', date: '2026-04-26',
        dayOfWeek: 1, startTime: '09:00', endTime: '17:00',
      });
      expect(fail?.[0]).toBe('dayOfWeek');
    });

    it('SR3.4 per-date entry without date still rejected', () => {
      const fail = validateStaffScheduleStrict({
        staffId: '102', type: 'work', startTime: '09:00', endTime: '17:00',
      });
      expect(fail?.[0]).toBe('date');
    });
  });

  describe('SR4 — normalizer: recurring vs per-date scrubbing', () => {
    it('SR4.1 recurring entry: date scrubbed, dayOfWeek coerced to int', () => {
      const out = normalizeStaffSchedule({
        staffId: '102', type: 'recurring',
        date: '2026-04-26',  // should be scrubbed
        dayOfWeek: '3',
        startTime: '09:00', endTime: '17:00',
      });
      expect(out.date).toBe('');
      expect(out.dayOfWeek).toBe(3);
    });

    it('SR4.2 per-date entry: dayOfWeek scrubbed to null', () => {
      const out = normalizeStaffSchedule({
        staffId: '102', type: 'work', date: '2026-04-26',
        dayOfWeek: 5,  // should be scrubbed
        startTime: '09:00', endTime: '17:00',
      });
      expect(out.dayOfWeek).toBe(null);
      expect(out.date).toBe('2026-04-26');
    });

    it('SR4.3 recurring entry with bad dayOfWeek normalized to null', () => {
      const out = normalizeStaffSchedule({
        staffId: '102', type: 'recurring',
        dayOfWeek: 'monday',
        startTime: '09:00', endTime: '17:00',
      });
      expect(out.dayOfWeek).toBe(null);
    });

    it('SR4.4 leave/holiday/sick still scrub time fields', () => {
      const out = normalizeStaffSchedule({
        staffId: '102', type: 'leave', date: '2026-04-26',
        startTime: '09:00', endTime: '17:00',
      });
      expect(out.startTime).toBe('');
      expect(out.endTime).toBe('');
    });

    it('SR4.5 emptyForm has dayOfWeek: null (not undefined)', () => {
      const empty = emptyStaffScheduleForm();
      expect(empty.dayOfWeek).toBe(null);
      expect(empty).toHaveProperty('dayOfWeek');
    });
  });

  describe('SR5 — dayOfWeekFromDate', () => {
    it('SR5.1 returns 0 for Sunday', () => {
      expect(dayOfWeekFromDate('2026-04-26')).toBe(0); // 26 Apr 2026 = Sunday
    });

    it('SR5.2 returns 1 for Monday', () => {
      expect(dayOfWeekFromDate('2026-04-27')).toBe(1);
    });

    it('SR5.3 returns 6 for Saturday', () => {
      expect(dayOfWeekFromDate('2026-04-25')).toBe(6);
    });

    it('SR5.4 returns NaN for invalid input', () => {
      expect(Number.isNaN(dayOfWeekFromDate('2026/04/26'))).toBe(true);
      expect(Number.isNaN(dayOfWeekFromDate(null))).toBe(true);
      expect(Number.isNaN(dayOfWeekFromDate(''))).toBe(true);
    });

    it('SR5.5 leap-year boundary 2024-02-29 = Thursday (4)', () => {
      expect(dayOfWeekFromDate('2024-02-29')).toBe(4);
    });
  });

  describe('SR6 — mergeSchedulesForDate', () => {
    const recMon = { staffId: '102', type: 'recurring', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' };
    const recSun = { staffId: '102', type: 'recurring', dayOfWeek: 0, startTime: '13:00', endTime: '22:00' };
    const overrideLeave = { staffId: '102', type: 'leave', date: '2026-04-27', note: 'PTO' };
    const otherStaffRec = { staffId: '999', type: 'recurring', dayOfWeek: 1, startTime: '08:00', endTime: '16:00' };

    it('SR6.1 returns recurring entry for matching dayOfWeek', () => {
      const out = mergeSchedulesForDate('2026-04-27', [recMon, recSun]);  // Mon
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe('recurring');
      expect(out[0].source).toBe('recurring');
    });

    it('SR6.2 per-date override WINS over recurring on same date', () => {
      const out = mergeSchedulesForDate('2026-04-27', [recMon, overrideLeave]);
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe('leave');
      expect(out[0].source).toBe('override');
    });

    it('SR6.3 staffIdsFilter applied', () => {
      const out = mergeSchedulesForDate('2026-04-27', [recMon, otherStaffRec], ['102']);
      expect(out).toHaveLength(1);
      expect(out[0].staffId).toBe('102');
    });

    it('SR6.4 throws on bad targetDate', () => {
      expect(() => mergeSchedulesForDate('2026/04/27', [])).toThrow();
      expect(() => mergeSchedulesForDate(null, [])).toThrow();
    });

    it('SR6.5 returns empty when no entries match', () => {
      const out = mergeSchedulesForDate('2026-04-25', [recMon]);  // Sat — no Sun/Mon recurring
      expect(out).toEqual([]);
    });

    it('SR6.6 keeps MULTIPLE recurring entries on the same dayOfWeek (split shifts)', () => {
      // Doctor with morning + evening shift on same day — both kept
      const morning = { staffId: '102', type: 'recurring', dayOfWeek: 1, startTime: '08:00', endTime: '12:00' };
      const evening = { staffId: '102', type: 'recurring', dayOfWeek: 1, startTime: '17:00', endTime: '21:00' };
      const out = mergeSchedulesForDate('2026-04-27', [morning, evening]);
      expect(out).toHaveLength(2);
    });

    it('SR6.7 ignores entries missing staffId', () => {
      const out = mergeSchedulesForDate('2026-04-27', [recMon, { type: 'recurring', dayOfWeek: 1 }]);
      expect(out).toHaveLength(1);
    });
  });

  describe('SR7 — checkAppointmentCollision honors recurring shifts', () => {
    // Doctor 102: recurring Mon 09-17
    const recMon = { staffId: '102', type: 'recurring', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' };
    // Per-date override: leave on Mon 2026-04-27
    const overrideLeaveMon = { staffId: '102', type: 'leave', date: '2026-04-27' };

    it('SR7.1 appointment WITHIN recurring window → available', () => {
      // 2026-04-27 is Monday
      const r = checkAppointmentCollision('102', '2026-04-27', '10:00', '11:00', [recMon]);
      expect(r.available).toBe(true);
      expect(r.source).toBe('recurring');
    });

    it('SR7.2 appointment OUTSIDE recurring window → blocked นอกเวลาทำงาน', () => {
      const r = checkAppointmentCollision('102', '2026-04-27', '17:30', '18:00', [recMon]);
      expect(r.available).toBe(false);
      expect(r.reason).toBe('นอกเวลาทำงาน');
    });

    it('SR7.3 leave override on the same day → blocked ลา (override wins)', () => {
      const r = checkAppointmentCollision('102', '2026-04-27', '10:00', '11:00', [recMon, overrideLeaveMon]);
      expect(r.available).toBe(false);
      expect(r.reason).toBe('ลา');
      expect(r.source).toBe('override');
    });

    it('SR7.4 no schedule entries → assume available (legacy)', () => {
      const r = checkAppointmentCollision('102', '2026-04-27', '10:00', '11:00', []);
      expect(r.available).toBe(true);
      expect(r.reason).toContain('ไม่มี');
    });

    it('SR7.5 different staff has no schedule → other-staff entries ignored', () => {
      const r = checkAppointmentCollision('999', '2026-04-27', '10:00', '11:00', [recMon]);
      // Staff 999 has nothing — assume available
      expect(r.available).toBe(true);
    });

    it('SR7.6 appointment on a recurring NON-match day → assume available (no entry resolves)', () => {
      // 2026-04-25 is Sat; recMon is Mon-only → no match
      const r = checkAppointmentCollision('102', '2026-04-25', '10:00', '11:00', [recMon]);
      expect(r.available).toBe(true);
    });
  });

  describe('SR8 — Source-grep regression guards', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const validatorSrc = fs.readFileSync(
      path.resolve(__dirname, '..', 'src/lib/staffScheduleValidation.js'),
      'utf-8'
    );
    const clientSrc = fs.readFileSync(
      path.resolve(__dirname, '..', 'src/lib/backendClient.js'),
      'utf-8'
    );

    it('SR8.1 staffScheduleValidation exports mergeSchedulesForDate + dayOfWeekFromDate', () => {
      expect(validatorSrc).toMatch(/export\s+function\s+mergeSchedulesForDate/);
      expect(validatorSrc).toMatch(/export\s+function\s+dayOfWeekFromDate/);
    });

    it('SR8.2 TYPE_OPTIONS includes recurring at index 0', () => {
      expect(validatorSrc).toMatch(/TYPE_OPTIONS\s*=\s*Object\.freeze\(\[\s*['"]recurring['"]/);
    });

    it('SR8.3 SS-8 + SS-9 invariants documented', () => {
      expect(validatorSrc).toMatch(/SS-8/);
      expect(validatorSrc).toMatch(/SS-9/);
    });

    it('SR8.4 backendClient exports getActiveSchedulesForDate + listenToScheduleByDay', () => {
      expect(clientSrc).toMatch(/export\s+async\s+function\s+getActiveSchedulesForDate/);
      expect(clientSrc).toMatch(/export\s+function\s+listenToScheduleByDay/);
    });

    it('SR8.5 listener uses 200ms debounce (Phase 14.7.H listener-cluster pattern)', () => {
      const idx = clientSrc.indexOf('export function listenToScheduleByDay');
      const fn = clientSrc.slice(idx, idx + 2500);
      expect(fn).toMatch(/setTimeout|debounce/);
      expect(fn).toMatch(/return\s+\(\)\s*=>/); // unsub function
    });

    it('SR8.6 checkAppointmentCollision now uses mergeSchedulesForDate', () => {
      const idx = validatorSrc.indexOf('export function checkAppointmentCollision');
      const fn = validatorSrc.slice(idx, idx + 2500);
      expect(fn).toMatch(/mergeSchedulesForDate/);
    });
  });
});
