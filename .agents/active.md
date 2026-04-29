---
updated_at: "2026-04-30 — V15 #10 deploy LIVE"
status: "Production = 821c954 (V15 #10 LIVE). master in sync. 4261/4261 tests pass."
current_focus: "Phase 16.4 Order parity G1-G6 + 16.7-quinquies-ter + 16.7-quinquies-bis + 16.7-quinquies + 16.7 family ALL LIVE. Next: 16.1 Smart Audience / 16.5 RemainingCourse 2nd-pass / 16.8 audit-all."
branch: "master"
last_commit: "821c954"
tests: 4261
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "821c954"
firestore_rules_version: 21
storage_rules_version: 2
---

# Active Context

## State
- master = `821c954` · production = `821c954` (V15 #10 LIVE 2026-04-30) · **0 commits unpushed-to-prod**
- **4261/4261** tests pass · build clean · firestore.rules version 21 unchanged
- Phase 16 progress: **16.2 / 16.2-bis / 16.3 / 16.3-bis / 16.5 base+bis+ter+quater / 16.6 / 16.7 family / 16.7-quinquies family / 16.4 Order parity** — ALL SHIPPED + LIVE
- Outstanding tabs: **16.1 Smart Audience** (NOT BUILT) · **16.5 RemainingCourse 2nd-pass** (scope TBD per user) · **16.8 /audit-all** (last)

## V15 #10 deploy summary (2026-04-30)
- Pre-probe Rule B: 6/6 endpoints 200 ✓ (chat_conversations / pc_appointments / clinic_settings × 2 / opd_sessions anon CREATE+PATCH)
- `firebase deploy --only firestore:rules` — idempotent (rules unchanged since V15 #9; release version 21 → 21)
- `vercel --prod --yes` — 34s build · aliased `lover-clinic-app.vercel.app`
- Post-probe Rule B: 6/6 endpoints 200 ✓
- HTTP smoke: / 200 · /admin 200 · /api/webhook/line 401 (LINE sig expected)
- Cleanup: pc_appointments 2/2 200 · clinic_settings strip 2/2 200 · chat_conversations + opd_sessions probes hidden via V27 isArchived:true

## What shipped this session (Phase 16.4 + V15 #10)
- `821c954` Phase 16.4 — Order parity G1-G6 (additive UI; ProClinic /admin/order alignment; 31 new tests; 5 intel JSON capture files)

## Earlier session shipments now LIVE
- `835070d` Phase 16.7-quinquies-ter — TreatmentForm filter + audit product line + courseType badge + buffet emit
- `a5b616c` Phase 16.7-quinquies-bis — recurring schedules expansion + listStaffSchedules wiring
- `841941a` Phase 16.7-quinquies — payroll + hourly + commission auto-computed
- `31e2d79` + `a57b4e4` — Phase 16.7-quinquies docs (spec + plan)
- `f698ed7` Phase 16.7-quater · `0e5b9ac` Phase 16.7-ter · `088e784` Phase 16.7-bis · `0daf6dd` Phase 16.7 — Expense Report family
- `e2e46f7` Phase 16.2-bis · `9642bda` + `fdf3d41` Phase 16.2 fixes · `0aa8cb6` Phase 16.2 · `ced094d` Phase 16.3-bis

## Outstanding (no auto-trigger)
- 16.1 Smart Audience — rule-builder UI (M ~6h, brainstorming HARD-GATE)
- 16.5 RemainingCourse 2nd-pass — scope TBD (ask user)
- 16.8 /audit-all — runs after 16.1 + 16.5
- Pre-launch H-bis cleanup LOCKED OFF (memory)

## Next action
Decide between:
1. **16.1 Smart Audience** — rule-builder over be_customers + be_sales for marketing exports
2. **16.5 RemainingCourse 2nd-pass** — ask user for specific polish items
3. **16.8 /audit-all** — orchestrator-only readiness check (recommended once 16.1 ships)

## Rules in force
- V18 deploy auth (per-turn explicit "deploy")
- V15 combined deploy (vercel + firestore:rules in parallel + Probe-Deploy-Probe Rule B)
- Rule J Plan-mode ORTHOGONAL (brainstorming required even in plan mode)
- Rule K work-first, test-last for multi-stream cycles
- Rule H-quater no master_data reads in feature code
- NO real-action clicks in preview_eval
- Pre-launch H-bis cleanup OFF (user-trigger only)
