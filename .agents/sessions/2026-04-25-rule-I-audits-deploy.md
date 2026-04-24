# 2026-04-25 · Rule I (iron-clad) + 10 bug fixes + 5 Priority-3 audits + deploy

## Summary

Marathon session closing 10 user-reported bugs (pick-at-treatment, buffet
display, expiry flow, shadow courses, DF report link, blood-type dropdown,
AV2 date inputs). Established Rule I (mandatory full-flow simulate per
sub-phase) after V13: a 3-round pattern where helper-unit tests passed
while the user-visible UI was still broken. 12 commits, 653 new tests
(3306→3959, 4× growth), build clean, production deployed.

## Current State

- **Branch**: `master`
- **Last commit**: `1cb58d5 audit(priority3): fix AV2 + H-bis findings + 18 regression guard tests`
- **Tests**: 3959/3959 PASS (was 3306 at start; **+653 this session**)
- **Build**: clean (all commits)
- **Production**: `1cb58d5` via `vercel --prod --yes` — up-to-date with HEAD
- **firestore:rules**: no changes this session
- **Prod probe**: 200 OK + hasRoot + hasViteBundle verified via preview_eval
- **Preview dev server**: Vite at localhost:5173, HMR green all session

## Commits shipped (12 net, all pushed + deployed in one `vercel --prod`)

- `85f6c96` — pick-at-treatment shows in treatment form (late-visit + in-visit)
- `116b2a9` — in-visit pick: alreadyResolved flag prevents placeholder overwrite
- `d876ffa` — picked- rowId classified via isPurchasedSessionRowId (all 5 filter sites)
- `221ab29` — buffet display + behavior + blood-type dropdown + 94 F1-F16 tests
- `a6a5de1` — buffet customer card hide มูลค่าคงเหลือ, show หมดอายุอีก N วัน (+8 F16)
- `bc17c28` — course expiry sync → migrate → store → buy → assign all preserve daysBeforeExpire (+14 F17)
- `28b86a0` — openBuyModal whitelist preserve + shadow course dedup (+7 F17.15-21)
- `8e90f8b` — Rule I iron-clad + V13 + Pre-Commit #6 + CLAUDE.md summary
- `ad843c3` — Priority 1 batch: 6 files, 117 tests (stock / cancel-cascade / lifecycle / edit-mode / DF-pick / invoice-race)
- `f9b8f56` — Priority 2 batch: 4 files, 92 tests (course-mgmt / promotion-bundle / auto-sale / multi-payment)
- `cf0ad55` — DF report linkedSaleId via setTreatmentLinkedSaleId + defensive aggregator + 22 F1-F6 tests
- `1cb58d5` — Priority 3 audits (5) + AV2 fixes + H-bis banner + 18 regression guards

## Decisions (non-obvious, worth preserving)

1. **Rule I formalized** — helper-unit tests are NECESSARY BUT NOT
   SUFFICIENT. Any sub-phase that touches a user-visible flow MUST have
   a full-flow simulate test that chains master-data → UI whitelist →
   builder → filter → backend write → customer state → re-render. 3
   rounds of 2026-04-25 bugs (buffet, expiry, shadow) all had green
   unit tests while real UI was broken — V11/V12/V13 share this
   failure mode. Rule I is the explicit guard. Required elements:
   (a) pure simulate mirrors of inline React logic, (b) preview_eval
   on real Firestore data when dev server live, (c) source-grep
   regression guards, (d) adversarial inputs (null/empty/zero/snake↔camel),
   (e) lifecycle assertions on post-save docs.

2. **3-shape linkedSaleId mismatch was the DF-report bug** —
   TreatmentFormPage wrote dfEntries into `detail.dfEntries` but NEVER
   wrote `linkedSaleId` anywhere. `_clearLinkedTreatmentsHasSale`
   queries top-level `linkedSaleId`. DF aggregator reads
   `t.detail.linkedSaleId`. 3 different shapes, no agreement → empty
   DF report. Fix: NEW setTreatmentLinkedSaleId writes BOTH top-level +
   detail via dot-path updateDoc. Aggregator hardened to read either
   (belt-and-suspenders for legacy docs).

