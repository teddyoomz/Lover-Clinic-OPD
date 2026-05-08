// tests/v55-schedule-link-modal-branch-scope.test.js
// V55 / BS-14 (2026-05-08) — schedule-link modal branch-scope helper-unit
// + adversarial bank.
//
// User report (verbatim 2026-05-08):
//   "modal สร้างลิ้งค์ตาราง ยังไม่ได้ดึงข้อมูลต่างๆใน modal จากสาขานั้นๆ"
//
// And follow-up clarifying the two-layer architecture:
//   "ทำให้ลิ้งค์ตารางที่ส่ง สัมพันธ์กับหมอที่เข้างานจริง สัมพันธ์กับห้อง
//    ตรวจนั้นๆ ... แต่ว่าสำหรับการสร้างลิ้ง เมื่อนำข้อมูลจริงมาจาก backend
//    จะต้องมาติด filter บริเวณ ตั้งค่าตารางคลินิก ทั้งการเปิดปิดวัน
//    และเปิดปิดช่วงเวลา"
//
// Class-of-bug: V12 multi-reader-sweep at AdminDashboard "Frontend" page —
// branch-scoped data adoption gap. Same family as V52/BS-11, V53/BS-12,
// V54/BS-13. This bank covers:
//
//   L1  — mergeBranchIntoClinic produces per-branch openHoursMonFri/SatSun
//   L2  — V55 hours fallback chain (per-branch → legacy global → literal)
//   L3  — be_exam_rooms.kind → role mapping (legacy callsite parity)
//   L4  — defensive reset logic (schedSelectedDoctor/Room invalidation)
//   L5  — filterDoctorsByBranch / filterStaffByBranch — backward-compat
//         empty branchIds = "all branches accessible" (V36 lock)
//   L6  — adversarial inputs (null/undefined/empty/Thai/numeric/string ids)
//   L7  — V55 source-grep markers exist
//
// Companion: tests/v55-schedule-link-modal-flow-simulate.test.js (Rule I).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mergeBranchIntoClinic } from '../src/lib/BranchContext.jsx';
import {
  filterDoctorsByBranch,
  filterStaffByBranch,
  isStaffAccessibleInBranch,
} from '../src/lib/branchScopeUtils.js';

