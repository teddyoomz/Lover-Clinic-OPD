// V61 / AV33 (2026-05-08) — Schedule-link modal room dropdown driven by
// be_staff_schedules canonical source (NOT V57 be_exam_rooms.kind static
// filter). Closes V12 multi-reader-sweep at the schedule-link MODAL UI
// boundary. Sister to V60 (SAVE boundary) + V52-V55 (READ boundary).
//
// User report (verbatim, 2026-05-08):
//   "เพิ่มเงื่อนไขใน Modal สร้างลิงก์ตาราง คือ หากไม่ได้ติ๊กไม่พบแพทย์
//    แปลว่าเป็นการสร้างลิ้งค์พบแพทย์ ลิ้งค์พบแพทย์จะแสดงแต่ห้องที่แพทย์
//    คนนั้นๆที่เลือกใน dropdown เข้าตรวจ ตามในระยะเวลาในช่อง 'แสดงทั้งหมด' ..."
//
// Design Q1=B refined (union for "แพทย์ทุกคน"), Q2=A (pre-flight gate),
// Q3=B (keep "ทุกห้อง" with union semantics), Q4=A (snapshot at gen+resync).
// Spec: docs/superpowers/specs/2026-05-08-v61-schedule-link-room-dropdown-from-schedules-design.md
//
// Test groups (per Rule N — targeted; full suite at batch end):
//   H1-H8 — Pure helper unit + adversarial (deriveDoctorRoomIdsForWindow + deriveNonDoctorRoomIdsForWindow)
//   F1-F4 — shouldBlockScheduleSlot extension (selectedRoomIds array + backward compat)
//   M1-M8 — Source-grep regression (modal logic + save shape + resync wiring)
//   G1-G4 — Pre-flight gate (modal banner + handleGenScheduleLink early-return)
//   X1-X8 — Mixed combinations matrix (Rule I full-flow simulate; user "ปนเป ปั่นป่วน")

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  deriveDoctorRoomIdsForWindow,
  deriveNonDoctorRoomIdsForWindow,
  derivedDoctorDaysFromSchedules,
} from '../src/lib/staffScheduleValidation.js';
import { shouldBlockScheduleSlot } from '../src/lib/scheduleFilterUtils.js';

const ADMIN_DASHBOARD_SRC = readFileSync(
  resolve(process.cwd(), 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const SCHEDULE_VALIDATION_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/staffScheduleValidation.js'),
  'utf8',
);
const FILTER_UTILS_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/scheduleFilterUtils.js'),
  'utf8',
);

// ─── Test fixtures ─────────────────────────────────────────────────────
// Mirror prod doctor หมอมายด์ (V60 fixture): recurring Sun/Mon/Wed/Sat
// with 2 rooms.
const DOC_A = 'DOC-mov2p9c0-a79c20370455d9f9';
const DOC_B = 'DOC-otherdoc-1234567890abcdef';
const ROOM_A = 'EXR-1778150484640-e7ba71fa';
const ROOM_B = 'EXR-1778150514313-897c3d97';
const ROOM_SHOCKWAVE = 'EXR-shockwave-only-1';
const ROOM_DRIP = 'EXR-drip-room-2';

const RECURRING_DOC_A = [
  { id: 'STFSCH-A-1', staffId: DOC_A, type: 'recurring', dayOfWeek: 3, startTime: '16:30', endTime: '20:30', roomIds: [ROOM_A, ROOM_B] },
  { id: 'STFSCH-A-2', staffId: DOC_A, type: 'recurring', dayOfWeek: 6, startTime: '13:30', endTime: '19:30', roomIds: [ROOM_A, ROOM_B] },
  { id: 'STFSCH-A-3', staffId: DOC_A, type: 'recurring', dayOfWeek: 1, startTime: '16:30', endTime: '20:30', roomIds: [ROOM_A, ROOM_B] },
  { id: 'STFSCH-A-4', staffId: DOC_A, type: 'recurring', dayOfWeek: 0, startTime: '13:30', endTime: '19:30', roomIds: [ROOM_A, ROOM_B] },
];
// Doctor B has different rooms (introduces variety for "แพทย์ทุกคน" union)
const RECURRING_DOC_B = [
  { id: 'STFSCH-B-1', staffId: DOC_B, type: 'recurring', dayOfWeek: 2, startTime: '10:00', endTime: '14:00', roomIds: [ROOM_DRIP] },
  { id: 'STFSCH-B-2', staffId: DOC_B, type: 'recurring', dayOfWeek: 4, startTime: '10:00', endTime: '14:00', roomIds: [ROOM_DRIP] },
];
const BRANCH_ROOMS_FULL = [
  { id: ROOM_A, name: 'ห้องแพทย์ 1', kind: 'doctor', status: 'ใช้งาน' },
  { id: ROOM_B, name: 'ห้องแพทย์ 2', kind: 'doctor', status: 'ใช้งาน' },
  { id: ROOM_DRIP, name: 'ห้องดริป', kind: 'doctor', status: 'ใช้งาน' },
  { id: ROOM_SHOCKWAVE, name: 'ห้องช็อคเวฟ', kind: 'staff', status: 'ใช้งาน' },
];

