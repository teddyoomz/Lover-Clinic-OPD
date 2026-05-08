// V62 / AV34 (2026-05-08) — Schedule-link doctorDays + customDoctorHours
// derived from be_staff_schedules for ALL link modes (including
// noDoctorRequired). Closes the bug where SCH-9c201860e1 had
// doctorDaysCount: 0 + doctorStartTime=clinic-hours despite
// noDoctorRequired:true + showDoctorStatus:true.
//
// User report (verbatim, with 2 screenshots):
//   "ลิ้งนี้ยังไม่แสดงสถานะหมอ ทั้งๆที่เป็นลิ้งที่ติ๊กเลือกว่าจะแสดง
//    สถานะหมอว่าง/ไม่ว่าง ด้วย ทั้ง emoji ไฟลุกในปฏิทินในช่องวันที่หมอเข้า
//    ก็ไม่แสดง และในช่องตารางแต่ละวัน ถ้าหมอว่างอยู่ในเวลาเดียวกันนั้น
//    ไม่ว่าหมอจะเข้าตรวจอยู่ห้องไหนในคลินิกนั้นวันนั้นเวลานั้น
//    ก็ให้แสดงว่าหมอว่างด้วย ... และวันที่ 9 ในภาพที่ 2 นอกจากจะแสดงว่า
//    ห้องช็อคเวฟไม่ว่างแล้ว ก็ให้แสดงให้ลูกค้ารู้ด้วยว่าหมอก็ไม่ว่างอยู่
//    เหมือนกันในอีกห้องหนึ่ง แต่ไม่ต้องบอกว่าห้องอะไร"
//
// Class-of-bug: V12 multi-reader-sweep — V60 helper covered SPECIFIC
// doctor; V62 extends to multi-doctor (noDoctorRequired + แพทย์ทุกคน
// modes). Same family as V52-V61 BSA adoption gap series.
//
// Test groups:
//   H1-H6 — Pure helper unit (derivedDoctorDaysAcrossWindow + derivedDoctorWorkingHoursPerDate)
//   M1-M6 — Source-grep regression (handleGenScheduleLink wiring + ClinicSchedule overlay always-on)
//   X1-X4 — Mixed combinations (multi-doctor union + leave override + per-date overrides)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  derivedDoctorDaysAcrossWindow,
  derivedDoctorWorkingHoursPerDate,
  derivedDoctorDaysFromSchedules,
} from '../src/lib/staffScheduleValidation.js';