// ─── L1 — mergeBranchIntoClinic produces per-branch openHoursMonFri/SatSun ───
describe('V55.L1 — mergeBranchIntoClinic per-branch openHours', () => {
  const baseClinicSettings = {
    clinicOpenTime: '09:00',
    clinicCloseTime: '21:00',
    clinicOpenTimeWeekend: '08:00',
    clinicCloseTimeWeekend: '18:00',
    openHoursMonFri: { open: '09:00', close: '21:00' }, // global default
    openHoursSatSun: { open: '08:00', close: '18:00' },
    clinicName: 'Lover Clinic',
  };

  it('L1.1 branch settings.openHours.monFri overrides global cs.openHoursMonFri', () => {
    const branch = {
      branchId: 'br-a',
      name: 'พระราม 3',
      settings: {
        openHours: {
          monFri: { open: '11:00', close: '15:00' },
          satSun: { open: '12:00', close: '16:00' },
        },
      },
    };
    const merged = mergeBranchIntoClinic(baseClinicSettings, branch);
    expect(merged.openHoursMonFri).toEqual({ open: '11:00', close: '15:00' });
    expect(merged.openHoursSatSun).toEqual({ open: '12:00', close: '16:00' });
  });

  it('L1.2 missing branch.settings.openHours → falls back to global cs.openHoursMonFri', () => {
    const branch = { branchId: 'br-b', name: 'นครราชสีมา', settings: {} };
    const merged = mergeBranchIntoClinic(baseClinicSettings, branch);
    expect(merged.openHoursMonFri).toEqual({ open: '09:00', close: '21:00' });
    expect(merged.openHoursSatSun).toEqual({ open: '08:00', close: '18:00' });
  });

  it('L1.3 null branch → returns clinicSettings unchanged', () => {
    const merged = mergeBranchIntoClinic(baseClinicSettings, null);
    expect(merged).toBe(baseClinicSettings);
  });

  it('L1.4 undefined branch → returns clinicSettings unchanged', () => {
    const merged = mergeBranchIntoClinic(baseClinicSettings, undefined);
    expect(merged).toBe(baseClinicSettings);
  });

  it('L1.5 cross-branch: switching branch changes openHours independently', () => {
    const brA = { branchId: 'a', settings: { openHours: { monFri: { open: '10:00', close: '20:00' } } } };
    const brB = { branchId: 'b', settings: { openHours: { monFri: { open: '12:00', close: '15:00' } } } };
    const mergedA = mergeBranchIntoClinic(baseClinicSettings, brA);
    const mergedB = mergeBranchIntoClinic(baseClinicSettings, brB);
    expect(mergedA.openHoursMonFri).toEqual({ open: '10:00', close: '20:00' });
    expect(mergedB.openHoursMonFri).toEqual({ open: '12:00', close: '15:00' });
    // A and B don't pollute each other
    expect(mergedA.openHoursMonFri).not.toEqual(mergedB.openHoursMonFri);
  });

  it('L1.6 partial settings.openHours.monFri but missing satSun → satSun falls back', () => {
    const branch = {
      branchId: 'a',
      settings: {
        openHours: {
          monFri: { open: '11:00', close: '15:00' },
          // satSun missing
        },
      },
    };
    const merged = mergeBranchIntoClinic(baseClinicSettings, branch);
    expect(merged.openHoursMonFri).toEqual({ open: '11:00', close: '15:00' });
    expect(merged.openHoursSatSun).toEqual({ open: '08:00', close: '18:00' });
  });
});

// ─── L2 — V55 hours fallback chain ───
//
// Pure simulator of the inline AdminDashboard.jsx helpers:
//   monFriOpen = (cs.openHoursMonFri?.open) || clinicSettings.clinicOpenTime || '10:00'
//   monFriClose = (cs.openHoursMonFri?.close) || clinicSettings.clinicCloseTime || '19:00'
//   ...
//
// 3-tier fallback: per-branch (V51) → legacy global (clinicSettings.X) → literal floor.
function v55MonFriOpen(cs, clinicSettings) {
  return (cs?.openHoursMonFri?.open) || clinicSettings?.clinicOpenTime || '10:00';
}
function v55MonFriClose(cs, clinicSettings) {
  return (cs?.openHoursMonFri?.close) || clinicSettings?.clinicCloseTime || '19:00';
}
function v55SatSunOpen(cs, clinicSettings) {
  return (cs?.openHoursSatSun?.open) || clinicSettings?.clinicOpenTimeWeekend || '10:00';
}
function v55SatSunClose(cs, clinicSettings) {
  return (cs?.openHoursSatSun?.close) || clinicSettings?.clinicCloseTimeWeekend || '17:00';
}