function buildMonth(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) out.push(`${yyyymm}-${String(d).padStart(2, '0')}`);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// H — Pure helpers (deriveDoctorRoomIdsForWindow + deriveNonDoctorRoomIdsForWindow)
// ═══════════════════════════════════════════════════════════════════════

describe('V61.H1 — deriveDoctorRoomIdsForWindow specific doctor', () => {
  it('H1.1 — exports the helper', () => {
    expect(typeof deriveDoctorRoomIdsForWindow).toBe('function');
    expect(typeof deriveNonDoctorRoomIdsForWindow).toBe('function');
  });

  it('H1.2 — Doc A in May 2026 returns rooms A+B (his recurring rooms)', () => {
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([ROOM_A, ROOM_B].sort());
  });

  it('H1.3 — sorted ascending', () => {
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([...out].sort());
  });

  it('H1.4 — Doc B in May 2026 returns ROOM_DRIP only', () => {
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_B],
      allEntries: [...RECURRING_DOC_A, ...RECURRING_DOC_B],
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([ROOM_DRIP]);
  });

  it('H1.5 — non-existent doctorId returns []', () => {
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: ['DOC-nonexistent'],
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([]);
  });
});

describe('V61.H2 — deriveDoctorRoomIdsForWindow — แพทย์ทุกคน mode (Q1=B refined)', () => {
  it('H2.1 — null doctorIds → aggregates ALL doctors', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: null,
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toContain(ROOM_A);
    expect(out).toContain(ROOM_B);
    expect(out).toContain(ROOM_DRIP);
    expect(out).not.toContain(ROOM_SHOCKWAVE);
  });

  it('H2.2 — undefined doctorIds → ALL doctors', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const out = deriveDoctorRoomIdsForWindow({
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out.length).toBe(3);
  });

  it('H2.3 — empty doctorIds array → treated as "all"', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [],
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out.length).toBe(3);
  });

  it('H2.4 — multi-doctor explicit (multi-pick future-proof)', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A, DOC_B],
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([ROOM_A, ROOM_B, ROOM_DRIP].sort());
  });
});

describe('V61.H3 — deriveDoctorRoomIdsForWindow excludes off-shift entries', () => {
  it('H3.1 — leave/holiday/sick types skipped (no roomIds expected)', () => {
    const entries = [
      ...RECURRING_DOC_A,
      { id: 'X1', staffId: DOC_A, type: 'leave', date: '2026-05-04' }, // cancels Mon May 4
    ];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    // Other Mondays + Sun/Wed/Sat still contribute roomIds
    expect(out).toEqual([ROOM_A, ROOM_B].sort());
  });

  it('H3.2 — per-date work entry adds its roomIds', () => {
    const entries = [
      { id: 'X', staffId: DOC_A, type: 'work', date: '2026-05-08', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_SHOCKWAVE] },
    ];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([ROOM_SHOCKWAVE]);
  });

  it('H3.3 — entry with empty/missing roomIds → skipped, no contribution', () => {
    const entries = [
      { id: 'X1', staffId: DOC_A, type: 'recurring', dayOfWeek: 1, startTime: '10:00', endTime: '14:00', roomIds: [] },
      { id: 'X2', staffId: DOC_A, type: 'recurring', dayOfWeek: 2, startTime: '10:00', endTime: '14:00' /* no roomIds */ },
    ];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([]);
  });
});

describe('V61.H4 — deriveDoctorRoomIdsForWindow adversarial', () => {
  it('H4.1 — null/missing inputs return []', () => {
    expect(deriveDoctorRoomIdsForWindow({})).toEqual([]);
    expect(deriveDoctorRoomIdsForWindow({ allEntries: null })).toEqual([]);
    expect(deriveDoctorRoomIdsForWindow({ allEntries: [], datesISO: null })).toEqual([]);
  });

  it('H4.2 — invalid date strings silently skipped', () => {
    const entries = RECURRING_DOC_A;
    const dates = ['2026-05-04', 'not-a-date', '2026/05/03', '', null, 42, '2026-05-06'];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: dates,
    });
    expect(out).toEqual([ROOM_A, ROOM_B].sort());
  });

  it('H4.3 — deduplicates roomIds across overlapping entries', () => {
    const entries = [
      { id: '1', staffId: DOC_A, type: 'recurring', dayOfWeek: 1, startTime: '10:00', endTime: '14:00', roomIds: [ROOM_A, ROOM_A, ROOM_A] },
    ];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([ROOM_A]);
  });

  it('H4.4 — Thai unicode room IDs preserved', () => {
    const entries = [
      { id: '1', staffId: DOC_A, type: 'recurring', dayOfWeek: 1, startTime: '10:00', endTime: '14:00', roomIds: ['ห้องแพทย์ ก', 'EXR-X'] },
    ];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toContain('ห้องแพทย์ ก');
    expect(out).toContain('EXR-X');
  });
});

