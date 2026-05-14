# 2026-05-15 — Central Stock Make-Fresh + V66 Incident + BRANCH Bug Discovered

## Summary

Shipped Central Stock Make-Fresh + Backup Integrity feature (12-task batch, mirror of selective-make-fresh) via brainstorming Q1-Q3 → spec → plan → inline execution → Rule Q L2 5/5 PASS on real prod → DEPLOYED. Then user clicked the button — NOTHING DELETED. V66 anti-pattern repeated exactly. Fixed via systematic-debugging Phase 1-4 + new regression test + AV44 extension; re-verified 5/5 on real prod. Then EOD: user reports BRANCH Make-Fresh has same V66 class-of-bug for transfers/withdrawals — NOT fixed, top priority next session.

## Current State

- master = `25cdb41` · prod = `1f63219` · 2 commits PENDING DEPLOY
- Central Stock V66 fix committed but NOT deployed (current prod still has broken central make-fresh)
- BRANCH Make-Fresh V66 bug DISCOVERED but NOT fixed
- 9883+ vitest GREEN + 12 skipped + 4 pre-existing failures
- Build clean

## Commits this session

```
25cdb41 fix(central-stock): V66 — CENTRAL_BUCKETS filter fields corrected against PROD write-side code
4a5cc73 docs(agents): mark deploy DONE — prod=1f63219 LIVE on lover-clinic-app.vercel.app
1f63219 docs(agents): EOD 2026-05-15 — Central Stock Make-Fresh + Backup Integrity SHIPPED ★ + V21 fixup sweep (Task 12)
7cf816f feat(central-stock): CLI scripts + Playwright spec + AV44 invariant (Task 11)
0a60a75 test(central-stock): ★ Rule Q L2 round-trip integrity e2e on REAL PROD — 5/5 SCENARIOS PASS (Task 10)
6e9b6b6 test(central-stock): Rule I flow-simulate CF1.1-CF1.7 + source-grep CSG1-CSG4 V21+AV44 (Tasks 8 + 9)
... (12 task commits total)
```

## Files Touched

- `src/lib/centralStockBuckets.js` (NEW + V66 corrected)
- `src/lib/makeFreshStateMachine.js` (NEW shared engine)
- `src/components/backend/MakeFreshModal.jsx` (REFACTOR)
- `src/components/backend/CentralMakeFreshModal.jsx` (NEW)
- `src/components/backend/CentralMakeFreshButton.jsx` (NEW)
- `src/components/backend/CentralWarehousePanel.jsx` (EDIT)
- `api/admin/central-stock-{backup-export,make-fresh}.js` (NEW)
- `scripts/{e2e-central-stock-roundtrip-real-prod,central-stock-make-fresh,central-stock-restore,diag-central-stock-prod-field-names}.mjs` (NEW)
- `tests/central-stock-make-fresh-{helpers,flow-simulate,source-grep,buckets-filter-field-prod-verification}.test.*` (NEW)
- `tests/e2e/central-stock-make-fresh.spec.js` (NEW Playwright)
- `tests/branch-make-fresh-{flow-simulate,selective-source-grep}.test.js` (V21 fixup)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (NEW AV44 + V66 extension)
- spec + plan docs

## Decisions

- Q1=C per-warehouse + bulk-all toolbar option (rationale → spec §1)
- Q2=A 4 buckets (PO / Stock+Ledger / Transfers&Withdrawals / Adjustments) (rationale → spec §3.1)
- Q3=B Refactor shared 3-step state machine via Rule C1 leverage (rationale → spec §2)
- V66 fix approach: corrected filter field names + added regression test that asserts every filterField appears in backendClient.js write-side code → drift catcher

## V-class lesson (V66 reaffirmed)

Mock-test self-consistency ≠ reality verification. E2e seed used same invented field names as filter → tests pass → real prod data uses different names → make-fresh deletes 0 docs → user sees data intact. The fix: cross-grep production write-side code BEFORE shipping spec + add regression test asserting field-name correspondence. Full V66 lesson detail: `.claude/rules/v-log-archive.md` V66 entry.

## Next Todo

1. **Fix BRANCH Make-Fresh V66 bug** (top priority) — use same pattern: Rule R env-pull diag → grep prod write-side code → correct branchBackupBuckets.js or endpoint filter → extend V66 regression test → re-verify 10/10 e2e on real prod + user hands-on test on real นครราชสีมา branch
2. Orphan cleanup script — user explicitly asked: "ฝากเคลีย orphan ด้วยนะ เยอะมากๆ"
3. Combined deploy of (1) + (2) + central V66 fix already committed

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block.