3. **Shadow courses were 46% of sync dataset** — runtime-verified on
   prod Firestore that 167/369 courses had empty courseType + null
   price (ProClinic archive/template rows). ProClinic UI hides them;
   we matched by filtering at openBuyModal level. Could move upstream
   to sync — kept at UI for now to cover legacy data already synced.

4. **openBuyModal whitelist was real root cause of expiry bug** —
   previous "fix" wrote daysBeforeExpire into confirmBuy but the
   OUTER whitelist `{id, name, price, category, itemType, products}`
   stripped the field before confirmBuy could read it. Grep-based
   tests passed because fields EXISTED somewhere in the file, just
   not in the WHITELIST. Preview_eval on real Firestore data caught
   it in 30 seconds; grep never would have. Rule I encodes this:
   always verify on real data when dev server is live.

5. **Rule H-bis banner template for dev-only scaffolding** —
   explore.js first caught. Format: `@dev-only — STRIP BEFORE
   PRODUCTION RELEASE (rule H-bis)`. Regression guard test greps for
   this banner on any file matching dev-only criteria. Future dev
   scaffolding (clone-tab, master-data-sync buttons) follows same
   pattern.

## Blockers

None. Session cleanly closed. Production deployed. Tests green.

## Known limitations (follow-up, not blocking)

- **Partial-pick reopen** — pick-at-treatment MVP: user picks subset,
  can't reopen to add more later (must buy another course). UX gate
  should prevent. Acceptable MVP.
- **Period enforcement** — user clarified period = min-interval
  between uses (e.g. Laser buffet 1-year period=7 means customer
  can use at most once per week). Schema preserves field but no
  save-time validation yet. Feature for Phase 15+.
- **React-patterns advisory** — IIFE top-level conditional renders
  (not click-handler crash pattern) + silent catches in outer
  wrappers. Low priority; no bugs traced to them.

## Files touched (this session)

**Source**:
- `src/lib/treatmentBuyHelpers.js` — resolvePurchasedCourseForAssign +
  isPurchasedSessionRowId + mapRawCoursesToForm + buffet fork in
  buildPurchasedCourseEntry
- `src/lib/backendClient.js` — setTreatmentLinkedSaleId +
  resolvePickedCourseInCustomer + assignCourseToCustomer pick branch
  + daysBeforeExpire legacy alias + _clearLinkedTreatmentsHasSale
  detail.linkedSaleId
- `src/lib/dfPayoutAggregator.js` — defensive linkedSaleId read
  (either t.detail.linkedSaleId OR t.linkedSaleId)
- `src/components/TreatmentFormPage.jsx` — customerCourses filter
  exemptions (pick/buffet) + mapRawCoursesToForm wire + setTreatmentLinkedSaleId
  both save paths + bloodTypeOptions objects + purchasedItems builder
  preserves daysBeforeExpire + openBuyModal shadow filter
- `src/components/backend/CustomerDetailView.jsx` — daysUntilExpiry
  helper + buffet card (hide value + countdown + badge) +
  activeCourses exempts placeholder+buffet + CourseItemBar buffet text
- `src/components/backend/SaleTab.jsx` — confirmBuy preserves
  courseType+daysBeforeExpire+period + openBuyModal shadow filter +
  daysBeforeExpire passed to assignCourseToCustomer
- `src/components/backend/CourseFormModal.jsx` — label "วันหมดอายุ" +
  buffet hint violet + placeholder "เช่น 365 (1 ปี)" + help text
- `src/components/backend/FinanceMasterTab.jsx` — DateField replaces raw input
- `src/components/backend/OnlineSalesTab.jsx` — same
- `api/proclinic/explore.js` — @dev-only banner

**Rules / Docs**:
- `.claude/rules/00-session-start.md` — Rule I + V13
- `.claude/rules/02-workflow.md` — Pre-Commit Checklist #6 (full-flow simulate)
- `CLAUDE.md` — iron-clad 8→9

