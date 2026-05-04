---
updated_at: "2026-05-04 EOD — AP1-bis multi-slot pushed; V15 #14 deploy auth pending"
status: "master=1d15db5 · prod=V15 #13 LIVE · 4612 tests pass · 1 commit ahead-of-prod"
current_focus: "AP1-bis range-overlap fix shipped to master. V15 #14 source-only deploy awaits explicit auth (V18 lock)."
branch: "master"
last_commit: "1d15db5"
tests: 4612
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c0d9dc4"
firestore_rules_version: 24
storage_rules_version: 2
---

# Active Context

## State
- master = `1d15db5` · production = `c0d9dc4` (V15 #13 LIVE 2026-05-04) · **1 commit ahead-of-prod**
- 4612/4612 tests pass · build clean · firestore.rules v24 (added `be_appointment_slots` block in V15 #13)
- Phase 16 status: ALL LIVE (16.1-16.8 done). Cluster shifted to **audit-fix sweep** (TF2/AP1/R-FK/a11y) + new **ProfileDropdown** + **AP1-bis multi-slot**

## What this session shipped
- `f88f23e` audit-fix bundle — TF2 scrollToError 8 anchors + AP1 lightweight post-write verify + R-FK `_assertBeRefExists` + a11y P1/P3 (CustomerCreatePage/SaleTab) + ProfileDropdown (top-right avatar + logout-only menu) + PDPA strip
- `c0d9dc4` AP1 schema-based slot reservation (V15 #13) — `be_appointment_slots` collection + `runTransaction` atomic guard + TF3 TFP full a11y sweep
- `1d15db5` AP1-bis multi-slot 15-min interval reservation — closes range-overlap gap (09:00-10:00 vs 09:30-10:30 now collide on shared 09:30/09:45 slots). Tests +28 (A2 update + A5 18 + A6 9). **PENDING V15 #14 deploy auth.**
- V15 #11/#12/#13 combined deploys earlier in session (full Probe-Deploy-Probe Rule B, all 6/6 + 6/6)

## Decisions (1-line each)
- AP1 fix sequence chosen: lightweight post-write verify (V15 #12) → schema atomic exact-key (V15 #13) → multi-slot 15-min array (V15 #14 pending) — incremental hardening, each layer additive
- `buildAppointmentSlotKey` (singular) KEPT for backward-compat with V15 #12/#13 production data + legacy release fallback
- AP1-bis interval = 15 min matches ProClinic + clinic-typical granularity; `SLOT_INTERVAL_MIN` exported for tests
- ProfileDropdown placement: next to ThemeToggle (customer-detail breadcrumb + default desktop) per user "Tab login อยู่บนขวาจอ"
- PDPA strip honored verbatim — removed from active code/comments/skills; ProClinic-scan JSON kept (data integrity)

## Next action
**Await user "deploy" command for V15 #14** (AP1-bis source-only — `be_appointment_slots` rule already live since V15 #13 so rules deploy is idempotent; vercel ships the multi-slot logic). Per V18 lock: per-turn explicit auth, no carry-forward.

## Outstanding user-triggered actions
- **V15 #14 deploy auth** — AP1-bis multi-slot fix (1 commit ahead)
- 16.8 `/audit-all` orchestrator-only readiness check (Phase 16 final closure)
- Pre-launch H-bis cleanup LOCKED OFF (user trigger only)
- Phase 17 plan TBD when user ready

## Rules in force
- V18 deploy auth (per-turn explicit "deploy"; no roll-over)
- V15 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe Rule B)
- Rule J brainstorming HARD-GATE + ORTHOGONAL plan-mode
- Rule K work-first, test-last for multi-stream cycles
- Rule H-quater no master_data reads in feature code
- NO real-action clicks in preview_eval (memory rule)
- V31 silent-swallow lock (no `try/catch console.warn(continuing)`)
