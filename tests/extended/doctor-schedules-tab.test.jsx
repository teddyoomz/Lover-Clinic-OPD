// ─── Phase 13.2.7 — DoctorSchedulesTab + scheduling components tests ──────
// DST group — verifies:
//   - MonthCalendarGrid layout, navigation, week-header order
//   - ScheduleEntryFormModal field visibility per kind
//   - ScheduleSidebarPanel section structure + handler wiring
//   - DoctorSchedulesTab nav + permission + routing wiring
//
// Strategy: source-grep regression guards + buildMonthGrid runtime + DOM
// probe via RTL where cheap.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MonthCalendarGrid, {
  buildMonthGrid, THAI_MONTHS, WEEK_HEADER, SLOT_TO_JS_DAY,
} from '../src/components/backend/scheduling/MonthCalendarGrid.jsx';

// File-source reads (regression guards)
const calSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/scheduling/MonthCalendarGrid.jsx'),
  'utf-8'
);
const sidebarSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/scheduling/ScheduleSidebarPanel.jsx'),
  'utf-8'
);
const modalSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/scheduling/ScheduleEntryFormModal.jsx'),
  'utf-8'
);
const tabSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/DoctorSchedulesTab.jsx'),
  'utf-8'
);
const navSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/nav/navConfig.js'),
  'utf-8'
);
const permSrc = readFileSync(
  resolve(__dirname, '..', 'src/lib/tabPermissions.js'),
  'utf-8'
);
const dashSrc = readFileSync(
  resolve(__dirname, '..', 'src/pages/BackendDashboard.jsx'),
  'utf-8'
);

