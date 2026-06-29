// V64-fix (2026-05-09 root-cause class-of-bug regression bank).
//
// TWO root-cause bugs surfaced in V64 first browser test:
//
//   1. getAppointmentsByDateRange used server-side composite (branchId + date)
//      where clauses → required missing Firestore index → silent error →
//      View loaded 0 rows. FIX: mirror getAppointmentsByMonth pattern
//      (server-where branchId only + client-side normalizeApptDate filter).
//
//   2. AppointmentHubView's inline shift filter for the today/tomorrow doctor
//      cards used WRONG be_staff_schedules field names (`kind`, `role`,
//      `dateISO`). The real schema (verified via preview_eval against prod)
//      uses `type`, NO `role` field (role inferred from staffId membership),
//      and `date`. FIX: rewrite filter to use `type`/`date` + Set-membership
//      role-resolve via doctors/assistants prop lists.
//
// Both bugs share the same class: V64 introduced new consumers of existing
// collections without first verifying the canonical query pattern + schema
// shape. Cross-file grep confirmed:
//   - reportsLoaders.js has its own composite where but provides a try/catch
//     fallback that fetches all + filters client-side (V12-safe; already OK)
//   - MonthCalendarGrid.jsx `cell.dateISO` is a calendar-grid-cell field, not
//     a be_staff_schedules doc field (different domain; OK)
// V64 is the only NEW helper / consumer where the class fired.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const backendClientSrc = readFileSync(
  resolve(__dirname, '../src/lib/backendClient.js'),
  'utf-8',
);
const viewSrc = readFileSync(
  resolve(__dirname, '../src/components/admin/AppointmentHubView.jsx'),
  'utf-8',
);

describe('V64-fix.SC1 — getAppointmentsByDateRange query-shape regression', () => {
  const start = backendClientSrc.indexOf('export async function getAppointmentsByDateRange(');
  const slice = backendClientSrc.slice(start, start + 2500);

  it('SC1.1 forbids server-side date >= where clause (composite-index avoidance)', () => {
    expect(slice).not.toMatch(/where\s*\(\s*['"]date['"]\s*,\s*['"]>=['"]/);
  });

  it('SC1.2 forbids server-side date <= where clause', () => {
    expect(slice).not.toMatch(/where\s*\(\s*['"]date['"]\s*,\s*['"]<=['"]/);
  });

  it('SC1.3 keeps server-side branchId where (V54 BS-13 safe-by-default)', () => {
    expect(slice).toMatch(/where\s*\(\s*['"]branchId['"]\s*,\s*['"]==['"]/);
  });

  it('SC1.4 uses normalizeApptDate for client-side date filter', () => {
    expect(slice).toMatch(/normalizeApptDate/);
  });

  it('SC1.5 V64-fix marker comment present (institutional memory)', () => {
    expect(slice).toMatch(/V64-fix/);
  });
});

describe('V64-fix.SC2 — schedule-effective-on-date uses the canonical reader (V164-fix 2026-06-29)', () => {
  // V164-fix: the header no longer reimplements the recurring/per-date match
  // inline (which keyed per-date on a literal `type === 'override'` that real
  // be_staff_schedules NEVER produces → working doctors dropped). It now routes
  // through deriveWorkingDoctorShiftsForDate (mergeSchedulesForDate + WORKING_TIME_TYPES).
  const validationSrc = readFileSync(resolve(__dirname, '../src/lib/staffScheduleValidation.js'), 'utf-8');

  it('SC2.1 AppointmentHubView delegates to deriveWorkingDoctorShiftsForDate (no inline reimplementation)', () => {
    expect(viewSrc).toMatch(/deriveWorkingDoctorShiftsForDate/);
  });

  it('SC2.2 header DROPS the buggy literal `type === "override"` per-date match', () => {
    expect(viewSrc).not.toMatch(/e\.type\s*===\s*['"]override['"]/);
  });

  it('SC2.3 canonical mergeSchedulesForDate keys per-date on `type !== "recurring"` + `date === targetDate`', () => {
    expect(validationSrc).toMatch(/e\.date\s*===\s*targetDate\s*&&\s*e\.type\s*!==\s*['"]recurring['"]/);
    expect(validationSrc).not.toMatch(/e\.type\s*===\s*['"]override['"]/);
  });

  it('SC2.4 canonical recurring match coerces dayOfWeek via Number() (string-safe)', () => {
    expect(validationSrc).toMatch(/Number\(\s*e\.dayOfWeek\s*\)\s*===\s*dow/);
  });

  it('SC2.5 deriveWorkingDoctorShiftsForDate filters to WORKING_TIME_TYPES (excludes leave/holiday/sick)', () => {
    expect(validationSrc).toMatch(/export function deriveWorkingDoctorShiftsForDate/);
    expect(validationSrc).toMatch(/WORKING_TIME_TYPES\.has\(/);
  });

  it('SC2.6 dayOfWeekFromDate is UTC-anchored (Date.UTC — no local-TZ drift)', () => {
    expect(validationSrc).toMatch(/Date\.UTC\(/);
  });
});

describe('V64-fix.CB — Class-of-bug cross-file grep classifier', () => {
  it('CB.1 reportsLoaders.js composite where is sanctioned (has try/catch fallback)', () => {
    const reports = readFileSync(resolve(__dirname, '../src/lib/reportsLoaders.js'), 'utf-8');
    // Must have try/catch wrapping the composite query
    expect(reports).toMatch(/where\s*\(\s*['"]date['"]\s*,\s*['"]>=['"]/);
    expect(reports).toMatch(/} catch\s*[{(]/);
    // Fallback path filters client-side (proves V12-safe pattern)
    expect(reports).toMatch(/\.filter\([^)]*\(?e?\.?date/);
  });

  it('CB.2 No new lib helper introduces unfallback\'d composite (branchId+date) where', () => {
    // Grep all lib files for `where('date', '>=')` + `where('branchId', '==')` in same function body
    // without try/catch. If any new pattern appears, this catches it.
    const libFiles = [
      'src/lib/backendClient.js',
      'src/lib/reportsLoaders.js',
    ];
    for (const f of libFiles) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf-8');
      // Find every `export async function NAME(` boundary
      const fnStarts = [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)];
      for (let i = 0; i < fnStarts.length; i++) {
        const start = fnStarts[i].index;
        const end = i + 1 < fnStarts.length ? fnStarts[i + 1].index : start + 5000;
        const body = src.slice(start, end);
        const hasDateRange = /where\s*\(\s*['"]date['"]\s*,\s*['"](>=|<=)['"]/.test(body);
        const hasBranchEq = /where\s*\(\s*['"]branchId['"]\s*,\s*['"]==['"]/.test(body);
        const hasTryCatch = /\}\s*catch\s*[{(]/.test(body);
        if (hasDateRange && hasBranchEq && !hasTryCatch) {
          throw new Error(`V64-fix CB.2 — unfallback'd composite (date+branchId) where in ${f} ${fnStarts[i][1]}(). Add try/catch fallback or use single-where + client-side filter.`);
        }
      }
    }
  });
});
