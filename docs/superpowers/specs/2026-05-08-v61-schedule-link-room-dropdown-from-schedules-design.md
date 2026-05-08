# V61 — Schedule-link room dropdown driven by `be_staff_schedules` (not `kind`)

> **Date**: 2026-05-08 EOD #14
> **Class-of-bug family**: V12 multi-reader-sweep at the schedule-link MODAL UI boundary (V52-V55 series; V60 closed the SAVE boundary, V61 closes the MODAL UI boundary).
> **Author**: Claude (brainstormed Q1–Q4 with user)
> **Status**: design approved (user "ok ทุก Section ลุยทำเลย")

---

## 1. Problem

The schedule-link modal at `AdminDashboard.jsx:4338+` populates its room dropdown via:

```js
const shownRooms = branchExamRooms.filter(r =>
  r.role === (schedNoDoctorRequired ? 'staff' : 'doctor')
);
```

This filters by `be_exam_rooms.kind` (V57 schema). **It does NOT use the actual schedule data** in `be_staff_schedules`. Consequences:

1. **พบแพทย์ mode**: every kind=doctor room shows in the dropdown — even rooms the selected doctor doesn't actually enter. Admin can pick a room the doctor never works in → customer link gates availability against an empty intersection → silent dead calendar.
2. **ไม่พบแพทย์ mode**: every kind=staff room shows — but a "kind=doctor" room that happens to have NO doctor entries in the window (e.g. an unused doctor room) is invisible. AND a "kind=staff" room that some doctor uses for procedures (Shockwave-as-doctor-room) appears as a "non-doctor" room when it shouldn't.

The **canonical source of truth** for "which rooms does each doctor work in" is `be_staff_schedules.roomIds[]` (V56 / BS-15). V61 makes the modal dropdown read from that canonical source, mirroring V56's auto-closure pattern + V60's save-time derivation.

User report (verbatim, 2026-05-08):
> เพิ่มเงื่อนไขใน Modal สร้างลิงก์ตาราง คือ หากไม่ได้ติ๊กไม่พบแพทย์ แปลว่าเป็นการสร้างลิ้งค์พบแพทย์ ลิ้งค์พบแพทย์จะแสดงแต่ห้องที่แพทย์คนนั้นๆที่เลือกใน dropdown เข้าตรวจ ตามในระยะเวลาในช่อง "แสดงทั้งหมด" … หากเลือกสร้างลิ้งแบบไม่พบแพทย์ modal จะโผล่ dropdown ให้เลือกห้องที่ไม่ได้มีแพทย์เข้าตรวจในสาขานั้นๆ ในช่วง range "แสดงทั้งหมด" ที่เลือกไว้

---

## 2. Design Qs (locked)

| # | Question | Decision |
|---|----------|----------|
| Q1 | "แพทย์ทุกคน" semantics | **B refined** — keep option; room dropdown = UNION of ALL doctors' rooms in window. Customer doesn't care which doctor, just that some doctor + room is available |
| Q2 | Pre-flight gate when room dropdown is empty | **A** — block save with inline Thai error (mirrors V60 pre-flight pattern) |
| Q3 | Keep "ทุกห้อง" placeholder option | **B** — keep, semantics = "ทุกห้องที่แพทย์เข้า" (saves union snapshot) |
| Q4 | Saved-doc shape for "ทุกห้อง" | **A** — snapshot at gen+resync time. Customer link only updates on admin Sync. Mirrors V60 |

---

## 3. Architecture (Approach A)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ src/lib/staffScheduleValidation.js  (PURE HELPERS, no Firestore reads)  │
│  · deriveDoctorRoomIdsForWindow({ doctorIds, allEntries, datesISO })    │
│  · deriveNonDoctorRoomIdsForWindow({ branchExamRooms, allEntries, ...}) │
└─────────────────────────────────────────────────────────────────────────┘
                                ▲
                                │ used by
                                │
