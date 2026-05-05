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

## [2026-05-05 EOD] backfill | Phase 17.2 fix series + Phase 18.0 Branch Exam Rooms cycle

Marathon EOD session: Phase 17.2 quinquies/sexies/septies/octies (TFP cross-branch correctness fixes — cache leak + internal-leak audit + reader field-name drift + isCourseUsableInTreatment shape-aware) + Phase 18.0 Branch Exam Rooms (full feature — 11 tasks, 89 new tests, migration script, 18 commits) + Phase 18.0 follow-ups (legacy localStorage drop + empty-state removal). Two deploys shipped: V15 #19 (initial Phase 18.0 + Phase 17.2 fixes) + V15 #20 (legacy localStorage cache drop + master-rooms-only column derivation). Migration `--apply` ran on prod 2026-05-05 — 3 rooms seeded for นครราชสีมา (audit doc `be_admin_audit/phase-18-0-seed-exam-rooms-1777978075511-...`).

Production: 6 NEW pages — 3 entities ([be-exam-rooms](entities/be-exam-rooms.md), [exam-rooms-tab](entities/exam-rooms-tab.md), [appointment-room-columns](entities/appointment-room-columns.md)) + 3 concepts ([branch-exam-rooms](concepts/branch-exam-rooms.md), [runtime-fallback-orphan-room](concepts/runtime-fallback-orphan-room.md), [v12-shape-drift](concepts/v12-shape-drift.md)). Plus 1 EXTENDED entity ([treatment-form-page](entities/treatment-form-page.md) with Phase 17.2 fix series section). Index extended +6 rows. Source pages for the Phase 18.0 design spec + plan deferred to next ingest (paths exist at `docs/superpowers/specs/2026-05-05-branch-exam-rooms-design.md` + `docs/superpowers/plans/2026-05-05-phase-18-0-branch-exam-rooms.md`).

Cross-references locked: Branch Exam Rooms ↔ BSA ↔ Runtime fallback ↔ V12 shape-drift form a tight cluster summarizing the cross-branch correctness work. TFP entity page now lists all 4 fix commits with file:line references and links V12 concept page.

## [2026-05-06 EOD] session | Phase 19.0 (15-min slots + 4-type taxonomy) + Rule M data-ops + session-end wiki auto-update

Marathon EOD continuation: Phase 19.0 brainstorm (Q1 = Option B Uniform) → spec + 14-task plan → subagent-driven execution (Sonnet integration / Haiku mechanical) → V15 #22 deploy (combined; 6/6 + 6/6 Rule B probes after URL-convention fix to use `artifacts/{APP_ID}/public/data/` prefix) → migration `--apply` on prod (27/27 docs: 18 null + 9 'sales' → 'no-deposit-booking'; audit `phase-19-0-migrate-appointment-types-1777987427963-c3e11db0`; idempotency verified). Two latent migration-script bugs (PEM-parse + bare-collection-path) caught + fixed at LIVE execution time in <10min. Then codified two new project rules per user directive: **Rule M** (data ops via local + admin SDK + pull env — never deploy-coupled) added to `.claude/rules/01-iron-clad.md` + 00-session-start.md + CLAUDE.md summary. **session-end skill Step 5** — wiki auto-update (always append log entry; create concept/entity pages for novel patterns; update index when new pages land; append-only at section level).

Production this entry: 2 NEW concept pages ([data-ops-via-local-sdk](concepts/data-ops-via-local-sdk.md) — the canonical pattern from Rule M with V15 #22 lesson lock; [appointment-15min-and-4types](concepts/appointment-15min-and-4types.md) — Phase 19.0 design summary) + 1 NEW entity page ([appointment-types-ssot](entities/appointment-types-ssot.md) — the new SSOT module). Index extended +3 rows. Checkpoint: `.agents/sessions/2026-05-06-phase-19-0-and-rule-m.md`.

Cross-references locked: Rule M ↔ Phase 18.0 + 19.0 migration scripts (canonical templates) ↔ data-ops-via-local-sdk concept ↔ iron-clad-rules summary. AppointmentTypes SSOT ↔ Phase 19.0 concept ↔ Rule of 3 collapse (3 local TIME_SLOTS copies → 1 canonical).

## [2026-05-05] backfill | Phase 17.0/17.1 prep cycle
Pivoted from sparse seed (3 entities + 5 concepts) to richer structural memory before Phase 17.0 brainstorm/plan. Production: 13 NEW entity pages (3 marketing tabs + 7 master-data tabs + TFP + listProductGroupsForTreatment + branch-context) + 1 EXTENDED entity page (scoped-data-layer with full function reference + Phase 17.0 context) + 4 NEW concept pages (branch-switch-refresh-discipline / cross-branch-import-pattern / marketing-collections / master-data-tabs-pattern). 4 parallel general-purpose subagents handled entity production; concepts hand-written for cross-cutting synthesis. Index extended 17 new rows. Total ~16 pages produced + 1 extended + index/log updated. Phase 17.0 brainstorm + plan files (`2026-05-05-phase-17-0-bsa-leak-sweep-3-{design,plan}.md`) cited but their wiki source-pages deferred to next ingest. Wiki schema / Karpathy gist / BSA spec sources unchanged. Phase 17.0 implementation NOT YET shipped — plan saved at `docs/superpowers/plans/2026-05-05-phase-17-0-bsa-leak-sweep-3.md`, paused per user directive "wiki backfill cycle FIRST so Phase 17.0 is built on top of richer structural memory".
