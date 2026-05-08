# V56 — Doctor Schedule Room Assignment (BS-15)

> Spec date: 2026-05-08
> Methodology: brainstorming Q1–Q5 + Approach 1 (minimal V55 integration) — locked
> Companion: V55/BS-14 (schedule-link modal data sources branch-scoped)

## Problem Statement

User directive (verbatim, 2026-05-08):
> "ใน tab=doctor-schedules modal สร้าง /แก้ไข วันทำงาน ทั้ง งานประจำสัปดาห์ และ งานรายวัน ..ให้ทำ box ให้ติ๊กเลือกได้ด้วยว่า แพทย์ คนนี้เข้าตรวจห้องไหนบ้างในสาขานั้นๆ แล้วนำไปแสดงจริงในหน้า tab=appointment ว่าหมอคนนั้นๆสาขานั้นๆ เข้าห้องไหนเวลาไหน ตรง box แพทย์เข้าตรวจ และนำไปเป็นข้อมูลสำหรับดึงตารางหมอและห้องหมอเพื่อส่งไปเป็นลิ้งให้ลูกค้าได้ใน frontend บริเวณ tab นัดหมาย ให้ตรงสาขานั้นๆได้ด้วย"

Plus the explicit asymmetric rule for assistants:
> "ส่วนใครที่เป็นผู้ช่วยแพทย์ จะไม่ต้องติ๊กว่าห้องไหนบ้าง เพราะจะทำงานทุกห้องพร้อมกันโดยอัตโนมัติ"

Today, `be_staff_schedules` entries have no room information. The schedule-link modal (V55) lets admin pick one doctor + one room per link, but that pick is not validated against the doctor's actual licensed rooms. `TodaysDoctorsPanel` ("แพทย์เข้าตรวจ") renders only doctor name + time, no room context.

This spec adds per-shift room assignment so the data flows: modal input → schedule storage → panel display → V55 link auto-closure for non-licensed dates.

## Goals

- Admin can tick which doctor-kind exam rooms a doctor is licensed for in each schedule entry (recurring weekly + per-date override).
- Assistants do NOT have a checkbox — they auto-cover all branch doctor-rooms simultaneously per user directive.
- `TodaysDoctorsPanel` renders inline room chips per doctor row.
- V55 schedule-link gen auto-closes any date where the picked (doctor, room) combo isn't licensed (the picked room isn't in that day's `roomIds`).
- All data is per-branch (compatible with V52/BS-11 + V53/BS-12 + V54/BS-13 + V55/BS-14).

## Non-Goals

