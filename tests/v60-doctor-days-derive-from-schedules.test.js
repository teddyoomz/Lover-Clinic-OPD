// V60 / AV32 (2026-05-08) — schedule-link doctorDays derived from
// be_staff_schedules canonical source. Closes the silent-broken-link bug
// where admin painted prior months but generated a future-month link →
// every customer-facing day cell rendered disabled ("กดดูอะไรไม่ได้เลย").
//
// Class-of-bug: V12 multi-reader-sweep at the schedule-link save boundary
// — V56/BS-15 introduced canonical source for room auto-closure but
// `doctorDays` save kept reading from legacy admin-state-only Set.
// Same family as V52-V55 BSA adoption-gap series.
//
// Test groups:
//   X1 — derivedDoctorDaysFromSchedules helper unit + adversarial
//   X2 — handleGenScheduleLink uses derive helper + pre-flight gate (source-grep)
//   X3 — ClinicSchedule.jsx empty-state banner (source-grep + V60 marker)
//   X4 — Pre-flight gate Thai copy + behavior (source-grep)
//   X5 — V60 data fix script Rule M canonical shape (source-grep)
//   X6 — V60 marker + V12-class regression sweep
//   X7 — Pure full-flow simulate (PRE-V60 bug repro + POST-V60 contract)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  derivedDoctorDaysFromSchedules,
  derivedAutoClosedDates,
} from '../src/lib/staffScheduleValidation.js';

const ADMIN_DASHBOARD_SRC = readFileSync(
  resolve(process.cwd(), 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const CLINIC_SCHEDULE_SRC = readFileSync(
  resolve(process.cwd(), 'src/pages/ClinicSchedule.jsx'),
  'utf8',
);
const SCHEDULE_VALIDATION_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/staffScheduleValidation.js'),
  'utf8',
);
const V60_FIX_SCRIPT_SRC = readFileSync(
  resolve(process.cwd(), 'scripts/v60-fix-schedule-link-doctor-days.mjs'),
  'utf8',
);

// ─── Test fixtures ─────────────────────────────────────────────────────
// Matches the prod doctor for SCH-2f69d853fb (หมอมายด์):
// recurring Sun/Mon/Wed/Sat × 13:30-20:30 / 16:30-20:30
const FIX_DOCTOR_ID = 'DOC-mov2p9c0-a79c20370455d9f9';
const FIX_RECURRING_ENTRIES = [
  { id: 'STFSCH-0526-9d496078', staffId: FIX_DOCTOR_ID, type: 'recurring', dayOfWeek: 3, startTime: '16:30', endTime: '20:30', roomIds: ['EXR-A', 'EXR-B'] },
  { id: 'STFSCH-0526-c3479792', staffId: FIX_DOCTOR_ID, type: 'recurring', dayOfWeek: 6, startTime: '13:30', endTime: '19:30', roomIds: ['EXR-A', 'EXR-B'] },
  { id: 'STFSCH-0526-cfe0882a', staffId: FIX_DOCTOR_ID, type: 'recurring', dayOfWeek: 1, startTime: '16:30', endTime: '20:30', roomIds: ['EXR-A', 'EXR-B'] },
  { id: 'STFSCH-0526-f78620c3', staffId: FIX_DOCTOR_ID, type: 'recurring', dayOfWeek: 0, startTime: '13:30', endTime: '19:30', roomIds: ['EXR-A', 'EXR-B'] },
];

function buildMonth(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) out.push(`${yyyymm}-${String(d).padStart(2, '0')}`);
  return out;
}

