# Plan: V53 Per-Branch Open Hours → Time-Axis Filter

> Spec: `docs/superpowers/specs/2026-05-08-per-branch-open-hours-time-axis-design.md`
> Status: Approved (user said "ok" — autonomous V52-style execution)
> Implementation date: 2026-05-08 EOD #6+

---

## Phase 1 — Foundation: 3 helpers in `scheduleFilterUtils.js`

Pure JS additions to existing module. No React, no Firestore. Branch-blind (callers pass mergedSettings).

### 1.1 `getDayBucket(dateISO)` — internal

```js
/**
 * Resolve Bangkok-TZ day-of-week → 'monFri' | 'satSun' bucket.
 * dateISO format 'YYYY-MM-DD'. Locks Bangkok via explicit +07:00 offset
 * to avoid getDay() browser-locale ambiguity.
 */
function getDayBucket(dateISO) {
  if (!dateISO || typeof dateISO !== 'string') return 'monFri'; // safe default
  const d = new Date(`${dateISO}T00:00:00+07:00`);
  if (isNaN(d.getTime())) return 'monFri';
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return (dow === 0 || dow === 6) ? 'satSun' : 'monFri';
}
```

### 1.2 `isClosedHours(hours)` — internal

```js
/**
 * Is this hours-window effectively "closed"? Treat as closed when:
 *  - hours object missing/null
 *  - either field missing or non-string
 *  - open === close
 *  - close < open (reversed/invalid)
 */
function isClosedHours(hours) {
  if (!hours || typeof hours !== 'object') return true;
  const o = hours.open, c = hours.close;
  if (typeof o !== 'string' || typeof c !== 'string') return true;
  if (!o || !c) return true;
  if (o === c) return true;
  if (c < o) return true; // reverse-time = invalid
  return false;
}
```

### 1.3 `getOpenHoursForDate(dateISO, mergedSettings)` — public

```js
/**
 * Resolve the open-hours window for a given date based on branch's
 * monFri vs satSun bucket. Returns null when closed.
 *
 * @param {string} dateISO — 'YYYY-MM-DD'
 * @param {object} mergedSettings — output of useEffectiveClinicSettings()
 *   Reads: openHoursMonFri, openHoursSatSun (V51 merge layer fields)
 * @returns {{open:string, close:string} | null}
 */
export function getOpenHoursForDate(dateISO, mergedSettings) {
  if (!mergedSettings || typeof mergedSettings !== 'object') return null;
  const bucket = getDayBucket(dateISO);
  const hours = bucket === 'satSun'
    ? mergedSettings.openHoursSatSun
    : mergedSettings.openHoursMonFri;
  if (isClosedHours(hours)) return null;
  return { open: hours.open, close: hours.close };
}
```

### 1.4 `getVisibleTimeSlotsForDate({...})` — public

```js
/**
 * Derive the visible time-slot list for a given date + branch.
 *
 * @param {object} opts
 * @param {string} opts.dateISO
 * @param {object} opts.mergedSettings — useEffectiveClinicSettings() output
 * @param {string[]} opts.allTimeSlots — canonical TIME_SLOTS (08:15..22:00)
 * @param {Array<{startTime:string, endTime?:string}>} [opts.includeAppointments]
 *   When provided, scans for any appt whose time is outside [open, close].
 *   If found, expands visible range to include those times AND sets
 *   hasOutsideAppts=true so callers can render warning chip.
 *
 * @returns {{
 *   slots: string[],
 *   openRange: {open, close} | null,
 *   isClosed: boolean,
 *   hasOutsideAppts: boolean,
 *   expandedFrom: 'open-hours' | 'closed' | 'legacy-expand' | 'fallback'
 * }}
 */
export function getVisibleTimeSlotsForDate({
  dateISO,
  mergedSettings,
  allTimeSlots,
  includeAppointments = [],
} = {}) {
  const safeAll = Array.isArray(allTimeSlots) ? allTimeSlots : [];

  // Fallback: no settings at all → return all TIME_SLOTS (legacy behavior preserved)
  if (!mergedSettings || typeof mergedSettings !== 'object') {
    return {
      slots: safeAll,
      openRange: null,
      isClosed: false,
      hasOutsideAppts: false,
      expandedFrom: 'fallback',
    };
  }

  const openRange = getOpenHoursForDate(dateISO, mergedSettings);

  // No openRange = closed day
  if (!openRange) {
    return {
      slots: [],
      openRange: null,
      isClosed: true,
      hasOutsideAppts: false,
      expandedFrom: 'closed',
    };
  }

  // Compute extended range from legacy appointments if any fall outside
  let lo = openRange.open;
  let hi = openRange.close;
  let hasOutsideAppts = false;

  for (const a of includeAppointments) {
    const start = a?.startTime;
    const end = a?.endTime;
    if (typeof start === 'string' && start.length >= 4 && start < lo) {
      lo = start;
      hasOutsideAppts = true;
    }
    if (typeof end === 'string' && end.length >= 4 && end > hi) {
      hi = end;
      hasOutsideAppts = true;
    }
    if (typeof start === 'string' && start > openRange.close) {
      // start time after close → outside on the upper end
      if (start > hi) hi = start;
      hasOutsideAppts = true;
    }
  }

  // Filter allTimeSlots to [lo, hi] inclusive
  const slots = safeAll.filter((t) => t >= lo && t <= hi);

  return {
    slots,
    openRange,
    isClosed: false,
    hasOutsideAppts,
    expandedFrom: hasOutsideAppts ? 'legacy-expand' : 'open-hours',
  };
}
```

