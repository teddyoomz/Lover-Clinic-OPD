// ─── Phase 13.2.9 — TodaysDoctorsPanel tests ─────────────────────────────
// TDP group — verifies:
//   - Panel sources from schedule (NOT appointments) — fixes the V21-class
//     bug where doctors-with-no-bookings disappeared from the panel.
//   - Pixel-fidelity match to ProClinic SSR output: title, "แพทย์เข้าตรวจ
//     N คน" subtitle, per-doctor avatar + name + working-hour range.
//   - leave/holiday/sick filtered OUT (those are NOT working types).
//   - Click row emits onDoctorClick(doctorId).
//   - AppointmentTab wires the panel + listenToScheduleByDay listener.

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import TodaysDoctorsPanel from '../src/components/backend/scheduling/TodaysDoctorsPanel.jsx';

const apptTabSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/AppointmentTab.jsx'),
  'utf-8'
);
const panelSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/scheduling/TodaysDoctorsPanel.jsx'),
  'utf-8'
);

const SAMPLE_DOCTORS = [
  { doctorId: '101', firstname: 'ก้อง', lastname: 'แพทย์', nickname: 'กก' },
  { doctorId: '102', firstname: 'น้ำตาล', lastname: 'แพทย์' },
  { doctorId: '103', firstname: 'ฟ้า', lastname: 'แพทย์', nickname: 'ฟ้า' },
];

const SCHED_RECURRING = (staffId, dow, start, end) => ({
  id: `r-${staffId}-${dow}`, staffId, type: 'recurring',
  dayOfWeek: dow, startTime: start, endTime: end, source: 'recurring',
});

const SCHED_OVERRIDE = (staffId, date, type, start, end) => ({
  id: `o-${staffId}-${date}`, staffId, type, date, startTime: start, endTime: end, source: 'override',
});

