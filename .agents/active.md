---
updated_at: "2026-05-15 LATE+1 — LINE OA appointment reminder system SHIPPED locally (21 commits) — PENDING DEPLOY"
status: "master=0c59da1 (21 commits ahead of prod) · prod=ef680eb · build clean · 152/152 LINE tests GREEN"
branch: "master"
last_commit: "0c59da1 audit(line-reminder): Task 14 — AV45 invariant + LR-1..LR-5 source-grep regression"
tests: "9883 base + 152 NEW LINE-reminder tests GREEN · cumulative ~10,035+ vitest GREEN"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef680eb"
firestore_rules_version: 31
storage_rules_version: 2
---

# Active Context

## What this session shipped

### Morning session
1. V66 BRANCH make-fresh fix + 2,477 stock orphans cleaned + deployed (prod = ef680eb LIVE)

### Afternoon/evening session — LINE OA Appointment Reminder System
- **Brainstorming HARD-GATE** Q1-Q4 + Section 2-3 + per-branch OA pivot all locked
- **Spec**: `docs/superpowers/specs/2026-05-15-line-oa-appointment-reminder-design.md` (per-branch architecture, 20 requirements, LR-1..LR-5 invariants)
- **Plan**: `docs/superpowers/plans/2026-05-15-line-oa-appointment-reminder.md` (15 tasks, TDD throughout)
- **Subagent-Driven Maximum Capacity execution**: 4 waves of parallel implementer subagents + 2-stage reviews per task
  - Wave 1: 5 parallel (Tasks 1, 2, 3, 9, 13) + 5 polish fix subagents
  - Wave 2: 5 parallel (Tasks 4, 5, 7+8, 10, 11) + 2 deferred fixes (link-requests + firestore.rules read)
  - Wave 3: 3 parallel (Tasks 6, 12, 15)
  - Wave 4: 1 sequential (Task 14 audit — 16/16 PASS on first run, all LR invariants satisfied)
- **21 commits** ahead of prod
- **152/152 LINE reminder targeted tests PASS** + build clean

### Architecture (per-branch OA throughout)
- `be_line_configs/{branchId}.lineReminder` — per-branch reminder settings (existing Phase BS V3 collection extended)
- `customer.lineUserId_byBranch[branchId]` — multi-branch LINE linkage (legacy `customer.lineUserId` preserved for backward-compat)
- Vercel Cron: hourly `/api/cron/line-reminder-fire` + 5-min `/api/cron/line-reminder-retry`
- Webhook `/api/webhook/line` extended: postback handler (ยืนยัน/เลื่อน/ติดต่อ) + opt-out intents (หยุดแจ้งเตือน/เริ่มแจ้งเตือน)
- Per-branch credential lookup via `getLineConfigForBranch(db, branchId)` at every Push API call (LR-1)
- Branch-scoped customer lookup via `getCustomerLineUserIdAtBranch` helper (LR-3)
- Idempotency via `be_line_reminder_log/{appointmentId}_{reminderType}` doc

### Files shipped
- **NEW** (22 files): cron endpoints × 2, admin endpoints × 1, helpers × 2 (template + client), shared components × 2 (CustomerOption + LineNotifyConfirmation + CustomerLineSection), LineSettingsTab sub-sections × 3, e2e script × 1, tests × 12, AV45 audit invariant entry
- **MODIFIED** (12 files): lineConfigClient.js (defaults + validate + merge + normalize), backendClient.js (notifyChannel/notifyMeta), 6 customer-picker callsites (CustomerOption), 5 appointment modals (LineNotifyConfirmation), CustomerDetailView (CustomerLineSection), LineSettingsTab (3 sub-sections), webhook line.js (postback + opt-out), link-requests.js (per-branch write), vercel.json (crons), firestore.rules (collections + read access), 01-iron-clad.md (Rule B probe #8)

## State

- master = `0c59da1` · prod = `ef680eb` · **21 commits PENDING DEPLOY**
- All commits pushed to origin master
- Build clean (only pre-existing chunk-size warnings)
- 152/152 LINE reminder tests PASS (10 separate test files)
- AV45 + LR-1..LR-5 source-grep regression locks PERMANENT (16/16 PASS on first run)

## Outstanding (user-triggered)

1. **Add CRON_SECRET to Vercel env** (Production scope):
   - Value: `FCk-CD29VSscn2sves-inzlU3e2LnKDhugDjA2Xk7W8`
   - (Generated via `crypto.randomBytes(32).toString('base64url')`)

2. **Confirm LINE Premium tier active** for นครราชสีมา OA (~$60/mo for 5K msgs)

3. **Type "deploy" verbatim** to authorize combined deploy:
   - `vercel --prod --yes` — ships 21 commits including LINE reminder system + Wave 2 deferred fixes
   - `firebase deploy --only firestore:rules` — ships rule changes (be_line_reminder_log/be_line_reminder_postback_log read open to clinic staff)
   - Rule B Probe-Deploy-Probe still required for rules deploy (probe 1, 5, 6, 7, 8)

4. **Post-deploy Rule Q L1 hands-on**:
   - Open https://lover-clinic-app.vercel.app
   - Tab=line-settings → นครราชสีมา branch → enable lineReminder + configure dayBefore=20 + Save
   - Tab=line-settings → Debug Fire → mode=single + pick admin's customer → "ทดสอบเลย" → real LINE message arrives
   - Click ✓ ยืนยัน → appointment.status='confirmed' verified
   - Send "หยุดแจ้งเตือน" DM → opt-out confirmed
   - Send "เริ่มแจ้งเตือน" → re-enabled

5. **Optional Phase 2 verify** — run e2e script after deploy:
   `node scripts/e2e-line-reminder-real-prod.mjs --apply --admin-line-user-id=Uxxx`
