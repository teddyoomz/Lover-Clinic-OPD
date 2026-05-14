---
updated_at: "2026-05-14 LATE — Phase 29.22 SHIPPED + DEPLOYED + Rule Q L1 12/12 PASS (RB5 brutal-test found+fixed)"
status: "master=36c6bf8 · prod=36c6bf8 (LIVE) · 9644 vitest + 1 skipped + 12 Playwright e2e GREEN · build clean"
branch: "master"
last_commit: "36c6bf8 fix(Phase 29.22 RB5): admin-panel hide propagates to typeahead source"
tests: 9644
playwright_e2e: 12
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "36c6bf8"
firestore_rules_version: 31
storage_rules_version: 2
---

# Active Context

## 🚨🚨🚨 RULE Q — REAL-ADVERSARIAL VERIFICATION (V66, 2026-05-14)

THE LOUDEST RULE. Mock tests = code-shape coverage ONLY, NOT verification.
Admin SDK doc-level = NOT verification. Only L1 (Playwright real browser) /
L2 (real client SDK with exact compound queries) / L3 (user walkthrough)
qualify as "verified" for user-visible code.

Full skill: `~/.claude/skills/real-adversarial-verification/SKILL.md`

---

## Phase 29.22 — be_recall_cases SHIPPED + DEPLOYED LIVE

**Goal**: Decouple recall preset data from be_products/be_courses (Phase 29 baseline, V66 lesson). New universal collection `be_recall_cases` + sub-pill admin UI + typeahead reason picker in modal.

**Implementation**: 17 tasks complete (commits aaa8de6 → 36c6bf8). Plus RB5 bug fix from Rule Q brutal test.

**Tests**: 9605 → **9644** vitest (+39 net) + 1 skipped, all GREEN. **12 Playwright e2e PASS** (6 Phase 29 baseline + 5 Phase 29.22 RB1-RB5 + 1 RB6 admin-panel-mount probe).

**Deployment**: combined Vercel + Firebase (rules + indexes) deployed at https://lover-clinic-app.vercel.app. Migration `--apply` ran on prod (1 course cleaned, audit doc `be_admin_audit/phase-29-22-strip-recall-fields-1778751179095-cb484814`).

## 🚨 Rule Q L1 brutal test — found REAL BUG (RB5), FIXED + REDEPLOYED

**RB5 caught**: When admin hides a case via sub-pill, typeahead in RecallCreateModal still showed the hidden case (count=1, expected=0). This is exactly the class of bug mock tests would NEVER find.

**Root cause**: RecallCasesAdminPanel had its OWN cases state; useRecallCases hook in RecallTab had SEPARATE state. Hide updated only the panel; typeahead stayed stale until full page reload.

**Two-pronged fix** (commit 36c6bf8):
1. Defense in depth — RecallCaseSelectField filters `isHidden === true` client-side
2. State propagation — RecallCasesAdminPanel exposes `onCasesChanged` callback; RecallTab wires it to `useRecallCases.reload`

**Re-test result**: 5/5 PASS post-fix. V66 self-check passes: real browser ✅, exact UI query ✅, active break-attempt mindset ✅, found 1 bug → fixed → re-verified ✅, screenshot+log proof ✅.

## Architectural deliverables

### New files (8)
- `src/lib/recallCaseValidation.js` — pure validation helpers
- `src/components/backend/recall/RecallCaseSelectField.jsx` — typeahead picker
- `src/components/backend/recall/RecallCaseFormModal.jsx` — add/edit modal
- `src/components/backend/recall/RecallCasesAdminPanel.jsx` — CRUD table
- `src/hooks/useRecallCases.js` — shared hook (Rule C1 — 4 callers)
- `scripts/phase-29-22-strip-recall-fields-from-product-course.mjs` — Rule M migration
- Test files: `phase-29-22-{recall-case-validation, backend-client, recall-case-select-field, recall-case-form-modal, recall-cases-admin-panel, recall-tab-cases-view, flow-simulate, source-grep}.test.{js,jsx}` + `tests/e2e/phase-29-22-recall-cases-real-browser.spec.js`

### Modified files
- `src/lib/backendClient.js` (+88 LOC for CRUD)
- `src/lib/scopedDataLayer.js` (+9 LOC re-export)
- 4 recall callers + RecallTab + RecallSlotCard + RecallCreateModal
- `src/lib/{productValidation,courseValidation,permissionGroupValidation}.js`
- `src/components/backend/{ProductFormModal,CourseFormModal}.jsx`
- `firestore.rules` + `firestore.indexes.json`
- `tests/branch-collection-coverage.test.js`
- 5 Phase 29 test files extended with new mocks

### Permissions
- NEW `recall_management` permission key in `permissionGroupValidation.js` (settings module)
- Sub-pill "🗂 จัดการเคส" gated by `isAdmin || hasPermission('recall_management')`

## Outstanding

- ✅ Phase 29 bugs (V66) — all 5+ FIXED + DEPLOYED in this combined deploy
- ✅ Phase 29.22 implementation — SHIPPED + DEPLOYED
- ✅ Rule M migration — APPLIED (1 doc cleared)
- ✅ Rule Q L1 — 12/12 Playwright PASS against real prod Firestore
- Pending: optional V-entry log for the brutal test discipline win
- Pending: optional consolidated session-end summary

## Rule Q V66 enforcement chain — STILL ACTIVE

7 layers — DO NOT remove:
1. `~/.claude/CLAUDE.md` — mandatory boot
2. `F:\LoverClinic-app\CLAUDE.md` — project banner
3. `.claude/rules/00-session-start.md` — Step 0 boot + V66 in §2
4. `.claude/rules/01-iron-clad.md` — Rule Q top-of-file
5. `.claude/rules/v-log-archive.md` — verbose V66
6. `~/.claude/skills/real-adversarial-verification/SKILL.md` — invocable skill
7. `~/.claude/projects/F--LoverClinic-app/memory/feedback_real_adversarial_verification.md` — user-memory mirror