┌─────────────────────────────────────────────────────────────────────────┐
│ src/pages/AdminDashboard.jsx — schedule-link modal                       │
│                                                                          │
│   useEffect: scheduleEntries (already loaded for V56 + V60)              │
│      └─ for selected doctor only (single-doc fetch)                      │
│      └─ for ALL doctors when "แพทย์ทุกคน" mode (multi-doc fetch)        │
│                                                                          │
│   useMemo: eligibleRooms                                                 │
│      └─ พบแพทย์ + specific doctor → deriveDoctorRoomIdsForWindow         │
│      └─ พบแพทย์ + แพทย์ทุกคน      → deriveDoctorRoomIdsForWindow(null)   │
│      └─ ไม่พบแพทย์                  → deriveNonDoctorRoomIdsForWindow    │
│                                                                          │
│   Dropdown: <option value="">ทุกห้อง...</option> + eligibleRooms.map()  │
│                                                                          │
│   Defensive reset (V55 pattern):                                         │
│      └─ if schedSelectedRoom not in eligibleRooms → setSchedSelectedRoom(null)
│                                                                          │
│   handleGenScheduleLink:                                                 │
│      └─ Pre-flight: if eligibleRooms.length === 0 → block + Thai toast  │
│      └─ Compute selectedRoomIds snapshot:                                │
│          if specific room → [room]                                       │
│          if ทุกห้อง       → eligibleRooms (entire union)                │
│      └─ Save: selectedRoomIds (V61 array) + selectedRoomId (legacy)     │
│                                                                          │
│   Resync paths (updateActiveSchedules + post-create + auto-sync):        │
│      └─ Recompute selectedRoomIds + bookedSlots using LIVE schedule     │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ writes to
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Firestore: artifacts/.../clinic_schedules/{token}                        │
│   selectedRoomId: string | null  (legacy, kept for backward compat)     │
│   selectedRoomIds: string[]       (V61 NEW — canonical when present)    │
│   bookedSlots: [...]   (filtered using selectedRoomIds union)           │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ read by
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ src/pages/ClinicSchedule.jsx — customer-facing public link              │
│   ──────────────────────────────────────────────────────────────────    │
│   bookedSlots[] already filtered at admin save time → no UI change      │
│   showDoctorStatus + doctorBookedSlots — V55 logic preserved             │
│                                                                          │
│ src/lib/scheduleFilterUtils.js — shouldBlockScheduleSlot                │
│   Extends signature to accept selectedRoomIds: string[]                  │
│   Backward-compat: falls back to selectedRoomId when array missing/empty │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Helper signatures (Section 1)

### `deriveDoctorRoomIdsForWindow`

```js
/**
 * V61 — derive the union of room IDs touched by working entries across a
 * date window. Used by the schedule-link modal to populate the room
 * dropdown based on REAL schedule data (not be_exam_rooms.kind).
 *
 * - `doctorIds = ['DOC-X']`      → only that doctor's rooms (specific-doctor mode)
 * - `doctorIds = null/undefined` → all doctors' rooms (แพทย์ทุกคน mode; aggregates all be_staff_schedules entries)
 * - `allEntries` should already be branch-scoped (caller's responsibility)
 *
 * Excludes leave/holiday/sick (off-shift; no roomIds). Per-date override
 * semantics via mergeSchedulesForDate (recurring weekday canceled by
 * per-date leave). Pure JS — testable without Firestore mocks.
 *
 * Class-of-bug closed: V12 multi-reader-sweep at the schedule-link modal
 * boundary. Sister to derivedDoctorDaysFromSchedules (V60), derivedAutoClosedDates (V56).
 *
 * @param {object} opts
 * @param {string[]|null|undefined} opts.doctorIds — null = ALL doctors
 * @param {Array<entry>} opts.allEntries — be_staff_schedules entries (recurring + per-date)
 * @param {string[]} opts.datesISO — array of YYYY-MM-DD strings (months window)
 * @returns {string[]} sorted, deduped room IDs
 */
```

