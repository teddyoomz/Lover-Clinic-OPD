---
updated_at: "2026-05-06 EOD — Phase 21.0 SHIPPED + acceptance gate 8/8 PASS"
status: "master ahead-of-prod (~50 commits) · prod=024f6dd FROZEN · 5771/5777 tests pass · local-only workflow"
current_focus: "Phase 21.0 fully complete. Appointment sub-tabs (4 types) + deposit-booking pair atomicity + acceptance gate verified on real prod data."
branch: "master (via worktree claude/unruffled-heyrovsky-f68428)"
last_commit: "fa366f2"
tests: 5771
production_url: "https://lover-clinic-app.vercel.app (FROZEN at V15 #22)"
production_commit: "024f6dd"
firestore_rules_version: 26
storage_rules_version: 2
---

# Active Context

## State
- master ahead-of-prod by ~50 commits (Phase 20.0 wrap + Phase 21.0)
- prod = `024f6dd` (V15 #22) — FROZEN per user no-deploy directive 2026-05-06
- 5771/5777 tests pass · build clean · firestore.rules v26 unchanged
- Local-only workflow (no Vercel deploys; data ops via Rule M admin-SDK from local)
- Phase 21.0 acceptance gate: 8/8 PASS — per-branch × per-type isolation matrix verified on real prod Firestore with TEST-APPT-* fixtures, zero leakage, 16 fixtures cleaned

## Phase 21.0 — COMPLETE (Appointment sub-tabs + deposit-booking pair atomicity)

| Phase | What |
|---|---|
| Spec + plan | `docs/superpowers/specs/2026-05-06-phase-21-0-appointment-sub-tabs-design.md` |
| Nav restructure | `navConfig.js` — PINNED_ITEMS=[], NEW NAV_SECTIONS[0]='appointments-section' with 4 sub-tabs (จองไม่มัดจำ / จองมัดจำ / คิวรอทำหัตถการ / คิวติดตามอาการ) |
| View | RENAME AppointmentTab.jsx → AppointmentCalendarView.jsx + `appointmentType` prop + typedDayAppts filter |
| Modal | AppointmentFormModal `lockedAppointmentType` prop + locked chip + deposit-redirect banner |
| Pair helper | NEW `src/lib/appointmentDepositBatch.js` — atomic paired (be_deposits + be_appointments) writes via writeBatch |
| DepositPanel | hasAppointment routes to pair helper; cancels with linkedAppointmentId use pair-cancel |
| BackendDashboard | 4 new tab cases + `?tab=appointments` legacy redirect |
| Permissions | 4 sub-tab gates (same set as legacy 'appointments') |
| Migration script | NEW `phase-21-0-migrate-appointment-types-strict.mjs` (Rule M two-phase, idempotent, 0 docs to migrate — Phase 19.0/20.0 already cleaned) |
| Acceptance gate | NEW `phase-21-0-acceptance-gate.mjs` — admin-SDK matrix verification, 8/8 PASS |

## Commits this chat

- `82dbb84` — docs(phase-21-0): spec
- `fa366f2` — feat(phase-21-0): appointment sub-tabs + deposit-booking pair atomicity

## Test count growth

5642 → 5777 (+135 net; 5771 PASS, 6 pre-existing FAIL unrelated — V33.7.G CRLF + V33.8.F CRLF + Phase 15.5B.PF.4)

Phase 21.0 focused suite: 111/111 PASS across 8 NEW test files.

## Outstanding (user-triggered)

- 🚨 H-bis ProClinic strip pre-launch (delete brokerClient.js + api/proclinic/* + cookie-relay/ + MasterDataTab + clinic_settings/proclinic_session* docs)
- Hard-gate Firebase claim (deploy-coupled — skipped under no-deploy)
- /audit-all (pre-release pass)
- Modal extraction (cosmetic refactor)

## Local-only workflow lock

Per user 2026-05-06: "จะ prod เหี้ยไร เราจะทำ ใน local ไอ้ควย" → no Vercel deploys; everything runs on `npm run dev`. Frontend `lover-clinic-app.vercel.app` stays frozen at V15 #22 indefinitely. Migrations via Rule M (admin-SDK + `vercel env pull`) for production data ops. Pushed to origin/master without any Vercel deployment trigger.

## Phase 21.0 verification artifacts

- Audit doc: `be_admin_audit/phase-21-0-strict-and-backfill-1778047714399-b09eefdc`
- Acceptance gate: 16 TEST-APPT-* fixtures created + 16 cleaned up (V33.13 prefix discipline)
- Per-branch × per-type matrix: 8/8 cells PASS, zero leakage between branches OR types

## Next action

Idle. Phase 21.0 fully wrapped — open NEW chat for next focus. The 4 outstanding user-triggered items are all available when user authorizes.
