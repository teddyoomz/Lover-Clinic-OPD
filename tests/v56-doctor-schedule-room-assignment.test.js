// tests/v56-doctor-schedule-room-assignment.test.js
// V56 / BS-15 — doctor schedule room assignment helper unit + adversarial.
//
// Companion: tests/v56-doctor-schedule-room-assignment-flow-simulate.test.js
//   (Rule I full-flow simulate)
// Spec: docs/superpowers/specs/2026-05-08-doctor-schedule-room-assignment-design.md

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  validateStaffScheduleStrict,
  expandRoomIdsForDisplay,
  derivedAutoClosedDates,
} from '../src/lib/staffScheduleValidation.js';

describe('V56.L1 — SS-10 doctor + working type requires non-empty roomIds', () => {
  const baseDoctor = {
    staffId: 'd-1',
    staffKind: 'doctor',
    type: 'recurring',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00',
  };

  it('L1.1 doctor + recurring + missing roomIds → reject', () => {
    const fail = validateStaffScheduleStrict({ ...baseDoctor });
    expect(fail).toEqual(['roomIds', 'ต้องเลือกห้องอย่างน้อย 1 ห้อง']);
  });

  it('L1.2 doctor + recurring + empty array → reject', () => {
    const fail = validateStaffScheduleStrict({ ...baseDoctor, roomIds: [] });
    expect(fail).toEqual(['roomIds', 'ต้องเลือกห้องอย่างน้อย 1 ห้อง']);
  });

  it('L1.3 doctor + recurring + non-array → reject', () => {
    const fail = validateStaffScheduleStrict({ ...baseDoctor, roomIds: 'r-1' });
    expect(fail).toEqual(['roomIds', 'ต้องเลือกห้องอย่างน้อย 1 ห้อง']);
  });

  it('L1.4 doctor + recurring + non-string element → reject', () => {
    const fail = validateStaffScheduleStrict({ ...baseDoctor, roomIds: ['r-1', 42] });
    expect(fail).toEqual(['roomIds', 'ต้องเลือกห้องอย่างน้อย 1 ห้อง']);
  });

  it('L1.5 doctor + recurring + valid roomIds → pass', () => {
    const fail = validateStaffScheduleStrict({ ...baseDoctor, roomIds: ['r-1', 'r-2'] });
    expect(fail).toBeNull();
  });

  it('L1.6 doctor + work (per-date) + valid roomIds → pass', () => {
    const fail = validateStaffScheduleStrict({
      ...baseDoctor,
      type: 'work',
      dayOfWeek: undefined,
      date: '2026-05-08',
      roomIds: ['r-1'],
    });
    expect(fail).toBeNull();
  });

  it('L1.7 doctor + leave (no working type) → roomIds NOT required', () => {
    const fail = validateStaffScheduleStrict({
      staffId: 'd-1',
      staffKind: 'doctor',
      type: 'leave',
      date: '2026-05-08',
    });
    expect(fail).toBeNull();
  });

  it('L1.8 staffKind absent (back-compat caller) → SS-10 not enforced', () => {
    const fail = validateStaffScheduleStrict({
      staffId: 'd-1',
      type: 'recurring',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
    });
    expect(fail).toBeNull();
  });
});

describe('V56.L2 — SS-11 assistant entries forbid roomIds', () => {
  const baseAssistant = {
    staffId: 's-1',
    staffKind: 'assistant',
    type: 'recurring',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '17:00',
  };

  it('L2.1 assistant + roomIds present → reject', () => {
    const fail = validateStaffScheduleStrict({ ...baseAssistant, roomIds: ['r-1'] });
    expect(fail).toEqual(['roomIds', 'ผู้ช่วยไม่ต้องเลือกห้อง']);
  });

  it('L2.2 assistant + empty roomIds array → reject (still present)', () => {
    const fail = validateStaffScheduleStrict({ ...baseAssistant, roomIds: [] });
    expect(fail).toEqual(['roomIds', 'ผู้ช่วยไม่ต้องเลือกห้อง']);
  });

  it('L2.3 assistant + roomIds field omitted → pass', () => {
    const fail = validateStaffScheduleStrict({ ...baseAssistant });
    expect(fail).toBeNull();
  });
});

const BRANCH_ROOMS = [
  { id: 'r-doc-1', name: 'ห้องตรวจ A1', kind: 'doctor' },
  { id: 'r-doc-2', name: 'ห้องตรวจ A2', kind: 'doctor' },
  { id: 'r-staff-1', name: 'ห้องทำหัตถการ', kind: 'staff' },
];