describe('TDP — Phase 13.2.9 TodaysDoctorsPanel', () => {
  describe('TDP.A — Panel rendering', () => {
    it('TDP.A.1 renders ProClinic-fidelity title in Thai', () => {
      const { getByTestId } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={[]} />
      );
      const title = getByTestId('todays-doctors-title');
      expect(title.textContent).toContain('วันอาทิตย์');
      expect(title.textContent).toContain('26');
      expect(title.textContent).toContain('เมษายน');
      expect(title.textContent).toContain('2026');
    });

    it('TDP.A.2 renders "แพทย์เข้าตรวจ 0 คน" empty state', () => {
      const { getByTestId, getByText } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={[]} />
      );
      const count = getByTestId('todays-doctors-count');
      expect(count.textContent).toContain('0');
      expect(getByText('ไม่มีแพทย์เข้าตรวจ')).toBeTruthy();
    });

    it('TDP.A.3 renders 1 doctor row when 1 recurring shift matches', () => {
      const sched = [SCHED_RECURRING('101', 0, '09:00', '19:00')];  // Sunday
      const { container, getByTestId } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={sched} />
      );
      const rows = container.querySelectorAll('[data-testid^="todays-doctor-row-"]');
      expect(rows).toHaveLength(1);
      expect(getByTestId('todays-doctors-count').textContent).toContain('1');
      // Doctor name + time range visible
      expect(rows[0].textContent).toContain('ก้อง');
      expect(rows[0].textContent).toContain('09:00');
      expect(rows[0].textContent).toContain('19:00');
    });

    it('TDP.A.4 sorts doctors by startTime ascending (stable display)', () => {
      const sched = [
        SCHED_RECURRING('103', 0, '13:00', '22:00'),  // late
        SCHED_RECURRING('101', 0, '09:00', '19:00'),  // early
        SCHED_RECURRING('102', 0, '10:00', '14:30'),  // mid
      ];
      const { container } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={sched} />
      );
      const rows = [...container.querySelectorAll('[data-testid^="todays-doctor-row-"]')];
      expect(rows[0].textContent).toContain('09:00');
      expect(rows[1].textContent).toContain('10:00');
      expect(rows[2].textContent).toContain('13:00');
    });

    it('TDP.A.5 click row fires onDoctorClick with doctorId', () => {
      const calls = [];
      const sched = [SCHED_RECURRING('102', 0, '10:00', '14:30')];
      const { getByTestId } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS}
          todaysSchedules={sched}
          onDoctorClick={(id) => calls.push(id)} />
      );
      fireEvent.click(getByTestId('todays-doctor-row-102'));
      expect(calls).toEqual(['102']);
    });

    it('TDP.A.6 loading state shows "กำลังโหลด..."', () => {
      const { getByText } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={[]} loading={true} />
      );
      expect(getByText('กำลังโหลด...')).toBeTruthy();
    });
  });

  describe('TDP.B — Filtering: only WORKING types', () => {
    it('TDP.B.1 EXCLUDES leave entries from panel', () => {
      const sched = [
        SCHED_RECURRING('101', 0, '09:00', '19:00'),
        SCHED_OVERRIDE('102', '2026-04-26', 'leave'),  // on leave today
      ];
      const { container, getByTestId } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={sched} />
      );
      const rows = container.querySelectorAll('[data-testid^="todays-doctor-row-"]');
      expect(rows).toHaveLength(1);
      expect(getByTestId('todays-doctor-row-101')).toBeTruthy();
      expect(container.querySelector('[data-testid="todays-doctor-row-102"]')).toBeNull();
    });

    it('TDP.B.2 EXCLUDES sick entries', () => {
      const sched = [SCHED_OVERRIDE('101', '2026-04-26', 'sick')];
      const { container } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={sched} />
      );
      expect(container.querySelectorAll('[data-testid^="todays-doctor-row-"]')).toHaveLength(0);
    });

    it('TDP.B.3 EXCLUDES holiday entries', () => {
      const sched = [SCHED_OVERRIDE('101', '2026-04-26', 'holiday')];
      const { container } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={sched} />
      );
      expect(container.querySelectorAll('[data-testid^="todays-doctor-row-"]')).toHaveLength(0);
    });

    it('TDP.B.4 INCLUDES work + halfday entries', () => {
      const sched = [
        SCHED_OVERRIDE('101', '2026-04-26', 'work', '09:00', '12:00'),
        SCHED_OVERRIDE('102', '2026-04-26', 'halfday', '13:00', '17:00'),
      ];
      const { container } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={sched} />
      );
      expect(container.querySelectorAll('[data-testid^="todays-doctor-row-"]')).toHaveLength(2);
    });

    it('TDP.B.5 IGNORES schedules whose staffId is NOT in be_doctors list', () => {
      const sched = [
        SCHED_RECURRING('999', 0, '09:00', '17:00'),  // unknown staff
        SCHED_RECURRING('101', 0, '10:00', '18:00'),
      ];
      const { container, getByTestId } = render(
        <TodaysDoctorsPanel dateISO="2026-04-26" doctors={SAMPLE_DOCTORS} todaysSchedules={sched} />
      );
      const rows = container.querySelectorAll('[data-testid^="todays-doctor-row-"]');
      expect(rows).toHaveLength(1);
      expect(getByTestId('todays-doctor-row-101')).toBeTruthy();
    });
  });

  describe('TDP.C — Source-grep regression guards (panel)', () => {
    // Strip JS comments so anti-regression checks don't false-match doc.
    const codeOnly = panelSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    it('TDP.C.1 panel code does NOT import be_appointments / listenToAppointmentsByDate', () => {
      // V21-anti: previous panel sourced from appointments — that was wrong.
      expect(codeOnly).not.toMatch(/listenToAppointmentsByDate/);
      expect(codeOnly).not.toMatch(/be_appointments/);
      expect(codeOnly).not.toMatch(/getAppointments/);
    });

    it('TDP.C.2 panel filters by type (recurring|work|halfday)', () => {
      expect(codeOnly).toMatch(/['"]recurring['"]/);
      expect(codeOnly).toMatch(/['"]work['"]/);
      expect(codeOnly).toMatch(/['"]halfday['"]/);
    });

    it('TDP.C.3 panel uses pre-merged data shape (no internal Firestore calls)', () => {
      // Panel receives todaysSchedules already merged — no internal Firestore
      // listenStaffSchedules / getActiveSchedulesForDate / getDocs calls.
      expect(codeOnly).not.toMatch(/listStaffSchedules|getActiveSchedulesForDate/);
      expect(codeOnly).not.toMatch(/onSnapshot|getDocs/);
      expect(codeOnly).toMatch(/todaysSchedules/);
    });

    it('TDP.C.4 panel renders title with full Thai date including dayOfWeek', () => {
      expect(panelSrc).toMatch(/THAI_DAYS/);
      expect(panelSrc).toMatch(/THAI_MONTHS/);
      expect(panelSrc).toMatch(/วัน\$\{[^}]*\}ที่/);
    });

    it('TDP.C.5 panel emits onDoctorClick(doctorId) on row click', () => {
      expect(panelSrc).toMatch(/onClick=\{\(\)\s*=>\s*onDoctorClick\?\.\(doc\.doctorId\)\}/);
    });
  });

  describe('TDP.D — AppointmentTab wiring', () => {
    it('TDP.D.1 imports TodaysDoctorsPanel + listenToScheduleByDay + listDoctors', () => {
      expect(apptTabSrc).toMatch(/import\s+TodaysDoctorsPanel\s+from\s+['"]\.\/scheduling\/TodaysDoctorsPanel\.jsx['"]/);
      expect(apptTabSrc).toMatch(/listenToScheduleByDay/);
      expect(apptTabSrc).toMatch(/listDoctors/);
    });

    it('TDP.D.2 mounts TodaysDoctorsPanel in JSX', () => {
      expect(apptTabSrc).toMatch(/<TodaysDoctorsPanel/);
      expect(apptTabSrc).toMatch(/dateISO=\{selectedDate\}/);
      expect(apptTabSrc).toMatch(/doctors=\{doctors\}/);
      expect(apptTabSrc).toMatch(/todaysSchedules=\{todaysSchedules\}/);
    });

    it('TDP.D.3 subscribes to listenToScheduleByDay on selectedDate change', () => {
      // The listener call site (NOT the import) — find via "listenToScheduleByDay("
      const callIdx = apptTabSrc.indexOf('listenToScheduleByDay(');
      expect(callIdx).toBeGreaterThan(0);
      const ctx = apptTabSrc.slice(callIdx, callIdx + 800);
      expect(ctx).toMatch(/selectedDate/);
      // Filter to doctor IDs
      expect(ctx).toMatch(/doctorIds/);
    });

    it('TDP.D.4 doctor count header reads from todaysSchedules (not dayDoctors)', () => {
      // Anti-V21: the header subtitle MUST use schedule data, not appointments
      expect(apptTabSrc).toMatch(/data-testid=['"]appt-doctors-count-header['"]/);
      // Verify it filters by schedule type
      const idx = apptTabSrc.indexOf('appt-doctors-count-header');
      const ctx = apptTabSrc.slice(idx, idx + 400);
      expect(ctx).toMatch(/todaysSchedules\.filter/);
    });

    it('TDP.D.5 inline appointment-derived doctors panel REMOVED (replaced)', () => {
      // The old panel had `dayDoctors.map` — should no longer be in the JSX
      // for the panel block. (dayDoctors itself may still be derived for
      // other uses, but it's not driving the today's-doctors widget.)
      const panelStart = apptTabSrc.indexOf('<TodaysDoctorsPanel');
      expect(panelStart).toBeGreaterThan(0);
      // Anti-regression: no `dayDoctors.length} คน` panel render path
      expect(apptTabSrc).not.toMatch(/แพทย์เข้าตรวจ\s*\{dayDoctors\.length\}\s*คน/);
    });
  });
});