### `deriveNonDoctorRoomIdsForWindow`

```js
/**
 * V61 — derive room IDs in branchExamRooms that are NOT touched by any
 * working entry across the date window. Used by the ไม่พบแพทย์ mode
 * dropdown.
 *
 * Logic:
 *   1. Aggregate union of all roomIds across all working entries in window
 *      (using deriveDoctorRoomIdsForWindow with doctorIds=null)
 *   2. Filter branchExamRooms (status='ใช้งาน') to those NOT in the union
 *   3. Return sorted ID array
 *
 * V57 `kind` field is IGNORED — filter is schedule-driven, not kind-driven.
 * A "kind=doctor" room that no doctor enters in the window will appear here
 * (correct: it IS a non-doctor room for THIS window). A "kind=staff" room
 * that some doctor uses for procedures will NOT appear (correct: it IS
 * touched by a doctor schedule).
 *
 * @param {object} opts
 * @param {Array<{id, name, status}>} opts.branchExamRooms
 * @param {Array<entry>} opts.allEntries — branch-scoped be_staff_schedules entries
 * @param {string[]} opts.datesISO
 * @returns {string[]} sorted, deduped room IDs
 */
```

### Edge cases (both helpers)

| Input | Behavior |
|-------|----------|
| `allEntries === []` | DoctorRooms → `[]`; NonDoctorRooms → all active branch rooms |
| `doctorIds === null` (DoctorRooms) | aggregate ALL staff in entries |
| `doctorIds = ['DOC-X']` where X has no entries | `[]` |
| Entry with missing/empty `roomIds` | Skipped — no contribution |
| Entry with `type='leave'/'holiday'/'sick'` | Skipped (off-shift) |
| Entry with per-date override CANCELING recurring | mergeSchedulesForDate semantics — override wins, recurring NOT counted that date |
| Invalid date string in `datesISO` | Skipped (defensive) |
| `branchExamRooms` empty (NonDoctorRooms) | `[]` |
| `branchExamRooms` with `status !== 'ใช้งาน'` | Excluded from candidate set |

---

## 5. Modal UI changes (Section 2)

### State

No new React state — V61 reuses existing `schedSelectedDoctor`, `schedSelectedRoom`, `schedNoDoctorRequired`, `schedDoctorSchedules` (V59-bis), `schedStartMonth`, `schedAdvanceMonths`, `branchExamRooms` (V55).

### NEW — fetch ALL doctors' schedules for the "แพทย์ทุกคน" + ไม่พบแพทย์ cases

The existing V59-bis `useEffect` only fetches `schedDoctorSchedules` for the SELECTED doctor (line 645-652). For the union-across-all-doctors case (Q1=B refined) AND ไม่พบแพทย์ mode (need full branch schedules to know which rooms are touched), we need ALL branch schedules.

**Solution**: extend the V59-bis useEffect to fetch ALL branch entries when `schedSelectedDoctor === null` OR `schedNoDoctorRequired === true`:

```js
useEffect(() => {
  let cancelled = false;
  if (schedSelectedDoctor) {
    // Specific doctor — V59-bis original path
    listStaffSchedules({ branchId: selectedBranchId, staffId: schedSelectedDoctor })
      .then(list => { if (!cancelled) setSchedDoctorSchedules(list || []); })
      .catch(() => { if (!cancelled) setSchedDoctorSchedules([]); });
  } else {
    // V61 — แพทย์ทุกคน OR ไม่พบแพทย์ mode → fetch ALL branch schedules
    listStaffSchedules({ branchId: selectedBranchId })
      .then(list => { if (!cancelled) setSchedDoctorSchedules(list || []); })
      .catch(() => { if (!cancelled) setSchedDoctorSchedules([]); });
  }
  return () => { cancelled = true; };
}, [schedSelectedDoctor, selectedBranchId]);
```