describe('V55.L2 — hours fallback chain (per-branch → legacy → literal floor)', () => {
  it('L2.1 per-branch openHoursMonFri.open wins', () => {
    const cs = { openHoursMonFri: { open: '11:00', close: '15:00' } };
    const clinicSettings = { clinicOpenTime: '09:00', clinicCloseTime: '21:00' };
    expect(v55MonFriOpen(cs, clinicSettings)).toBe('11:00');
    expect(v55MonFriClose(cs, clinicSettings)).toBe('15:00');
  });

  it('L2.2 missing per-branch openHoursMonFri → fallback to clinicSettings.clinicOpenTime', () => {
    const cs = {};
    const clinicSettings = { clinicOpenTime: '09:00', clinicCloseTime: '21:00' };
    expect(v55MonFriOpen(cs, clinicSettings)).toBe('09:00');
    expect(v55MonFriClose(cs, clinicSettings)).toBe('21:00');
  });

  it('L2.3 both missing → literal floor 10:00 / 19:00', () => {
    const cs = {};
    const clinicSettings = {};
    expect(v55MonFriOpen(cs, clinicSettings)).toBe('10:00');
    expect(v55MonFriClose(cs, clinicSettings)).toBe('19:00');
  });

  it('L2.4 satSun fallback chain', () => {
    const cs = { openHoursSatSun: { open: '12:00', close: '16:00' } };
    const clinicSettings = { clinicOpenTimeWeekend: '08:00', clinicCloseTimeWeekend: '18:00' };
    expect(v55SatSunOpen(cs, clinicSettings)).toBe('12:00');
    expect(v55SatSunClose(cs, clinicSettings)).toBe('16:00');
  });

  it('L2.5 satSun both missing → literal floor 10:00 / 17:00 (note: weekend close 17:00)', () => {
    expect(v55SatSunOpen({}, {})).toBe('10:00');
    expect(v55SatSunClose({}, {})).toBe('17:00');
  });

  it('L2.6 per-branch open empty string → falls through to legacy', () => {
    // openHoursMonFri.open === '' is falsy via ||
    const cs = { openHoursMonFri: { open: '', close: '' } };
    const clinicSettings = { clinicOpenTime: '09:00', clinicCloseTime: '21:00' };
    expect(v55MonFriOpen(cs, clinicSettings)).toBe('09:00');
    expect(v55MonFriClose(cs, clinicSettings)).toBe('21:00');
  });

  it('L2.7 cross-branch isolation (re-mount with different branch produces different hours)', () => {
    const csA = { openHoursMonFri: { open: '10:00', close: '20:00' } };
    const csB = { openHoursMonFri: { open: '12:00', close: '15:00' } };
    const clinicSettings = { clinicOpenTime: '09:00', clinicCloseTime: '21:00' };
    expect(v55MonFriOpen(csA, clinicSettings)).toBe('10:00');
    expect(v55MonFriOpen(csB, clinicSettings)).toBe('12:00');
  });
});

// ─── L3 — be_exam_rooms.kind → role mapping (callsite parity) ───
//
// Pure simulator of the AdminDashboard.jsx branchExamRooms useEffect mapper:
//   const mapped = (rooms || []).map(r => ({
//     id: r.id,
//     name: r.name,
//     role: r.kind === 'doctor' ? 'doctor' : 'staff',
//     kind: r.kind,
//   }));
//
// Legacy callsites (lines 917, 1308, 1376, 4026 in AdminDashboard) read
// `r.role` ('doctor' | 'staff'). New be_exam_rooms uses `kind`. Mapper
// preserves both for forward compat.
function v55MapBeExamRoomsToLegacyShape(rooms) {
  return (rooms || []).map((r) => ({
    id: r.id,
    name: r.name,
    role: r.kind === 'doctor' ? 'doctor' : 'staff',
    kind: r.kind,
  }));
}

