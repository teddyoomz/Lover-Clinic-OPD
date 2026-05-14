---
updated_at: "2026-05-14 — Phase 29.22 (be_recall_cases) implementation COMPLETE; awaiting user 'deploy' verb"
status: "master=bedc741 (Phase 29.22 Task 16 — Playwright RB1-RB6 spec) · prod=4a552c9 (still has Phase 29 bugs + lacks Phase 29.22) · 9644 vitest + 1 skipped + 12 Playwright e2e · build clean"
branch: "master"
last_commit: "bedc741 test(Phase 29.22 Task 16): 🚨 Rule Q L1 Playwright real-browser spec RB1-RB6"
tests: 9644
playwright_e2e: 12
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "4a552c9"
firestore_rules_version: 30
storage_rules_version: 2
---

# Active Context

## 🚨🚨🚨 RULE Q — REAL-ADVERSARIAL VERIFICATION (V66, 2026-05-14)

**THE LOUDEST RULE. READ BEFORE EVERY "VERIFIED" CLAIM.**

Mock tests = code-shape coverage ONLY, NOT verification. Admin SDK doc-level access = NOT verification.

**Before claiming "verified" / "shipped" / "done" / "complete" / "ready to deploy" for ANY user-visible code, satisfy ≥1:**
- L1 — Playwright real browser w/ real auth + real DOM + real Firestore
- L2 — Real client SDK w/ exact compound queries / listener subscriptions
- L3 — User walkthrough with written confirmation (LAST RESORT)

Full skill: `~/.claude/skills/real-adversarial-verification/SKILL.md`

---

## State (2026-05-14 mid-session)

- master = `bedc741` (Phase 29.22 Tasks 1-16 SHIPPED + Phase 29.21-fix2 still queued)
- prod = `4a552c9` (5+ Phase 29 bugs FIXED locally + Phase 29.22 NOT YET REDEPLOYED)
- Tests: 9605 → **9644** (+39 net) + 1 skipped — ALL GREEN
- Playwright e2e: 6 → **12** (+6 new in `tests/e2e/phase-29-22-recall-cases-real-browser.spec.js`)
- Build clean (2.58s)

## Phase 29.22 — be_recall_cases (universal recall preset collection)

**Goal**: Decouple recall preset data from be_products/be_courses denormalization (Phase 29 baseline / V66 lesson). New universal collection + sub-pill admin UI + typeahead reason picker in modal.

**16 of 17 implementation tasks SHIPPED**:

| # | Task | Status |
|---|---|---|
| 1 | `recallCaseValidation.js` pure helpers (11 unit tests) | ✅ aaa8de6 |
| 2 | backendClient CRUD (listRecallCases/saveRecallCase/setRecallCaseHidden + __universal__ marker, 7 unit tests) | ✅ 930c89c |
| 3 | scopedDataLayer universal re-export | ✅ 7769c5f |
| 4 | branch-collection-coverage `scope:'global'` | ✅ a96d95d |
| 5 | firestore.rules + indexes (NOT deployed) | ✅ 74ec2e7 |
| 6 | Strip 4 legacy fields from product+course (followUpAfterDays/followUpReason/recallAfterDays/recallReason) | ✅ d43507c |
| 7 | RecallCaseSelectField typeahead component (7 RTL) | ✅ 54870cc |
| 8 | RecallCaseFormModal CRUD form (6 RTL) | ✅ 23e2894 |
| 9 | RecallCasesAdminPanel CRUD table (6 RTL) | ✅ 3045865 |
| 10 | RecallTab sub-pill "จัดการเคส" (admin/perm gated, 4 RTL) | ✅ 751c935 |
| 11 | RecallSlotCard reason → typeahead + RecallCreateModal prop rename | ✅ b215605 |
| 12 | 4 callers + shared useRecallCases hook | ✅ c1a5986 |
| 13 | Rule I full-flow simulate F1.1-F1.3 (3 RTL) | ✅ 235442b |
| 14 | Rule M migration script (NO --apply yet) | ✅ f11a73b |
| 15 | Source-grep regression locks SG1-SG6 (19 tests) | ✅ b791c31 |
| 16 | 🚨 Rule Q L1 Playwright RB1-RB6 spec | ✅ bedc741 |
| 17 | Final pre-deploy verify (full vitest + build clean) | ✅ in this commit |

**Architecture**:
- `be_recall_cases` universal collection (no branchId, per BSA Rule L)
- Schema: `{id: CASE-{ts}-{hex8}, caseName, defaultDays, isHidden, audit stamps, V41 soft-archive}`
- Sub-pill `🗂 จัดการเคส` in RecallTab → admin/`recall_management` perm gated
- Typeahead `RecallCaseSelectField` replaces plain `<input>` reason field
- Auto-fill date on pick: `addDaysISO(todayISO, defaultDays)` (Bangkok midday-UTC parse)
- Inline-learn `saveAsRecallCase` callback: dedup-aware (silent no-op if name exists)
- 4 callers (RecallTab + RecallFrontendView + RecallCard + RecallFromTreatmentModal) use shared `useRecallCases` hook (Rule C1)

**Phase 29.22 NEW files (8)**:
- `src/lib/recallCaseValidation.js`
- `src/components/backend/recall/{RecallCaseSelectField,RecallCaseFormModal,RecallCasesAdminPanel}.jsx`
- `src/hooks/useRecallCases.js`
- `scripts/phase-29-22-strip-recall-fields-from-product-course.mjs`
- `tests/phase-29-22-*.{test.js,test.jsx}` (8 new test files)
- `tests/e2e/phase-29-22-recall-cases-real-browser.spec.js`

**Phase 29.22 MODIFIED files**:
- `src/lib/backendClient.js` (+88 LOC for CRUD)
- `src/lib/scopedDataLayer.js` (+9 LOC re-export)
- `src/components/backend/recall/{RecallTab,RecallSlotCard,RecallCreateModal,RecallFrontendView}.jsx`
- `src/components/backend/customer-recall/{RecallCard,RecallFromTreatmentModal}.jsx`
- `src/lib/{productValidation,courseValidation,permissionGroupValidation}.js`
- `src/components/backend/{ProductFormModal,CourseFormModal}.jsx`
- `firestore.rules` + `firestore.indexes.json`
- `tests/branch-collection-coverage.test.js`
- 5 Phase 29 test files extended with new mocks (no regression)

## Outstanding (user-triggered)

1. **DEPLOY** — combined Vercel + Firebase (rules + indexes) — user authorized this turn ("deploy ได้เลย")
   - Rule B Probe-Deploy-Probe + NEW endpoint #8 (be_recall_cases anon→403 / clinic-staff→200)
   - Rule Q V66 post-deploy probe: real-client-SDK compound query (NOT anon POST)
2. **MIGRATION** — `scripts/phase-29-22-strip-recall-fields-from-product-course.mjs` (dry-run review → user confirm → --apply)
3. **🚨 BRUTAL Rule Q L1** — RB1-RB6 against PROD + Phase 29 Option C continuation (Bug C/D/E re-verify via Playwright)

## Phase 29 bugs (V66) STILL pending deploy

Already FIXED in commits c404cb6 + 6c8b72d — included in this Phase 29.22 deploy bundle:
- A. Customer picker missing
- B. Auto-suggest never fires
- C. Reschedule outcome semantic
- D. No closed-no-answer UI
- E. noAnswerCount no reset
- +. autoFocus on disabled input

Plus Phase 29.22 fixes (NEW):
- Recall preset coupling to be_products/be_courses (V66 lesson — denormalization wrong)
