# Phase 19.0 — Appointment 15-min slots + 4-type taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink appointment minimum slot from 30 → 15 min everywhere and replace 2-type taxonomy (`'sales'` / `'followup'`) with 4 types (`'deposit-booking'` / `'no-deposit-booking'` / `'treatment-in'` / `'follow-up'`) across storage, writers, readers, displays, reports, and the dev-only ProClinic translator.

**Architecture:** Single-source-of-truth modules (`src/lib/appointmentTypes.js` for type taxonomy + canonical `TIME_SLOTS` extended to 15-min in `src/lib/staffScheduleValidation.js`). Drop 3 local `TIME_SLOTS` copies (Rule of 3 collapse). `be_appointments` field-level migration via firebase-admin SDK script (Option B uniform: all legacy → `'no-deposit-booking'`). Read-side defensive fallback for the deploy ⇆ migration gap.

**Tech Stack:** React 19 + Vite 8 + Firebase Firestore + firebase-admin SDK (migration script). Tests: Vitest + Testing Library. Builds: `npm run build`. Deploy: `vercel --prod` + `firebase deploy --only firestore:rules` (Probe-Deploy-Probe Rule B).

**Spec:** [docs/superpowers/specs/2026-05-06-phase-19-0-appointment-15min-and-4types-design.md](docs/superpowers/specs/2026-05-06-phase-19-0-appointment-15min-and-4types-design.md)

**Project conventions:**
- **Rule K work-first-test-last** — implementation tasks 1-10 commit source only; test bank batched in Task 11; verification in Task 12-13 before deploy gate.
- **Frequent commits** — each source task is its own commit (no PR workflow on this repo; push direct to `master`).
- Direct work on `master` (matches recent session pattern; no worktree).
- After each commit: `git push origin master` immediately (project rule).
- Iron-clad B Probe-Deploy-Probe applies on V15 deploy (Task 14, user-triggered).
- All co-author attribution lines: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## File Structure

### New files (3 source + 9 test)

| Path | Responsibility |
|---|---|
| `src/lib/appointmentTypes.js` | SSOT — `APPOINTMENT_TYPES` const + `resolveAppointmentTypeLabel` / `resolveAppointmentTypeDefaultColor` / `migrateLegacyAppointmentType` / `isLegacyAppointmentType` helpers. Pure JS, no Firestore. |
| `api/proclinic/_lib/appointmentTypeProClinic.js` | Outgoing 4→2 translator for ProClinic dev-only sync. Pure JS. Marked `@dev-only` per H-bis strip. |
| `scripts/phase-19-0-migrate-appointment-types.mjs` | One-shot firebase-admin SDK migration. `--dry-run` default, `--apply` to commit. Audit doc to `be_admin_audit/`. |
| `tests/phase-19-0-appointment-types.test.js` | A1-A7 — type constant + resolvers + legacy detector |
| `tests/phase-19-0-time-slot-15min.test.js` | T1-T5 — canonical TIME_SLOTS shape + import-from-canonical guard |
| `tests/phase-19-0-appointment-form-defaults.test.js` | F1-F5 — form defaults + auto-bump endTime + RTL render |
| `tests/phase-19-0-deposit-creates-deposit-booking.test.js` | D1-D3 — DepositPanel writes `'deposit-booking'` |
| `tests/phase-19-0-aggregator-4types.test.js` | G1-G4 — report aggregator label/filter |
| `tests/phase-19-0-grid-15min-cell.test.jsx` | C1-C4 — SLOT_H halved, grid lines doubled, span calc, render |
| `tests/phase-19-0-migration-script.test.js` | M1-M6 — pure mapAppointmentType + audit-doc shape |
| `tests/phase-19-0-flow-simulate.test.js` | F1-F9 — Rule I full-flow simulate end-to-end |
| `tests/phase-19-0-proclinic-translator.test.js` | P1-P7 — 4→2 mapping + helper imported correctly |

### Modified files (~9 source)

| Path | Change |
|---|---|
| `src/lib/staffScheduleValidation.js` | TIME_SLOTS extends 30-min → 15-min (28 → 56 entries) |
| `src/components/backend/AppointmentTab.jsx` | Drop local TIME_SLOTS, halve `SLOT_H` 36→18, default endTime fallback `'10:30'`→`'10:15'` |
| `src/components/backend/AppointmentFormModal.jsx` | Drop local TIME_SLOTS + APPT_TYPES, swap defaults, import APPOINTMENT_TYPES, auto-bump endTime |
| `src/components/backend/DepositPanel.jsx` | Drop local TIME_SLOTS, default appointmentType `'sales'`→`'deposit-booking'` |
| `src/lib/appointmentReportAggregator.js` | Use `resolveAppointmentTypeLabel` instead of inline map; default unknown → `'no-deposit-booking'` |
| `src/components/backend/reports/AppointmentReportTab.jsx` | Replace 2-option dropdown with `APPOINTMENT_TYPES.map(...)` |
| `src/pages/AdminDashboard.jsx` | Replace inline `typeMap` with `resolveAppointmentTypeLabel` |
| `src/lib/appointmentDisplay.js` | Re-export `resolveAppointmentTypeLabel` + `resolveAppointmentTypeDefaultColor` for chip rendering convenience |
| `api/proclinic/appointment.js` | Import + use `mapAppointmentTypeForProClinic` translator at lines 30 + 195 |

### Untouched (verified out of scope)

- `src/lib/backendClient.js` — `SLOT_INTERVAL_MIN = 15` already shipped (AP1-bis V15 #14)
- `src/components/backend/scheduling/ScheduleEntryFormModal.jsx` — already imports canonical TIME_SLOTS
- `firestore.rules` — no field validation for `appointmentType`; v26 unchanged
- `api/proclinic/deposit.js` — already hardcoded `'sales'` outgoing
- `pc_*` mirror collections (frontend ProClinic display)
- AppointmentRoomColumns + ExamRoomsTab (Phase 18.0 done)

---

## Task 1: Create `src/lib/appointmentTypes.js` (SSOT module)

**Files:**
- Create: `src/lib/appointmentTypes.js`

- [ ] **Step 1: Create the module**

```javascript
// src/lib/appointmentTypes.js
//
// Phase 19.0 (2026-05-06) — Single source of truth for appointment-type
// taxonomy. Replaces the 2-value 'sales' / 'followup' enum scattered across
// AppointmentFormModal / AppointmentReportTab / AdminDashboard / aggregators.
//
// Pure JS — no Firestore, no React. Safe to import in tests, server,
// migration scripts, and UI.

/**
 * 4-value appointment-type taxonomy. Frozen.
 *
 * - value: storage key (string, written to be_appointments.appointmentType)
 * - label: Thai display label (rendered in dropdowns, chips, reports)
 * - defaultColor: per-type fallback color when admin doesn't pick
 *   appointmentColor explicitly. Must be one of APPT_COLORS values.
 * - order: stable display ordering (radio rows, dropdown rows)
 */
export const APPOINTMENT_TYPES = Object.freeze([
  Object.freeze({ value: 'deposit-booking',    label: 'จองมัดจำ',     defaultColor: 'เขียวอ่อน',    order: 0 }),
  Object.freeze({ value: 'no-deposit-booking', label: 'จองไม่มัดจำ',  defaultColor: 'ส้มอ่อน',      order: 1 }),
  Object.freeze({ value: 'treatment-in',       label: 'เข้าทำหัตถการ', defaultColor: 'น้ำเงินอ่อน',   order: 2 }),
  Object.freeze({ value: 'follow-up',          label: 'ติดตามอาการ',   defaultColor: 'เหลืองอ่อน',   order: 3 }),
]);

export const APPOINTMENT_TYPE_VALUES = Object.freeze(
  APPOINTMENT_TYPES.map((t) => t.value),
);

/** Default value for new appointments (Q2 lock). */
export const DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking';

/** Legacy values that may exist in be_appointments before migration. */
const LEGACY_TYPE_VALUES = Object.freeze(['sales', 'followup', 'follow', 'consult', 'treatment']);

/**
 * Resolve display label for an appointment-type value.
 * Unknown / null / legacy values fall back to the DEFAULT_APPOINTMENT_TYPE
 * label (defensive — handles deploy-before-migration window).
 *
 * @param {string|null|undefined} value
 * @returns {string} Thai display label
 */
export function resolveAppointmentTypeLabel(value) {
  const match = APPOINTMENT_TYPES.find((t) => t.value === value);
  if (match) return match.label;
  const fallback = APPOINTMENT_TYPES.find((t) => t.value === DEFAULT_APPOINTMENT_TYPE);
  return fallback ? fallback.label : '';
}

/**
 * Resolve per-type default color for chip rendering.
 * Unknown values fall back to default-type color.
 *
 * @param {string|null|undefined} value
 * @returns {string} color name (one of APPT_COLORS)
 */
export function resolveAppointmentTypeDefaultColor(value) {
  const match = APPOINTMENT_TYPES.find((t) => t.value === value);
  if (match) return match.defaultColor;
  const fallback = APPOINTMENT_TYPES.find((t) => t.value === DEFAULT_APPOINTMENT_TYPE);
  return fallback ? fallback.defaultColor : '';
}

/**
 * Detect a legacy 2-type or ProClinic-imported value.
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export function isLegacyAppointmentType(value) {
  if (value == null || value === '') return true; // null / empty also counts as needing migration
  return LEGACY_TYPE_VALUES.includes(value);
}

/**
 * Migrate a legacy value to the new 4-type taxonomy.
 *
 * Phase 19.0 Q1 = Option B Uniform: ALL legacy values → DEFAULT_APPOINTMENT_TYPE.
 * Idempotent: passes through any value already in the 4-type set.
 *
 * @param {string|null|undefined} value
 * @returns {string} one of APPOINTMENT_TYPE_VALUES
 */
export function migrateLegacyAppointmentType(value) {
  if (APPOINTMENT_TYPE_VALUES.includes(value)) return value;
  return DEFAULT_APPOINTMENT_TYPE;
}
```

- [ ] **Step 2: Verify module loads**

Run:
```
node -e "import('./src/lib/appointmentTypes.js').then(m => { console.log('VALUES=', m.APPOINTMENT_TYPE_VALUES); console.log('DEFAULT=', m.DEFAULT_APPOINTMENT_TYPE); console.log('label sales=', m.resolveAppointmentTypeLabel('sales')); console.log('label deposit-booking=', m.resolveAppointmentTypeLabel('deposit-booking')); console.log('migrate sales=', m.migrateLegacyAppointmentType('sales')); console.log('migrate follow-up=', m.migrateLegacyAppointmentType('follow-up')); })"
```
Expected:
```
VALUES= ['deposit-booking', 'no-deposit-booking', 'treatment-in', 'follow-up']
DEFAULT= no-deposit-booking
label sales= จองไม่มัดจำ
label deposit-booking= จองมัดจำ
migrate sales= no-deposit-booking
migrate follow-up= follow-up
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/appointmentTypes.js
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-1): SSOT appointmentTypes.js — 4-type taxonomy

NEW src/lib/appointmentTypes.js — single source of truth for the
appointment-type taxonomy. Replaces 2-value 'sales' / 'followup'
enum scattered across 6+ files.

Exports:
- APPOINTMENT_TYPES (frozen array of 4 entries with value/label/color/order)
- APPOINTMENT_TYPE_VALUES (frozen array of 4 string values)
- DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking' (Q2 lock)
- resolveAppointmentTypeLabel(value) — Thai display
- resolveAppointmentTypeDefaultColor(value) — APPT_COLORS member
- isLegacyAppointmentType(value) — detects sales/followup/follow/consult/treatment/null
- migrateLegacyAppointmentType(value) — Option B uniform: all legacy → DEFAULT

Pure JS, no Firestore, no React. Safe for tests / server / scripts / UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 2: Extend `staffScheduleValidation.js` TIME_SLOTS to 15-min

**Files:**
- Modify: `src/lib/staffScheduleValidation.js:53-64`

- [ ] **Step 1: Replace the IIFE in TIME_SLOTS**

Open `src/lib/staffScheduleValidation.js`. Replace lines 53-64 (the `TIME_SLOTS` Object.freeze IIFE).

Old:
```javascript
// Canonical 30-min time slot list — matches ProClinic dropdown (08:30-22:00).
export const TIME_SLOTS = Object.freeze((() => {
  const slots = [];
  for (let h = 8; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 8 && m === 0) continue; // start at 08:30
      if (h === 22 && m === 30) continue; // end at 22:00
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
})());
```

New:
```javascript
// Phase 19.0 (2026-05-06) — canonical 15-min time slot list
// (08:15-22:00). Was 30-min (08:30-22:00, 28 entries) prior to Phase 19.0.
// Now 56 entries. Aligned with backendClient.SLOT_INTERVAL_MIN = 15
// (AP1-bis schema-based reservation). Imported by AppointmentTab,
// AppointmentFormModal, DepositPanel, ScheduleEntryFormModal — replacing
// 3 prior local copies (Rule of 3 collapse).
export const SLOT_INTERVAL_MIN_DISPLAY = 15;
export const TIME_SLOTS = Object.freeze((() => {
  const slots = [];
  for (let h = 8; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 8 && m === 0) continue; // start at 08:15
      if (h === 22 && (m === 15 || m === 30 || m === 45)) continue; // end at 22:00
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
})());
```

- [ ] **Step 2: Smoke verify shape**

Run:
```
node -e "import('./src/lib/staffScheduleValidation.js').then(m => { console.log('LEN=', m.TIME_SLOTS.length); console.log('FIRST=', m.TIME_SLOTS[0]); console.log('LAST=', m.TIME_SLOTS[m.TIME_SLOTS.length-1]); console.log('INTERVAL=', m.SLOT_INTERVAL_MIN_DISPLAY); })"
```
Expected:
```
LEN= 56
FIRST= 08:15
LAST= 22:00
INTERVAL= 15
```

- [ ] **Step 3: Build verify**

Run:
```
npm run build
```
Expected: clean build (no broken imports). Note: existing `staffScheduleValidation.js` consumers (ScheduleEntryFormModal) use TIME_SLOTS as a string array — shape unchanged, just length doubled.

- [ ] **Step 4: Commit**

```bash
git add src/lib/staffScheduleValidation.js
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-2): canonical TIME_SLOTS 15-min (28 → 56 entries)