### NEW — `eligibleRooms` derivation

Replace the V57 kind-based filter at line 4333:

```js
const datesInRange = useMemo(() => {
  // Same shape as v59Preview's datesInRange — same months window
  const out = [];
  const [sy, sm] = schedStartMonth.split('-').map(Number);
  for (let i = 0; i < schedAdvanceMonths; i++) {
    const d = new Date(sy, sm - 1 + i, 1);
    const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const [yMo, mMo] = mo.split('-').map(Number);
    const daysInMo = new Date(yMo, mMo, 0).getDate();
    for (let dd = 1; dd <= daysInMo; dd++) {
      out.push(`${mo}-${String(dd).padStart(2, '0')}`);
    }
  }
  return out;
}, [schedStartMonth, schedAdvanceMonths]);

const eligibleRoomIds = useMemo(() => {
  if (schedNoDoctorRequired) {
    return deriveNonDoctorRoomIdsForWindow({
      branchExamRooms,
      allEntries: schedDoctorSchedules,
      datesISO: datesInRange,
    });
  }
  // พบแพทย์ mode
  return deriveDoctorRoomIdsForWindow({
    doctorIds: schedSelectedDoctor ? [schedSelectedDoctor] : null,
    allEntries: schedDoctorSchedules,
    datesISO: datesInRange,
  });
}, [schedNoDoctorRequired, schedSelectedDoctor, schedDoctorSchedules, branchExamRooms, datesInRange]);

const eligibleRooms = useMemo(() =>
  branchExamRooms.filter(r => eligibleRoomIds.includes(String(r.id))),
  [branchExamRooms, eligibleRoomIds],
);
```

### Dropdown JSX

Replace `shownRooms` (line 4333) usage with `eligibleRooms`:

```jsx
{eligibleRooms.length > 0 && (
  <div>
    <label className="...">เลือกห้อง</label>
    <select value={schedSelectedRoom || ''} onChange={e => setSchedSelectedRoom(e.target.value || null)} ...>
      <option value="">-- ทุกห้อง (ทุกห้องที่แพทย์เข้า) --</option>
      {eligibleRooms.map(r => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  </div>
)}
{eligibleRooms.length === 0 && (
  <div data-testid="v61-room-empty-state" className="rounded-lg border border-amber-700/40 bg-amber-900/15 px-3 py-2">
    <p className="text-[11px] text-amber-300 leading-relaxed">
      {schedNoDoctorRequired
        ? 'ไม่พบห้องที่ไม่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก — กรุณาปรับช่วงเวลาหรือตารางหมอ'
        : (schedSelectedDoctor
            ? 'แพทย์ที่เลือกไม่มีตารางเข้าห้องในระยะเวลาที่เลือก — กรุณาแก้ไขตารางหมอ'
            : 'ไม่พบห้องที่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก')}
    </p>
  </div>
)}
```

### Defensive resets (V55 pattern)

Add a useEffect that resets `schedSelectedRoom` when no longer in `eligibleRoomIds`:

```js
useEffect(() => {
  if (schedSelectedRoom == null) return;
  if (!eligibleRoomIds.includes(String(schedSelectedRoom))) {
    setSchedSelectedRoom(null);
  }
}, [eligibleRoomIds, schedSelectedRoom]);
```

The existing toggle-handler at line 4389 already clears `schedSelectedRoom` on `noDoctorRequired` toggle — that stays.

---

## 6. Save + resync paths (Section 3)

### `handleGenScheduleLink` — pre-flight gate (parallel to V60 doctorDays gate)

Before `await setDoc(doc(db, ..., 'clinic_schedules', token), {...})`:

```js
// V61 / AV33 — pre-flight gate: if eligibleRoomIds is empty, refuse to
// save. Customer-facing link with no valid rooms = dead calendar.
if (eligibleRoomIds.length === 0) {
  showToast(
    schedNoDoctorRequired
      ? 'ไม่พบห้องที่ไม่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก — แก้ไขตารางหมอก่อน'
      : (schedSelectedDoctor
          ? 'แพทย์ที่เลือกไม่มีตารางเข้าห้องในระยะเวลาที่เลือก — แก้ไขตารางหมอก่อน'
          : 'ไม่พบห้องที่มีแพทย์เข้าตรวจในระยะเวลาที่เลือก'),
    7000,
  );
  setSchedGenLoading(false);
  return;
}
```

### Compute `selectedRoomIds` snapshot

```js
// V61 — snapshot the resolved room set at save time. Customer link
// reflects WHAT WAS COMPUTED AT GEN TIME, not live schedule data.
// Per Q4=A: customer link only updates on admin Sync (existing resync
// paths recompute this snapshot).
const v61SelectedRoomIds = schedSelectedRoom
  ? [String(schedSelectedRoom)]   // specific room pick
  : [...eligibleRoomIds];          // ทุกห้อง = full union snapshot
```

### Saved doc shape

Extend the `setDoc` payload at line 1628:

```js
await setDoc(doc(db, ..., 'clinic_schedules', token), {
  // ... existing fields ...
  selectedRoomId: selectedRoomStr || null,                     // legacy single
  selectedRoomIds: v61SelectedRoomIds,                         // V61 NEW snapshot array
  selectedRoomName: schedSelectedRoom ? (lookup.name) : null,  // legacy display
  // bookedSlots filtered using v61SelectedRoomIds (see filter changes §7)
});
```

### `bookedSlots` filtering

In `handleGenScheduleLink` (lines 1474+) the `filterCfg` passed to `shouldBlockScheduleSlot`:

```js
const filterCfg = {
  noDoctorRequired: schedNoDoctorRequired,
  selectedDoctorId: schedSelectedDoctor,
  selectedRoomId: schedSelectedRoom,           // legacy — single room
  selectedRoomIds: v61SelectedRoomIds,         // V61 — array (preferred)
  assistantIds,
};
```

`shouldBlockScheduleSlot` extends to prefer `selectedRoomIds` array when present — see §8.

### Resync paths

The existing resync paths (must be extended to recompute `v61SelectedRoomIds` snapshot):
1. **Post-create resync** (line 1647 IIFE) — fetch fresh appts + recompute roomIds union from current schedule entries
2. **`updateActiveSchedules`** (line 1076) — after appt sync, refresh each schedule's bookedSlots
3. **Manual sync paths** (line 1149, 1197) — if admin clicks Sync on existing schedule, recompute snapshot

For all three, the pattern is:
```js
// Read current be_staff_schedules for the saved schedule's branchId + selectedDoctorId
// Recompute datesInRange from saved months
// Recompute v61SelectedRoomIds via the same helpers
// Update doc with fresh selectedRoomIds + bookedSlots
```

---

## 7. Customer-side rendering (Section 4)

### `ClinicSchedule.jsx`

`bookedSlots` arrives pre-filtered from admin save (using `v61SelectedRoomIds` union). Customer-side rendering needs **no logic change** for the room filter — it just iterates `data.bookedSlots`.

The empty-doctor-month banner (V60) already handles the "zero doctorDays" case. V61 adds NO new customer-side error path — pre-flight gate at admin time prevents broken docs from reaching the customer.

`showDoctorStatus` + `doctorBookedSlots` — preserved verbatim from V55. The customer's "หมอว่าง/หมอไม่ว่าง" overlay continues to show when `noDoctorRequired=true` AND admin checked the box.

### `scheduleFilterUtils.js shouldBlockScheduleSlot`

Extend signature:

