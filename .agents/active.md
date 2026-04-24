---
updated_at: "2026-04-25 (end-of-session — Rule I + 10 bug fixes + 5 audits + deploy)"
status: "Rule I iron-clad established. 10 user-reported bugs fixed end-to-end with preview_eval verify. 5 Priority-3 audits run (skip PDPA). 12 commits deployed to prod. 3959/3959 tests."
current_focus: "Awaiting user UI-verify on prod. No open code work."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "1cb58d5"
tests: "3959/3959 PASS"
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "1cb58d5 (2026-04-25 end-of-session) — up-to-date with HEAD"
firestore_rules_deployed: "no change this session"
---

# Active Context

## Objective

User has done "end session". No open code. Next session's first action is
**user UI-verify** on prod (buffet display + expiry countdown + pick-at-
treatment same-visit + DF report shows non-zero + blood type dropdown) and
report back if anything still drifts.

## Current State

- **master = `1cb58d5`**, prod = `1cb58d5` (up-to-date).
- 3959/3959 tests PASS, build clean, 15 full-flow simulate files.
- Rule I (iron-clad) + V13 logged 2026-04-25 after 3-round helper-only
  test failure pattern — full-flow simulate now mandatory per sub-phase.
- 10 user-reported bugs fixed in session with preview_eval runtime verify:
  1. pick-at-treatment nothing shows (commit 85f6c96)
  2. "คอร์สคงเหลือไม่พอ: LipoS" after pick + use same-visit (116b2a9)
  3. picked- rowId leak into Phase-1 deduction (d876ffa)
  4. buffet display "1/1 U" → "บุฟเฟต์" + bloodType dropdown empty (221ab29)
  5. buffet customer card — hide มูลค่าคงเหลือ, show หมดอายุอีก N วัน (a6a5de1)
  6. course expiry sync→assign chain preserves daysBeforeExpire (bc17c28)
  7. openBuyModal whitelist strip + shadow course dedup (28b86a0)
  8. DF report linkedSaleId back-link via setTreatmentLinkedSaleId (cf0ad55)
  9. AV2 raw <input type="date"> in FinanceMasterTab + OnlineSalesTab (1cb58d5)
  10. api/proclinic/explore.js missing @dev-only banner (1cb58d5)

## Blockers

None.

## Next Action (resume session)

User has explicitly NOT authorized any deploy / code change this moment.
First thing next session:

1. User opens prod + UI-verifies the 8 items in SESSION_HANDOFF.md
   "Outstanding User Actions":
   - Buy buffet via SaleTab → customer course card shows "บุฟเฟต์" + "หมดอายุอีก N วัน"
   - Buy pick-at-treatment inside treatment → PickProductsModal → tick → save succeeds
   - Multi-visit buffet → qty never drops
   - DF Payout Report shows real ฿ on backend-created sales (was ฿0)
   - Blood type dropdown renders A/B/AB/O/ไม่ทราบ
   - Course expiry date visible on customer page
   - Search courses "บุฟ" shows 4 items (matches ProClinic, not 7 with duplicates)
   - Treatment edit → reverse+reapply net-zero

2. If any item fails → report bug, continue debug-fix-test-simulate cycle
   per Rule I.

3. If all pass → session can continue with the next phase (likely Phase
   14.x remaining or Phase 15 Central Stock Conditional per
   `project_execution_order.md`).

## Recent Decisions (this session)

1. **Rule I mandatory** — full-flow simulate at every sub-phase end.
   Helper-only unit tests are NECESSARY BUT NOT SUFFICIENT. 3 rounds of
   the 2026-04-25 buffet+expiry+shadow bugs all had green unit tests
   while UI was broken. V13 logged with cross-ref to V11/V12 as a
   cluster of the same failure mode.

2. **setTreatmentLinkedSaleId writes BOTH shapes** — top-level
   `linkedSaleId` (where `_clearLinkedTreatmentsHasSale` queries via
   Firestore `where`) AND `detail.linkedSaleId` (where DF aggregator
   reads). 3 different code paths used 3 different shapes — aggregator
   couldn't match treatments to sales → DF report blank. Helper writes
   both so every reader sees the same thing.

3. **Shadow-course filter at openBuyModal** — ProClinic sync emits
   archive/template rows (46% of sync dataset had no courseType + null
   price). Filter rule: `!!courseType && price > 0`. Mirrors ProClinic
   behavior. Could be moved upstream to sync-time but keeping at UI
   layer covers legacy data already in Firestore.

4. **Rule H-bis banner formalized** — dev-only scaffolding files MUST
   have `@dev-only — STRIP BEFORE PRODUCTION RELEASE (rule H-bis)`
   banner so pre-release audit can pick them up deterministically.
   explore.js was first caught; template for future dev-only endpoints.

5. **Priority 3 skips PDPA per user directive** — 5 audits run (firestore
   correctness, backend-firestore-only, anti-vibe-code, react-patterns,
   ui-cultural-a11y, reports-accuracy). All advisory findings plus 2
   real AV2 fixes. 18 regression guard tests lock every fix.

## Session commit list (12 net, all pushed + deployed)

- `85f6c96` pick-at-treatment late-visit wiring
- `116b2a9` alreadyResolved flag prevents placeholder overwrite
- `d876ffa` picked- rowId classification via isPurchasedSessionRowId
- `221ab29` buffet display/behavior + bloodType objects + 94 F1-F16 tests
- `a6a5de1` buffet card countdown + daysUntilExpiry helper (+8 F16 tests)
- `bc17c28` daysBeforeExpire sync→migrate→store→buy→assign chain (+14 F17 tests)
- `28b86a0` whitelist preserve + shadow filter (+7 F17.15-21 tests)
- `8e90f8b` Rule I iron-clad + V13 + Pre-Commit #6 + CLAUDE.md update
- `ad843c3` Priority 1 batch — 6 files, 117 tests
- `f9b8f56` Priority 2 batch — 4 files, 92 tests
- `cf0ad55` DF report linkedSaleId helper + aggregator defensive + 22 tests
- `1cb58d5` P3 audits + AV2 fixes + H-bis banner + 18 regression guards

## V-log status

V13 added 2026-04-25 (§ 2 of `.claude/rules/00-session-start.md`) —
3-round helper-only test failure pattern. No other V-entries this session.

## Notes

- Production URL verified 200 OK + hasRoot + hasViteBundle via preview_eval.
- firestore:rules untouched — no Probe-Deploy-Probe needed.
- Preview dev server still live at localhost:5173 (HMR green all session).
- Session started at 3306 tests; ended at 3959 (+653 / 4× increase, all
  pure-helper + full-flow simulate + source-grep regression guards).
