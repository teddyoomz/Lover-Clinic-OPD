// ─── Phase 13.2.13 — ProClinic schedule sync tests ────────────────────────
// SC group — verifies the sync pipeline:
//   - mapProClinicScheduleEvent normalizes FullCalendar events into our
//     master_data shape (recurring + override + leave).
//   - byweekday code → JS dayOfWeek mapping (mo/tu/we/th/fr/sa/su → 1-6,0)
//   - title parser ("HH:MM-HH:MM <name>") extracts the 3 fields
//   - Malformed events drop silently (returns null), counted in `dropped`
//   - master.js dispatcher + brokerClient + MasterDataTab all wired
//
// Source-grep regression guards lock the wiring shape so refactor
// doesn't silently break the sync chain.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mapProClinicScheduleEvent } from '../api/proclinic/master.js';

const masterSrc = readFileSync(
  resolve(__dirname, '..', 'api/proclinic/master.js'),
  'utf-8'
);
const brokerSrc = readFileSync(
  resolve(__dirname, '..', 'src/lib/brokerClient.js'),
  'utf-8'
);
const tabSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/MasterDataTab.jsx'),
  'utf-8'
);

// Sample ProClinic FullCalendar event (verified shape from opd.js capture)
const SAMPLE_RECURRING_TUE = {
  id: 'recurring-308-tuesday',
  title: '08:30-12:00 นาสาว เอ',
  rrule: { freq: 'weekly', byweekday: 'tu', dtstart: '2025-01-01', until: '2027-12-31' },
  exdate: [],
  backgroundColor: '#FF6A9C',
  extendedProps: {
    type: 'recurring',
    user_id: 308,
    eventColor: '#F6DA09',
    backgroundColor: '#FF6A9C',
    textColor: 'black',
  },
};

const SAMPLE_RECURRING_SUN = {
  id: 'recurring-609-sunday',
  title: '09:00-19:00 กก ก้อง',
  rrule: { freq: 'weekly', byweekday: 'su' },
  extendedProps: { type: 'recurring', user_id: 609 },
};

const SAMPLE_PER_DATE_LEAVE = {
  id: 'leave-308-2026-04-29',
  title: 'ลา นาสาว เอ',
  start: '2026-04-29',
  extendedProps: { type: 'leave', user_id: 308 },
};

