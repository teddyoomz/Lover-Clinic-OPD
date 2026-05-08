# Per-Branch Open Hours → Time-Axis Filter (V53) — Design

> **Status:** Approved (user said "ok" to autonomous execution per V52 pattern, 2026-05-08 EOD #6+)
> **Spec author:** Claude (autonomous brainstorming session)
> **Iron-clad triggers:** Rule J brainstorming HARD-GATE · Rule P 7-step class-of-bug expansion (Tier 2 default artifacts) · Rule N targeted tests · Rule I full-flow simulate · Rule of 3 (single helper module → 3 victim files)

---

## 1. Problem statement

User reported (verbatim):

> "ทำให้เวลาเปิด-ปิดของแต่ละสาขา มีผลกับตารางแพทย์ ตารางนัดหมาย และ modal ที่จะไปดึงเวลานัดจากสาขานั้นทั้งหมด.. ก็คือ แสดงในเวลาใน ตารางแพทย์ ตารางผู้ช่วย ตารางพนักงงาน รวมถึง ในหน้า ตารางนัดหมาย ทั้งหมดทุก tab และทุก modal ที่มาดึงเวลานัดหมายจากสาขานั้นๆ แค่เวลาที่เปิดเปิดคลินิก ไม่ต้องแสดงตั้งแต่ 8 โมง ถึง 4 ทุ่ม ถ้าคลินิกมันเปิดแค่ 11 โมง ถึง 3 ทุ่ม"

= "Make the open-close hours of each branch drive the time-axis displayed in doctor schedule, assistant schedule, staff schedule, and appointment calendar (all tabs + every modal that pulls appointment times from that branch). Only show the open hours — don't show 8am to 10pm if the clinic only opens 11am to 3pm."

**Current state (audit, 2026-05-08 post-V52):**

| Surface | File | Hardcoded range | Source |
|---|---|---|---|
| AppointmentCalendarView grid (canonical) | `AppointmentCalendarView.jsx` lines 785–945 | 08:15–22:00 (56 slots × 15 min) | `TIME_SLOTS` import |
| AppointmentFormModal start picker | `AppointmentFormModal.jsx` lines 951–954 | same | `TIME_SLOTS` |
| AppointmentFormModal end picker | `AppointmentFormModal.jsx` lines 958–961 | same | `TIME_SLOTS` |
| ScheduleEntryFormModal start picker | `scheduling/ScheduleEntryFormModal.jsx` lines 168–173 | same | `TIME_SLOTS` |
| ScheduleEntryFormModal end picker | `scheduling/ScheduleEntryFormModal.jsx` lines 179–184 | same | `TIME_SLOTS` |

**3 component files** (one canonical view + two modals) all import the same `TIME_SLOTS` from `src/lib/staffScheduleValidation.js`. Single source-of-truth — Rule of 3 leverage applies. **Doctor/Employee schedule tabs use chip-per-date rendering** (no continuous time-axis) → modal that creates/edits entries (`ScheduleEntryFormModal`) is the time-filter surface for those.

**V51 schema (already shipped, 2026-05-08 EOD #4)**: per-branch `clinic_settings/{branchId}.settings.openHours.{monFri, satSun}.{open, close}` (HH:MM 15-min-aligned). `useEffectiveClinicSettings(clinicSettings)` hook returns merged `openHoursMonFri` + `openHoursSatSun` reactive to top-right BranchSelector.

---

## 2. Goal

Drive every appointment / schedule time-axis from the branch's `openHours.{monFri, satSun}` per current calendar date. When admin switches branch in top-right BranchSelector, every grid + dropdown re-renders to the new branch's open hours immediately.

Closed-day handling: when `open === close` (or invalid) → show "ปิดทำการ" banner, empty grid, save buttons disabled.

Legacy appointment handling (Q1 = A, locked): if existing appointment falls outside new open hours, **show inside auto-expanded grid + orange "นอกเวลาเปิด" warning chip** so admin can reschedule. Do not hide.

---

## 3. Architecture decisions (locked)

### Decision 1 — Pure helper layer in `scheduleFilterUtils.js`

Add 3 branch-blind functions to existing helpers module:

```js
// signature contracts
getOpenHoursForDate(dateISO, mergedSettings)
  → { open: 'HH:MM', close: 'HH:MM' } | null

getVisibleTimeSlotsForDate({ dateISO, mergedSettings, allTimeSlots, includeAppointments })
  → { slots: string[], openRange: {open, close} | null, isClosed: boolean,
      hasOutsideAppts: boolean, expandedFrom: 'open-hours' | 'closed' | 'legacy-expand' | 'fallback' }

isTimeOutsideOpenHours(time, dateISO, mergedSettings)
  → boolean
```

Pure JS, no Firestore, no React. Branch-blind by nature (caller passes `mergedSettings`). Tested in isolation; reused by all 3 victim files.

### Decision 2 — Day-of-week resolution

Use `bangkokNow()`-derived day for Mon-Fri vs Sat-Sun bucket determination:

```js
function getDayBucket(dateISO) {
  // Bangkok TZ day-of-week. dateISO format 'YYYY-MM-DD'.
  // Mon-Fri → 'monFri'; Sat-Sun → 'satSun'.
  const d = new Date(`${dateISO}T00:00:00+07:00`);
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return (dow === 0 || dow === 6) ? 'satSun' : 'monFri';
}
```

Locks Bangkok TZ via explicit `+07:00` offset on the date string, avoiding `getDay()` browser-locale ambiguity.

### Decision 3 — Closed-day detection

`open === close` → closed. Also closed if either field missing/invalid.

```js
function isClosedHours(hours) {
  if (!hours) return true;
  if (typeof hours.open !== 'string' || typeof hours.close !== 'string') return true;
  if (hours.open === hours.close) return true;
  // Reverse-time (close before open) is also "invalid → closed" for safety
  if (hours.close < hours.open) return true;
  return false;
}
```

### Decision 4 — Legacy appointment auto-expand (Q1 = A)

When `getVisibleTimeSlotsForDate` is called with `includeAppointments: [appts]`, it scans those appts' `startTime`/`endTime` for any that fall outside `[open, close]`. If found:
- Expand visible range to `[min(open, ...apptStarts), max(close, ...apptEnds)]`
- Set `hasOutsideAppts: true`
- AppointmentCalendarView reads this flag to render orange "นอกเวลาเปิด" chip on each affected appt card

Only `AppointmentCalendarView` passes `includeAppointments` (it has the appt list anyway for grid rendering). Modals don't pass it (no need to auto-expand the picker — admin picking a new time should see only valid slots).

### Decision 5 — Fallback chain when settings absent

```
1. mergedSettings.openHoursMonFri (V51 per-branch, primary)
2. mergedSettings.openHoursSatSun (per-branch, weekend bucket)
3. If both missing → fall back to legacy 08:15–22:00 ALL TIME_SLOTS
   (zero behavior change for unmigrated/legacy branches)
4. Returns expandedFrom: 'fallback' so callers can render a soft hint
   (out of scope to surface this hint v53; reserved for future)
```

V51 migration backfilled all 3 production branches → fallback path is for development/test branches only.

### Decision 6 — Component wiring (canonical pattern)

Each victim file gets the same 3-line addition:

```jsx
// 1. Import — add useEffectiveClinicSettings + new helpers
import { useEffectiveClinicSettings } from '../../lib/BranchContext.jsx';
import { getVisibleTimeSlotsForDate, isTimeOutsideOpenHours } from '../../lib/scheduleFilterUtils.js';

// 2. Hook subscription (top of component)
const cs = useEffectiveClinicSettings(clinicSettings);

// 3. Derived visible slots (memoized on settings + selected date)
const visible = useMemo(
  () => getVisibleTimeSlotsForDate({
    dateISO: selectedDate,
    mergedSettings: cs,
    allTimeSlots: TIME_SLOTS,
    includeAppointments: appointmentsForGrid, // only AppointmentCalendarView
  }),
  [selectedDate, cs.openHoursMonFri, cs.openHoursSatSun, appointmentsForGrid]
);

// 4. Replace `TIME_SLOTS.map(...)` with `visible.slots.map(...)`
// 5. Render `<ClosureBanner reason="closed-hours" />` when visible.isClosed
// 6. (AppointmentCalendarView only) appt card overlay if isTimeOutsideOpenHours(appt.startTime, ...)
```

### Decision 7 — Closed banner reuse

AppointmentCalendarView already has a holiday banner. Add `closure: 'closed-hours'` reason to existing banner component (extend, don't fork). Banner copy:
- holiday: "ปิดทำการ — วันหยุด"
- closed-hours: "นอกเวลาเปิดทำการของสาขา"

In modals, banner + Save button disabled (no new appt creation on closed date).

### Decision 8 — Out-of-hours chip on appt cards

In AppointmentCalendarView, each appointment card gets a check: if `isTimeOutsideOpenHours(appt.startTime, dateISO, cs)` → orange chip "นอกเวลาเปิด" shown next to time label. Tooltip: "นัดเดิมก่อนเปลี่ยนเวลาเปิดสาขา. กดเพื่อเลื่อนเวลา."

Click chip → opens AppointmentFormModal with the appt loaded (existing edit flow). Inside modal, time picker only shows in-range slots; warning hint appears: "เลือกเวลาใหม่เพื่อแก้ไขให้อยู่ในช่วงเปิด"

### Decision 9 — Modal warning hint (lightweight)

For AppointmentFormModal + ScheduleEntryFormModal: below the time-picker `<select>`, render a small text hint when picked time is currently displayed but outside open hours (only happens for legacy edits):

```jsx
{isTimeOutsideOpenHours(formData.startTime, formData.date, cs) && (
  <p className="text-xs text-amber-400 mt-1">
    ⚠ เวลานี้อยู่นอกช่วงเปิดสาขา — เปลี่ยนเป็นเวลาในช่วงเปิดเพื่อความถูกต้อง
  </p>
)}
```

This is informational only — Save still allowed (admin may know what they're doing for special cases).

---

## 4. Files to modify

### Source (4 files):

- `src/lib/scheduleFilterUtils.js` — NEW 3 helpers (~120 LOC additive)
- `src/components/backend/AppointmentCalendarView.jsx` — wire helpers + closed banner + chip
- `src/components/backend/AppointmentFormModal.jsx` — wire helper + warning hint
- `src/components/backend/scheduling/ScheduleEntryFormModal.jsx` — wire helper

### Tests (3 new files):

- `tests/v53-open-hours-helpers.test.js` (Rule N targeted) — unit tests for 3 helpers + adversarial inputs
- `tests/v53-open-hours-source-grep.test.js` (V12 multi-reader-sweep) — regression locks for 3 victim files
- `tests/v53-open-hours-flow-simulate.test.js` (Rule I full-flow) — BranchProvider switch → grid re-renders

### Audit (2 files):

- `.agents/skills/audit-branch-scope/SKILL.md` — add BS-12 row (or reuse existing) for time-axis discipline
- `tests/audit-branch-scope.test.js` — add BS-12 sub-tests

### Docs (4 files):

- `docs/superpowers/specs/2026-05-08-per-branch-open-hours-time-axis-design.md` — THIS file
- `docs/superpowers/plans/2026-05-08-per-branch-open-hours-time-axis.md` — implementation plan
- `.claude/rules/00-session-start.md` § 2 — V53 compact entry
- `.claude/rules/v-log-archive.md` — V53 verbose entry
- `SESSION_HANDOFF.md` + `.agents/active.md` — state update

---

## 5. Implementation order

1. **Foundation** — add 3 helpers to `scheduleFilterUtils.js` (additive)
2. **Helper tests** — `v53-open-hours-helpers.test.js` (Rule N — verify pure logic before wiring)
3. **Wire AppointmentCalendarView** — most complex (grid + closure banner + chip)
4. **Wire AppointmentFormModal** — pickers + warning hint
5. **Wire ScheduleEntryFormModal** — pickers
6. **Source-grep regression** — `v53-open-hours-source-grep.test.js` (V12 anti-drift)
7. **Rule I flow-simulate** — `v53-open-hours-flow-simulate.test.js` (BranchProvider switch chain)
8. **Audit invariant** — BS-12 in audit-branch-scope SKILL + test bank
9. **Verify** — targeted (Rule N) + full vitest --run + build clean
10. **Commit + push** (NO deploy)
11. **State update** — SESSION_HANDOFF + active.md + V-entry

---

## 6. Risk assessment

### Low risk
- Helpers are pure JS — easy to test exhaustively
- Component wiring is mechanical (same 3-line pattern × 3 files)
- V51 schema already in production; no new data ops needed

### Medium risk
- AppointmentCalendarView line 785–945 is a complex 160-line render block with rooms × slots nested. Need careful Edit to preserve room column rendering while filtering rows.
- Existing `selectedDate` state shape may differ between AppointmentCalendarView and the modals. Verify.
- `useEffectiveClinicSettings` is a hook — must be called inside component, not in helper.

### Higher risk (acceptable)
- Legacy appointment auto-expand: if branch was previously open 06:00–24:00 then admins set 11:00–20:00, all old appts fall outside. Could result in significantly expanded grid. Mitigation: visible.expandedFrom === 'legacy-expand' returns the actual scan range (could be wider than open hours by hours). Cap auto-expand at original 08:15–22:00 max if needed (configurable; default uncapped for completeness).

### Out of scope (explicitly)
- Holidays integration (already separate banner)
- Doctor recurring shifts outside open hours (chips display per `be_staff_schedules`; no new clamping)
- Buffer/setup time (e.g. "open 11:00 + 30 min staff prep")
- Per-day-of-week individual hours (Tue 11:00–20:00, Wed 12:00–21:00) — schema is 2-bucket, V53 honors that
- Stock/finance reports (V52 already shipped branch-scope; V53 doesn't touch those)
- Public-link surfaces (PatientForm, PatientDashboard, ClinicSchedule) — outside admin scope; existing BS-10 sanctioned exception

---

## 7. Verify (acceptance criteria)

Per Rule N (targeted) + Rule I (flow simulate) + verification-before-completion:

1. **Targeted tests pass**:
   - `npm test -- --run tests/v53-open-hours-helpers.test.js`
   - `npm test -- --run tests/v53-open-hours-source-grep.test.js`
   - `npm test -- --run tests/v53-open-hours-flow-simulate.test.js`
   - `npm test -- --run tests/audit-branch-scope.test.js` (BS-12 block green)

2. **Full vitest at end of batch**: `npm test -- --run` — all green (no regressions in 7543 existing tests).

3. **Build clean**: `npm run build` — no MISSING_EXPORT or syntax errors.

4. **Manual source-grep verify** (post-V53):
   - `git grep -n "TIME_SLOTS" src/components/backend/` returns hits only in 3 expected files (AppointmentCalendarView + AppointmentFormModal + ScheduleEntryFormModal); each hit must be paired within ~50 lines with a `getVisibleTimeSlotsForDate` call.
   - `git grep -nE "openHoursMonFri|openHoursSatSun" src/lib/scheduleFilterUtils.js` returns hits (helper reads these fields).

5. **Class-of-bug expansion (Rule P 7-step) trail**: V53 V-entry in `00-session-start.md` § 2 + verbose in `v-log-archive.md` references the lesson + cross-link to BS-12.

---

## 8. Iron-clad rule trail

- **Rule J** brainstorming HARD-GATE: spec written + user approved (this turn)
- **Rule P** 7-step class-of-bug expansion: V53 is enrichment of V51/V52 BSA family — Tier 2 default artifacts (regression test + audit invariant + classifier doc) shipped; Tier 3 (V-entry) shipped because the pattern locks "time-axis must be branch-aware" permanently
- **Rule N** targeted-test-only during iteration; full vitest at end of batch
- **Rule I** full-flow simulate via BranchProvider + canonical pattern chain (BranchProvider switch → useEffectiveClinicSettings re-emit → useMemo recomputes → grid re-renders)
- **Rule of 3** — single helper module, 3 victim files, single sanctioned annotation list
- **Rule V37** — git add explicit files only (no `-A`)
- **NO DEPLOY** this turn — local + commits only; user authorizes `vercel --prod` separately

---

**Approved:** User said "ok" to proposed design + autonomous V52-style execution. Implementation begins immediately.