describe('V55.L3 — be_exam_rooms.kind → role mapping', () => {
  it('L3.1 kind="doctor" maps to role="doctor"', () => {
    const out = v55MapBeExamRoomsToLegacyShape([
      { id: 'r-1', name: 'ห้องตรวจ A', kind: 'doctor', branchId: 'br-a' },
    ]);
    expect(out).toEqual([
      { id: 'r-1', name: 'ห้องตรวจ A', role: 'doctor', kind: 'doctor' },
    ]);
  });

  it('L3.2 kind="staff" maps to role="staff"', () => {
    const out = v55MapBeExamRoomsToLegacyShape([
      { id: 'r-2', name: 'ห้องผ่าตัด', kind: 'staff' },
    ]);
    expect(out[0].role).toBe('staff');
    expect(out[0].kind).toBe('staff');
  });

  it('L3.3 kind="" (empty) maps to role="staff" (default)', () => {
    const out = v55MapBeExamRoomsToLegacyShape([
      { id: 'r-3', name: 'ห้องไม่ระบุ', kind: '' },
    ]);
    expect(out[0].role).toBe('staff');
  });

  it('L3.4 missing kind → role="staff" (defensive default)', () => {
    const out = v55MapBeExamRoomsToLegacyShape([
      { id: 'r-4', name: 'ห้องเก่า' },
    ]);
    expect(out[0].role).toBe('staff');
    expect(out[0].kind).toBeUndefined();
  });

  it('L3.5 null/undefined input → empty array', () => {
    expect(v55MapBeExamRoomsToLegacyShape(null)).toEqual([]);
    expect(v55MapBeExamRoomsToLegacyShape(undefined)).toEqual([]);
  });

  it('L3.6 multiple rooms preserve order', () => {
    const out = v55MapBeExamRoomsToLegacyShape([
      { id: 'a', name: 'A', kind: 'doctor' },
      { id: 'b', name: 'B', kind: 'staff' },
      { id: 'c', name: 'C', kind: 'doctor' },
    ]);
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(out.map((r) => r.role)).toEqual(['doctor', 'staff', 'doctor']);
  });

  it('L3.7 Thai room names preserved verbatim', () => {
    const out = v55MapBeExamRoomsToLegacyShape([
      { id: 'r-thai', name: 'ห้องตรวจ/ผ่าตัด', kind: 'doctor' },
    ]);
    expect(out[0].name).toBe('ห้องตรวจ/ผ่าตัด');
  });

  it('L3.8 numeric vs string id preserved (no coerce)', () => {
    const out = v55MapBeExamRoomsToLegacyShape([
      { id: 123, name: 'A', kind: 'doctor' },
      { id: 'abc', name: 'B', kind: 'staff' },
    ]);
    expect(out[0].id).toBe(123);
    expect(out[1].id).toBe('abc');
  });
});

// ─── L4 — defensive reset logic ───
//
// Pure simulator of the AdminDashboard.jsx useEffect:
//   if (!livePractitioners || schedSelectedDoctor == null) return null;
//   const found = livePractitioners.some(p => String(p.id) === String(schedSelectedDoctor));
//   if (!found) return null; // signals reset
//   return schedSelectedDoctor; // keep
function v55ResetIfNotInList(list, currentId, idKey = 'id') {
  if (!Array.isArray(list) || currentId == null) return currentId;
  const found = list.some((x) => String(x[idKey]) === String(currentId));
  return found ? currentId : null;
}

describe('V55.L4 — defensive reset on branch switch', () => {
  it('L4.1 doctor still in branch list → keep selection', () => {
    const list = [{ id: 'd-1', name: 'A' }, { id: 'd-2', name: 'B' }];
    expect(v55ResetIfNotInList(list, 'd-1')).toBe('d-1');
  });

  it('L4.2 doctor NOT in branch list (branch switched) → reset to null', () => {
    const list = [{ id: 'd-3', name: 'C' }, { id: 'd-4', name: 'D' }];
    expect(v55ResetIfNotInList(list, 'd-1')).toBeNull();
  });

  it('L4.3 currentId null → keep null (no reset needed)', () => {
    expect(v55ResetIfNotInList([{ id: 'a' }], null)).toBeNull();
  });

  it('L4.4 list null/undefined → keep current (effect not fired yet)', () => {
    expect(v55ResetIfNotInList(null, 'd-1')).toBe('d-1');
    expect(v55ResetIfNotInList(undefined, 'd-1')).toBe('d-1');
  });

  it('L4.5 numeric id vs string id stringified comparison', () => {
    const list = [{ id: 123 }];
    expect(v55ResetIfNotInList(list, '123')).toBe('123');
    expect(v55ResetIfNotInList(list, 123)).toBe(123);
  });

  it('L4.6 empty list + non-null currentId → reset', () => {
    expect(v55ResetIfNotInList([], 'd-1')).toBeNull();
  });

  it('L4.7 mirror logic for rooms (different idKey not needed; mapper produced .id)', () => {
    const rooms = [{ id: 'r-1', name: 'A' }, { id: 'r-2', name: 'B' }];
    expect(v55ResetIfNotInList(rooms, 'r-1')).toBe('r-1');
    expect(v55ResetIfNotInList(rooms, 'r-9')).toBeNull();
  });

  it('L4.8 cross-branch: A→B switch invalidates A-only doctor', () => {
    const branchADocs = [{ id: 'd-1' }, { id: 'd-2' }];
    const branchBDocs = [{ id: 'd-3' }, { id: 'd-4' }];
    // Pre-switch: pick d-1 from A
    let pickedDoctor = 'd-1';
    expect(v55ResetIfNotInList(branchADocs, pickedDoctor)).toBe('d-1');
    // Branch switch → re-fetch returns branch B docs
    pickedDoctor = v55ResetIfNotInList(branchBDocs, pickedDoctor);
    expect(pickedDoctor).toBeNull();
  });
});

