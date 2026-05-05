---
updated_at: "2026-05-06 EOD — Phase 20.0 + 5a/b/c COMPLETE + SaleTab/AppointmentTab/Rule B audits + BranchSelector provider fix"
status: "master ahead-of-prod (~30 commits) · prod=024f6dd (FROZEN per no-deploy directive) · 5742 tests pass · local-only workflow"
current_focus: "Phase 20.0 fully complete. ProClinic strip done across AdminDashboard. BranchSelector visible in Frontend header. All audits clean. No-deploy directive locked."
branch: "master"
last_commit: "<latest after this commit — see git log>"
tests: 5742
production_url: "https://lover-clinic-app.vercel.app (FROZEN at V15 #22)"
production_commit: "024f6dd"
firestore_rules_version: 26
storage_rules_version: 2
---

# Active Context

## State
- master ahead-of-prod by ~30 commits (all Phase 20.0 + audits + LineSettings status + Rule B docs + App.jsx provider fix)
- prod = `024f6dd` (V15 #22) — FROZEN per user no-deploy directive 2026-05-06
- 5742/5742 tests pass · build clean · firestore.rules v26 unchanged
- Local-only workflow via `npm run dev` ([feedback_local_only_no_deploy.md](C:/Users/oomzp/.claude/projects/F--LoverClinic-app/memory/feedback_local_only_no_deploy.md))

## Phase 20.0 — COMPLETE (Frontend ProClinic strip + BranchSelector)

| Phase | What |
|---|---|
| Spec + plan | `docs/superpowers/specs/2026-05-06-phase-20-0-frontend-be-rewire-and-branch-selector-design.md` + plan |
| Task 0 | Migration script `pc_appointments → be_appointments` (380/380 docs migrated 2026-05-06; audit `phase-20-0-migrate-pc-appointments-1777995770851-5eb70780`); V33.13/V33.14 prefix helpers |
| Task 1 | Flow A queue read swap → `listenToAppointmentsByMonth` |
| Task 2 | Flow D appointment modal CRUD → `createBackendAppointment / updateBackendAppointment / deleteBackendAppointment` |
| Task 3 | Flow C no-deposit booking → be_appointments |
| Task 4 | Flow B deposit options builder → be_* parallel reads |
| Task 5a | Misc strip (`broker.getProClinicCredentials / searchCustomers / getCourses / fetchPatientFromProClinic`) |
| Task 5b | Patient submit (`broker.fillProClinic / updateProClinic / deleteProClinic`) → `addCustomer / updateCustomerFromForm / deleteCustomerCascade` |
| Task 5c | Deposit sync (`broker.submitDeposit / updateDeposit / cancelDeposit`) → `createDeposit / updateDeposit / cancelDeposit` (be_*) + brokerClient import REMOVED entirely |
| Task 6 | BranchSelector in AdminDashboard header + Provider-tree wrap fix (App.jsx) |

## Other audit work (this session)

- **SaleTab field-name audit**: corrected `categoryName` (canonical per productValidation.js — `productCategory` was author guess) + `mainUnitName` canonical-first per Phase 17.2-septies pattern.
- **AppointmentTab roomId migration**: deferred from Phase 18.0; effectiveRoom now matches by `roomId` FK first (rename-safe), falls back to roomName for legacy pre-Phase-18.0 appts.
- **LineSettings per-branch**: already shipped Phase BS V3 (2026-05-04) — added lock-in test bank to verify per-branch wiring intact.
- **Rule B docs**: clarified `artifacts/{APP_ID}/public/data/` prefix on all probe URLs (V15 #22 lesson lock).

## Frontend ProClinic strip — final state

AdminDashboard.jsx is fully on `be_*`. ZERO `broker.*` calls remain. brokerClient.js + api/proclinic/* + cookie-relay still EXIST in repo (used by MasterDataTab dev-only sync per Rule H-bis) but the AdminDashboard tree imports nothing from those paths.

## Test count growth

- 5463 (start of session) → 5742 (+279 tests across Phase 20.0 + audits + V33.13/14 + AppointmentTab roomId + SaleTab audit + LineSettings status + brokerClient strip)

## Outstanding (user-triggered)

- 🚨 H-bis ProClinic strip pre-launch (delete `brokerClient.js` + `api/proclinic/*` + `cookie-relay/` + MasterDataTab + `clinic_settings/proclinic_session*` Firestore docs) — explicitly EXCLUDED from this session per user directive 2026-05-06
- Hard-gate Firebase claim (deploy-coupled — skipped under no-deploy)
- Modal extraction (cosmetic refactor — deferred; AdminDashboard tabs are panels not modals)

## Local-only workflow lock

Per user 2026-05-06: "จะ prod เหี้ยไร เราจะทำ ใน local ไอ้ควยนฃ" → no Vercel deploys; everything runs on `npm run dev`. Frontend `lover-clinic-app.vercel.app` stays frozen at V15 #22 indefinitely. Migrations via Rule M (admin-SDK + `vercel env pull`) still apply for production data ops as needed.

## Next action

Idle. All work in this cycle complete. Awaiting user direction.