describe('V61.H5 — deriveNonDoctorRoomIdsForWindow basic', () => {
  it('H5.1 — Doc A (rooms A+B in window) → branch has 4 rooms → returns DRIP + SHOCKWAVE', () => {
    const out = deriveNonDoctorRoomIdsForWindow({
      branchExamRooms: BRANCH_ROOMS_FULL,
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([ROOM_DRIP, ROOM_SHOCKWAVE].sort());
  });

  it('H5.2 — When all 4 rooms are touched by SOME doctor → []', () => {
    const allEntries = [
      ...RECURRING_DOC_A,                                    // A + B
      ...RECURRING_DOC_B,                                    // DRIP
      { id: 'X', staffId: DOC_A, type: 'work', date: '2026-05-15', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_SHOCKWAVE] },
    ];
    const out = deriveNonDoctorRoomIdsForWindow({
      branchExamRooms: BRANCH_ROOMS_FULL,
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([]);
  });

  it('H5.3 — Empty schedule entries → ALL active branch rooms returned', () => {
    const out = deriveNonDoctorRoomIdsForWindow({
      branchExamRooms: BRANCH_ROOMS_FULL,
      allEntries: [],
      datesISO: buildMonth('2026-05'),
    });
    expect(out.length).toBe(4);
  });
});

describe('V61.H6 — deriveNonDoctorRoomIdsForWindow status filter', () => {
  it('H6.1 — Excludes status≠"ใช้งาน" rooms from candidate set', () => {
    const branchRoomsWithArchived = [
      ...BRANCH_ROOMS_FULL,
      { id: 'EXR-archived', name: 'ห้องเก่า', kind: 'doctor', status: 'ปิด' },
    ];
    const out = deriveNonDoctorRoomIdsForWindow({
      branchExamRooms: branchRoomsWithArchived,
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    // Archived room MUST not appear even though it's untouched
    expect(out).not.toContain('EXR-archived');
  });

  it('H6.2 — Rooms with missing status field treated as active (backward compat)', () => {
    const rooms = [{ id: 'EXR-legacy', name: 'ห้องเก่า' /* no status */ }];
    const out = deriveNonDoctorRoomIdsForWindow({
      branchExamRooms: rooms,
      allEntries: [],
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual(['EXR-legacy']);
  });
});

describe('V61.H7 — deriveNonDoctorRoomIdsForWindow ignores V57 kind', () => {
  it('H7.1 — kind=staff room WITH doctor entries → excluded from non-doctor list', () => {
    // Shockwave is kind=staff but a doctor uses it for a per-date work entry
    const entries = [
      { id: 'X', staffId: DOC_A, type: 'work', date: '2026-05-15', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_SHOCKWAVE] },
    ];
    const out = deriveNonDoctorRoomIdsForWindow({
      branchExamRooms: BRANCH_ROOMS_FULL,
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    // V61: filter is schedule-driven, kind ignored. Shockwave touched by doctor
    // → NOT in non-doctor list, even though kind=staff.
    expect(out).not.toContain(ROOM_SHOCKWAVE);
  });

  it('H7.2 — kind=doctor room WITHOUT doctor entries → INCLUDED in non-doctor list', () => {
    // ROOM_DRIP is kind=doctor but no entries reference it in this fixture
    const out = deriveNonDoctorRoomIdsForWindow({
      branchExamRooms: BRANCH_ROOMS_FULL,
      allEntries: RECURRING_DOC_A, // touches A + B only
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toContain(ROOM_DRIP);   // kind=doctor but untouched
    expect(out).toContain(ROOM_SHOCKWAVE);
  });
});

describe('V61.H8 — Multi-month window', () => {
  it('H8.1 — 2-month window aggregates correctly', () => {
    const dates = [...buildMonth('2026-05'), ...buildMonth('2026-06')];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: RECURRING_DOC_A,
      datesISO: dates,
    });
    expect(out).toEqual([ROOM_A, ROOM_B].sort());
  });

  it('H8.2 — Per-date entry only on May 8 (Friday) doesn\'t contribute to June', () => {
    const entries = [
      { id: 'X', staffId: DOC_A, type: 'work', date: '2026-05-08', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_SHOCKWAVE] },
    ];
    // Just June dates
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-06'),
    });
    expect(out).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F — shouldBlockScheduleSlot extension (selectedRoomIds array)
// ═══════════════════════════════════════════════════════════════════════

describe('V61.F1 — shouldBlockScheduleSlot prefers selectedRoomIds array', () => {
  const baseAppt = (overrides) => ({
    doctorId: DOC_A,
    roomId: ROOM_A,
    ...overrides,
  });

  it('F1.1 — array=[A,B] + appt in A → blocks (in set)', () => {
    const out = shouldBlockScheduleSlot(baseAppt({ roomId: ROOM_A }), {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: null,
      selectedRoomIds: [ROOM_A, ROOM_B],
      assistantIds: new Set(),
    });
    expect(out).toBe(true);
  });

  it('F1.2 — array=[A,B] + appt in B → blocks (in set)', () => {
    const out = shouldBlockScheduleSlot(baseAppt({ roomId: ROOM_B }), {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: null,
      selectedRoomIds: [ROOM_A, ROOM_B],
      assistantIds: new Set(),
    });
    expect(out).toBe(true);
  });

  it('F1.3 — array=[A,B] + appt in DRIP → does NOT block (out of set)', () => {
    const out = shouldBlockScheduleSlot(baseAppt({ roomId: ROOM_DRIP }), {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: null,
      selectedRoomIds: [ROOM_A, ROOM_B],
      assistantIds: new Set(),
    });
    expect(out).toBe(false);
  });

  it('F1.4 — array=[] empty + selectedRoomId fallback works (room=A blocks)', () => {
    const out = shouldBlockScheduleSlot(baseAppt({ roomId: ROOM_A }), {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: ROOM_A,
      selectedRoomIds: [],
      assistantIds: new Set(),
    });
    expect(out).toBe(true);
  });
});

describe('V61.F2 — shouldBlockScheduleSlot backward compat', () => {
  it('F2.1 — selectedRoomId only (no array, pre-V61) → single-room semantics preserved', () => {
    const out = shouldBlockScheduleSlot({ doctorId: DOC_A, roomId: ROOM_A }, {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: ROOM_A,
      assistantIds: new Set(),
    });
    expect(out).toBe(true);
  });

  it('F2.2 — neither set + no doctor + no noDoctor → conservative blocks (all-doctors view)', () => {
    const out = shouldBlockScheduleSlot({ doctorId: DOC_A, roomId: ROOM_A }, {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: null,
      assistantIds: new Set(),
    });
    expect(out).toBe(true);
  });

  it('F2.3 — array null, selectedRoomId="" empty string → no room filter applied', () => {
    // Empty selectedRoomId means no room filter; falls through to conservative path
    const out = shouldBlockScheduleSlot({ doctorId: DOC_A, roomId: ROOM_A }, {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: '',
      assistantIds: new Set(),
    });
    expect(out).toBe(true); // conservative no-filter path
  });
});

describe('V61.F3 — shouldBlockScheduleSlot with doctor + array', () => {
  it('F3.1 — specific doctor + array=[A] + appt(other doctor in A) → blocks (room match)', () => {
    const out = shouldBlockScheduleSlot({ doctorId: DOC_B, roomId: ROOM_A }, {
      noDoctorRequired: false,
      selectedDoctorId: DOC_A,
      selectedRoomId: null,
      selectedRoomIds: [ROOM_A],
      assistantIds: new Set(),
    });
    expect(out).toBe(true);
  });

  it('F3.2 — specific doctor + array=[A] + appt(this doctor in B) → blocks (doctor match)', () => {
    const out = shouldBlockScheduleSlot({ doctorId: DOC_A, roomId: ROOM_B }, {
      noDoctorRequired: false,
      selectedDoctorId: DOC_A,
      selectedRoomId: null,
      selectedRoomIds: [ROOM_A],
      assistantIds: new Set(),
    });
    expect(out).toBe(true);
  });

  it('F3.3 — specific doctor + array=[A] + appt(other doctor in B) → does NOT block', () => {
    const out = shouldBlockScheduleSlot({ doctorId: DOC_B, roomId: ROOM_B }, {
      noDoctorRequired: false,
      selectedDoctorId: DOC_A,
      selectedRoomId: null,
      selectedRoomIds: [ROOM_A],
      assistantIds: new Set(),
    });
    expect(out).toBe(false);
  });
});

describe('V61.F4 — Adversarial: array contains nullish/empty values', () => {
  it('F4.1 — array with null/undefined/"" entries filtered out before Set construction', () => {
    const out = shouldBlockScheduleSlot({ doctorId: DOC_A, roomId: ROOM_A }, {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: null,
      selectedRoomIds: [null, undefined, '', ROOM_A],
      assistantIds: new Set(),
    });
    expect(out).toBe(true); // ROOM_A is in the cleaned set
  });

  it('F4.2 — array with all nullish → falls back to selectedRoomId', () => {
    const out = shouldBlockScheduleSlot({ doctorId: DOC_A, roomId: ROOM_A }, {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: ROOM_A,
      selectedRoomIds: [null, undefined, ''],
      assistantIds: new Set(),
    });
    expect(out).toBe(true); // roomSet null → falls back to selectedRoomId='ROOM_A'
  });

  it('F4.3 — Numeric room IDs coerced to string', () => {
    const out = shouldBlockScheduleSlot({ doctorId: DOC_A, roomId: 1234 }, {
      noDoctorRequired: false,
      selectedDoctorId: null,
      selectedRoomId: null,
      selectedRoomIds: [1234],
      assistantIds: new Set(),
    });
    expect(out).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// M — Source-grep regression (modal logic + save shape + resync wiring)
// ═══════════════════════════════════════════════════════════════════════

describe('V61.M1 — AdminDashboard imports the helpers', () => {
  it('M1.1 — deriveDoctorRoomIdsForWindow imported', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/deriveDoctorRoomIdsForWindow/);
  });

  it('M1.2 — deriveNonDoctorRoomIdsForWindow imported', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/deriveNonDoctorRoomIdsForWindow/);
  });

  it('M1.3 — V61 / AV33 marker comment in source', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/V61\s*\/\s*AV33/);
  });
});

describe('V61.M2 — pre-V61 V57 kind-based filter REMOVED', () => {
  it('M2.1 — no `r.role === (schedNoDoctorRequired ? "staff" : "doctor")` pattern', () => {
    expect(ADMIN_DASHBOARD_SRC).not.toMatch(
      /branchExamRooms\.filter\(\s*r\s*=>\s*[\s\S]{0,80}?r\.role\s*===\s*\(\s*schedNoDoctorRequired\s*\?\s*['"]staff['"]\s*:\s*['"]doctor['"]\s*\)/,
    );
  });

  it('M2.2 — shownRooms now sourced from v61EligibleRooms', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/const shownRooms\s*=\s*v61EligibleRooms/);
  });
});

describe('V61.M3 — eligibleRoomIds derivation present', () => {
  it('M3.1 — v61EligibleRoomIds useMemo declared', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/v61EligibleRoomIds\s*=\s*useMemo/);
  });

  it('M3.2 — v61EligibleRooms useMemo declared', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/v61EligibleRooms\s*=\s*useMemo/);
  });

  it('M3.3 — datesInRange derivation (v61DatesInRange)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/v61DatesInRange\s*=\s*useMemo/);
  });

  it('M3.4 — branch on schedNoDoctorRequired in eligibleRoomIds compute', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /v61EligibleRoomIds[\s\S]{0,400}?schedNoDoctorRequired/,
    );
  });
});

describe('V61.M4 — defensive reset useEffect for schedSelectedRoom', () => {
  it('M4.1 — reset fires when schedSelectedRoom not in v61EligibleRoomIds', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /useEffect[\s\S]{0,200}?v61EligibleRoomIds\.includes\(String\(schedSelectedRoom\)\)/,
    );
  });
});

