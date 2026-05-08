// V63 / AV35 (2026-05-08) — AdminDashboard "Frontend" appointment
// calendar (image 1) + "ตั้งค่าตารางคลินิก" prefs calendar (image 2)
// render fire emoji on doctor days from CANONICAL be_staff_schedules,
// NOT from admin's manual paint Set (schedDoctorDays). Manual "doctor
// day" toggle removed from prefs calendar — only closed/normal cycle.
//
// User report (verbatim, with 2 screenshots):
//   "ดึงวันหมอเข้ามาแสดงเป็นอีโมจิไฟในปฏิทิน tab นัดหมายของ frontend
//    อันนี้ด้วย ... ส่วนปฏิทินด้านล่าง ให้ทำได้แค่ปิดวัน ไม่สามารถ
//    กำหนดวันหมอเข้าได้แล้ว"
//
// Class-of-bug: V12 multi-reader-sweep at AdminDashboard CALENDAR
// RENDER boundary. The schedule-link adoption-gap series (V52-V63) is
// now 9 V-entries deep, all eliminating one canonical-source gap.
//
// Test groups:
//   M1 — canonicalDoctorDays useMemo wired in AdminDashboard
//   M2 — image-1 (Frontend appt calendar) reads canonicalDoctorDays
//   M3 — image-2 (ตั้งค่าตารางคลินิก calendar) reads canonicalDoctorDays
//   M4 — toggleDay + handleDayPointerDown drop 'doctor' cycle
//   M5 — UI legend + subtitle + button label updated
//   M6 — schedDoctorDays mutations REMOVED from toggle paths

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ADMIN_DASHBOARD_SRC = readFileSync(
  resolve(process.cwd(), 'src/pages/AdminDashboard.jsx'),
  'utf8',
);

describe('V63.M1 — canonicalDoctorDays useMemo wired in AdminDashboard', () => {
  it('M1.1 — V63 / AV35 marker present', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/V63\s*\/\s*AV35/);
  });

  it('M1.2 — allBranchScheduleEntries state declared', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/\[allBranchScheduleEntries,\s*setAllBranchScheduleEntries\]\s*=\s*useState\(\[\]\)/);
  });

  it('M1.3 — useEffect fetches branch-wide entries via listStaffSchedules({branchId})', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /listStaffSchedules\(\{\s*branchId:\s*selectedBranchId\s*\}\)[\s\S]{0,200}?setAllBranchScheduleEntries/,
    );
  });

  it('M1.4 — canonicalDoctorDays useMemo derives from allBranchScheduleEntries', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /canonicalDoctorDays\s*=\s*useMemo[\s\S]{0,800}?derivedDoctorDaysAcrossWindow[\s\S]{0,300}?allBranchScheduleEntries/,
    );
  });

  it('M1.5 — useMemo deps include apptMonth + allBranchScheduleEntries', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /canonicalDoctorDays[\s\S]{0,1000}?\}\s*,\s*\[apptMonth,\s*allBranchScheduleEntries\]/,
    );
  });

  it('M1.6 — canonicalDoctorDays returns Set instance', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/canonicalDoctorDays[\s\S]{0,1000}?return new Set\(days\)/);
  });
});

describe('V63.M2 — image-1 (Frontend appt calendar) uses canonicalDoctorDays', () => {
  it('M2.1 — `isDoc = canonicalDoctorDays.has(dateStr)` present', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/const\s+isDoc\s*=\s*canonicalDoctorDays\.has\(dateStr\)/);
  });

  it('M2.2 — V63 marker comment near image-1 isDoc render', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/V63[\s\S]{0,400}?canonicalDoctorDays\.has\(dateStr\)/);
  });
});

describe('V63.M3 — image-2 (ตั้งค่าตารางคลินิก calendar) uses canonicalDoctorDays', () => {
  it('M3.1 — `isDoc = canonicalDoctorDays.has(ds)` present', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/const\s+isDoc\s*=\s*canonicalDoctorDays\.has\(ds\)/);
  });
});

