// ─── Phase 13.2.7-bis HOTFIX — Calendar shows ALL staff (ProClinic-fidelity) ──
// MS group — verifies the user-flagged correction (2026-04-26):
//   "ใน proclinic ตารางหมอและพนง มันโชว์หมดนะ ไม่ได้แยกโชว์เหมือนเรา"
//   "มันโชว์ทุกคนซ้อนกันในตารางเดียวเลยนะ"
//
// Plus the V21-class regression guard:
//   "ฝาก make sure ด้วยว่าทุกที่แสดงชื่อแพทย์และพนง เป็น text ไม่ใช่ตัวเลย"
//
// Both DoctorSchedulesTab + EmployeeSchedulesTab calendars must:
//   1. Load ALL schedules for their staff-class (doctors / employees), not
//      just the selected one
//   2. Pass staffMap to MonthCalendarGrid so chip text shows DISPLAY NAME,
//      never numeric user_id
//   3. Sidebar (right rail) STILL filters to selectedStaffId — that's the
//      ProClinic per-staff section split

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MonthCalendarGrid from '../src/components/backend/scheduling/MonthCalendarGrid.jsx';

const docTabSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/DoctorSchedulesTab.jsx'),
  'utf-8'
);
const empTabSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/EmployeeSchedulesTab.jsx'),
  'utf-8'
);
const calSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/scheduling/MonthCalendarGrid.jsx'),
  'utf-8'
);