describe('V61.M5 — pre-flight gate present in handleGenScheduleLink', () => {
  it('M5.1 — gate condition `v61EligibleRoomIds.length === 0`', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/v61EligibleRoomIds\.length\s*===\s*0/);
  });

  it('M5.2 — Thai toast message + early return', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /v61EligibleRoomIds\.length\s*===\s*0[\s\S]{0,1500}?setSchedGenLoading\(false\)[\s\S]{0,80}?return;/,
    );
  });

  it('M5.3 — Three Thai-copy variants (ไม่พบแพทย์ / specific doctor / แพทย์ทุกคน)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/ไม่พบห้องที่ไม่มีแพทย์เข้าตรวจ/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/แพทย์ที่เลือกไม่มีตารางเข้าห้อง/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/ไม่พบห้องที่มีแพทย์เข้าตรวจ/);
  });
});

describe('V61.M6 — saved doc shape', () => {
  it('M6.1 — selectedRoomIds field saved', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/selectedRoomIds:\s*v61SelectedRoomIds/);
  });

  it('M6.2 — selectedRoomId legacy field PRESERVED for backward compat', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/selectedRoomId:\s*selectedRoomStr\s*\|\|\s*null/);
  });

  it('M6.3 — v61SelectedRoomIds compute (specific or full union)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /v61SelectedRoomIds\s*=\s*schedSelectedRoom[\s\S]{0,80}?\[\.\.\.v61EligibleRoomIds\]/,
    );
  });
});