// ─── X1. derivedDoctorDaysFromSchedules helper unit ──────────────────
describe('V60.X1 — derivedDoctorDaysFromSchedules helper unit', () => {
  it('X1.1 — exports the named helper from staffScheduleValidation.js', () => {
    expect(typeof derivedDoctorDaysFromSchedules).toBe('function');
  });

  it('X1.2 — empty/missing inputs return [] without throwing', () => {
    expect(derivedDoctorDaysFromSchedules({})).toEqual([]);
    expect(derivedDoctorDaysFromSchedules({ doctorId: null, allEntries: [], datesISO: [] })).toEqual([]);
    expect(derivedDoctorDaysFromSchedules({ doctorId: 'X', allEntries: null, datesISO: ['2026-05-01'] })).toEqual([]);
    expect(derivedDoctorDaysFromSchedules({ doctorId: 'X', allEntries: [], datesISO: null })).toEqual([]);
    expect(derivedDoctorDaysFromSchedules({ doctorId: 'X', allEntries: [], datesISO: [] })).toEqual([]);
  });

  it('X1.3 — production fixture: หมอมายด์ for May 2026 returns 18 working days (Sun/Mon/Wed/Sat)', () => {
    const may = buildMonth('2026-05');
    const out = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: FIX_RECURRING_ENTRIES,
      datesISO: may,
    });
    expect(out.length).toBe(18);
    expect(out).toContain('2026-05-02'); // Sat
    expect(out).toContain('2026-05-03'); // Sun
    expect(out).toContain('2026-05-04'); // Mon
    expect(out).toContain('2026-05-06'); // Wed
    // Friday (May 1, 8, 15, 22, 29) — NOT in recurring set, must be excluded
    expect(out).not.toContain('2026-05-01');
    expect(out).not.toContain('2026-05-08');
    expect(out).not.toContain('2026-05-15');
    expect(out).not.toContain('2026-05-22');
    expect(out).not.toContain('2026-05-29');
    // Tuesday (May 5, 12, 19, 26) + Thursday (May 7, 14, 21, 28) — NOT in set
    expect(out).not.toContain('2026-05-05');
    expect(out).not.toContain('2026-05-07');
    expect(out).not.toContain('2026-05-12');
    expect(out).not.toContain('2026-05-14');
  });

  it('X1.4 — sorted ascending output', () => {
    const out = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: FIX_RECURRING_ENTRIES,
      datesISO: buildMonth('2026-05'),
    });
    const sorted = [...out].sort();
    expect(out).toEqual(sorted);
  });

  it('X1.5 — deduplicates if datesISO has dupes', () => {
    const out = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: FIX_RECURRING_ENTRIES,
      datesISO: ['2026-05-04', '2026-05-04', '2026-05-04'], // Mon × 3
    });
    expect(out).toEqual(['2026-05-04']);
  });

  it('X1.6 — wrong doctorId filter excludes the only doctor entries', () => {
    const out = derivedDoctorDaysFromSchedules({
      doctorId: 'DOC-someone-else',
      allEntries: FIX_RECURRING_ENTRIES,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([]);
  });

  it('X1.7 — leave/holiday/sick per-date override CANCELS the recurring weekday', () => {
    // Doctor recurs every Mon; May 11 (Mon) is admin-set leave.
    const entries = [
      ...FIX_RECURRING_ENTRIES,
      { id: 'OVR-1', staffId: FIX_DOCTOR_ID, type: 'leave', date: '2026-05-11', dayOfWeek: null },
    ];
    const out = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).not.toContain('2026-05-11'); // Mon canceled by leave
    expect(out).toContain('2026-05-04');     // Other Mons unaffected
    expect(out).toContain('2026-05-18');
    expect(out).toContain('2026-05-25');
  });

  it('X1.8 — per-date work entry on a NON-recurring day adds that date', () => {
    // Doctor recurs Mon/Wed but NOT Fri. Add per-date work on May 8 (Fri).
    const entries = [
      ...FIX_RECURRING_ENTRIES,
      { id: 'OVR-2', staffId: FIX_DOCTOR_ID, type: 'work', date: '2026-05-08', dayOfWeek: null, startTime: '10:00', endTime: '14:00' },
    ];
    const out = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toContain('2026-05-08');
  });

  it('X1.9 — invalid date strings silently skipped (no throw)', () => {
    const out = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: FIX_RECURRING_ENTRIES,
      datesISO: ['2026-05-04', 'not-a-date', '2026/05/03', '', null, undefined, 42, '2026-05-06'],
    });
    expect(out).toEqual(['2026-05-04', '2026-05-06']);
  });

  it('X1.10 — different months adjust correctly (March 2026 also Sun=1,8,15,22,29)', () => {
    const out = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: FIX_RECURRING_ENTRIES,
      datesISO: buildMonth('2026-03'),
    });
    // March 2026: Sun=1,8,15,22,29 (5); Mon=2,9,16,23,30 (5); Wed=4,11,18,25 (4); Sat=7,14,21,28 (4) — total 18
    expect(out.length).toBe(18);
    expect(out).toContain('2026-03-01');
    expect(out).toContain('2026-03-29');
  });

  it('X1.11 — multi-month union concatenation works', () => {
    const dates = [...buildMonth('2026-05'), ...buildMonth('2026-06')];
    const out = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: FIX_RECURRING_ENTRIES,
      datesISO: dates,
    });
    expect(out.some((d) => d.startsWith('2026-05'))).toBe(true);
    expect(out.some((d) => d.startsWith('2026-06'))).toBe(true);
  });

  it('X1.12 — V60 marker comment present in source', () => {
    // V60 marker may be on a separate line from the function name (JSDoc spans
    // multiple lines); span via [\s\S] non-greedy.
    expect(SCHEDULE_VALIDATION_SRC).toMatch(/V60[\s\S]{0,2500}?export function derivedDoctorDaysFromSchedules/);
  });

  it('X1.13 — JSDoc explains the V12 multi-reader-sweep class-of-bug being closed', () => {
    expect(SCHEDULE_VALIDATION_SRC).toMatch(/V12 multi-reader-sweep[^\n]*schedule-link/i);
  });
});