**Tests** (15 simulate files total; 653 new tests session-wide):
- `tests/phase12.2b-flow-simulate.test.js` — F1-F17 + F18-21 shadow
- `tests/phase12.2b-stock-simulate.test.js` (NEW)
- `tests/phase12.2b-cancel-cascade-simulate.test.js` (NEW)
- `tests/phase12.2b-lifecycle-simulate.test.js` (NEW)
- `tests/phase12.2b-edit-mode-simulate.test.js` (NEW)
- `tests/phase12.2b-df-pick-simulate.test.js` (NEW)
- `tests/phase12.2b-invoice-race-simulate.test.js` (NEW)
- `tests/phase12.2b-course-management-simulate.test.js` (NEW)
- `tests/phase12.2b-promotion-bundle-simulate.test.js` (NEW)
- `tests/phase12.2b-autosale-simulate.test.js` (NEW)
- `tests/phase12.2b-multipayment-simulate.test.js` (NEW)
- `tests/phase12.2b-df-report-link-simulate.test.js` (NEW)
- `tests/priority3-audit-guards.test.js` (NEW)
- Extended: `tests/phase12.2b-scenarios.test.js` + `tests/phase12-catalog-tabs.test.jsx`

## Commands run (copy-pasteable record)

```bash
# Pre-commit rhythm each commit:
npm test -- --run  # keep suite green
npm run build      # rolldown catches export mismatches

# Runtime verify:
# (preview_eval calls via MCP — not reproducible via CLI)

# Final deploy (user-authorized THIS turn):
vercel --prod --yes
# Production: https://lover-clinic-8rqckyr56-teddyoomz-4523s-projects.vercel.app
# Aliased: https://lover-clinic-app.vercel.app
```

## Next action (resume session)

**Primary**: user UI-verifies the 8-item checklist on prod (see
SESSION_HANDOFF.md "Outstanding User Actions"). If any fails, loop into
debug-fix-test-simulate per Rule I.

**If all pass**: continue next phase per
`memory/project_execution_order.md` — likely Phase 15 Central Stock
Conditional OR finish any Phase 14.x gaps.

## Resume Prompt

```
Resume LoverClinic OPD — continue from 2026-04-25 end-of-session.

Read in order BEFORE any tool call:
1. CLAUDE.md (stack + env + rule index including Rule I)
2. SESSION_HANDOFF.md (cross-session state of truth)
3. .agents/active.md (hot state — master=1cb58d5, 3959 tests, deployed)
4. .claude/rules/00-session-start.md (iron-clad A-I + V1-V13)
5. .agents/sessions/2026-04-25-rule-I-audits-deploy.md (detail checkpoint)

Status summary:
- master = 1cb58d5, 3959/3959 tests PASS, build clean
- Production = 1cb58d5 (deployed 2026-04-25 end-of-session, 200 OK probe)
- Session closed 12 commits: 10 user-reported bugs fixed + Rule I iron-clad
  established + V13 logged + Priority 1/2/3 test batches (653 new tests)
- firestore:rules: untouched
- 15 full-flow simulate test files now exist per Rule I

Next action:
User UI-verifies 8 items on prod (SESSION_HANDOFF "Outstanding User Actions"):
- Buy buffet course → customer card shows "บุฟเฟต์" + "หมดอายุอีก N วัน"
- Buy pick-at-treatment → PickProductsModal → tick → save succeeds (no "คอร์สคงเหลือไม่พอ")
- Multi-visit buffet → qty pinned at original
- DF Payout Report shows non-zero ฿ on backend sales
- Blood type dropdown renders A/B/AB/O/ไม่ทราบ
- Course expiry date visible on customer page
- Search "บุฟ" returns 4 items (not 7 with duplicates)
- Treatment edit → reverse+reapply state is net-zero

If any item fails: debug-fix cycle per Rule I (full-flow simulate + preview_eval).
If all pass: advance to next phase per project_execution_order.md.

Rules:
- No deploy unless user explicitly says "deploy" THIS turn (V4/V7)
- Probe-Deploy-Probe 4 endpoints before any firestore:rules deploy (V1/V9)
- Every bug → full-flow simulate test + audit invariant (Rule I + D)
- Helper-unit tests NECESSARY BUT NOT SUFFICIENT — chain the whole user
  flow + verify on real Firestore data via preview_eval

Invoke /session-start to boot context.
```