src/lib/staffScheduleValidation.js TIME_SLOTS extended from 30-min
(08:30-22:00, 28 entries) to 15-min (08:15-22:00, 56 entries).

Aligned with backendClient.SLOT_INTERVAL_MIN = 15 (AP1-bis schema).
Sets up Rule of 3 collapse — AppointmentTab/Modal/DepositPanel will
drop local copies in Tasks 4-6 and import this canonical instead.

NEW export SLOT_INTERVAL_MIN_DISPLAY = 15 (UI-side mirror of the
backend slot interval constant).

ScheduleEntryFormModal already imports canonical TIME_SLOTS — no
edit needed; auto-flows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 3: Create `api/proclinic/_lib/appointmentTypeProClinic.js` translator

**Files:**
- Create: `api/proclinic/_lib/appointmentTypeProClinic.js`

- [ ] **Step 1: Create the helper**

```javascript
// api/proclinic/_lib/appointmentTypeProClinic.js
//
// @dev-only — STRIP BEFORE PRODUCTION RELEASE (rule H-bis)
//
// Phase 19.0 (2026-05-06) — outgoing 4→2 translator for ProClinic dev-only
// sync. ProClinic only knows 'sales' and 'followup'. Our 4-type taxonomy
// gets compressed for outgoing PATCH bodies in api/proclinic/appointment.js.
// Same payload-shape as before; just a value swap on the way out.
//
// Pure JS, no Firestore. Safe to import in serverless handlers + tests.

/**
 * Map our 4-type taxonomy to the 2-type taxonomy ProClinic supports.
 *
 * - 'follow-up' → 'followup' (semantic match: post-care follow-up)
 * - 'deposit-booking' / 'no-deposit-booking' / 'treatment-in' → 'sales'
 *   (all are revenue-bearing or sales-funnel bookings; ProClinic categorizes
 *   these as 'sales')
 * - unknown / null / legacy values → 'sales' (defensive default)
 *
 * @param {string|null|undefined} type our internal appointmentType value
 * @returns {'sales'|'followup'} ProClinic-compatible value
 */
export function mapAppointmentTypeForProClinic(type) {
  if (type === 'follow-up') return 'followup';
  return 'sales';
}
```

- [ ] **Step 2: Smoke verify**

Run:
```
node -e "import('./api/proclinic/_lib/appointmentTypeProClinic.js').then(m => { console.log('deposit-booking→', m.mapAppointmentTypeForProClinic('deposit-booking')); console.log('no-deposit-booking→', m.mapAppointmentTypeForProClinic('no-deposit-booking')); console.log('treatment-in→', m.mapAppointmentTypeForProClinic('treatment-in')); console.log('follow-up→', m.mapAppointmentTypeForProClinic('follow-up')); console.log('null→', m.mapAppointmentTypeForProClinic(null)); console.log('sales-legacy→', m.mapAppointmentTypeForProClinic('sales')); })"
```
Expected:
```
deposit-booking→ sales
no-deposit-booking→ sales
treatment-in→ sales
follow-up→ followup
null→ sales
sales-legacy→ sales
```

- [ ] **Step 3: Commit**