const ADMIN_DASHBOARD_SRC = readFileSync(
  resolve(process.cwd(), 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const CLINIC_SCHEDULE_SRC = readFileSync(
  resolve(process.cwd(), 'src/pages/ClinicSchedule.jsx'),
  'utf8',
);
const SCHEDULE_VALIDATION_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/staffScheduleValidation.js'),
  'utf8',
);
const V62_FIX_SRC = readFileSync(
  resolve(process.cwd(), 'scripts/v62-fix-schedule-link-doctor-data.mjs'),
  'utf8',
);

const DOC_A = 'DOC-mov2p9c0-a79c20370455d9f9';
const DOC_B = 'DOC-otherdoc-1234567890abcdef';
const ROOM_A = 'EXR-A';
const ROOM_DRIP = 'EXR-DRIP';

const RECURRING_DOC_A = [
  { id: '1', staffId: DOC_A, type: 'recurring', dayOfWeek: 0, startTime: '13:30', endTime: '19:30', roomIds: [ROOM_A] }, // Sun
  { id: '2', staffId: DOC_A, type: 'recurring', dayOfWeek: 1, startTime: '16:30', endTime: '20:30', roomIds: [ROOM_A] }, // Mon
  { id: '3', staffId: DOC_A, type: 'recurring', dayOfWeek: 3, startTime: '16:30', endTime: '20:30', roomIds: [ROOM_A] }, // Wed
  { id: '4', staffId: DOC_A, type: 'recurring', dayOfWeek: 6, startTime: '13:30', endTime: '19:30', roomIds: [ROOM_A] }, // Sat
];
const RECURRING_DOC_B = [
  { id: '5', staffId: DOC_B, type: 'recurring', dayOfWeek: 2, startTime: '10:00', endTime: '14:00', roomIds: [ROOM_DRIP] }, // Tue
  { id: '6', staffId: DOC_B, type: 'recurring', dayOfWeek: 4, startTime: '10:00', endTime: '14:00', roomIds: [ROOM_DRIP] }, // Thu
];

function buildMonth(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= days; d++) out.push(`${yyyymm}-${String(d).padStart(2, '0')}`);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// H — Pure helpers
// ═══════════════════════════════════════════════════════════════════════

describe('V62.H1 — derivedDoctorDaysAcrossWindow basic', () => {
  it('H1.1 — exports the helper', () => {
    expect(typeof derivedDoctorDaysAcrossWindow).toBe('function');
    expect(typeof derivedDoctorWorkingHoursPerDate).toBe('function');
  });

  it('H1.2 — Doc A specific (matches V60 case) → 18 May days', () => {
    const out = derivedDoctorDaysAcrossWindow({
      doctorIds: [DOC_A],
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    expect(out.length).toBe(18);
  });

  it('H1.3 — null doctorIds + branch entries → ALL doctors aggregated (V62 noDoctor mode)', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const out = derivedDoctorDaysAcrossWindow({
      doctorIds: null,
      allEntries,
      datesISO: buildMonth('2026-05'),
    });
    // Doc A covers Sun/Mon/Wed/Sat (~18). Doc B covers Tue/Thu (~9). Total ~27.
    // May 2026: Tue 5,12,19,26 (4); Thu 7,14,21,28 (4) = +8 days; Doc A 18 → ~26 days
    expect(out.length).toBeGreaterThan(18);
    expect(out.length).toBeLessThanOrEqual(31);
  });

  it('H1.4 — empty doctorIds array → null behavior (aggregate all)', () => {
    const allEntries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const outNull = derivedDoctorDaysAcrossWindow({ doctorIds: null, allEntries, datesISO: buildMonth('2026-05') });
    const outEmpty = derivedDoctorDaysAcrossWindow({ doctorIds: [], allEntries, datesISO: buildMonth('2026-05') });
    expect(outEmpty).toEqual(outNull);
  });

  it('H1.5 — multi-doctor explicit', () => {
    const out = derivedDoctorDaysAcrossWindow({
      doctorIds: [DOC_A, DOC_B],
      allEntries: [...RECURRING_DOC_A, ...RECURRING_DOC_B],
      datesISO: buildMonth('2026-05'),
    });
    expect(out.length).toBeGreaterThan(18);
  });

  it('H1.6 — null/missing inputs → []', () => {
    expect(derivedDoctorDaysAcrossWindow({})).toEqual([]);
    expect(derivedDoctorDaysAcrossWindow({ allEntries: null })).toEqual([]);
  });
});

describe('V62.H2 — derivedDoctorDaysAcrossWindow override semantics', () => {
  it('H2.1 — leave override cancels recurring weekday', () => {
    const entries = [
      ...RECURRING_DOC_A,
      { id: 'L1', staffId: DOC_A, type: 'leave', date: '2026-05-04' },
    ];
    const out = derivedDoctorDaysAcrossWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).not.toContain('2026-05-04');
  });

  it('H2.2 — per-date work on non-recurring weekday adds the date', () => {
    const entries = [
      { id: 'W1', staffId: DOC_A, type: 'work', date: '2026-05-08', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_A] },
    ];
    const out = derivedDoctorDaysAcrossWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toEqual(['2026-05-08']);
  });
});