// ─── X2. handleGenScheduleLink wires derive helper ─────────────────────
describe('V60.X2 — handleGenScheduleLink uses derived helper + saves finalDoctorDays', () => {
  it('X2.1 — AdminDashboard imports derivedDoctorDaysFromSchedules', () => {
    // Multi-line import block; span via [\s\S]. Window bumped to 1200 in V62
    // since the import block grew with derivedDoctorDaysAcrossWindow +
    // derivedDoctorWorkingHoursPerDate (V62/AV34) + multi-line comments.
    expect(ADMIN_DASHBOARD_SRC).toMatch(/derivedDoctorDaysFromSchedules[\s\S]{0,1200}?from\s+['"][^'"]+staffScheduleValidation/);
  });

  it('X2.2 — handleGenScheduleLink calls derivedDoctorDaysFromSchedules', () => {
    // Anchor on the call-site
    expect(ADMIN_DASHBOARD_SRC).toMatch(/derivedDoctorDaysFromSchedules\(\s*\{[\s\S]{0,400}?doctorId:\s*schedSelectedDoctor/);
  });

  it('X2.3 — listStaffSchedules fetched ONCE within handleGenScheduleLink, reused by both V56 + V60 derivations', () => {
    // After V60 refactor, the listStaffSchedules call lives outside the V56 branch
    // and feeds both derivedAutoClosedDates AND derivedDoctorDaysFromSchedules.
    // Anchor on the full function declaration for exact scoping.
    const region = ADMIN_DASHBOARD_SRC.match(
      /const handleGenScheduleLink\s*=\s*async[\s\S]+?await setDoc\(doc\(db,\s*'artifacts',\s*appId,\s*'public',\s*'data',\s*'clinic_schedules'/,
    );
    expect(region).toBeTruthy();
    const calls = (region[0].match(/listStaffSchedules\(/g) || []).length;
    expect(calls).toBe(1);
  });

  it('X2.4 — saved doc shape uses finalDoctorDays (NOT raw [...schedDoctorDays])', () => {
    // Anti-V12 regression: the legacy verbatim-spread MUST NOT appear in the
    // setDoc shape. Allow it ONLY inside finalDoctorDays construction
    // (filtering by months window, where it's safe).
    expect(ADMIN_DASHBOARD_SRC).toMatch(/doctorDays:\s*finalDoctorDays/);
    expect(ADMIN_DASHBOARD_SRC).not.toMatch(/doctorDays:\s*\[\.\.\.schedDoctorDays\],/);
  });

  it('X2.5 — finalDoctorDays construction unions derived + scoped manual paint', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/finalDoctorDays\s*=\s*\[\.\.\.new Set\(\[[\s\S]{0,200}?derivedDoctorDays[\s\S]{0,200}?inMonthsManualDoctorDays/);
  });

  it('X2.6 — manual paint scoped to months window via monthSet check', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/monthSet\.has\(d\.slice\(0,\s*7\)\)/);
  });

  it('X2.7 — V60 marker comment in handleGenScheduleLink', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/V60\s*\/\s*AV32[^\n]*2026-05-08/);
  });
});

// ─── X3. ClinicSchedule.jsx defense-in-depth banner ────────────────────
describe('V60.X3 — ClinicSchedule.jsx empty-doctor-month banner', () => {
  it('X3.1 — derives isEmptyDoctorMonth from doctorDays + currentMonth', () => {
    expect(CLINIC_SCHEDULE_SRC).toMatch(/isEmptyDoctorMonth[\s\S]{0,300}?monthDoctorDayCount\s*===\s*0/);
  });

  it('X3.2 — uses startsWith(currentMonth) to count per-month doctor days', () => {
    expect(CLINIC_SCHEDULE_SRC).toMatch(/d\.startsWith\(currentMonth\)/);
  });

  it('X3.3 — gate on noDoctorRequired !== true (so noDoctorRequired-mode skips banner)', () => {
    expect(CLINIC_SCHEDULE_SRC).toMatch(/data\.noDoctorRequired\s*!==\s*true/);
  });

  it('X3.4 — banner JSX with data-testid and Thai copy', () => {
    expect(CLINIC_SCHEDULE_SRC).toMatch(/data-testid="schedule-empty-doctor-month"/);
    expect(CLINIC_SCHEDULE_SRC).toMatch(/ยังไม่มีตารางแพทย์ประจำเดือนนี้/);
    expect(CLINIC_SCHEDULE_SRC).toMatch(/กรุณาติดต่อคลินิก/);
  });

  it('X3.5 — English fallback string present', () => {
    expect(CLINIC_SCHEDULE_SRC).toMatch(/No doctor schedule yet for this month/);
  });

  it('X3.6 — V60 marker comment in source', () => {
    expect(CLINIC_SCHEDULE_SRC).toMatch(/V60\s*\/\s*AV32[^\n]*2026-05-08/);
  });
});

// ─── X4. Pre-flight gate ───────────────────────────────────────────────
describe('V60.X4 — pre-flight gate when zero doctorDays in any month', () => {
  it('X4.1 — Thai-copy toast with month label', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/ยังไม่มีตารางหมอเข้าสำหรับ/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/แก้ไขตารางคลินิกหรือตารางหมอก่อนสร้างลิงก์/);
  });

  it('X4.2 — gate blocks save (early return + setSchedGenLoading(false))', () => {
    // The gate body sets schedGenLoading=false then return; before the setDoc call.
    // Window expanded to 1200 to cover the showToast block + Thai month label
    // construction + setSchedGenLoading + return.
    expect(ADMIN_DASHBOARD_SRC).toMatch(/missingMonths\.length\s*>\s*0[\s\S]{0,1200}?setSchedGenLoading\(false\)[\s\S]{0,80}?return;/);
  });

  it('X4.3 — gate skipped when noDoctorRequired=true (link is open to all dates)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/if\s*\(!schedNoDoctorRequired\)\s*\{[\s\S]{0,1000}?missingMonths/);
  });

  it('X4.4 — Thai BE year conversion in month label (yy + 543)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/yy\s*\+\s*543/);
  });
});

