// ─── Phase 13.2.8 — EmployeeSchedulesTab tests ───────────────────────────
// EST group — verifies the new calendar-view employee schedule tab:
//   - Mirrors DoctorSchedulesTab UI shell (MonthCalendarGrid + Sidebar + Modal)
//   - Sources from listStaff() (NOT listDoctors)
//   - Permission gate: user_schedule_management
//   - BackendDashboard routes 'staff-schedules' → EmployeeSchedulesTab
//
// Strategy: source-grep regression guards. Components themselves are
// already covered by Phase 13.2.7 DST tests.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const empSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/EmployeeSchedulesTab.jsx'),
  'utf-8'
);
const docSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/DoctorSchedulesTab.jsx'),
  'utf-8'
);
const dashSrc = readFileSync(
  resolve(__dirname, '..', 'src/pages/BackendDashboard.jsx'),
  'utf-8'
);

describe('EST — Phase 13.2.8 EmployeeSchedulesTab', () => {
  describe('EST.A — Component shell mirrors DoctorSchedulesTab', () => {
    it('EST.A.1 imports MonthCalendarGrid + ScheduleSidebarPanel + ScheduleEntryFormModal', () => {
      expect(empSrc).toMatch(/import\s+MonthCalendarGrid\s+from\s+['"]\.\/scheduling\/MonthCalendarGrid\.jsx['"]/);
      expect(empSrc).toMatch(/import\s+ScheduleSidebarPanel\s+from\s+['"]\.\/scheduling\/ScheduleSidebarPanel\.jsx['"]/);
      expect(empSrc).toMatch(/import\s+ScheduleEntryFormModal\s+from\s+['"]\.\/scheduling\/ScheduleEntryFormModal\.jsx['"]/);
    });

    it('EST.A.2 mounts all 3 scheduling components in JSX', () => {
      expect(empSrc).toMatch(/<MonthCalendarGrid/);
      expect(empSrc).toMatch(/<ScheduleSidebarPanel/);
      expect(empSrc).toMatch(/<ScheduleEntryFormModal/);
    });

    it('EST.A.3 default-exports the component', () => {
      expect(empSrc).toMatch(/export\s+default\s+function\s+EmployeeSchedulesTab/);
    });

    it('EST.A.4 has data-testid="employee-schedules-tab" wrapper', () => {
      expect(empSrc).toMatch(/data-testid=['"]employee-schedules-tab['"]/);
    });
  });

  describe('EST.B — Data source: be_staff (NOT be_doctors)', () => {
    it('EST.B.1 imports listStaff (NOT listDoctors)', () => {
      expect(empSrc).toMatch(/listStaff/);
      expect(empSrc).not.toMatch(/\blistDoctors\b/);
    });

    it('EST.B.2 imports backendClient schedule CRUD helpers', () => {
      expect(empSrc).toMatch(/listStaffSchedules/);
      expect(empSrc).toMatch(/saveStaffSchedule/);
      expect(empSrc).toMatch(/deleteStaffSchedule/);
    });

    it('EST.B.3 calls listStaff() (not listDoctors) inside reload', () => {
      // Find the loadStaff function and verify it calls listStaff
      const idx = empSrc.indexOf('loadStaff');
      const fn = empSrc.slice(idx, idx + 800);
      expect(fn).toMatch(/listStaff\(\)/);
      expect(fn).not.toMatch(/listDoctors\(\)/);
    });

    it('EST.B.4 select dropdown sources from `staff` state (not `doctors`)', () => {
      expect(empSrc).toMatch(/staff\.map/);
      expect(empSrc).toMatch(/employee-schedules-staff-select/);
    });
  });

  describe('EST.C — Permission gate', () => {
    it('EST.C.1 uses user_schedule_management (NOT doctor_schedule_management)', () => {
      expect(empSrc).toMatch(/useHasPermission\(['"]user_schedule_management['"]\)/);
      expect(empSrc).not.toMatch(/useHasPermission\(['"]doctor_schedule_management['"]\)/);
    });

    it('EST.C.2 imports useHasPermission from hooks', () => {
      expect(empSrc).toMatch(/import\s+\{\s*useHasPermission\s*\}\s+from\s+['"]\.\.\/\.\.\/hooks\/useTabAccess\.js['"]/);
    });

    it('EST.C.3 passes canManage to ScheduleSidebarPanel', () => {
      expect(empSrc).toMatch(/canManage=\{canManage\}/);
    });
  });

  describe('EST.D — BackendDashboard routes staff-schedules → EmployeeSchedulesTab', () => {
    it('EST.D.1 lazy-imports EmployeeSchedulesTab', () => {
      expect(dashSrc).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]\.\.\/components\/backend\/EmployeeSchedulesTab\.jsx['"]\)\)/);
    });

    it('EST.D.2 staff-schedules tab renders <EmployeeSchedulesTab>', () => {
      // Look for the routing case
      expect(dashSrc).toMatch(/activeTab\s*===\s*['"]staff-schedules['"][\s\S]{0,200}<EmployeeSchedulesTab/);
    });

    it('EST.D.3 doctor-schedules tab still routes to <DoctorSchedulesTab>', () => {
      expect(dashSrc).toMatch(/activeTab\s*===\s*['"]doctor-schedules['"][\s\S]{0,200}<DoctorSchedulesTab/);
    });

    it('EST.D.4 list-view StaffSchedulesTab no longer in JSX render flow', () => {
      // The <StaffSchedulesTab> JSX should no longer appear in BackendDashboard
      // (the file remains importable until Phase F but isn't rendered).
      expect(dashSrc).not.toMatch(/<StaffSchedulesTab\b/);
    });
  });

  describe('EST.E — Branch + state wiring', () => {
    it('EST.E.1 reads selected branch via useSelectedBranch', () => {
      expect(empSrc).toMatch(/useSelectedBranch\(\)/);
      expect(empSrc).toMatch(/branchId.*selectedBranchId/);
    });

    it('EST.E.2 splits schedules into recurring/override/leave by type', () => {
      expect(empSrc).toMatch(/recurringEntries/);
      expect(empSrc).toMatch(/overrideEntries/);
      expect(empSrc).toMatch(/leaveEntries/);
      // Splitting logic
      expect(empSrc).toMatch(/e\.type\s*===\s*['"]recurring['"]/);
      expect(empSrc).toMatch(/e\.type\s*===\s*['"]leave['"]/);
    });

    it('EST.E.3 wires modal kind based on entry type for edit', () => {
      const idx = empSrc.indexOf('openEdit');
      const fn = empSrc.slice(idx, idx + 400);
      expect(fn).toMatch(/['"]recurring['"]/);
      expect(fn).toMatch(/['"]leave['"]/);
      expect(fn).toMatch(/['"]override['"]/);
    });

    it('EST.E.4 handleClearAllOverrides bulk-deletes per-date entries', () => {
      expect(empSrc).toMatch(/handleClearAllOverrides/);
      expect(empSrc).toMatch(/overrideEntries\.length/);
    });
  });

  describe('EST.F — UI / branding', () => {
    it('EST.F.1 displays Thai title ตารางพนักงาน (NOT ตารางแพทย์)', () => {
      expect(empSrc).toMatch(/ตารางพนักงาน/);
      expect(empSrc).not.toMatch(/ตารางแพทย์/);
    });

    it('EST.F.2 staff-select placeholder is — เลือกพนักงาน —', () => {
      expect(empSrc).toMatch(/—\s*เลือกพนักงาน\s*—/);
    });

    it('EST.F.3 uses UsersIcon (not Stethoscope) for header', () => {
      expect(empSrc).toMatch(/UsersIcon|Users\s+as/);
      expect(empSrc).not.toMatch(/Stethoscope/);
    });
  });

  describe('EST.G — Mirror: shell parity with DoctorSchedulesTab', () => {
    // Anti-regression: future maintenance must keep both tabs structurally
    // similar so the shared scheduling/ components stay reusable.

    it('EST.G.1 both tabs have the same calendar nav state (year + monthIdx)', () => {
      expect(empSrc).toMatch(/calYear/);
      expect(empSrc).toMatch(/calMonth/);
      expect(docSrc).toMatch(/calYear/);
      expect(docSrc).toMatch(/calMonth/);
    });

    it('EST.G.2 both tabs split schedules by the SAME type filter', () => {
      // Match identical splitting logic
      const empSplit = empSrc.match(/if\s*\(e\.type\s*===\s*['"]recurring['"]\)[^{]*?rec\.push/);
      const docSplit = docSrc.match(/if\s*\(e\.type\s*===\s*['"]recurring['"]\)[^{]*?rec\.push/);
      expect(empSplit).toBeTruthy();
      expect(docSplit).toBeTruthy();
    });

    it('EST.G.3 both tabs use ScheduleEntryFormModal for add+edit', () => {
      expect(empSrc).toMatch(/<ScheduleEntryFormModal/);
      expect(docSrc).toMatch(/<ScheduleEntryFormModal/);
    });
  });
});