describe('V63.M4 — toggleDay + handleDayPointerDown drop "doctor" cycle', () => {
  it('M4.1 — toggleDay no longer cycles to "doctor" action', () => {
    // The new cycle is normal ↔ closed only. The old fallback ': "doctor"'
    // pattern is forbidden in the toggle action ternary.
    expect(ADMIN_DASHBOARD_SRC).not.toMatch(
      /const\s+action\s*=\s*forceAction\s*\|\|\s*\([\s\S]{0,200}?:\s*'doctor'\s*\)/,
    );
  });

  it('M4.2 — toggleDay action ternary uses closed/normal only', () => {
    // The new cycle ternary: schedClosedDays.has(dateStr) ? 'normal' : 'closed'
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /const\s+action\s*=\s*forceAction\s*\|\|\s*\(schedClosedDays\.has\(dateStr\)\s*\?\s*'normal'\s*:\s*'closed'\)/,
    );
  });

  it('M4.3 — handleDayPointerDown also uses closed/normal only', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /handleDayPointerDown[\s\S]{0,300}?const\s+action\s*=\s*schedClosedDays\.has\(dateStr\)\s*\?\s*'normal'\s*:\s*'closed'/,
    );
  });

  it('M4.4 — toggleDay no longer mutates schedDoctorDays', () => {
    // Pre-V63: toggleDay had `setSchedDoctorDays(newDoc)` at the bottom.
    // Post-V63: only setSchedClosedDays. Verify no setSchedDoctorDays call
    // appears inside the toggleDay function body.
    const toggleDayBlock = ADMIN_DASHBOARD_SRC.match(
      /const\s+toggleDay\s*=\s*\([\s\S]+?\}\s*;\s*\n\s*\n\s*\/\//,
    );
    expect(toggleDayBlock).toBeTruthy();
    expect(toggleDayBlock[0]).not.toMatch(/setSchedDoctorDays/);
  });
});

describe('V63.M5 — UI legend + subtitle + button label updated', () => {
  it('M5.1 — subtitle no longer reads "หมอเข้า · ปิดคิว · ปิดช่วงเวลา"', () => {
    expect(ADMIN_DASHBOARD_SRC).not.toMatch(/หมอเข้า · ปิดคิว · ปิดช่วงเวลา/);
  });

  it('M5.2 — subtitle now reads "ปิดคิว · ปิดช่วงเวลา"', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/<p[^>]*>ปิดคิว · ปิดช่วงเวลา<\/p>/);
  });

  it('M5.3 — legend chip "หมอเข้า" includes "(จากตารางหมอ)" hint', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/หมอเข้า\s*<span[^>]*>\(จากตารางหมอ\)<\/span>/);
  });

  it('M5.4 — edit button label is "แก้ไขปิดคิว" (was "แก้ไขตารางหมอเข้า/ปิดคิว")', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/แก้ไขปิดคิว/);
    expect(ADMIN_DASHBOARD_SRC).not.toMatch(/แก้ไขตารางหมอเข้า\/ปิดคิว/);
  });

  it('M5.5 — edit-mode hint reflects new cycle (ปกติ ↔ ปิดคิว)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/กดวันที่เพื่อสลับ ปกติ\s*↔\s*ปิดคิว/);
  });
});

describe('V63.M6 — confirmation: schedDoctorDays state still exists for backward compat', () => {
  it('M6.1 — schedDoctorDays state declaration still present (for prefs-doc backward compat)', () => {
    // V63 keeps schedDoctorDays state for backward-compat reading from
    // legacy prefs docs. Render sites swap to canonicalDoctorDays.
    expect(ADMIN_DASHBOARD_SRC).toMatch(/schedDoctorDays,\s*setSchedDoctorDays\]\s*=\s*useState/);
  });

  it('M6.2 — saveSchedulePrefs still receives doctorDays param (legacy prefs-doc shape)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/saveSchedulePrefs\s*=\s*\(doctorDays,/);
  });
});
