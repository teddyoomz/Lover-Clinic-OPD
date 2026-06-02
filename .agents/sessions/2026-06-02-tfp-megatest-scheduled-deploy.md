# Checkpoint — 2026-06-02 · Scheduled Tasks deploy + TFP mega-test + CSV export

## Summary
Deployed the Scheduled Tasks tab + a resolveParam 4th-defense-layer (vercel-only, post-deploy-verified). Then ran the biggest test yet on TFP (the app core): real-prod L2 function chain (19/0) + real-browser L1 component orchestration (2/0), proving every historical bug class (V104/V36/V108/V44-45/V142/Rule O) holds on real prod. Exported all OPD customers → CSV for FB Custom Audience. No app bug found on tested paths; only test-debt + my own test bugs (fixed).

## Current State
- master = `c63c3201`; prod = `8e6a1d06` LIVE (Scheduled Tasks + resolveParam). Commits after prod = tests/scripts/docs only → bundle unchanged.
- Full suite 15720/0 (last run = scheduled-tasks pre-deploy gate). TFP mega L2 19/0 + L1 2/0 on real prod. param-safety 94/0. live-guard 21/21.
- No rules/storage/functions change pending. Firebase `cleanupOldStaffChatMessages` retired from Cloud Scheduler.
- Prod clean (0 TEST customers, verified post-test). OPD→CSV at `F:\FB\targeting\opd-customers.csv` (112 phones).
- Honest: tested paths clean; "zero bugs whole-app" not claimable.

## Commits (this session, newest first)
```
c63c3201 docs(agents): TFP mega-test complete (L1 2/0 + L2 19/0) + CSV export
34881fff test(tfp): MEGA L1 — real-browser component verification (2/0)
2f7a6350 feat(scripts): export OPD customers → CSV for FB targeting
981d2c5f test(tfp): MEGA L2 — real client-SDK function chain (19/0)
7d5eb591 docs(agents): resolveParam 4th defense layer DEPLOYED
8e6a1d06 harden(scheduled-tasks): resolveParam clamps corrupt cron param  ← prod
4fe7a0da test(scheduled-tasks): param-safety evidence (94/0)
a0aeb0bd test(scheduled-tasks): live adversarial guard probe (21/21)
```
(Earlier in session: scheduled-tasks deploy commits 4lyqa48xe→441c0601→e32df9bc + run-now fixes.)

## Files Touched
- src/lib/scheduledTasksRegistry.js (resolveParam) + 5 crons (chat-history/staff-chat/stock-movement/patient-link/opd-session retention/cleanup — resolveParam wiring)
- tests/scheduled-task-runtime.test.js (+8 fail-safe) · tests/scheduled-tasks-param-safety.test.js (NEW 94)
- scripts/e2e-scheduled-tasks-live-guard.mjs (NEW) · scripts/e2e-tfp-mega-test.mjs (NEW) · scripts/export-opd-customers-csv.mjs (NEW)
- tests/e2e/tfp-mega-l1.spec.js (NEW) · playwright.config.js (E2E_BASE_URL override)
- .agents/active.md · SESSION_HANDOFF.md

## Decisions (1-line each)
- resolveParam: null/undefined→default (matches `??`), valid→unchanged, 0/neg/>max→clamp, NaN→default. No-op for current prod config.
- run-now dispatch = internal-HTTP to the cron's own deployed fn (avoids shared-admin storageBucket conflict + Vercel dynamic-import bundling).
- TFP L2 via real CLIENT SDK (not admin) = exact UI code path + real rules/indexes; admin only for fixture setup/cleanup.
- TFP L1 uses fresh TEST customer (admin beforeAll) + injects selectedBranchId (branch with doctors); never a real/hardcoded customer.
- CSV: customer's OWN phone only (never emergencyPhone); dob YYYYMMDD CE; file OUTSIDE repo.

## Next Todo
- Idle. Optional follow-ups: re-enable 4 stale TFP e2e specs (fresh-fixture pattern); write prior-session V-log entries (sales/EOD+5/+6); cron stock-lot-cleanup 03:45 BKK carryover.

## Resume Prompt
See SESSION_HANDOFF.md Current State (top entry) + `.agents/active.md`. master=c63c3201, prod=8e6a1d06 LIVE, 15720/0. Next: idle — await user direction.
