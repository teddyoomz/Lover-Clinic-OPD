# V56 — Doctor Schedule Room Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-shift room assignment to be_staff_schedules so admin ticks which exam rooms a doctor is licensed for in each schedule entry, and the data flows to TodaysDoctorsPanel chips + V55 schedule-link auto-closure when admin's picked (doctor, room) isn't licensed for a date.

**Architecture:** Pure additive feature on top of V55/BS-14. New optional `roomIds: string[]` field on `be_staff_schedules` (doctor required non-empty / assistant forbidden / legacy = "all rooms" semantic). Two pure helpers in `staffScheduleValidation.js` (`expandRoomIdsForDisplay`, `derivedAutoClosedDates`) drive consumer rendering + V55 link auto-closure. Modal renders a vertical checkbox box conditionally based on `staffKind` prop. No data migration, no firestore.rules change, no new fields in V55 saved doc.

**Tech Stack:** React 19, Vite, Firestore SDK, vitest, branch-scope architecture (BSA Layer 1/2/3 from V52-V55).

**Spec:** [docs/superpowers/specs/2026-05-08-doctor-schedule-room-assignment-design.md](docs/superpowers/specs/2026-05-08-doctor-schedule-room-assignment-design.md)

**Notes for executor:**
- Project rule: this codebase commits direct on master (no worktree workflow). Each task ends with `git commit` to master per Rule 02 frequent-commits + Rule N targeted-test discipline.
- Per-test runs: `npx vitest run tests/<file>` (NOT `npm test` — vitest CLI direct is faster).
- Build check: `npm run build` (catches import resolution + missing-export errors that vitest mocks can hide — V11 lock).
- Existing helper `listStaffSchedules({staffId, startDate, endDate, branchId})` at backendClient.js:10516 — use it directly; do NOT create a new lister.
- Existing helper `mergeSchedulesForDate(targetDate, all, staffIdsFilter)` in staffScheduleValidation.js — `derivedAutoClosedDates` calls it.
- Spec correction: TodaysDoctorsPanel is mounted in `src/components/backend/AppointmentCalendarView.jsx:673` (NOT a non-existent AppointmentTab.jsx — Files Touched table in spec was defensive).

---

## Task 1: SS-10 + SS-11 validation invariants + helper unit tests

**Files:**
- Modify: `src/lib/staffScheduleValidation.js` (extend `validateStaffScheduleStrict` + add 2 helpers)
- Create: `tests/v56-doctor-schedule-room-assignment.test.js`

- [ ] **Step 1: Create the test file with SS-10 failing tests**

```js
// tests/v56-doctor-schedule-room-assignment.test.js
// V56 / BS-15 — doctor schedule room assignment helper unit + adversarial.
//
// Companion: tests/v56-doctor-schedule-room-assignment-flow-simulate.test.js
//   (Rule I full-flow simulate)
// Spec: docs/superpowers/specs/2026-05-08-doctor-schedule-room-assignment-design.md

import { describe, it, expect } from 'vitest';
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
```

- [ ] **Step 2: Run failing tests (verify red)**

