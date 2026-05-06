# 2026-05-06 EOD — Phase 21.0: Appointment sub-tabs (4 types) + deposit-booking pair atomicity

## Summary

Continuation EOD session. After previous chat wrapped Phase 20.0 (Frontend ProClinic strip + per-branch filter), this chat picked up the deferred BackendDashboard nav restructure: move นัดหมาย from PINNED to its own NAV section with 4 sub-tabs (จองไม่มัดจำ / จองมัดจำ / คิวรอทำหัตถการ / คิวติดตามอาการ) per user verbatim directive 2026-05-06.

User authorized full autonomous execution: "approve และ approve review ด้วย แล้วทำให้จบ แล้วเทสตามที่บอกไปเลย จะออกไปข้างนอก ฝากด้วย แบบอยู่ในกฎเกนของเรา และใช้ได้จริงแบบที่หวัง ด้วยความสามารถสูงสุดของนาย".

Workflow: Skill(brainstorming) HARD-GATE (Rule J) → 2 design Qs locked (A=section-with-4-tabs / B=uniform-calendar) → spec doc + commit → 7 source impl → build clean → 8 NEW test files → focused tests 111/111 PASS → migration script (Rule M) → acceptance gate (per-branch × per-type matrix) → commit + push.

## Current State

- master = `fa366f2` (Phase 21.0 SHIPPED) · prod = `024f6dd` FROZEN (V15 #22, no-deploy)
- 5771/5777 tests pass · build clean (BackendDashboard ~967 KB) · firestore.rules unchanged
- Phase 21.0 specific: 111/111 PASS, +135 net tests, build clean
- Acceptance gate: 8/8 PASS — per-branch × per-type isolation matrix (16 TEST-APPT-* fixtures, zero leakage)
- master ahead-of-prod ~50 commits (no scheduled deploy per local-only directive)

## Phase 21.0 — COMPLETE

| What | Detail |
|---|---|
| Spec + plan | `docs/superpowers/specs/2026-05-06-phase-21-0-appointment-sub-tabs-design.md` (committed `82dbb84`) |
| Nav restructure | `navConfig.js` — PINNED_ITEMS=[], NEW NAV_SECTIONS[0]='appointments-section' with 4 items |
| View parameterization | RENAME `AppointmentTab.jsx` → `AppointmentCalendarView.jsx` + `appointmentType` prop + `typedDayAppts` filter (defense-in-depth via `migrateLegacyAppointmentType`) |
| Modal lock | `AppointmentFormModal.jsx` — `lockedAppointmentType` prop. Type radio replaced with static chip when locked. Save button hidden + redirect banner shown when locked='deposit-booking' |
| Pair helper | NEW `src/lib/appointmentDepositBatch.js` — `createDepositBookingPair` + `cancelDepositBookingPair` use Firestore writeBatch for atomic paired (be_deposits + be_appointments) writes with cross-link fields |
| DepositPanel wiring | hasAppointment=true creates → `createDepositBookingPair`; cancels with linkedAppointmentId → `cancelDepositBookingPair` |
| BackendDashboard | 4 new tab cases. Old `?tab=appointments` URL hydrates to `?tab=appointment-no-deposit`. Fallback array updated |
| Permissions | `tabPermissions.js` — 4 sub-tab gates with same permission as legacy 'appointments' (no per-type sub-permissions). firstAllowedTab default updated |
| Migration | NEW `scripts/phase-21-0-migrate-appointment-types-strict.mjs` (Rule M two-phase: strict stamp + deposit-backfill) — ran `--apply`, 0 docs to migrate (Phase 19.0 + 20.0 already cleaned). Audit doc: `be_admin_audit/phase-21-0-strict-and-backfill-1778047714399-b09eefdc` |
| Acceptance gate | NEW `scripts/phase-21-0-acceptance-gate.mjs` — 2 real branches × 4 types × 2 fixtures = 16 TEST-APPT-* docs (V33.13 prefix) → query + filter matrix → 8/8 PASS, zero leakage → cleanup |

## Commits (chronological)

```
fa366f2 feat(phase-21-0): appointment sub-tabs (4 types) + deposit-booking pair atomicity
82dbb84 docs(phase-21-0): spec — appointment sub-tabs (4 types) + deposit-booking pair atomicity
```

## Files touched (top-level)

**Source** (8):
- src/components/backend/AppointmentCalendarView.jsx (renamed + modified, +50/-20)
- src/components/backend/AppointmentFormModal.jsx (+90)
- src/components/backend/DepositPanel.jsx (+30)
- src/components/backend/nav/navConfig.js (+25)
- src/lib/tabPermissions.js (+10)
- src/pages/BackendDashboard.jsx (+30)
- src/lib/appointmentDepositBatch.js (NEW, ~270 LOC)

**Scripts** (2):
- scripts/phase-21-0-migrate-appointment-types-strict.mjs (NEW, ~270 LOC)
- scripts/phase-21-0-acceptance-gate.mjs (NEW, ~190 LOC)

**Tests NEW** (8):
- tests/phase-21-0-nav-config-appointment-section.test.js (10 tests)
- tests/phase-21-0-appointment-calendar-view-typed.test.js (12 tests)
- tests/phase-21-0-appointment-form-modal-locked-type.test.js (11 tests)
- tests/phase-21-0-deposit-booking-pair-helper.test.js (14 tests)
- tests/phase-21-0-deposit-panel-pair-wiring.test.js (8 tests)
- tests/phase-21-0-tab-redirect.test.js (10 tests)
- tests/phase-21-0-strict-and-backfill-migration.test.js (21 tests)
- tests/phase-21-0-flow-simulate.test.js (25 tests Rule I + adversarial + source-grep)

**Tests MODIFIED** (~22) — bulk-renamed `AppointmentTab.jsx` → `AppointmentCalendarView.jsx` references via sed, plus 4 individual count/regex patches:
- backend-nav-config.test.js — S7 + P1 flipped (PINNED empty, 4 new ids in ALL_ITEM_IDS)
- permission-sidebar-filter.test.jsx — PS1.A.11 regex updated
- tabPermissions.test.js — TP17/TP19 expectations 'appointments' → 'appointment-no-deposit'
- phase16.3-flow-simulate.test.js — D.1 TAB_PERMISSION_MAP count 50 → 54
- phase15.7-bis + phase15.7-septies — adapted to new file path / variable names

**Doc**:
- CODEBASE_MAP.md — added Phase 21.0 section at end

## Decisions (one-line)

- Q1 — Nav structure: A (4 separate top-level tab IDs in NAV_SECTIONS section) — locked. Reasoning: matches user's verbal "เมนูย่อย" as left-sidebar entries; zero schema extension; reuses existing accordion UX; each sub-tab gets own URL.
- Q2 — View shape: B (uniform calendar grid for all 4 sub-tabs) — locked. User: "มันเหมือนกันเป๊ะโว้ย จะจองหรือคิว ไม่ต้องไปคิดเยอะแยกกัน".
- Sub-tab labels diverge from APPOINTMENT_TYPES.label SSOT for the queue rows ("คิวรอทำหัตถการ" / "คิวติดตามอาการ") per user verbatim — presentation-only; storage value (be_appointments.appointmentType) stays canonical.
- Writer for deposit-booking: AppointmentFormModal hides save button + redirects to Finance.มัดจำ when type=deposit-booking. DepositPanel is the SOLE writer for deposit-bookings (single-writer V12 lock). Pair-helper creates atomic paired docs.
- Permission model: single permission set for all 4 sub-tabs (no per-type sub-permissions) — YAGNI per spec.
- URL preservation: legacy `?tab=appointments` redirects to `?tab=appointment-no-deposit` so existing bookmarks don't 404.

## Acceptance gate result (per user verbatim test requirement)

```
PHASE 21.0 ACCEPTANCE GATE — per-branch × per-type isolation matrix
────────────────────────────────────────────────────────────────────
Branch                       | Type                | Raw | Typed | Pass
─────────────────────────────┼─────────────────────┼─────┼───────┼─────
BR-1777873556815-26df6480    | no-deposit-booking  | 8   | 2     |  ✓
BR-1777873556815-26df6480    | deposit-booking     | 8   | 2     |  ✓
BR-1777873556815-26df6480    | treatment-in        | 8   | 2     |  ✓
BR-1777873556815-26df6480    | follow-up           | 8   | 2     |  ✓
BR-1777885958735-38afbdeb    | no-deposit-booking  | 8   | 2     |  ✓
BR-1777885958735-38afbdeb    | deposit-booking     | 8   | 2     |  ✓
BR-1777885958735-38afbdeb    | treatment-in        | 8   | 2     |  ✓
BR-1777885958735-38afbdeb    | follow-up           | 8   | 2     |  ✓
────────────────────────────────────────────────────────────────────
Overall: ✓ PASS

✓ wrote 16 TEST-APPT-* fixtures (V33.13 prefix)
✓ deleted 16 fixtures (cleanup complete)
```

Each (branch, type) cell: rawCount=8 (all 4 types × 2 each per branch via branchId-only query), typedCount=2 (correct after type filter), leakageCheck: every doc in cell has matching branchId AND appointmentType.

## Migration result (Rule M)

```
[phase-21-0] mode = APPLY
[phase-21-0a] scanned 407 appointment documents
[phase-21-0a] before-distribution: { 'no-deposit-booking': 407 }
[phase-21-0a] docs-to-stamp: 0
[phase-21-0b] scanned 4 deposit documents
[phase-21-0b] deposit distribution: { hasAppointment:1, cancelled:1, alreadyLinked:0, needsBackfill:0 }
[phase-21-0b] docs-to-backfill: 0
[phase-21-0a] APPLY — 0 docs to stamp (idempotent)
[phase-21-0b] APPLY — 0 docs to backfill (idempotent)
[phase-21-0] APPLY done — strict-stamped 0, backfilled 0
Audit: be_admin_audit/phase-21-0-strict-and-backfill-1778047714399-b09eefdc
```

Phase 19.0 + Phase 20.0 already cleaned the data — Phase 21.0 strict re-scan confirms zero orphan appointmentType values + zero unbackfilled active deposit-bookings. The 1 deposit with hasAppointment=true is also cancelled, so it's not eligible for backfill (correct behavior).

## Lessons learned this cycle

- **Defense-in-depth at filter layer**: AppointmentCalendarView's `apptMatchesType` uses `migrateLegacyAppointmentType` (SSOT helper) so any post-migration drift in be_appointments still routes to the safe default ('no-deposit-booking') sub-tab rather than orphaning. UI never relies on data being clean.
- **Pair-helper as single writer**: AppointmentFormModal HIDES the save button when locked='deposit-booking' to enforce DepositPanel as the SOLE entry point for deposit-bookings. V12 multi-writer lock — only one helper module writes paired docs, so shape drift between Finance.มัดจำ + จองมัดจำ sub-tab is impossible by construction.
- **Acceptance gate via admin-SDK matrix**: per `feedback_no_real_action_in_preview_eval.md`, never click real action buttons against prod. Instead, write TEST-prefixed fixtures via firebase-admin SDK + run the EXACT query the UI listener uses + apply the SAME filter the component uses. This tests the full chain (data layer → filter logic) without any UI interaction risk.
- **Idempotent migration is the right shape for "preventive" cleanups**: Phase 21.0 migration found 0 docs to migrate because Phase 19.0 + Phase 20.0 already cleaned. The script writes an audit doc anyway so the trail records the safety check ran. Future drift detection: re-run the migration in dry-run mode periodically.

## Outstanding (user-triggered, NOT auto)

- 🚨 H-bis ProClinic full strip pre-launch — delete `brokerClient.js` + `api/proclinic/*` + `cookie-relay/` + `MasterDataTab` + `clinic_settings/proclinic_session*` Firestore docs. Explicitly EXCLUDED from this session.
- Hard-gate Firebase claim — deploy-coupled, skipped under no-deploy.
- /audit-all — pre-release pass.
- Modal extraction — cosmetic refactor.

## Next Todo

Idle. Phase 21.0 fully wrapped — appointment sub-tabs live + deposit-booking pair atomicity in place + acceptance gate verified on real prod data with zero leakage. Open NEW chat for next focus.

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block.
