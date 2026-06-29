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

describe('V64-fix.SC2 — AppointmentHubView staff-schedule schema regression', () => {
  // Slice the doctorShifts useMemo block (V164 doctor-only — anchor updated 2026-06-29;
  // the schema field-name invariants still apply to the doctor-only memo).
  const start = viewSrc.indexOf('// V164 (2026-06-29) — doctor-only shifts');
  const slice = viewSrc.slice(start, start + 2500);

  it('SC2.1 marker comment present', () => {
    expect(start).toBeGreaterThan(0);
  });

  it('SC2.2 uses `type` (NOT `kind`) for entry shape — recurring branch', () => {
    expect(slice).toMatch(/e\.type\s*===\s*['"]recurring['"]/);
    expect(slice).not.toMatch(/e\.kind\s*===\s*['"]recurring['"]/);
  });

  it('SC2.3 uses `type` (NOT `kind`) — override branch', () => {
    expect(slice).toMatch(/e\.type\s*===\s*['"]override['"]/);
    expect(slice).not.toMatch(/e\.kind\s*===\s*['"]override['"]/);
  });

  it('SC2.4 uses `date` (NOT `dateISO`) for date match', () => {
    expect(slice).toMatch(/e\.date\s*===\s*targetISO/);
    expect(slice).not.toMatch(/e\.dateISO/);
  });

  it('SC2.5 role inferred via Set membership (not e.role field)', () => {
    expect(slice).toMatch(/idSet\.has/);
    expect(slice).not.toMatch(/e\.role\s*!==/);
  });

  it('SC2.6 Bangkok TZ midday-UTC parse for dayOfWeek', () => {
    expect(slice).toMatch(/Date\.UTC\([^)]*12\s*,\s*0\s*,\s*0\)/);
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