describe('DST — Phase 13.2.7 DoctorSchedulesTab + scheduling', () => {
  describe('DST.A — buildMonthGrid runtime', () => {
    it('DST.A.1 returns exactly 42 cells (6 rows × 7 cols)', () => {
      const cells = buildMonthGrid(2026, 3); // April 2026
      expect(cells).toHaveLength(42);
    });

    it('DST.A.2 first cell is the Monday on/before the 1st', () => {
      // April 2026: 1st = Wed (jsDow=3); slot 0 should be the prior Mon (March 30)
      const cells = buildMonthGrid(2026, 3);
      expect(cells[0].day).toBe(30);
      expect(cells[0].isCurrentMonth).toBe(false);
      expect(cells[0].slotIdx).toBe(0);
    });

    it('DST.A.3 cell containing the 1st of month is in current month', () => {
      const cells = buildMonthGrid(2026, 3);
      const firstOfMonth = cells.find((c) => c.isCurrentMonth && c.day === 1);
      expect(firstOfMonth).toBeTruthy();
    });

    it('DST.A.4 dates form a continuous sequence', () => {
      const cells = buildMonthGrid(2026, 3);
      for (let i = 1; i < cells.length; i++) {
        const prev = new Date(cells[i - 1].dateISO + 'T00:00:00Z').getTime();
        const cur = new Date(cells[i].dateISO + 'T00:00:00Z').getTime();
        expect(cur - prev).toBe(86400000);
      }
    });

    it('DST.A.5 February 2024 (leap year) has 29 days in current-month cells', () => {
      const cells = buildMonthGrid(2024, 1);
      const inMonth = cells.filter((c) => c.isCurrentMonth);
      expect(inMonth).toHaveLength(29);
    });

    it('DST.A.6 jsDayOfWeek matches actual JS Date getUTCDay', () => {
      const cells = buildMonthGrid(2026, 3);
      for (const c of cells) {
        const expected = new Date(c.dateISO + 'T00:00:00Z').getUTCDay();
        expect(c.jsDayOfWeek).toBe(expected);
      }
    });
  });

  describe('DST.B — Constants + week-header order', () => {
    it('DST.B.1 THAI_MONTHS has 12 entries starting มกราคม', () => {
      expect(THAI_MONTHS).toHaveLength(12);
      expect(THAI_MONTHS[0]).toBe('มกราคม');
      expect(THAI_MONTHS[3]).toBe('เมษายน');
    });

    it('DST.B.2 WEEK_HEADER is Monday-first (จ first, อา last)', () => {
      expect(WEEK_HEADER[0]).toBe('จ');
      expect(WEEK_HEADER[6]).toBe('อา');
    });

    it('DST.B.3 SLOT_TO_JS_DAY maps slot 0 → Monday (1) and slot 6 → Sunday (0)', () => {
      expect(SLOT_TO_JS_DAY[0]).toBe(1);
      expect(SLOT_TO_JS_DAY[6]).toBe(0);
      expect(SLOT_TO_JS_DAY).toHaveLength(7);
    });
  });

  describe('DST.C — MonthCalendarGrid renders', () => {
    it('DST.C.1 renders month label with พ.ศ. (BE) year', () => {
      const { getByTestId } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={[]} />
      );
      const label = getByTestId('schedule-month-label');
      expect(label.textContent).toContain('เมษายน');
      expect(label.textContent).toContain('2569'); // 2026 + 543
    });

    it('DST.C.2 renders 42 cells', () => {
      const { container } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={[]} />
      );
      const cells = container.querySelectorAll('[data-testid^="schedule-cell-"]');
      expect(cells.length).toBe(42);
    });

    it('DST.C.3 renders chip when recurring entry matches dayOfWeek', () => {
      // Apr 27 2026 is Monday (jsDow=1) — set recurring Mon
      const sched = [{ id: 'r1', staffId: '1', type: 'recurring', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }];
      const { container, getByTestId } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={sched} />
      );
      const cell = getByTestId('schedule-cell-2026-04-27');
      expect(cell.textContent).toContain('09:00');
      expect(cell.textContent).toContain('17:00');
    });

    it('DST.C.4 prev/next buttons fire onMonthChange', () => {
      const calls = [];
      const { getByTestId } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={[]}
          onMonthChange={(y, m) => calls.push([y, m])} />
      );
      getByTestId('schedule-month-prev').click();
      expect(calls).toContainEqual([2026, 2]);
      getByTestId('schedule-month-next').click();
      expect(calls).toContainEqual([2026, 4]);
    });

    it('DST.C.5 Jan/Dec wrap correctly', () => {
      const calls = [];
      const { getByTestId, rerender } = render(
        <MonthCalendarGrid year={2026} monthIdx={0} schedules={[]}
          onMonthChange={(y, m) => calls.push([y, m])} />
      );
      getByTestId('schedule-month-prev').click();
      expect(calls[0]).toEqual([2025, 11]);
      // re-render with Dec to test next-wrap
      rerender(<MonthCalendarGrid year={2026} monthIdx={11} schedules={[]}
        onMonthChange={(y, m) => calls.push([y, m])} />);
      getByTestId('schedule-month-next').click();
      expect(calls).toContainEqual([2027, 0]);
    });
  });

  describe('DST.D — Source-grep regression guards (sidebar + modal)', () => {
    it('DST.D.1 ScheduleSidebarPanel renders 3 sections (recurring/override/leave)', () => {
      expect(sidebarSrc).toMatch(/งานประจำสัปดาห์/);
      expect(sidebarSrc).toMatch(/งานรายวัน/);
      expect(sidebarSrc).toMatch(/วันลา/);
    });

    it('DST.D.2 ScheduleSidebarPanel exposes add buttons gated by canManage', () => {
      expect(sidebarSrc).toMatch(/canManage\s*&&\s*\(/);
      expect(sidebarSrc).toMatch(/onAddRecurring/);
      expect(sidebarSrc).toMatch(/onAddOverride/);
      expect(sidebarSrc).toMatch(/onAddLeave/);
    });

    it('DST.D.3 ScheduleEntryFormModal supports 3 kinds', () => {
      expect(modalSrc).toMatch(/KIND_TITLE.*recurring/s);
      expect(modalSrc).toMatch(/KIND_TYPES.*recurring/s);
      expect(modalSrc).toMatch(/KIND_TITLE.*override/s);
      expect(modalSrc).toMatch(/KIND_TITLE.*leave/s);
    });

    it('DST.D.4 ScheduleEntryFormModal hides date for recurring + dayOfWeek for non-recurring', () => {
      expect(modalSrc).toMatch(/kind === ['"]recurring['"]/);
      expect(modalSrc).toMatch(/kind !== ['"]recurring['"]/);
    });

    it('DST.D.5 ScheduleEntryFormModal validates via validateStaffScheduleStrict before save', () => {
      expect(modalSrc).toMatch(/import\s+\{[^}]*validateStaffScheduleStrict/s);
      expect(modalSrc).toMatch(/validateStaffScheduleStrict\(payload\)/);
    });
  });

  describe('DST.E — DoctorSchedulesTab wiring', () => {
    it('DST.E.1 imports listDoctors (NOT listStaff — fixes the original bug)', () => {
      expect(tabSrc).toMatch(/listDoctors/);
      // listStaff (NOT listStaffSchedules / listStaffXxx) must NOT appear as a
      // standalone identifier — strict word-boundary check
      expect(tabSrc).not.toMatch(/\blistStaff\b(?!Schedules?)/);
    });

    it('DST.E.2 mounts MonthCalendarGrid + ScheduleSidebarPanel + ScheduleEntryFormModal', () => {
      expect(tabSrc).toMatch(/<MonthCalendarGrid/);
      expect(tabSrc).toMatch(/<ScheduleSidebarPanel/);
      expect(tabSrc).toMatch(/<ScheduleEntryFormModal/);
    });

    it('DST.E.3 splits schedules into recurring/override/leave sections', () => {
      expect(tabSrc).toMatch(/recurringEntries/);
      expect(tabSrc).toMatch(/overrideEntries/);
      expect(tabSrc).toMatch(/leaveEntries/);
    });

    it('DST.E.4 gates with useHasPermission(\'doctor_schedule_management\')', () => {
      expect(tabSrc).toMatch(/useHasPermission\(['"]doctor_schedule_management['"]\)/);
    });

    it('DST.E.5 wires branchId via BranchContext', () => {
      expect(tabSrc).toMatch(/useSelectedBranch/);
      expect(tabSrc).toMatch(/branchId.*selectedBranchId/);
    });
  });

  describe('DST.F — Nav + permission + dashboard routing', () => {
    it('DST.F.1 navConfig has doctor-schedules entry under master section', () => {
      expect(navSrc).toMatch(/id:\s*['"]doctor-schedules['"]/);
      expect(navSrc).toMatch(/label:\s*['"]ตารางแพทย์['"]/);
    });

    it('DST.F.2 staff-schedules label updated to ตารางพนักงาน', () => {
      expect(navSrc).toMatch(/id:\s*['"]staff-schedules['"][^}]*label:\s*['"]ตารางพนักงาน['"]/s);
    });

    it('DST.F.3 tabPermissions splits doctor vs staff schedule perms', () => {
      expect(permSrc).toMatch(/['"]doctor-schedules['"]:\s*\{\s*requires:\s*\[\s*['"]doctor_schedule_management['"]/s);
      expect(permSrc).toMatch(/['"]staff-schedules['"]:\s*\{\s*requires:\s*\[\s*['"]user_schedule_management['"]/s);
    });

    it('DST.F.4 BackendDashboard lazy-imports DoctorSchedulesTab', () => {
      expect(dashSrc).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]\.\.\/components\/backend\/DoctorSchedulesTab\.jsx['"]\)\)/);
    });

    it('DST.F.5 BackendDashboard routes activeTab===\'doctor-schedules\' to DoctorSchedulesTab', () => {
      expect(dashSrc).toMatch(/activeTab\s*===\s*['"]doctor-schedules['"]/);
      expect(dashSrc).toMatch(/<DoctorSchedulesTab\s+clinicSettings/);
    });
  });
});