describe('V61.M7 — filterCfg passes selectedRoomIds in BOTH save sites', () => {
  it('M7.1 — handleGenScheduleLink filterCfg includes selectedRoomIds', () => {
    // The gen-time filterCfg uses v61SelectedRoomIds; the resync filterCfg uses sched.selectedRoomIds
    expect(ADMIN_DASHBOARD_SRC).toMatch(/selectedRoomIds:\s*v61SelectedRoomIds/);
  });

  it('M7.2 — updateActiveSchedules filterCfg includes selectedRoomIds (effective array)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /selectedRoomIds:\s*(effectiveSelectedRoomIds|Array\.isArray\(sched\.selectedRoomIds\))/,
    );
  });
});

describe('V61.M8 — useEffect for schedule fetch extended for ALL-doctors path', () => {
  it('M8.1 — useEffect fetches branch-wide entries when schedSelectedDoctor is null', () => {
    // Pre-V61: skipped fetch when no doctor. V61: fetches all branch entries.
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /listStaffSchedules\(\s*\{\s*branchId:\s*selectedBranchId\s*\}\s*\)/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// G — Pre-flight gate (modal banner + handleGenScheduleLink)
// ═══════════════════════════════════════════════════════════════════════

describe('V61.G1 — Empty-state banner JSX in modal', () => {
  it('G1.1 — data-testid="v61-room-empty-state"', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/data-testid="v61-room-empty-state"/);
  });

  it('G1.2 — Banner rendered when shownRooms.length === 0', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /shownRooms\.length\s*===\s*0[\s\S]{0,200}?v61-room-empty-state/,
    );
  });

  it('G1.3 — Three Thai-copy variants in banner', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/ไม่พบห้องที่ไม่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/แพทย์ที่เลือกไม่มีตารางเข้าห้องในระยะเวลาที่เลือก/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/ไม่พบห้องที่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก/);
  });
});

