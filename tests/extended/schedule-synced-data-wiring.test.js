// ─── Phase 13.2.15 — Synced-data wiring E2E ───────────────────────────────
// SD group — verifies the FULL ProClinic → master_data → be_staff_schedules
// → 7-wiring-point chain. The user-demanded "100% wiring" coverage:
//   1. DoctorSchedulesTab calendar reads from be_staff_schedules
//   2. EmployeeSchedulesTab calendar reads from be_staff_schedules
//   3. TodaysDoctorsPanel uses getActiveSchedulesForDate(today)
//   4. AppointmentFormModal collision uses listStaffSchedules un-filtered
//   5. AppointmentTab today's-doctors derived from schedule (not appointments)
//   6. MasterDataTab sync button writes master_data/staff_schedules/items/*
//   7. MasterDataTab migrate button maps master_data → be_staff_schedules
//
// Strategy: pure-pipeline simulator (sync output → mapper → merger →
// effective entries) + source-grep regression guards on every consumer.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mapProClinicScheduleEvent,
} from '../api/proclinic/master.js';
import {
  mapMasterToBeStaffSchedule,
} from '../src/lib/backendClient.js';
import {
  mergeSchedulesForDate,
  checkAppointmentCollision,
  dayOfWeekFromDate,
} from '../src/lib/staffScheduleValidation.js';

// File reads for source-grep guards
const docTabSrc = readFileSync(resolve(__dirname, '..', 'src/components/backend/DoctorSchedulesTab.jsx'), 'utf-8');
const empTabSrc = readFileSync(resolve(__dirname, '..', 'src/components/backend/EmployeeSchedulesTab.jsx'), 'utf-8');
const apptTabSrc = readFileSync(resolve(__dirname, '..', 'src/components/backend/AppointmentCalendarView.jsx'), 'utf-8');
const apptModalSrc = readFileSync(resolve(__dirname, '..', 'src/components/backend/AppointmentFormModal.jsx'), 'utf-8');
const todaysPanelSrc = readFileSync(resolve(__dirname, '..', 'src/components/backend/scheduling/TodaysDoctorsPanel.jsx'), 'utf-8');
const masterTabSrc = readFileSync(resolve(__dirname, '..', 'src/components/backend/MasterDataTab.jsx'), 'utf-8');
const masterApiSrc = readFileSync(resolve(__dirname, '..', 'api/proclinic/master.js'), 'utf-8');
const brokerSrc = readFileSync(resolve(__dirname, '..', 'src/lib/brokerClient.js'), 'utf-8');
const clientSrc = readFileSync(resolve(__dirname, '..', 'src/lib/backendClient.js'), 'utf-8');

// Sample ProClinic FullCalendar events (verified shape from Phase 0 capture)
const PRO_EVENTS = [
  // Doctor 308 — recurring Tuesday 08:30-12:00
  { id: 'recurring-308-tuesday', title: '08:30-12:00 นาสาว เอ',
    rrule: { byweekday: 'tu' }, extendedProps: { type: 'recurring', user_id: 308 } },
  // Doctor 308 — recurring Wednesday 10:30-17:30
  { id: 'recurring-308-wednesday', title: '10:30-17:30 นาสาว เอ',
    rrule: { byweekday: 'we' }, extendedProps: { type: 'recurring', user_id: 308 } },
  // Doctor 609 — recurring Sunday 09:00-19:00
  { id: 'recurring-609-sunday', title: '09:00-19:00 กก ก้อง',
    rrule: { byweekday: 'su' }, extendedProps: { type: 'recurring', user_id: 609 } },
  // Per-date leave for Doctor 308 on 2026-04-29
  { id: 'leave-308-2026-04-29', title: 'ลา นาสาว เอ',
    start: '2026-04-29', extendedProps: { type: 'leave', user_id: 308 } },
  // Malformed (drops in mapper)
  { id: 'broken', title: 'X', extendedProps: { type: 'recurring' } },
];

