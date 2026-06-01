---
updated_at: "2026-06-02 — Scheduled Tasks tab (งานอัตโนมัติ & ตารางเวลา) SHIPPED (local, NOT deployed)."
status: "Implemented + full-suite green. NOT deployed (awaiting explicit 'deploy'). 18 commits ahead of prod."
branch: "master"
last_commit: "a62c8105 (L2 script). Feature = 14 commits 4d978b54..a62c8105 (+ spec 75a731b4 + plan ea7aac29)."
tests: "Full suite 15616/0 GREEN. Build clean (2503 modules). Read-only L2 GREEN 11/0 on real prod."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "6aee3de3 LIVE (sticky menu). Scheduled Tasks NOT yet deployed."
firestore_rules_version: "UNCHANGED — no rules change (clinic_settings wildcard covers the status doc). Deploy = vercel + functions only."
---

# Active — Scheduled Tasks tab SHIPPED (local), 2026-06-02

## What shipped (brainstorm→spec→plan→12-task execute, inline)
One admin tab `tab=scheduled-tasks` consolidating ALL 10 Vercel cron/auto-delete jobs:
each can be **enabled/disabled + tune params + see last-run + run-now**, at runtime.
Schedule timing stays read-only (Vercel cron = deploy-time). Decisions: Q1=A full /
scope=A 10-only / safety=A warn-on-disable / location=A new tab.

- Registry `src/lib/scheduledTasksRegistry.js` (10 tasks, single-source param defaults from cores)
- `system_config.scheduledTasks` map (extend `systemConfigClient.js`: defaults/merge/validate/diff)
- `api/_lib/scheduledTaskRuntime.js` — FAIL-SAFE `readScheduledTaskConfig` + non-fatal `writeScheduledTaskStatus`
- **All 10 crons** get a guard: read config → skip if disabled (unless `force`) → thread param `?? coreDefault` → write status
- `api/admin/run-scheduled-task.js` — run-now (dispatch cron w/ server CRON_SECRET + force)
- `ScheduledTasksTab.jsx` + `useScheduledTaskStatus.js` + extracted `SettingsPrimitives.jsx` (Rule C1)
- perm `scheduled_task_management` + nav + tab gate + BackendDashboard render + AV171
- **Retired** the duplicate Firebase `cleanupOldStaffChatMessages` (7d) → Vercel staff-chat-retention (30d) is single deleter (conflict found in the sweep — the "เยอะจนลืม" payoff)

## Verification (Rule Q — honest)
- Full vitest **15616/0** + build clean. Unit + RTL(8) + source-grep + Rule I flow-simulate(F1-F7) + endpoint(5).
- **Read-only L2 GREEN 11/0 on REAL prod**: `readScheduledTaskConfig` returns correct fail-safe defaults vs the real `system_config` doc shape (`scripts/e2e-scheduled-tasks-l2.mjs`).
- **HONEST GAP**: full L1 (open the admin-gated tab, toggle, watch a real cron skip / click run-now) + the `--apply` write-phase L2 = post-deploy + user-authorized (mutation). The cron-respects-config contract is proven at logic + read-path level, not yet end-to-end on the *deployed* crons.

## Next action / outstanding (user)
- **Deploy** (needs explicit "deploy"): vercel (frontend + 10 crons + run-now) + `firebase deploy --only functions` (REMOVES the retired Firebase fn from Cloud Scheduler — confirm the deletion prompt). NO rules change → no Probe-Deploy-Probe. **Strip `public/brainstorm-scheduled-tasks.html` before deploy.**
- Post-deploy: user L1 hands-on + (optional) `node scripts/e2e-scheduled-tasks-l2.mjs --apply`.
- Carryover: cron `stock-lot-cleanup` 03:45 BKK; prior-session V-log entries (sales/EOD+5/+6) unwritten.