describe('SC — Phase 13.2.13 ProClinic schedule sync', () => {
  describe('SC.A — mapProClinicScheduleEvent: byweekday → JS dayOfWeek', () => {
    it('SC.A.1 mo → 1 (Monday)', () => {
      const m = mapProClinicScheduleEvent({
        id: 'r-1-mo', title: '09:00-17:00 X',
        rrule: { byweekday: 'mo' },
        extendedProps: { type: 'recurring', user_id: 1 },
      });
      expect(m.dayOfWeek).toBe(1);
    });

    it('SC.A.2 tu → 2 (Tuesday)', () => {
      const m = mapProClinicScheduleEvent(SAMPLE_RECURRING_TUE);
      expect(m.dayOfWeek).toBe(2);
    });

    it('SC.A.3 su → 0 (Sunday)', () => {
      const m = mapProClinicScheduleEvent(SAMPLE_RECURRING_SUN);
      expect(m.dayOfWeek).toBe(0);
    });

    it('SC.A.4 case-insensitive: TU → 2', () => {
      const m = mapProClinicScheduleEvent({
        id: 'r-1-TU', title: '09:00-17:00 X',
        rrule: { byweekday: 'TU' },
        extendedProps: { type: 'recurring', user_id: 1 },
      });
      expect(m.dayOfWeek).toBe(2);
    });

    it('SC.A.5 unknown byweekday → returns null (dropped)', () => {
      expect(mapProClinicScheduleEvent({
        id: 'r-1-xx', title: '09:00-17:00 X',
        rrule: { byweekday: 'xx' },
        extendedProps: { type: 'recurring', user_id: 1 },
      })).toBe(null);
    });

    it('SC.A.6 missing rrule → returns null', () => {
      expect(mapProClinicScheduleEvent({
        id: 'r-1', title: '09:00-17:00 X',
        extendedProps: { type: 'recurring', user_id: 1 },
      })).toBe(null);
    });
  });

  describe('SC.B — title parser', () => {
    it('SC.B.1 "08:30-12:00 นาสาว เอ" → start, end, name', () => {
      const m = mapProClinicScheduleEvent(SAMPLE_RECURRING_TUE);
      expect(m.startTime).toBe('08:30');
      expect(m.endTime).toBe('12:00');
      expect(m.proClinicStaffName).toBe('นาสาว เอ');
    });

    it('SC.B.2 single-digit hour "9:00-17:00 X" → padded "09:00"', () => {
      const m = mapProClinicScheduleEvent({
        id: 'r-1-mo', title: '9:00-17:00 X',
        rrule: { byweekday: 'mo' },
        extendedProps: { type: 'recurring', user_id: 1 },
      });
      expect(m.startTime).toBe('09:00');
      expect(m.endTime).toBe('17:00');
    });

    it('SC.B.3 multi-word name "10:00-14:00 หมอ ฟ้า ใหญ่" → full name', () => {
      const m = mapProClinicScheduleEvent({
        id: 'r-2-mo', title: '10:00-14:00 หมอ ฟ้า ใหญ่',
        rrule: { byweekday: 'mo' },
        extendedProps: { type: 'recurring', user_id: 2 },
      });
      expect(m.proClinicStaffName).toBe('หมอ ฟ้า ใหญ่');
    });

    it('SC.B.4 unrecognized title → name fallback to title trimmed', () => {
      const m = mapProClinicScheduleEvent({
        id: 'r-3-mo', title: 'Notitle',
        rrule: { byweekday: 'mo' },
        extendedProps: { type: 'recurring', user_id: 3 },
      });
      expect(m.proClinicStaffName).toBe('Notitle');
      expect(m.startTime).toBe('');
      expect(m.endTime).toBe('');
    });
  });

  describe('SC.C — Per-date entries (override / leave / sick)', () => {
    it('SC.C.1 leave entry maps date + type', () => {
      const m = mapProClinicScheduleEvent(SAMPLE_PER_DATE_LEAVE);
      expect(m).toBeTruthy();
      expect(m.type).toBe('leave');
      expect(m.date).toBe('2026-04-29');
      expect(m.dayOfWeek).toBe(null);
    });

    it('SC.C.2 per-date entry without start → null', () => {
      expect(mapProClinicScheduleEvent({
        id: 'leave-1', title: 'ลา X',
        extendedProps: { type: 'leave', user_id: 1 },
      })).toBe(null);
    });

    it('SC.C.3 ISO date with timestamp suffix → strips to YYYY-MM-DD', () => {
      const m = mapProClinicScheduleEvent({
        id: 'leave-1-2026-04-29', title: 'ลา X',
        start: '2026-04-29T08:00:00',
        extendedProps: { type: 'leave', user_id: 1 },
      });
      expect(m.date).toBe('2026-04-29');
    });
  });

  describe('SC.D — Defensive shape handling', () => {
    it('SC.D.1 null input → null', () => {
      expect(mapProClinicScheduleEvent(null)).toBe(null);
    });

    it('SC.D.2 missing user_id → null', () => {
      expect(mapProClinicScheduleEvent({
        id: 'r-1-mo', title: '09:00-17:00 X',
        rrule: { byweekday: 'mo' },
        extendedProps: { type: 'recurring' },
      })).toBe(null);
    });

    it('SC.D.3 numeric user_id coerced to string', () => {
      const m = mapProClinicScheduleEvent(SAMPLE_RECURRING_TUE);
      expect(typeof m.proClinicStaffId).toBe('string');
      expect(m.proClinicStaffId).toBe('308');
    });

    it('SC.D.4 missing extendedProps.type → defaults to recurring', () => {
      const m = mapProClinicScheduleEvent({
        id: 'r-1-mo', title: '09:00-17:00 X',
        rrule: { byweekday: 'mo' },
        extendedProps: { user_id: 1 },
      });
      expect(m.type).toBe('recurring');
      expect(m.dayOfWeek).toBe(1);
    });

    it('SC.D.5 preserves backgroundColor + textColor for visual carry-over', () => {
      const m = mapProClinicScheduleEvent(SAMPLE_RECURRING_TUE);
      expect(m.backgroundColor).toBe('#FF6A9C');
      expect(m.textColor).toBe('black');
    });
  });

  describe('SC.E — Source-grep wiring (master.js + brokerClient + MasterDataTab)', () => {
    it('SC.E.1 master.js dispatcher has case syncSchedules', () => {
      expect(masterSrc).toMatch(/case\s+['"]syncSchedules['"]:\s*return\s+await\s+handleSyncSchedules/);
    });

    it('SC.E.2 master.js handleSyncSchedules hits BOTH /admin/api/schedule/{แพทย์,พนักงาน} (V24 fix)', () => {
      // V24 (2026-04-26) — earlier code hit /admin/api/schedule/today which
      // returned only doctor entries (or some legacy default). Fix uses two
      // explicit role-based endpoints in parallel.
      expect(masterSrc).toMatch(/encodeURIComponent\(['"]แพทย์['"]\)/);
      expect(masterSrc).toMatch(/encodeURIComponent\(['"]พนักงาน['"]\)/);
      expect(masterSrc).toMatch(/session\.fetchJSON/);
      // The legacy /today URL must NOT remain in CODE (allowed in comments
      // for institutional memory). Anti-regression for V24.
      const noCommentSrc = masterSrc
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      expect(noCommentSrc).not.toMatch(/['"`].*\/admin\/api\/schedule\/today.*['"`]/);
    });

    it('SC.E.3 master.js returns shape { success, type, count, totalPages, rawDoctor, rawEmployee, items }', () => {
      const idx = masterSrc.indexOf('handleSyncSchedules');
      const fn = masterSrc.slice(idx, idx + 3500);
      expect(fn).toMatch(/success:\s*true/);
      expect(fn).toMatch(/type:\s*['"]staff_schedules['"]/);
      expect(fn).toMatch(/count:\s*items\.length/);
      expect(fn).toMatch(/items,/);
      // V24 — both raw counts surfaced for diagnostics
      expect(fn).toMatch(/rawDoctor:/);
      expect(fn).toMatch(/rawEmployee:/);
    });

    it('SC.E.4 master.js exports mapProClinicScheduleEvent for tests', () => {
      expect(masterSrc).toMatch(/export\s+function\s+mapProClinicScheduleEvent/);
    });

    it('SC.E.5 brokerClient exports syncSchedules wrapper', () => {
      expect(brokerSrc).toMatch(/export\s+function\s+syncSchedules\s*\(/);
      expect(brokerSrc).toMatch(/apiFetch\(\s*['"]master['"],\s*\{\s*action:\s*['"]syncSchedules['"]/);
    });

    it('SC.E.6 MasterDataTab imports + registers syncSchedules', () => {
      expect(tabSrc).toMatch(/import[^;]*\bsyncSchedules\b/s);
      expect(tabSrc).toMatch(/key:\s*['"]staff_schedules['"][^}]*fn:\s*syncSchedules/s);
    });

    it('SC.E.7 MasterDataTab button has Thai label "ตารางหมอ + พนักงาน"', () => {
      expect(tabSrc).toMatch(/label:\s*['"]ตารางหมอ \+ พนักงาน['"]/);
    });

    it('SC.E.8 dev-only marker on schedule sync handler (rule H-bis)', () => {
      const idx = masterSrc.indexOf('Phase 13.2.13');
      // 1500-char window covers the multi-line comment block + the
      // function declaration that follows.
      const ctx = masterSrc.slice(idx, idx + 1500);
      expect(ctx).toMatch(/@dev-only/);
      expect(ctx).toMatch(/STRIP BEFORE PRODUCTION RELEASE/);
    });
  });

  describe('SC.F — Integration: mapProClinicScheduleEvent on real-world payload', () => {
    it('SC.F.1 sample 4-entry payload yields 3 valid + 1 dropped', () => {
      const payload = [
        SAMPLE_RECURRING_TUE,
        SAMPLE_RECURRING_SUN,
        SAMPLE_PER_DATE_LEAVE,
        // 4th: malformed — should drop
        { id: 'broken', title: 'X', extendedProps: { type: 'recurring' } },
      ];
      const items = [];
      let dropped = 0;
      for (const e of payload) {
        const m = mapProClinicScheduleEvent(e);
        if (m) items.push(m);
        else dropped++;
      }
      expect(items).toHaveLength(3);
      expect(dropped).toBe(1);
      // Each item has the canonical shape for master_data
      for (const it of items) {
        expect(it).toHaveProperty('proClinicStaffId');
        expect(it).toHaveProperty('proClinicStaffName');
        expect(it).toHaveProperty('type');
      }
    });
  });

  // ─── V24 (2026-04-26) — Bug: sync only returned doctor data, employee empty ──
  // User report: "ตอนนี้ทำไม sync หรือ นำเข้า ตารางมาได้แค่แพทย์
  // ช่องตารางพนักงานเหมือนไม่มีข้อมูลเลย".
  // Root cause: code used /admin/api/schedule/today; ProClinic actually exposes
  // two separate FullCalendar feeds — /admin/api/schedule/แพทย์ +
  // /admin/api/schedule/พนักงาน — each scoped to one role.
  describe('SC.G — V24 (2026-04-26): two-endpoint parallel fetch', () => {
    it('SC.G.1 buildScheduleDateRange helper exists with start+end query params', () => {
      // Helper builds the FullCalendar feed window; recurring entries return
      // regardless of range, but per-date entries (override/leave) are
      // window-bound.
      expect(masterSrc).toMatch(/function\s+buildScheduleDateRange\s*\(/);
      expect(masterSrc).toMatch(/start=\$\{encodeURIComponent/);
      expect(masterSrc).toMatch(/end=\$\{encodeURIComponent/);
    });

    it('SC.G.2 date range covers > 6 months (180d back, 365d forward)', () => {
      const idx = masterSrc.indexOf('function buildScheduleDateRange');
      const fn = masterSrc.slice(idx, idx + 800);
      // Must look back AT LEAST 90 days and forward AT LEAST 180 days
      expect(fn).toMatch(/setDate\(start\.getDate\(\)\s*-\s*180\)/);
      expect(fn).toMatch(/setDate\(end\.getDate\(\)\s*\+\s*365\)/);
      // Bangkok timezone offset
      expect(fn).toMatch(/\+07:00/);
    });

    it('SC.G.3 both endpoints fetched via Promise.all (parallel, not serial)', () => {
      const idx = masterSrc.indexOf('handleSyncSchedules');
      const fn = masterSrc.slice(idx, idx + 3500);
      expect(fn).toMatch(/Promise\.all/);
      expect(fn).toMatch(/doctorUrl/);
      expect(fn).toMatch(/employeeUrl/);
    });

    it('SC.G.4 each fetch has .catch(()=>null) so one failure does not block the other', () => {
      // Resilient fetch — if one endpoint times out / 5xx, the other still
      // delivers data. Per-array null-check below converts to []. This
      // matches V19/V21 lesson: silent-fail-safe but not silent-bug.
      const idx = masterSrc.indexOf('handleSyncSchedules');
      const fn = masterSrc.slice(idx, idx + 3500);
      // Both fetch lines should have .catch(()=>null) suffix
      const catches = fn.match(/\.catch\(\(\)\s*=>\s*null\)/g) || [];
      expect(catches.length).toBeGreaterThanOrEqual(2);
    });

    it('SC.G.5 throws ONLY when BOTH endpoints fail (returns non-array)', () => {
      const idx = masterSrc.indexOf('handleSyncSchedules');
      const fn = masterSrc.slice(idx, idx + 3500);
      // Guard: !Array.isArray(doctorData) && !Array.isArray(employeeData) → throw
      expect(fn).toMatch(/!Array\.isArray\(doctorData\)\s*&&\s*!Array\.isArray\(employeeData\)/);
      expect(fn).toMatch(/throw new Error/);
    });

    it('SC.G.6 dedup by proClinicId via Set (defensive against overlap)', () => {
      const idx = masterSrc.indexOf('handleSyncSchedules');
      const fn = masterSrc.slice(idx, idx + 3500);
      expect(fn).toMatch(/seen\.has\(norm\.proClinicId\)/);
      expect(fn).toMatch(/seen\.add\(norm\.proClinicId\)/);
    });

    it('SC.G.7 V24 marker comment present (institutional memory)', () => {
      // Future maintainers should be able to grep for "V24" and find this
      // bug's lesson without context-switching to the violation log.
      expect(masterSrc).toMatch(/V24/);
    });
  });
});