Run: `npx vitest run tests/v56-doctor-schedule-room-assignment.test.js`
Expected: FAIL — `expandRoomIdsForDisplay` and `derivedAutoClosedDates` not exported yet (also some assertion failures since SS-10/SS-11 don't exist).

- [ ] **Step 3: Implement SS-10 + SS-11 in `validateStaffScheduleStrict`**

Locate the end of the existing function in `src/lib/staffScheduleValidation.js` (the function ends around the `return null;` after SS-9 checks). Add SS-10 + SS-11 BEFORE `return null;`:

```js
  // V56 / BS-15 (2026-05-08) — SS-10 doctor + working type requires
  // non-empty roomIds[]. SS-11 assistant entries forbid roomIds field.
  // staffKind is a caller-provided pure-validator parameter (NOT stored
  // on the doc) — DoctorSchedulesTab passes 'doctor', EmployeeSchedulesTab
  // passes 'assistant'. Absent staffKind → backward-compat (SS-10/SS-11
  // not enforced) so legacy callers continue working.
  if (form.staffKind === 'doctor' && WORKING_TIME_TYPES.has(type)) {
    const rooms = form.roomIds;
    const valid =
      Array.isArray(rooms) && rooms.length >= 1 && rooms.every((r) => typeof r === 'string' && r.length > 0);
    if (!valid) return ['roomIds', 'ต้องเลือกห้องอย่างน้อย 1 ห้อง'];
  }
  if (form.staffKind === 'assistant' && form.roomIds != null) {
    return ['roomIds', 'ผู้ช่วยไม่ต้องเลือกห้อง'];
  }
```

- [ ] **Step 4: Implement `expandRoomIdsForDisplay`**

Append to `src/lib/staffScheduleValidation.js` (after the existing exports):

```js
/**
 * V56 / BS-15 (2026-05-08) — resolve a schedule entry's effective room ids
 * for display purposes (TodaysDoctorsPanel chips). Pure helper.
 *
 * - Doctor entry with non-empty roomIds → filter to ids present in
 *   branchExamRooms (silent stale-skip) → return that filtered list.
 * - Legacy entry (no roomIds) OR assistant entry → return all branch
 *   doctor-kind room ids (the "ทุกห้อง" semantic).
 *
 * @param {{roomIds?: string[]}} entry
 * @param {Array<{id: string, kind: string}>} branchExamRooms
 * @returns {string[]} resolved room ids
 */
export function expandRoomIdsForDisplay(entry, branchExamRooms) {
  const branchRooms = Array.isArray(branchExamRooms) ? branchExamRooms : [];
  const doctorRooms = branchRooms.filter((r) => r && r.kind === 'doctor');
  const allDoctorIds = doctorRooms.map((r) => String(r.id));
  if (!entry || !Array.isArray(entry.roomIds) || entry.roomIds.length === 0) {
    return allDoctorIds;
  }
  const allowed = new Set(allDoctorIds);
  return entry.roomIds.filter((rid) => allowed.has(String(rid))).map(String);
}
```

- [ ] **Step 5: Implement `derivedAutoClosedDates`**

Append to `src/lib/staffScheduleValidation.js`:

```js
/**
 * V56 / BS-15 (2026-05-08) — derive auto-closure dates for V55 schedule
 * link generation. For each date in datesISO, resolves the picked
 * doctor's effective schedule entry (recurring + per-date override) and
 * checks whether picked roomId is in entry.roomIds. If NOT licensed,
 * the date is added to the auto-closure result.
 *
 * Legacy entries (no roomIds) → not closed (preserves pre-V56 behavior).
 * If doctor has no entry on a date (no shift) → not closed by THIS rule
 * (V55's existing closure mechanisms handle "no shift" separately).
 *
 * @param {object} opts
 * @param {string|null|undefined} opts.doctorId
 * @param {string|null|undefined} opts.roomId
 * @param {Array} opts.allEntries — all be_staff_schedules entries for the
 *   branch (recurring + per-date mixed). Pass listStaffSchedules() output.
 * @param {string[]} opts.datesISO — array of YYYY-MM-DD strings
 * @returns {string[]} sorted, deduplicated date strings to auto-close
 */
export function derivedAutoClosedDates({ doctorId, roomId, allEntries, datesISO }) {
  if (!doctorId || !roomId || !Array.isArray(allEntries) || !Array.isArray(datesISO)) {
    return [];
  }
  const closed = new Set();
  for (const dateISO of datesISO) {
    if (typeof dateISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) continue;
    const merged = mergeSchedulesForDate(dateISO, allEntries, [String(doctorId)]);
    const entry = merged.find((m) => String(m.staffId) === String(doctorId));
    if (!entry) continue; // no shift → V55 handles separately
    if (!Array.isArray(entry.roomIds) || entry.roomIds.length === 0) continue; // legacy → not closed
    if (!entry.roomIds.map(String).includes(String(roomId))) {
      closed.add(dateISO);
    }
  }
  return [...closed].sort();
}
```

- [ ] **Step 6: Add helper unit tests for L3 (expandRoomIdsForDisplay) + L4 (derivedAutoClosedDates) + L5 (adversarial)**

Append to `tests/v56-doctor-schedule-room-assignment.test.js`:

```js
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
  it('L6.1 staffScheduleValidation.js exports expandRoomIdsForDisplay', () => {
    expect(typeof expandRoomIdsForDisplay).toBe('function');
  });

  it('L6.2 staffScheduleValidation.js exports derivedAutoClosedDates', () => {
    expect(typeof derivedAutoClosedDates).toBe('function');
  });
});
```

- [ ] **Step 7: Run all V56.L1-L6 tests (verify green)**

Run: `npx vitest run tests/v56-doctor-schedule-room-assignment.test.js`
Expected: PASS — all L1-L6 green (40+ assertions).

- [ ] **Step 8: Build check**

Run: `npm run build`
Expected: clean build (no missing-export / silent shadow errors per V11 lock).

- [ ] **Step 9: Commit Task 1**

```bash
git add src/lib/staffScheduleValidation.js tests/v56-doctor-schedule-room-assignment.test.js
git commit -m "feat(V56/BS-15): SS-10 + SS-11 + expandRoomIdsForDisplay + derivedAutoClosedDates

Pure helpers + validation invariants for doctor schedule room assignment.

SS-10: doctor + working type (recurring/work/halfday) requires non-empty
  roomIds (block save with 'ต้องเลือกห้องอย่างน้อย 1 ห้อง')
SS-11: assistant + roomIds present → reject 'ผู้ช่วยไม่ต้องเลือกห้อง'

NEW pure helpers:
  expandRoomIdsForDisplay(entry, branchExamRooms) — silent-skip stale ids;
    legacy/empty falls back to all branch doctor-rooms
  derivedAutoClosedDates({doctorId, roomId, allEntries, datesISO}) —
    closes dates where picked room not in licensed roomIds; uses
    existing mergeSchedulesForDate for recurring+override merge

40+ assertions in tests/v56-doctor-schedule-room-assignment.test.js
covering L1-L6 (validation + display expansion + auto-closure + adversarial
+ source markers).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: ScheduleEntryFormModal — render room-checkbox box for doctors

**Files:**
- Modify: `src/components/backend/scheduling/ScheduleEntryFormModal.jsx`
- Test: append to `tests/v56-doctor-schedule-room-assignment.test.js`

- [ ] **Step 1: Add staffKind + branchExamRooms props + room-box rendering**

Replace the export signature + add the box render. Locate the existing function signature in `ScheduleEntryFormModal.jsx`:

```jsx
export default function ScheduleEntryFormModal({
  open,
  kind,           // 'recurring' | 'override' | 'leave'
  staffId,
  staffName = '',
  initialEntry,
  onClose,
  onSave,
  branchId = '',
}) {
```

Add `staffKind` + `branchExamRooms` props with sensible defaults:

```jsx
export default function ScheduleEntryFormModal({
  open,
  kind,
  staffId,
  staffName = '',
  initialEntry,
  onClose,
  onSave,
  branchId = '',
  // V56 / BS-15 (2026-05-08) — staffKind drives room-box visibility +
  // SS-10/SS-11 validation. branchExamRooms is fetched + passed by parent
  // tab (DoctorSchedulesTab / EmployeeSchedulesTab) — modal is pure
  // presentation, no listExamRooms call here.
  staffKind = 'doctor',
  branchExamRooms = [],
}) {
```

- [ ] **Step 2: Initialize roomIds in form state**

Update the `defaultEntry` helper at the top of the file to seed `roomIds` for doctors:

```js
function defaultEntry(kind, staffId, staffName, staffKind, doctorRoomIds) {
  // V56 / BS-15 — seed roomIds for doctor entries with all current branch
  // doctor-rooms (admin can untick to narrow). Assistant entries omit
  // the field entirely per SS-11.
  const seedRooms = (staffKind === 'doctor' && Array.isArray(doctorRoomIds))
    ? [...doctorRoomIds]
    : undefined;
  if (kind === 'recurring') {
    return {
      type: 'recurring',
      staffId,
      staffName,
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
      date: '',
      ...(seedRooms !== undefined && { roomIds: seedRooms }),
    };
  }
  if (kind === 'override') {
    return {
      type: 'work',
      staffId,
      staffName,
      date: '',
      dayOfWeek: null,
      startTime: '09:00',
      endTime: '17:00',
      ...(seedRooms !== undefined && { roomIds: seedRooms }),
    };
  }
  return {
    type: 'leave',
    staffId,
    staffName,
    date: '',
    dayOfWeek: null,
    note: '',
    startTime: '',
    endTime: '',
  };
}
```

Inside the component body, derive `doctorRoomIds` once:

```jsx
  // V56 / BS-15 — doctor-kind rooms only (matches V55 schedule-link
  // shownRooms pattern). Memoized so identity is stable across renders.
  const doctorRoomIds = useMemo(
    () => (branchExamRooms || [])
      .filter((r) => r && r.kind === 'doctor')
      .map((r) => String(r.id)),
    [branchExamRooms],
  );
```

Update the `useState` initializer + the `useEffect` reset to pass these:

```jsx
  const [form, setForm] = useState(() =>
    initialEntry || defaultEntry(kind, staffId, staffName, staffKind, doctorRoomIds),
  );
  // ...
  useEffect(() => {
    if (open) {
      setForm(initialEntry || defaultEntry(kind, staffId, staffName, staffKind, doctorRoomIds));
      setError('');
    }
  }, [open, kind, staffId, staffName, initialEntry, staffKind]);
  // NOTE: doctorRoomIds intentionally NOT in deps — branch switch handled by parent re-mounting modal with new branchExamRooms; in-modal-open switch handled by useEffect-on-branchExamRooms below.
```

- [ ] **Step 3: Branch-switch defensive reset effect**

Add a useEffect inside the component body (after the form useEffect):

```jsx
  // V56 / BS-15 — when branchExamRooms changes (parent re-fetched after
  // branch switch while modal open), drop any roomIds in form state that
  // no longer exist in the new branch's room set. Forces admin to re-pick
  // when current ticks become stale. Doctor + working type only.
  useEffect(() => {
    if (staffKind !== 'doctor') return;
    if (!Array.isArray(form.roomIds)) return;
    const allowed = new Set(doctorRoomIds);
    const filtered = form.roomIds.filter((rid) => allowed.has(String(rid)));
    if (filtered.length !== form.roomIds.length) {
      setForm((prev) => ({ ...prev, roomIds: filtered }));
    }
  }, [doctorRoomIds, staffKind, form.roomIds]);
```

- [ ] **Step 4: Render the room-checkbox box**

Locate the JSX block where the existing time fields end (after the time `<div className="grid grid-cols-2 gap-2">...</div>` block, before the note input):

```jsx
          {/* Time fields (recurring + work + halfday) */}
          {showTime && (
            <div className="grid grid-cols-2 gap-2">
              ...
            </div>
          )}

          {/* V56 / BS-15 — Room checkbox box (doctor + working type only) */}
          {staffKind === 'doctor' && showTime && (
            <div data-testid="schedule-form-rooms-box">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--tx-muted)] mb-1 block">
                ห้องตรวจ <RequiredAsterisk />
              </label>
              <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg-input)] p-2 space-y-1">
                {doctorRoomIds.length === 0 ? (
                  <p className="text-[11px] text-amber-400">
                    ไม่มีห้องตรวจในสาขานี้ — เพิ่มที่{' '}
                    <a href="?tab=exam-rooms" className="underline hover:text-amber-300">
                      ตั้งค่า → ห้องตรวจ
                    </a>
                  </p>
                ) : (
                  <>
                    <div className="flex gap-1.5 mb-1">
                      <button type="button"
                        onClick={() => setForm({ ...form, roomIds: [...doctorRoomIds] })}
                        className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-900/40 border border-emerald-700 text-emerald-300 hover:bg-emerald-800/40"
                        data-testid="schedule-form-rooms-select-all">
                        ✓ เลือกทั้งหมด
                      </button>
                      <button type="button"
                        onClick={() => setForm({ ...form, roomIds: [] })}
                        className="px-2 py-1 rounded text-[10px] font-bold bg-rose-900/30 border border-rose-800 text-rose-300 hover:bg-rose-800/40"
                        data-testid="schedule-form-rooms-clear-all">
                        ✗ ยกเลิกทั้งหมด
                      </button>
                    </div>
                    {(branchExamRooms || []).filter((r) => r && r.kind === 'doctor').map((r) => {
                      const checked = (form.roomIds || []).map(String).includes(String(r.id));
                      return (
                        <label key={r.id}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"
                          data-testid={`schedule-form-room-row-${r.id}`}>
                          <input type="checkbox" checked={checked}
                            onChange={(e) => {
                              const cur = (form.roomIds || []).map(String);
                              const next = e.target.checked
                                ? [...new Set([...cur, String(r.id)])]
                                : cur.filter((x) => x !== String(r.id));
                              setForm({ ...form, roomIds: next });
                            }}
                            className="w-4 h-4 rounded border-[var(--bd)]" />
                          <span className="text-xs text-[var(--tx-primary)]">{r.name}</span>
                        </label>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}

          {/* V56 / BS-15 — Assistant info chip (replaces room box) */}
          {staffKind === 'assistant' && showTime && (
            <div className="rounded-lg bg-amber-900/20 border border-amber-800 px-3 py-2"
              data-testid="schedule-form-assistant-info">
              <p className="text-[11px] text-amber-300">
                ℹ ผู้ช่วยทำงานทุกห้องอัตโนมัติ — ไม่ต้องเลือกห้อง
              </p>
            </div>
          )}

          {/* Note (leave + override) */}
          ...
```

- [ ] **Step 5: Strip roomIds from assistant payload at submit; pass staffKind to validator**

Update `handleSubmit`:

```jsx
  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    setError('');
    try {
      const id = form.id || generateStaffScheduleId();
      // V56 / BS-15 — assistant entries MUST NOT carry roomIds; strip
      // defensively in case form state has stale leftover.
      const cleanedForm = staffKind === 'assistant' ? (() => {
        const { roomIds: _drop, ...rest } = form;
        return rest;
      })() : form;
      const payload = {
        ...cleanedForm,
        id,
        scheduleId: id,
        staffId,
        staffName,
        branchId,
      };
      // V56 / BS-15 — pass staffKind so validateStaffScheduleStrict
      // enforces SS-10 (doctor → roomIds required) + SS-11 (assistant
      // → roomIds forbidden). Pure-validator parameter; not stored.
      const fail = validateStaffScheduleStrict({ ...payload, staffKind });
      if (fail) { setError(fail[1]); setSaving(false); return; }
      await onSave?.(payload);
      onClose?.();
    } catch (e) {
      setError(e?.message || 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 6: Disable save button when doctor + working type + no rooms picked**

Update the submit button:

```jsx
            <button type="submit"
              disabled={
                saving ||
                (staffKind === 'doctor' && (form.type === 'recurring' || form.type === 'work' || form.type === 'halfday') && (!Array.isArray(form.roomIds) || form.roomIds.length === 0))
              }
              className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 inline-flex items-center gap-1.5"
              data-testid="schedule-form-submit">
              {saving && <Loader2 size={12} className="animate-spin" />}
              บันทึก
            </button>
```

- [ ] **Step 7: Run targeted vitest + build**

Run: `npx vitest run tests/v56-doctor-schedule-room-assignment.test.js`
Expected: PASS (all L1-L6 still green; no React render in this test file).

Run: `npm run build`
Expected: clean.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/components/backend/scheduling/ScheduleEntryFormModal.jsx
git commit -m "feat(V56/BS-15): ScheduleEntryFormModal renders room-checkbox box for doctors

NEW props: staffKind ('doctor'|'assistant') + branchExamRooms (Array).

Render rules:
  - leave/sick/holiday types → no room box (rooms don't apply)
  - staffKind === 'assistant' → amber info chip 'ผู้ช่วยทำงานทุกห้อง
    อัตโนมัติ' replaces the box
  - staffKind === 'doctor' + working type → vertical checkbox list:
    * 'เลือกทั้งหมด' / 'ยกเลิกทั้งหมด' top-row toggles
    * one row per branchExamRooms.kind=='doctor' room
    * empty state with link to ?tab=exam-rooms
    * whole row clickable to toggle
    * save button disabled while form.roomIds empty

defaultEntry seeds doctor entries with all current branch doctor-rooms;
assistant entries omit roomIds field entirely (SS-11 contract).

Branch-switch defensive reset useEffect: roomIds filtered to current
branch's available doctor-rooms when branchExamRooms changes mid-modal-open.

handleSubmit strips roomIds from assistant payload defensively;
passes staffKind to validateStaffScheduleStrict for SS-10/SS-11
enforcement.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: DoctorSchedulesTab + EmployeeSchedulesTab — fetch branchExamRooms + pass props

**Files:**
- Modify: `src/components/backend/DoctorSchedulesTab.jsx`
- Modify: `src/components/backend/EmployeeSchedulesTab.jsx`

- [ ] **Step 1: Read both tabs to find ScheduleEntryFormModal usage**

Run: `grep -n "ScheduleEntryFormModal" F:/LoverClinic-app/src/components/backend/DoctorSchedulesTab.jsx`
Run: `grep -n "ScheduleEntryFormModal" F:/LoverClinic-app/src/components/backend/EmployeeSchedulesTab.jsx`

Note the line numbers where each tab renders the modal — that's where the new props go.

- [ ] **Step 2: Add branchExamRooms state to DoctorSchedulesTab**

In `src/components/backend/DoctorSchedulesTab.jsx`:

Add imports near the top (preserving existing import block):

```jsx
import { listExamRooms } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
```

Inside the component body, near the top:

```jsx
  // V56 / BS-15 (2026-05-08) — branch-scoped exam rooms via Phase 18.0
  // be_exam_rooms collection. Passed to ScheduleEntryFormModal for the
  // room-checkbox box rendering. Mirror of V55 AdminDashboard pattern.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [branchExamRooms, setBranchExamRooms] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rooms = await listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' });
        if (cancelled) return;
        setBranchExamRooms(rooms || []);
      } catch (_) {
        if (!cancelled) setBranchExamRooms([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedBranchId]);
```

(If `useSelectedBranch` is already imported in this file, skip that import line. If `useState` / `useEffect` aren't imported, add them.)

- [ ] **Step 3: Pass staffKind='doctor' + branchExamRooms to modal**

Locate the `<ScheduleEntryFormModal ... />` JSX in DoctorSchedulesTab.jsx and add the new props:

```jsx
          <ScheduleEntryFormModal
            open={...}
            kind={...}
            staffId={...}
            staffName={...}
            initialEntry={...}
            branchId={selectedBranchId}
            onClose={...}
            onSave={...}
            staffKind="doctor"
            branchExamRooms={branchExamRooms}
          />
```

- [ ] **Step 4: Mirror in EmployeeSchedulesTab.jsx — pass staffKind='assistant'**

In `src/components/backend/EmployeeSchedulesTab.jsx`, add the same `<ScheduleEntryFormModal ... />` props:

```jsx
          <ScheduleEntryFormModal
            ...
            staffKind="assistant"
            branchExamRooms={[]}
          />
```

(Empty array is fine for assistant — modal doesn't render the box anyway. Pass for prop-shape consistency.)

- [ ] **Step 5: Run vitest + build**

Run: `npx vitest run tests/v56-doctor-schedule-room-assignment.test.js`
Run: `npm run build`
Expected: both pass / clean.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/components/backend/DoctorSchedulesTab.jsx src/components/backend/EmployeeSchedulesTab.jsx
git commit -m "feat(V56/BS-15): DoctorSchedulesTab + EmployeeSchedulesTab pass staffKind + rooms

DoctorSchedulesTab fetches branchExamRooms via listExamRooms({
  branchId: selectedBranchId, status: 'ใช้งาน' }) — mirror of V55
AdminDashboard pattern (Phase 18.0 branch-scoped be_exam_rooms).

Both tabs now pass staffKind ('doctor' / 'assistant') + branchExamRooms
to ScheduleEntryFormModal so the room-checkbox box renders correctly
per the V56 contract (Q2/Q4 locked).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: TodaysDoctorsPanel — render inline room chips per doctor row

**Files:**
- Modify: `src/components/backend/scheduling/TodaysDoctorsPanel.jsx`
- Modify: `src/components/backend/AppointmentCalendarView.jsx` (mounts the panel; pass `branchExamRooms`)

- [ ] **Step 1: Add branchExamRooms prop + chip rendering to TodaysDoctorsPanel**

In `src/components/backend/scheduling/TodaysDoctorsPanel.jsx`:

Update imports + signature:

```jsx
import { User } from 'lucide-react';
// V56 / BS-15 (2026-05-08) — chip rendering uses expandRoomIdsForDisplay
// to silent-skip stale ids and fall back to all branch doctor-rooms for
// legacy (pre-V56) entries.
import { expandRoomIdsForDisplay } from '../../../lib/staffScheduleValidation.js';

// ... existing fmtThaiDate ...

export default function TodaysDoctorsPanel({
  dateISO,
  doctors = [],
  todaysSchedules = [],
  loading = false,
  onDoctorClick,
  isDark = true,
  // V56 / BS-15 — branch-scoped exam rooms for chip rendering. When empty,
  // panel renders 'ทุกห้อง' chip (back-compat).
  branchExamRooms = [],
}) {
```

Update the `todaysDoctors` build to attach resolved room labels:

```jsx
  const roomNameById = new Map(
    (branchExamRooms || []).filter((r) => r && r.kind === 'doctor').map((r) => [String(r.id), r.name]),
  );
  const todaysDoctors = (todaysSchedules || [])
    .filter((s) => s.type === 'recurring' || s.type === 'work' || s.type === 'halfday')
    .map((s) => {
      const doc = doctors.find((d) => String(d.doctorId || d.id) === String(s.staffId));
      if (!doc) return null;
      const firstname = doc.firstname || doc.firstName || '';
      const lastname = doc.lastname || doc.lastName || '';
      const nick = doc.nickname ? ` (${doc.nickname})` : '';
      const display = `${firstname} ${lastname}`.trim() + nick;
      // V56 / BS-15 — resolve room ids for display.
      const resolvedIds = expandRoomIdsForDisplay(s, branchExamRooms);
      const explicit = Array.isArray(s.roomIds) && s.roomIds.length > 0;
      // Legacy entry (no roomIds) OR resolution returns the full doctor-room
      // set → render single 'ทุกห้อง' chip. Otherwise render one chip per id.
      const isAllRooms =
        !explicit ||
        (resolvedIds.length > 0 && resolvedIds.length === roomNameById.size && resolvedIds.every((rid) => roomNameById.has(rid)));
      const chips = isAllRooms
        ? [{ id: '__all__', name: 'ทุกห้อง' }]
        : resolvedIds.map((rid) => ({ id: rid, name: roomNameById.get(rid) || rid }));
      return {
        doctorId: String(doc.doctorId || doc.id),
        name: display || doc.name || `แพทย์ ${s.staffId}`,
        startTime: s.startTime,
        endTime: s.endTime,
        chips,
        sourceEntry: s,
      };
    })
    .filter(Boolean);

  todaysDoctors.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
```

Update the row JSX to render chips below the time line (so they don't blow out the single-line layout when many rooms):

```jsx
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--tx-secondary)] font-medium truncate">{doc.name}</p>
                <p className="text-[11px] text-[var(--tx-muted)] font-mono">
                  {doc.startTime} - {doc.endTime}
                </p>
                {/* V56 / BS-15 — inline chips (wrap if many) */}
                {doc.chips && doc.chips.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1" data-testid={`todays-doctor-chips-${doc.doctorId}`}>
                    {doc.chips.map((chip) => (
                      <span key={chip.id}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${isDark ? 'bg-sky-950/40 border border-sky-900/50 text-sky-300' : 'bg-sky-50 border border-sky-200 text-sky-700'}`}>
                        {chip.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
```

- [ ] **Step 2: Pass branchExamRooms from AppointmentCalendarView**

In `src/components/backend/AppointmentCalendarView.jsx`, find the `<TodaysDoctorsPanel ... />` mount (line ~673 per earlier grep):

The file already imports `listExamRooms` (line 37 per grep) + already has `branchExamRooms`-equivalent data in scope around line 391 (`listExamRooms({ branchId: selectedBranchId, status: 'ใช้งาน' })`). Reuse that state — likely named `examRooms` or similar.

Run: `grep -n "examRooms\|ExamRooms" F:/LoverClinic-app/src/components/backend/AppointmentCalendarView.jsx | head -10`
Note the local state variable name. Pass it to TodaysDoctorsPanel as `branchExamRooms`:

```jsx
<TodaysDoctorsPanel
  dateISO={...}
  doctors={...}
  todaysSchedules={...}
  loading={...}
  onDoctorClick={...}
  isDark={isDark}
  branchExamRooms={examRooms /* or whatever the local var is */}
/>
```

If `AppointmentCalendarView` doesn't currently have a `branchExamRooms`-equivalent state, add one with the same V55 pattern (listExamRooms + selectedBranchId in deps).

- [ ] **Step 3: Run vitest + build**

Run: `npx vitest run tests/v56-doctor-schedule-room-assignment.test.js`
Run: `npm run build`
Expected: both pass / clean.

- [ ] **Step 4: Commit Task 4**

```bash
git add src/components/backend/scheduling/TodaysDoctorsPanel.jsx src/components/backend/AppointmentCalendarView.jsx
git commit -m "feat(V56/BS-15): TodaysDoctorsPanel renders inline room chips per doctor row

NEW prop: branchExamRooms. Per-doctor row now shows ชื่อหมอ /
HH:MM - HH:MM / chip(s) with resolved room names.

Chip rendering rules (via expandRoomIdsForDisplay):
  - Doctor entry with explicit roomIds → one chip per resolved room
    (silent-skip stale ids)
  - Legacy entry (no roomIds) OR resolved set covers all branch
    doctor-rooms → single 'ทุกห้อง' chip (Q2 backward-compat)

AppointmentCalendarView passes existing branch-scoped examRooms state
to the panel — mirror of V55 BS-14 list pattern.

Chip styling: rounded pill, sky-tinted to match panel accent. Wraps
to 2nd line if overflow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: AdminDashboard handleGenScheduleLink — V55 auto-closure integration

**Files:**
- Modify: `src/pages/AdminDashboard.jsx` (handleGenScheduleLink + import)

- [ ] **Step 1: Add imports**

In `src/pages/AdminDashboard.jsx`, locate the existing import from `staffScheduleValidation.js` (if any) or the `scopedDataLayer.js` block. Add:

```jsx
// V56 / BS-15 (2026-05-08) — auto-closure helper for V55 schedule-link gen.
import { derivedAutoClosedDates } from '../lib/staffScheduleValidation.js';
import { listStaffSchedules } from '../lib/scopedDataLayer.js';
```

If `listStaffSchedules` is not yet exported from scopedDataLayer.js, add a passthrough export there:

```js
// In src/lib/scopedDataLayer.js — add to the existing export list near similar lib re-exports:
export const listStaffSchedules = _autoInject(() => raw.listStaffSchedules);
```

(Branch scope is already auto-injected by `_autoInject` — caller passes explicit `branchId` per V55/BS-14 canonical when needed.)

- [ ] **Step 2: Insert auto-closure logic into handleGenScheduleLink**

In `src/pages/AdminDashboard.jsx` `handleGenScheduleLink`, find the location just BEFORE the `await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'clinic_schedules', token), { ... })` save call (around line 1342).

Add this block immediately before the setDoc:

```jsx
      // V56 / BS-15 (2026-05-08) — auto-close dates where the picked
      // (selectedDoctor, selectedRoom) combo isn't licensed per the
      // doctor's be_staff_schedules. Skip if either pick is null
      // (admin chose "all doctors" or "all rooms" — derivedAutoClosedDates
      // returns []). Pre-V56 doctor entries (no roomIds) preserve
      // backward-compat (returns [] from helper). Closures union into
      // existing schedClosedDays — V55 saved doc's `closedDays` field
      // already drives "ปิด" rendering on the public link page.
      let v56AutoClosed = [];
      if (schedSelectedDoctor && schedSelectedRoom) {
        try {
          // Build datesInRange covering all months in the link window
          const datesInRange = [];
          for (const mo of months) {
            const [yMo, mMo] = mo.split('-').map(Number);
            const daysInMo = new Date(yMo, mMo, 0).getDate();
            for (let d = 1; d <= daysInMo; d++) {
              datesInRange.push(`${mo}-${String(d).padStart(2, '0')}`);
            }
          }
          const allEntries = await listStaffSchedules({
            branchId: selectedBranchId,
            staffId: schedSelectedDoctor,
          });
          v56AutoClosed = derivedAutoClosedDates({
            doctorId: schedSelectedDoctor,
            roomId: schedSelectedRoom,
            allEntries,
            datesISO: datesInRange,
          });
        } catch (e) {
          console.warn('[V56/BS-15] auto-closure derivation failed:', e?.message || e);
        }
      }
      const closedDaysUnion = [...new Set([...(schedClosedDays || []), ...v56AutoClosed])].sort();
```

- [ ] **Step 3: Replace `closedDays: [...schedClosedDays]` in the saved-doc object**

Find the existing line in the setDoc payload (around line 1363):

```jsx
        closedDays: [...schedClosedDays],
```

Replace with:

```jsx
        closedDays: closedDaysUnion,
```

- [ ] **Step 4: Mirror in the post-create resync block**

The post-create resync block (around line 1396-1423) updates `bookedSlots` + `doctorBookedSlots`. It does NOT need to recompute `closedDays` (closedDays is set ONCE at create + admin can edit later). Skip — no change needed in resync.

- [ ] **Step 5: Run vitest + build**

Run: `npx vitest run tests/v56-doctor-schedule-room-assignment.test.js`
Run: `npm run build`
Expected: both pass / clean.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/pages/AdminDashboard.jsx src/lib/scopedDataLayer.js
git commit -m "feat(V56/BS-15): handleGenScheduleLink auto-closes non-licensed dates

V55 schedule-link gen now consults the picked doctor's be_staff_schedules
across the months range. For each date where the picked roomId isn't in
the merged effective entry's roomIds (recurring + per-date override
precedence), the date is auto-added to closedDays in the saved doc.

Skip behavior:
  - schedSelectedDoctor null OR schedSelectedRoom null → no closure
    (admin picked 'all doctors' or 'all rooms')
  - Pre-V56 entries (no roomIds field) → no closure (preserves backward
    compat per V56 spec migration policy)

closedDays union: existing schedClosedDays + V56 auto-closures, sorted +
deduped. Customer-facing ClinicSchedule.jsx page renders 'ปิด' for each
closed date — zero changes there.

scopedDataLayer.js exposes listStaffSchedules via _autoInject (BS-1
compliance — no direct backendClient.js import in AdminDashboard).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: BS-15 audit invariant + SKILL.md update

**Files:**
- Modify: `tests/audit-branch-scope.test.js` (append BS-15.1..BS-15.7)
- Modify: `.agents/skills/audit-branch-scope/SKILL.md` (14 → 15 invariants)

- [ ] **Step 1: Append BS-15 block to audit-branch-scope.test.js**

Append after the existing BS-14 block in `tests/audit-branch-scope.test.js`:

```js
// ─── BS-15 — Doctor schedule room assignment (V56, 2026-05-08) ───────────
//
// be_staff_schedules entries gain optional roomIds[] on doctor entries
// (required non-empty); assistant entries forbid the field. Modal gets
// staffKind + branchExamRooms props; TodaysDoctorsPanel renders chips;
// AdminDashboard handleGenScheduleLink auto-closes dates where picked
// (doctor, room) isn't licensed.

describe('BS-15 — doctor schedule room assignment (V56)', () => {
  const validationSrc = readFileSync('src/lib/staffScheduleValidation.js', 'utf8');
  const modalSrc = readFileSync('src/components/backend/scheduling/ScheduleEntryFormModal.jsx', 'utf8');
  const panelSrc = readFileSync('src/components/backend/scheduling/TodaysDoctorsPanel.jsx', 'utf8');
  const adminDashSrc = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

  it('BS-15.1 validateStaffScheduleStrict contains SS-10 + SS-11 markers', () => {
    expect(validationSrc).toMatch(/staffKind\s*===\s*['"]doctor['"]/);
    expect(validationSrc).toMatch(/staffKind\s*===\s*['"]assistant['"]/);
    expect(validationSrc).toMatch(/ต้องเลือกห้องอย่างน้อย\s*1\s*ห้อง/);
    expect(validationSrc).toMatch(/ผู้ช่วยไม่ต้องเลือกห้อง/);
  });

  it('BS-15.2 expandRoomIdsForDisplay + derivedAutoClosedDates exported', () => {
    expect(validationSrc).toMatch(/export\s+function\s+expandRoomIdsForDisplay\s*\(/);
    expect(validationSrc).toMatch(/export\s+function\s+derivedAutoClosedDates\s*\(/);
  });

  it('BS-15.3 ScheduleEntryFormModal accepts staffKind + branchExamRooms props', () => {
    expect(modalSrc).toMatch(/staffKind\s*=\s*['"]doctor['"]/);
    expect(modalSrc).toMatch(/branchExamRooms\s*=\s*\[\]/);
    // Renders the room-checkbox box ONLY for doctor + working type
    expect(modalSrc).toMatch(/staffKind\s*===\s*['"]doctor['"]\s*&&\s*showTime/);
    // Assistant info chip
    expect(modalSrc).toMatch(/staffKind\s*===\s*['"]assistant['"]/);
    expect(modalSrc).toMatch(/ผู้ช่วยทำงานทุกห้องอัตโนมัติ/);
  });

  it('BS-15.4 ScheduleEntryFormModal passes staffKind to validateStaffScheduleStrict', () => {
    expect(modalSrc).toMatch(/validateStaffScheduleStrict\(\s*\{\s*\.\.\.payload\s*,\s*staffKind\s*\}\s*\)/);
  });

  it('BS-15.5 TodaysDoctorsPanel imports + uses expandRoomIdsForDisplay + accepts branchExamRooms', () => {
    expect(panelSrc).toMatch(
      /import\s*\{[^}]*expandRoomIdsForDisplay[^}]*\}\s*from\s*['"][^'"]+staffScheduleValidation\.js['"]/,
    );
    expect(panelSrc).toMatch(/branchExamRooms\s*=\s*\[\]/);
    expect(panelSrc).toMatch(/expandRoomIdsForDisplay\(/);
    // Renders chip(s) per row
    expect(panelSrc).toMatch(/todays-doctor-chips/);
  });

  it('BS-15.6 AdminDashboard handleGenScheduleLink uses derivedAutoClosedDates + unions into closedDays', () => {
    expect(adminDashSrc).toMatch(/derivedAutoClosedDates/);
    // The union pattern must precede the saved-doc setDoc
    expect(adminDashSrc).toMatch(/closedDaysUnion/);
    expect(adminDashSrc).toMatch(/closedDays:\s*closedDaysUnion/);
  });

  it('BS-15.7 V56/BS-15 marker present in all four touched files', () => {
    expect(validationSrc).toMatch(/V56\/BS-15/);
    expect(modalSrc).toMatch(/V56\/BS-15/);
    expect(panelSrc).toMatch(/V56\/BS-15/);
    expect(adminDashSrc).toMatch(/V56\/BS-15/);
  });
});
```

- [ ] **Step 2: Update SKILL.md — bump invariant count + add BS-15 row**

In `.agents/skills/audit-branch-scope/SKILL.md`:

Update the description (frontmatter):

```yaml
description: "Audit Branch-Scope Architecture (BSA) invariants ... BS-13 raw listener safe-by-default ... BS-14 schedule-link modal data sources branch-scoped, BS-15 doctor schedule room assignment integrity. Grep-checks 15 invariants ..."
```

Update the section heading:

```markdown
## Scope — 15 invariants (BS-1..BS-15)
```

Add BS-15 row to the table (after BS-14 row):

```markdown
| **BS-15** | **Doctor schedule room assignment integrity** — `validateStaffScheduleStrict` must contain SS-10 (`staffKind === 'doctor'` + working type → roomIds required non-empty) and SS-11 (`staffKind === 'assistant'` → roomIds forbidden) checks. `expandRoomIdsForDisplay` + `derivedAutoClosedDates` exported from `staffScheduleValidation.js`. `ScheduleEntryFormModal` accepts `staffKind` + `branchExamRooms` props; renders room-checkbox box for doctor + working type only; renders assistant info chip otherwise. `TodaysDoctorsPanel` imports + calls `expandRoomIdsForDisplay`; renders inline chips per doctor row. `AdminDashboard.handleGenScheduleLink` calls `derivedAutoClosedDates` + unions into saved doc's `closedDays`. Sanctioned exceptions: NONE — every touched site follows the rule. V56 / 2026-05-08 | grep `validateStaffScheduleStrict` body for staffKind branches; grep modal/panel/AdminDashboard for V56/BS-15 markers + helper calls |
```

Update the run instructions + arguments + output template:

```markdown
1. `npm test -- --run tests/audit-branch-scope.test.js` — automated regression bank for all 15 invariants
```

```markdown
- `--quick` — BS-1, BS-3, BS-4, BS-8, BS-14, BS-15 (6 highest-risk, most-likely-to-regress)
- `--full` — all 15 (default; takes < 2s)
```

```markdown
- Total invariants: 15
```

- [ ] **Step 3: Run audit + targeted vitest + build**

Run: `npx vitest run tests/audit-branch-scope.test.js tests/v56-doctor-schedule-room-assignment.test.js`
Expected: all PASS (BS-1..BS-15 + V56.L1-L6).

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit Task 6**

```bash
git add tests/audit-branch-scope.test.js .agents/skills/audit-branch-scope/SKILL.md
git commit -m "audit(V56/BS-15): doctor schedule room assignment integrity invariant

NEW BS-15 — 7 sub-tests in audit-branch-scope.test.js:
  1. validateStaffScheduleStrict contains SS-10 + SS-11 (Thai error
     messages anchored)
  2. expandRoomIdsForDisplay + derivedAutoClosedDates exported
  3. ScheduleEntryFormModal accepts staffKind + branchExamRooms props +
     conditionally renders room-checkbox box / assistant info chip
  4. Modal passes staffKind to validateStaffScheduleStrict
  5. TodaysDoctorsPanel imports + calls expandRoomIdsForDisplay +
     renders chips
  6. AdminDashboard handleGenScheduleLink calls derivedAutoClosedDates
     + unions into closedDays
  7. V56/BS-15 marker present in all four touched files

SKILL.md: 14 → 15 invariants. Sanctioned exceptions: NONE.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Rule I full-flow simulate (F1-F7)

**Files:**
- Create: `tests/v56-doctor-schedule-room-assignment-flow-simulate.test.js`

- [ ] **Step 1: Write the flow-simulate test file (F1-F7)**

Create `tests/v56-doctor-schedule-room-assignment-flow-simulate.test.js`:

```js
// V56 / BS-15 — Rule I full-flow simulate.
//
// Mirrors V55's flow-simulate pattern: BranchProvider + canonical UI
// component harness. Tests the actual modal + panel + auto-closure
// chain through realistic state mutations.
//
// Spec: docs/superpowers/specs/2026-05-08-doctor-schedule-room-assignment-design.md

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('../src/firebase.js', () => ({
  db: {},
  appId: 'test-app-v56',
}));

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: async () => ({ docs: [] }),
  onSnapshot: () => () => {},
}));

const BRANCH_A_ROOMS = [
  { id: 'room-A1', name: 'ห้องตรวจ A1', kind: 'doctor', branchId: 'BR-A' },
  { id: 'room-A2', name: 'ห้องตรวจ A2', kind: 'doctor', branchId: 'BR-A' },
  { id: 'room-A-staff', name: 'ห้องหัตถการ', kind: 'staff', branchId: 'BR-A' },
];
const BRANCH_B_ROOMS = [
  { id: 'room-B1', name: 'ห้องตรวจ B1', kind: 'doctor', branchId: 'BR-B' },
];

async function importModal() {
  return await import('../src/components/backend/scheduling/ScheduleEntryFormModal.jsx');
}
async function importHelpers() {
  return await import('../src/lib/staffScheduleValidation.js');
}

describe('V56.F1 — modal renders room-checkbox box for doctor + working type', () => {
  it('F1.1 doctor recurring → box visible with branch doctor-rooms', async () => {
    const { default: Modal } = await importModal();
    const onSave = vi.fn();
    render(React.createElement(Modal, {
      open: true,
      kind: 'recurring',
      staffId: 'd-1',
      staffName: 'Dr.A',
      onClose: () => {},
      onSave,
      branchId: 'BR-A',
      staffKind: 'doctor',
      branchExamRooms: BRANCH_A_ROOMS,
    }));
    // Box rendered
    expect(screen.getByTestId('schedule-form-rooms-box')).toBeTruthy();
    // Doctor-kind rooms only — A1 + A2 (NOT staff room)
    expect(screen.getByTestId('schedule-form-room-row-room-A1')).toBeTruthy();
    expect(screen.getByTestId('schedule-form-room-row-room-A2')).toBeTruthy();
    expect(() => screen.getByTestId('schedule-form-room-row-room-A-staff')).toThrow();
    // 'เลือกทั้งหมด' / 'ยกเลิกทั้งหมด' toggles present
    expect(screen.getByTestId('schedule-form-rooms-select-all')).toBeTruthy();
    expect(screen.getByTestId('schedule-form-rooms-clear-all')).toBeTruthy();
  });

  it('F1.2 select-all toggle ticks all doctor-rooms', async () => {
    const { default: Modal } = await importModal();
    render(React.createElement(Modal, {
      open: true,
      kind: 'recurring',
      staffId: 'd-1',
      staffName: 'Dr.A',
      onClose: () => {},
      onSave: vi.fn(),
      branchId: 'BR-A',
      staffKind: 'doctor',
      branchExamRooms: BRANCH_A_ROOMS,
    }));
    fireEvent.click(screen.getByTestId('schedule-form-rooms-select-all'));
    const cb1 = screen.getByTestId('schedule-form-room-row-room-A1').querySelector('input[type=checkbox]');
    const cb2 = screen.getByTestId('schedule-form-room-row-room-A2').querySelector('input[type=checkbox]');
    expect(cb1.checked).toBe(true);
    expect(cb2.checked).toBe(true);
  });

  it('F1.3 clear-all toggle un-ticks all → submit disabled', async () => {
    const { default: Modal } = await importModal();
    render(React.createElement(Modal, {
      open: true,
      kind: 'recurring',
      staffId: 'd-1',
      staffName: 'Dr.A',
      onClose: () => {},
      onSave: vi.fn(),
      branchId: 'BR-A',
      staffKind: 'doctor',
      branchExamRooms: BRANCH_A_ROOMS,
    }));
    fireEvent.click(screen.getByTestId('schedule-form-rooms-clear-all'));
    const submit = screen.getByTestId('schedule-form-submit');
    expect(submit.disabled).toBe(true);
  });
});

describe('V56.F2 — modal hides room box for assistant', () => {
  it('F2.1 assistant kind → no room box; info chip shown', async () => {
    const { default: Modal } = await importModal();
    render(React.createElement(Modal, {
      open: true,
      kind: 'recurring',
      staffId: 's-1',
      staffName: 'Asst.A',
      onClose: () => {},
      onSave: vi.fn(),
      branchId: 'BR-A',
      staffKind: 'assistant',
      branchExamRooms: BRANCH_A_ROOMS,
    }));
    expect(() => screen.getByTestId('schedule-form-rooms-box')).toThrow();
    expect(screen.getByTestId('schedule-form-assistant-info')).toBeTruthy();
  });
});

describe('V56.F3 — modal empty-state for branch with no doctor-rooms', () => {
  it('F3.1 doctor + zero doctor-kind rooms → placeholder + tab=exam-rooms link', async () => {
    const { default: Modal } = await importModal();
    render(React.createElement(Modal, {
      open: true,
      kind: 'recurring',
      staffId: 'd-1',
      staffName: 'Dr.A',
      onClose: () => {},
      onSave: vi.fn(),
      branchId: 'BR-EMPTY',
      staffKind: 'doctor',
      branchExamRooms: [{ id: 'r-staff', name: 'staff only', kind: 'staff' }],
    }));
    const box = screen.getByTestId('schedule-form-rooms-box');
    expect(box.textContent).toContain('ไม่มีห้องตรวจในสาขานี้');
    const link = box.querySelector('a[href="?tab=exam-rooms"]');
    expect(link).toBeTruthy();
  });
});

describe('V56.F4 — saving a doctor entry with valid roomIds', () => {
  it('F4.1 onSave receives roomIds matching ticked checkboxes', async () => {
    const { default: Modal } = await importModal();
    const onSave = vi.fn(() => Promise.resolve());
    render(React.createElement(Modal, {
      open: true,
      kind: 'recurring',
      staffId: 'd-1',
      staffName: 'Dr.A',
      onClose: () => {},
      onSave,
      branchId: 'BR-A',
      staffKind: 'doctor',
      branchExamRooms: BRANCH_A_ROOMS,
    }));
    // Default seed = all doctor-rooms ticked. Untick A2.
    const cb2 = screen.getByTestId('schedule-form-room-row-room-A2').querySelector('input[type=checkbox]');
    fireEvent.click(cb2);
    // Submit
    fireEvent.click(screen.getByTestId('schedule-form-submit'));
    // Wait for async submit
    await new Promise((r) => setTimeout(r, 50));
    expect(onSave).toHaveBeenCalled();
    const payload = onSave.mock.calls[0][0];
    expect(payload.roomIds).toEqual(['room-A1']);
    expect(payload.staffId).toBe('d-1');
    expect(payload.branchId).toBe('BR-A');
  });
});

describe('V56.F5 — assistant entries strip roomIds at submit', () => {
  it('F5.1 onSave payload has NO roomIds for assistant', async () => {
    const { default: Modal } = await importModal();
    const onSave = vi.fn(() => Promise.resolve());
    render(React.createElement(Modal, {
      open: true,
      kind: 'recurring',
      staffId: 's-1',
      staffName: 'Asst.A',
      onClose: () => {},
      onSave,
      branchId: 'BR-A',
      staffKind: 'assistant',
      branchExamRooms: BRANCH_A_ROOMS,
    }));
    fireEvent.click(screen.getByTestId('schedule-form-submit'));
    await new Promise((r) => setTimeout(r, 50));
    expect(onSave).toHaveBeenCalled();
    const payload = onSave.mock.calls[0][0];
    expect('roomIds' in payload).toBe(false);
  });
});

describe('V56.F6 — derivedAutoClosedDates licensure check (Rule I)', () => {
  it('F6.1 picked room not in any matching schedule entry → date auto-closed', async () => {
    const { derivedAutoClosedDates } = await importHelpers();
    const allEntries = [
      {
        staffId: 'd-A',
        type: 'recurring',
        dayOfWeek: 1, // Monday
        startTime: '09:00',
        endTime: '17:00',
        roomIds: ['room-A1'],
      },
    ];
    const out = derivedAutoClosedDates({
      doctorId: 'd-A',
      roomId: 'room-A2',
      allEntries,
      datesISO: ['2026-05-04', '2026-05-11'], // Mondays
    });
    expect(out).toEqual(['2026-05-04', '2026-05-11']);
  });

  it('F6.2 admin picked all-rooms (roomId null) → no closures', async () => {
    const { derivedAutoClosedDates } = await importHelpers();
    const out = derivedAutoClosedDates({
      doctorId: 'd-A',
      roomId: null,
      allEntries: [
        {
          staffId: 'd-A',
          type: 'recurring',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          roomIds: ['room-A1'],
        },
      ],
      datesISO: ['2026-05-04'],
    });
    expect(out).toEqual([]);
  });
});

describe('V56.F7 — branch-switch defensive reset (modal stays open)', () => {
  it('F7.1 branchExamRooms changes mid-modal-open → form.roomIds filtered to new branch', async () => {
    const { default: Modal } = await importModal();
    const { rerender } = render(React.createElement(Modal, {
      open: true,
      kind: 'recurring',
      staffId: 'd-1',
      staffName: 'Dr.A',
      onClose: () => {},
      onSave: vi.fn(),
      branchId: 'BR-A',
      staffKind: 'doctor',
      branchExamRooms: BRANCH_A_ROOMS,
    }));
    // Verify branch-A rooms ticked initially
    const cb1 = screen.getByTestId('schedule-form-room-row-room-A1').querySelector('input[type=checkbox]');
    expect(cb1.checked).toBe(true);
    // Switch branch — re-render with branch-B rooms
    rerender(React.createElement(Modal, {
      open: true,
      kind: 'recurring',
      staffId: 'd-1',
      staffName: 'Dr.A',
      onClose: () => {},
      onSave: vi.fn(),
      branchId: 'BR-B',
      staffKind: 'doctor',
      branchExamRooms: BRANCH_B_ROOMS,
    }));
    // Branch-A rooms gone; branch-B rooms shown; previous ticks dropped
    expect(() => screen.getByTestId('schedule-form-room-row-room-A1')).toThrow();
    expect(screen.getByTestId('schedule-form-room-row-room-B1')).toBeTruthy();
    const cbB1 = screen.getByTestId('schedule-form-room-row-room-B1').querySelector('input[type=checkbox]');
    expect(cbB1.checked).toBe(false); // not ticked — admin must re-pick
  });
});
```

- [ ] **Step 2: Run F1-F7 + verify all green**

Run: `npx vitest run tests/v56-doctor-schedule-room-assignment-flow-simulate.test.js`
Expected: PASS — all F1-F7 (10+ assertions).

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit Task 7**

```bash
git add tests/v56-doctor-schedule-room-assignment-flow-simulate.test.js
git commit -m "test(V56/BS-15): Rule I full-flow simulate F1-F7

10+ assertions across 7 flow groups via React Testing Library:

F1 — Modal renders box for doctor + working type:
  F1.1 doctor-kind rooms only (staff-room excluded);
       เลือกทั้งหมด/ยกเลิกทั้งหมด toggles present
  F1.2 select-all toggle ticks all
  F1.3 clear-all toggle disables submit (Q3 lock)

F2 — Modal hides box for assistant (info chip shown).
F3 — Empty-state placeholder + ?tab=exam-rooms link.
F4 — onSave payload has roomIds matching ticks.
F5 — Assistant payload strips roomIds (SS-11 lock).

F6 — derivedAutoClosedDates licensure check:
  F6.1 picked room not in entry roomIds → date closed
  F6.2 admin picked all-rooms (null) → no closures

F7 — Branch-switch defensive reset:
  F7.1 branchExamRooms changes → previous-branch tick dropped;
       new-branch room available un-ticked (admin re-pick)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Final verification + state files + V-entry + commit

**Files:**
- Modify: `.agents/active.md`
- Modify: `SESSION_HANDOFF.md`
- Modify: `.claude/rules/00-session-start.md` (V56 V-entry row)

- [ ] **Step 1: Run full vitest suite (Rule N batch-end)**

Run: `npx vitest run`
Expected: PASS — full suite (~7800 GREEN, +V56 helper + flow-simulate + BS-15 audit).

If any pre-existing tests break unrelated to V56, that's a regression — investigate and fix before continuing.

- [ ] **Step 2: Run final build + audit-branch-scope**

Run: `npm run build`
Expected: clean (AdminDashboard chunk size delta ≤ +5KB).

- [ ] **Step 3: Update .agents/active.md**

Edit `.agents/active.md` — bump `updated_at`, `status`, `last_commit`, `tests`. Add V56 to the "What this session shipped" list:

```yaml
---
updated_at: "2026-05-08 EOD #10 — V56 Doctor Schedule Room Assignment (BS-15) shipped"
status: "master=<v56-final-sha> (+5 ahead of prod) · 7800+ GREEN · build clean · NOT yet deployed"
branch: "master"
last_commit: "test(V56/BS-15): Rule I full-flow simulate F1-F7"
tests: 7800 # actual count from full suite
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef580a6"
firestore_rules_version: 29
storage_rules_version: 2
---
```

In the body, add a V56 bullet to the "What this session shipped" list:

```markdown
- **V56 / BS-15** (`<v56-final-sha>`) — Doctor schedule room assignment: per-shift roomIds[] on be_staff_schedules; SS-10 + SS-11 validation; modal renders room-checkbox box for doctor+working type (assistants get info chip); TodaysDoctorsPanel inline chips; V55 schedule-link auto-closes non-licensed dates via derivedAutoClosedDates. +60 tests (40 helper + 10 flow-simulate + 7 BS-15 audit + 3 misc). 14 → 15 BS invariants.
```

- [ ] **Step 4: Update SESSION_HANDOFF.md**

Add a new V56 section header at the top of the chronological session list, mirroring V55's structure. Use the V55 section as a template (paths in spec).

- [ ] **Step 5: Add V56 row to .claude/rules/00-session-start.md compact V-table**

Edit `.claude/rules/00-session-start.md`. Find the V55 row (recently added) and insert V56 immediately ABOVE it. Compact one-line summary covering: user directive verbatim, class-of-bug, fix surfaces, test counts, lessons.

- [ ] **Step 6: Final commit (state files + V-entry)**

```bash
git add .agents/active.md SESSION_HANDOFF.md .claude/rules/00-session-start.md
git commit -m "docs(V56/BS-15): state files + V56 V-entry compact row

Master = <v56-final-sha> (+5 commits ahead of prod ef580a6 — V52 + V53
+ V54 + V55 + V56). 7800+ vitest GREEN. Build clean.

Outstanding (user-triggered):
- vercel --prod for combined V52+V53+V54+V55+V56 (V18 — must say
  'deploy' THIS turn). 5 commits ahead.
- Optional manual visual verify: tab=doctor-schedules modal renders
  room-checkbox box; tab=appointment 'แพทย์เข้าตรวจ' panel renders
  chips; schedule-link gen with non-licensed (doctor, room) shows
  auto-closure on customer link page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Optional — preview verify in dev server**

Use the running Vite dev server (preview MCP) to confirm:
1. HMR landed cleanly (no Pre-transform errors after V56 edits)
2. `expandRoomIdsForDisplay` + `derivedAutoClosedDates` reachable via dynamic import in browser runtime

Use the V55 verification pattern (preview_eval) to import the helpers and run a smoke test.

---

## Self-Review

Spec coverage:
- ✅ SS-10 + SS-11 (Task 1)
- ✅ expandRoomIdsForDisplay (Task 1)
- ✅ derivedAutoClosedDates (Task 1)
- ✅ Modal rendering doctor + working type (Task 2)
- ✅ Modal assistant info chip (Task 2)
- ✅ Modal empty-state placeholder + ?tab=exam-rooms link (Task 2)
- ✅ Modal "เลือกทั้งหมด" / "ยกเลิกทั้งหมด" toggles (Task 2)
- ✅ Modal save-disable when 0 rooms picked (Task 2)
- ✅ Modal branch-switch defensive reset (Task 2)
- ✅ Modal staffKind passed to validator (Task 2)
- ✅ DoctorSchedulesTab + EmployeeSchedulesTab pass props (Task 3)
- ✅ TodaysDoctorsPanel renders chips + ทุกห้อง for legacy (Task 4)
- ✅ AppointmentCalendarView passes branchExamRooms (Task 4)
- ✅ AdminDashboard handleGenScheduleLink auto-closure (Task 5)
- ✅ scopedDataLayer listStaffSchedules export (Task 5)
- ✅ BS-15 audit invariant 7 sub-tests (Task 6)
- ✅ SKILL.md 14 → 15 invariants (Task 6)
- ✅ Rule I full-flow simulate F1-F7 (Task 7)
- ✅ Full vitest + build verification (Task 8)
- ✅ State files + V56 compact V-entry (Task 8)

Placeholder scan: no TBD/TODO/incomplete. All code shown verbatim. All commit messages drafted.

Type consistency:
- `staffKind: 'doctor' | 'assistant'` used consistently across modal, validator, tabs.
- `branchExamRooms: Array<{id, name, kind}>` shape used consistently across modal + panel + parent fetch.
- `expandRoomIdsForDisplay(entry, branchExamRooms)` signature consistent.
- `derivedAutoClosedDates({doctorId, roomId, allEntries, datesISO})` signature consistent.
- `roomIds: string[]` field name consistent across schema, validation, UI, V55 integration.
- "Doctor-kind rooms only" filter (`r.kind === 'doctor'`) used consistently in modal + panel + chip-rendering.

