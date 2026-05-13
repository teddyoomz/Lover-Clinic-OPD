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

## [2026-05-09] ingest | Phase 25.0 — Walk-in 5th appointment type + frontend tab rename + OPD-save → modal flow
User requested 4-task batch: (1) add `walk-in` 5th appointment type with backend sub-tab below 'ติดตามอาการ'; (2) rename frontend "คิว"/"หน้าคิว" → "คิว Walk-IN"; (3) "บันทึกลง OPD" click → `AppointmentFormModal` with type/customer/channel/branch LOCKED + status default `pending`; (4) saved walk-in auto-displays in V64 hub วันนี้ tab. 14 files modified (6 source + 8 test); 4 NEW Phase 25.0 test files (44 tests); 5 EXISTING Phase 19/21 tests updated for 4→5 type expansion (parameterized N_TYPES). 141/141 targeted GREEN; full suite 8242/8245 (1 pre-existing flake + 1 pending; 0 regressions). Per Rule J brainstorming HARD-GATE — clarifying Qs locked customer-linking strategy (be_customers exists by modal-open time; reuse existing `lockedCustomer` prop, no new pickLater pattern needed) + 5th color choice (น้ำตาลอ่อน / amber). Per Rule K work-first/test-last (all source first → review → test bank batch). Per Rule N targeted-only during iteration; full suite at end-of-batch.

Production this entry: UPDATED entity page `entities/appointment-types-ssot.md` (4-type → 5-type taxonomy + Phase 25.0a history line) + UPDATED concept page `concepts/appointment-15min-and-4types.md` (Phase 25.0a evolution section with the inverted-flow semantic + `lockedChannel` Rule of 3 mirror documentation). Index NOT changed (existing pages updated, no new pages). NEW `lockedChannel` prop on `AppointmentFormModal` is the canonical mirror of Phase 21.0's `lockedAppointmentType` — same locked-chip-with-🔒 UX, validates against `CHANNELS` list, save-payload override pattern. AdminDashboard's NEW `_maybeOpenWalkInModal` helper gated on `adminMode === 'dashboard'`, called at all 3 customer-save success branches (addCustomer / relink-existing / recovery-create-after-notFound). Master 1 ahead of prod — awaiting explicit "deploy" THIS turn per Rule V18.

Cross-references locked: `appointment-types-ssot` ↔ `appointment-15min-and-4types` (Phase 19.0 + 25.0a evolution). `lockedChannel` (NEW Phase 25.0c) is the third member of the locked-field prop family on AppointmentFormModal (after `lockedCustomer` + `lockedAppointmentType` Phase 21.0) — Rule of 3 reached; future locked-X props can mirror the safeLocked* validation + chip-render pattern. V64 hub auto-displays walk-in via existing infrastructure (`appointmentDataVersion` real-time + `sortApptsByDateTimeAsc` + TYPE_CHIP_CLS amber) — zero edits needed for Phase 25.0d.

## [2026-05-13] ingest | Phase 26.0 — Doctor-Save (บันทึกสำหรับแพทย์) + Admin Finalize-Mode

Created `concepts/treatment-status-and-doctor-save.md` documenting the new asymmetric save flow on TreatmentFormPage. Doctor-save records OPD/vitals/charts/meds/DF only (per Q2 — meds + DF KEPT; course-items + consumables + purchasedItems + auto-sale SKIPPED). Admin finalize unlocks via `canAddNewItems = (mode==='create') || (loadedTreatmentStatus === 'doctor-recorded')` flag derived from `treatment.status === 'doctor-recorded'` set by Phase 26.0b doctor-save.

`saveMode` joins the locked-X / payload-shape-routing architectural family as 4th member (after `lockedCustomer` + `lockedAppointmentType` + Phase 25.0c `lockedChannel`). Future "save-mode" / "lockedX" variants MUST mirror: defensive coercion at entry + explicit gates at every site + AV invariant + flow-simulate F-tests + source-grep regression.

10 commits across 9 tasks. Approach A1 (single handleSubmit + explicit gates) locked over A2 (separate handler — too much refactor) and A3 (filter payload — implicit-skip risk). Status field additive on `be_treatments`; legacy treatments stay `status: undefined` (no chip) — no Rule M data migration, no Rule B firestore.rules deploy needed.

NEW AV37 audit invariant in `audit-anti-vibe-code/SKILL.md` + 8 sub-tests in `tests/audit-branch-scope.test.js`. AV37 locks the doctor-save gate discipline permanently — any new deduction/sale-create call site added to handleSubmit in future MUST be saveMode-gated; meds (type 7) sanctioned exception preserved.

