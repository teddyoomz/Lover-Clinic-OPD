---
updated_at: "2026-05-05 — Phase 17.2 branch-equality (no main branch) shipped to master; 5198 tests pass; 2 commits ahead-of-prod"
status: "master=<phase-17-2-sha> · 5198 tests pass · 2 commits ahead-of-prod (V15 #17 = 5799bd5; Phase 17.1 ff78426 + Phase 17.2 ahead)"
current_focus: "Phase 17.2 done — admin SDK migration script awaits separate explicit user authorization to --apply against prod data."
branch: "master"
last_commit: "<phase-17-2-sha>"
tests: 5198
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "5799bd5"
firestore_rules_version: 25
storage_rules_version: 2
---

# Active Context

## State
- master = `f39760b` = **prod LIVE (V15 #16)** — 0 commits ahead; firestore.rules v25 (be_line_configs added)
- 4997/4997 tests pass · build clean · BSA + leak sweeps + Phase BS V3 LINE all live
- llm-wiki skill installed at `~/.claude/skills/llm-wiki/` (auto-loaded session boot per user-level CLAUDE.md)

## What this session shipped
- **Phase BSA** (12 tasks `e13f3c5`..`c5f0a58`): 3-layer wrapper (raw / scopedDataLayer / useBranchAwareListener) + audit + flow-simulate. **🎯 USER BRANCH-LEAK BUG CLOSED.**
- BSA leak sweep `17f8ca4`: 6 UI surfaces filter; 22 staff + 27 doctors → branchIds=[นครราชสีมา]
- Phase BS V3 LINE `40e9d8e`: `be_line_configs/{branchId}` collection + webhook routing by `event.destination` + LinkRequests stamp
- BSA leak sweep 2 `45ad80c`: Stock OrderPanel re-load + 48 docs (promotions/coupons/vouchers/deposits) migrated
- Wiki bootstrap `f39760b`: 12-page wiki (Karpathy pattern); user-level llm-wiki skill installed as base
- V15 #16 deploy LIVE: vercel + firebase rules + Probe-Deploy-Probe 5/5 ✓ pre + post + cleanup
- Checkpoint: `.agents/sessions/2026-05-04-phase-bsa-line-wiki.md`

## Decisions (this session)
- BSA architectural choice over per-callsite refactor — central wrapper at import boundary + audit invariants
- LINE config collection-based (`be_line_configs/{branchId}`); webhook routes by `event.destination`
- Customer-attached collections (wallets/memberships/points/customer-deposit-lookup) stay universal even when sibling list-paths branch-scope
- llm-wiki = always-on default mode for knowledge work per user "ใช้เป็นหลักเหมือนอากาศหายใจ"
- be_deposits added to branch-scoped set (Finance Deposit sub-tab); other Finance sub-tabs stay as-is

## Next action
Resume Phase 17.0 implementation via subagent-driven-development. Plan at `docs/superpowers/plans/2026-05-05-phase-17-0-bsa-leak-sweep-3.md`. Tasks 1-15. Single bundled commit per Rule K. Wiki-first review (R2) corrected spec Task 6 + Task 11 F4 to use TFP's existing `SELECTED_BRANCH_ID` (Phase 14.7.H wiring at line 25+325) instead of inventing a parallel `selectedBranchId`.

## This session shipped (so far)
- **Phase 17.0 spec** at `docs/superpowers/specs/2026-05-05-phase-17-0-bsa-leak-sweep-3-design.md`
- **Phase 17.0 plan** at `docs/superpowers/plans/2026-05-05-phase-17-0-bsa-leak-sweep-3.md`
- **Wiki backfill cycle** — 13 entity pages + 1 extended (scoped-data-layer 99→234 lines) + 4 concept pages + Phase 17.2 anticipation page (branch-equality-no-main) + index/log updates
- **Wiki-first review (R2)** — caught spec bug: TFP already has useSelectedBranch wired at line 25+325 (Phase 14.7.H follow-up A) under name SELECTED_BRANCH_ID; spec Task 6 + plan Task 11 F4 amended

## Decisions (this session)
- Phase 17.0 = bug-fix scope: 3 marketing tabs branch-refresh + TFP phantom data + listProductGroupsForTreatment fix + BS-9 invariant lock (skill + memory + Rule L)
- Phase 17.1 = cross-branch master-data import on 7 tabs (separate brainstorm cycle pending)
- Phase 17.2 = remove "main" / "default" branch concept (~20 files affected; separate brainstorm cycle pending; wiki concept page filed)
- Wiki-first methodology validated this session — caught a real spec bug (duplicate import + name collision) before implementation

## Outstanding user-triggered actions
- **Browser smoke verify per-branch UI behavior** on prod (BSA leak fixes + LINE per-branch + Deposit per-branch)
- **LineSettingsTab พระราม 3** — admin must enter Channel Secret + Access Token for second LINE OA
- **Hard-gate** via Firebase custom claim (Phase BS-future)
- **/audit-all** orchestrator readiness pass
- **Phase 17.2 brainstorm** — Branch equality, remove "main" / default / star concept (queued after 17.0 + 17.1 ship). Wiki page: `wiki/concepts/branch-equality-no-main.md`
- **Phase 17.1 brainstorm** — Cross-branch master-data import on 7 tabs (queued after 17.0 ships). Wiki page: `wiki/concepts/cross-branch-import-pattern.md`
- **Wiki backfill follow-on cycles**: V1-V36 archive distillation, Phase 1-16 plan source-pages, audit-skill catalog, full backendClient + Sale/Appointment entity pages, master-collection inventory

## Rules in force
- V18 deploy auth (per-turn "deploy"; no roll-over); V15 combined; Probe-Deploy-Probe Rule B (5 endpoints)
- Rule J brainstorming HARD-GATE + ORTHOGONAL plan-mode; Rule K work-first test-last
- Rule H-quater no master_data reads in feature code; Rule L BSA (BS-1..BS-8 audit-blocking)
- V36.G.51 lock (data layer no React); NO real-action clicks in preview_eval; V31 silent-swallow lock
- llm-wiki always-on (boot session + auto-detect `wiki/index.md`)