### 1.5 `isTimeOutsideOpenHours(time, dateISO, mergedSettings)` — public

```js
/**
 * Does this time fall outside the branch's open-hours for that date?
 * Used by AppointmentCalendarView to chip-flag legacy appts + by
 * AppointmentFormModal for the warning hint below the picker.
 *
 * Returns false (= not outside) when settings missing (no opinion).
 */
export function isTimeOutsideOpenHours(time, dateISO, mergedSettings) {
  if (typeof time !== 'string' || time.length < 4) return false;
  const range = getOpenHoursForDate(dateISO, mergedSettings);
  if (!range) {
    // Closed-day → ANY time is outside. Caller handles closed-banner separately.
    return Boolean(mergedSettings && (mergedSettings.openHoursMonFri || mergedSettings.openHoursSatSun));
  }
  return time < range.open || time > range.close;
}
```

---

## Phase 2 — Helper unit tests (Rule N)

`tests/v53-open-hours-helpers.test.js` covers:

- **L1** `getOpenHoursForDate`:
  - L1.1 weekday Mon→ uses monFri bucket
  - L1.2 weekday Fri → uses monFri
  - L1.3 weekend Sat → uses satSun
  - L1.4 weekend Sun → uses satSun
  - L1.5 missing settings → null
  - L1.6 closed bucket (open===close) → null
  - L1.7 reversed (close < open) → null
  - L1.8 invalid date → safe default monFri (returns from monFri bucket)
  - L1.9 Bangkok TZ correctness — 2026-01-04 = Sunday → satSun (verify via fixed-date)
  - L1.10 Bangkok TZ correctness — 2026-01-05 = Monday → monFri

- **L2** `getVisibleTimeSlotsForDate`:
  - L2.1 normal weekday with 11:30–20:30 → filters to 11:30..20:30 inclusive
  - L2.2 closed day → slots=[], isClosed=true
  - L2.3 fallback (no settings) → returns all TIME_SLOTS
  - L2.4 legacy appt at 09:00 expands lo to 09:00 + hasOutsideAppts=true
  - L2.5 legacy appt at 21:30 (after close 20:30) expands hi to 21:30
  - L2.6 multiple legacy appts both outside → expands to outermost
  - L2.7 includeAppointments empty → no expand
  - L2.8 weekend uses satSun bucket
  - L2.9 expandedFrom field correctness across paths
  - L2.10 adversarial: malformed appt items (null, missing startTime) → no crash, no expand

- **L3** `isTimeOutsideOpenHours`:
  - L3.1 time inside range → false
  - L3.2 time before open → true
  - L3.3 time after close → true
  - L3.4 time at exact open → false (inclusive)
  - L3.5 time at exact close → false (inclusive)
  - L3.6 closed day with settings present → true (any time is outside)
  - L3.7 missing settings → false (no opinion)
  - L3.8 invalid time → false

---

## Phase 3 — Wire AppointmentCalendarView

**File:** `src/components/backend/AppointmentCalendarView.jsx`

### 3.1 Imports (top of file)

```jsx
import {
  getVisibleTimeSlotsForDate,
  isTimeOutsideOpenHours,
} from '../../lib/scheduleFilterUtils.js';
import { useEffectiveClinicSettings } from '../../lib/BranchContext.jsx';
```

