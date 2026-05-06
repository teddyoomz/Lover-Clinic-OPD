// tests/phase-22-0c-schedule-link-branch-separation.test.js
// Phase 22.0c — frontend AdminDashboard schedule + clinic settings branch separation.
//
// Locks the contract per user directive (verbatim 2026-05-06):
//   "tab นัดหมายของ Frontend ยังไม่ดึงข้อมูลแยกสาขา โดยการตั้งค่า
//    ตารางคลินิก รวมถึงแก้ไขตารางหมอเข้า/ปิดคิว และ ลิ้งก์ตารางที่ส่งให้
//    ลูกค้า จะต้องเป็นข้อมูลคนละสาขากัน แยกกันทั้งหมด และต้องไปดึง หรือ
//    แสดง หรือแก้ไข ข้อมูลต่างๆของนัดในสาขาที่เลือกไว้ที่ branch
//    selector ในขณะนั้นเท่านั้น"

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

describe('Phase 22.0c — S1 clinic_schedules write stamps branchId', () => {
  test('S1.1 setDoc on clinic_schedules includes branchId field', () => {
    // The clinic_schedules CREATE block (around line 1184) has the
    // branchId stamp ~30 lines into the payload. Locate the create block
    // by anchoring on the setDoc + token signature, then assert branchId
    // appears in the same payload block (within 1500 chars).
    expect(SRC).toMatch(/setDoc\(doc\(db,\s*['"]artifacts['"][\s\S]{0,200}?clinic_schedules['"]\s*,\s*token\)[\s\S]{0,1500}?branchId:\s*selectedBranchId\s*\|\|\s*['"]['"]/);
  });

  test('S1.2 user safety directive captured in code comment', () => {
    expect(SRC).toMatch(/ลิ้งก์ตารางที่ส่งให้ลูกค้า จะต้องเป็นข้อมูลคนละสาขากัน/);
  });
});

describe('Phase 22.0c — S2 schedule list onSnapshot filters by selectedBranchId', () => {
  test('S2.1 list filter rejects docs from other branches (legacy null branchId allowed)', () => {
    // Match: !s.branchId || String(s.branchId) === String(selectedBranchId || '')
    expect(SRC).toMatch(/!s\.branchId\s*\|\|\s*String\(s\.branchId\)\s*===\s*String\(selectedBranchId\s*\|\|\s*['"]['"]\s*\)/);
  });

  test('S2.2 selectedBranchId in deps so listener re-subscribes on branch switch', () => {
    // The schedule-list useEffect deps array must include selectedBranchId
    // (the listener was [db, appId] pre-22.0c — adding selectedBranchId
    // forces re-subscribe on branch change so the list refreshes).
    const useEffectBlock = SRC.match(/const unsub = onSnapshot\([\s\S]{0,500}?clinic_schedules[\s\S]{0,600}?\}, \[db, appId, selectedBranchId\]\);/);
    expect(useEffectBlock).not.toBeNull();
  });
});

describe('Phase 22.0c — S3 schedule_prefs per-branch doc id', () => {
  test('S3.1 read uses branchPrefsId computed from selectedBranchId', () => {
    expect(SRC).toMatch(/const branchPrefsId = `schedule_prefs\$\{selectedBranchId \? `__\$\{selectedBranchId\}` : ['"]['"]\}`/);
  });

  test('S3.2 read falls back to legacy global doc when per-branch doesn\'t exist', () => {
    expect(SRC).toMatch(/if \(!snap\.exists\(\)\s*&&\s*selectedBranchId\)[\s\S]{0,400}?clinic_settings['"][\s\S]{0,40}?schedule_prefs/);
  });

  test('S3.3 write uses branchPrefsId (separate doc per branch)', () => {
    expect(SRC).toMatch(/setDoc\(doc\(db,\s*['"]artifacts['"][\s\S]{0,200}?clinic_settings['"][\s\S]{0,40}?branchPrefsId\)/);
  });

  test('S3.4 saved schedule_prefs doc carries branchId field for forensic trace', () => {
    expect(SRC).toMatch(/branchId:\s*selectedBranchId\s*\|\|\s*null,[\s\S]{0,100}?doctorDays:/);
  });
});

describe('Phase 22.0c — S4 updateActiveSchedules per-schedule branchId query', () => {
  test('S4.1 monthBranchKeys composed from each schedule\'s branchId', () => {
    expect(SRC).toMatch(/monthBranchKeys = new Set/);
    expect(SRC).toMatch(/const sBranch = s\.branchId \|\| ['"]['"]/);
    expect(SRC).toMatch(/monthBranchKeys\.add\(`\$\{mo\}\|\$\{sBranch\}`\)/);
  });

  test('S4.2 getAppointmentsByMonth called with per-branch opts (not the admin\'s current selectedBranchId)', () => {
    expect(SRC).toMatch(/getAppointmentsByMonth\(mo,\s*opts\)/);
    expect(SRC).toMatch(/const opts = sBranch \?\s*\{\s*branchId:\s*sBranch\s*\}\s*:\s*\{\s*allBranches:\s*true\s*\}/);
  });

  test('S4.3 schedule loop reads the per-month-branch bucket', () => {
    expect(SRC).toMatch(/apptsByMonthBranch\[`\$\{mo\}\|\$\{sBranch\}`\]/);
  });

  test('S4.4 schedule-resync (after create) uses the schedule\'s own branchId', () => {
    // The post-create resync block uses selectedBranchId which is the same
    // branch the schedule was just stamped with.
    expect(SRC).toMatch(/branchOpts = selectedBranchId \?\s*\{\s*branchId:\s*selectedBranchId\s*\}/);
  });
});

describe('Phase 22.0c — S5 listenToAppointmentsByMonth queue-listener (Phase 20.0 baseline preserved)', () => {
  test('S5.1 selectedBranchId still in deps array', () => {
    // Phase 20.0 Task 6 already added this; 22.0c verifies it stayed.
    expect(SRC).toMatch(/listenToAppointmentsByMonth\([\s\S]{0,500}?\}, \[apptMonth, db, appId, selectedBranchId\]\);/);
  });
});

describe('Phase 22.0c — S6 markers + anti-regression', () => {
  test('S6.1 Phase 22.0c marker present', () => {
    expect(SRC).toMatch(/Phase 22\.0c/);
  });

  test('S6.2 schedule_prefs HARDCODED (no branchId suffix) MUST NOT appear in WRITE site (anti-regression)', () => {
    // Pre-22.0c: setDoc(doc(..., 'clinic_settings', 'schedule_prefs'), {...})
    // Post-22.0c: setDoc(doc(..., 'clinic_settings', branchPrefsId), {...})
    // The hardcoded literal 'schedule_prefs' may STILL appear in the read
    // fallback (legacy compat) but NOT in the write path.
    const writeBlock = SRC.match(/saveSchedulePrefs[\s\S]{0,1000}?setDoc\(doc\(db[\s\S]{0,400}?clinic_settings['"][\s\S]{0,80}?\)/);
    expect(writeBlock).not.toBeNull();
    expect(writeBlock[0]).toMatch(/branchPrefsId/);
    expect(writeBlock[0]).not.toMatch(/['"]schedule_prefs['"]\s*\)/);
  });

  test('S6.3 user verbatim directive captured', () => {
    expect(SRC).toMatch(/จะต้องเป็นข้อมูลคนละสาขากัน|ตามสาขาที่เลือกไว้/);
  });
});