// ─── L5 — filterDoctorsByBranch / filterStaffByBranch (V36 backward-compat) ──
describe('V55.L5 — branch filter on doctors/staff', () => {
  it('L5.1 empty branchIds = "all branches accessible" (V36 lock)', () => {
    const doctor = { id: 'd-1', name: 'A' }; // no branchIds field
    expect(isStaffAccessibleInBranch(doctor, 'br-a')).toBe(true);
  });

  it('L5.2 empty array branchIds = "all branches accessible"', () => {
    const doctor = { id: 'd-1', name: 'A', branchIds: [] };
    expect(isStaffAccessibleInBranch(doctor, 'br-a')).toBe(true);
  });

  it('L5.3 explicit branchIds = ["br-a"] only accessible in br-a', () => {
    const doctor = { id: 'd-1', name: 'A', branchIds: ['br-a'] };
    expect(isStaffAccessibleInBranch(doctor, 'br-a')).toBe(true);
    expect(isStaffAccessibleInBranch(doctor, 'br-b')).toBe(false);
  });

  it('L5.4 explicit branchIds + null branchId arg → accessible (defensive — caller not branch-aware yet)', () => {
    const doctor = { id: 'd-1', name: 'A', branchIds: ['br-a'] };
    expect(isStaffAccessibleInBranch(doctor, null)).toBe(true);
  });

  it('L5.5 filterDoctorsByBranch returns only branch-accessible doctors', () => {
    const docs = [
      { id: 'd-1', name: 'A', branchIds: ['br-a'] },
      { id: 'd-2', name: 'B', branchIds: ['br-b'] },
      { id: 'd-3', name: 'C', branchIds: ['br-a', 'br-b'] }, // multi-branch
      { id: 'd-4', name: 'D' }, // no branchIds — universal access
    ];
    const a = filterDoctorsByBranch(docs, 'br-a');
    expect(a.map((d) => d.id).sort()).toEqual(['d-1', 'd-3', 'd-4']);
    const b = filterDoctorsByBranch(docs, 'br-b');
    expect(b.map((d) => d.id).sort()).toEqual(['d-2', 'd-3', 'd-4']);
  });

  it('L5.6 filterStaffByBranch + filterDoctorsByBranch are aliases (single-code-path)', () => {
    const list = [{ id: 's-1', branchIds: ['br-a'] }];
    expect(filterStaffByBranch(list, 'br-a')).toEqual(filterDoctorsByBranch(list, 'br-a'));
  });

  it('L5.7 non-array input → empty result (defensive)', () => {
    expect(filterStaffByBranch(null, 'br-a')).toEqual([]);
    expect(filterStaffByBranch(undefined, 'br-a')).toEqual([]);
  });
});

