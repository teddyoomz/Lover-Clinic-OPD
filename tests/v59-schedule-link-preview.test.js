// tests/v59-schedule-link-preview.test.js
// V59 / 2026-05-08 — Schedule-link modal V56 auto-closure live preview.
//
// User concern (verbatim): "ไม่แน่ใจว่าจะแสดงตารางหมอ ห้องที่เข้าตรวจ
// สัมพันธ์กับลิ้งที่ส่งให้ลูกค้าไหม"
//
// V56/BS-15 shipped the data-layer integration (handleGenScheduleLink
// auto-closes non-licensed dates via derivedAutoClosedDates → unioned
// into saved doc closedDays). But admin had ZERO visible feedback in
// the modal — link looked identical regardless of whether V56 fired.
//
// V59 closes the trust gap with a live preview computed from
// derivedAutoClosedDates as admin changes doctor/room picks.
//
// 3 states:
//   ✓ green — picked room IS in doctor's licensed roomIds (data shows
//     "ลิงก์จะแสดงตามตารางหมอจริงทุกวัน" or auto-close count if some shifts
//     have different roomIds)
//   ⚠ amber — picked room NOT in doctor's licensed roomIds (data shows
//     "ลูกค้าจะเห็น 'ปิด' N วัน" + suggests editing doctor schedules)
//   ⓘ neutral — doctor has no shift entries at all (data suggests adding
//     schedules in tab=doctor-schedules)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const adminDashSrc = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

describe('V59.P1 — schedDoctorSchedules state + fetch hook', () => {
  it('P1.1 schedDoctorSchedules useState declared', () => {
    expect(adminDashSrc).toMatch(
      /const\s*\[\s*schedDoctorSchedules\s*,\s*setSchedDoctorSchedules\s*\]\s*=\s*useState\(\[\]\)/,
    );
  });

  it('P1.2 useEffect fetches listStaffSchedules when doctor picked', () => {
    expect(adminDashSrc).toMatch(
      /listStaffSchedules\(\s*\{\s*branchId:\s*selectedBranchId\s*,\s*staffId:\s*schedSelectedDoctor\s*\}\s*\)/,
    );
  });

  it('P1.3 fetch effect has cancellation guard (V55 pattern)', () => {
    // Mirror of livePractitioners cancellation pattern
    expect(adminDashSrc).toMatch(/let cancelled = false;[\s\S]{0,400}?listStaffSchedules[\s\S]{0,400}?if \(!cancelled\) setSchedDoctorSchedules/);
  });

  it('P1.4 useEffect deps include schedSelectedDoctor + selectedBranchId', () => {
    expect(adminDashSrc).toMatch(
      /\}\s*,\s*\[schedSelectedDoctor\s*,\s*selectedBranchId\]\s*\)/,
    );
  });

  it('P1.5 effect skips fetch when schedSelectedDoctor is null (clears state)', () => {
    expect(adminDashSrc).toMatch(
      /if \(!schedSelectedDoctor\) \{ setSchedDoctorSchedules\(\[\]\); return; \}/,
    );
  });
});

