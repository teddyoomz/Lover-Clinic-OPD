---
updated_at: "2026-04-20 (post-deploy)"
status: "production-live"
current_focus: "Phase 12 + 12.11 shipped AND deployed — awaiting Phase 13 decision"
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "348d179"
tests: 2850
production_url: "https://lover-clinic-app.vercel.app"
---

# Active Context

## Objective
Begin Phase 13 (quotations / staff schedules / DF groups + report / permission tab-gate / treatment validator). Phase 12 foundation is done and live.

## Current State (post-deploy)
- **Phase 12 DONE + deployed** — 11 sub-tasks (12.0-12.10) + 12.11 bonus adapter + `.agents/` scaffold install.
- **Last commit**: `348d179 docs(claudemd): cross-reference .agents/ layer in onboarding list`
- **Tests**: 2850 passing
- **Build**: clean
- **firestore.rules**: **DEPLOYED** ✅ — Rule B Probe-Deploy-Probe ran clean (pre 4/4 = 200, post 4/4 = 200, Phase 12 be_* gates 403 unauth correctly)
- **Vercel production**: **DEPLOYED** ✅ — https://lover-clinic-app.vercel.app alias live
- **Env vars on Vercel**: ✅ `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY` set + encrypted
- **`/api/admin/users` smoke**: HTTP 401 "missing Bearer" = Admin SDK init OK + token gate works
- **Optional not-yet-set**: `FIREBASE_ADMIN_BOOTSTRAP_UIDS` (only needed if seeding root-admin before any custom claim exists)

## Blockers
None. Phase 12 is production-live.

## Next Action (Phase 13 decision)

v5 plan Phase 13 = 6 sub-tasks, ~23h, +230 tests:

| # | Scope | Est | Tests | Risk |
|---|---|---:|---:|---|
| 13.1 | be_quotations + convert-to-sale | 4h | +40 | Medium |
| 13.2 | be_staff_schedules + AppointmentTab collision | 4h | +40 | Medium |
| 13.3 | be_df_groups + be_df_staff_rates matrix | 5h | +50 | High (420+ cells) |
| 13.4 | DF Payout Report | 3h | +30 | Low |
| 13.5 | Permission tab-gate wiring | 3h | +30 | **Low — start here** |
| 13.6 | Treatment validator + schema | 4h | +40 | Medium (3200-line form) |

**Recommended start**: 13.5 (lightest, wires Phase 11.7 hasPermission helper to tab-render gate). Low risk, immediate ops value.

## Notes
- `.agents/` layer active as of 2026-04-20. Trust priority in `.agents/AGENTS.md`: iron-clad rules (.claude/rules/) always win on conflict.
- Phase 12.11 adapter is a bridge — Phase 16 Polish still scheduled to do the full caller rewire + migrate be_wallet_types/be_membership_types/be_medication_groups/be_consumable_groups.
- Pre-release strip list (rule H-bis) expanded in Phase 12: MasterDataTab [A3] "ล้าง master_data" section + `clearMasterDataItems` helper are dev-only.