### 3.2 Hook subscription (top of component, near existing branch state)

```jsx
const cs = useEffectiveClinicSettings(clinicSettings);
```

### 3.3 Compute visible slots (above the render block)

```jsx
const visible = useMemo(
  () => getVisibleTimeSlotsForDate({
    dateISO: selectedDate,
    mergedSettings: cs,
    allTimeSlots: TIME_SLOTS,
    includeAppointments: appointments, // existing state holding day's appts
  }),
  [selectedDate, cs.openHoursMonFri, cs.openHoursSatSun, appointments]
);
```

### 3.4 Replace `TIME_SLOTS.map` at lines 785–945

```diff
- {TIME_SLOTS.map((time) => {
+ {visible.slots.map((time) => {
```

### 3.5 Closed-day banner

When `visible.isClosed`, replace the time-grid block with:

```jsx
{visible.isClosed ? (
  <ClosureBanner reason="closed-hours" date={selectedDate} />
) : (
  <>
    {/* existing time-grid render */}
  </>
)}
```

(`ClosureBanner` reuses existing holiday-banner pattern; if needed, extract to shared component or inline since it's small.)

### 3.6 Out-of-hours chip on appointment cards

In the per-appointment card render (inside the per-room column loop), check `isTimeOutsideOpenHours(appt.startTime, selectedDate, cs)` → if true, render small orange chip "⚠ นอกเวลาเปิด" next to time label.

Tooltip + click: same handler as time-label click (opens AppointmentFormModal in edit mode).

---

## Phase 4 — Wire AppointmentFormModal

**File:** `src/components/backend/AppointmentFormModal.jsx`

### 4.1 Imports

```jsx
import {
  getVisibleTimeSlotsForDate,
  isTimeOutsideOpenHours,
} from '../../lib/scheduleFilterUtils.js';
import { useEffectiveClinicSettings } from '../../lib/BranchContext.jsx';
```

### 4.2 Hook + memoized slots

```jsx
const cs = useEffectiveClinicSettings(clinicSettings);
const visibleSlots = useMemo(
  () => getVisibleTimeSlotsForDate({
    dateISO: formData.date,
    mergedSettings: cs,
    allTimeSlots: TIME_SLOTS,
    // No includeAppointments here — modal picker should only offer in-range slots
  }).slots,
  [formData.date, cs.openHoursMonFri, cs.openHoursSatSun]
);
```

### 4.3 Replace `TIME_SLOTS.map` in start picker (line 951–954)

```diff
- {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
+ {visibleSlots.map(t => <option key={t} value={t}>{t}</option>)}
```

### 4.4 Same for end picker (line 958–961)

### 4.5 Warning hint below pickers (when current value is outside range — only happens when editing legacy)

```jsx
{isTimeOutsideOpenHours(formData.startTime, formData.date, cs) && (
  <p className="text-xs text-amber-400 mt-1">
    ⚠ เวลานี้อยู่นอกช่วงเปิดสาขา — เลือกเวลาในช่วงเปิดเพื่อความถูกต้อง
  </p>
)}
```

### 4.6 Closed-day banner inside modal

If `getOpenHoursForDate(formData.date, cs) === null`, show banner above pickers + disable Save button.

---

## Phase 5 — Wire ScheduleEntryFormModal

**File:** `src/components/backend/scheduling/ScheduleEntryFormModal.jsx`

Identical pattern to AppointmentFormModal:

```jsx
const cs = useEffectiveClinicSettings(clinicSettings);
const visibleSlots = useMemo(
  () => getVisibleTimeSlotsForDate({
    dateISO: form.date,
    mergedSettings: cs,
    allTimeSlots: TIME_SLOTS,
  }).slots,
  [form.date, cs.openHoursMonFri, cs.openHoursSatSun]
);
```

Replace `TIME_SLOTS.map` at lines 168–173 (start) + 179–184 (end) with `visibleSlots.map`.

Note: ScheduleEntryFormModal manages doctor/staff shifts. User asked "ทุก modal ที่มาดึงเวลานัด" — this is ambiguous (shift ≠ appointment). Per Decision 6 in spec, we filter for consistency. If user later wants shift to extend past clinic open hours (e.g. doctor prep time before opening), add an override toggle later; for V53, lock to open hours.

---

## Phase 6 — Source-grep regression test

`tests/v53-open-hours-source-grep.test.js`:

For each of 3 victim files, assert:
- Imports `getVisibleTimeSlotsForDate` from `scheduleFilterUtils.js`
- Imports `useEffectiveClinicSettings` from `BranchContext.jsx`
- `useEffectiveClinicSettings(` is called inside the component body
- `getVisibleTimeSlotsForDate(` is called via useMemo
- `TIME_SLOTS.map` does NOT appear in render JSX (replaced by `visible.slots.map` or `visibleSlots.map`)
- Cross-cutting: only files importing `TIME_SLOTS` from `staffScheduleValidation.js` are the 3 victim files + `TimeSelect24.jsx` (sanctioned — pure 24-hour picker for editing settings, not picking appointments)

---

## Phase 7 — Rule I full-flow simulate

`tests/v53-open-hours-flow-simulate.test.js`:

Mock `BranchContext` + provide 2 mock branches (BR-A with monFri 11:30-20:30, BR-B with monFri 09:00-21:00).

Mount a synthetic component that uses `useEffectiveClinicSettings` + `getVisibleTimeSlotsForDate` + asserts the slots output for a fixed date.

- F1.1 — initial mount on BR-A → slots filtered to 11:30..20:30
- F1.2 — `selectBranch('BR-B')` → slots refilter to 09:00..21:00
- F1.3 — switch to a closed branch → slots=[], isClosed=true
- F1.4 — date change Mon → Sat → satSun bucket applied
- F1.5 — adversarial: branch with no openHours → fallback to TIME_SLOTS
- F1.6 — legacy appt at 09:00 + branch BR-A (open 11:30) → slots auto-expand to include 09:00; hasOutsideAppts=true
- F1.7 — round-trip: branch A → B → A → slots match initial after returning to A

---

## Phase 8 — Audit invariant BS-12

Add to `.agents/skills/audit-branch-scope/SKILL.md`:

```
| **BS-12** | **Time-axis branch-aware discipline** — every component importing `TIME_SLOTS` from `staffScheduleValidation.js` MUST also import `getVisibleTimeSlotsForDate` from `scheduleFilterUtils.js` AND derive visible slots via `useMemo` keyed on `cs.openHoursMonFri/SatSun`. Sanctioned exception: `TimeSelect24.jsx` (pure 24-hour picker for editing settings — annotate `// audit-branch-scope: BS-12 settings-picker — not for appointment time`). V53 / 2026-05-08 |
```

Add `tests/audit-branch-scope.test.js` BS-12 sub-tests:
- BS-12.1 every TIME_SLOTS importer also imports getVisibleTimeSlotsForDate (or has BS-12 annotation)
- BS-12.2 useMemo deps include cs.openHoursMonFri or cs.openHoursSatSun
- BS-12.3 sanctioned-exception list closed (only TimeSelect24)
- BS-12.4 source-grep no TIME_SLOTS.map outside the 3 victim files (regression lock)

---

## Phase 9 — Verification (Rule N → full)

```bash
# Targeted (during iteration)
npm test -- --run tests/v53-open-hours-helpers.test.js
npm test -- --run tests/v53-open-hours-source-grep.test.js
npm test -- --run tests/v53-open-hours-flow-simulate.test.js
npm test -- --run tests/audit-branch-scope.test.js

# End-of-batch (Rule N override)
npm test -- --run
npm run build
```

Targeted scope grep — find tests that import affected components:
```bash
grep -rln "AppointmentCalendarView\|AppointmentFormModal\|ScheduleEntryFormModal" tests/
```

Run any matched files to verify no regressions (existing schedule/appointment tests use mocks; may need BranchProvider wrapper update — handle inline if surfaced).

---

## Phase 10 — Commit

Files staged explicitly per Rule V37:

```bash
git add \
  src/lib/scheduleFilterUtils.js \
  src/components/backend/AppointmentCalendarView.jsx \
  src/components/backend/AppointmentFormModal.jsx \
  src/components/backend/scheduling/ScheduleEntryFormModal.jsx \
  tests/v53-open-hours-helpers.test.js \
  tests/v53-open-hours-source-grep.test.js \
  tests/v53-open-hours-flow-simulate.test.js \
  tests/audit-branch-scope.test.js \
  .agents/skills/audit-branch-scope/SKILL.md \
  docs/superpowers/specs/2026-05-08-per-branch-open-hours-time-axis-design.md \
  docs/superpowers/plans/2026-05-08-per-branch-open-hours-time-axis.md \
  SESSION_HANDOFF.md \
  .agents/active.md \
  .claude/rules/00-session-start.md \
  .claude/rules/v-log-archive.md
```

```
git commit -m "feat(V53/BS-12): per-branch open hours drive time-axis everywhere

User report: 'ทำให้เวลาเปิด-ปิดของแต่ละสาขา มีผลกับตารางแพทย์ ตารางนัดหมาย
และ modal ที่จะไปดึงเวลานัดจากสาขานั้นทั้งหมด ... แค่เวลาที่เปิดเปิดคลินิก'

V51 already shipped per-branch openHours schema (settings.openHours.{monFri,
satSun}.{open,close}) but the canonical TIME_SLOTS axis (08:15-22:00) was
hardcoded in 3 surfaces:
- AppointmentCalendarView.jsx (canonical grid, lines 785-945)
- AppointmentFormModal.jsx (start/end pickers, lines 951-961)
- ScheduleEntryFormModal.jsx (start/end pickers, lines 168-184)

Fix:
- 3 NEW pure helpers in src/lib/scheduleFilterUtils.js:
  getOpenHoursForDate, getVisibleTimeSlotsForDate, isTimeOutsideOpenHours
- 3 victim files wired to canonical V53 pattern: useEffectiveClinicSettings +
  useMemo on cs.openHoursMonFri/SatSun + visibleSlots.map(...) replaces
  TIME_SLOTS.map(...)
- AppointmentCalendarView gains: closed-day banner + auto-expand for legacy
  appointments outside hours (Q1=A user choice) + orange chip on out-of-hours
  appt cards
- AppointmentFormModal: warning hint below pickers when selected time
  outside open hours (legacy edits)
- ScheduleEntryFormModal: same pattern

NEW audit invariant BS-12 (parallel to BS-9, BS-11):
- Every TIME_SLOTS importer must derive via getVisibleTimeSlotsForDate
- Sanctioned exception: TimeSelect24.jsx (settings picker, not appointments)
- 4 sub-tests in tests/audit-branch-scope.test.js

Test bank shipped (Rule N + Rule I):
- tests/v53-open-hours-helpers.test.js — 28 tests across L1-L3
- tests/v53-open-hours-source-grep.test.js — per-file regression locks
- tests/v53-open-hours-flow-simulate.test.js — 7 F1 scenarios with
  BranchProvider switch chain

Iron-clad rule trail:
- Rule J brainstorming HARD-GATE: spec written + user approved
- Rule P 7-step class-of-bug expansion: Tier 2 default + Tier 3 V-entry
- Rule N targeted-test-only during iteration; full vitest at batch end
- Rule I full-flow simulate via BranchProvider chain
- Rule of 3 — single helper module, 3 victim files leverage
- Rule V37 — git add explicit files only

Spec: docs/superpowers/specs/2026-05-08-per-branch-open-hours-time-axis-design.md
Plan: docs/superpowers/plans/2026-05-08-per-branch-open-hours-time-axis.md
V-entry: .claude/rules/v-log-archive.md V53 + 00-session-start § 2

NO DEPLOY — local + commits only. User authorizes vercel --prod separately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin master
```

---

## Phase 11 — State updates

- `.claude/rules/00-session-start.md` § 2 — V53 compact entry (single row)
- `.claude/rules/v-log-archive.md` — V53 verbose entry (mirror V52 style)
- `SESSION_HANDOFF.md` — current state: master = V53 commit, NOT yet deployed
- `.agents/active.md` — focus: V53 shipped; awaiting user wake-up + deploy authorization

---

## Phase 12 — Final autonomous report

```
✅ V53 COMPLETE — Per-branch open hours filter time-axis everywhere

State:
- master = <new-sha> (NOT yet deployed)
- 3 helpers + 3 victim files wired + BS-12 audit invariant locked
- 3 new test files + audit-branch-scope extended
- All targeted + full vitest green; build clean
- Spec + plan + V-entry committed

Verify yourself:
- Set branch openHours to 11:30-20:30 → AppointmentCalendarView grid renders
  only 11:30-20:30 rows; modal pickers show only those times
- Set open===close (closed day) → banner shows, save disabled
- Existing 09:00 appt with branch open 11:30 → grid auto-expands + orange chip

Awaiting deploy authorization. Say "deploy" if you want vercel --prod.
```

---

**Plan approved by:** User pre-authorization ("ok" → autonomous V52-style)
**Implementation:** autonomous, in single commit
**Estimated total work:** ~2-3 hours of edits + tests + verify