```js
/**
 * @param {object} appt
 * @param {object} cfg
 * @param {boolean} cfg.noDoctorRequired
 * @param {string|null} cfg.selectedDoctorId
 * @param {string|null} cfg.selectedRoomId          - legacy single (backward compat)
 * @param {string[]} [cfg.selectedRoomIds]           - V61 array (preferred when present)
 * @param {Set<string>} cfg.assistantIds
 */
export function shouldBlockScheduleSlot(appt, cfg) {
  // V61 — if selectedRoomIds array present + non-empty, treat as the room set
  const roomSet = (Array.isArray(cfg.selectedRoomIds) && cfg.selectedRoomIds.length > 0)
    ? new Set(cfg.selectedRoomIds.map(String))
    : (cfg.selectedRoomId ? new Set([String(cfg.selectedRoomId)]) : null);

  // ... existing logic, replacing single roomId checks with roomSet.has(...)
}
```

`shouldBlockDoctorSlot` (used for doctorBookedSlots) — unchanged. It already operates on `doctorRoomIds` set, not the schedule-link's selectedRoom.

---

## 8. Audit invariant (Section 5)

### NEW AV33 — Schedule-link modal room dropdown driven by canonical schedule, not `kind`

**Pattern**: schedule-link modal MUST derive eligible room dropdown options from `be_staff_schedules` (canonical) for the months window — NOT from `branchExamRooms.kind` static filter.

**Source-grep regression** (`tests/v61-schedule-link-room-dropdown.test.js`):
```js
// pre-V61 forbidden pattern (kind-based filter)
expect(ADMIN_DASHBOARD_SRC).not.toMatch(
  /branchExamRooms\.filter\(\s*r\s*=>\s*r\.role\s*===\s*\(\s*schedNoDoctorRequired\s*\?\s*['"]staff['"]\s*:\s*['"]doctor['"]\s*\)\s*\)/
);
// V61 required pattern — eligibleRoomIds derived via helper
expect(ADMIN_DASHBOARD_SRC).toMatch(/deriveDoctorRoomIdsForWindow\(/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/deriveNonDoctorRoomIdsForWindow\(/);
expect(ADMIN_DASHBOARD_SRC).toMatch(/eligibleRoomIds\s*=\s*useMemo/);
// Pre-flight gate
expect(ADMIN_DASHBOARD_SRC).toMatch(/eligibleRoomIds\.length\s*===\s*0/);
// Saved doc shape
expect(ADMIN_DASHBOARD_SRC).toMatch(/selectedRoomIds:\s*v61SelectedRoomIds/);
```

**Sanctioned exceptions**: NONE — every modal that gates a customer-facing room list MUST derive from canonical schedule.

---

## 9. Test plan (Section 6 — comprehensive per user "ปนเป ปั่นป่วน")

### 9.1 Pure helper unit tests — `tests/v61-room-dropdown-helpers.test.js`

| Group | Coverage |
|-------|----------|
| H1 helper-exists | both helpers exported + V61 marker present |
| H2 doctor-rooms-specific | single doctor with recurring → returns roomIds union; per-date overrides cancel correctly |
| H2.5 doctor-rooms-multiple | doctorIds=['A','B'] → union of both doctors' roomIds |
| H3 doctor-rooms-all | doctorIds=null → aggregate all entries |
| H4 doctor-rooms-edge | empty entries / wrong doctor id / leave-cancels-recurring / per-date-on-non-recurring-day |
| H5 nondoctor-rooms-basic | branch with 5 rooms, 2 touched by doctors → returns 3 untouched |
| H5.5 nondoctor-rooms-status | excludes status≠'ใช้งาน' rooms from candidate set |
| H6 nondoctor-rooms-edge | empty entries → all branch rooms; entries cover all rooms → empty |
| H7 mergeSchedulesForDate-correctness | per-date leave correctly cancels recurring's contribution to room set |
| H8 multi-month | 1 month / 2 month / 6 month windows produce correct unions |

### 9.2 Source-grep regression tests — `tests/v61-modal-source-grep.test.js`

