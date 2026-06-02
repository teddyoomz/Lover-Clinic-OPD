---
updated_at: "2026-06-02 — Scheduled Tasks tab DEPLOYED + fully verified LIVE on prod."
status: "DEPLOYED. Full suite green + REAL e2e (L1 Playwright dev + L1 deployed-URL + L2 contract) GREEN + LIVE run-now 200 + deployed cron status-write verified. 2 post-deploy run-now bugs found+fixed. Firebase dup retired from Cloud Scheduler."
branch: "master"
last_commit: "<docs commit — Scheduled Tasks DEPLOYED + LIVE-verified handoff>"
tests: "Full suite 15617/0. Build clean. L1 Playwright dev 1/1 + L1 deployed-URL 1/1 + L2 contract 13/0 + LIVE run-now HTTP 200 + deployed scheduled-cron status-write verified."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "e32df9bc LIVE (Scheduled Tasks). Firebase functions: cleanupOldStaffChatMessages DELETED from Cloud Scheduler."
firestore_rules_version: "UNCHANGED — no rules change (no Probe-Deploy-Probe). Deploy was vercel + firebase functions only."
---

# Active — Scheduled Tasks tab DEPLOYED + verified LIVE, 2026-06-02

## What shipped + DEPLOYED
`tab=scheduled-tasks` "งานอัตโนมัติ & ตารางเวลา" — all 10 Vercel cron/auto-delete jobs in ONE
configurable backend tab (near Settings): enable/disable + tune params + last-run badge + run-now,
all at runtime. The completeness sweep ("ดูทั้ง app มา เอามาให้ครบ") found + retired a duplicate
Firebase `cleanupOldStaffChatMessages` (7d) that was overriding the Vercel staff-chat cron (30d) —
the headline "เยอะจนลืม" payoff. Registry (`scheduledTasksRegistry.js`) + `system_config.scheduledTasks`
+ fail-safe `readScheduledTaskConfig` guard in all 10 crons + run-now endpoint + UI + perm/nav + AV171.
(Architecture detail in SESSION_HANDOFF + spec/plan.)

## DEPLOY (done — user "deploy")
- **Vercel** (frontend + 10 cron guards + run-now endpoint): 3 deploys — initial → `441c0601`
  (static-import attempt) → **`e32df9bc` (FINAL, internal-HTTP run-now)**. Prod LIVE.
- **Firebase functions** (`firebase deploy --only functions`): DELETED `cleanupOldStaffChatMessages`
  from Cloud Scheduler (the 7d/30d conflict gone — staff-chat retention is now Vercel-only @ 30d).
- NO firestore.rules / storage change → no Probe-Deploy-Probe.
- `public/brainstorm-scheduled-tasks.html` mockup stripped before deploy (not shipped).

## 2 post-deploy run-now bugs (found by live re-test, fixed)
The cron *guards* + UI + scheduled crons deployed clean first try; only the manual **run-now**
endpoint had deploy-only bugs (invisible to local vitest — Vercel bundling + admin-SDK init order):
1. **CRON_IMPORT_FAILED** — Vercel's bundler doesn't trace a dynamic computed `import(map[taskId])`
   → the cron module wasn't bundled → 500. Fix attempt: STATIC imports (`441c0601`).
2. **storageBucket conflict** — `verifyAdminOrPermissionToken` inits firebase-admin WITHOUT a
   storageBucket; a statically-imported cron's own `initAdmin()` then no-ops (`getApps().length>0`)
   and `getStorage().bucket()` throws → 500. **Fix (FINAL `e32df9bc`): internal-HTTP trigger** —
   run-now POSTs the task's OWN deployed Vercel cron function (`{cronPath}?force=1` + `CRON_SECRET`),
   so the cron runs in its own function context with its own init. No shared-app conflict.

## Verification (Rule Q — ALL GREEN, on the LIVE deployed system)
- ✅ Full vitest **15617/0** + build clean.
- ✅ **L2 contract 13/0 on REAL prod** (`scripts/e2e-scheduled-tasks-l2.mjs --apply`): write
  `enabled=false` to real `system_config` → `readScheduledTaskConfig` (exact cron path) returns
  false → cron WOULD skip → restored.
- ✅ **L1 Playwright on REAL browser + REAL prod Firebase** (dev server, identical code): render 10
  → toggle non-critical → toggle safety-critical (confirm) → tune param → Save (real client-SDK
  write) → reload→PERSISTED → restore → run-now. **Caught a real UX bug** mocks missed: post-save
  config refire cleared the success banner instantly → fixed (drop `setSaved(false)` from the
  config-refresh effect) + locked (F8).
- ✅ **L1 deployed-URL 1/1** — same spec re-run against `https://lover-clinic-app.vercel.app`
  (`E2E_BASE_URL=…`, webServer skipped, no localhost fallback): the full UI flow ran on the LIVE
  bundle, incl. **run-now → LIVE `/api/admin/run-scheduled-task` endpoint → success banner**.
- ✅ **LIVE run-now HTTP 200** (direct call to the deployed endpoint): `ranBy:loverclinic@…`,
  `cronStatus:200`, result `{scanned:0,deleted:0,freed:0}` (chartEditSessionSweep — safe), and the
  status doc `lastRunAt` went FRESH (02:45→02:59) → run-now → internal-HTTP → real cron exec → status write.
- ✅ **Deployed scheduled cron** respects config + writes status (the 02:45 chartEditSessionSweep
  scheduled run wrote a status doc on the live system).

## Next action (user / future session)
- Nothing outstanding on this feature — DEPLOYED + verified. New work needs explicit go-ahead.
- Carryover (pre-existing): cron `stock-lot-cleanup` 03:45 BKK; prior-session V-log entries
  (sales / EOD+5 / +6) unwritten.
