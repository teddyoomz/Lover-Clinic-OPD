# Phase 19.0 — Appointment 15-min slots + 4-type taxonomy

**Date**: 2026-05-06
**Status**: Design (awaiting user approval before plan/code)
**Predecessor**: Phase 18.0 Branch Exam Rooms (commit `c5609c9`, V15 #19/#20 LIVE) + V15 #21 pending (`882fb35` empty-state removal)

## User directive (verbatim, 2026-05-06)

> "ต่อไปจะเป็นการแก้ไขระบบนัดหมาย
>
> * โดยเราจะลดความถี่ของการนัดหมาย จากเดิม ที่เรา Support ต่ำสุดที่ช่องละ 30 นาที เราจะลดลงเหลือช่องละ 15 นาที ทั้งตารางหน้า tab=appointments ก็ลดเหลือ 15 นาที และ modal นัดหมายทุกที่ในโปรเจ็คเรา ยัน Frontend ก็ลดเหลือ 15 นาทีเช่นกัน และทุกๆที่ที่มีการดึงข้อมูลเวลาในการจองไปใช้ ให้แก้ให้สัมพันธ์กับระบบนัดหมายแบบใหม่ด้วย
>
> * จากภาพที่ 1 ประเภทของการนัดหมายจากเดิมมี 2 ประเภทคือ ขาย และ ติดตาม ให้เปลี่ยนเป็น จองมัดจำ, จองไม่มัดจำ, เข้าทำหัตถการ, ติดตามอาการ ให้เปลี่ยนเป็นมี 4 ประเภท ในทุกที่ ทุกการบันทึก ทุกการ store data และทุกๆที่ที่มีการดึงข้อมูลของประเภทนัดหมายไปใช้ ให้แก้ให้สัมพันธ์กับระบบนัดหมายแบบใหม่ด้วย ให้จำแนกไว้ 4 ประเภท"

Translation:
1. **Slot interval**: shrink minimum slot from 30 min → 15 min everywhere — AppointmentTab grid, every appointment modal across the project (admin + frontend), and every consumer that reads appointment time data must align with the new 15-min system.
2. **Type taxonomy**: replace existing 2 types (`ขาย` / `ติดตาม`) with 4 types (`จองมัดจำ` / `จองไม่มัดจำ` / `เข้าทำหัตถการ` / `ติดตามอาการ`) everywhere data is stored, written, or consumed.

## Approved decisions (locked)

- **Q1 — Migration policy**: **Option B Uniform Default**. All existing values (`'sales'` / `'followup'` / `'follow'` / `'consult'` / `'treatment'` / `null`) → `'no-deposit-booking'`. Admin re-classifies per appointment manually post-migration.
- **Q2 — Default new-appt type**: `'no-deposit-booking'` (replaces current `'sales'` default in AppointmentFormModal + DepositPanel paths).
- **Q3 — Slot interval**: 15 min everywhere — TIME_SLOTS dropdowns (4 copies → 1 canonical), AppointmentTab grid cell, AppointmentFormModal start/end pickers, DepositPanel start/end pickers, ScheduleEntryFormModal (already imports canonical).
- **Q4 — Default new-appt duration**: 15 min (`endTime` = `startTime` + 15). Auto-bump in form modals when admin changes startTime without touching endTime.
- **Q5 — Grid cell height**: 18 px per 15-min slot (halved from 36 px per 30-min slot). Total grid pixel-height stays equivalent. Admins see twice as many horizontal lines but same scroll length.
- **Q6 — Type-color defaults**: per-type default fill color when admin doesn't pick `appointmentColor` explicitly:
  - `'deposit-booking'` → เขียวอ่อน (paid intent)
  - `'no-deposit-booking'` → ส้มอ่อน (pending)
  - `'treatment-in'` → น้ำเงินอ่อน (active)
  - `'follow-up'` → เหลืองอ่อน (info)
  - Admin-picked `appointmentColor` overrides type default. Existing appts with `appointmentColor` already set keep their pick.
- **Q7 — Business rules**: type is descriptive label only. NO hard gates (e.g. `'deposit-booking'` does NOT require a linked `be_deposits` doc; `'treatment-in'` does NOT auto-trigger TFP creation). Admin selects manually. Future enhancements (link enforcement, auto-trigger) are explicitly out-of-scope.
- **Q8 — DepositPanel deposit→appointment flow**: writes `'deposit-booking'` going forward (was `'sales'`). The deposit creation flow's `createBackendAppointment` call is the single canonical writer of this type.
- **Q9 — ProClinic dev-only sync**: `api/proclinic/{appointment,deposit}.js` translates 4-type → `'sales'` for outgoing PATCH (ProClinic only knows 2 types). Compat shim. H-bis strips the `api/proclinic/*` paths pre-launch — no production impact.

## Architecture

### Single-source-of-truth modules

1. **`src/lib/appointmentTypes.js`** (NEW) — exports the 4-type constant + label/color/order/migration helpers. Single import for every consumer.
   ```js
   export const APPOINTMENT_TYPES = Object.freeze([
     { value: 'deposit-booking',    label: 'จองมัดจำ',     defaultColor: 'เขียวอ่อน',  order: 0 },
     { value: 'no-deposit-booking', label: 'จองไม่มัดจำ',  defaultColor: 'ส้มอ่อน',    order: 1 },
     { value: 'treatment-in',       label: 'เข้าทำหัตถการ', defaultColor: 'น้ำเงินอ่อน', order: 2 },
     { value: 'follow-up',          label: 'ติดตามอาการ',   defaultColor: 'เหลืองอ่อน', order: 3 },
   ]);
   export const APPOINTMENT_TYPE_VALUES = APPOINTMENT_TYPES.map(t => t.value);
   export const DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking';
   export function resolveAppointmentTypeLabel(value) { ... }
   export function resolveAppointmentTypeDefaultColor(value) { ... }
   export function isLegacyAppointmentType(value) { ... } // 'sales' | 'followup' | 'follow' | 'consult' | 'treatment' | null
   export function migrateLegacyAppointmentType(value) { return DEFAULT_APPOINTMENT_TYPE; } // Option B: uniform
   ```

2. **`src/lib/staffScheduleValidation.js`** — extend canonical `TIME_SLOTS` from 30-min to 15-min increments (08:15, 08:30, 08:45, ... 22:00). Length grows from 28 → 56. Export an additional `SLOT_INTERVAL_MIN_DISPLAY = 15` constant aligned with backendClient's `SLOT_INTERVAL_MIN`.

3. **`src/lib/backendClient.js`** — `SLOT_INTERVAL_MIN = 15` (already 15 since AP1-bis V15 #14, no change needed). `buildAppointmentSlotKeys` already 15-min granular.

### Modified surfaces (Rule of 3 collapse)

Drop local `TIME_SLOTS` definitions in 3 places, import from `staffScheduleValidation.js`:
- [AppointmentTab.jsx:56-62](src/components/backend/AppointmentTab.jsx) — also halve `SLOT_H = 36` → `18`. Update default-create endTime fallback `'10:30'` → `'10:15'`.
- [AppointmentFormModal.jsx:71-77](src/components/backend/AppointmentFormModal.jsx) — also update `defaultFormData()` `startTime: '10:00', endTime: '10:30'` → `'10:00', '10:15'`. Replace `APPT_TYPES` 2-element local array with `APPOINTMENT_TYPES` import. Default `appointmentType: 'sales'` → `DEFAULT_APPOINTMENT_TYPE`.
- [DepositPanel.jsx:51-55](src/components/backend/DepositPanel.jsx) — same TIME_SLOTS swap. Deposit→appt save path: `appointmentType: 'sales'` → `'deposit-booking'`.
- [ScheduleEntryFormModal.jsx](src/components/backend/scheduling/ScheduleEntryFormModal.jsx) — already imports canonical TIME_SLOTS; auto-flows. No edit needed.

### Type-aware label/color resolution

- [appointmentReportAggregator.js](src/lib/appointmentReportAggregator.js) — replace inline label map with `resolveAppointmentTypeLabel`. Filter accepts the 4 new values.
- [AppointmentReportTab.jsx:52-53](src/components/backend/reports/AppointmentReportTab.jsx) — replace 2-option dropdown with `APPOINTMENT_TYPES.map(t => ({ v: t.value, t: t.label }))`.
- [AdminDashboard.jsx:5353](src/pages/AdminDashboard.jsx) — replace inline `typeMap = { follow: 'ติดตาม', sales: 'ขาย', consult: 'ปรึกษา', treatment: 'รักษา' }` with `resolveAppointmentTypeLabel(appt.appointmentType)`.
- [appointmentDisplay.js](src/lib/appointmentDisplay.js) — extend with `resolveAppointmentTypeLabel` re-export OR add `resolveAppointmentChipStyle(appt)` returning `{ label, color }`. Single resolver for chip rendering.
- AppointmentTab.jsx grid chip rendering — apply `resolveAppointmentTypeDefaultColor` when `appointmentColor` is empty string. Admin-picked color still wins.

### ProClinic dev-only sync (H-bis territory — strip pre-launch)

ProClinic understands only 2 type values (`'sales'` / `'followup'`). Outgoing translator maps 4 → 2:
- `'deposit-booking'` → `'sales'` (deposit-bound bookings are revenue-bearing; closest ProClinic semantic)
- `'no-deposit-booking'` → `'sales'` (still a sales-funnel booking)
- `'treatment-in'` → `'sales'` (treatment session = sales-bearing)
- `'follow-up'` → `'followup'`

Implementation:
- [api/proclinic/appointment.js:30,195](api/proclinic/appointment.js) — guard outgoing payload via shared helper `mapAppointmentTypeForProClinic(type)` exported from `api/proclinic/_lib/appointmentTypeProClinic.js` (NEW pure helper; tests live in `tests/phase-19-0-proclinic-translator.test.js`).
- [api/proclinic/deposit.js:166](api/proclinic/deposit.js) — already hardcoded `'sales'` outgoing; no change needed (deposit→appt creates `'deposit-booking'` which maps to `'sales'` anyway, payload identical).
- Mark with banner comment `// @dev-only — Phase 19.0 type translator (rule H-bis)` for the strip step.

### Migration script

`scripts/phase-19-0-migrate-appointment-types.mjs` — mirrors Phase 18.0 conventions:
- Firebase Admin SDK; service-account credential via env (`FIREBASE_ADMIN_CREDENTIALS_JSON` or service-account file path).
- Two-phase: dry-run by default; `--apply` flag to commit.
- Reads ALL `be_appointments` docs (cross-branch, no scope filter — appointments aren't branch-scoped via doc-id; they're branch-stamped via field).
- For each appt where `appointmentType` ∈ legacy values OR `appointmentType` is missing/null/empty:
  - Set `appointmentType = 'no-deposit-booking'` (Option B uniform).
  - Stamp `appointmentTypeMigratedAt: serverTimestamp()` + `appointmentTypeLegacyValue: <prior value>` for forensic trail.
- Skip docs where `appointmentType` is already in the 4 new values (idempotent re-runs).
- Writes audit doc to `be_admin_audit/phase-19-0-migrate-appointment-types-<ts>-<rand>` with `{ scanned, migrated, skipped, before-distribution, after-distribution }`.

### firestore.rules

NO change. `be_appointments` rule already allows `isClinicStaff()` write; `appointmentType` is just another field. The forensic-trail fields (`appointmentTypeMigratedAt`, `appointmentTypeLegacyValue`) require admin SDK to write (script uses admin SDK, bypasses rules).

## Out of scope (locked, do not touch)

- **`pc_*` collection schedule mirror data** ([AdminDashboard.jsx:5395](src/pages/AdminDashboard.jsx) `eventColor` etc.) — frontend patient-form / admin-dashboard ProClinic mirror data is read-only display from `pc_*`; outside scope. ProClinic remains 2-type; we display whatever it sends.
- **APPT_COLORS palette consolidation** — duplicated in 2 files (AppointmentFormModal + DepositPanel); only 2 copies → no Rule of 3 trigger yet. Keep as-is; consolidate when a 3rd consumer appears.
- **Public-facing booking page** — does not exist (verified PatientForm.jsx + PatientDashboard.jsx). User said "ยัน Frontend" (extending to frontend) but inspection shows frontend only DISPLAYS appointments, doesn't create. Frontend display labels follow new `appointmentType` → label resolver automatically. No frontend booking-form work required.
- **Business-rule gates** (e.g. `'deposit-booking'` requires linked deposit) — Q7 lock; descriptive label only.
- **Type-color UI override** — admin-picked `appointmentColor` continues to win over per-type default. No new picker; no migration of existing color choices.
- **Schedule-entry data shape** — `be_staff_schedules` keeps current shape; only its TIME_SLOTS dropdown values shrink to 15-min via the canonical import.
- **AP1-bis slot-reservation collection (`be_appointment_slots`)** — already 15-min via `SLOT_INTERVAL_MIN = 15`. No changes; existing keys remain valid (each existing 30-min slot = 2 consecutive 15-min keys, both already populated by `buildAppointmentSlotKeys()`).
- **AppointmentRoomColumns + ExamRoomsTab** — Phase 18.0 complete; orthogonal to this work.
- **Forensic-trail field cleanup** (`appointmentTypeLegacyValue`, `appointmentTypeMigratedAt`) — kept for an indefinite period (admin can audit migration; future cleanup phase if storage cost concerns).

## Data shape

### `be_appointments` doc — type field semantics

Pre-Phase 19.0:
```js
appointmentType: 'sales' | 'followup' | 'follow' | 'consult' | 'treatment' | null
```

Post-Phase 19.0 (after migration `--apply`):
```js
appointmentType: 'deposit-booking' | 'no-deposit-booking' | 'treatment-in' | 'follow-up'
appointmentTypeMigratedAt?: Timestamp     // present iff doc was touched by migration
appointmentTypeLegacyValue?: string|null  // present iff doc was touched by migration
```

Read-side defensive: any doc with an unknown `appointmentType` falls back to `DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking'` at render via `resolveAppointmentTypeLabel`. This handles the gap window between deploy and migration `--apply` (ProClinic sync may insert legacy values during that window — render still works).

### TIME_SLOTS

Pre-Phase 19.0 (4 copies, 28 entries):
```js
['08:30', '09:00', '09:30', ..., '21:30', '22:00']
```

Post-Phase 19.0 (1 canonical export, 56 entries):
```js
['08:15', '08:30', '08:45', '09:00', '09:15', ..., '21:45', '22:00']
```

Existing 30-min appointments fit the 15-min grid natively (every 30-min boundary is a 15-min boundary — no migration needed for `startTime`/`endTime` fields).

### Type → default color map

Single canonical resolver in `appointmentTypes.js`:
```js
{
  'deposit-booking':    'เขียวอ่อน',
  'no-deposit-booking': 'ส้มอ่อน',
  'treatment-in':       'น้ำเงินอ่อน',
  'follow-up':          'เหลืองอ่อน',
}
```

Color enum already canonical via `APPT_COLORS` (yellow/green/orange/red/brown/pink/purple/blue + "ใช้สีเริ่มต้น"). New defaults pick from existing palette — no new color tokens.

## Test plan

### New test files (target ~87 new tests)

| File | Coverage |
|---|---|
| `tests/phase-19-0-appointment-types.test.js` | A1 4-value constant frozen · A2 label resolver · A3 default-color resolver · A4 legacy detector · A5 migrateLegacyAppointmentType returns DEFAULT for all 6 legacy inputs · A6 unknown value passes through to default · A7 source-grep for APPOINTMENT_TYPES uses |
| `tests/phase-19-0-time-slot-15min.test.js` | T1 canonical TIME_SLOTS length=56 · T2 first='08:15' last='22:00' · T3 15-min spacing invariant · T4 source-grep ZERO local TIME_SLOTS in AppointmentTab/Modal/DepositPanel · T5 import-from-canonical guard |
| `tests/phase-19-0-appointment-form-defaults.test.js` | F1 default endTime = startTime + 15 · F2 default appointmentType = 'no-deposit-booking' · F3 startTime change auto-bumps endTime when previously default · F4 admin-picked endTime preserved on subsequent startTime changes · F5 RTL: form mounts with correct defaults |
| `tests/phase-19-0-deposit-creates-deposit-booking.test.js` | D1 DepositPanel save path writes 'deposit-booking' · D2 source-grep no 'sales' literal in DepositPanel save · D3 RTL: deposit-with-appointment flow ends with 'deposit-booking' in payload |
| `tests/phase-19-0-aggregator-4types.test.js` | G1 deriveTypeLabel for 4 new values · G2 filter accepts 4 values · G3 default unknown→'no-deposit-booking' · G4 legacy detection passes-through-to-resolver |
| `tests/phase-19-0-grid-15min-cell.test.jsx` | C1 SLOT_H = 18 · C2 grid renders 56 horizontal lines · C3 appt span calculation halves correctly · C4 chip text legibility at 18px (sanity render check) |
| `tests/phase-19-0-migration-script.test.js` | M1 mapAppointmentType('sales') = 'no-deposit-booking' · M2 mapAppointmentType(any-legacy) = 'no-deposit-booking' · M3 mapAppointmentType('deposit-booking') = 'deposit-booking' (idempotent) · M4 mapAppointmentType(null) = 'no-deposit-booking' · M5 dry-run yields no writes · M6 audit-doc shape matches Phase 18.0 convention |
| `tests/phase-19-0-flow-simulate.test.js` | Rule I full-flow: F1 master types loaded · F2 form renders 4-radio · F3 admin picks 'treatment-in' · F4 save path writes correct shape · F5 grid renders chip with correct color · F6 report aggregator labels correctly · F7 patient-side AppointmentCard shows correct Thai label · F8 source-grep regression bank (APPOINTMENT_TYPES imported, no inline arrays) · F9 cross-branch isolation (no leak) |
| `tests/phase-19-0-proclinic-translator.test.js` | P1 'deposit-booking'→'sales' · P2 'no-deposit-booking'→'sales' · P3 'treatment-in'→'sales' · P4 'follow-up'→'followup' · P5 unknown→'sales' (defensive fallback) · P6 helper imported in api/proclinic/appointment.js call sites · P7 banner comment `@dev-only` present |

### Updated test files

- `tests/ap1-schema-slot-reservation.test.js` — A5.15 unchanged (still 15). No edits.
- `tests/audit-branch-scope.test.js` — appointmentType is a field not a collection; BS-1..BS-9 untouched.
- `tests/branch-collection-coverage.test.js` — no new collection.

### preview_eval verification (Rule I item b)

Per Rule I non-negotiable for stock paths — appointment paths are NOT stock-mutation paths but the cross-tier impact is wide. Voluntary preview_eval at end of phase:
- Spawn dev server.
- Open AppointmentTab, verify grid shows 15-min lines + 4-color chips for the 4 types.
- Open AppointmentFormModal create-mode, verify 4-radio renders + default = 'no-deposit-booking'.
- Save a test appointment with each of the 4 types (use `TEST-` prefix per V33.10 customer convention; appointments don't have a prefix convention but use a TEST customer).
- Verify each chip renders with correct default color.
- Switch branch, verify column reset still works (Phase 18.0 contract preserved).
- Cleanup test docs.

## Migration runbook

### Pre-deploy

```bash
node scripts/phase-19-0-migrate-appointment-types.mjs --dry-run
# Expect: scanned=N, would-migrate=M, would-skip=K (where M+K=N, skip is appts already in new shape)
# K should be 0 unless rerunning post-apply
```

Capture output for the deploy log.

### Deploy (V15 #22 or later — bundles V15 #21 if not yet flushed)

Combined deploy per Rule B + V15 conventions:
- `vercel --prod --yes`
- `firebase deploy --only firestore:rules` — idempotent (rules unchanged)
- 6/6 pre-probe + 6/6 post-probe + 4/4 cleanup (Rule B Probe-Deploy-Probe).

### Post-deploy

```bash
node scripts/phase-19-0-migrate-appointment-types.mjs --apply
# Audit doc: be_admin_audit/phase-19-0-migrate-appointment-types-<ts>-<rand>
# Verify: post-distribution shows 0 legacy values, all 4 new values present
# Re-run --apply: should be idempotent (0 writes)
```

If migration distribution looks wrong (e.g. accidental migration of new-shape docs), rollback via field-reset script (out of scope here; build only if needed).

### V15 #22 Probe list (Rule B endpoints, unchanged)

1. POST `chat_conversations/test-probe-{ts}` → 200
2. PATCH `pc_appointments/test-probe?updateMask.fieldPaths=probe` → 200
3. PATCH `clinic_settings/proclinic_session?updateMask.fieldPaths=probe` → 200
4. PATCH `clinic_settings/proclinic_session_trial?updateMask.fieldPaths=probe` → 200
5. POST + PATCH `opd_sessions/test-probe-anon-{ts}` (anon-auth path) → 200/200
6. CREATE `be_exam_rooms/test-probe-{ts}` (anon → 403; clinic-staff → 200) — Phase 18.0 added; preserved

## Rollback plan

If user reports any of: (a) admins can't pick the right type, (b) grid renders wrong cells, (c) reports show wrong labels, (d) migration touched the wrong docs:

1. **Source rollback**: `git revert <phase-19-0-commit>` → push → vercel deploy.
2. **Data rollback**: NEW script `scripts/phase-19-0-revert-appointment-types.mjs` (build only if needed) — reads `appointmentTypeLegacyValue` from migrated docs and writes back. Idempotent. Audit-doc'd.
3. **firestore.rules**: no changes to rollback.

## Build + test count expectations

- **Tests**: ~87 new (target). Existing 5394 → ~5481.
- **Build**: clean. No new dependencies.
- **firestore.rules**: v26 unchanged (idempotent re-publish on combined deploy).
- **Bundle size**: marginal — `appointmentTypes.js` is ~50 lines pure.

## Cross-references

- Rule of 3 collapse: 4 TIME_SLOTS copies → 1 canonical (closes the comment "duplicated from AppointmentTab — will collapse into a shared constants module in a follow-up Rule-of-3 sweep" at AppointmentFormModal.jsx:55-56).
- Rule I full-flow simulate: required at end of phase per `.claude/rules/00-session-start.md` Rule I.
- Rule K work-first-test-last: implementation across all surfaces first, then test bank in single batch before commit.
- BSA Rule L (BS-1..BS-9): no new branch-scoped collection; appointment listers already branch-scoped via Phase BS V2; type field is universal-by-design.
- V33.x test-prefix convention: appointment migration script uses TEST customer when seeding test fixtures; no new prefix needed.
- Phase 18.0 migration template: this script mirrors `scripts/phase-18-0-seed-exam-rooms.mjs` shape (dry-run/apply/audit-doc).
- AP1-bis (commit `1d15db5`): `SLOT_INTERVAL_MIN = 15` already shipped — Phase 19.0 closes the UI side.

## Sequencing

1. `appointmentTypes.js` — pure module, write first (single source of truth).
2. `staffScheduleValidation.js` — extend canonical TIME_SLOTS.
3. AppointmentFormModal · AppointmentTab · DepositPanel — drop local TIME_SLOTS, swap APPT_TYPES, update defaults.
4. Aggregator + Report tab + AdminDashboard typeMap.
5. ProClinic dev-only translator (api/proclinic/appointment.js).
6. Migration script.
7. Test bank — all 8 test files in one batch (Rule K).
8. `npm test -- --run` ALL PASS + `npm run build` clean.
9. Live preview_eval verification on dev server.
10. Commit.
11. Await user "deploy" THIS turn → V15 #22 (combined; bundle V15 #21 if not flushed).
12. Post-deploy `--apply` migration.

## Approval gate

Reply **"approved"** to lock this spec and hand off to writing-plans skill.

Reply **"change X"** with specific delta to revise.
