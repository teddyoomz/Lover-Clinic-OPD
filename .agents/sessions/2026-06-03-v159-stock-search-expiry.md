# 2026-06-03 EOD+1 — V159: stock order line-item search + per-batch expiry edit (SHIPPED, local, NOT deployed)

## Summary
Two stock features via `/brainstorming`→spec→`writing-plans`→inline TDD (8 commits). (1) Import-order search now matches products that are LINE ITEMS inside an order (was vendor/orderId only) — `OrderPanel` + `CentralStockOrderPanel`, with the matched item surfaced first. (2) Admins can edit a batch/lot's expiry date from the existing adjust form (no new buttons), anytime, even after partial use — NEW `updateStockBatchExpiry`. No firestore.rules change → vercel-only deploy when authorized.

## Current State
- master `39c603b6`; prod `91bb3349` (V158) LIVE — V159 = 8 commits ahead, **NOT deployed** (V18).
- Verified: full vitest **15992/0** (+22, zero V21 lock-in) · build clean · real-prod Rule Q L2 e2e **28/0**.
- V159 = client-SDK only, NO firestore.rules change → no Probe-Deploy-Probe; deploy = `vercel --prod` only.
- Honest Rule Q scope: L2 (real client SDK on real prod) + suite + build green. L1 (real browser: open ปรับ → edit date → save → see update) = user hands-on per workstyle. Form wiring = source-grep+build verified.
- Working tree clean.

## Commits
```
39c603b6 docs(audit): V159 — audit-stock-flow S36 (per-batch expiry-edit invariant) + count 35→36
3d434922 test(stock): V159 — real-prod Rule Q L2 e2e 28/0 (search surfacing + expiry edit + order-line sync + concurrency)
87f5eecc feat(stock): V159 — render type=expiry adjustment (list table + detail modal)
e956148b feat(stock): V159 — editable batch expiry in AdjustCreateForm (dual-path submit)
916b7353 feat(stock): V159 — updateStockBatchExpiry (atomic batch + audit type=expiry + order-line sync, no movement)
1cc14a88 feat(stock): V159 — import-order search matches line-item productName (OrderPanel + CentralStockOrderPanel, Rule P)
bc8887de feat(stock): V159 — formatOrderItemsSummary matchQuery (surface matched line item first)
f690cfed docs(stock): V159 brainstorm spec + plan — order line-item search + per-batch expiry edit
```

## Files Touched
- `src/lib/orderItemsSummary.js` (matchQuery) · `src/components/backend/OrderPanel.jsx` + `CentralStockOrderPanel.jsx` (search + placeholder)
- `src/lib/backendClient.js` (NEW `updateStockBatchExpiry`) · `src/lib/scopedDataLayer.js` (export) · `src/components/backend/StockAdjustPanel.jsx` (editable expiry + dual-path + list render) · `AdjustDetailModal.jsx` (type=expiry)
- `.claude/skills/audit-stock-flow/{SKILL.md,checklist.md}` (S36)
- tests: `v159-order-items-summary-match` · `v159-order-search-line-item` · `v159-update-batch-expiry` · `v159-adjust-form-expiry` · `v159-expiry-adjustment-render` · `scripts/e2e-v159-stock-search-and-expiry.mjs`
- docs: spec + plan + brainstorm mockup under `docs/superpowers/`

## Decisions (1-line each)
- Q1=B (surface matched item first via matchQuery) · Q2=edit-in-existing-form, NO new buttons (user directive) · Q3=C (audit doc + batch forensic fields) · Q4=B (two-way batch↔order-line sync in-tx).
- Recon resolved: EXPIRED never persisted (derived via `hasExpired`) → no status normalize, `status:'active'` dropdown already lists mistyped-past lots; central reuses `AdjustCreateForm`.
- Expiry edit is NOT a movement → `be_stock_adjustments` type='expiry' (movementId null), never `be_stock_movements` (conservation untouched). audit-stock-flow S36.
- Subagent dispatch blocked by a 1M-context credit gate (failed 3× at 0 tokens, even after enabling credits / disabling [1m]) → executed inline (TDD per task). Document for next session.
- Direct-to-master per repo convention (no PR workflow for owner); each task committed + pushed.

## Next Todo
- Deploy V159 (vercel-only) when user says "deploy" (V18). No Probe-Deploy-Probe (no rules change).
- Optional: V159 V-log entry in `.claude/rules/00-session-start.md` §2.
- Carryover (non-loop, low-pri): dropdown หมวดหมู่ task · Neuramis merge + junk test-course "หฟแฟ" · cross-collection partial-failure reconciliation report (V157 follow-on) · SESSION_HANDOFF head trim <150 KB.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-03 EOD+1. Read CLAUDE.md → SESSION_HANDOFF.md (master 39c603b6, prod 91bb3349) → .agents/active.md (15992 tests) → .claude/rules/00-session-start.md → this checkpoint. Status: V159 SHIPPED + verified (full vitest 15992/0 · real-prod e2e 28/0), NOT deployed. Next: idle / await direction (deploy V159 = vercel-only when authorized). No deploy without "deploy" THIS turn (V18). /session-start
