---
updated_at: "2026-05-06 EOD — Phase 21.0 trilogy + Phase 22.0 trilogy SHIPPED"
status: "master ahead-of-prod ~60 commits · prod=024f6dd FROZEN · 5857/5862 tests pass · local-only workflow"
current_focus: "Idle. Phase 21.0 (appointment sub-tabs) + Phase 22.0 (sync reset + kiosk branch + schedule branch) all on origin/master."
branch: "master (via worktree claude/unruffled-heyrovsky-f68428)"
last_commit: "d378cf5"
tests: 5857
production_url: "https://lover-clinic-app.vercel.app (FROZEN at V15 #22)"
production_commit: "024f6dd"
firestore_rules_version: 26
storage_rules_version: 2
---

# Active Context

## State
- master=`d378cf5` ahead-of-prod ~60 commits · prod=`024f6dd` FROZEN per no-deploy directive 2026-05-06
- 5857 PASS / 5862 total (5 pre-existing FAIL unrelated — V33.7.G CRLF + V33.8.F CRLF + Phase 15.5B PF.4)
- Local-only workflow (no Vercel deploys; data ops via Rule M admin-SDK from local)

## What this session shipped (10 commits)
- Phase 21.0 main + TDZ hotfix + bis/ter/quater/quinquies/sexies/septies — appointment sub-tabs (5 sub-tabs incl. ทุกประเภท overview), embedded deposit subform, position-stable refactor (empty-grid bug fix), UI polish, occupied-cell border skip, purpose-size parity. Detail: `.agents/sessions/2026-05-06-phase-21-0-appointment-sub-tabs.md` + this session's checkpoint.
- Phase 22.0a sync-status reset (e16ed7b) — Rule M migration, **LIVE-APPLIED on prod**: 65 opd_sessions wiped + 449 pc_customers + 10 pc_appointments + 244 pc_courses syncedAt cleared = **768 docs status-flipped, 0 deletions**. Audit: `be_admin_audit/phase-22-0a-sync-status-reset-1778057983371-ceadb4fe`
- Phase 22.0b kiosk modal branch correctness (2cec108) — fetchDepositOptions branch-filter (doctors/staff via filter helpers), assistants dropdown fix (was BROKEN), confirmCreateDeposit pair-helper wire (atomic be_deposits + be_appointments), confirmCreateNoDeposit explicit branchId stamp
- Phase 22.0c schedule + clinic-prefs branch separation (d378cf5) — clinic_schedules.branchId stamp, list filter by branch, schedule_prefs__{branchId} per-branch doc-id, updateActiveSchedules per-schedule branchId query
- 5 NEW test files: phase-21-0-quinquies-visual-polish (19) + phase-22-0a-sync-status-reset (23) + phase-22-0b-kiosk-modal-branch-correctness (23) + phase-22-0c-schedule-link-branch-separation (16) + phase-21-0-tab-redirect updates

Detail: `.agents/sessions/2026-05-06-phase-21-22-trilogy.md`

## Next action
Idle. All 6 phases (21.0 main+bis+ter+quater+quinquies+sexies+septies + 22.0a+b+c) on origin/master. Open NEW chat to start the next directive.

## Outstanding user-triggered actions
- 🚨 H-bis ProClinic full strip (delete brokerClient.js + api/proclinic/* + cookie-relay/ + MasterDataTab + clinic_settings/proclinic_session* docs)
- Hard-gate Firebase claim (deploy-coupled — skipped under no-deploy)
- /audit-all (pre-release pass)
- Modal extraction (cosmetic refactor)
- Manual-sync-to-be_* UI button (post-22.0a sync reset prepared the data; UI not yet built)