describe('V56.L3 — expandRoomIdsForDisplay', () => {
  it('L3.1 doctor entry with rooms → returns those (filtered to existing)', () => {
    const out = expandRoomIdsForDisplay({ roomIds: ['r-doc-1'] }, BRANCH_ROOMS);
    expect(out).toEqual(['r-doc-1']);
  });

  it('L3.2 doctor entry with stale id → silent-skip stale', () => {
    const out = expandRoomIdsForDisplay(
      { roomIds: ['r-doc-1', 'r-deleted-99'] },
      BRANCH_ROOMS,
    );
    expect(out).toEqual(['r-doc-1']);
  });

  it('L3.3 legacy entry (no roomIds) → returns all branch doctor-rooms', () => {
    const out = expandRoomIdsForDisplay({}, BRANCH_ROOMS);
    expect(out).toEqual(['r-doc-1', 'r-doc-2']);
  });

  it('L3.4 entry with empty roomIds → returns all doctor-rooms', () => {
    const out = expandRoomIdsForDisplay({ roomIds: [] }, BRANCH_ROOMS);
    expect(out).toEqual(['r-doc-1', 'r-doc-2']);
  });

  it('L3.5 staff-kind rooms NEVER included even if explicit in roomIds', () => {
    const out = expandRoomIdsForDisplay({ roomIds: ['r-staff-1'] }, BRANCH_ROOMS);
    expect(out).toEqual([]);
  });

  it('L3.6 null/undefined branchExamRooms → empty', () => {
    expect(expandRoomIdsForDisplay({ roomIds: ['r-doc-1'] }, null)).toEqual([]);
    expect(expandRoomIdsForDisplay({ roomIds: ['r-doc-1'] }, undefined)).toEqual([]);
  });

  it('L3.7 null entry → returns all doctor-rooms (defensive)', () => {
    expect(expandRoomIdsForDisplay(null, BRANCH_ROOMS)).toEqual(['r-doc-1', 'r-doc-2']);
  });

  it('L3.8 doctor entry with ALL stale ids → empty result (not full fallback)', () => {
    // Explicit roomIds that all resolve to unknown → filtered to [] NOT
    // all-doctor-rooms. The "all rooms" fallback only fires when roomIds is
    // absent/empty — when the field is present but all ids are stale, the
    // intent was "specific rooms only" so we return empty rather than
    // silently expanding to every room.
    const out = expandRoomIdsForDisplay(
      { roomIds: ['r-deleted-99', 'r-deleted-98'] },
      BRANCH_ROOMS,
    );
    expect(out).toEqual([]);
  });
});

describe('V56.L4 — derivedAutoClosedDates', () => {
  // Doctor d-A: recurring Mon (dayOfWeek 1) with rooms [r-doc-1] only
  const recurringEntries = [
    {
      id: 'STFSCH-0526-aaaaaaaa',
      staffId: 'd-A',
      type: 'recurring',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
      roomIds: ['r-doc-1'],
    },
  ];

  it('L4.1 picked room IS in entry.roomIds → not closed', () => {
    const out = derivedAutoClosedDates({
      doctorId: 'd-A',
      roomId: 'r-doc-1',
      allEntries: recurringEntries,
      datesISO: ['2026-05-04'], // Monday
    });
    expect(out).toEqual([]);
  });

  it('L4.2 picked room NOT in entry.roomIds → closed', () => {
    const out = derivedAutoClosedDates({
      doctorId: 'd-A',
      roomId: 'r-doc-2',
      allEntries: recurringEntries,
      datesISO: ['2026-05-04'],
    });
    expect(out).toEqual(['2026-05-04']);
  });

  it('L4.3 doctor not on shift that date → not closed by V56 rule', () => {
    // Tuesday: no recurring shift
    const out = derivedAutoClosedDates({
      doctorId: 'd-A',
      roomId: 'r-doc-2',
      allEntries: recurringEntries,
      datesISO: ['2026-05-05'], // Tuesday
    });
    expect(out).toEqual([]);
  });

  it('L4.4 legacy entry (no roomIds) → not closed', () => {
    const legacy = [{ ...recurringEntries[0], roomIds: undefined }];
    const out = derivedAutoClosedDates({
      doctorId: 'd-A',
      roomId: 'r-doc-2',
      allEntries: legacy,
      datesISO: ['2026-05-04'],
    });
    expect(out).toEqual([]);
  });

  it('L4.5 per-date override beats recurring', () => {
    // Mon 2026-05-04 — recurring says rooms [r-doc-1]; override says [r-doc-2]
    const withOverride = [
      ...recurringEntries,
      {
        id: 'STFSCH-0526-bbbbbbbb',
        staffId: 'd-A',
        type: 'work',
        date: '2026-05-04',
        startTime: '09:00',
        endTime: '17:00',
        roomIds: ['r-doc-2'],
      },
    ];
    // Picked room r-doc-1 — recurring says yes; override says no → override wins → CLOSED
    const out = derivedAutoClosedDates({
      doctorId: 'd-A',
      roomId: 'r-doc-1',
      allEntries: withOverride,
      datesISO: ['2026-05-04'],
    });
    expect(out).toEqual(['2026-05-04']);
  });

  it('L4.6 multi-date range produces sorted dedup result', () => {
    const out = derivedAutoClosedDates({
      doctorId: 'd-A',
      roomId: 'r-doc-2',
      allEntries: recurringEntries,
      datesISO: ['2026-05-11', '2026-05-04', '2026-05-04'], // 2x Mon + 1x Mon
    });
    expect(out).toEqual(['2026-05-04', '2026-05-11']);
  });

  it('L4.7 missing doctorId / roomId / allEntries / datesISO → empty result', () => {
    expect(
      derivedAutoClosedDates({ doctorId: null, roomId: 'r-doc-1', allEntries: [], datesISO: [] }),
    ).toEqual([]);
    expect(
      derivedAutoClosedDates({ doctorId: 'd-A', roomId: null, allEntries: [], datesISO: [] }),
    ).toEqual([]);
    expect(
      derivedAutoClosedDates({ doctorId: 'd-A', roomId: 'r-doc-1', allEntries: null, datesISO: [] }),
    ).toEqual([]);
  });
});