- AV33 invariant assertions (see §8)
- V57 kind-filter NOT used in modal anymore
- Defensive reset useEffect present
- Pre-flight gate fires before setDoc
- `selectedRoomIds` saved in setDoc shape
- V61 marker comments at all 5+ wires

### 9.3 RTL flow-simulate tests — `tests/v61-room-dropdown-flow-simulate.test.jsx`

Mount the modal with mock `BranchProvider` + mock `be_staff_schedules` data. Assert:
- F1: pick doctor → dropdown options narrow to doctor's rooms
- F2: switch to "แพทย์ทุกคน" → dropdown shows union of all doctors
- F3: toggle ไม่พบแพทย์ → dropdown shows non-doctor rooms only
- F4: pick doctor → pick room A → switch doctor → A no longer in set → room reset to null (V55 pattern)
- F5: change months window → dropdown re-derives
- F6: empty state → inline error visible + Gen button blocked
- F7: lifecycle round-trip — toggle modes back and forth, verify deterministic state

### 9.4 Pre-flight gate test — `tests/v61-pre-flight-gate.test.js`

- Doctor with no entries in window → gate fires + Thai toast + early return
- ไม่พบแพทย์ + every room touched → gate fires + Thai toast
- Specific doctor + room not in their set → defensive reset + dropdown options reflect doctor's set
- Multi-month gate: only one month missing → still passes (not a per-month gate, just per-window)

### 9.5 Save shape + resync test — `tests/v61-saved-doc-shape.test.js`

- `selectedRoomId` + `selectedRoomIds` co-existence on saved doc
- "ทุกห้อง" pick → `selectedRoomIds: [union]`, `selectedRoomId: null`
- Specific pick → `selectedRoomIds: [room]`, `selectedRoomId: 'room'`
- Resync recomputes `selectedRoomIds` from current `be_staff_schedules`

### 9.6 Customer-side filter test — `tests/v61-shouldBlockScheduleSlot-array.test.js`

- Backward compat: `selectedRoomId='X'` (no array) → blocks appts in room X
- V61 path: `selectedRoomIds=['X','Y']` → blocks appts in either X or Y
- Both present, array preferred when non-empty
- Array empty → fall back to single

### 9.7 e2e mixed combinations — `tests/v61-mixed-combinations-flow-simulate.test.js`

Per user "แบบอื่นๆ แบบผสมปนเป ปั่นป่วน แต่ยังให้แสดงผลในลิ้งค์ทุกรูปแบบ ทุก combination ที่เป็นไปได้ได้อย่างสมจริง":

Matrix dimensions:
- Mode: พบแพทย์ × ไม่พบแพทย์
- Doctor: specific × แพทย์ทุกคน × null (ไม่พบแพทย์ mode) — N/A combos excluded
- Room: specific × ทุกห้อง
- Months window: 1 / 2 / 3
- Schedule shape: recurring-only / per-date-only / mixed / empty / leave-cancels-recurring
- Appointments overlap: doctor-room booked + non-doctor-room booked simultaneously
- showDoctorStatus: on / off (ไม่พบแพทย์ mode only)

Total scenarios: ~24 hand-crafted + 1 property-based fuzz with mulberry32 PRNG generating 50 random schedule shapes (mirrors V48 pattern).

For each scenario, assert:
- Modal eligibleRoomIds matches expected
- Saved doc selectedRoomIds matches expected snapshot
- bookedSlots filtered correctly
- Customer-side gating produces correct calendar (specific dates clickable / disabled)
- showDoctorStatus overlay fires only when expected

### 9.8 Live preview_eval verification on running dev server

Generate a fresh test SCH-V61-* link via admin UI for each mode, verify:
- Dropdown auto-filters
- Pre-flight gate fires when forced (delete all schedule entries temporarily)
- Customer page renders correctly
- Click on enabled date → slot panel opens

---

## 10. Files touched

