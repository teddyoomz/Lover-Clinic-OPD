---
updated_at: "2026-05-26 EOD+7 — per-branch LINE OA add button restored + ดูข้อมูล OPD→ดูข้อมูลรับเข้า (AV139) DEPLOYED + L2-verified"
status: "ALL DEPLOYED — 4 ships this session LIVE on prod. master=7e2a5bd8=prod. branch-line-oa endpoint L2-verified."
branch: "master"
last_commit: "7e2a5bd8 fix(patient-form): restore per-branch LINE OA add button + rename ดูข้อมูล OPD→ดูข้อมูลรับเข้า (AV139)"
tests: "full suite 14843 pass + 1 isolated-pass flake (phase-17-1-cross-branch-import-rtl global.fetch-leak, 7/0 isolated, NOT mine) · build clean · new bank 9/0 (ran this session; no source change since)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "7e2a5bd8 LIVE — appointment-card + realtime-notif + push_config-rule + LINE-OA/rename all deployed 2026-05-26 EOD+7"
firestore_rules_version: "push_config rule added + DEPLOYED EOD+7 (AV138, Probe-Deploy-Probe green). LINE-OA fix = no rules change."
---

# Active Context

## State
- LINE-OA fix (AV139): patient-form success screen "เพิ่มเพื่อน LINE Official" button restored PER-BRANCH. Was gated on empty global `clinic_settings.lineOfficialUrl`; real source = `be_branches.settings.lineOaUrl` (staff-only, e.g. https://lin.ee/mFFsDkG). NEW `api/branch-line-oa.js` (admin SDK, returns ONLY the public lin.ee URL) → PatientForm fetches per `session.branchId` (global kept as fallback). L2-verified on prod: valid→`{lineAddUrl:"https://lin.ee/mFFsDkG"}` HTTP200, bad→400.
- Rename (same batch): OpdLifecycleRow view button "ดูข้อมูล OPD"→"ดูข้อมูลรับเข้า" (label/title/2 comments + OPD-save toast). `opd-view-btn` testid + `onViewOpd` UNCHANGED (cosmetic-shell).
- Session shipped 4 deploys, ALL LIVE: appointment-card 5-band redesign · realtime-intake-notif (AV137) · push_config rule (AV138) · LINE-OA+rename (AV139).

## What this session shipped
- AV137 realtime-intake-notif: live `allLinkedSessions`→sessionsById + `cardFlowNotif`→allNotifData + push self-heal — DEPLOYED.
- AV138 push_config firestore rule (client enable-push was default-denied; V66 admin-vs-client blind spot) — DEPLOYED, Probe-Deploy-Probe green.
- AV139 per-branch LINE OA endpoint (`api/branch-line-oa.js`) + ดูข้อมูล OPD→ดูข้อมูลรับเข้า — DEPLOYED + endpoint L2-verified.
- Checkpoint: `.agents/sessions/2026-05-26-line-oa-restore-and-rename.md`.

## Next action
- idle — all 4 fixes deployed; endpoint + rule L2-verified. Await user L1 + next task.

## Outstanding user-triggered actions
- USER L1: open `?session=<intake link>` → LINE OA button shows; re-enable push on device (rule live); confirm นัดหมาย card real-time + renamed "ดูข้อมูลรับเข้า".
- 3 Rule S edits (CLAUDE.md / rules 00 / 01) uncommitted — pre-existing, user's to commit. (optional) add push_config + branch-line-oa to Rule B probe list there.
- Bug → /systematic-debugging + Rule P.