Test bank: G1+G2 (handleSubmit + UI source-grep) + D1+D2+D3+D4 (RTL chip + banner + summary) + F1-F8 (Rule I full-flow simulate). 3 V21-class test fixups in TF3.A.6 + V36.J.1 + V50.F1.12 (legitimate source contract evolution).

Full suite: 8242 → 8297 + 1 skipped (+55 net) all GREEN. Build clean. NOT YET DEPLOYED — awaiting user `deploy` authorization per Rule V18.

Cross-references locked: `treatment-status-and-doctor-save` cites Phase 25.0c lockedChannel + Phase 21.0 lockedAppointmentType (Rule of 3 chain). Future TreatmentFormPage saveMode variants (e.g., draft-save) should land on this concept page first.

## [2026-05-13] ingest | Phase 26.1 — TFP Polish + Editor-Attribution Modal

Follow-up to Phase 26.0 (same-day). 3 items: (A) V12 multi-reader-sweep fix at CDV summary mapper — Phase 26.0e fixed the writer but missed the in-component reader, so the amber "แพทย์ลงบันทึก" chip never rendered. (B) Removed broken top-right "ยืนยันการรักษา" button at TFP:2888-2893. (C) NEW EditAttributionModal on staff edit-save — single picker, merged list (staff + doctors + assistants per branch), inline role labels. Records 4 top-level fields (editedBy/Name/Role/At) and displays "· แก้ไขโดย: X (role)" inline in CDV row meta.

Updated `concepts/treatment-status-and-doctor-save.md` with Phase 26.1 section. handleSubmit signature evolution table added (Pre-26.0 → 26.0a → 26.1). AV37 audit invariant extended with 3 new sub-tests (AV37.9-AV37.11) + 1 V21-class regex fixup on AV37.1 (let-based branch tree contract). Total AV37 coverage: 11 sub-tests across both 26.0 + 26.1.

10 task commits across 3 sub-phases (26.1a bug+cleanup, 26.1b modal+RTL, 26.1c TFP integration + display + flow + audit). ~600 LOC delta across 11 files. Tests delta: +23 net (Phase 26.0 8297 → Phase 26.1 8320 + 1 skipped). Build clean. NOT YET DEPLOYED.

Rule of 3 status: `EditAttributionModal` is 2nd member of "pick-a-person-before-action" pattern family (1st = `ActorConfirmModal`). Future 3rd similar modal should consider extracting a shared `<PersonPickerModal>` base.

Subagent-driven execution mode (same pattern as Phase 26.0). Each task: implementer subagent → verify → commit + push. 2 V21-class regex fixups landed during Tasks 3 + 4 + 8 (TF3.A.6 window 2500→4000, F7.3 let-based shape, AV37.1 let-based shape).

## [2026-05-13] ingest | Phase 26.2 — TFP Split-Screen History + customer.note

Same-day continuation of Phase 26.0 + 26.1. 5-item implementation: (A) 5-tab history strip in TFP header showing top-5 cross-branch recent treatments; (B) 50/50 split-screen on lg+ / modal fallback on mobile; (C) NEW `TreatmentReadOnlyPanel` component extracted from TimelineModal row JSX (~374 LOC, strict AV38 read-only contract); (D) TimelineModal DRY refactor to consume TreatmentReadOnlyPanel; (E) `customer.note` shown in amber callout above doctor-save button via triple-fallback chain.

14 implementation commits + 2 spec/plan commits (from prior day) = 16 total Phase 26.x docs-to-code commits. Tests: +36 net (8320 → 8356 + 1 skipped). Build clean. 43 commits ahead of prod. NOT YET DEPLOYED — awaiting user `deploy` authorization per Rule V18. 1 known flake: Phase 17.1 `cross-branch-import-rtl` intermittent under full-suite load (pre-existing).

NEW concept page: `concepts/tfp-split-screen-history.md` (this entry). Documents split-screen layout architecture, historyTreatments state shape, TreatmentReadOnlyPanel AV38 read-only contract, customer.note triple-fallback chain, file inventory.

AV38 audit invariant: no `onEditTreatment`/`onDeleteTreatment` props, no `<input>`/`<textarea>`, no "บันทึก" inside `<button>`, Lightbox permitted. Source-grep regression lock in `tests/v38-av38-treatment-read-only-panel.test.js`.

Subagent-driven execution (same pattern as Phase 26.0 + 26.1): Tasks 1-7 each had implementer subagent → spec-review subagent catching 18+ deviations → fix → commit + push.

Cross-references: `tfp-split-screen-history` ↔ `treatment-status-and-doctor-save` (Phase 26.0 saveMode + 26.1 editedBy attribution sit alongside the Phase 26.2 split-screen in the same TFP). TreatmentReadOnlyPanel = 2nd consumer of the read-only viewing pattern (1st = TimelineModal inline row; future 3rd = Rule of 3 trigger for shared abstraction).