describe('V62.H3 — derivedDoctorWorkingHoursPerDate basic', () => {
  it('H3.1 — Doc A May 2026 → per-date map with appropriate hours per day', () => {
    const out = derivedDoctorWorkingHoursPerDate({
      doctorIds: [DOC_A],
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    // 18 keys (matches doctorDays count)
    expect(Object.keys(out).length).toBe(18);
    // Sun 13:30-19:30
    expect(out['2026-05-03']).toEqual([{ start: '13:30', end: '19:30' }]);
    // Mon 16:30-20:30
    expect(out['2026-05-04']).toEqual([{ start: '16:30', end: '20:30' }]);
    // Sat 13:30-19:30
    expect(out['2026-05-09']).toEqual([{ start: '13:30', end: '19:30' }]);
  });

  it('H3.2 — Multi-doctor union with non-overlapping shifts on same date', () => {
    // Doc A and Doc B both work Friday May 1 (custom for this test)
    const entries = [
      { id: 'A1', staffId: DOC_A, type: 'work', date: '2026-05-01', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_A] },
      { id: 'B1', staffId: DOC_B, type: 'work', date: '2026-05-01', startTime: '16:00', endTime: '20:00', roomIds: [ROOM_DRIP] },
    ];
    const out = derivedDoctorWorkingHoursPerDate({
      doctorIds: null,
      allEntries: entries,
      datesISO: ['2026-05-01'],
    });
    expect(out['2026-05-01']).toEqual([
      { start: '10:00', end: '14:00' },
      { start: '16:00', end: '20:00' },
    ]);
  });

  it('H3.3 — Same hours from multiple doctors → deduped (single range)', () => {
    const entries = [
      { id: 'A1', staffId: DOC_A, type: 'work', date: '2026-05-01', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_A] },
      { id: 'B1', staffId: DOC_B, type: 'work', date: '2026-05-01', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_DRIP] },
    ];
    const out = derivedDoctorWorkingHoursPerDate({
      doctorIds: null,
      allEntries: entries,
      datesISO: ['2026-05-01'],
    });
    expect(out['2026-05-01'].length).toBe(1);
  });

  it('H3.4 — Off-shift types excluded (leave/holiday/sick)', () => {
    const entries = [
      ...RECURRING_DOC_A,
      { id: 'L1', staffId: DOC_A, type: 'leave', date: '2026-05-04' },
    ];
    const out = derivedDoctorWorkingHoursPerDate({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out['2026-05-04']).toBeUndefined();
    expect(out['2026-05-11']).toBeDefined();
  });

  it('H3.5 — Empty inputs → empty object', () => {
    expect(derivedDoctorWorkingHoursPerDate({})).toEqual({});
    expect(derivedDoctorWorkingHoursPerDate({ allEntries: [], datesISO: [] })).toEqual({});
  });

  it('H3.6 — Invalid HH:MM filtered out', () => {
    const entries = [
      { id: 'X', staffId: DOC_A, type: 'work', date: '2026-05-01', startTime: '99:99', endTime: '20:00', roomIds: [ROOM_A] },
      { id: 'Y', staffId: DOC_A, type: 'work', date: '2026-05-02', startTime: '10:00', endTime: '14:00', roomIds: [ROOM_A] },
    ];
    const out = derivedDoctorWorkingHoursPerDate({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: ['2026-05-01', '2026-05-02'],
    });
    expect(out['2026-05-01']).toBeUndefined();
    expect(out['2026-05-02']).toEqual([{ start: '10:00', end: '14:00' }]);
  });
});

