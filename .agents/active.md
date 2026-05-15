---
updated_at: "2026-05-16 EOD — V70 + V71 + V71.A + V71.B all DEPLOYED LIVE"
status: "master=`19c6f2f` · prod=`19c6f2f` LIVE on lover-clinic-app.vercel.app · firestore rules v32 (unchanged this session)"
branch: "master"
last_commit: "19c6f2f fix(V71.B): LINE reminder {{treatments}} falls back to appt.appointmentTo"
tests: "10237 PASS / 0 FAIL / 12 skip (full vitest 10228 baseline + 9 V71.B); build clean 2.59s"
playwright_e2e: 14
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "19c6f2f"
firestore_rules_version: 32
storage_rules_version: 2
---

# Active Context

## State

- master 0 commits ahead of prod — V70 + V71 + V71.A + V71.B all LIVE
- 4 vercel deploys this session (V70+V71.A combined · V71.B); firebase rules unchanged
- Working tree clean except `.claude/settings.local.json` + untracked skill dirs (unrelated)

## What this session shipped

- **V70** — LINE reminder body variables bolded (renderTemplateAsSpans helper) + "Lover Clinic" header default with SPACE; AV-class drift fix in 3 files
- **V71** — OPD lifecycle badge (Phase 28 stepper wrap) on Frontend appt row + "ลูกค้ารับบริการเรียบร้อย" button + "เสร็จแล้ว" sub-pill under "วันนี้" tab + LINE/status de-overlap; 9 tasks subagent-driven + final code review GREEN; AV49 audit
- **V71.A** — BUG FIX: AdminDashboard onEditTreatmentForAppt was dropping customerId → TFP "ไม่พบ customerId" placeholder fired; isolated single-site V12 + V21 partial-shape drift. PLUS new "↩ กลับไปคิวรอ" un-mark button (symmetric to mark-complete). AV50 invariant + TFP placeholder copy refreshed post-V50.
- **V71.B** — BUG FIX: LINE reminder `{{treatments}}` resolved to "-" when treatments array empty even with appt.appointmentTo set. Resolver now: real treatment names → appt.appointmentTo.trim() → '-'.

Checkpoint: [`.agents/sessions/2026-05-16-v70-v71-v71a-v71b-saga.md`](sessions/2026-05-16-v70-v71-v71a-v71b-saga.md)

## Next action

Idle UNTIL user reports L1 hands-on findings from next LINE reminder cron fire (~21:30 daily) — should now show 🏥 Lover Clinic + bold variables + บริการ: botox.

## Outstanding user-triggered actions

- L1 hands-on confirm: next LINE reminder shows "Lover Clinic" (space) + bold vars + "บริการ: botox" instead of "-"
- L1 hands-on: V71 today-tab mark-complete → sub-pill move → click "↩ กลับไปคิวรอ" → row returns to "กำลังรอ"; edit-treatment in "เสร็จแล้ว" now works (no more "ไม่พบ customerId")
- Probe-deploy-probe script update: remove V50-stripped probes 2/3/4 (`clinic_settings/proclinic_session*` + `pc_appointments`) — currently aborts firebase rules deploy at pre-probe
