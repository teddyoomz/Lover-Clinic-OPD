---
updated_at: "2026-04-30 V15 #11 deploy LIVE — Phase 16.1 Smart Audience"
status: "Production = eb8a142 (V15 #11 LIVE). master = eb8a142. 4431/4431 tests pass."
current_focus: "Phase 16.1 Smart Audience deployed. 16.8 /audit-all is the only outstanding Phase 16 item."
branch: "master"
last_commit: "eb8a142"
tests: 4431
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "eb8a142"
firestore_rules_version: 22
storage_rules_version: 2
---

# Active Context

## State
- master = `eb8a142` · production = `eb8a142` (V15 #11 LIVE 2026-04-30) · 0 commits ahead-of-prod
- 4431/4431 tests pass · build clean · firestore.rules v22 (added `be_audiences` block)
- Phase 16 status: 16.1 / 16.2 / 16.2-bis / 16.3 / 16.3-bis / 16.4 / 16.5 base+bis+ter+quater / 16.6 / 16.7 family / 16.7-quinquies family — ALL LIVE
- Outstanding: **16.8 /audit-all** (last item on Phase 16 plan)

## What this session shipped
- `eb8a142` Phase 16.1 — Smart Audience tab (8 predicates + AND/OR rule builder + saved segments + CSV; 12 source + 4 tests + 3 legacy regressions; +170 tests)
- V15 #11 combined deploy (vercel + firestore:rules) — 6/6 pre + 6/6 post probe + smoke 200/200/401 + cleanup 4/4 + opd_sessions anon-DELETE 2/2

## V15 #11 deploy results (2026-04-30)
- Pre-probe Rule B: 6/6 endpoints 200 ✓ (chat_conversations + pc_appointments + clinic_settings/proclinic_session{,_trial} + opd_sessions anon CREATE+PATCH)
- `firebase deploy --only firestore:rules`: clean compile + release · v21 → v22 (added be_audiences block)
- `vercel --prod --yes`: 41s build · `lover-clinic-9yhvh4osj-...` aliased `lover-clinic-app.vercel.app`
- Post-probe Rule B: 6/6 endpoints 200 ✓
- HTTP smoke: / 200 · /admin 200 · /api/webhook/line 401 (LINE sig expected)
- Cleanup: pc_appointments 2/2 200 · clinic_settings strip 2/2 200 · opd_sessions anon-DELETE 2/2 200 (V27-tris exception)

## Next action
Phase 16.8 `/audit-all` orchestrator-only readiness check — runs all registered audits in parallel, surfaces any P0/P1 violations before pre-launch. User-triggered (no auto). After 16.8 passes, Phase 16 is closed.

## Outstanding user-triggered actions
- 16.8 `/audit-all` (orchestrator-only readiness check) — Phase 16 final
- Pre-launch H-bis cleanup LOCKED OFF (memory `feedback_no_prelaunch_cleanup_without_explicit_ask.md`)
- Phase 16 → Phase 17 plan TBD when user ready

## Rules in force
- V18 deploy auth (per-turn explicit "deploy")
- V15 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe Rule B)
- Rule J brainstorming HARD-GATE + ORTHOGONAL plan-mode
- Rule K work-first, test-last for multi-stream cycles
- Rule H-quater no master_data reads in feature code
- NO real-action clicks in preview_eval (memory rule)
