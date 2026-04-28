---
updated_at: "2026-04-29 (session 29) — Phase 16.5 Remaining Course tab SHIPPED + pushed (1 commit unpushed-to-prod)"
status: "Production = cf54400 LIVE. master = 6aae9c3 (Phase 16.5 ready for deploy). 3424/3424 tests pass."
current_focus: "Phase 16.5 done; awaiting deploy auth OR proceed to 16.3 System Settings (next sub-phase)"
branch: "master"
last_commit: "6aae9c3"
production_commit: "cf54400"
production_url: "https://lover-clinic-app.vercel.app"
tests: 3424
firestore_rules_version: 20
storage_rules_version: 2
---

# Active Context

## State
- master = `cf54400` · production = `cf54400` (V15 #7 LIVE) · 0 commits unpushed-to-prod
- **3312/3312** focused vitest pass · build clean · working tree clean
- V15 #7 deployed 2026-04-29 (session 29) — Probe-Deploy-Probe 6/6+5/5 both sides ✓; HTTP smoke 200/200/401 ✓
- Phantom branch cleanup complete: `BR-1777095572005-ae97f911` purged (51 ops; auditId `cleanup-phantom-branch-1777399906398`)

## What this session shipped (2026-04-29 — session 29, ops-only)
- V15 #7 combined deploy: vercel `lover-clinic-2gvg69lvr-…` aliased to `lover-clinic-app.vercel.app`; firebase rules re-published (no schema change)
- Phantom branch cleanup via `/api/admin/cleanup-phantom-branch`: list (DRY-RUN) → delete (51 ops in 1 writeBatch) → verify all-zeros
- Memory lock: `feedback_background_task_completion.md` — don't poll log files with grep when a Bash command runs in background; the task-notification signal is authoritative

## Next action
**Phase 16.5 shipped (commit `6aae9c3`).** Awaiting deploy auth OR continue to 16.3 System Settings (recommended next sub-phase).

## Phase 16.5 Remaining Course tab — shipped 2026-04-29
- `src/lib/remainingCourseUtils.js` (5 pure helpers + Thai status enum)
- `src/lib/courseExchange.js` extended — `applyCourseCancel` + `buildChangeAuditEntry kind:'cancel'`
- `src/lib/backendClient.js` — NEW `cancelCustomerCourse` (runTransaction; mirrors refund)
- 3 single-purpose modals: Cancel/Refund/Exchange
- Tab + Row in `src/components/backend/reports/RemainingCourse{Tab,Row}.jsx`
- nav entry + dashboard wiring + REPORT_LABELS update
- 5 test files (+112 tests: utils 34 / cancel 18 / modals 15 / flow-simulate 16 / source-grep 29)
- Browser preview ✓ (tab renders, 4 status options, empty state, export btn)

## Live-QA verification (all passed 2026-04-29)
- Assistants picker · advisor dropdown · location lock · customer-name new-tab · appt delete · calendar column-width · negative-stock repay · default-branch auto-pick · self-created treatment refresh — **9/9 ✓**

## Carry-overs cleared (2026-04-29)
- LineSettings creds — user configured channel access token + secret (working)
- Customer ID backfill — confirmed not needed (read-time backfill in saleReportAggregator suffices)
- TEST/E2E prefix discipline — confirmed not needed (drift catchers V33.10/.11/.12 already cover the rule)

## Phase 16 — Polish & Final (open scope)
- 16.1 Smart Audience tab (rule-builder over be_customers + be_sales)
- 16.2 Clinic Report tab (consolidated dashboard — trend + retention + top services)
- 16.3 System Settings tab (per-tab visibility + default ranges + feature flags)
- 16.4 Order tab (be_orders — purchase orders separate from quotation/sale)
- 16.5 Remaining Course tab (derived view be_customers[].courses[].qtyRemaining)
- 16.6 Patient Referral — verify if covered by DocumentTemplatesTab docType
- 16.7 Google Calendar OAuth (optional — user can skip)
- 16.8 `/audit-all` full-stack run

## Pre-launch cleanup (Rule H-bis — bedrock requirement before go-live)
- Strip MasterDataTab.jsx · brokerClient.js · api/proclinic/* · cookie-relay/ · CloneTab.jsx
- Drop pc_* Firestore rules (no remaining caller)
- Probe-Deploy-Probe re-run after strip (probe list shrinks 6→4-5)
