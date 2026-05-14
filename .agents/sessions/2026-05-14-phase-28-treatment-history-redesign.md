# Session 2026-05-14 LATE EOD continued — Phase 28 Treatment History Redesign

## Summary

User reaction to current treatment-history list: "โครตจะไม่สวย" + directive: "redesign UI ... ให้สวยงามกว่านี้ ... แบบ designer ระดับโลก". Brainstormed Q1-Q4 via visual companion (4 mini-mockups + integrated v2). Locked: Structural Redesign / Date-grouped sections / Dot stepper + connector / List + header CTAs (with beautiful primary fire-red). Shipped 13 commits via subagent-driven-development (15 plan tasks → 13 commits because tests 9+10 batched). Live-verified on real prod customer LC-26000006.

## Current State

- master = `f557acc` · prod = `e8086de` (~45 commits ahead, NOT DEPLOYED)
- 9176 tests + 1 skipped + 0 fail (Phase 28 added 152 net assertions across 10 new test files + 7 V21 fixups across 3 existing test files)
- Build clean. BackendDashboard chunk: 907.60 → 914.70 KB (+7.10 KB, justified by 7 new components + composer)
- `audit-branch-scope`: 95/95 pass

## Commits this session (13 net + 2 docs)

```
docs(Phase 28): plan + spec + this checkpoint
f557acc test(Phase 28.11): V21 fixups for tests locking inline CDV structure
05919cf test(Phase 28.9-10): source-grep regression + Rule I full-flow simulate
486d0ac feat(Phase 28.8): TreatmentHistoryCard composer + wire into CDV
b7bf572 feat(Phase 28.7): TreatmentHistoryPagination
8eba83d feat(Phase 28.6): TreatmentHistoryHeader (CTA cluster)
369b4c4 feat(Phase 28.5): TreatmentHistoryExpandedBody + TreatmentDetailExpanded extraction
42d4e12 feat(Phase 28.4): TreatmentHistoryRow + ROLE_LABEL_TH extraction (Rule C1)
85c92fd feat(Phase 28.3): TreatmentDateHeader (date-grouped section header)
a9e6912 feat(Phase 28.2): TreatmentLifecycleStepper (3-dot stepper + connectors)
c17a035 fix(Phase 28.1-bis): getTreatmentLifecycle FS Timestamp sort regression + drop dead re-export
23232e3 feat(Phase 28.1): treatment-history resolvers — 6 pure helpers (TDD)
7142d17 docs(Phase 28): treatment history redesign spec
656cdc7 docs(Phase 28): implementation plan with 15 bite-sized tasks
```

## Files Touched

**New components (8 files in src/components/backend/treatment-history/)**:
- `TreatmentHistoryCard.jsx` (composer ~170 LOC)
- `TreatmentHistoryHeader.jsx` (CTA cluster ~86 LOC)
- `TreatmentDateHeader.jsx` (date-grouped header ~40 LOC)
- `TreatmentHistoryRow.jsx` (collapsed row + chips ~165 LOC)
- `TreatmentHistoryExpandedBody.jsx` (expanded body + print buttons ~96 LOC)
- `TreatmentLifecycleStepper.jsx` (3-dot stepper ~114 LOC)
- `TreatmentHistoryPagination.jsx` (refined pagination ~94 LOC)
- `TreatmentDetailComponents.jsx` (extracted from CDV — TreatmentDetailExpanded + DetailField + 3 internal helpers, ~207 LOC)

**Extracted helpers (Rule C1)**:
- `src/lib/formatBadgeTime.js` (NEW — extracted from CDV, exports `formatBadgeTime` + `toBadgeMs`)
- `src/lib/roleLabels.js` (NEW — extracted from CDV, exports `ROLE_LABEL_TH`)

**Extended helpers**:
- `src/lib/treatmentDisplayResolvers.js` (+6 Phase 28 helpers — `getTreatmentLifecycle`, `getTreatmentStatusLabel`, `getStepLabels`, `computeRelativeThaiDateLabel`, `groupTreatmentsByDate`, `computeRowAction`, plus internal `_parseISOMiddayUTC`)
- `src/utils.js` (+`formatThaiDateFull` — Bangkok-stable Thai BE-year date formatter)

**Modified consumer**:
- `src/components/backend/CustomerDetailView.jsx` (replaces inline 290-line treatment-history block with `<TreatmentHistoryCard ... />`; CDV.jsx 2349 → 2047 lines, −302 net; removes inline lifecycle pre-compute, ROLE_LABEL_TH, TreatmentDetailExpanded, DetailField, formatBadgeTime, treatmentPageNumbers useMemo, 6 unused icons, 3 unused helper imports, 1 dead local wrapper)