describe('V61.G2 — Updated dropdown labels reflect schedule-driven semantics', () => {
  it('G2.1 — Label "ห้องที่แพทย์เข้าตรวจ" / "ห้องที่ไม่มีแพทย์เข้าตรวจ"', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/ห้องที่แพทย์เข้าตรวจ/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/ห้องที่ไม่มีแพทย์เข้าตรวจ/);
  });

  it('G2.2 — "ทุกห้อง" placeholder reflects union semantics', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/ทุกห้องที่แพทย์เข้า/);
  });
});

describe('V61.G3 — Resync recompute logic for ทุกห้อง mode', () => {
  it('G3.1 — wasGenericRoomPick detection (selectedRoomId null + array non-empty)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/wasGenericRoomPick/);
  });

  it('G3.2 — recomputedRoomIds re-derived via deriveDoctorRoomIdsForWindow / deriveNonDoctorRoomIdsForWindow', () => {
    // The resync block calls one of the helpers when admin pressed Sync
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /recomputedRoomIds\s*=\s*deriveNonDoctorRoomIdsForWindow/,
    );
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /recomputedRoomIds\s*=\s*deriveDoctorRoomIdsForWindow/,
    );
  });

  it('G3.3 — updatePayload includes selectedRoomIds when recomputed', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /updatePayload\.selectedRoomIds\s*=\s*recomputedRoomIds/,
    );
  });
});

