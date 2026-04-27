---
updated_at: "2026-04-27 (s19 EOD — Phase 15.4 7-items SHIPPED, 7 commits, NOT deployed)"
status: "Production = 75bbc38 LIVE (V33.10). Master = 26ee312 with 17 unpushed-to-prod commits (10 s18 + 7 s19) ready for V15 combined deploy. ALL 7 user EOD items addressed + tested."
current_focus: "Decide V15 combined deploy (17 commits) — needs Probe-Deploy-Probe + extend probe list 6→8 (Phase 15.2 rules update from s18)"
branch: "master"
last_commit: "26ee312"
tests: 2123
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "75bbc38"
firestore_rules_version: 18
storage_rules_version: 2
---

# Active Context

## State
- master = `26ee312` · **2123/2123** focused vitest pass (1905 → +218) · build clean
- Production = `75bbc38` LIVE (V33.10 baseline). **17 commits pending V15 combined deploy** (10 s18 + 7 s19)
- Working tree clean

## What this session shipped (s19 — 2026-04-27)
7 commits ([detail](.agents/sessions/2026-04-27-session19-phase15.4-7-items.md))
- Phase A.1 `0792359` — extract UnitField + getUnitOptionsForProduct (Rule C1)
- Phase A.2 `84ce7b0` — shared Pagination + usePagination hook
- Phase B   `541ad0b` — pagination 20/page rollout across 6 panels (item 1)
- Phase C   `3bf01c2` — transfer + withdrawal 3-role split (items 5+6)
- Phase D   `95336a5` — auto-show unit on batch row across 4 forms (item 7)
- Phase E   `94626c8` — movement log cross-branch visibility (items 3+4)
- Phase F   `26ee312` — batch picker legacy-main fallback (item 2)

All 7 items mapped 1:1 to commits. Tests: 1905 → 2123 (+218 across 7 new test files).

## Next action
**Awaiting user "deploy" authorization** for V15 combined deploy of 17 commits.
Phase 15.2 (s18) rules update + s19 data-shape additions both need
Probe-Deploy-Probe per Rule B. Probe list extends 6→8 endpoints
(`be_central_stock_orders` + counter from s18).

## Outstanding user-triggered actions (NOT auto-run)
- **V15 combined deploy**: vercel + firestore:rules with full Probe-Deploy-Probe
- **Live QA**: pagination · 3-role modals · auto-unit · movement log visibility · batch picker
- **Carry-over** (admin tasks): LineSettingsTab credentials + webhook URL · backfill customer IDs · TEST-/E2E- prefix convention
- **Deferred to Phase 15.5+**: ActorPicker branchIds[] filter (was s18 EOD #7; not in s19's refined list)