**Tests added (10 new files, 152 assertions)**:
- `phase-28-treatment-history-resolvers.test.js` — 42 (R1-R6: helpers + Bangkok TZ + FS Timestamp regression locks)
- `phase-28-treatment-history-stepper-rtl.test.jsx` — 10 (S1: 4 step states + connector gradients + a11y)
- `phase-28-treatment-history-date-header-rtl.test.jsx` — 10 (D1: today/past/relative pill + bounds)
- `phase-28-treatment-history-row-rtl.test.jsx` — 13 (R-Row: collapsed/expanded + edit/delete e.stopPropagation)
- `phase-28-treatment-history-expanded-body-rtl.test.jsx` — 10 (E1: CC/DX callout + print buttons + loading states)
- `phase-28-treatment-history-header-rtl.test.jsx` — 12 (H1: 3 CTA + onCreate gate)
- `phase-28-treatment-history-pagination-rtl.test.jsx` — 12 (P1: ranges + ellipsis + a11y)
- `phase-28-treatment-history-card-rtl.test.jsx` — 13 (C1: composer + page slicing + lifecycle integration)
- `phase-28-treatment-history-source-grep.test.js` — 15 (SG1: V21 anti-regression locks at extracted file boundaries)
- `phase-28-treatment-history-flow-simulate.test.jsx` — 15 (F1: Rule I full chain — realistic 5-treatment fixture matching user's screenshot)

**Tests fixed (V21 fixups, 7 across 3 files)**:
- `phase-26-0-status-display-rtl.test.jsx` — D2.1, D2.2, D2.3 (chip → Stepper extraction), D5.2 (edited-by → Row extraction), D5.3 (ROLE_LABEL_TH → lib extraction)
- `phase-26-2f-pre-vitals-save-source-grep.test.js` — V1.14 (vitalsigns gate → resolver)
- `phase-26-2f-pre-vitals-save-rtl.test.jsx` — V2.3 (same migration)

**Docs**:
- `docs/superpowers/specs/2026-05-14-treatment-history-redesign-design.md` (633 lines)
- `docs/superpowers/plans/2026-05-14-phase-28-treatment-history-redesign.md` (~2300 lines)
- This checkpoint
- 6 brainstorming mockup HTMLs at `.superpowers/brainstorm/16972-1778707957/content/01-07.html` (gitignored — local reference only)

## Key Decisions

- **Brainstorming Q1-Q4 locked via visual companion** — Structural / Date-grouped / Dot-stepper / List+CTA. Visual companion server at `http://localhost:52940` with 6 mini-mockup screens for side-by-side comparison.
- **Subagent-driven execution** for 8 implementation tasks. Combined spec+quality review for tasks 1-7; strict 2-stage (spec then quality) for high-risk Task 8 (CDV wire). All approved with at most 1 round of fix iteration per task.
- **Phase 28 not V28** — naming clarified during spec self-review. V-numbers reserved for bug-class lessons; this is a feature ship.
- **Edit/delete chips KEPT on collapsed row** (NOT moved to expanded body) — preserves existing CDV quick-action UX. e.stopPropagation locked in Row component + R-Row.4/5 regression test.
- **CC/DX HIDDEN in expanded state** (callout in body slot replaces) — R-Row.9 locks this pattern.
- **`formatThaiDateFull` added to src/utils.js** — canonical home for Thai date helpers; future Rule-of-3 opportunity to migrate 4+ inline THAI_MONTHS sites.
- **Phase 27.2-septies (extract shared `buildTreatmentSummaryEntry`) NOT done** — orthogonal structural fix; remains as deferred follow-up per spec § 13.

## Lessons (Rule D)

- **FS Timestamp regression caught by code-quality reviewer** (Phase 28.1-bis): the inline CDV original used `toBadgeMs()` which handles `{toDate(): Date}` AND `{seconds, nanoseconds}` shapes; the extracted helper used `new Date().getTime()` which returns NaN for FS Timestamps. Test bank used ISO strings only — missed the wire-shape. Fix added R1.6 (`{toDate}`) + R1.7 (`{seconds, nanoseconds}`) regression locks. **Lesson: when extracting a helper that handles polymorphic input, the test fixtures must include EVERY input shape — not just the most common.**
- **Live preview verification on real prod data** — Phase 28 verified live on LC-26000006 (5 rows + 2 date groups matching user's screenshot exactly). All visual contracts confirmed via DOM measurement (computed styles for card bg / border-l fire-red / connector counts / CTA gradient). Light theme verified via `data-theme="light"` toggle (token cascade flips card bg `rgb(15,15,15)` → `rgb(248,250,252)` while preserving fire-red accent). Mobile 375x812 verified (no overflow, stepper fits). Per spec § 12 + Rule I item (b).
- **Subagent stopped mid-investigation once** (Task 3 first attempt) — re-dispatched fresh with same prompt, succeeded on retry. Lesson: subagents occasionally stall; controller must verify final report shape ("DONE/BLOCKED/etc.") and re-dispatch if missing.
- **V21 fixups surfaced from extraction** — predicted 5 (Task 8 review), found 7 (Task 11 full-suite scan). 2 additional surfaced from Phase 26.2f source-grep tests asserting old `vitalsigns-recorded` literal at CDV. Fixed all with Phase 28 marker comments at new home.
- **Rule N + work-first-test-last cycle** — full vitest deferred from individual sub-tasks to Task 13 end-of-batch. Saved ~12 minutes of cumulative test time. End-of-batch full run caught 1 known intermittent flake (Phase 17.1 — pre-existing, not Phase 28).

## Next Todo

- **(user-triggered)** explicit "deploy" for combined V15 push of ~45 commits ahead of prod (`e8086de`)
- **(optional)** Phase 27.2-septies — extract shared `buildTreatmentSummaryEntry(t)` helper to backendClient.js for V12 multi-reader-sweep structural fix (orthogonal to this redesign, separate plan)
- **(optional)** Rule-of-3 cleanup: migrate the 4+ inline `THAI_MONTHS` sites (`AppointmentCalendarView.jsx`, `AppointmentHubRowCard.jsx`, `MonthCalendarGrid.jsx`, `TodaysDoctorsPanel.jsx`, `appointmentHubPrintTemplate.js`) to use `formatThaiDateFull` from src/utils.js

## Resume Prompt

See SESSION_HANDOFF.md "Session 2026-05-14 LATE EOD continued — Phase 28" block.