describe('V62.H4 — Cross-helper consistency: V60 vs V62 specific-doctor', () => {
  it('H4.1 — V60 derivedDoctorDaysFromSchedules({doctorId}) === V62 derivedDoctorDaysAcrossWindow({doctorIds:[doctorId]})', () => {
    const v60 = derivedDoctorDaysFromSchedules({
      doctorId: DOC_A,
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    const v62 = derivedDoctorDaysAcrossWindow({
      doctorIds: [DOC_A],
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    expect(v62).toEqual(v60);
  });
});

describe('V62.H5 — V62 marker comments in source', () => {
  it('H5.1 — derivedDoctorDaysAcrossWindow has V62 / AV34 marker', () => {
    expect(SCHEDULE_VALIDATION_SRC).toMatch(/V62[\s\S]{0,2000}?export function derivedDoctorDaysAcrossWindow/);
  });

  it('H5.2 — derivedDoctorWorkingHoursPerDate has V62 / AV34 marker', () => {
    expect(SCHEDULE_VALIDATION_SRC).toMatch(/V62[\s\S]{0,3000}?export function derivedDoctorWorkingHoursPerDate/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// M — Source-grep regression
// ═══════════════════════════════════════════════════════════════════════

describe('V62.M1 — handleGenScheduleLink wires V62 helpers', () => {
  it('M1.1 — imports both V62 helpers', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/derivedDoctorDaysAcrossWindow/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/derivedDoctorWorkingHoursPerDate/);
  });

  it('M1.2 — V62 / AV34 marker comments present', () => {
    const matches = (ADMIN_DASHBOARD_SRC.match(/V62\s*\/\s*AV34/g) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('M1.3 — derivation block: doctorIdsForDerivation pattern', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/v62DoctorIdsForDerivation\s*=\s*schedSelectedDoctor\s*\?\s*\[schedSelectedDoctor\]\s*:\s*null/);
  });

  it('M1.4 — both derivations called inside handleGenScheduleLink', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/v62MultiDoctorDays\s*=\s*derivedDoctorDaysAcrossWindow/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/v62DoctorHoursPerDate\s*=\s*derivedDoctorWorkingHoursPerDate/);
  });
});

describe('V62.M2 — saved doc shape includes V62 doctorDays + customDoctorHours', () => {
  it('M2.1 — finalDoctorDays unions V60 + V62 + manual paint', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /finalDoctorDays\s*=\s*\[\.\.\.new Set\(\[[\s\S]{0,200}?v62MultiDoctorDays/,
    );
  });

  it('M2.2 — customDoctorHours saved as merged map (V62 derived + admin overrides)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(/v62MergedCustomDoctorHours/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/customDoctorHours:\s*v62MergedCustomDoctorHours/);
  });

  it('M2.3 — admin manual overrides win on collision (spread order)', () => {
    expect(ADMIN_DASHBOARD_SRC).toMatch(
      /v62MergedCustomDoctorHours\s*=\s*\{[\s\S]{0,100}?\.\.\.v62DoctorHoursPerDate[\s\S]{0,100}?\.\.\.\(schedCustomDoctorHours/,
    );
  });
});

describe('V62.M3 — ClinicSchedule.jsx overlay always renders', () => {
  it('M3.1 — V62 marker present', () => {
    expect(CLINIC_SCHEDULE_SRC).toMatch(/V62\s*\/\s*AV34/);
  });

  it('M3.2 — overlay condition no longer guards on !slot.booked', () => {
    // Pre-V62: `slot.doctorSlot && !slot.booked && (`
    // V62: `slot.doctorSlot && (`
    expect(CLINIC_SCHEDULE_SRC).not.toMatch(/slot\.doctorSlot\s*&&\s*!slot\.booked\s*&&\s*\(/);
    expect(CLINIC_SCHEDULE_SRC).toMatch(/slot\.doctorSlot\s*&&\s*\(/);
  });

  it('M3.3 — opacity dim moved from outer card to inner time text only', () => {
    // The time text wrapper has the conditional opacity, not the outer card
    expect(CLINIC_SCHEDULE_SRC).toMatch(/slot\.booked\s*\?\s*['"]opacity-40['"]/);
    // No opacity-30 on outer flex card
    expect(CLINIC_SCHEDULE_SRC).not.toMatch(/className=\{`flex items-center rounded-xl px-4 py-3 transition-all \$\{[^}]*?\?\s*['"]opacity-30['"]/);
  });
});

describe('V62.M4 — V62 fix script Rule M canonical shape', () => {
  it('M4.1 — script uses fileURLToPath invocation guard', () => {
    expect(V62_FIX_SRC).toMatch(/process\.argv\[1\]\s*===\s*fileURLToPath\(import\.meta\.url\)/);
  });

  it('M4.2 — two-phase: dry-run by default + --apply commits', () => {
    expect(V62_FIX_SRC).toMatch(/process\.argv\.includes\(['"]--apply['"]\)/);
  });

  it('M4.3 — uses canonical Firestore paths', () => {
    expect(V62_FIX_SRC).toMatch(/artifacts\/\$\{APP_ID\}\/public\/data\/clinic_schedules/);
    expect(V62_FIX_SRC).toMatch(/artifacts\/\$\{APP_ID\}\/public\/data\/be_staff_schedules/);
    expect(V62_FIX_SRC).toMatch(/artifacts\/\$\{APP_ID\}\/public\/data\/be_admin_audit/);
  });

  it('M4.4 — forensic-trail fields stamped', () => {
    expect(V62_FIX_SRC).toMatch(/_v62BackfilledAt:[\s\S]{0,40}?serverTimestamp/);
    expect(V62_FIX_SRC).toMatch(/_v62LegacyDoctorDays:\s*priorDoctorDays/);
    expect(V62_FIX_SRC).toMatch(/_v62LegacyCustomDoctorHours:\s*priorCustomDoctorHours/);
  });

  it('M4.5 — atomic batch (update + audit emit)', () => {
    expect(V62_FIX_SRC).toMatch(/db\.batch\(\)/);
    expect(V62_FIX_SRC).toMatch(/batch\.update\(schedRef/);
    expect(V62_FIX_SRC).toMatch(/batch\.set\(auditRef/);
    expect(V62_FIX_SRC).toMatch(/batch\.commit\(\)/);
  });

  it('M4.6 — idempotency check', () => {
    expect(V62_FIX_SRC).toMatch(/Idempotent[\s\S]{0,80}?No write needed/);
  });
});

describe('V62.M5 — V60 helper still exists (backward compat preservation)', () => {
  it('M5.1 — derivedDoctorDaysFromSchedules still exported', () => {
    expect(SCHEDULE_VALIDATION_SRC).toMatch(/export function derivedDoctorDaysFromSchedules/);
    expect(typeof derivedDoctorDaysFromSchedules).toBe('function');
  });

  it('M5.2 — V60 + V62 helpers BOTH called in handleGenScheduleLink', () => {
    // V62 doesn't replace V60 — they coexist; finalDoctorDays unions both
    expect(ADMIN_DASHBOARD_SRC).toMatch(/derivedDoctorDays\s*=\s*derivedDoctorDaysFromSchedules/);
    expect(ADMIN_DASHBOARD_SRC).toMatch(/v62MultiDoctorDays\s*=\s*derivedDoctorDaysAcrossWindow/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// X — Mixed combinations matrix
// ═══════════════════════════════════════════════════════════════════════

describe('V62.X1 — Real-world: SCH-9c201860e1 reproduction (noDoctor + showDoctorStatus)', () => {
  it('X1.1 — Pre-V62 scenario: derivedDoctorDays=[]; V62 derives 18 days', () => {
    // Pre-V62: handleGenScheduleLink only ran V60's helper for specific doctor,
    // so noDoctor mode → derivedDoctorDays=[]; V62 fills with multi-doctor.
    const allEntries = RECURRING_DOC_A;
    const datesISO = buildMonth('2026-05');

    // V60 with no doctor: skipped (no doctorId)
    const v60WithSpecific = derivedDoctorDaysFromSchedules({
      doctorId: DOC_A,
      allEntries,
      datesISO,
    });
    expect(v60WithSpecific.length).toBe(18);

    // V62 multi-doctor with no doctor → aggregates all
    const v62Multi = derivedDoctorDaysAcrossWindow({
      doctorIds: null,
      allEntries,
      datesISO,
    });
    expect(v62Multi.length).toBe(18);
    expect(v62Multi).toEqual(v60WithSpecific);
  });

  it('X1.2 — Post-V62: customDoctorHours Sun=13:30-19:30, Mon=16:30-20:30', () => {
    const out = derivedDoctorWorkingHoursPerDate({
      doctorIds: null,
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    // May 10 = Sunday → 13:30-19:30
    expect(out['2026-05-10']).toEqual([{ start: '13:30', end: '19:30' }]);
    // May 11 = Monday → 16:30-20:30
    expect(out['2026-05-11']).toEqual([{ start: '16:30', end: '20:30' }]);
  });
});

describe('V62.X2 — Multi-doctor scenario (real-world likely future)', () => {
  it('X2.1 — Two doctors with non-overlapping Mon shifts → both reflected per-date', () => {
    const entries = [
      ...RECURRING_DOC_A, // Mon 16:30-20:30
      { id: 'B-MON', staffId: DOC_B, type: 'recurring', dayOfWeek: 1, startTime: '10:00', endTime: '14:00', roomIds: [ROOM_DRIP] },
    ];
    const out = derivedDoctorWorkingHoursPerDate({
      doctorIds: null,
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    // May 4 = Monday → Doc A (16:30-20:30) + Doc B (10:00-14:00)
    expect(out['2026-05-04']).toEqual([
      { start: '10:00', end: '14:00' },
      { start: '16:30', end: '20:30' },
    ]);
  });

  it('X2.2 — All-doctors mode includes BOTH doctors days', () => {
    const entries = [...RECURRING_DOC_A, ...RECURRING_DOC_B];
    const out = derivedDoctorDaysAcrossWindow({
      doctorIds: null,
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    // Doc A: Sun/Mon/Wed/Sat (~18); Doc B: Tue/Thu (~9). Union ≈ 27 days
    expect(out.length).toBeGreaterThanOrEqual(25);
    expect(out.length).toBeLessThanOrEqual(31);
  });
});

describe('V62.X3 — Per-date overrides cancel correctly', () => {
  it('X3.1 — leave on May 4 → not in doctorDays (cancels recurring Mon)', () => {
    const entries = [
      ...RECURRING_DOC_A,
      { id: 'L1', staffId: DOC_A, type: 'leave', date: '2026-05-04' },
    ];
    const out = derivedDoctorDaysAcrossWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).not.toContain('2026-05-04');
    // Other Mons unaffected
    expect(out).toContain('2026-05-11');
  });

  it('X3.2 — Per-date work entry on Friday adds it (Doc A normally not Fri)', () => {
    const entries = [
      ...RECURRING_DOC_A,
      { id: 'W1', staffId: DOC_A, type: 'work', date: '2026-05-08', startTime: '09:00', endTime: '12:00', roomIds: [ROOM_A] },
    ];
    const out = derivedDoctorDaysAcrossWindow({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    expect(out).toContain('2026-05-08');
    const hours = derivedDoctorWorkingHoursPerDate({
      doctorIds: [DOC_A],
      allEntries: entries,
      datesISO: buildMonth('2026-05'),
    });
    // Per-date override wins → only the per-date entry counts (recurring Fri = none)
    expect(hours['2026-05-08']).toEqual([{ start: '09:00', end: '12:00' }]);
  });
});

describe('V62.X4 — End-to-end: V62 fixes the SCH-9c201860e1 scenario', () => {
  it('X4.1 — Sunday May 10 + 13:30-14:30 slot → within doctor hours (overlay should fire)', () => {
    const customDoctorHours = derivedDoctorWorkingHoursPerDate({
      doctorIds: null,
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    expect(customDoctorHours['2026-05-10']).toEqual([{ start: '13:30', end: '19:30' }]);

    const doctorDays = derivedDoctorDaysAcrossWindow({
      doctorIds: null,
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    expect(doctorDays).toContain('2026-05-10');
  });

  it('X4.2 — Slot 10:30-11:30 on Sunday → OUTSIDE doctor hours (no overlay)', () => {
    const customDoctorHours = derivedDoctorWorkingHoursPerDate({
      doctorIds: null,
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    const sundayHours = customDoctorHours['2026-05-10'];
    // Slot 10:30 is BEFORE 13:30 → outside
    const slotStart = '10:30';
    const slotEnd = '11:30';
    const inDoctor = sundayHours.some(r => slotStart >= r.start && slotEnd <= r.end);
    expect(inDoctor).toBe(false);
  });

  it('X4.3 — Slot 14:30-15:30 on Sunday → within doctor hours', () => {
    const customDoctorHours = derivedDoctorWorkingHoursPerDate({
      doctorIds: null,
      allEntries: RECURRING_DOC_A,
      datesISO: buildMonth('2026-05'),
    });
    const sundayHours = customDoctorHours['2026-05-10'];
    const slotStart = '14:30';
    const slotEnd = '15:30';
    const inDoctor = sundayHours.some(r => slotStart >= r.start && slotEnd <= r.end);
    expect(inDoctor).toBe(true);
  });
});