describe('V59.P2 — v59Preview useMemo derivation', () => {
  it('P2.1 v59Preview useMemo declared', () => {
    expect(adminDashSrc).toMatch(/const\s+v59Preview\s*=\s*useMemo\s*\(/);
  });

  it('P2.2 v59Preview returns null when either doctor or room not picked', () => {
    expect(adminDashSrc).toMatch(
      /if \(!schedSelectedDoctor \|\| !schedSelectedRoom\) return null;/,
    );
  });

  it('P2.3 v59Preview calls derivedAutoClosedDates with correct opts', () => {
    expect(adminDashSrc).toMatch(
      /derivedAutoClosedDates\(\s*\{[\s\S]{0,200}?doctorId:\s*schedSelectedDoctor[\s\S]{0,200}?roomId:\s*schedSelectedRoom[\s\S]{0,200}?allEntries:\s*schedDoctorSchedules[\s\S]{0,200}?datesISO:\s*datesInRange/,
    );
  });

  it('P2.4 v59Preview returns shape with closedCount, totalDays, isLicensed, hasShifts, doctorName, roomName', () => {
    expect(adminDashSrc).toMatch(/closedCount:\s*closed\.length/);
    expect(adminDashSrc).toMatch(/totalDays:\s*datesInRange\.length/);
    expect(adminDashSrc).toMatch(/isLicensed/);
    expect(adminDashSrc).toMatch(/hasShifts/);
    expect(adminDashSrc).toMatch(/doctorName/);
    expect(adminDashSrc).toMatch(/roomName/);
  });

  it('P2.5 v59Preview deps array includes all reactive inputs', () => {
    // useMemo with deps: schedSelectedDoctor, schedSelectedRoom,
    // schedStartMonth, schedAdvanceMonths, schedDoctorSchedules,
    // practitioners, branchExamRooms
    expect(adminDashSrc).toMatch(
      /\[\s*schedSelectedDoctor\s*,\s*schedSelectedRoom\s*,\s*schedStartMonth\s*,\s*schedAdvanceMonths\s*,\s*schedDoctorSchedules\s*,\s*practitioners\s*,\s*branchExamRooms\s*,?\s*\]/,
    );
  });
});

describe('V59.P3 — JSX inline preview render (3 states)', () => {
  it('P3.1 renders ONLY when v59Preview is non-null', () => {
    expect(adminDashSrc).toMatch(/\{v59Preview\s*&&\s*\(/);
  });

  it('P3.2 green state — isLicensed true + data-testid v59-preview-licensed', () => {
    expect(adminDashSrc).toMatch(/data-testid="v59-preview-licensed"/);
    // Green/emerald color tokens
    expect(adminDashSrc).toMatch(/bg-emerald-900\/20/);
    expect(adminDashSrc).toMatch(/text-emerald-300/);
    // ✓ checkmark + Thai text
    expect(adminDashSrc).toMatch(/✓\s*<span className="font-bold">ห้อง/);
  });

  it('P3.3 amber state — mismatch + data-testid v59-preview-mismatch', () => {
    expect(adminDashSrc).toMatch(/data-testid="v59-preview-mismatch"/);
    expect(adminDashSrc).toMatch(/bg-amber-900\/20/);
    expect(adminDashSrc).toMatch(/text-amber-300/);
    expect(adminDashSrc).toMatch(/⚠/);
    expect(adminDashSrc).toMatch(/ลูกค้าจะเห็น/);
    expect(adminDashSrc).toMatch(/แนะนำให้แก้ไขห้องที่หมอเข้าตรวจ/);
  });

  it('P3.4 neutral state — no shifts + data-testid v59-preview-no-shifts', () => {
    expect(adminDashSrc).toMatch(/data-testid="v59-preview-no-shifts"/);
    expect(adminDashSrc).toMatch(/ⓘ/);
    expect(adminDashSrc).toMatch(/ยังไม่มีตารางทำงานในสาขานี้/);
    expect(adminDashSrc).toMatch(/href="\?backend=1&tab=doctor-schedules"/);
  });
});

describe('V59.P4 — V59 marker + integration with V56', () => {
  it('P4.1 V59 marker present in source', () => {
    expect(adminDashSrc).toMatch(/V59\s*\/\s*2026-05-08/);
  });

  it('P4.2 reuses derivedAutoClosedDates (V56 helper) — no duplicate computation', () => {
    // Single source of truth for closure logic. V59 doesn't re-implement;
    // it consumes the same helper that handleGenScheduleLink uses.
    expect(adminDashSrc).toMatch(
      /import\s*\{[^}]*derivedAutoClosedDates[^}]*\}\s*from\s*['"][^'"]+staffScheduleValidation\.js['"]/,
    );
  });

  it('P4.3 reuses listStaffSchedules from scopedDataLayer (BS-1 compliance)', () => {
    expect(adminDashSrc).toMatch(
      /import\s*\{[^]*listStaffSchedules[^]*\}\s*from\s*['"][^'"]*scopedDataLayer\.js['"]/,
    );
  });
});

describe('V59.P5 — pure simulator of preview classification', () => {
  // Simulator mirroring the inline JSX classification:
  //   v59Preview.isLicensed === true → green
  //   v59Preview.hasShifts && !v59Preview.isLicensed → amber
  //   !v59Preview.hasShifts → neutral

  function classifyPreview(preview) {
    if (!preview) return 'none';
    if (preview.isLicensed) return 'green';
    if (preview.hasShifts) return 'amber';
    return 'neutral';
  }

  it('P5.1 null preview (no doctor/room picked) → none', () => {
    expect(classifyPreview(null)).toBe('none');
  });

  it('P5.2 doctor with schedule + matching room → green', () => {
    expect(classifyPreview({ isLicensed: true, hasShifts: true, closedCount: 0 })).toBe('green');
  });

  it('P5.3 doctor with schedule + mismatched room → amber', () => {
    expect(classifyPreview({ isLicensed: false, hasShifts: true, closedCount: 5 })).toBe('amber');
  });

  it('P5.4 doctor with no shift entries at all → neutral', () => {
    expect(classifyPreview({ isLicensed: false, hasShifts: false, closedCount: 0 })).toBe('neutral');
  });

  it('P5.5 doctor licensed for some days but not others → still green (admin sees mixed message)', () => {
    // V59 design: even when SOME shifts have the room and others don't, we
    // show green because the doctor IS licensed for the room. The closure
    // count tells admin how many days will be closed.
    const out = classifyPreview({ isLicensed: true, hasShifts: true, closedCount: 3 });
    expect(out).toBe('green');
  });
});