| File | Change |
|------|--------|
| `src/lib/staffScheduleValidation.js` | + 2 NEW helpers (~80 LOC) |
| `src/pages/AdminDashboard.jsx` | useEffect extension + useMemo + dropdown JSX + reset + pre-flight gate + save shape + 3 resync paths (~180 LOC modified) |
| `src/lib/scheduleFilterUtils.js` | `shouldBlockScheduleSlot` extends to accept `selectedRoomIds` array (~10 LOC) |
| `src/pages/ClinicSchedule.jsx` | NO CHANGE (bookedSlots already pre-filtered) |
| `tests/v61-room-dropdown-helpers.test.js` | NEW (~150 LOC) |
| `tests/v61-modal-source-grep.test.js` | NEW (~80 LOC) |
| `tests/v61-room-dropdown-flow-simulate.test.jsx` | NEW (~250 LOC) |
| `tests/v61-pre-flight-gate.test.js` | NEW (~80 LOC) |
| `tests/v61-saved-doc-shape.test.js` | NEW (~100 LOC) |
| `tests/v61-shouldBlockScheduleSlot-array.test.js` | NEW (~70 LOC) |
| `tests/v61-mixed-combinations-flow-simulate.test.js` | NEW (~300 LOC) |
| `.agents/skills/audit-anti-vibe-code/SKILL.md` | + AV33 invariant |
| `.claude/rules/00-session-start.md` | + V61 V-summary row |
| `.agents/active.md` + `SESSION_HANDOFF.md` | state updates |

---

## 11. Out of scope (deferred)

- Multi-doctor selection in UI (single-select stays; helpers accept array shape for future use)
- Migration of existing pre-V61 saved docs from `selectedRoomId` to `selectedRoomIds` (backward-compat preferred)
- Refactoring `shouldBlockDoctorSlot` (only schedule-link modal's gating room set changed)
- AV31 documentation lag from V58 (separate cleanup)

---

## 12. Verify locally

```bash
# Targeted (Rule N)
npm test -- --run tests/v61-room-dropdown-helpers.test.js \
                  tests/v61-modal-source-grep.test.js \
                  tests/v61-room-dropdown-flow-simulate.test.jsx \
                  tests/v61-pre-flight-gate.test.js \
                  tests/v61-saved-doc-shape.test.js \
                  tests/v61-shouldBlockScheduleSlot-array.test.js \
                  tests/v61-mixed-combinations-flow-simulate.test.js \
                  tests/audit-branch-scope.test.js \
                  tests/v60-doctor-days-derive-from-schedules.test.js \
                  tests/v55-schedule-link-modal-flow-simulate.test.js \
                  tests/v56-doctor-schedule-room-assignment-flow-simulate.test.jsx

# Full suite + build (Rule N batch-end)
npm test -- --run
npm run build

# preview_eval verification on running dev server
# Generate fresh links for each mode + verify dropdowns + customer page
```

---

## 13. Rollback / risk

- Helpers are additive (no behavior change to existing code)
- Modal change replaces V57 kind-filter — backward-compat for legacy saved docs preserved by V61 reading `selectedRoomId` fallback
- Customer-side `shouldBlockScheduleSlot` extension is purely additive (preserves single-room path)
- If V61 ships broken, revert AdminDashboard.jsx modal block + helpers + filter extension — no data migration needed

---

## 14. Lessons (forward-locked)

1. **Schedule-link modal is the LAST V12 multi-reader-sweep adoption gap** — V52-V60 closed READ + SAVE boundaries. V61 closes the MODAL UI BOUNDARY.
2. **Canonical source overrides static schema fields** — V57 added `kind` for general categorization, but the schedule-link modal needs schedule-DRIVEN data, not kind-static. AV33 locks this principle.
3. **Snapshot at save + recompute on Sync** is the canonical pattern for customer-facing public-link docs (V60 doctorDays + V61 selectedRoomIds both use it).
4. **Backward-compat via dual-field** (`selectedRoomId` legacy + `selectedRoomIds` array) prevents migration risk while progressing the schema.
