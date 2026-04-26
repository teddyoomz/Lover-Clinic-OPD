// ─── Phase 13.2.10 — AppointmentFormModal honors recurring shifts ──────
// AFC group — verifies the collision check now resolves recurring +
// override entries (Phase 13.2.6 mergeSchedulesForDate). Previous
// {startDate, endDate} filter dropped recurring entries; this fixes the
// "doctor with recurring shift but no per-date entry → silent pass" bug.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkAppointmentCollision } from '../src/lib/staffScheduleValidation.js';

const modalSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/AppointmentFormModal.jsx'),
  'utf-8'
);

describe('AFC — Phase 13.2.10 AppointmentFormModal recurring-aware collision', () => {
  describe('AFC.A — Source-grep wiring fix', () => {
    it('AFC.A.1 listStaffSchedules call NO LONGER filters by startDate/endDate', () => {
      // V21-anti: the date filter dropped recurring entries (which have
      // dayOfWeek, no date). Find the listStaffSchedules CALL (not import)
      // and verify the args include staffId only.
      const callIdx = modalSrc.indexOf('listStaffSchedules({');
      expect(callIdx).toBeGreaterThan(0);
      // Take the next 200 chars of the call args
      const callArgs = modalSrc.slice(callIdx, callIdx + 200);
      // Should contain staffId
      expect(callArgs).toMatch(/staffId:\s*formData\.doctorId/);
      // Should NOT contain startDate/endDate (those exclude recurring)
      expect(callArgs).not.toMatch(/startDate:\s*formData\.date/);
      expect(callArgs).not.toMatch(/endDate:\s*formData\.date/);
    });

    it('AFC.A.2 collision check still uses checkAppointmentCollision', () => {
      expect(modalSrc).toMatch(/import\s+\{[^}]*checkAppointmentCollision/);
      expect(modalSrc).toMatch(/checkAppointmentCollision\s*\(/);
    });

    it('AFC.A.3 collision dialog includes source tag (งานประจำ vs งานรายวัน)', () => {
      // Helps the user understand WHY the doctor is flagged
      expect(modalSrc).toMatch(/check\.source/);
      expect(modalSrc).toMatch(/งานประจำ/);
      expect(modalSrc).toMatch(/งานรายวัน/);
    });

    it('AFC.A.4 collision is opt-in via skipStaffScheduleCheck flag', () => {
      expect(modalSrc).toMatch(/skipStaffScheduleCheck/);
      expect(modalSrc).toMatch(/!skipStaffScheduleCheck\s*&&\s*formData\.doctorId/);
    });

    it('AFC.A.5 confirm dialog text includes Thai message', () => {
      expect(modalSrc).toMatch(/แพทย์.*ในช่วงเวลาที่เลือก/);
      expect(modalSrc).toMatch(/ต้องการจองต่อหรือไม่/);
    });
  });

  describe('AFC.B — Runtime collision behavior with recurring entries', () => {
    // 2026-04-27 is a Monday (jsDow=1)
    const recurringMon = {
      id: 'r1', staffId: 'D-101', type: 'recurring',
      dayOfWeek: 1, startTime: '09:00', endTime: '17:00',
    };
    // Different staff — should not affect doctor D-101's check
    const recurringMonOther = {
      id: 'r2', staffId: 'D-999', type: 'recurring',
      dayOfWeek: 1, startTime: '08:00', endTime: '16:00',
    };
    const overrideLeave = {
      id: 'o1', staffId: 'D-101', type: 'leave', date: '2026-04-27',
    };
    const overrideHoliday = {
      id: 'o2', staffId: 'D-101', type: 'holiday', date: '2026-04-28',
    };

    it('AFC.B.1 doctor with recurring Mon 09-17, appointment Mon 10-11 → AVAILABLE', () => {
      const r = checkAppointmentCollision('D-101', '2026-04-27', '10:00', '11:00', [recurringMon]);
      expect(r.available).toBe(true);
      expect(r.source).toBe('recurring');
    });

    it('AFC.B.2 doctor with recurring Mon 09-17, appointment Mon 17:30-18:00 → BLOCKED นอกเวลา', () => {
      const r = checkAppointmentCollision('D-101', '2026-04-27', '17:30', '18:00', [recurringMon]);
      expect(r.available).toBe(false);
      expect(r.reason).toBe('นอกเวลาทำงาน');
    });

    it('AFC.B.3 doctor with recurring Mon + leave override that day → BLOCKED ลา (override wins)', () => {
      const r = checkAppointmentCollision('D-101', '2026-04-27', '10:00', '11:00',
        [recurringMon, overrideLeave]);
      expect(r.available).toBe(false);
      expect(r.reason).toBe('ลา');
      expect(r.source).toBe('override');
    });

    it('AFC.B.4 doctor with recurring Mon + holiday OTHER day → recurring wins on Mon', () => {
      // Holiday is on Tue (28) — Mon (27) should resolve to recurring
      const r = checkAppointmentCollision('D-101', '2026-04-27', '10:00', '11:00',
        [recurringMon, overrideHoliday]);
      expect(r.available).toBe(true);
      expect(r.source).toBe('recurring');
    });

    it('AFC.B.5 doctor with NO entries → assume available (legacy fallback)', () => {
      const r = checkAppointmentCollision('D-101', '2026-04-27', '10:00', '11:00', []);
      expect(r.available).toBe(true);
    });

    it('AFC.B.6 doctor recurring Mon, appointment on Sat (non-Mon) → no match → assume available', () => {
      // 2026-04-25 is Saturday — recurring Mon should not match
      const r = checkAppointmentCollision('D-101', '2026-04-25', '10:00', '11:00', [recurringMon]);
      expect(r.available).toBe(true);
      expect(r.entry).toBe(null);
    });

    it('AFC.B.7 other-staff entries are ignored (cross-staff isolation)', () => {
      // Doctor D-101 has no entries; D-999 has Mon 08-16
      const r = checkAppointmentCollision('D-101', '2026-04-27', '10:00', '11:00', [recurringMonOther]);
      expect(r.available).toBe(true);
      expect(r.entry).toBe(null);
    });

    it('AFC.B.8 multiple recurring shifts on same day (split shifts)', () => {
      // Morning + evening shift — appointment must fit one of them
      const morning = { id: 'm', staffId: 'D-101', type: 'recurring', dayOfWeek: 1, startTime: '08:00', endTime: '12:00' };
      const evening = { id: 'e', staffId: 'D-101', type: 'recurring', dayOfWeek: 1, startTime: '17:00', endTime: '21:00' };
      // 10:00-11:00 fits morning
      const r1 = checkAppointmentCollision('D-101', '2026-04-27', '10:00', '11:00', [morning, evening]);
      expect(r1.available).toBe(true);
      // 13:00-14:00 fits NEITHER → "นอกเวลาทำงาน"
      const r2 = checkAppointmentCollision('D-101', '2026-04-27', '13:00', '14:00', [morning, evening]);
      expect(r2.available).toBe(false);
      expect(r2.reason).toBe('นอกเวลาทำงาน');
      // 18:00-19:00 fits evening
      const r3 = checkAppointmentCollision('D-101', '2026-04-27', '18:00', '19:00', [morning, evening]);
      expect(r3.available).toBe(true);
    });
  });

  describe('AFC.C — Anti-regression: V21 source-grep prevents date-filter regression', () => {
    it('AFC.C.1 collision query passes ALL entries (no date filter)', () => {
      // Locked: future maintenance can't re-introduce the date filter
      // because the test asserts arg shape is { staffId } only.
      const callIdx = modalSrc.indexOf('listStaffSchedules({');
      const callArgs = modalSrc.slice(callIdx, callIdx + 200);
      // Match { staffId: formData.doctorId } with closing brace within 100 chars
      // of the open brace — meaning no other args.
      expect(callArgs).toMatch(/listStaffSchedules\(\{[^}]*staffId[^}]*\}\)/s);
    });

    it('AFC.C.2 staff schedule import includes listStaffSchedules', () => {
      expect(modalSrc).toMatch(/import\s+\{[^}]*listStaffSchedules/s);
    });
  });
});
