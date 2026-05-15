---
updated_at: "2026-05-15 EOD+2 — LINE OA reminder system DEPLOYED LIVE on prod"
status: "master=84c0af1 · prod LIVE on lover-clinic-app.vercel.app · firestore rules v32"
branch: "master"
last_commit: "84c0af1 docs(agents): LINE OA appointment reminder system DEPLOYED LIVE on prod"
tests: "152/152 LINE-reminder + 16/16 AV45 LR-1..LR-5 audit GREEN; ~10,035 cumulative vitest GREEN"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "84c0af1"
firestore_rules_version: 32
storage_rules_version: 2
---

# Active Context

## State

- master = prod = `84c0af1` · in sync · build clean
- LINE OA appointment reminder system LIVE (23 commits shipped this session)
- Vercel crons scheduled (hourly fire + 5min retry); CRON_SECRET in prod env
- firestore.rules v32: be_line_reminder_log + postback_log (read: isClinicStaff, write: false)

## What this session shipped

- V66 BRANCH make-fresh fix + 2,477 orphan cleanup + deploy (morning — separate work)
- LINE OA Appointment Reminder system 15 tasks via subagent-driven Maximum Capacity (4 waves parallel + 7 polish fix + 2 deferred fixes)
- Per-branch OA architecture: leverages existing Phase BS V3 be_line_configs/{branchId}; adds .lineReminder block + customer.lineUserId_byBranch[branchId]
- Vercel crons (fire hourly + retry 5min) + webhook postback handler + opt-out intents + Flex Message + idempotency log + retry queue
- UI: 🟢/⚪️ LINE badge in 6 customer pickers + auto-tick in 5 appt modals + 3 LineSettingsTab sections + CustomerDetailView opt-out
- AV45 + LR-1..LR-5 source-grep regression locks PERMANENT (16/16 PASS on first run)
- Deploy: CRON_SECRET → Vercel env (newline-strip fix), vercel --prod ✅, firebase rules deploy with Rule B Probe-Deploy-Probe ✅, cron endpoint Rule Q L2 smoke-test ✅ (401/401/200), 5 probe artifacts cleaned

Checkpoint: [.agents/sessions/2026-05-15-line-oa-reminder-deployed.md](sessions/2026-05-15-line-oa-reminder-deployed.md)

## Next action

User manual hands-on test (Rule Q L1 final verification — Claude can't click the LINE message):
1. tab=line-settings → นครราชสีมา → toggle lineReminder.enabled=ON → Save
2. Debug Fire → mode=ยิงเฉพาะลูกค้า + admin's record → "ทดสอบเลย"
3. Real LINE message → click ✓ ยืนยัน → verify status='confirmed'
4. DM "หยุดแจ้งเตือน" → verify notifyOptOut=true

## Outstanding user-triggered actions

- Confirm LINE Premium tier active for นครราชสีมา OA (~$60/mo, 5K msgs)
- Optional: full 8-scenario e2e `node scripts/e2e-line-reminder-real-prod.mjs --apply --admin-line-user-id=Uxxx`
