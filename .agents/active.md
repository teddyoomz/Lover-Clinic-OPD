---
updated_at: "2026-04-27 (s17 EOD — V33.6 → V33.10 all DEPLOYED + QA passed)"
status: "Production = 75bbc38 LIVE (V33.10). 5 V-entries shipped today (V33.6 / V33.7 / V33.8 / V33.9 / V33.10) over 5 V15 combined deploys. User QA passed. Phase 15 multi-branch planning is the next-session opener."
current_focus: "Phase 15 (Central Stock Conditional) multi-branch planning. User directive: ภายใต้กฎอย่างเคร่งครัด คิดรอบคอบ wiring/flow/logic ให้ถูกต้องตามหลักความเป็นจริง."
branch: "master"
last_commit: "75bbc38"
tests: 1595
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "75bbc38"
firestore_rules_version: 18
storage_rules_version: 2
---

# Active Context

## State
- master = `75bbc38`, **1595** focused vitest pass; build clean (BD 995 KB)
- Production = `75bbc38` LIVE (vercel `lover-clinic-9p89gvv6h`); rules v18 (be_customer_link_tokens block stripped); storage V26
- Working tree clean; QA passed all V33.x mobile checklists 2026-04-27 EOD

## What this session shipped (s17 EOD — 2026-04-27)
Day-long arc, 5 V-entries, all deployed + QA passed. Detail:
`.agents/sessions/2026-04-27-session17-v33.6-v33.10-cleanup-phase15-ready.md`

- V33.6 mobile Flex no-truncation (`380f05d`)
- V33.7 TH/EN i18n + full-date + admin language toggle (`2ff8803`)
- V33.8 zero-remaining course filter (`14396ab`)
- V33.9 orphan QR-token cleanup + V33.10 prefix enforcement + Live QA runbook (`75bbc38`)
- 5 V15 combined deploys; pre+post probe 6/6 + 3/3 GREEN; smoke 3/3 = 200
- Tests 1385 → 1595 (+210 across the day)

## Next action
**Phase 15 (Central Stock Conditional) multi-branch planning** — strict
plan-mode (5 phases). Phase 1 Explore: opd.js intel `/admin/central-stock/*`
(8 routes) + grep our `be_stock_*` + V20 multi-branch infra (BranchContext +
EXPORT_TRANSFER/RECEIVE movements) + memory `project_phase12_to_18_roadmap.md`
Phase 17 section (older numbering = our 15). Phase 2 Plan agents on tier-1
central / tier-2 branch + transfer + withdrawal. Phase 3 AskUserQuestion
on edge cases. Phase 4 final plan → ExitPlanMode.

## Outstanding user-triggered actions (NOT auto-run)
- Admin: fill LineSettingsTab credentials (carry-over since s12)
- Admin: paste webhook URL into LINE Developer Console
- Admin: backfill customer IDs via "เลขบัตร" button
- Convention: future test customers MUST use TEST-/E2E- prefix via
  `tests/helpers/testCustomer.js` (V33.10 codified)