```bash
git add api/proclinic/_lib/appointmentTypeProClinic.js
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-3): ProClinic 4→2 type translator (dev-only)

NEW api/proclinic/_lib/appointmentTypeProClinic.js — pure helper
mapping our 4-type taxonomy to ProClinic's 2-type enum for outgoing
PATCH payloads.

- 'follow-up' → 'followup'
- 'deposit-booking' / 'no-deposit-booking' / 'treatment-in' → 'sales'
- unknown / legacy → 'sales' (defensive)

Marked @dev-only — STRIP BEFORE PRODUCTION RELEASE per rule H-bis.

Wired into api/proclinic/appointment.js in Task 9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 4: Refactor `AppointmentFormModal.jsx`

**Files:**
- Modify: `src/components/backend/AppointmentFormModal.jsx:55-77` (drop local TIME_SLOTS + APPT_TYPES)
- Modify: `src/components/backend/AppointmentFormModal.jsx:79-107` (`defaultFormData` defaults)
- Modify: `src/components/backend/AppointmentFormModal.jsx:177-220` (edit-mode existingAppointment loader)
- Modify: `src/components/backend/AppointmentFormModal.jsx:557` (radio value reference)
- Modify: `src/components/backend/AppointmentFormModal.jsx` (import line — top of file)

- [ ] **Step 1: Replace top-of-file imports + constant block**

Find the imports block + constants block (lines 50-77). Replace the constants block to drop local TIME_SLOTS + APPT_TYPES.

Add to imports:
```javascript
import {
  APPOINTMENT_TYPES,
  DEFAULT_APPOINTMENT_TYPE,
} from '../../lib/appointmentTypes.js';
import { TIME_SLOTS } from '../../lib/staffScheduleValidation.js';
```

Delete (lines 55-77):
```javascript
// Constants — duplicated from AppointmentTab (will collapse into a shared
// constants module in a follow-up Rule-of-3 sweep). Keep values identical.
const CHANNELS = ['เคาน์เตอร์','โทรศัพท์','Walk-in','Facebook','Instagram','TikTok','Line','อื่นๆ'];
const APPT_TYPES = [{ value: 'sales', label: 'ขาย' }, { value: 'followup', label: 'ติดตาม' }];
...
const TIME_SLOTS = [];
for (let h = 8; h <= 22; h++) {
  for (let m = 0; m < 60; m += 30) {
    if (h === 8 && m === 0) continue;
    TIME_SLOTS.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }
}
```

Replace with:
```javascript
// Phase 19.0 (2026-05-06) — TIME_SLOTS imported from canonical
// staffScheduleValidation; APPT_TYPES replaced by APPOINTMENT_TYPES SSOT.
// CHANNELS + STATUSES + APPT_COLORS retained locally (no SSOT yet).
const CHANNELS = ['เคาน์เตอร์','โทรศัพท์','Walk-in','Facebook','Instagram','TikTok','Line','อื่นๆ'];
const APPT_COLORS = ['ใช้สีเริ่มต้น','เหลืองอ่อน','เขียวอ่อน','ส้มอ่อน','แดงอ่อน','น้ำตาลอ่อน','ชมพูอ่อน','ม่วงอ่อน','น้ำเงินอ่อน'];
const STATUSES = [
  { value: 'pending',   label: 'รอยืนยัน' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'done',      label: 'เสร็จแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
];
```

(Keeping CHANNELS, APPT_COLORS, STATUSES; deleting only the TIME_SLOTS local generator + APPT_TYPES local array.)

- [ ] **Step 2: Update `defaultFormData` defaults**

Find `defaultFormData` (line 79). Update:

Old (line 82-85):
```javascript
    startTime: '10:00',
    endTime: '10:30',
    customerId: '', customerName: '', customerHN: '',
    appointmentType: 'sales',
```

New:
```javascript
    startTime: '10:00',
    endTime: '10:15',  // Phase 19.0 — default 15-min duration
    customerId: '', customerName: '', customerHN: '',
    appointmentType: DEFAULT_APPOINTMENT_TYPE,  // Phase 19.0 — 'no-deposit-booking'
```

- [ ] **Step 3: Update edit-mode loader fallback (line 177)**

Find the edit-mode loader where `formData` is initialized from `appt`. The legacy default `'sales'` becomes `DEFAULT_APPOINTMENT_TYPE`:

Old (line 177):
```javascript
        appointmentType: appt.appointmentType || 'sales',
```

New:
```javascript
        appointmentType: appt.appointmentType || DEFAULT_APPOINTMENT_TYPE,
```

- [ ] **Step 4: Update save-payload fallback (line 408)**

Find the save handler where the payload is built:

Old (line 408):
```javascript
        appointmentType: formData.appointmentType || 'sales',
```

New:
```javascript
        appointmentType: formData.appointmentType || DEFAULT_APPOINTMENT_TYPE,
```

- [ ] **Step 5: Update endTime fallback (initialEndTime branch)**

Find line 206 — the endTime fallback when initialStartTime present but initialEndTime absent:

Old:
```javascript
      endTime: initialEndTime || (initialStartTime ? (TIME_SLOTS[TIME_SLOTS.indexOf(initialStartTime) + 1] || initialStartTime) : '10:30'),
```

New:
```javascript
      endTime: initialEndTime || (initialStartTime ? (TIME_SLOTS[TIME_SLOTS.indexOf(initialStartTime) + 1] || initialStartTime) : '10:15'),
```

(`TIME_SLOTS[idx + 1]` now advances 15 min instead of 30 — semantics correct after canonical swap.)

- [ ] **Step 6: Update appointment-type radio rendering**

Find line 557 (the radio block — `formData.appointmentType === t.value`). The map source needs to change from `APPT_TYPES` to `APPOINTMENT_TYPES`. The shape is `{value, label}` for both, so the JSX body is unchanged.

Search for the JSX block (typically around line 553-560):
```javascript
            {APPT_TYPES.map(t => (
              <label key={t.value} ...>
                <input type="radio" checked={formData.appointmentType === t.value} onChange={() => update({ appointmentType: t.value })} className="accent-sky-500" />{t.label}
              </label>
            ))}
```

Replace `APPT_TYPES` with `APPOINTMENT_TYPES` (single token swap; props identical).

- [ ] **Step 7: Add startTime auto-bump (Q3 lock — auto-advance endTime when admin changes startTime without touching endTime)**

Find the `update` callback that handles formData changes. Add an auto-bump effect — when admin changes `startTime` and `endTime` was the previous default-or-untouched, auto-advance `endTime` by 15 min.

Find the place where `update` is defined (a callback or inline handler). If `update` is a setter `update({startTime: x})`, intercept changes:

Search for: `function update(` or `const update = (`

Replace the function body:
```javascript
  const update = (patch) => {
    setFormData((prev) => {
      const next = { ...prev, ...patch };
      // Phase 19.0 — when admin changes startTime and endTime is still
      // a +15 distance from the prior startTime, auto-advance endTime
      // to keep the +15 default. Admin-edited endTime (where the gap
      // is anything other than +15) is preserved.
      if (Object.prototype.hasOwnProperty.call(patch, 'startTime') && !Object.prototype.hasOwnProperty.call(patch, 'endTime')) {
        const prevStartIdx = TIME_SLOTS.indexOf(prev.startTime);
        const prevEndIdx = TIME_SLOTS.indexOf(prev.endTime);
        if (prevStartIdx >= 0 && prevEndIdx === prevStartIdx + 1) {
          // endTime was at +15 (default gap); auto-advance to maintain
          const nextStartIdx = TIME_SLOTS.indexOf(next.startTime);
          if (nextStartIdx >= 0) {
            next.endTime = TIME_SLOTS[nextStartIdx + 1] || next.startTime;
          }
        }
      }
      return next;
    });
  };
```

(If `update` is implemented differently in this file, adapt the same intent — preserve admin's endTime delta unless still at +15 default.)

- [ ] **Step 8: Build verify**

Run:
```
npm run build
```
Expected: clean build.

- [ ] **Step 9: Commit**

```bash
git add src/components/backend/AppointmentFormModal.jsx
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-4): AppointmentFormModal — 15-min slots + 4-type SSOT

Drop local TIME_SLOTS (was 30-min duplicate) + local APPT_TYPES
(was 2-value array). Import canonical TIME_SLOTS from
staffScheduleValidation.js + APPOINTMENT_TYPES + DEFAULT_APPOINTMENT_TYPE
from new appointmentTypes.js SSOT.

Defaults updated:
- defaultFormData.endTime: '10:30' → '10:15' (15-min duration)
- defaultFormData.appointmentType: 'sales' → 'no-deposit-booking'
- save-payload + edit-loader fallbacks: 'sales' → DEFAULT_APPOINTMENT_TYPE

Auto-bump endTime on startTime change when admin hasn't manually
edited the endTime gap (preserves +15 default; admin-customized gap
is preserved).

Closes Rule of 3 #1 of 3 (3 local TIME_SLOTS copies → 1 canonical).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 5: Refactor `AppointmentTab.jsx`

**Files:**
- Modify: `src/components/backend/AppointmentTab.jsx:53` (`SLOT_H` constant)
- Modify: `src/components/backend/AppointmentTab.jsx:55-62` (drop local TIME_SLOTS)
- Modify: `src/components/backend/AppointmentTab.jsx:385` (default endTime fallback)
- Modify: `src/components/backend/AppointmentTab.jsx` (imports — top of file)

- [ ] **Step 1: Add canonical TIME_SLOTS import**

Find the imports section near top (after the existing imports). Add:

```javascript
import { TIME_SLOTS } from '../../lib/staffScheduleValidation.js';
```

(Other imports likely already import other helpers from `../../lib/`.)

- [ ] **Step 2: Drop local TIME_SLOTS + halve SLOT_H**

Find lines 53-62. Replace:

Old:
```javascript
const SLOT_H = 36; // px per 30-min slot

// Generate time slots 08:30 - 22:30 (30-min)
const TIME_SLOTS = [];
for (let h = 8; h <= 22; h++) {
  for (let m = 0; m < 60; m += 30) {
    if (h === 8 && m === 0) continue;
    TIME_SLOTS.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }
}
```

New:
```javascript
// Phase 19.0 (2026-05-06) — SLOT_H halved to 18 (was 36 per 30-min); 15-min
// canonical TIME_SLOTS imported from staffScheduleValidation. Total grid
// pixel-height preserved (28 rows × 36 = 1008; 56 rows × 18 = 1008).
const SLOT_H = 18; // px per 15-min slot
```

(`TIME_SLOTS` now imported from canonical; local generator removed entirely. Span calculations like `(endIdx - startIdx) * SLOT_H` keep working — same span in pixels because each appointment's index distance doubles AND SLOT_H halves, net unchanged.)

- [ ] **Step 3: Update default endTime fallback (line 385)**

Find:
```javascript
      initialEndTime: time ? (TIME_SLOTS[TIME_SLOTS.indexOf(time) + 1] || time) : '10:30',
```

Replace with:
```javascript
      initialEndTime: time ? (TIME_SLOTS[TIME_SLOTS.indexOf(time) + 1] || time) : '10:15',
```

(`TIME_SLOTS[idx + 1]` semantics preserve — was `+30 min`, now `+15 min`. The hardcoded fallback when `time` is empty was `'10:30'` (+30 from a default 10:00 start), now `'10:15'` (+15).)

- [ ] **Step 4: Build verify + render smoke**

Run:
```
npm run build
```
Expected: clean.

(The `TIME_SLOTS.map` rendering at line 575 + span calc at lines 584-585 work unchanged because the underlying array is identical-shape, just longer.)

- [ ] **Step 5: Commit**

```bash
git add src/components/backend/AppointmentTab.jsx
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-5): AppointmentTab — 15-min grid + canonical TIME_SLOTS

Drop local TIME_SLOTS 30-min generator, import canonical 15-min
TIME_SLOTS from staffScheduleValidation. Halve SLOT_H 36 → 18 px so
total grid pixel-height stays equivalent (was 28 rows × 36 = 1008;
now 56 rows × 18 = 1008).

Span calculations unchanged — each appointment's TIME_SLOTS index
distance doubles AND SLOT_H halves, net pixel-span identical.

Default endTime fallback when 'time' empty: '10:30' → '10:15'.

Closes Rule of 3 #2 of 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 6: Refactor `DepositPanel.jsx`

**Files:**
- Modify: `src/components/backend/DepositPanel.jsx:51-55` (drop local TIME_SLOTS)
- Modify: `src/components/backend/DepositPanel.jsx` (deposit→appt save path — search for `appointmentType: 'sales'`)
- Modify: `src/components/backend/DepositPanel.jsx` (imports)

- [ ] **Step 1: Add canonical imports**

Find the imports section. Add:
```javascript
import { TIME_SLOTS } from '../../lib/staffScheduleValidation.js';
```

- [ ] **Step 2: Drop local TIME_SLOTS**

Find lines 51-55. Delete the local generator block:
```javascript
const TIME_SLOTS = [];
for (let h = 8; h <= 22; h++) {
  for (let mm = 0; mm < 60; mm += 30) {
    if (h === 8 && mm === 0) continue;
    TIME_SLOTS.push(`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`);
  }
}
```

(After the canonical import at top of file, the local declaration disappears. Two `TIME_SLOTS.map(...)` consumers at lines 846 + 852 keep working unchanged.)

- [ ] **Step 3: Change deposit→appt default type**

Search for `appointmentType: 'sales'` in DepositPanel.jsx (likely in the deposit-with-appointment handler). Replace with:
```javascript
appointmentType: 'deposit-booking',
```

If multiple occurrences exist, replace all that are inside the deposit→appointment payload builder.

Verification grep:
```
grep -n "appointmentType:" src/components/backend/DepositPanel.jsx
```
Expected: only `'deposit-booking'` strings in `appointmentType:` assignments inside payload builders. Zero `'sales'` literals.

- [ ] **Step 4: Build verify**

Run:
```
npm run build
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/backend/DepositPanel.jsx
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-6): DepositPanel — 15-min slots + 'deposit-booking' type

Drop local TIME_SLOTS 30-min generator (matched lint of
AppointmentTab/Modal), import canonical 15-min TIME_SLOTS from
staffScheduleValidation.

Deposit-with-appointment flow now writes appointmentType: 'deposit-booking'
(was 'sales'). Aligns with Phase 19.0 4-type taxonomy: deposit-bound
bookings get the 'deposit-booking' label going forward.

Closes Rule of 3 #3 of 3 — all 3 local TIME_SLOTS copies eliminated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 7: Update `appointmentReportAggregator.js` + `AppointmentReportTab.jsx`

**Files:**
- Modify: `src/lib/appointmentReportAggregator.js:36-90` (deriveTypeLabel + filter)
- Modify: `src/components/backend/reports/AppointmentReportTab.jsx:52-53` (filter dropdown)

- [ ] **Step 1: Update aggregator to use SSOT resolver**

Open `src/lib/appointmentReportAggregator.js`. Find around line 36 (the `deriveTypeLabel` comment) + line 88 (`raw = (appt?.appointmentType || 'sales').trim()`).

Find the existing label-derivation logic. Replace inline mapping with the SSOT resolver:

Add at top (imports section):
```javascript
import { resolveAppointmentTypeLabel, DEFAULT_APPOINTMENT_TYPE } from './appointmentTypes.js';
```

Find the `deriveTypeLabel` function or wherever the appt-type label is computed. Replace its body with:
```javascript
function deriveTypeLabel(appt) {
  const value = appt?.appointmentType;
  return resolveAppointmentTypeLabel(value);  // unknown → DEFAULT label
}
```

Find line 88 (or wherever `raw = ... 'sales'` fallback exists) and replace:
Old:
```javascript
  const raw = (appt?.appointmentType || 'sales').trim();
```

New:
```javascript
  const raw = (appt?.appointmentType || DEFAULT_APPOINTMENT_TYPE).trim();
```

Find line 126 — same pattern in row builder:
Old:
```javascript
    appointmentType: a.appointmentType || 'sales',
```

New:
```javascript
    appointmentType: a.appointmentType || DEFAULT_APPOINTMENT_TYPE,
```

- [ ] **Step 2: Update report filter dropdown**

Open `src/components/backend/reports/AppointmentReportTab.jsx`. Find lines 52-53 (the filter options array):

Old:
```javascript
  { v: 'sales',    t: 'นัดเพื่อขาย' },
  { v: 'followup', t: 'นัดติดตาม' },
```

Find the surrounding array (likely const TYPE_FILTER_OPTIONS or similar). Replace inline literal with SSOT-derived options:

Add at top (imports):
```javascript
import { APPOINTMENT_TYPES } from '../../../lib/appointmentTypes.js';
```

Replace the array literal entirely:
```javascript
// Phase 19.0 — filter options derived from APPOINTMENT_TYPES SSOT.
const TYPE_FILTER_OPTIONS = APPOINTMENT_TYPES.map((t) => ({ v: t.value, t: t.label }));
```

(Adjust path depth `../../../lib/` if file location differs. Adjust variable name if existing literal had a different identifier — keep consumer line `TYPE_FILTER_OPTIONS.map(...)` intact.)

- [ ] **Step 3: Build verify**

Run:
```
npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/appointmentReportAggregator.js src/components/backend/reports/AppointmentReportTab.jsx
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-7): aggregator + report tab — 4-type SSOT

src/lib/appointmentReportAggregator.js: deriveTypeLabel now delegates
to resolveAppointmentTypeLabel from appointmentTypes.js SSOT. Default
fallback when appointmentType missing/null is now
DEFAULT_APPOINTMENT_TYPE ('no-deposit-booking') instead of legacy 'sales'.

src/components/backend/reports/AppointmentReportTab.jsx: replace
2-element inline filter dropdown ([sales, followup]) with the 4
APPOINTMENT_TYPES values mapped to dropdown shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 8: Update `AdminDashboard.jsx` typeMap + `appointmentDisplay.js`

**Files:**
- Modify: `src/pages/AdminDashboard.jsx:5353` (typeMap inline)
- Modify: `src/lib/appointmentDisplay.js` (extend with re-export)

- [ ] **Step 1: Extend `appointmentDisplay.js` with type-resolver re-export**

Open `src/lib/appointmentDisplay.js`. Append to the bottom of the file (after `buildDoctorMap`):

```javascript
// Phase 19.0 (2026-05-06) — re-export type-resolution helpers from
// appointmentTypes.js so chip-rendering callers (AppointmentTab,
// CustomerDetailView, AdminDashboard) have a single import surface.
export {
  resolveAppointmentTypeLabel,
  resolveAppointmentTypeDefaultColor,
  APPOINTMENT_TYPES,
  DEFAULT_APPOINTMENT_TYPE,
} from './appointmentTypes.js';
```

(File top now has the existing helpers; bottom adds the re-export. Single-import convenience for consumers.)

- [ ] **Step 2: Replace AdminDashboard typeMap**

Open `src/pages/AdminDashboard.jsx`. Find line 5353:

Old:
```javascript
                      const typeMap = { follow: 'ติดตาม', sales: 'ขาย', consult: 'ปรึกษา', treatment: 'รักษา' };
```

Replace with import + helper call. Add import at top of file (search for existing imports from `../lib/appointmentDisplay.js` — add to the existing import line if present; else add new):

```javascript
import { resolveAppointmentTypeLabel } from '../lib/appointmentDisplay.js';
```

Then replace line 5353 (the inline typeMap declaration block) — delete the line entirely. Find the consumer (line 5383):

Old:
```javascript
                                  <span className="text-[11px] bg-sky-950/40 text-sky-400 border border-sky-900/40 px-1.5 py-0.5 rounded font-bold">{typeMap[appt.appointmentType] || appt.appointmentType}</span>
```

New:
```javascript
                                  <span className="text-[11px] bg-sky-950/40 text-sky-400 border border-sky-900/40 px-1.5 py-0.5 rounded font-bold">{resolveAppointmentTypeLabel(appt.appointmentType)}</span>
```

(Defensive — `resolveAppointmentTypeLabel` falls back to DEFAULT label for unknown values, including legacy `'sales'`/`'followup'`/`'follow'`/`'consult'`/`'treatment'`/null. After migration `--apply`, all values are 4-new; before migration, defensive label still renders sane.)

If line 5632 also references `appt.appointmentType` directly with the same pattern, leave it (just renders the raw value as a tiny badge).

- [ ] **Step 3: Build verify**

Run:
```
npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/appointmentDisplay.js src/pages/AdminDashboard.jsx
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-8): AdminDashboard typeMap → SSOT resolveAppointmentTypeLabel

src/lib/appointmentDisplay.js: re-exports resolveAppointmentTypeLabel +
resolveAppointmentTypeDefaultColor + APPOINTMENT_TYPES +
DEFAULT_APPOINTMENT_TYPE from appointmentTypes.js — single import
surface for chip-rendering consumers.

src/pages/AdminDashboard.jsx: replace inline 4-key typeMap (follow /
sales / consult / treatment) with resolveAppointmentTypeLabel(...)
call. Legacy values still render sane via DEFAULT fallback during
deploy ⇆ migration window.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 9: Update `api/proclinic/appointment.js` to use translator

**Files:**
- Modify: `api/proclinic/appointment.js:30,195` (outgoing payload type translation)

- [ ] **Step 1: Add translator import**

Open `api/proclinic/appointment.js`. Find the imports block at top of file. Add:

```javascript
import { mapAppointmentTypeForProClinic } from './_lib/appointmentTypeProClinic.js';
```

- [ ] **Step 2: Update line 30 (createBookedAppointment payload)**

Find:
```javascript
  params.set('appointment_type', appointment.appointmentType || 'sales');
```

Replace with:
```javascript
  // Phase 19.0 — translate 4-type → 2-type for ProClinic; rule H-bis @dev-only
  params.set('appointment_type', mapAppointmentTypeForProClinic(appointment.appointmentType));
```

- [ ] **Step 3: Update line 195 (updateAppointment payload)**

Find:
```javascript
  params.set('appointment_type', existingData.appointment_type || 'sales');
```

Replace with:
```javascript
  // Phase 19.0 — translate 4-type → 2-type for ProClinic; rule H-bis @dev-only
  params.set('appointment_type', mapAppointmentTypeForProClinic(existingData.appointment_type || existingData.appointmentType));
```

(Note: `existingData` here is a ProClinic-side scrape result — its keys may use snake_case `appointment_type` or our camelCase `appointmentType`. Defensive accept either.)

- [ ] **Step 4: Build verify**

Run:
```
npm run build
```
Expected: clean (api/ files build clean independent of src/).

- [ ] **Step 5: Commit**

```bash
git add api/proclinic/appointment.js
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-9): api/proclinic/appointment.js — 4→2 type translator

api/proclinic/appointment.js lines 30 + 195 now route outgoing
appointment_type via mapAppointmentTypeForProClinic. Both payload
build sites (createBookedAppointment + updateAppointment) translate
our 4-type taxonomy down to ProClinic's 2-value enum.

api/proclinic/deposit.js untouched — already hardcoded 'sales'
outgoing; deposit→appt now creates 'deposit-booking' which maps
to 'sales' via translator anyway, so payload identical.

Both files marked @dev-only — STRIP BEFORE PRODUCTION RELEASE
(rule H-bis).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 10: Create migration script

**Files:**
- Create: `scripts/phase-19-0-migrate-appointment-types.mjs`

- [ ] **Step 1: Read predecessor migration script for format reference**

Run:
```
ls scripts/phase-18-0-seed-exam-rooms.mjs
```
Expected: file exists. Read it for the established conventions (firebase-admin init, dry-run vs apply, audit-doc shape, exit code pattern).

- [ ] **Step 2: Create the migration script**

```javascript
// scripts/phase-19-0-migrate-appointment-types.mjs
//
// Phase 19.0 (2026-05-06) — migrate be_appointments.appointmentType from the
// 2-value legacy taxonomy ('sales' / 'followup' / 'follow' / 'consult' /
// 'treatment' / null) to the new 4-type taxonomy.
//
// Q1 lock = Option B Uniform: ALL legacy values → 'no-deposit-booking'.
// Admin re-classifies per appointment manually post-migration.
//
// Usage:
//   node scripts/phase-19-0-migrate-appointment-types.mjs           # dry-run (default)
//   node scripts/phase-19-0-migrate-appointment-types.mjs --apply   # commit writes
//
// Idempotent: re-runs after --apply yield 0 writes.
// Audit doc: be_admin_audit/phase-19-0-migrate-appointment-types-<ts>-<rand>

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

// ─── Constants ─────────────────────────────────────────────────────────────
const APPOINTMENT_TYPE_VALUES = ['deposit-booking', 'no-deposit-booking', 'treatment-in', 'follow-up'];
const DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking';
const APPT_COLLECTION = 'be_appointments';
const AUDIT_COLLECTION = 'be_admin_audit';

// ─── CLI args ──────────────────────────────────────────────────────────────
const apply = process.argv.includes('--apply');
const dryRun = !apply;

// ─── Helpers ───────────────────────────────────────────────────────────────
function mapAppointmentType(value) {
  if (APPOINTMENT_TYPE_VALUES.includes(value)) return value;
  return DEFAULT_APPOINTMENT_TYPE;
}

function randHex(n = 8) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

// ─── Firebase init ─────────────────────────────────────────────────────────
function initFirebase() {
  if (getApps().length > 0) return;
  const credPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH || process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (!credPath) {
    console.error('FATAL — set FIREBASE_ADMIN_CREDENTIALS_PATH or FIREBASE_ADMIN_CREDENTIALS_JSON env var.');
    process.exit(1);
  }
  const credText = credPath.startsWith('{') ? credPath : readFileSync(credPath, 'utf8');
  const cred = JSON.parse(credText);
  initializeApp({ credential: cert(cred) });
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[phase-19-0] mode = ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  initFirebase();
  const db = getFirestore();

  console.log(`[phase-19-0] scanning ${APPT_COLLECTION}…`);
  const snap = await db.collection(APPT_COLLECTION).get();
  console.log(`[phase-19-0] scanned ${snap.size} appts`);

  const beforeDist = {};
  const afterDist = {};
  const toMigrate = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const before = data.appointmentType ?? null;
    beforeDist[String(before)] = (beforeDist[String(before)] || 0) + 1;

    const after = mapAppointmentType(before);
    afterDist[after] = (afterDist[after] || 0) + 1;

    // Skip if value already in new taxonomy AND no migration mark needed
    if (APPOINTMENT_TYPE_VALUES.includes(before)) continue;

    toMigrate.push({ id: doc.id, before, after });
  }

  console.log('[phase-19-0] before-distribution:', beforeDist);
  console.log('[phase-19-0] after-distribution:', afterDist);
  console.log(`[phase-19-0] would-migrate: ${toMigrate.length}`);
  console.log(`[phase-19-0] would-skip (already new shape): ${snap.size - toMigrate.length}`);

  if (dryRun) {
    console.log('[phase-19-0] DRY-RUN — no writes. Re-run with --apply to commit.');
    process.exit(0);
  }

  if (toMigrate.length === 0) {
    console.log('[phase-19-0] APPLY — 0 docs to migrate (idempotent re-run).');
    process.exit(0);
  }

  // Batch writes: Firestore caps batch size at 500 ops. Each appt = 1 op.
  const BATCH_SIZE = 400;
  let written = 0;
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const slice = toMigrate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { id, before, after } of slice) {
      batch.update(db.collection(APPT_COLLECTION).doc(id), {
        appointmentType: after,
        appointmentTypeMigratedAt: FieldValue.serverTimestamp(),
        appointmentTypeLegacyValue: before,
      });
    }
    await batch.commit();
    written += slice.length;
    console.log(`[phase-19-0] committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${written}/${toMigrate.length})`);
  }

  // Audit doc
  const auditId = `phase-19-0-migrate-appointment-types-${Date.now()}-${randHex()}`;
  await db.collection(AUDIT_COLLECTION).doc(auditId).set({
    phase: '19.0',
    op: 'migrate-appointment-types',
    scanned: snap.size,
    migrated: written,
    skipped: snap.size - written,
    beforeDistribution: beforeDist,
    afterDistribution: afterDist,
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`[phase-19-0] APPLY done — ${written} migrated. Audit: ${AUDIT_COLLECTION}/${auditId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[phase-19-0] FATAL', err);
  process.exit(1);
});
```

- [ ] **Step 3: Smoke verify the script's dry-run path (no real Firebase needed for syntax check)**

Run:
```
node --check scripts/phase-19-0-migrate-appointment-types.mjs
```
Expected: no output (syntax OK).

(Real `--dry-run` against prod data happens in Task 14 user-triggered.)

- [ ] **Step 4: Commit**

```bash
git add scripts/phase-19-0-migrate-appointment-types.mjs
git commit -m "$(cat <<'EOF'
feat(phase-19-0/task-10): migration script — Option B uniform default

scripts/phase-19-0-migrate-appointment-types.mjs — one-shot
firebase-admin SDK migration. --dry-run by default; --apply to commit.

Q1 lock = Option B uniform: ALL legacy appointmentType values
('sales' / 'followup' / 'follow' / 'consult' / 'treatment' / null)
→ 'no-deposit-booking'. Idempotent (skips docs already in 4-new shape).

Forensic-trail fields stamped on every migrated doc:
- appointmentTypeMigratedAt: serverTimestamp
- appointmentTypeLegacyValue: prior value

Audit doc to be_admin_audit/phase-19-0-migrate-appointment-types-{ts}-{rand}
with scanned/migrated/skipped counts + before/after distribution.

Mirrors Phase 18.0 seed-exam-rooms script conventions.

Run after V15 #22 deploy lands; user-triggered per project convention.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 11: Test bank batched (Rule K work-first-test-last)

**Files:**
- Create: `tests/phase-19-0-appointment-types.test.js`
- Create: `tests/phase-19-0-time-slot-15min.test.js`
- Create: `tests/phase-19-0-appointment-form-defaults.test.js`
- Create: `tests/phase-19-0-deposit-creates-deposit-booking.test.js`
- Create: `tests/phase-19-0-aggregator-4types.test.js`
- Create: `tests/phase-19-0-grid-15min-cell.test.jsx`
- Create: `tests/phase-19-0-migration-script.test.js`
- Create: `tests/phase-19-0-flow-simulate.test.js`
- Create: `tests/phase-19-0-proclinic-translator.test.js`

- [ ] **Step 1: Write `tests/phase-19-0-appointment-types.test.js`**

```javascript
// tests/phase-19-0-appointment-types.test.js
// Phase 19.0 — A1-A7 — appointmentTypes.js SSOT.

import { describe, test, expect } from 'vitest';
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_VALUES,
  DEFAULT_APPOINTMENT_TYPE,
  resolveAppointmentTypeLabel,
  resolveAppointmentTypeDefaultColor,
  isLegacyAppointmentType,
  migrateLegacyAppointmentType,
} from '../src/lib/appointmentTypes.js';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/lib/appointmentTypes.js', 'utf8');

describe('Phase 19.0 — appointmentTypes SSOT', () => {
  test('A1.1 APPOINTMENT_TYPES is frozen with 4 entries', () => {
    expect(Object.isFrozen(APPOINTMENT_TYPES)).toBe(true);
    expect(APPOINTMENT_TYPES).toHaveLength(4);
  });

  test('A1.2 each entry is frozen with value/label/defaultColor/order', () => {
    for (const t of APPOINTMENT_TYPES) {
      expect(Object.isFrozen(t)).toBe(true);
      expect(typeof t.value).toBe('string');
      expect(typeof t.label).toBe('string');
      expect(typeof t.defaultColor).toBe('string');
      expect(typeof t.order).toBe('number');
    }
  });

  test('A1.3 values are exactly the 4 phase-19.0 keys', () => {
    expect(APPOINTMENT_TYPE_VALUES).toEqual([
      'deposit-booking', 'no-deposit-booking', 'treatment-in', 'follow-up',
    ]);
  });

  test('A1.4 Thai labels match spec', () => {
    const labels = APPOINTMENT_TYPES.map((t) => t.label);
    expect(labels).toEqual(['จองมัดจำ', 'จองไม่มัดจำ', 'เข้าทำหัตถการ', 'ติดตามอาการ']);
  });

  test('A1.5 default colors map to spec', () => {
    expect(APPOINTMENT_TYPES.find((t) => t.value === 'deposit-booking').defaultColor).toBe('เขียวอ่อน');
    expect(APPOINTMENT_TYPES.find((t) => t.value === 'no-deposit-booking').defaultColor).toBe('ส้มอ่อน');
    expect(APPOINTMENT_TYPES.find((t) => t.value === 'treatment-in').defaultColor).toBe('น้ำเงินอ่อน');
    expect(APPOINTMENT_TYPES.find((t) => t.value === 'follow-up').defaultColor).toBe('เหลืองอ่อน');
  });

  test('A1.6 DEFAULT is no-deposit-booking', () => {
    expect(DEFAULT_APPOINTMENT_TYPE).toBe('no-deposit-booking');
  });

  test('A2.1 resolveAppointmentTypeLabel for known values', () => {
    expect(resolveAppointmentTypeLabel('deposit-booking')).toBe('จองมัดจำ');
    expect(resolveAppointmentTypeLabel('no-deposit-booking')).toBe('จองไม่มัดจำ');
    expect(resolveAppointmentTypeLabel('treatment-in')).toBe('เข้าทำหัตถการ');
    expect(resolveAppointmentTypeLabel('follow-up')).toBe('ติดตามอาการ');
  });

  test('A2.2 resolveAppointmentTypeLabel falls back to DEFAULT label for unknown / null / legacy', () => {
    const fallback = 'จองไม่มัดจำ';
    expect(resolveAppointmentTypeLabel('sales')).toBe(fallback);
    expect(resolveAppointmentTypeLabel('followup')).toBe(fallback);
    expect(resolveAppointmentTypeLabel('consult')).toBe(fallback);
    expect(resolveAppointmentTypeLabel(null)).toBe(fallback);
    expect(resolveAppointmentTypeLabel(undefined)).toBe(fallback);
    expect(resolveAppointmentTypeLabel('')).toBe(fallback);
    expect(resolveAppointmentTypeLabel('garbage-xyz')).toBe(fallback);
  });

  test('A3.1 resolveAppointmentTypeDefaultColor for known values', () => {
    expect(resolveAppointmentTypeDefaultColor('deposit-booking')).toBe('เขียวอ่อน');
    expect(resolveAppointmentTypeDefaultColor('treatment-in')).toBe('น้ำเงินอ่อน');
  });

  test('A3.2 unknown → fallback to DEFAULT color', () => {
    expect(resolveAppointmentTypeDefaultColor('sales')).toBe('ส้มอ่อน');
    expect(resolveAppointmentTypeDefaultColor(null)).toBe('ส้มอ่อน');
  });

  test('A4.1 isLegacyAppointmentType true for legacy + null + empty', () => {
    expect(isLegacyAppointmentType('sales')).toBe(true);
    expect(isLegacyAppointmentType('followup')).toBe(true);
    expect(isLegacyAppointmentType('follow')).toBe(true);
    expect(isLegacyAppointmentType('consult')).toBe(true);
    expect(isLegacyAppointmentType('treatment')).toBe(true);
    expect(isLegacyAppointmentType(null)).toBe(true);
    expect(isLegacyAppointmentType('')).toBe(true);
    expect(isLegacyAppointmentType(undefined)).toBe(true);
  });

  test('A4.2 isLegacyAppointmentType false for new 4 values', () => {
    for (const v of APPOINTMENT_TYPE_VALUES) {
      expect(isLegacyAppointmentType(v)).toBe(false);
    }
  });

  test('A5.1 migrateLegacyAppointmentType — all 6 legacy inputs → DEFAULT', () => {
    expect(migrateLegacyAppointmentType('sales')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('followup')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('follow')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('consult')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('treatment')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType(null)).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType('')).toBe('no-deposit-booking');
    expect(migrateLegacyAppointmentType(undefined)).toBe('no-deposit-booking');
  });

  test('A5.2 migrateLegacyAppointmentType — passthrough for new 4 values (idempotent)', () => {
    for (const v of APPOINTMENT_TYPE_VALUES) {
      expect(migrateLegacyAppointmentType(v)).toBe(v);
    }
  });

  test('A6.1 module exports stable shape', () => {
    expect(SRC).toMatch(/export const APPOINTMENT_TYPES = Object\.freeze/);
    expect(SRC).toMatch(/export const DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking'/);
    expect(SRC).toMatch(/export function migrateLegacyAppointmentType/);
  });

  test('A7.1 Phase 19.0 marker present (institutional memory)', () => {
    expect(SRC).toMatch(/Phase 19\.0/);
  });
});
```

- [ ] **Step 2: Write `tests/phase-19-0-time-slot-15min.test.js`**

```javascript
// tests/phase-19-0-time-slot-15min.test.js
// Phase 19.0 — T1-T5 — canonical 15-min TIME_SLOTS + Rule of 3 collapse.

import { describe, test, expect } from 'vitest';
import { TIME_SLOTS, SLOT_INTERVAL_MIN_DISPLAY } from '../src/lib/staffScheduleValidation.js';
import { readFileSync } from 'node:fs';

describe('Phase 19.0 — TIME_SLOTS 15-min', () => {
  test('T1.1 length is 56 (was 28 in 30-min)', () => {
    expect(TIME_SLOTS.length).toBe(56);
  });

  test('T1.2 first = 08:15, last = 22:00', () => {
    expect(TIME_SLOTS[0]).toBe('08:15');
    expect(TIME_SLOTS[TIME_SLOTS.length - 1]).toBe('22:00');
  });

  test('T2.1 SLOT_INTERVAL_MIN_DISPLAY exported as 15', () => {
    expect(SLOT_INTERVAL_MIN_DISPLAY).toBe(15);
  });

  test('T3.1 spacing is exactly 15 min between consecutive entries', () => {
    for (let i = 1; i < TIME_SLOTS.length; i++) {
      const [hPrev, mPrev] = TIME_SLOTS[i - 1].split(':').map(Number);
      const [hCurr, mCurr] = TIME_SLOTS[i].split(':').map(Number);
      const minutesPrev = hPrev * 60 + mPrev;
      const minutesCurr = hCurr * 60 + mCurr;
      expect(minutesCurr - minutesPrev).toBe(15);
    }
  });

  test('T3.2 every entry matches HH:MM pattern with mm ∈ {00, 15, 30, 45}', () => {
    for (const slot of TIME_SLOTS) {
      expect(slot).toMatch(/^\d{2}:(00|15|30|45)$/);
    }
  });

  test('T4.1 AppointmentTab does NOT define local TIME_SLOTS', () => {
    const src = readFileSync('src/components/backend/AppointmentTab.jsx', 'utf8');
    expect(src).not.toMatch(/^const TIME_SLOTS = \[\];/m);
  });

  test('T4.2 AppointmentFormModal does NOT define local TIME_SLOTS', () => {
    const src = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');
    expect(src).not.toMatch(/^const TIME_SLOTS = \[\];/m);
  });

  test('T4.3 DepositPanel does NOT define local TIME_SLOTS', () => {
    const src = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');
    expect(src).not.toMatch(/^const TIME_SLOTS = \[\];/m);
  });

  test('T5.1 each consumer imports canonical TIME_SLOTS', () => {
    for (const path of [
      'src/components/backend/AppointmentTab.jsx',
      'src/components/backend/AppointmentFormModal.jsx',
      'src/components/backend/DepositPanel.jsx',
    ]) {
      const src = readFileSync(path, 'utf8');
      expect(src).toMatch(/from ['"][^'"]*staffScheduleValidation['"]/);
    }
  });
});
```

- [ ] **Step 3: Write `tests/phase-19-0-appointment-form-defaults.test.js`**

```javascript
// tests/phase-19-0-appointment-form-defaults.test.js
// Phase 19.0 — F1-F5 — AppointmentFormModal default behavior + auto-bump.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');

describe('Phase 19.0 — AppointmentFormModal defaults', () => {
  test('F1.1 defaultFormData endTime = 10:15 (was 10:30)', () => {
    expect(SRC).toMatch(/endTime: ['"]10:15['"]/);
    expect(SRC).not.toMatch(/endTime: ['"]10:30['"]/);
  });

  test('F1.2 defaultFormData uses DEFAULT_APPOINTMENT_TYPE (not raw 'sales')', () => {
    // The default block should reference DEFAULT_APPOINTMENT_TYPE, not the raw string.
    expect(SRC).toMatch(/appointmentType:\s*DEFAULT_APPOINTMENT_TYPE/);
    // Save-payload + edit-mode loader fallbacks must not use raw 'sales'.
    expect(SRC).not.toMatch(/appointmentType:\s*['"]sales['"]/);
  });

  test('F2.1 imports SSOT module', () => {
    expect(SRC).toMatch(/from ['"][^'"]*appointmentTypes['"]/);
  });

  test('F2.2 imports canonical TIME_SLOTS', () => {
    expect(SRC).toMatch(/from ['"][^'"]*staffScheduleValidation['"]/);
  });

  test('F3.1 radio iterates APPOINTMENT_TYPES (not local APPT_TYPES)', () => {
    expect(SRC).toMatch(/APPOINTMENT_TYPES\.map/);
    // Old local array must be gone.
    expect(SRC).not.toMatch(/^const APPT_TYPES = \[\{ value: ['"]sales['"]/m);
  });

  test('F4.1 auto-bump endTime block present (Q3)', () => {
    // Auto-bump preserves +15 default when admin changes startTime alone.
    expect(SRC).toMatch(/Phase 19\.0/);
    expect(SRC).toMatch(/auto-advance/i);
  });
});
```

- [ ] **Step 4: Write `tests/phase-19-0-deposit-creates-deposit-booking.test.js`**

```javascript
// tests/phase-19-0-deposit-creates-deposit-booking.test.js
// Phase 19.0 — D1-D3 — DepositPanel deposit→appt writes 'deposit-booking'.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');

describe('Phase 19.0 — DepositPanel default appointment type', () => {
  test('D1.1 deposit→appt save path uses appointmentType: \'deposit-booking\'', () => {
    expect(SRC).toMatch(/appointmentType:\s*['"]deposit-booking['"]/);
  });

  test('D2.1 NO raw 'sales' literal in DepositPanel save path', () => {
    // Source-grep guard: any new appointmentType: 'sales' assignment must
    // be flagged. Filter out comments / strings unrelated to the save path
    // by searching for the exact assignment shape.
    expect(SRC).not.toMatch(/appointmentType:\s*['"]sales['"]/);
  });

  test('D3.1 Phase 19.0 marker present', () => {
    expect(SRC).toMatch(/Phase 19\.0|deposit-booking/);
  });
});
```

- [ ] **Step 5: Write `tests/phase-19-0-aggregator-4types.test.js`**

```javascript
// tests/phase-19-0-aggregator-4types.test.js
// Phase 19.0 — G1-G4 — appointmentReportAggregator + AppointmentReportTab.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveAppointmentTypeLabel } from '../src/lib/appointmentTypes.js';

const AGGREGATOR_SRC = readFileSync('src/lib/appointmentReportAggregator.js', 'utf8');
const TAB_SRC = readFileSync('src/components/backend/reports/AppointmentReportTab.jsx', 'utf8');

describe('Phase 19.0 — aggregator + report tab', () => {
  test('G1.1 aggregator imports resolveAppointmentTypeLabel from SSOT', () => {
    expect(AGGREGATOR_SRC).toMatch(/from ['"][^'"]*appointmentTypes['"]/);
    expect(AGGREGATOR_SRC).toMatch(/resolveAppointmentTypeLabel/);
  });

  test('G2.1 aggregator default fallback = DEFAULT_APPOINTMENT_TYPE (not raw \'sales\')', () => {
    expect(AGGREGATOR_SRC).toMatch(/DEFAULT_APPOINTMENT_TYPE/);
    expect(AGGREGATOR_SRC).not.toMatch(/['"]sales['"]\s*\)/);
  });

  test('G2.2 resolver delivers correct labels for the 4 new values', () => {
    expect(resolveAppointmentTypeLabel('deposit-booking')).toBe('จองมัดจำ');
    expect(resolveAppointmentTypeLabel('no-deposit-booking')).toBe('จองไม่มัดจำ');
    expect(resolveAppointmentTypeLabel('treatment-in')).toBe('เข้าทำหัตถการ');
    expect(resolveAppointmentTypeLabel('follow-up')).toBe('ติดตามอาการ');
  });

  test('G3.1 report tab dropdown derives from APPOINTMENT_TYPES (4 values)', () => {
    expect(TAB_SRC).toMatch(/APPOINTMENT_TYPES\.map/);
    // Old 2-element inline array gone.
    expect(TAB_SRC).not.toMatch(/v: ['"]sales['"]/);
    expect(TAB_SRC).not.toMatch(/v: ['"]followup['"]/);
  });

  test('G4.1 report tab imports SSOT', () => {
    expect(TAB_SRC).toMatch(/from ['"][^'"]*appointmentTypes['"]/);
  });
});
```

- [ ] **Step 6: Write `tests/phase-19-0-grid-15min-cell.test.jsx`**

```javascript
// tests/phase-19-0-grid-15min-cell.test.jsx
// Phase 19.0 — C1-C4 — AppointmentTab grid cell + span calc.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/AppointmentTab.jsx', 'utf8');

describe('Phase 19.0 — AppointmentTab 15-min grid', () => {
  test('C1.1 SLOT_H = 18 (halved from 36)', () => {
    expect(SRC).toMatch(/const SLOT_H\s*=\s*18\b/);
    // Old value gone:
    expect(SRC).not.toMatch(/const SLOT_H\s*=\s*36\b/);
  });

  test('C2.1 default endTime fallback = \'10:15\' (was \'10:30\')', () => {
    expect(SRC).toMatch(/['"]10:15['"]/);
  });

  test('C3.1 imports canonical TIME_SLOTS', () => {
    expect(SRC).toMatch(/TIME_SLOTS.*from ['"][^'"]*staffScheduleValidation['"]/s);
  });

  test('C4.1 Phase 19.0 marker present', () => {
    expect(SRC).toMatch(/Phase 19\.0/);
  });
});
```

- [ ] **Step 7: Write `tests/phase-19-0-migration-script.test.js`**

```javascript
// tests/phase-19-0-migration-script.test.js
// Phase 19.0 — M1-M6 — migration helper purity (no real Firestore).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('scripts/phase-19-0-migrate-appointment-types.mjs', 'utf8');

// Replicate the pure-helper here for testing — the script itself is
// CLI-bound and not directly importable for unit testing without
// triggering firebase-admin init. Mirror the helper exactly.
const APPOINTMENT_TYPE_VALUES = ['deposit-booking', 'no-deposit-booking', 'treatment-in', 'follow-up'];
const DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking';
function mapAppointmentType(value) {
  if (APPOINTMENT_TYPE_VALUES.includes(value)) return value;
  return DEFAULT_APPOINTMENT_TYPE;
}

describe('Phase 19.0 — migration script', () => {
  test('M1.1 mapAppointmentType(\'sales\') = \'no-deposit-booking\'', () => {
    expect(mapAppointmentType('sales')).toBe('no-deposit-booking');
  });

  test('M1.2 mapAppointmentType for all legacy → DEFAULT', () => {
    for (const v of ['sales', 'followup', 'follow', 'consult', 'treatment', null, undefined, '']) {
      expect(mapAppointmentType(v)).toBe('no-deposit-booking');
    }
  });

  test('M2.1 mapAppointmentType passthrough for new 4 (idempotent)', () => {
    for (const v of APPOINTMENT_TYPE_VALUES) {
      expect(mapAppointmentType(v)).toBe(v);
    }
  });

  test('M3.1 script src has --apply gate (default dry-run)', () => {
    expect(SRC).toMatch(/--apply/);
    expect(SRC).toMatch(/const apply = process\.argv\.includes\(['"]--apply['"]\)/);
    expect(SRC).toMatch(/const dryRun = !apply/);
  });

  test('M4.1 audit doc shape matches Phase 18.0 convention', () => {
    expect(SRC).toMatch(/be_admin_audit/);
    expect(SRC).toMatch(/scanned/);
    expect(SRC).toMatch(/migrated/);
    expect(SRC).toMatch(/skipped/);
    expect(SRC).toMatch(/beforeDistribution/);
    expect(SRC).toMatch(/afterDistribution/);
  });

  test('M5.1 forensic-trail fields stamped per migrated doc', () => {
    expect(SRC).toMatch(/appointmentTypeMigratedAt/);
    expect(SRC).toMatch(/appointmentTypeLegacyValue/);
  });

  test('M6.1 batch size respects Firestore 500-op cap', () => {
    expect(SRC).toMatch(/BATCH_SIZE/);
    expect(SRC).toMatch(/= 400/); // safe under 500 cap
  });
});
```

- [ ] **Step 8: Write `tests/phase-19-0-flow-simulate.test.js` (Rule I full-flow)**

```javascript
// tests/phase-19-0-flow-simulate.test.js
// Phase 19.0 — F1-F9 — Rule I full-flow simulate.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_VALUES,
  DEFAULT_APPOINTMENT_TYPE,
  resolveAppointmentTypeLabel,
  resolveAppointmentTypeDefaultColor,
  migrateLegacyAppointmentType,
} from '../src/lib/appointmentTypes.js';

const FORM_SRC = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');
const TAB_SRC = readFileSync('src/components/backend/AppointmentTab.jsx', 'utf8');
const DEP_SRC = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');
const AGG_SRC = readFileSync('src/lib/appointmentReportAggregator.js', 'utf8');
const ADMIN_SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

describe('Phase 19.0 — Rule I full-flow simulate', () => {
  test('F1.1 master types loaded — 4 values present', () => {
    expect(APPOINTMENT_TYPE_VALUES.length).toBe(4);
  });

  test('F2.1 form modal references APPOINTMENT_TYPES (radio rendering)', () => {
    expect(FORM_SRC).toMatch(/APPOINTMENT_TYPES\.map/);
  });

  test('F3.1 admin pick \'treatment-in\' resolves to label + color', () => {
    expect(resolveAppointmentTypeLabel('treatment-in')).toBe('เข้าทำหัตถการ');
    expect(resolveAppointmentTypeDefaultColor('treatment-in')).toBe('น้ำเงินอ่อน');
  });

  test('F4.1 save path payload shape (form simulate)', () => {
    const formData = { appointmentType: 'treatment-in', startTime: '14:00', endTime: '14:15' };
    const payload = { ...formData, appointmentType: formData.appointmentType || DEFAULT_APPOINTMENT_TYPE };
    expect(payload.appointmentType).toBe('treatment-in');
  });

  test('F4.2 missing appointmentType falls back to DEFAULT (no \'sales\' leak)', () => {
    const formData = { appointmentType: '', startTime: '14:00', endTime: '14:15' };
    const payload = { ...formData, appointmentType: formData.appointmentType || DEFAULT_APPOINTMENT_TYPE };
    expect(payload.appointmentType).toBe('no-deposit-booking');
  });

  test('F5.1 grid chip color resolves per type', () => {
    for (const t of APPOINTMENT_TYPES) {
      expect(resolveAppointmentTypeDefaultColor(t.value)).toBe(t.defaultColor);
    }
  });

  test('F6.1 report aggregator delegates to resolver (no inline map)', () => {
    expect(AGG_SRC).toMatch(/resolveAppointmentTypeLabel/);
    expect(AGG_SRC).not.toMatch(/sales: ['"]ขาย['"]/);
  });

  test('F7.1 AdminDashboard typeMap replaced with resolver', () => {
    expect(ADMIN_SRC).toMatch(/resolveAppointmentTypeLabel/);
    // Inline 4-key typeMap removed.
    expect(ADMIN_SRC).not.toMatch(/typeMap = \{ follow:/);
  });

  test('F8.1 source-grep — no inline TIME_SLOTS local generators', () => {
    expect(TAB_SRC).not.toMatch(/^const TIME_SLOTS = \[\];/m);
    expect(FORM_SRC).not.toMatch(/^const TIME_SLOTS = \[\];/m);
    expect(DEP_SRC).not.toMatch(/^const TIME_SLOTS = \[\];/m);
  });

  test('F8.2 source-grep — no inline APPT_TYPES local arrays', () => {
    expect(FORM_SRC).not.toMatch(/^const APPT_TYPES = \[\{ value: ['"]sales['"]/m);
  });

  test('F9.1 migrateLegacyAppointmentType handles full legacy distribution', () => {
    // Simulate post-deploy distribution observed in audit-doc.
    const sample = {
      sales: 100,
      followup: 50,
      follow: 5,
      consult: 2,
      treatment: 1,
      null: 10,
      'deposit-booking': 0, // none yet pre-migration
    };
    const after = {};
    for (const [legacy, count] of Object.entries(sample)) {
      const value = legacy === 'null' ? null : legacy;
      const mapped = migrateLegacyAppointmentType(value);
      after[mapped] = (after[mapped] || 0) + count;
    }
    expect(after['no-deposit-booking']).toBe(168); // all flowed to default
    expect(Object.keys(after).filter((k) => k !== 'no-deposit-booking')).toEqual([]);
  });
});
```

- [ ] **Step 9: Write `tests/phase-19-0-proclinic-translator.test.js`**

```javascript
// tests/phase-19-0-proclinic-translator.test.js
// Phase 19.0 — P1-P7 — ProClinic 4→2 translator.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapAppointmentTypeForProClinic } from '../api/proclinic/_lib/appointmentTypeProClinic.js';

const APPT_SRC = readFileSync('api/proclinic/appointment.js', 'utf8');
const HELPER_SRC = readFileSync('api/proclinic/_lib/appointmentTypeProClinic.js', 'utf8');

describe('Phase 19.0 — ProClinic 4→2 translator', () => {
  test('P1.1 deposit-booking → sales', () => {
    expect(mapAppointmentTypeForProClinic('deposit-booking')).toBe('sales');
  });

  test('P2.1 no-deposit-booking → sales', () => {
    expect(mapAppointmentTypeForProClinic('no-deposit-booking')).toBe('sales');
  });

  test('P3.1 treatment-in → sales', () => {
    expect(mapAppointmentTypeForProClinic('treatment-in')).toBe('sales');
  });

  test('P4.1 follow-up → followup', () => {
    expect(mapAppointmentTypeForProClinic('follow-up')).toBe('followup');
  });

  test('P5.1 unknown / null / legacy → sales (defensive default)', () => {
    expect(mapAppointmentTypeForProClinic(null)).toBe('sales');
    expect(mapAppointmentTypeForProClinic(undefined)).toBe('sales');
    expect(mapAppointmentTypeForProClinic('')).toBe('sales');
    expect(mapAppointmentTypeForProClinic('garbage-xyz')).toBe('sales');
    expect(mapAppointmentTypeForProClinic('sales')).toBe('sales'); // legacy passthrough
    expect(mapAppointmentTypeForProClinic('followup')).toBe('sales'); // 'followup' (no hyphen) treated as non-match
  });

  test('P6.1 helper imported in api/proclinic/appointment.js', () => {
    expect(APPT_SRC).toMatch(/from ['"][^'"]*appointmentTypeProClinic['"]/);
    expect(APPT_SRC).toMatch(/mapAppointmentTypeForProClinic/);
  });

  test('P6.2 helper used at both PATCH sites (lines ~30 + ~195)', () => {
    const occurrences = (APPT_SRC.match(/mapAppointmentTypeForProClinic\(/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  test('P7.1 @dev-only banner present (rule H-bis strip marker)', () => {
    expect(HELPER_SRC).toMatch(/@dev-only/);
    expect(HELPER_SRC).toMatch(/STRIP BEFORE PRODUCTION/);
  });
});
```

- [ ] **Step 10: Run focused subset to verify all 9 files load**

Run:
```
npm test -- --run tests/phase-19-0-appointment-types.test.js tests/phase-19-0-time-slot-15min.test.js tests/phase-19-0-appointment-form-defaults.test.js tests/phase-19-0-deposit-creates-deposit-booking.test.js tests/phase-19-0-aggregator-4types.test.js tests/phase-19-0-grid-15min-cell.test.jsx tests/phase-19-0-migration-script.test.js tests/phase-19-0-flow-simulate.test.js tests/phase-19-0-proclinic-translator.test.js
```
Expected: ALL PASS. ~87 tests total. If any fail, fix the test or the source per Rule K (work first → tests catch real bugs in implementation; fix source if real, fix test if assertion is wrong).

- [ ] **Step 11: Commit (single batched test commit per Rule K)**

```bash
git add tests/phase-19-0-*.test.js tests/phase-19-0-*.test.jsx
git commit -m "$(cat <<'EOF'
test(phase-19-0/task-11): test bank — 9 files, ~87 tests (Rule K)

Rule K work-first-test-last batch — all 9 phase-19-0 test files
written + committed in one shot:

- tests/phase-19-0-appointment-types.test.js (A1-A7) — SSOT module
- tests/phase-19-0-time-slot-15min.test.js (T1-T5) — canonical TIME_SLOTS
- tests/phase-19-0-appointment-form-defaults.test.js (F1-F5) — modal defaults
- tests/phase-19-0-deposit-creates-deposit-booking.test.js (D1-D3)
- tests/phase-19-0-aggregator-4types.test.js (G1-G4)
- tests/phase-19-0-grid-15min-cell.test.jsx (C1-C4)
- tests/phase-19-0-migration-script.test.js (M1-M6)
- tests/phase-19-0-flow-simulate.test.js (F1-F9) — Rule I full-flow
- tests/phase-19-0-proclinic-translator.test.js (P1-P7)

Source-grep regression bank covers:
- No local TIME_SLOTS in 3 consumers (Rule of 3 collapse)
- No inline APPT_TYPES literal (4-value SSOT enforced)
- AdminDashboard inline typeMap replaced
- Aggregator + report tab use SSOT
- ProClinic translator imported at 2 PATCH sites
- @dev-only banner present (rule H-bis)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Task 12: Verify — full test pass + build clean + audit grep

**Files:**
- (no edits; verification only)

- [ ] **Step 1: Full Vitest suite**

Run:
```
npm test -- --run
```
Expected: ALL PASS. Total ≈ 5481 (was 5394 + 87 new). 0 fails. Permission-denied integration tests count as PASS at master per setup.js convention.

If any pre-existing test fails because of phase-19.0 changes (likely AppointmentTab/Modal/DepositPanel snapshot or shape tests), update the affected legacy test to reflect new defaults.

- [ ] **Step 2: Build clean**

Run:
```
npm run build
```
Expected: clean. No `MISSING_EXPORT` errors. Bundle delta marginal.

- [ ] **Step 3: Source-grep audit — final regression check**

Run:
```
grep -rn "appointmentType.*'sales'\|appointmentType: 'sales'" src/ api/proclinic/ --include="*.js" --include="*.jsx"
```
Expected: ZERO matches in `src/` (except inside test files asserting the legacy is gone). `api/proclinic/appointment.js` may still mention `'sales'` inside the translator helper call's expected result — that's fine.

Run:
```
grep -rn "^const TIME_SLOTS = \[\];" src/components/
```
Expected: ZERO matches.

Run:
```
grep -rn "const APPT_TYPES = \[" src/components/
```
Expected: ZERO matches.

- [ ] **Step 4: No commit needed (verification only)**

Skip git ops. If any audit grep produced unexpected matches, return to the relevant Task and fix.

---

## Task 13: Live preview_eval verification (Rule I item b)

**Files:**
- (no edits; runtime verification on dev server)

- [ ] **Step 1: Start dev server**

Run:
```
npm run dev
```
Expected: Vite serves on `localhost:5173` (or configured port). Wait for "ready" line.

- [ ] **Step 2: preview_eval — 4-radio renders + default selected**

Open the AppointmentTab, click "+ สร้างนัดหมาย". Inspect via `mcp__Claude_Preview__preview_eval`:

```javascript
// Inside browser DevTools console (or preview_eval):
const radios = Array.from(document.querySelectorAll('input[type="radio"][name*="appointmentType" i]')).filter(r => r.checked || true);
const labels = radios.map(r => ({ value: r.value, checked: r.checked, label: r.parentElement?.textContent?.trim() }));
console.log(JSON.stringify(labels, null, 2));
```
Expected: 4 entries `[{value:'deposit-booking',...,label:'จองมัดจำ'}, {value:'no-deposit-booking',checked:true,...,label:'จองไม่มัดจำ'}, {value:'treatment-in',...,label:'เข้าทำหัตถการ'}, {value:'follow-up',...,label:'ติดตามอาการ'}]`. Default selected = `no-deposit-booking`.

- [ ] **Step 3: preview_eval — startTime auto-bump**

In the create form, change startTime via the `<select>` to '11:00'. Observe endTime auto-bumps to '11:15' (was '11:30' pre-Phase-19.0).

```javascript
// Read endTime select value after changing startTime.
const startSel = document.querySelector('select[name*="startTime" i], select[data-field="startTime"]');
const endSel = document.querySelector('select[name*="endTime" i], select[data-field="endTime"]');
console.log({ startTime: startSel?.value, endTime: endSel?.value });
```
Expected: `{ startTime: '11:00', endTime: '11:15' }` after the change.

- [ ] **Step 4: preview_eval — grid renders 56 horizontal lines**

On the AppointmentTab grid (with a date selected), count visible time-slot rows:
```javascript
const rows = document.querySelectorAll('[data-time-slot], [data-row="time-slot"]');
console.log({ count: rows.length });
```
Expected: 56 (or close — depends on selector specificity; if the selector misses, fall back to counting `TIME_SLOTS.length` from a console import).

- [ ] **Step 5: Save a TEST appointment with each of the 4 types**

For each of the 4 types, create a test appointment using a TEST customer (per V33.10 prefix). Save and verify chip color matches default per type:
- 'deposit-booking' → green chip (เขียวอ่อน)
- 'no-deposit-booking' → orange chip (ส้มอ่อน)
- 'treatment-in' → blue chip (น้ำเงินอ่อน)
- 'follow-up' → yellow chip (เหลืองอ่อน)

After verification, delete the 4 TEST appointments via the modal.

- [ ] **Step 6: Switch branch (Phase 18.0 contract preserved)**

Switch BranchSelector to a different branch. Verify grid columns + day appts reset (cross-branch isolation per Phase BS V2). No appts from prior branch leak.

- [ ] **Step 7: Stop dev server**

Stop the `npm run dev` process. No commit needed for verification.

---

## Task 14: Deploy gate — await user "deploy" + post-deploy migration

**Files:**
- (no edits; deploy + migration)

- [ ] **Step 1: Confirm pending V15 #21 still applies (or bundle into V15 #22)**

Check if V15 #21 (`882fb35` empty-state removal) was already deployed. If not, V15 #22 = combined deploy of `882fb35` + Phase 19.0 task commits. If yes, V15 #22 = Phase 19.0 only.

Either way, deploy command is the same:
```
vercel --prod --yes  # in parallel with:
firebase deploy --only firestore:rules  # idempotent re-publish
```

- [ ] **Step 2: AWAIT explicit user "deploy" THIS turn (Rule V18)**

DO NOT proceed without user explicitly typing "deploy" in this turn. V4/V7/V18 lock — prior authorization does NOT carry forward.

- [ ] **Step 3: Pre-probe (Rule B 6 endpoints)**

Run the standard 6-endpoint pre-probe from `.claude/rules/01-iron-clad.md`:
1. POST `chat_conversations/test-probe-{ts}` → 200
2. PATCH `pc_appointments/test-probe?updateMask.fieldPaths=probe` → 200
3. PATCH `clinic_settings/proclinic_session?updateMask.fieldPaths=probe` → 200
4. PATCH `clinic_settings/proclinic_session_trial?updateMask.fieldPaths=probe` → 200
5. opd_sessions anon CREATE+PATCH → 200/200
6. (Phase 18.0 added) be_exam_rooms unauth POST → 403 (rule active confirmation)

All 6 pass → proceed. Any 403 (where 200 expected) → revert + abort.

- [ ] **Step 4: Combined deploy**

Run in parallel (background):
```
vercel --prod --yes
firebase deploy --only firestore:rules
```

- [ ] **Step 5: Post-probe (Rule B 6 endpoints, repeat)**

Same 6 endpoints. All 6 must still match expected status.

- [ ] **Step 6: Cleanup probe artifacts**

Per Rule B step 8:
- DELETE `pc_appointments/test-probe-{TS}` × 2
- PATCH `clinic_settings/proclinic_session{,_trial}` to strip probe field
- opd_sessions probes auto-hidden via V27 isArchived:true (cleanup endpoint scheduled separately)

- [ ] **Step 7: Run migration --dry-run on prod data**

```
node scripts/phase-19-0-migrate-appointment-types.mjs
```
Expected output: `mode = DRY-RUN`. Captures distribution: `before-distribution: { sales: N1, followup: N2, ... }`, `would-migrate: M`, `would-skip: K`. Capture for the deploy log.

- [ ] **Step 8: Run migration --apply on prod data**

```
node scripts/phase-19-0-migrate-appointment-types.mjs --apply
```
Expected output: `mode = APPLY`. Writes M docs in batches of 400. Audit doc id printed at end: `be_admin_audit/phase-19-0-migrate-appointment-types-<ts>-<rand>`.

- [ ] **Step 9: Re-run --apply for idempotency check**

```
node scripts/phase-19-0-migrate-appointment-types.mjs --apply
```
Expected output: `APPLY — 0 docs to migrate (idempotent re-run)`.

- [ ] **Step 10: Update SESSION_HANDOFF + .agents/active.md**

Append to `SESSION_HANDOFF.md` Current State:
```
- V15 #22 (or #21+#22 bundle) LIVE — Phase 19.0 appointment 15-min slots + 4-type taxonomy
- Migration --apply ran on prod — audit be_admin_audit/phase-19-0-migrate-appointment-types-{ts}
```

Update `.agents/active.md` frontmatter `last_commit` + `tests` + `production_commit`. Update `Next action` to Idle.

- [ ] **Step 11: Commit handoff updates**

```bash
git add SESSION_HANDOFF.md .agents/active.md
git commit -m "$(cat <<'EOF'
docs(agents): V15 #22 deploy complete — Phase 19.0 LIVE

Phase 19.0 appointment 15-min slots + 4-type taxonomy LIVE in prod.
Migration --apply ran on prod — audit doc captured.

Test count: 5394 → ~5481.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

## Self-Review

### 1. Spec coverage

Walked the spec section-by-section:

- [x] Q1 Migration policy = Option B uniform — Task 10 + 11 (M1-M6 tests)
- [x] Q2 Default new-appt type = 'no-deposit-booking' — Task 4 + 6 + tests F1-F4 + D1
- [x] Q3 Slot interval 15-min — Task 2 (canonical) + 4-5-6 (consumers) + tests T1-T5
- [x] Q4 Default new-appt duration 15 min — Task 4 (form) + 5 (tab fallback) + tests F1.1
- [x] Q5 Grid cell 18px — Task 5 + tests C1.1
- [x] Q6 Type-color defaults — Task 1 (SSOT) + tests A1.5
- [x] Q7 Business rules NONE — design doc lock; no code; no test (out of scope)
- [x] Q8 DepositPanel deposit→appt = 'deposit-booking' — Task 6 + tests D1
- [x] Q9 ProClinic dev-only translator — Task 3 + 9 + tests P1-P7
- [x] SSOT module appointmentTypes.js — Task 1 + tests A1-A7
- [x] Rule of 3 collapse — Tasks 4-5-6 + tests T4
- [x] Aggregator + report tab + AdminDashboard — Tasks 7 + 8 + tests G1-G4 + F7
- [x] Migration script forensic-trail — Task 10 + tests M5
- [x] Audit-doc shape — Task 10 + tests M4
- [x] Read-side defensive fallback — Task 1 (resolver) + tests A2.2 (legacy → default label)
- [x] Rule I full-flow simulate — tests F1-F9
- [x] Build clean + npm test — Task 12
- [x] preview_eval — Task 13
- [x] Probe-Deploy-Probe + migration — Task 14

No gaps.

### 2. Placeholder scan

Searched for: TBD / TODO / "implement later" / "fill in details" / "Add appropriate" / "similar to Task". None present. Each step has actual content.

### 3. Type consistency

- `APPOINTMENT_TYPES` / `APPOINTMENT_TYPE_VALUES` / `DEFAULT_APPOINTMENT_TYPE` named consistently across Tasks 1, 4, 7, 8, 11.
- `mapAppointmentTypeForProClinic` named consistently in Tasks 3, 9, 11 (P-tests).
- `migrateLegacyAppointmentType` (helper) vs `mapAppointmentType` (script-internal) — both correctly distinct (helper is exported from src/lib/; script-internal mirrors logic without import to avoid firebase-admin init at test load). Tests M1-M2 cover script-internal; A5 covers exported helper.
- `SLOT_INTERVAL_MIN_DISPLAY` (canonical TIME_SLOTS module) vs `SLOT_INTERVAL_MIN` (backendClient AP1-bis) — both aligned at 15; named distinct because backend-side already exists, UI-side mirror added in Task 2.

### Fixes applied

None — no issues found.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-phase-19-0-appointment-15min-and-4types.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for cleanly tracked progress + Rule K compliance + minimal context bloat in the main thread.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Faster end-to-end if no surprises.

**Which approach?**
