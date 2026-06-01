---
updated_at: "2026-06-02 — Scheduled Tasks tab SHIPPED + L1/L2 e2e GREEN on real prod (local, NOT deployed)."
status: "Implemented + full-suite green + REAL e2e (L1 Playwright + L2 contract) GREEN. NOT deployed (awaiting 'deploy'). 20 commits ahead of prod."
branch: "master"
last_commit: "ead4bbe8 (L1 e2e + success-banner fix)."
tests: "Full suite 15617/0. Build clean (2503 modules). L1 Playwright 1/1 + L2 contract 13/0 on REAL prod."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "6aee3de3 LIVE. Scheduled Tasks NOT yet deployed."
firestore_rules_version: "UNCHANGED — no rules change. Deploy = vercel + firebase functions only (no Probe-Deploy-Probe)."
---

# Active — Scheduled Tasks tab SHIPPED + e2e-verified (local), 2026-06-02

## What shipped
`tab=scheduled-tasks` "งานอัตโนมัติ & ตารางเวลา" — all 10 Vercel cron/auto-delete jobs in one tab:
enable/disable + tune params + last-run + run-now, runtime. Found+retired a duplicate Firebase
`cleanupOldStaffChatMessages` (7d) that overrode the Vercel staff-chat cron (30d). Registry +
`system_config.scheduledTasks` + fail-safe `readScheduledTaskConfig` guard in all 10 crons +
run-now endpoint + UI + perm/nav + AV171. (Architecture detail in SESSION_HANDOFF + spec/plan.)

## Verification (Rule Q — REAL e2e, per user "ผ่านทุกอย่างจริงๆ ถึง deploy ได้")
- ✅ Full vitest **15617/0** + build clean.
- ✅ **L2 e2e 13/0 on REAL prod** (`scripts/e2e-scheduled-tasks-l2.mjs --apply`): write `enabled=false` to real `system_config` → `readScheduledTaskConfig` (exact cron path) returns false → **cron WOULD skip** → restored. Config↔cron-read contract end-to-end on real data.
- ✅ **L1 Playwright e2e 1/1 on REAL browser + REAL prod** (`tests/e2e/scheduled-tasks-tab.spec.js`): render 10 tasks → toggle non-critical → toggle safety-critical (confirm) → tune param → Save (real prod write via client SDK) → reload→PERSISTED → restore → run-now (POST fires → graceful banner). **Caught a real UX bug** mocks missed: post-save config refire cleared the success banner instantly → fixed (drop `setSaved(false)` from the config-refresh effect) + locked (F8).
- ✅ prod restored pristine (`scheduledTasks` + `__l1probe` deleted; no test litter).
- ⚠️ **Inherently post-deploy** (can't pre-deploy): the *deployed* Vercel cron actually skipping when disabled (code is L2-proven; needs the guard on Vercel) + run-now hitting the *live* serverless endpoint (vite doesn't serve `/api`; wiring is L1-proven, dispatch unit-tested). Verify immediately after deploy.

## Next action (user)
- **Deploy** (explicit "deploy", V18): vercel (frontend + 10 crons + run-now) + `firebase deploy --only functions` (REMOVES retired fn — confirm prompt). NO rules change → no Probe-Deploy-Probe. **Strip `public/brainstorm-scheduled-tasks.html` before deploy.**
- Post-deploy: re-run L1 spec against the live URL + run-now a safe task (real dispatch).
- Carryover: cron `stock-lot-cleanup` 03:45 BKK; prior-session V-log entries (sales/EOD+5/+6) unwritten.