describe('V61.G4 — Filter helper marker', () => {
  it('G4.1 — V61 / AV33 marker in scheduleFilterUtils.js', () => {
    expect(FILTER_UTILS_SRC).toMatch(/V61\s*\/\s*AV33/);
  });

  it('G4.2 — selectedRoomIds in destructure', () => {
    expect(FILTER_UTILS_SRC).toMatch(/selectedRoomIds[\s\S]{0,100}?config/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// X — Mixed combinations matrix (Rule I full-flow simulate)
// ═══════════════════════════════════════════════════════════════════════
//
// Per user "เขียน e2e test แบบอื่นๆ แบบผสมปนเป ปั่นป่วน แต่ยังให้แสดงผลในลิ้งค์
// ทุกรูปแบบ ทุก combination ที่เป็นไปได้ได้อย่างสมจริง". Hand-crafted realistic
// scenarios spanning the matrix dimensions: mode × doctor pick × room pick ×
// month window × schedule shape × appt overlap × showDoctorStatus.

describe('V61.X1 — Real-world: หมอมายด์ + 1 month + ทุกห้อง mode', () => {
  it('X1.1 — Eligible rooms = doc A\'s rooms (A+B); doc B unaffected', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const eligibleIds = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    expect(eligibleIds).toEqual([ROOM_A, ROOM_B].sort());
  });

  it('X1.2 — Customer link with ทุกห้อง snapshot blocks appts in EITHER A or B', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const eligibleIds = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    // Appt for doc A in room A → blocks
    const blockA = shouldBlockScheduleSlot(
      { doctorId: DOC_A, roomId: ROOM_A },
      { noDoctorRequired: false, selectedDoctorId: DOC_A, selectedRoomId: null, selectedRoomIds: eligibleIds, assistantIds: new Set() },
    );
    expect(blockA).toBe(true);
    // Appt for doc A in DRIP (out of set) → still blocks via doctor match
    const blockDrip = shouldBlockScheduleSlot(
      { doctorId: DOC_A, roomId: ROOM_DRIP },
      { noDoctorRequired: false, selectedDoctorId: DOC_A, selectedRoomId: null, selectedRoomIds: eligibleIds, assistantIds: new Set() },
    );
    expect(blockDrip).toBe(true); // doctor match
    // Appt for doc B in DRIP → does NOT block (different doctor + out-of-set room)
    const blockOther = shouldBlockScheduleSlot(
      { doctorId: DOC_B, roomId: ROOM_DRIP },
      { noDoctorRequired: false, selectedDoctorId: DOC_A, selectedRoomId: null, selectedRoomIds: eligibleIds, assistantIds: new Set() },
    );
    expect(blockOther).toBe(false);
  });
});

describe('V61.X2 — แพทย์ทุกคน + ทุกห้อง mode', () => {
  it('X2.1 — Eligible rooms = union of A+B+DRIP', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const eligibleIds = deriveDoctorRoomIdsForWindow({
      doctorIds: null,
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    expect(eligibleIds).toEqual([ROOM_A, ROOM_B, ROOM_DRIP].sort());
  });

  it('X2.2 — SHOCKWAVE NOT in set; appt there does not block', () => {
    const eligibleIds = [ROOM_A, ROOM_B, ROOM_DRIP];
    const out = shouldBlockScheduleSlot(
      { doctorId: DOC_A, roomId: ROOM_SHOCKWAVE },
      { noDoctorRequired: false, selectedDoctorId: null, selectedRoomId: null, selectedRoomIds: eligibleIds, assistantIds: new Set() },
    );
    expect(out).toBe(false);
  });
});

describe('V61.X3 — ไม่พบแพทย์ mode + Shockwave only', () => {
  it('X3.1 — Eligible rooms = SHOCKWAVE (only kind=staff with no doctor entries)', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B]; // covers A+B+DRIP
    const eligibleIds = deriveNonDoctorRoomIdsForWindow({
      branchExamRooms: BRANCH_ROOMS_FULL,
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    expect(eligibleIds).toEqual([ROOM_SHOCKWAVE]);
  });

  it('X3.2 — Customer sees SHOCKWAVE booked when assistant takes it; doctorBookedSlots overlay separate', () => {
    // Mode: noDoctorRequired=true, room=SHOCKWAVE (specific), showDoctorStatus=true
    // Customer: room SHOCKWAVE busy when ROOM=SHOCKWAVE; doctor busy overlay separate
    const ASSISTANT_ID = 'ASST-1';
    const cfg = {
      noDoctorRequired: true,
      selectedDoctorId: null,
      selectedRoomId: ROOM_SHOCKWAVE,
      selectedRoomIds: [ROOM_SHOCKWAVE],
      assistantIds: new Set([ASSISTANT_ID]),
    };
    // Assistant booked SHOCKWAVE → blocks
    expect(shouldBlockScheduleSlot(
      { doctorId: ASSISTANT_ID, roomId: ROOM_SHOCKWAVE },
      cfg,
    )).toBe(true);
    // Doctor at doctor-room A (= different room) → does NOT block customer's SHOCKWAVE link
    expect(shouldBlockScheduleSlot(
      { doctorId: DOC_A, roomId: ROOM_A },
      cfg,
    )).toBe(false);
  });
});

describe('V61.X4 — Per-date override cancels recurring → room set narrows', () => {
  it('X4.1 — Doc A on leave May 4 → still has rooms on other Mons → room set unchanged', () => {
    // Per-date leave on one Monday doesn't remove the rooms entirely; other Mons + Sun/Wed/Sat still contribute
    const entries = [
      ...RECURRING_DOC_A,
      { id: 'leave1', staffId: DOC_A, type: 'leave', date: '2026-05-04' },
    ];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual([ROOM_A, ROOM_B].sort());
  });

  it('X4.2 — Doc A on leave EVERY day in window → empty room set', () => {
    const everyDay = buildMonth('2026-05');
    const entries = [
      ...RECURRING_DOC_A,
      ...everyDay.map((d) => ({ id: `leave-${d}`, staffId: DOC_A, type: 'leave', date: d })),
    ];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: everyDay,
    });
    expect(out).toEqual([]);
  });
});

describe('V61.X5 — Multi-month with mixed shapes', () => {
  it('X5.1 — Doc A + 3-month window; 1 month has per-date work in shockwave room', () => {
    const entries = [
      ...RECURRING_DOC_A,
      // June: Doc A does a one-off Friday work at SHOCKWAVE
      { id: 'pdW', staffId: DOC_A, type: 'work', date: '2026-06-12', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_SHOCKWAVE] },
    ];
    const dates = [...buildMonth('2026-05'), ...buildMonth('2026-06'), ...buildMonth('2026-07')];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: dates,
    });
    // Recurring days contribute A+B; per-date adds SHOCKWAVE
    expect(out).toContain(ROOM_A);
    expect(out).toContain(ROOM_B);
    expect(out).toContain(ROOM_SHOCKWAVE);
    expect(out).not.toContain(ROOM_DRIP);
  });
});