// Resolve maps representing be_doctors / be_staff after Doctors-Staff sync
const DOCTOR_MAP = new Map([
  ['308', { id: '308', name: 'นาสาว An เอ (เอ)', type: 'doctor' }],
  ['609', { id: '609', name: 'กภ ก้อง', type: 'doctor' }],
]);
const STAFF_MAP = new Map([
  ['100', { id: '100', name: 'พนักงาน A', type: 'employee' }],
]);

// Pure pipeline simulator — replays the production chain without Firestore.
function runSyncedDataPipeline(events, doctorMap, staffMap, now) {
  // Step 1: ProClinic sync (mapper)
  const syncedItems = [];
  let dropped = 0;
  for (const e of events) {
    const m = mapProClinicScheduleEvent(e);
    if (m) syncedItems.push({ id: m.proClinicId, ...m });
    else dropped++;
  }

  // Step 2: master_data → be_staff_schedules migration
  const beEntries = [];
  const orphans = [];
  for (const src of syncedItems) {
    const proStaffId = String(src.proClinicStaffId);
    const match = doctorMap.get(proStaffId) || staffMap.get(proStaffId);
    if (!match) {
      orphans.push({ proClinicStaffId: proStaffId, proClinicStaffName: src.proClinicStaffName });
      continue;
    }
    const payload = mapMasterToBeStaffSchedule(src, match, now);
    if (payload) beEntries.push(payload);
  }

  return { syncedItems, dropped, beEntries, orphans };
}