describe('MS — Phase 13.2.7-bis multi-staff calendar HOTFIX', () => {
  describe('MS.A — DoctorSchedulesTab loads ALL doctors\' schedules (not filtered to selected)', () => {
    it('MS.A.1 listStaffSchedules call has NO staffId arg in calendar load', () => {
      // The calendar load must call listStaffSchedules() with NO args (or
      // {} only) so it returns all entries. Filter happens client-side
      // via doctorIdSet.has(...).
      // Anti-regression: user-flagged "ของเราแยกโชว์เวลาเลือกคนซึ่งผิด"
      const idx = docTabSrc.indexOf('listStaffSchedules(');
      expect(idx).toBeGreaterThan(0);
      const callArgs = docTabSrc.slice(idx, idx + 80);
      expect(callArgs).not.toMatch(/listStaffSchedules\(\{\s*staffId:\s*selectedDoctorId/);
    });

    it('MS.A.2 filters to staffIds∈be_doctors via doctorIdSet', () => {
      expect(docTabSrc).toMatch(/doctorIdSet/);
      expect(docTabSrc).toMatch(/doctorIdSet\.has\(String\(e\.staffId\)\)/);
    });

    it('MS.A.3 builds staffMap (id → name) for chip labels', () => {
      expect(docTabSrc).toMatch(/staffMap\s*=\s*useMemo/);
      expect(docTabSrc).toMatch(/m\.set\(id,\s*\{\s*name:/);
    });

    it('MS.A.4 passes staffMap + selectedStaffId to MonthCalendarGrid', () => {
      expect(docTabSrc).toMatch(/staffMap=\{staffMap\}/);
      expect(docTabSrc).toMatch(/selectedStaffId=\{selectedDoctorId\}/);
    });

    it('MS.A.5 sidebar entries STILL filter to selectedDoctorId (per-staff sections)', () => {
      // The 3 sidebar sections (recurring/override/leave) are per-selected-
      // staff; the calendar shows everyone.
      expect(docTabSrc).toMatch(/if\s*\(String\(e\.staffId\)\s*!==\s*String\(selectedDoctorId\)\)\s*continue/);
    });
  });

  describe('MS.B — EmployeeSchedulesTab same multi-staff behavior', () => {
    it('MS.B.1 listStaffSchedules call has NO staffId filter', () => {
      const idx = empTabSrc.indexOf('listStaffSchedules(');
      const callArgs = empTabSrc.slice(idx, idx + 80);
      expect(callArgs).not.toMatch(/listStaffSchedules\(\{\s*staffId:\s*selectedStaffId/);
    });

    it('MS.B.2 filters via staffIdSet from be_staff list', () => {
      expect(empTabSrc).toMatch(/staffIdSet/);
      expect(empTabSrc).toMatch(/staffIdSet\.has\(String\(e\.staffId\)\)/);
    });

    it('MS.B.3 builds staffMap + passes to grid', () => {
      expect(empTabSrc).toMatch(/staffMap\s*=\s*useMemo/);
      expect(empTabSrc).toMatch(/staffMap=\{staffMap\}/);
      expect(empTabSrc).toMatch(/selectedStaffId=\{selectedStaffId\}/);
    });

    it('MS.B.4 sidebar entries STILL filter to selectedStaffId', () => {
      expect(empTabSrc).toMatch(/if\s*\(String\(e\.staffId\)\s*!==\s*String\(selectedStaffId\)\)\s*continue/);
    });
  });

  describe('MS.C — MonthCalendarGrid renders ALL entries with NAME (not numeric ID)', () => {
    const staffMap = new Map([
      ['101', { name: 'นาสาว เอ (เอ)' }],
      ['102', { name: 'หมอ ฟ้า' }],
      ['103', { name: 'Wee 523' }],
    ]);

    // 3 doctors all with recurring Sunday shifts at different times
    const SCHEDS = [
      { id: 'r1', staffId: '101', type: 'recurring', dayOfWeek: 0, startTime: '09:00', endTime: '12:00' },
      { id: 'r2', staffId: '102', type: 'recurring', dayOfWeek: 0, startTime: '10:00', endTime: '14:00' },
      { id: 'r3', staffId: '103', type: 'recurring', dayOfWeek: 0, startTime: '13:00', endTime: '17:00' },
    ];

    it('MS.C.1 renders 3 chips on 2026-04-26 (Sunday) cell', () => {
      const { container } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={SCHEDS} staffMap={staffMap} />
      );
      const cell = container.querySelector('[data-testid="schedule-cell-2026-04-26"]');
      const chips = cell?.querySelectorAll('[data-testid^="schedule-cell-chip-"]');
      expect(chips?.length).toBe(3);
    });

    it('MS.C.2 chip text format = "HH:MM-HH:MM <name>" (NEVER numeric user_id)', () => {
      const { container } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={SCHEDS} staffMap={staffMap} />
      );
      const cell = container.querySelector('[data-testid="schedule-cell-2026-04-26"]');
      const chips = [...(cell?.querySelectorAll('[data-testid^="schedule-cell-chip-"]') || [])];
      const texts = chips.map((c) => c.textContent);
      // Each chip must contain the staff display NAME (Thai/English), never just numbers
      expect(texts.some((t) => t.includes('นาสาว'))).toBe(true);
      expect(texts.some((t) => t.includes('หมอ ฟ้า'))).toBe(true);
      expect(texts.some((t) => t.includes('Wee 523'))).toBe(true);
      // Time format
      texts.forEach((t) => {
        expect(t).toMatch(/\d{2}:\d{2}-\d{2}:\d{2}/);
      });
    });

    it('MS.C.3 falls back to entry.staffName when staffMap missing', () => {
      const sched = [{ id: 'r9', staffId: '999', staffName: 'หมอ Backup', type: 'recurring', dayOfWeek: 0, startTime: '08:00', endTime: '09:00' }];
      const { container } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={sched} staffMap={new Map()} />
      );
      const cell = container.querySelector('[data-testid="schedule-cell-2026-04-26"]');
      const chip = cell?.querySelector('[data-testid^="schedule-cell-chip-"]');
      expect(chip?.textContent).toContain('หมอ Backup');
    });

    it('MS.C.4 NEVER renders the numeric staffId as visible chip text', () => {
      const sched = [{ id: 'r9', staffId: '12345', type: 'recurring', dayOfWeek: 0, startTime: '08:00', endTime: '09:00' }];
      const { container } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={sched} staffMap={new Map()} />
      );
      const cell = container.querySelector('[data-testid="schedule-cell-2026-04-26"]');
      const chip = cell?.querySelector('[data-testid^="schedule-cell-chip-"]');
      // No staffName + no staffMap → fallback "?" (placeholder), NOT numeric id
      expect(chip?.textContent).not.toContain('12345');
      // The staffId IS available via data-attr (for color/key), but NOT as visible text
      expect(chip?.getAttribute('data-staff-id')).toBe('12345');
    });

    it('MS.C.5 sorts chips within-cell by startTime ascending', () => {
      const { container } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={SCHEDS} staffMap={staffMap} />
      );
      const cell = container.querySelector('[data-testid="schedule-cell-2026-04-26"]');
      const chips = [...(cell?.querySelectorAll('[data-testid^="schedule-cell-chip-"]') || [])];
      // Order should be 09:00 → 10:00 → 13:00
      expect(chips[0].textContent).toMatch(/^09:00/);
      expect(chips[1].textContent).toMatch(/^10:00/);
      expect(chips[2].textContent).toMatch(/^13:00/);
    });

    it('MS.C.6 selectedStaffId highlights matching chips with ring-1 + font-bold', () => {
      const { container } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={SCHEDS}
          staffMap={staffMap} selectedStaffId="102" />
      );
      const selectedChip = container.querySelector('[data-staff-id="102"]');
      const otherChip = container.querySelector('[data-staff-id="101"]');
      expect(selectedChip?.className).toMatch(/ring-1/);
      expect(selectedChip?.className).toMatch(/font-bold/);
      expect(otherChip?.className).not.toMatch(/ring-1/);
    });

    it('MS.C.7 +N indicator when entries > 5 in a cell', () => {
      const many = Array.from({ length: 7 }, (_, i) => ({
        id: `r${i}`, staffId: String(100 + i), type: 'recurring',
        dayOfWeek: 0, startTime: `0${8 + Math.min(i, 2)}:00`, endTime: '12:00',
      }));
      const { container } = render(
        <MonthCalendarGrid year={2026} monthIdx={3} schedules={many} staffMap={new Map()} />
      );
      const cell = container.querySelector('[data-testid="schedule-cell-2026-04-26"]');
      expect(cell?.textContent).toContain('+2'); // 7 entries, 5 shown, +2 hidden
    });
  });

  describe('MS.D — Source-grep regression guards (V21-anti)', () => {
    it('MS.D.1 calendar export staffColorClass for deterministic per-staff color', () => {
      expect(calSrc).toMatch(/function\s+staffColorClass\(staffId\)/);
      expect(calSrc).toMatch(/STAFF_CHIP_PALETTE/);
    });

    it('MS.D.2 calendar resolveStaffName ALWAYS falls back to "?" not numeric id', () => {
      expect(calSrc).toMatch(/resolveStaffName/);
      // The fallback chain must NOT include staffId as visible text
      const idx = calSrc.indexOf('resolveStaffName');
      const fn = calSrc.slice(idx, idx + 600);
      // Must accept staffMap or staffName, fall back to "?"
      expect(fn).toMatch(/['"]\?['"]/);
      // Anti-regression: must not return entry.staffId as the visible name
      expect(fn).not.toMatch(/return\s+(entry|e)\.staffId/);
    });

    it('MS.D.3 calendar chip label format includes name (HH:MM-HH:MM <name>)', () => {
      // Find the chip label template
      expect(calSrc).toMatch(/\$\{e\.startTime[^}]*\}-\$\{e\.endTime[^}]*\}\s*\$\{name\}/);
    });

    it('MS.D.4 calendar accepts schedules from MULTIPLE staff (not pre-filtered)', () => {
      // The mergeSchedulesForDate call inside the grid does NOT pass a single
      // staffId filter — that's the parent's job, calendar shows everyone.
      const idx = calSrc.indexOf('mergeSchedulesForDate(cell.dateISO');
      expect(idx).toBeGreaterThan(0);
      const fn = calSrc.slice(idx, idx + 200);
      // Should be: mergeSchedulesForDate(dateISO, schedules)  — no 3rd arg filter
      expect(fn).toMatch(/mergeSchedulesForDate\(cell\.dateISO,\s*schedules\)/);
    });
  });
});