describe('V56.L5 — adversarial', () => {
  it('L5.1 SS-10 with Thai-char roomId strings → pass', () => {
    const fail = validateStaffScheduleStrict({
      staffId: 'd-1',
      staffKind: 'doctor',
      type: 'recurring',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
      roomIds: ['ห้อง-A1', 'ห้อง-B2'],
    });
    expect(fail).toBeNull();
  });

  it('L5.2 derivedAutoClosedDates idempotent — same input twice = same output', () => {
    const args = {
      doctorId: 'd-A',
      roomId: 'r-doc-2',
      allEntries: [
        {
          staffId: 'd-A',
          type: 'recurring',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          roomIds: ['r-doc-1'],
        },
      ],
      datesISO: ['2026-05-04'],
    };
    expect(derivedAutoClosedDates(args)).toEqual(derivedAutoClosedDates(args));
  });

  it('L5.3 expandRoomIdsForDisplay numeric id stringification', () => {
    const out = expandRoomIdsForDisplay(
      { roomIds: [123] },
      [{ id: 123, kind: 'doctor', name: 'A' }],
    );
    expect(out).toEqual(['123']);
  });

  it('L5.4 derivedAutoClosedDates rejects malformed dateISO entries', () => {
    const out = derivedAutoClosedDates({
      doctorId: 'd-A',
      roomId: 'r-doc-2',
      allEntries: [
        {
          staffId: 'd-A',
          type: 'recurring',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          roomIds: ['r-doc-1'],
        },
      ],
      datesISO: ['not-a-date', '2026-05-04', null, undefined, '2026-13-99'],
    });
    expect(out).toEqual(['2026-05-04']); // only valid Monday picked up
  });
});

describe('V56.L6 — V56/BS-15 source markers', () => {
  const validationSrc = readFileSync('src/lib/staffScheduleValidation.js', 'utf8');

  it('L6.1 staffScheduleValidation.js exports expandRoomIdsForDisplay', () => {
    expect(typeof expandRoomIdsForDisplay).toBe('function');
    // V56/BS-15 marker comment must appear in the JSDoc block for the function
    // (institutional memory grep — mirrors V52 G-group + V54 L5.x pattern).
    // The marker lives in the JSDoc ABOVE the function declaration.
    expect(validationSrc).toMatch(/V56\s*\/\s*BS-15[\s\S]{0,600}?expandRoomIdsForDisplay/);
  });

  it('L6.2 staffScheduleValidation.js exports derivedAutoClosedDates', () => {
    expect(typeof derivedAutoClosedDates).toBe('function');
    // Marker appears in JSDoc preceding derivedAutoClosedDates.
    expect(validationSrc).toMatch(/V56\s*\/\s*BS-15[\s\S]{0,1200}?derivedAutoClosedDates/);
  });

  it('L6.3 SS-10 + SS-11 marker comment present in validation block', () => {
    expect(validationSrc).toMatch(/SS-10[\s\S]{0,800}?SS-11/);
    expect(validationSrc).toMatch(/V56\s*\/\s*BS-15/);
  });
});

describe('V56.L7 — normalizeStaffSchedule passes staffKind + roomIds through (V21 lock)', () => {
  const validationSrc = readFileSync('src/lib/staffScheduleValidation.js', 'utf8');

  it('L7.1 normalizeStaffSchedule JSDoc locks staffKind pass-through', () => {
    // The JSDoc before normalizeStaffSchedule explicitly names staffKind as a
    // field that MUST NOT be stripped. If a future whitelist-style refactor
    // drops staffKind, SS-10/SS-11 silently stop firing.
    // Regex: JSDoc containing 'staffKind' appears before function declaration.
    expect(validationSrc).toMatch(/staffKind[\s\S]{0,600}?normalizeStaffSchedule/);
  });

  it('L7.2 normalizeStaffSchedule JSDoc locks roomIds pass-through', () => {
    // roomIds is the V56 schema field for doctor entries — must not be stripped.
    expect(validationSrc).toMatch(/roomIds[\s\S]{0,600}?normalizeStaffSchedule/);
  });
});