describe('SD — Phase 13.2.15 synced-data wiring E2E', () => {
  describe('SD.A — Full pipeline simulator (events → master_data → be)', () => {
    const NOW = '2026-04-26T00:00:00.000Z';
    const result = runSyncedDataPipeline(PRO_EVENTS, DOCTOR_MAP, STAFF_MAP, NOW);

    it('SD.A.1 ProClinic sync drops 1 malformed event', () => {
      expect(result.syncedItems).toHaveLength(4);
      expect(result.dropped).toBe(1);
    });

    it('SD.A.2 migrator imports all matched entries', () => {
      expect(result.beEntries).toHaveLength(4);
      expect(result.orphans).toHaveLength(0);
    });

    it('SD.A.3 each be entry has OUR internal staffId (not proClinicStaffId echo)', () => {
      for (const e of result.beEntries) {
        expect(e.staffId).toBeTruthy();
        expect(e._proClinicStaffId).toBeTruthy();
        // V21-anti: staffName is text, never numeric
        expect(e.staffName).not.toMatch(/^\d+$/);
      }
    });

    it('SD.A.4 doc id = proClinicId (idempotent re-sync)', () => {
      const ids = result.beEntries.map((e) => e.id).sort();
      expect(ids).toEqual([
        'leave-308-2026-04-29',
        'recurring-308-tuesday',
        'recurring-308-wednesday',
        'recurring-609-sunday',
      ]);
    });

    it('SD.A.5 leave entry preserves date + null dayOfWeek', () => {
      const leave = result.beEntries.find((e) => e.type === 'leave');
      expect(leave.date).toBe('2026-04-29');
      expect(leave.dayOfWeek).toBe(null);
    });

    it('SD.A.6 _staffType correctly classifies doctor vs employee', () => {
      const all = result.beEntries;
      // All these proClinicStaffIds are in DOCTOR_MAP, none in STAFF_MAP
      for (const e of all) expect(e._staffType).toBe('doctor');

      // Add a staff schedule + re-run
      const staffEvents = [
        { id: 'recurring-100-monday', title: '09:00-17:00 พนักงาน A',
          rrule: { byweekday: 'mo' }, extendedProps: { type: 'recurring', user_id: 100 } },
      ];
      const staffResult = runSyncedDataPipeline(staffEvents, DOCTOR_MAP, STAFF_MAP, NOW);
      expect(staffResult.beEntries[0]._staffType).toBe('employee');
    });

    it('SD.A.7 orphan reporting when proClinicStaffId not in doctor/staff maps', () => {
      const unknownEvents = [
        { id: 'recurring-9999-monday', title: '09:00-17:00 ?',
          rrule: { byweekday: 'mo' }, extendedProps: { type: 'recurring', user_id: 9999 } },
      ];
      const r = runSyncedDataPipeline(unknownEvents, DOCTOR_MAP, STAFF_MAP, NOW);
      expect(r.beEntries).toHaveLength(0);
      expect(r.orphans).toHaveLength(1);
      expect(r.orphans[0].proClinicStaffId).toBe('9999');
    });
  });

  describe('SD.B — Wiring point #1: DoctorSchedulesTab reads be_staff_schedules', () => {
    const NOW = '2026-04-26T00:00:00.000Z';
    const result = runSyncedDataPipeline(PRO_EVENTS, DOCTOR_MAP, STAFF_MAP, NOW);
    const beEntries = result.beEntries;

    it('SD.B.1 calendar mergeSchedulesForDate produces effective entries on Tuesday', () => {
      // 2026-04-28 is Tuesday — expect doctor 308 recurring Tuesday entry
      const merged = mergeSchedulesForDate('2026-04-28', beEntries);
      expect(merged.length).toBeGreaterThan(0);
      const tuesdayDoctor = merged.find((m) => m.staffId === '308');
      expect(tuesdayDoctor).toBeTruthy();
      expect(tuesdayDoctor.startTime).toBe('08:30');
      expect(tuesdayDoctor.endTime).toBe('12:00');
    });

    it('SD.B.2 leave override wins on 2026-04-29 (Wed)', () => {
      // 2026-04-29 is Wednesday — doctor 308 has BOTH recurring Wed shift AND leave override
      const merged = mergeSchedulesForDate('2026-04-29', beEntries);
      const doctor308 = merged.find((m) => m.staffId === '308');
      expect(doctor308.type).toBe('leave');  // override wins
      expect(doctor308.source).toBe('override');
    });

    it('SD.B.3 calendar shows ALL doctors (not filtered to selected)', () => {
      // 2026-04-28 has only doctor 308; 2026-04-26 (Sun) has only 609
      const sunday = mergeSchedulesForDate('2026-04-26', beEntries);
      expect(sunday[0].staffId).toBe('609');
      expect(sunday[0].startTime).toBe('09:00');
    });

    it('SD.B.4 DoctorSchedulesTab source-grep: loads listStaffSchedules() un-filtered', () => {
      // The calendar must load ALL schedules (not filtered by selectedDoctorId)
      const idx = docTabSrc.indexOf('const all = await listStaffSchedules');
      expect(idx).toBeGreaterThan(0);
      const ctx = docTabSrc.slice(idx, idx + 400);
      expect(ctx).toMatch(/listStaffSchedules\(\)/);  // no args
    });
  });

  describe('SD.C — Wiring point #2: EmployeeSchedulesTab parallel structure', () => {
    it('SD.C.1 EmployeeSchedulesTab loads listStaffSchedules() un-filtered', () => {
      const idx = empTabSrc.indexOf('const all = await listStaffSchedules');
      expect(idx).toBeGreaterThan(0);
      const ctx = empTabSrc.slice(idx, idx + 400);
      expect(ctx).toMatch(/listStaffSchedules\(\)/);
    });

    it('SD.C.2 EmployeeSchedulesTab filters via staffIdSet (be_staff)', () => {
      expect(empTabSrc).toMatch(/staffIdSet/);
      expect(empTabSrc).toMatch(/staffIdSet\.has\(String\(e\.staffId\)\)/);
    });
  });

  describe('SD.D — Wiring point #3: TodaysDoctorsPanel reads schedule', () => {
    it('SD.D.1 panel filters to working types only (recurring/work/halfday)', () => {
      expect(todaysPanelSrc).toMatch(/['"]recurring['"]/);
      expect(todaysPanelSrc).toMatch(/['"]work['"]/);
      expect(todaysPanelSrc).toMatch(/['"]halfday['"]/);
      // Excludes leave/sick/holiday
      expect(todaysPanelSrc).not.toMatch(/s\.type\s*===\s*['"]leave['"]\)\s*\.map/);
    });

    it('SD.D.2 panel cross-references against doctors list (NOT all staff)', () => {
      expect(todaysPanelSrc).toMatch(/doctors\.find/);
      expect(todaysPanelSrc).toMatch(/doctorId/);
    });

    it('SD.D.3 AppointmentTab subscribes via listenToScheduleByDay', () => {
      expect(apptTabSrc).toMatch(/listenToScheduleByDay/);
    });

    it('SD.D.4 AppointmentTab loads listDoctors for cross-reference', () => {
      expect(apptTabSrc).toMatch(/listDoctors/);
    });
  });

  describe('SD.E — Wiring point #4: AppointmentFormModal collision uses recurring', () => {
    it('SD.E.1 collision check uses listStaffSchedules without date filter', () => {
      // V21-anti: previous filter dropped recurring entries. Must load
      // ALL staff entries so checkAppointmentCollision → mergeSchedulesForDate
      // can see recurring shifts.
      const callIdx = apptModalSrc.indexOf('listStaffSchedules({');
      const callArgs = apptModalSrc.slice(callIdx, callIdx + 200);
      expect(callArgs).not.toMatch(/startDate:/);
      expect(callArgs).not.toMatch(/endDate:/);
    });

    it('SD.E.2 runtime: recurring shift collision check', () => {
      const NOW = '2026-04-26T00:00:00.000Z';
      const result = runSyncedDataPipeline(PRO_EVENTS, DOCTOR_MAP, STAFF_MAP, NOW);
      const doctor308Entries = result.beEntries.filter((e) => e.staffId === '308');

      // 2026-04-28 (Tue) at 09:00-10:00 → within 08:30-12:00 → AVAILABLE
      const r1 = checkAppointmentCollision('308', '2026-04-28', '09:00', '10:00', doctor308Entries);
      expect(r1.available).toBe(true);

      // 2026-04-29 (Wed) — leave override wins → BLOCKED ลา
      const r2 = checkAppointmentCollision('308', '2026-04-29', '11:00', '12:00', doctor308Entries);
      expect(r2.available).toBe(false);
      expect(r2.reason).toBe('ลา');
    });
  });

  describe('SD.F — Wiring point #5: AppointmentTab subtitle uses schedule', () => {
    it('SD.F.1 header subtitle reads from todaysSchedules (NOT dayDoctors derived from appointments)', () => {
      expect(apptTabSrc).toMatch(/data-testid=['"]appt-doctors-count-header['"]/);
      const idx = apptTabSrc.indexOf('appt-doctors-count-header');
      const ctx = apptTabSrc.slice(idx, idx + 400);
      expect(ctx).toMatch(/todaysSchedules\.filter/);
      // V21-anti: ensure dayDoctors-based panel render is removed
      expect(apptTabSrc).not.toMatch(/แพทย์เข้าตรวจ\s*\{dayDoctors\.length\}\s*คน/);
    });
  });

  describe('SD.G — Wiring point #6: MasterDataTab sync button wired', () => {
    it('SD.G.1 master.js dispatcher case + handler', () => {
      expect(masterApiSrc).toMatch(/case\s+['"]syncSchedules['"]:\s*return\s+await\s+handleSyncSchedules/);
      expect(masterApiSrc).toMatch(/async\s+function\s+handleSyncSchedules/);
    });

    it('SD.G.2 brokerClient wrapper exists', () => {
      expect(brokerSrc).toMatch(/export\s+function\s+syncSchedules\s*\(/);
    });

    it('SD.G.3 MasterDataTab SYNC_TYPES has staff_schedules entry', () => {
      expect(masterTabSrc).toMatch(/key:\s*['"]staff_schedules['"][^}]*fn:\s*syncSchedules/s);
    });
  });

  describe('SD.H — Wiring point #7: MasterDataTab migrate button wired', () => {
    it('SD.H.1 backendClient exports migrateMasterStaffSchedulesToBe', () => {
      expect(clientSrc).toMatch(/export\s+async\s+function\s+migrateMasterStaffSchedulesToBe/);
    });

    it('SD.H.2 MasterDataTab MIGRATE_TARGETS has staff_schedules entry', () => {
      expect(masterTabSrc).toMatch(/key:\s*['"]staff_schedules['"][^}]*fn:\s*migrateMasterStaffSchedulesToBe/s);
    });

    it('SD.H.3 migrator wired writes to be_staff_schedules collection', () => {
      const idx = clientSrc.indexOf('migrateMasterStaffSchedulesToBe');
      const fn = clientSrc.slice(idx, idx + 6000);
      expect(fn).toMatch(/setDoc\(staffScheduleDocRef\(/);
    });
  });

  describe('SD.I — End-to-end pipeline integrity', () => {
    it('SD.I.1 dayOfWeekFromDate matches mapped dayOfWeek for sample dates', () => {
      // Verify the mapping ProClinic byweekday → dayOfWeekFromDate alignment
      // 2026-04-28 is Tuesday → ProClinic 'tu' → dayOfWeek=2
      expect(dayOfWeekFromDate('2026-04-28')).toBe(2);
      // 2026-04-29 is Wed → 'we' → 3
      expect(dayOfWeekFromDate('2026-04-29')).toBe(3);
      // 2026-04-26 is Sun → 'su' → 0
      expect(dayOfWeekFromDate('2026-04-26')).toBe(0);
    });

    it('SD.I.2 full pipeline → calendar rendering: cell on 2026-04-28 has Tuesday entry', () => {
      const NOW = '2026-04-26T00:00:00.000Z';
      const { beEntries } = runSyncedDataPipeline(PRO_EVENTS, DOCTOR_MAP, STAFF_MAP, NOW);
      const tuesday = mergeSchedulesForDate('2026-04-28', beEntries);
      expect(tuesday).toHaveLength(1);
      expect(tuesday[0].staffName).toBe('นาสาว An เอ (เอ)'); // OUR resolved name, not ProClinic raw
      expect(tuesday[0].source).toBe('recurring');
    });

    it('SD.I.3 full pipeline → today\'s-doctors panel data shape', () => {
      const NOW = '2026-04-26T00:00:00.000Z';
      const { beEntries } = runSyncedDataPipeline(PRO_EVENTS, DOCTOR_MAP, STAFF_MAP, NOW);
      // 2026-04-26 (Sunday) — only doctor 609 working
      const sunday = mergeSchedulesForDate('2026-04-26', beEntries);
      const working = sunday.filter((s) => s.type === 'recurring' || s.type === 'work' || s.type === 'halfday');
      expect(working).toHaveLength(1);
      expect(working[0].staffId).toBe('609');
      expect(working[0].staffName).toBe('กภ ก้อง');
    });

    it('SD.I.4 full pipeline → collision check on synced data', () => {
      const NOW = '2026-04-26T00:00:00.000Z';
      const { beEntries } = runSyncedDataPipeline(PRO_EVENTS, DOCTOR_MAP, STAFF_MAP, NOW);
      // Doctor 609 on Sunday 09:00-19:00 → appointment 10:00-11:00 OK
      const r = checkAppointmentCollision('609', '2026-04-26', '10:00', '11:00', beEntries);
      expect(r.available).toBe(true);
      expect(r.source).toBe('recurring');
    });
  });
});