// ─── L6 — adversarial inputs ───
describe('V55.L6 — adversarial inputs', () => {
  it('L6.1 mergeBranchIntoClinic with null clinicSettings → handles via or-fallback', () => {
    const out = mergeBranchIntoClinic(null, { branchId: 'a', settings: {} });
    expect(out).toBeDefined();
  });

  it('L6.2 mergeBranchIntoClinic with non-object branch → returns clinicSettings', () => {
    const cs = { clinicName: 'X' };
    expect(mergeBranchIntoClinic(cs, 'string-not-object')).toBe(cs);
    expect(mergeBranchIntoClinic(cs, 42)).toBe(cs);
    expect(mergeBranchIntoClinic(cs, true)).toBe(cs);
  });

  it('L6.3 v55MonFriOpen with cs=null → fallback chain still works', () => {
    expect(v55MonFriOpen(null, { clinicOpenTime: '09:00' })).toBe('09:00');
    expect(v55MonFriOpen(null, null)).toBe('10:00');
  });

  it('L6.4 v55MapBeExamRoomsToLegacyShape with weird kind values', () => {
    const out = v55MapBeExamRoomsToLegacyShape([
      { id: 'a', kind: 'DOCTOR' }, // wrong case
      { id: 'b', kind: 'doctorish' }, // close-but-not-equal
      { id: 'c', kind: null },
    ]);
    // Strict equality === 'doctor' → only exact matches map to 'doctor'
    expect(out.map((r) => r.role)).toEqual(['staff', 'staff', 'staff']);
  });

  it('L6.5 defensive reset with NaN id', () => {
    const list = [{ id: 'a' }];
    expect(v55ResetIfNotInList(list, NaN)).toBeNull(); // String(NaN) = "NaN"
  });

  it('L6.6 filterDoctorsByBranch with empty branchId arg + explicit branchIds → defensive accept', () => {
    const docs = [{ id: 'd-1', branchIds: ['br-a'] }];
    expect(filterDoctorsByBranch(docs, '')).toEqual(docs); // empty branchId = "any"
  });

  it('L6.7 idempotent — re-running with same input produces same output', () => {
    const cs = { openHoursMonFri: { open: '11:00', close: '15:00' } };
    const clinicSettings = { clinicOpenTime: '09:00', clinicCloseTime: '21:00' };
    expect(v55MonFriOpen(cs, clinicSettings)).toBe(v55MonFriOpen(cs, clinicSettings));
    expect(v55MonFriClose(cs, clinicSettings)).toBe(v55MonFriClose(cs, clinicSettings));
  });
});

// ─── L7 — V55 source-grep markers + import wiring ───
describe('V55.L7 — source-grep markers', () => {
  const adminDashSrc = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

  it('L7.1 V55/BS-14 marker comments present (≥3 institutional-memory anchors)', () => {
    const matches = adminDashSrc.match(/V55\/BS-14/g) || [];
    expect(matches.length, 'V55/BS-14 marker comments missing').toBeGreaterThanOrEqual(3);
  });

  it('L7.2 user-directive verbatim quote captured in code comment', () => {
    expect(adminDashSrc).toMatch(/modal สร้างลิ้งค์ตาราง ยังไม่ได้ดึงข้อมูลต่างๆใน modal/);
  });

  it('L7.3 useEffectiveClinicSettings imported from BranchContext', () => {
    expect(adminDashSrc).toMatch(
      /import\s*\{[^}]*useEffectiveClinicSettings[^}]*\}\s*from\s*['"]\.\.\/lib\/BranchContext\.jsx['"]/,
    );
  });

  it('L7.4 NO bare-merge default cs pattern remains (anti-regression — V55 invalidates the legacy)', () => {
    expect(adminDashSrc).not.toMatch(
      /const\s+cs\s*=\s*\{\s*\.\.\.DEFAULT_CLINIC_SETTINGS\s*,\s*\.\.\.clinicSettings\s*\}\s*;/,
    );
  });

  it('L7.5 saved schedule-link doc stamps per-branch hours (NOT clinicSettings.X)', () => {
    expect(adminDashSrc).toMatch(/clinicOpenTime:\s*monFriOpen/);
    expect(adminDashSrc).toMatch(/doctorStartTime:\s*monFriOpen/);
  });
});
