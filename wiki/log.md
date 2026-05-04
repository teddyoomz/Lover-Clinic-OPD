# Wiki Log

Chronological, append-only. Every entry starts `## [YYYY-MM-DD] <op> | <title>` so it's greppable: `grep "^## \[" wiki/log.md | tail -10`.

## [2026-05-04] bootstrap | LoverClinic codebase wiki
Created scaffold per Karpathy LLM Wiki pattern. Schema = `CLAUDE.md` (standard markdown links, kebab-case slugs, frontmatter mandatory, file:line citations for code claims). Categories: sources/ entities/ concepts/ analyses/. User chose Q1=B (codebase architecture knowledge), Q2=A (standard markdown), Q3=A (separate schema), Q4=B (seed ingest). 3 source pages + 3 entity pages + 5 concept pages seeded.

## [2026-05-04] ingest | Karpathy — LLM Wiki gist (gist 442a6bf)
Source page: `sources/karpathy-llm-wiki.md`. Created entity page `entities/andrej-karpathy.md` (person). Created concept page `concepts/llm-wiki-pattern.md` (the pattern this wiki implements). Cross-referenced from index.

## [2026-05-04] ingest | BSA spec + plan
Source pages: `sources/bsa-spec.md`, `sources/bsa-plan.md`. Created concept page `concepts/branch-scope-architecture.md` (the 3-layer pattern). Created entity pages `entities/scoped-data-layer.md` (Layer 2) + `entities/use-branch-aware-listener.md` (Layer 3). Cross-referenced with `concepts/rule-h-quater.md` (BS-2 invariant).

## [2026-05-04] ingest | Iron-clad rules + LoverClinic top-level architecture
Concept pages: `concepts/iron-clad-rules.md` (A-L summary, links to canonical `.claude/rules/`), `concepts/rule-h-quater.md` (the H-quater rule that BSA enforces), `concepts/lover-clinic-architecture.md` (top-level system overview).

## [2026-05-05] ingest | Phase 17.2 directive — branch equality (no main)
Mid-cycle user directive: "ยกเลิกสาขา Main / สาขาหลัก ออกไป — ทุกสาขาเป็นสาขาเหมือนกัน สำคัญเท่ากัน ไม่มีการติดดาว". Filed as `concepts/branch-equality-no-main.md` Phase 17.2 anticipation page. ~20 files affected per initial grep (BranchesTab + BranchFormModal + 6 stock panels + TFP fallback + BranchContext + cloneOrchestrator + MasterDataTab sync + several SaleTab/AppointmentFormModal display layers). Phase 17.2 brainstorm queued after Phase 17.0 ships + Phase 17.1 brainstorm runs.

## [2026-05-05] backfill | Phase 17.0/17.1 prep cycle
Pivoted from sparse seed (3 entities + 5 concepts) to richer structural memory before Phase 17.0 brainstorm/plan. Production: 13 NEW entity pages (3 marketing tabs + 7 master-data tabs + TFP + listProductGroupsForTreatment + branch-context) + 1 EXTENDED entity page (scoped-data-layer with full function reference + Phase 17.0 context) + 4 NEW concept pages (branch-switch-refresh-discipline / cross-branch-import-pattern / marketing-collections / master-data-tabs-pattern). 4 parallel general-purpose subagents handled entity production; concepts hand-written for cross-cutting synthesis. Index extended 17 new rows. Total ~16 pages produced + 1 extended + index/log updated. Phase 17.0 brainstorm + plan files (`2026-05-05-phase-17-0-bsa-leak-sweep-3-{design,plan}.md`) cited but their wiki source-pages deferred to next ingest. Wiki schema / Karpathy gist / BSA spec sources unchanged. Phase 17.0 implementation NOT YET shipped — plan saved at `docs/superpowers/plans/2026-05-05-phase-17-0-bsa-leak-sweep-3.md`, paused per user directive "wiki backfill cycle FIRST so Phase 17.0 is built on top of richer structural memory".
