---
updated_at: "2026-05-07 EOD — Phase 24.0-vicies-novies through octies SHIPPED + 2 deploys + master-data fully sync'd"
status: "master = prod = e36811f (in sync after octies deploy) · 6646/6646 tests pass · per-branch catalog isolation working"
branch: "master"
last_commit: "e36811f"
tests: 6646
production_url: "https://lover-clinic-app.vercel.app (LIVE at e36811f)"
production_commit: "e36811f"
firestore_rules_version: 27
---

# Active Context

## State
- master = prod = `e36811f` · 6646/6646 tests pass · build clean
- 2 deploys this session (combined `vercel + firestore:rules` mid-session, then vercel-only at end)
- 7-commit Phase 24.0-vicies-novies family; **per-branch catalog isolation now works correctly** (migrate stamps branchId, tabs filter by branchId)

## What this session shipped (~7 commits — Phase 24.0-vicies-novies family)
- **vicies-novies** (`6bb00f0`) — OPD-save auto-attach customer-later bookings via unique session-id link (handleOpdClick post-save hook + provisionOpdLinkForBookingPair)
- **vicies-novies-bis** (`6eb6b28`) — handleDepositSync duplicate-deposit fix (kiosk DEPOSIT queue path was missed in vicies-novies; now checks linkedDepositId + uses updateDeposit)
- **vicies-novies-ter** (`3301d5e`) — sync source: Trial → Production ProClinic + NAKHON_BRANCH_ID filter + master_data/* wipe script (15 docs deleted; combined deploy completed)
- **vicies-novies-quater** (`15cd0ce`) — local-only master-data sync orchestrator (firebase-admin + custom token + master.js handler invocation)
- **vicies-novies-sexies** (`3d02ad8`) — IMPORT_TARGET_BRANCH_ID renamed + switched นครราชสีมา → พระราม 3 (per user pivot: empty branch for testing)
- **vicies-novies-septies** (`1b58cb4`) — WRONG (catalog tabs → allBranches:true) — REVERTED in octies
- **vicies-novies-octies** (`e36811f`) — REAL fix: migrate mappers stamp branchId from selectedBranchId at migrate-time; 7 mappers + 7 wrappers + MasterDataTab handleMigrate all updated; per-branch isolation preserved

Detail: `.agents/sessions/2026-05-07-phase-24-0-vicies-novies-octies-saga.md`

## Next action
Idle. Open new chat for next directive.

## Outstanding (user-triggered)
- Optional: admin-SDK script to wipe ~328 product / ~370 course / etc. branchless zombies (legacy from earlier trial migrations) — they're invisible in UI but still occupy storage. User said "if needed".
- 🚨 H-bis ProClinic full strip (`brokerClient.js` + `api/proclinic/*` + `cookie-relay/` + `MasterDataTab` + `clinic_settings/proclinic_session*`) — DEFERRED (master-data sync now switched to production via UI; strip still pending pre-launch)
- Hard-gate Firebase custom claim (deploy-coupled — pending)
- /audit-all pre-release pass
- BackendDashboard nav restructure (deferred)
