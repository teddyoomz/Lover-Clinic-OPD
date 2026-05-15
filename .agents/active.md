---
updated_at: "2026-05-15 LATE+2 — LINE OA Appointment Reminder System DEPLOYED ✅ (22 commits LIVE on prod)"
status: "master=ace8cd4-ish prod equivalent · prod LIVE on lover-clinic-app.vercel.app · firestore.rules deployed · CRON_SECRET in Vercel prod env"
branch: "master"
last_commit: "(cleanup-probe-artifacts script — post-deploy)"
tests: "152/152 LINE-reminder tests GREEN · 16/16 AV45 LR-1..LR-5 audit GREEN · ~10,035+ cumulative vitest GREEN"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "deployed from master HEAD"
firestore_rules_version: 32
storage_rules_version: 2
---

# Active Context

## ✅ LINE OA Appointment Reminder System — DEPLOYED LIVE

### Deployment summary

| Step | Result |
|---|---|
| CRON_SECRET added to Vercel prod env | ✅ (after newline-strip fix) |
| `vercel --prod --yes` | ✅ Live at https://lover-clinic-app.vercel.app |
| Rule B pre-deploy probes | ✅ Probe 1 (chat_conversations) = 200; Probes 8a/8b (be_line_reminder_log + postback_log anon write) = 403 |
| `firebase deploy --only firestore:rules` | ✅ Deploy clean (rules version 32) |
| Rule B post-deploy probes | ✅ Probe 1 unchanged = 200; Probes 8a/8b/8c (anon read also) = 403 |
| Probe artifacts cleanup | ✅ 5 chat_conversations probe docs deleted via admin-SDK |
| Cron endpoint smoke test | ✅ Auth gating works (401/401/200); pipeline executes; Bangkok TZ correct |

### Cron endpoint live verification (Rule Q L2 — real prod HTTP)

```
POST https://lover-clinic-app.vercel.app/api/cron/line-reminder-fire
Authorization: Bearer FCk-CD29VSscn2sves-inzlU3e2LnKDhugDjA2Xk7W8
→ 200 {"ok":true,"currentHour":12,"tomorrow":"2026-05-16","today":"2026-05-15","summary":{"branchesProcessed":0,"totalAppts":0,"sent":0,"failed":0,"skipped":0}}
```

`branchesProcessed: 0` = no branch has `lineReminder.enabled=true` yet (expected — admin needs to enable per branch in line-settings tab).

### What's live in prod

- Vercel: 22 commits LIVE (Wave 1 + 2 + 3 + 4 + 2 deferred fixes + cleanup script)
- Firestore rules version 32: `be_line_reminder_log` + `be_line_reminder_postback_log` rules (read: isClinicStaff, write: false)
- Vercel crons configured: `0 * * * *` fire + `*/5 * * * *` retry (will start firing on next cron tick boundary)
- `CRON_SECRET` injected into prod env (random 32-byte base64url)

### Final state breakdown

**152 LINE reminder tests** across 10 files (all GREEN):
- `tests/line-reminder-config-defaults.test.js` (11 tests)
- `tests/lineReminderTemplate.test.js` (12 tests)
- `tests/lineReminderTemplate-parse-postback.test.js` (5 tests)
- `tests/lineReminderClient.test.js` (25 tests)
- `tests/line-reminder-pipeline-{idempotency,per-branch-credentials,customer-branch-link}.test.js` (11 tests)
- `tests/line-reminder-retry-backoff.test.js` (3 tests)
- `tests/line-reminder-debug-fire-confirmation.test.js` (6 tests)
- `tests/line-reminder-webhook-{postback-branch-routing,opt-out-intent}.test.js` (11 tests)
- `tests/line-reminder-customer-option.test.jsx` + `tests/line-reminder-customer-option-source-grep.test.js` (16 tests)
- `tests/line-reminder-modal-autotick.test.jsx` + `tests/line-reminder-modal-autotick-source-grep.test.js` (11 tests)
- `tests/line-reminder-settings-tab.test.jsx` + `tests/line-reminder-history-panel.test.jsx` (13 tests)
- `tests/line-reminder-customer-detail.test.jsx` (3 tests)
- `tests/line-reminder-admin-approve-per-branch-write.test.js` (3 tests)
- `tests/line-reminder-class-of-bug-per-branch-audit.test.js` (16 LR-1..LR-5 audit assertions)

## Outstanding (user-triggered manual actions)

1. **Configure นครราชสีมา LINE reminder in admin UI**:
   - Open https://lover-clinic-app.vercel.app
   - Navigate to tab=line-settings → select นครราชสีมา branch
   - Section "การแจ้งเตือนนัดหมาย": toggle ON + set `dayBeforeHour=20` (or any hour) + Save
   - Confirm LINE Premium tier active for นครราชสีมา OA (~$60/mo, 5K msgs)

2. **Rule Q L1 hands-on verification**:
   - Tab=line-settings → "🔧 Debug ยิงแจ้งเตือน" → mode=ยิงเฉพาะลูกค้า + pick admin's own customer record → "ทดสอบเลย"
   - Real LINE message should arrive on admin's phone
   - Click ✓ ยืนยัน button on the message → verify `appointment.status='confirmed'` in backend
   - Send "หยุดแจ้งเตือน" DM → verify `customer.notifyOptOut=true` flag set
   - Send "เริ่มแจ้งเตือน" DM → verify re-enabled

3. **Optional full e2e** — multi-branch scenarios verification:
   ```
   node scripts/e2e-line-reminder-real-prod.mjs --apply --admin-line-user-id=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   (Get admin's lineUserId from LINE webhook event log or LINE Developers console)

## Session totals
- 22 commits ahead of pre-LINE baseline shipped to prod
- LINE OA reminder system architecturally complete: per-branch OA + multi-branch linkage + 2-window reminders + Flex Message postback + opt-out + retry queue + admin debug + history panel + AV45 audit lock
- Architectural backstops: LR-1 (per-branch token) + LR-2 (webhook destination-routed) + LR-3 (branch-scoped customer lookup) + LR-4 (cross-branch modal detection) + LR-5 (audit log branchId) — all enforced via source-grep regression that runs in CI