describe('V61.X6 — Branch-isolated: only branch A entries returned', () => {
  it('X6.1 — Helper is branch-blind (caller filters branch) — entries from "wrong branch" still aggregate if passed', () => {
    // The helpers are branch-blind by contract; caller is responsible for
    // pre-filtering. This test documents that contract.
    const cross = [
      { id: 'B-1', staffId: DOC_A, type: 'recurring', dayOfWeek: 1, startTime: '10:00', endTime: '14:00', roomIds: ['EXR-OTHER-BRANCH'] },
    ];
    const out = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: cross,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual(['EXR-OTHER-BRANCH']); // helper trusts caller to pre-filter
  });
});

describe('V61.X7 — Resync recompute scenario', () => {
  it('X7.1 — Pre-V61 doc with selectedRoomId only → no recompute (specific pick)', () => {
    const sched = { selectedRoomId: ROOM_A, selectedRoomIds: null };
    const wasGenericRoomPick = (
      (sched.selectedRoomId == null || sched.selectedRoomId === '')
      && Array.isArray(sched.selectedRoomIds)
      && sched.selectedRoomIds.length > 0
    );
    expect(wasGenericRoomPick).toBe(false); // specific pick → no recompute
  });

  it('X7.2 — V61 doc with selectedRoomId=null + array non-empty → recompute fires', () => {
    const sched = { selectedRoomId: null, selectedRoomIds: [ROOM_A, ROOM_B] };
    const wasGenericRoomPick = (
      (sched.selectedRoomId == null || sched.selectedRoomId === '')
      && Array.isArray(sched.selectedRoomIds)
      && sched.selectedRoomIds.length > 0
    );
    expect(wasGenericRoomPick).toBe(true);
  });

  it('X7.3 — Specific-pick V61 doc preserved verbatim', () => {
    const sched = { selectedRoomId: ROOM_A, selectedRoomIds: [ROOM_A] };
    const wasGenericRoomPick = (
      (sched.selectedRoomId == null || sched.selectedRoomId === '')
      && Array.isArray(sched.selectedRoomIds)
      && sched.selectedRoomIds.length > 0
    );
    expect(wasGenericRoomPick).toBe(false);
  });
});

describe('V61.X8 — Cross-helper consistency with V60', () => {
  it('X8.1 — Doctor with rooms A+B → derivedDoctorDays returns 18 May days; deriveDoctorRoomIds returns A+B', () => {
    const days = derivedDoctorDaysFromSchedules({
      doctorId: DOC_A,
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    const rooms = deriveDoctorRoomIdsForWindow({
      doctorIds: [DOC_A],
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    // V60 gives 18 days (Sun/Mon/Wed/Sat), V61 gives 2 rooms
    expect(days.length).toBe(18);
    expect(rooms).toEqual([ROOM_A, ROOM_B].sort());
  });

  it('X8.2 — Property: rooms helper returns subset of branch rooms', () => {
    const eligibleIds = deriveDoctorRoomIdsForWindow({
      doctorIds: null,
      allEntries: [...RECURRING_DOC_A, ...RECURRING_DOC_B],
      datesISO: buildMonth('2026-05'),
    });
    const branchIds = BRANCH_ROOMS_FULL.map(r => r.id);
    eligibleIds.forEach(id => expect(branchIds).toContain(id));
  });

  it('X8.3 — Property: doctor + non-doctor sets are DISJOINT and union to branch active set', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const dates = buildMonth('2026-05');
    const doctorIds = deriveDoctorRoomIdsForWindow({
      doctorIds: null,
      allEntries,
      datesISO: dates,
    });
    const nonDoctorIds = deriveNonDoctorRoomIdsForWindow({
      branchExamRooms: BRANCH_ROOMS_FULL,
      allEntries,
      datesISO: dates,
    });
    // Disjoint
    const intersection = doctorIds.filter(id => nonDoctorIds.includes(id));
    expect(intersection).toEqual([]);
    // Union of (doctor-touched ∩ branch active) + non-doctor = all branch active
    const activeBranchIds = BRANCH_ROOMS_FULL.filter(r => r.status == null || r.status === 'ใช้งาน').map(r => r.id);
    const doctorInBranch = doctorIds.filter(id => activeBranchIds.includes(id));
    const union = new Set([...doctorInBranch, ...nonDoctorIds]);
    expect(union.size).toBe(activeBranchIds.length);
  });
});
