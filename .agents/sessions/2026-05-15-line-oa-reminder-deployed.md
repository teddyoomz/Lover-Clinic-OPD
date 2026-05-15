# 2026-05-15 — LINE OA Appointment Reminder System (Subagent-Driven Maximum Capacity)

## Summary

User requested LINE OA appointment reminder system. Brainstorming HARD-GATE locked Q1-Q4 (Full / 2-window / Flex Message / both opt-out paths) + per-branch OA pivot (Phase BS V3 leverage). Subagent-Driven Maximum Capacity execution: 4 waves of parallel implementer subagents + 2-stage review per task + 7 polish + 2 deferred fixes = 23 commits shipped + DEPLOYED LIVE to prod via vercel --prod + firebase deploy --only firestore:rules with full Rule B Probe-Deploy-Probe.

## Current State

- master = prod = `84c0af1` (in sync) · build clean
- Live on https://lover-clinic-app.vercel.app · firestore.rules v32
- Vercel crons scheduled: hourly fire + 5min retry; CRON_SECRET in prod env
- 152/152 LINE-reminder tests + 16/16 AV45 LR-1..LR-5 audit GREEN
- Cron endpoint Rule Q L2 smoke-test PASSED (401/401/200)

## Commits

```
84c0af1 docs(agents): LINE OA appointment reminder system DEPLOYED LIVE on prod
f1d0c32 tool(probe-cleanup): admin-SDK cleanup script for chat_conversations probe docs
c4bee75 docs(agents): EOD 2026-05-15+1 — LINE OA reminder system SHIPPED locally
0c59da1 audit(line-reminder): Task 14 — AV45 invariant + LR-1..LR-5 source-grep regression
4a5ba88 test(line-reminder): Task 15 — Rule Q L2 e2e script (8 multi-branch scenarios)
eadf7b0 feat(line-reminder): Task 12 — CustomerDetailView opt-out + per-branch linkage display
dddd204 feat(line-reminder): Task 6 — admin debug-fire endpoint (3 modes + branch-name confirm)
248df98 fix(line-reminder): Wave 2 deferred — link-requests.js writes lineUserId_byBranch[branchId]
bca7217 fix(line-reminder): Wave 2 deferred — open read access for clinic staff on logs
b811464 feat(line-reminder): Task 10 — auto-tick LINE checkbox in 5 modals + backendClient
bb4ebef feat(line-reminder): Task 11 — 3 new sections in LineSettingsTab
01cfc90 feat(line-reminder): Tasks 7+8 — webhook postback handler + opt-out intents
1ae5369 feat(line-reminder): Task 4 — /api/cron/line-reminder-fire + pipeline (LR-1 + LR-3)
d750d40 feat(line-reminder): Task 5 — retry queue with exp backoff (5m / 30m / 2hr / DEAD)
34cab5d fix(line-reminder): Task 9 polish — nameClassName prop + min-w-0/flex-shrink-0 + TFP comment
fd1ceb5 fix(line-reminder): Task 2 polish — defensive guards + empty-node drop + URL-encode
f7a7553 fix(line-reminder): Task 3 polish — tests for 4 untested exports + V14 buildReminderLogDoc guard
8337e19 fix(line-reminder): Task 13 polish — Rule B header '4 endpoints' → '5 endpoints'
795898d fix(line-reminder): Task 1 polish — deep-merge lineReminder in merge/normalize
f0e9db0 feat(line-reminder): Task 9 — CustomerOption shared component + 6 callsites (LR-4)
b5faca1 feat(line-reminder): Task 3 — lineReminderClient (push + customer lookup + backoff)
ace8cd4 config(line-reminder): Task 13 — vercel.json crons + firestore.rules + Rule B probe extension
5405e16 feat(line-reminder): Task 2 — buildReminderFlex + resolveTokens + renderTemplate + parsePostbackData
ddadb87 feat(line-reminder): Task 1 — extend DEFAULT_LINE_CONFIG + validateLineConfig
```

## Files Touched

**NEW** (22): `src/lib/lineReminderTemplate.js`, `src/lib/lineReminderClient.js`, `src/components/CustomerOption.jsx`, `src/components/LineNotifyConfirmation.jsx`, `src/components/backend/LineReminderSettingsSection.jsx`, `LineReminderDebugSection.jsx`, `LineReminderHistoryPanel.jsx`, `CustomerLineSection.jsx`, `api/cron/line-reminder-fire.js`, `api/cron/line-reminder-retry.js`, `api/admin/line-reminder-debug-fire.js`, `scripts/e2e-line-reminder-real-prod.mjs`, `scripts/cleanup-probe-artifacts.mjs`, + 12 test files + AV45 entry in audit-anti-vibe-code SKILL.md.

**MODIFIED** (12): `src/lib/lineConfigClient.js`, `src/lib/backendClient.js`, 6 customer-picker callsites, 5 appt modals, `CustomerDetailView.jsx`, `LineSettingsTab.jsx`, `api/webhook/line.js`, `api/admin/link-requests.js`, `vercel.json`, `firestore.rules`, `.claude/rules/01-iron-clad.md`.

## Decisions

- Brainstorming Q1=Full / Q2=2-window / Q3=Flex Message / Q4=both opt-out paths (admin + DM)
- Per-branch OA pivot: leverage existing Phase BS V3 be_line_configs/{branchId} (NOT chat_config global)
- customer.lineUserId_byBranch[branchId] for multi-branch linkage; legacy customer.lineUserId preserved
- Reschedule button = admin-flag pattern (not self-serve deep-link); customer DMs admin
- Debug Fire 3 modes: dry-run / single / all-with-branch-name-verbatim-confirm
- Quiet hours 22:00-08:00 default; per-branch configurable
- Vercel cron over Firebase Functions (already on Vercel Pro)
- AV45 + LR-1..LR-5 source-grep regression locks (16 assertions, GREEN on first run)
- Subagent-Driven Maximum Capacity: parallel waves where files don't overlap; 2-stage review per task; fresh subagent per task to keep context clean

## Lessons

- Implementation pattern: brainstorming HARD-GATE → spec → plan (TDD per task) → 4 parallel waves of subagents → 2-stage review → polish fix subagents for Important issues → push → user-gated deploy
- `vercel env add` via `echo "VALUE"` adds trailing newline → rm + re-add via `printf` (no newline)
- Rule B probes for new collections (8a/8b/8c): write 403 + anon read 403 (because clinic-staff-token-required)
- Wave 1 Task 9 caught `AppointmentTab.jsx` → `AppointmentCalendarView.jsx` rename from Phase 21.0 — implementer adapted correctly
- TFP doesn't have customer-picker; intent-comment + inert chip is acceptable LR-4 satisfaction
- Tasks 7+8 webhook deferred admin-side write extension (api/admin/link-requests.js) — caught + fixed as Wave 2 deferred item

## Next Todo

1. **User-side enable**: tab=line-settings → นครราชสีมา → lineReminder.enabled=ON + Save
2. **User-side L1 hands-on**: Debug Fire → real LINE message → click ✓ ยืนยัน → verify appointment.status='confirmed'
3. **User confirms LINE Premium tier** (~$60/mo, 5K msgs/mo)
4. **Optional**: full 8-scenario e2e `scripts/e2e-line-reminder-real-prod.mjs --apply --admin-line-user-id=Uxxx`

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block (lines ~2223+).