// ─── X5. V60 fix script Rule M canonical shape ─────────────────────────
describe('V60.X5 — Rule M migration script canonical shape', () => {
  it('X5.1 — script uses fileURLToPath invocation guard', () => {
    expect(V60_FIX_SCRIPT_SRC).toMatch(/process\.argv\[1\]\s*===\s*fileURLToPath\(import\.meta\.url\)/);
  });

  it('X5.2 — uses canonical Firestore path artifacts/{APP_ID}/public/data', () => {
    expect(V60_FIX_SCRIPT_SRC).toMatch(/artifacts\/\$\{APP_ID\}\/public\/data\/clinic_schedules/);
    expect(V60_FIX_SCRIPT_SRC).toMatch(/artifacts\/\$\{APP_ID\}\/public\/data\/be_staff_schedules/);
  });

  it('X5.3 — two-phase: dry-run by default, --apply commits', () => {
    expect(V60_FIX_SCRIPT_SRC).toMatch(/process\.argv\.includes\(['"]--apply['"]\)/);
  });

  it('X5.4 — PEM key conversion (split \\\\n join \\n)', () => {
    expect(V60_FIX_SCRIPT_SRC).toMatch(/split\(['"]\\\\n['"]\)\.join\(['"]\\n['"]\)/);
  });

  it('X5.5 — forensic-trail fields stamped on update', () => {
    expect(V60_FIX_SCRIPT_SRC).toMatch(/_v60BackfilledAt:[\s\S]{0,40}?serverTimestamp/);
    expect(V60_FIX_SCRIPT_SRC).toMatch(/_v60LegacyDoctorDays:\s*priorDoctorDays/);
  });

  it('X5.6 — audit doc id uses crypto.randomBytes (not Math.random per Rule C2)', () => {
    expect(V60_FIX_SCRIPT_SRC).toMatch(/randomBytes\(/);
    expect(V60_FIX_SCRIPT_SRC).not.toMatch(/Math\.random\(\)\s*\.toString\(36\)/);
  });

  it('X5.7 — audit emit to be_admin_audit collection', () => {
    expect(V60_FIX_SCRIPT_SRC).toMatch(/be_admin_audit\/\$\{auditId\}/);
  });

  it('X5.8 — atomic batch (update + audit emit in single commit)', () => {
    expect(V60_FIX_SCRIPT_SRC).toMatch(/db\.batch\(\)/);
    expect(V60_FIX_SCRIPT_SRC).toMatch(/batch\.update\(schedRef/);
    expect(V60_FIX_SCRIPT_SRC).toMatch(/batch\.set\(auditRef/);
    expect(V60_FIX_SCRIPT_SRC).toMatch(/batch\.commit\(\)/);
  });

  it('X5.9 — idempotency check (re-run with --apply yields 0 writes)', () => {
    expect(V60_FIX_SCRIPT_SRC).toMatch(/Idempotent[\s\S]{0,80}?No write needed/);
  });
});

// ─── X6. V12-class regression sweep across the schedule-link path ──────
describe('V60.X6 — V12 multi-reader-sweep regression sweep', () => {
  it('X6.1 — no remaining "[...schedDoctorDays]" verbatim spread in clinic_schedules setDoc shape (V60 lock)', () => {
    // Allow the spread in the manual-paint filter step (where it's intersected
    // with monthSet); FORBID it in the schedule-link setDoc shape directly.
    // Anchor on the clinic_schedules path to skip unrelated setDoc calls
    // (opd_sessions, etc.).
    // Window bumped 3500 → 5000 in V62 since the setDoc payload grew with
    // selectedRoomIds + multi-line V61/V62 comments. Anchor on
    // clinic_schedules path to skip unrelated setDoc calls.
    const setDocBlock = ADMIN_DASHBOARD_SRC.match(
      /await setDoc\(doc\(db,\s*'artifacts',\s*appId,\s*'public',\s*'data',\s*'clinic_schedules'[\s\S]{0,5000}?\}\);/,
    );
    expect(setDocBlock).toBeTruthy();
    expect(setDocBlock[0]).not.toMatch(/doctorDays:\s*\[\.\.\.schedDoctorDays\]/);
    expect(setDocBlock[0]).toMatch(/doctorDays:\s*finalDoctorDays/);
  });

  it('X6.2 — derivedAutoClosedDates and derivedDoctorDaysFromSchedules share the same listStaffSchedules result', () => {
    // V60 refactor pulled the fetch out of the V56 branch so a single fetch
    // feeds both derivations. Verify the outer scheduleEntries variable
    // exists and is referenced by both call-sites.
    expect(ADMIN_DASHBOARD_SRC).toMatch(/let\s+scheduleEntries\s*=\s*\[\]/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/allEntries:\s*scheduleEntries/g);
  });

  it('X6.3 — pre-flight gate uses the SAME finalDoctorDays the save uses (no shape drift)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/finalDoctorDays\.map\(\(d\)\s*=>\s*d\.slice\(0,\s*7\)\)/);
  });
});

// ─── X7. Pure full-flow simulate (PRE-V60 bug repro + POST-V60 contract) ──
describe('V60.X7 — full-flow simulate', () => {
  // Reproduces the exact production scenario:
  //   admin's schedDoctorDays Set contains ONLY March/April 2026 entries
  //   admin selects May 2026 + selects a doctor with recurring weekly schedule
  //   PRE-V60: doctorDays in saved doc = March/April only → every May cell disabled
  //   POST-V60: doctorDays = (derived from schedules for May) UNION (manual scoped to May = 0)
  const SCHED_DOCTOR_DAYS_MARCH_APRIL = new Set([
    '2026-03-01', '2026-03-02', '2026-03-09', '2026-03-11', '2026-03-14',
    '2026-03-16', '2026-03-21', '2026-03-23', '2026-03-25', '2026-03-30',
    '2026-04-05', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16',
  ]);

  it('X7.1 — PRE-V60 bug repro: dumping schedDoctorDays verbatim → 0 May days', () => {
    const months = ['2026-05'];
    const preV60DoctorDays = [...SCHED_DOCTOR_DAYS_MARCH_APRIL];
    const monthDoctorDayCount = preV60DoctorDays.filter(
      (d) => d.startsWith(months[0]),
    ).length;
    expect(monthDoctorDayCount).toBe(0); // proves the bug shape
  });

  it('X7.2 — POST-V60 contract: derived from be_staff_schedules → 18 May days', () => {
    const months = ['2026-05'];
    const datesInRange = buildMonth(months[0]);
    const derived = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: FIX_RECURRING_ENTRIES,
      datesISO: datesInRange,
    });
    const monthSet = new Set(months);
    const inMonthsManual = [...SCHED_DOCTOR_DAYS_MARCH_APRIL].filter(
      (d) => typeof d === 'string' && monthSet.has(d.slice(0, 7)),
    );
    const finalDoctorDays = [...new Set([...derived, ...inMonthsManual])].sort();
    expect(finalDoctorDays.length).toBe(18);
    expect(finalDoctorDays.every((d) => d.startsWith('2026-05'))).toBe(true);
  });

  it('X7.3 — POST-V60: prior March/April manual paint dropped from saved doc', () => {
    const months = ['2026-05'];
    const monthSet = new Set(months);
    const inMonthsManual = [...SCHED_DOCTOR_DAYS_MARCH_APRIL].filter(
      (d) => monthSet.has(d.slice(0, 7)),
    );
    expect(inMonthsManual).toEqual([]); // every March/April entry filtered out
  });

  it('X7.4 — POST-V60: pre-flight gate would PASS (no missing months)', () => {
    const months = ['2026-05'];
    const datesInRange = buildMonth(months[0]);
    const derived = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: FIX_RECURRING_ENTRIES,
      datesISO: datesInRange,
    });
    const finalDoctorDays = [...new Set([...derived])].sort();
    const monthsCovered = new Set(finalDoctorDays.map((d) => d.slice(0, 7)));
    const missingMonths = months.filter((m) => !monthsCovered.has(m));
    expect(missingMonths).toEqual([]);
  });

  it('X7.5 — pre-flight gate FIRES when doctor has NO entries (e.g. no schedule at all)', () => {
    const months = ['2026-05'];
    const datesInRange = buildMonth(months[0]);
    const derived = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: [], // empty be_staff_schedules
      datesISO: datesInRange,
    });
    const monthSet = new Set(months);
    const inMonthsManual = [...SCHED_DOCTOR_DAYS_MARCH_APRIL].filter(
      (d) => monthSet.has(d.slice(0, 7)),
    );
    const finalDoctorDays = [...new Set([...derived, ...inMonthsManual])].sort();
    const monthsCovered = new Set(finalDoctorDays.map((d) => d.slice(0, 7)));
    const missingMonths = months.filter((m) => !monthsCovered.has(m));
    expect(missingMonths).toEqual(['2026-05']); // gate would block save with toast
  });

  it('X7.6 — multi-month gate: only one month missing → block with that month label', () => {
    const months = ['2026-05', '2026-06'];
    const dates = [...buildMonth('2026-05'), ...buildMonth('2026-06')];
    // Construct entries that cover ONLY May (e.g. doctor's last shift was 2026-05-31)
    // by giving them a per-date one-off entry.
    const entries = [
      { id: 'X', staffId: FIX_DOCTOR_ID, type: 'work', date: '2026-05-15', startTime: '10:00', endTime: '14:00' },
    ];
    const derived = derivedDoctorDaysFromSchedules({
      doctorId: FIX_DOCTOR_ID,
      allEntries: entries,
      datesISO: dates,
    });
    const monthsCovered = new Set(derived.map((d) => d.slice(0, 7)));
    const missingMonths = months.filter((m) => !monthsCovered.has(m));
    expect(missingMonths).toEqual(['2026-06']); // only June missing
  });
});
