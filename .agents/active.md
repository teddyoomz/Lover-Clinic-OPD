---
updated_at: "2026-05-06 EOD — Phase 20.0 source-only complete (Tasks 0-4 + 6); Phase 5 misc-strip DEFERRED"
status: "master ahead-of-prod (9 commits: 1 skill + 2 docs + 6 feat) · prod=024f6dd · 5631 tests pass · awaiting V15 #23 deploy auth"
current_focus: "Phase 20.0 5/6 phases shipped to master + pushed; Phase 5 misc-broker-strip deferred (needs user-attended session for patient-submit + deposit-sync rewire)"
branch: "master"
last_commit: "c314edf"
tests: 5631
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "024f6dd"
firestore_rules_version: 26
storage_rules_version: 2
---

# Active Context

## State
- master ahead-of-prod by 8 source commits (Phase 20.0 Tasks 0+1+2+3+4+6 + tests + handoff). prod still on `024f6dd` (V15 #22 LIVE) — Phase 20.0 source not yet deployed.
- 5631/5631 tests · build clean · firestore.rules v26 unchanged
- Phase 20.0 migration `--apply` DONE on prod 2026-05-06 (audit `phase-20-0-migrate-pc-appointments-1777995770851-5eb70780`): 380/380 pc_appointments embedded → be_appointments docs migrated · idempotent re-run verified · be_appointments doc count 27 → 407
- Phase 20.0 status: **5 of 6 phases shipped to master** (Tasks 0-4 + 6)

## Phase 20.0 — what shipped this session

| Task | Phase | Commit | What |
|---|---|---|---|
| spec | Phase 20.0 design | `70e2ae8` | docs/superpowers/specs/2026-05-06-phase-20-0-frontend-be-rewire-and-branch-selector-design.md |
| plan | Phase 20.0 plan | `5907bdf` | docs/superpowers/plans/2026-05-06-phase-20-0-frontend-be-rewire-and-branch-selector.md |
| 0 | Migration prep + V33.13/14 + --APPLY | `08a623b` | scripts/phase-20-0-migrate-pc-appointments-to-be.mjs + V33.13 createTestAppointmentId + V33.14 createTestDepositId + 380 docs migrated to be_appointments + Rule 02 V33.13/14 sections |
| 1 | Flow A queue read-source | `749c8ec` | listenToAppointmentsByMonth helper + AdminDashboard reads be_appointments via scopedDataLayer + 6 broker.syncAppointments calls + 4 pc_appointments getDoc REMOVED + 3 sync UI buttons + apptSyncing state REMOVED |
| 2 | Flow D appointment modal CRUD | `7eaceaa` | createBackendAppointment / updateBackendAppointment / deleteBackendAppointment / getCustomerAppointments + listStaff+listDoctors replace broker.{create,update,delete,list}Appointment + getLivePractitioners + payload field rename + AP1_COLLISION friendly UX |
| 3 | Flow C no-deposit booking | `c3b33ad` | confirmCreateNoDeposit + confirmUpdateAppointment + handleNoDepositCancel rewired to be_appointments; opd_sessions.appointmentProClinicId field semantics now = be_appointments id; AP1_COLLISION handled both branches |
| 4 | Flow B deposit booking options | `1781d1f` | fetchDepositOptions rebuilt from listDoctors+listStaff+listExamRooms+listAllSellers + canonical TIME_SLOTS + static paymentMethods/sources lists; broker.getDepositOptions removed |
| 6 | BranchSelector (Item 2) | `c314edf` | <BranchSelector /> in AdminDashboard header; useSelectedBranch hook; listenToAppointmentsByMonth + getAppointmentsByMonth opts {} (auto-inject); selectedBranchId in deps array; 4 listener call sites |

Migration audit: `be_admin_audit/phase-20-0-migrate-pc-appointments-1777995770851-5eb70780` (380/380 docs migrated 2026-05-06; idempotent re-run audit `phase-20-0-migrate-pc-appointments-1777995789946-ced03af0` — 0 writes).

**Test count growth**: 5463 → 5631 (+168 tests across 6 new test files: phase-20-0-migration-script + flow-a + flow-d + flow-c + flow-b + task-6 + V33.13/14 drift catchers).

## Phase 5 — DEFERRED (pending user-attended session)

Phase 5 (Misc broker strip) deferred — touchpoints discovered during Phase 4 are larger than safe for an unattended session. 17 remaining broker calls in AdminDashboard.jsx span 4 connected flows that need coordinated rewire:

- **broker.getProClinicCredentials** (line 483) — settings panel test-connection. Pure removal.
- **broker.searchCustomers** (lines 557, 2601) — appointment-tab patient search + main customer search. Need listCustomers + client filter or new searchBackendCustomers helper.
- **broker.getCourses** (lines 1419, 2476, 2618) — customer detail courses fetch (3 sites). Need cross-reference from session.brokerProClinicId → be_customers doc-id (current schema stores brokerProClinicId as ProClinic numeric ID, not be_customers id).
- **broker.fillProClinic / updateProClinic / deleteProClinic / fetchPatientFromProClinic** (lines 2048, 2051, 2072, 2156, 2159, 2253, 2266, 2560, 2617) — patient submit lifecycle (~10 callsites). Need addCustomer / updateCustomerFromForm / deleteCustomerCascade / getCustomer rewire + opd_sessions.brokerProClinicId field repurposing OR new opd_sessions.beCustomerId field with migration.
- **broker.submitDeposit / updateDeposit / cancelDeposit** (lines 2284, 2287, 2328, 2374) — deposit-to-ProClinic auto-sync workflow. Need createDeposit / updateDeposit / cancelDeposit (be_*) + customerId resolution + opd_sessions.depositProClinicId field repurposing.

**Recommended Phase 5 sub-phases for next session**:
- 5a (small): strip getProClinicCredentials + getCourses (use customer.courses[]) + searchCustomers (use listCustomers filter)
- 5b (medium): patient-submit fillProClinic/updateProClinic → addCustomer/updateCustomerFromForm. opd_sessions.brokerProClinicId field repurposed to store be_customers id.
- 5c (medium): deposit-sync submitDeposit/updateDeposit/cancelDeposit → be_deposits createDeposit/updateDeposit/cancelDeposit. opd_sessions.depositProClinicId field repurposed.

Each sub-phase independently testable + ship-able.

## Decisions (this session — one-line each)
- Modal extraction from AdminDashboard.jsx DEFERRED — the appointment / deposit / no-deposit flows are large stateful tab-content panels (not true overlay modals); pragmatic call to ship data-layer rewire first. Cosmetic file-restructuring is a separate refactor. Brainstorm Q2 (b) extraction can be revisited post-Phase-5.
- Phase 4 `broker.deposit*` calls retained (Phase 5c scope) — patient-submit-creates-be_customers must land before deposit-sync can reliably look up the customerId. Splitting Phase 4/5 along this boundary keeps each PR's scope coherent.
- Phase 19.0 Q1 Option B uniform mapping reused for Phase 0 migration — `mapPcTypeToBe` mirrors `mapAppointmentType` exactly so a doc migrated by Phase 19.0 (in-place) and one migrated by Phase 20.0 (pc → be) end up with the same `appointmentType` shape. Cross-script consistency locked by M1.9 test (imports both helpers, asserts equality across 8 legacy values).
- Forensic-trail field `pcAppointmentTypeLegacyValue` added to migrated docs — preserves original ProClinic value (`'follow'` / `'sales'` / null) so admin can bulk re-classify post-migration if Q1 uniform default is too coarse for their workflow.

## Next action

User-triggered:
1. **Authorize V15 #23 deploy** — Phase 20.0 source ready (8 source commits ahead of prod, no rules change). Combined `vercel --prod --yes` + idempotent rules re-publish.
2. **Authorize Phase 5a/5b/5c** — sub-phase scope locked; each is independently small + shippable.
3. **Optional Phase 20.0 polish**: modal extraction (brainstorm Q2 b deferred) — file restructuring without functional change. Low priority.

Currently idle — awaiting user direction.

## Outstanding user-triggered actions (legacy from prior sessions)
- Update Rule B docs in `01-iron-clad.md` to clarify `artifacts/{APP_ID}/public/data/` prefix on probe URLs
- SaleTab field-name audit (post-Phase-17.2-septies pattern)
- Full AppointmentTab roomId migration (deferred from Phase 18.0)
- LineSettings พระราม 3 per-branch redesign · Hard-gate Firebase claim · /audit-all readiness · 🚨 H-bis ProClinic strip pre-launch (Phase 5 partially closes this for AdminDashboard layer)