- Per-time-slot room assignment within a single shift entry (e.g. "Dr. A in A1 from 9–13, B2 from 13–17"). Admin should split into two shift entries instead.
- Room assignment on `be_doctors` doc as default with per-shift override (Approach 3 — rejected as YAGNI; Q3 contract makes it dead code).
- Per-(doctor, room) availability matrix in the saved schedule-link doc (Approach 2 — rejected as YAGNI; V55's existing single (doctor, room) admin pick + auto-closure mechanism is sufficient).
- Migration of existing `be_staff_schedules` entries — pre-V56 entries (no `roomIds` field) automatically default to "all rooms" semantic via consumer-side rule. Forward-only.
- Customer-facing public-link page changes — V55's existing `closedDays` rendering already handles auto-closures; no new fields in the saved doc.

## Architecture Decisions (Q1–Q5 locked)

- **Q1 — A**: Per-shift `roomIds: string[]` on `be_staff_schedules` (NOT on `be_doctors` doc). Different shifts can carry different rooms; matches user's stated UI; plugs into V55 per-shift link payload.
- **Q2 — A**: NO `roomIds` field on assistant entries (omitted entirely). Legacy entries (pre-V56, no field) match the assistant default → migration-free. Consumer rule: missing/empty `roomIds` → expand to all branch doctor-rooms.
- **Q3 — A**: Doctor entries REQUIRE non-empty `roomIds` (block save with Thai error). Convenience: "เลือกทั้งหมด" / "ยกเลิกทั้งหมด" toggles inside the modal box.
- **Q4 — A**: Modal layout — vertical checkbox list below the time fields, "เลือกทั้งหมด" / "ยกเลิกทั้งหมด" toggles at the top of the box, empty-state placeholder with link to `?tab=exam-rooms`. Hidden for assistants (replaced by info chip "ผู้ช่วยทำงานทุกห้องอัตโนมัติ"). Doctor-kind rooms only.
- **Q5 — A**: `TodaysDoctorsPanel` renders inline chips after the time on each doctor row. Empty/legacy `roomIds` → single chip "ทุกห้อง".

## Approach 1 — Minimal V55 integration (locked)

V55 schedule-link integration uses a derived auto-closure pattern:
- For each date in the link's months range, resolve the picked doctor's effective schedule entry (recurring + per-date override merge per Phase 22.0c).
- If the picked room is not in that entry's `roomIds`, the date is added to `closedDays` in the saved schedule-link doc.
- Legacy entries (no `roomIds`) → no auto-closure (preserves pre-V56 behavior).
- Customer-facing public-link page renders `closedDays` as "ปิด" — zero changes needed there.

No new fields in the saved schedule-link doc. No matrix derivation. No fallback to `be_doctors` doc.

## Data Model

`be_staff_schedules` entry shape additions:

```js
{
  // existing fields (preserved verbatim):
  id, scheduleId, type, staffId, staffName, branchId,
  date | dayOfWeek, startTime, endTime, note,

  // V56 NEW — present ONLY on doctor entries with working type
  // (recurring | work | halfday). Forbidden on assistant entries
  // (omitted entirely). Forbidden on leave/sick/holiday entries.
  roomIds?: string[],
}
```

Validation invariants (extending `validateStaffScheduleStrict`):

- **SS-10**: `if (form.staffKind === 'doctor' && WORKING_TIME_TYPES.has(type)) → roomIds must be Array.isArray(roomIds) && roomIds.length >= 1 && every is string`. Block save with `['roomIds', 'ต้องเลือกห้องอย่างน้อย 1 ห้อง']`.
- **SS-11**: `if (form.staffKind === 'assistant' && form.roomIds != null) → reject ['roomIds', 'ผู้ช่วยไม่ต้องเลือกห้อง']`. (Defensive: catches accidental writes from a buggy modal call site that forgets to drop the field.)
- Existing SS-1..SS-9 unchanged.

`staffKind` is a NEW pure-validator parameter — not stored on the doc. Caller (modal save handler) passes it based on the tab the modal is mounted in (`'doctor'` from `DoctorSchedulesTab`, `'assistant'` from `EmployeeSchedulesTab`).

## New Library Helpers

`src/lib/staffScheduleValidation.js` — additions:

- **`expandRoomIdsForDisplay(entry, branchExamRooms) → string[]`** — pure JS:
  - If `entry.roomIds` is non-empty array → filter to ids present in `branchExamRooms` (silent stale-skip) → return that filtered list.
  - Else (legacy / assistant) → return all `branchExamRooms.filter(r => r.kind === 'doctor').map(r => r.id)`.
- **`derivedAutoClosedDates({ doctorId, roomId, schedulesByDate, datesISO }) → string[]`** — pure JS:
  - For each `dateISO` in `datesISO`:
    - Resolve effective entry for `(doctorId, dateISO)` via existing schedule merge (`schedulesByDate[dateISO]?.find(s => s.staffId === doctorId)`, with override > recurring precedence).
    - If entry has `roomIds && roomIds.length > 0 && !roomIds.includes(roomId)` → push `dateISO` into result.
    - Legacy/missing `roomIds` → no closure (continue).
  - Return deduplicated sorted result.

## Modal UI Change (`ScheduleEntryFormModal.jsx`)

New props:
- `staffKind: 'doctor' | 'assistant'` (required)
- `branchExamRooms: Array<{id, name, kind}>` (required) — passed by parent (`DoctorSchedulesTab` / `EmployeeSchedulesTab` via `listExamRooms({branchId, status:'ใช้งาน'})` per V55 pattern)

Render rules:
- `kind === 'leave'` OR `form.type ∈ {leave, sick, holiday}` → no room box (rooms don't apply).
- `staffKind === 'assistant'` → no room box; show single info chip "ℹ ผู้ช่วยทำงานทุกห้องอัตโนมัติ".
- `staffKind === 'doctor'` AND working type (recurring | work | halfday) → render the box.

Box layout (between time fields and note):

```
ห้องตรวจ *
  [✓ เลือกทั้งหมด] [✗ ยกเลิกทั้งหมด]
  ☑ ห้องตรวจ A1
  ☐ ห้องตรวจ A2
  ☐ ห้องตรวจ B (VIP)
  empty state: "ไม่มีห้องตรวจในสาขานี้ — เพิ่มที่ ตั้งค่า → ห้องตรวจ" → link
```

- Source: `branchExamRooms.filter(r => r.kind === 'doctor')` (doctor-kind rooms only).
- "เลือกทั้งหมด" → `setForm({...form, roomIds: filteredDoctorRoomIds})`. "ยกเลิกทั้งหมด" → `setForm({...form, roomIds: []})`.
- Empty branch-rooms → render placeholder + clickable link to `?tab=exam-rooms`.
- Whole row clickable to toggle (not just the checkbox area).
- Save button disabled while doctor + working type AND `roomIds.length === 0`.

Edit-mode initial state: existing entry's `roomIds` is hydrated into form state. If editing a legacy entry (no field), default to all-doctor-rooms ticked (so admin sees the implicit "all" expanded).

## Consumer 1 — `TodaysDoctorsPanel.jsx`

New prop: `branchExamRooms: Array` (passed by `AppointmentTab` via the same V55 listExamRooms fetch).

Per-doctor row render becomes:

```
[avatar] ชื่อหมอ
         09:00 - 17:00 [A1] [B2]
```

- Chips derive from `expandRoomIdsForDisplay(scheduleEntry, branchExamRooms)`.
- All-rooms (legacy / assistant fallback) → single chip "ทุกห้อง".
- Stale roomId in entry's array → silent-skip (already handled inside the helper via filter-to-existing).
- Chip styling: rounded pill, 10px text, sky-tinted background to match panel's existing accent. Wrap to a 2nd line if overflow.
- Click-row behavior unchanged (`onDoctorClick(doctorId)`).

Note: Panel already filters to doctors only (line 45 — `doctors.find`), so assistants never reach this render path; the "ทุกห้อง" chip is reserved for legacy doctor entries with no `roomIds`.

## Consumer 2 — V55 schedule-link auto-closure

Inside `handleGenScheduleLink` (`src/pages/AdminDashboard.jsx` ~line 1281), after computing `bookedSlots` for each month:

1. Build `datesInRange: string[]` — every `YYYY-MM-DD` in the months range (already computable from existing `months` array + month-day count).
2. **Fetch be_staff_schedules entries** for the picked doctor across the months range, branch-scoped:
   - `const sched = await listStaffSchedulesByDateRange({ branchId: selectedBranchId, staffId: schedSelectedDoctor, fromDate: datesInRange[0], toDate: datesInRange[datesInRange.length - 1] })`
   - This helper may need to be added to `src/lib/scopedDataLayer.js` (wrapping `backendClient.js`) if it doesn't exist yet — implementation plan resolves. The fetch must respect V55/BS-14 branch-scope (use `{ branchId: selectedBranchId }` explicitly, V52/BS-11 canonical).
3. Build `schedulesByDate: { [date]: Array }` — group entries by effective date. Recurring entries fan out to every matching dayOfWeek in the range; per-date entries (override / leave) stamp directly. Override > recurring precedence per existing Phase 22.0c merge logic.
4. `const autoClosedDates = derivedAutoClosedDates({ doctorId: schedSelectedDoctor, roomId: schedSelectedRoom, schedulesByDate, datesISO: datesInRange })`.
5. Save: `closedDays: [...new Set([...schedClosedDays, ...autoClosedDates])]` (union, dedup).

If `schedSelectedDoctor` is null OR `schedSelectedRoom` is null (admin picked "all doctors" or "all rooms") → skip the fetch; `derivedAutoClosedDates` returns `[]` (no auto-closure). Also short-circuit if `schedSelectedDoctor` is set but no matching schedule entries exist (preserves backward-compat — pre-V56 doctors without entries license everywhere).

No changes to the customer-facing `ClinicSchedule.jsx` page — `closedDays` already drives "ปิด" rendering.

## Audit Invariant — BS-15

Extend `audit-branch-scope` (14 → 15 invariants):

**BS-15** — Doctor schedule room assignment integrity:
- `ScheduleEntryFormModal.jsx` MUST receive `staffKind` + `branchExamRooms` props; MUST conditionally render the room-checkbox box per the rules above; MUST NOT render the box for assistants/leave/sick/holiday.
- `validateStaffScheduleStrict` MUST contain SS-10 + SS-11 checks for `staffKind`-based roomIds invariants.
- `expandRoomIdsForDisplay` MUST be exported from `staffScheduleValidation.js`; `TodaysDoctorsPanel.jsx` MUST call it (or equivalent inline shape).
- `derivedAutoClosedDates` MUST be exported from `staffScheduleValidation.js` (or a new helper file); `AdminDashboard.jsx` `handleGenScheduleLink` MUST call it AND union into `closedDays`.

Sanctioned exceptions: NONE — all paths follow the rule.

7 sub-tests (BS-15.1..BS-15.7) added to `tests/audit-branch-scope.test.js`.

`audit-branch-scope` SKILL.md: 14 → 15 invariants table + description update.

## Test Strategy (Rule N + Rule I)

**Helper unit + adversarial** (`tests/v56-doctor-schedule-room-assignment.test.js`):
- L1 — `validateStaffScheduleStrict` SS-10: doctor + working type + missing/empty/non-string `roomIds` rejected; doctor + leave/sick/holiday no roomIds OK; doctor + recurring + non-empty roomIds accepted.
- L2 — SS-11: assistant + any `roomIds` rejected; assistant + missing roomIds OK.
- L3 — `expandRoomIdsForDisplay`: doctor with `roomIds=[A1,B2]` returns those (filtered to existing); legacy entry returns all branch doctor-rooms; stale id silent-skipped; assistant entry returns all branch doctor-rooms.
- L4 — `derivedAutoClosedDates`: doctor + room not licensed for date X → date X in result; licensed → not in result; legacy entry → not in result (preserves pre-V56 behavior); recurring + per-date override merge precedence respected.
- L5 — Adversarial: null/undefined/empty/Thai-char/numeric/string-id roomIds; idempotency (re-run with same input = same output).
- L6 — Source-grep markers: V56/BS-15 marker comments present in the touched files.

**Rule I full-flow simulate** (`tests/v56-doctor-schedule-room-assignment-flow-simulate.test.js`):
- F1 — Open modal as DoctorSchedulesTab (`staffKind='doctor'`) + branch BR-A → room box renders branchExamRooms doctor-kind only; tick rooms → save → entry has `roomIds: [...]` matching ticks.
- F2 — Open modal as EmployeeSchedulesTab (`staffKind='assistant'`) → box hidden; info chip rendered; save → entry has NO `roomIds` field.
- F3 — Edit-mode legacy entry (no roomIds) opened in doctor modal → defaults to all-rooms ticked; admin can save without changing anything (entry now gains explicit `roomIds`).
- F4 — `TodaysDoctorsPanel` renders chips for doctor with `roomIds=[A1]` (chip "A1"); legacy doctor entry → "ทุกห้อง" chip.
- F5 — V55 schedule-link gen with picked-doctor + picked-room not licensed for date X → `closedDays` saved doc includes X.
- F6 — V55 schedule-link gen with admin picked "all rooms" (`schedSelectedRoom = null`) → no auto-closure regardless of schedule.
- F7 — Branch switch in modal → branchExamRooms refetches; previously-ticked rooms not in new branch → modal auto-resets `roomIds` to [] (forces admin to pick from new branch's rooms; avoids cross-branch ghost ids).

## Migration / Backward Compat

- **No data migration**. Pre-V56 `be_staff_schedules` entries (no `roomIds` field) automatically default to "all rooms" via consumer-side rule.
- **Pre-V56 doctor entries** rendered as "ทุกห้อง" chip in the panel — admin sees the implicit default and can edit to explicit ids if desired.
- **V55 schedule-link generation** with a pre-V56 doctor entry → no auto-closure (legacy entries license everywhere). Forward-compat: as admin re-saves entries with explicit roomIds, V55 link gen starts auto-closing per the rule.
- **Existing tests** that mock `be_staff_schedules` entries without `roomIds` continue to pass (legacy semantic = "all rooms").

## Files Touched

| File | Change |
|---|---|
| `src/lib/staffScheduleValidation.js` | + SS-10 + SS-11 + `expandRoomIdsForDisplay` + `derivedAutoClosedDates` |
| `src/components/backend/scheduling/ScheduleEntryFormModal.jsx` | + props `staffKind` + `branchExamRooms`; render room-checkbox box; "เลือกทั้งหมด" toggle; empty-state placeholder; hide-for-assistant info chip |
| `src/components/backend/DoctorSchedulesTab.jsx` | Pass `staffKind='doctor'` + `branchExamRooms` to modal |
| `src/components/backend/EmployeeSchedulesTab.jsx` | Pass `staffKind='assistant'` to modal (`branchExamRooms` not used for assistant kind but passed for prop consistency) |
| `src/components/backend/scheduling/TodaysDoctorsPanel.jsx` | + prop `branchExamRooms`; render room chips per doctor row |
| `src/components/backend/AppointmentTab.jsx` | (or wherever `<TodaysDoctorsPanel/>` is mounted) — fetch + pass `branchExamRooms` per V55 pattern |
| `src/pages/AdminDashboard.jsx` | `handleGenScheduleLink` fetches be_staff_schedules per the picked doctor + range, calls `derivedAutoClosedDates`, unions into saved doc's `closedDays` |
| `src/lib/scopedDataLayer.js` + `src/lib/backendClient.js` | NEW (if absent) `listStaffSchedulesByDateRange({ branchId, staffId, fromDate, toDate })` — branch-scoped (BS-14 canonical) lister returning entries in the date range. Uses where-clauses on `staffId` + `branchId` + (date range OR dayOfWeek for recurring); existing pattern likely already covers single-day fetch via `listenToScheduleByDay`. |
| `tests/audit-branch-scope.test.js` | + BS-15.1..BS-15.7 sub-tests |
| `.agents/skills/audit-branch-scope/SKILL.md` | 14 → 15 invariants table + BS-15 description |
| `tests/v56-doctor-schedule-room-assignment.test.js` | NEW — L1..L6 helper unit + adversarial |
| `tests/v56-doctor-schedule-room-assignment-flow-simulate.test.js` | NEW — F1..F7 Rule I full-flow simulate |
| `.claude/rules/00-session-start.md` | + V56 compact V-entry row |
| `SESSION_HANDOFF.md` + `.agents/active.md` | + V56 section + state update |

## Rule References

- **Rule I**: full-flow simulate at sub-phase end (F1..F7) — mandatory.
- **Rule N**: targeted-only iteration during work; full vitest at batch end.
- **Rule J brainstorming HARD-GATE**: completed (Q1..Q5 + Approach 1 locked).
- **Rule P 7-step class-of-bug expansion**: not applicable — this is a NEW feature, not a bug fix. Audit invariant BS-15 lands as defensive future-proofing.
- **V55 / BS-14**: per-branch schedule-link modal already shipped; this spec extends V55 with the new licensure-driven auto-closure.
- **V41 / AV20** (staff/doctor hide-from-lists pattern): mirrored — explicit-data-shape > implicit-empty-as-special-meaning.
- **V36 backward-compat for legacy entries**: empty/missing branchIds = "all branches accessible" — same pattern applied here for `roomIds` (empty/missing = all-rooms-licensed).

## Deploy Stance

V56 is a code-only change. NO firestore.rules change (be_staff_schedules schema is permissive at the rule level — adding `roomIds` field doesn't need rule-level allow-list change). NO migration script (forward-only).

Per `feedback_local_only_no_deploy.md`: ship to master locally; user authorizes `vercel --prod` separately for combined V52 + V53 + V54 + V55 + V56 stack.

## Acceptance Criteria

- ✅ Doctor schedule-modal renders room-checkbox box; assistant doesn't.
- ✅ Doctor save blocked with Thai error when 0 rooms ticked.
- ✅ "เลือกทั้งหมด" / "ยกเลิกทั้งหมด" toggle work.
- ✅ Empty branch-rooms → placeholder + link to tab=exam-rooms.
- ✅ TodaysDoctorsPanel renders inline chips per doctor row; legacy entries show "ทุกห้อง".
- ✅ V55 schedule-link gen with non-licensed (doctor, room, date) auto-closes that date.
- ✅ Pre-V56 entries continue to work (no migration; legacy = "all rooms").
- ✅ Branch switch in modal resets ticked roomIds if they're not in the new branch's rooms.
- ✅ Full vitest GREEN; BS-15 audit GREEN; build clean.

## Open Questions / Future Work (non-blocking)

- (Future) Per-time-slot room assignment within a single shift entry — currently admin splits into multiple entries.
- (Future) `be_doctors.defaultRoomIds` for "this doctor usually works in these rooms" pre-fill — useful for high-volume admin onboarding.
- (Future) Customer-facing public-link page picks ROOM as a separate UI step (instead of admin pre-picking room) — would require Approach 2's matrix.
- (Future) Migration of pre-V56 entries to explicit `roomIds` for cleaner audit trail (admin tool: "ใส่ห้องเริ่มต้น = ทั้งหมด ให้ทุก entry ที่ยังไม่ระบุ").

