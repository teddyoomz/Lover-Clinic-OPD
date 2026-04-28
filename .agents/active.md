---
updated_at: "2026-04-29 (session 29) — V15 #7 SHIPPED + phantom branch cleaned + all carry-overs cleared"
status: "Production = cf54400 LIVE (V15 #7). Phantom branch BR-...ae97f911 purged. Live-QA all passed. Carry-overs all resolved."
current_focus: "Phase 15 closed; ready to start Phase 16 (Polish & Final) OR pre-launch H-bis cleanup"
branch: "master"
last_commit: "cf54400"
production_commit: "cf54400"
production_url: "https://lover-clinic-app.vercel.app"
tests: 3312
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
**Phase 15 closed — ready for Phase 16 OR pre-launch cleanup, whichever user picks.**

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
