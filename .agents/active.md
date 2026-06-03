---
updated_at: "2026-06-03 EOD+1 — V159 SHIPPED (stock order line-item search + per-batch expiry edit). Local, NOT deployed."
status: "V159 done + verified (full vitest 15992/0 · build clean · real-prod Rule Q L2 e2e 28/0). NOT deployed — await 'deploy' (V18). Client-SDK only (no firestore.rules) → vercel-only when authorized."
branch: "master"
last_commit: "39c603b6 (V159 audit S36) — 8 commits f690cfed..39c603b6"
tests: "Full vitest 15992/0 (this session) · build clean · real-prod Rule Q L2 e2e-v159 28/0. Not re-run at EOD."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "91bb3349 (V158) LIVE — V159 NOT deployed yet."
firestore_rules_version: "UNCHANGED (V159 = no rules change → no Probe-Deploy-Probe)."
---

# Active — 2026-06-03 EOD+1 — V159 SHIPPED (search + per-batch expiry edit)

## State
- master `39c603b6`; prod `91bb3349` (V158) LIVE. V159 = 8 commits ahead, NOT deployed.
- V159 (2 features) done + verified; no firestore.rules change → vercel-only deploy when authorized.
- Honest Rule Q scope: L2 (real client SDK on real prod) + full vitest + build = green. L1 (real browser: open ปรับ → edit date → save → see update) = user hands-on per workstyle. Form wiring = source-grep+build verified; the fn is L2-verified end-to-end.

## What this session shipped (detail → checkpoint 2026-06-03-v159-stock-search-expiry.md)
- **F1 search** — `OrderPanel` + `CentralStockOrderPanel` match line-item `productName` (was vendor/orderId only); matched item surfaced first via `formatOrderItemsSummary` `matchQuery` (backward-compat preserved).
- **F2 expiry** — NEW `updateStockBatchExpiry` (1 runTransaction: batch.expiresAt + forensic trail + `be_stock_adjustments` type=`expiry` (movementId null) + source order-line sync by locationType; NO movement → conservation; status untouched (EXPIRED derived); Rule O live-resolve).
- **F2 UI** — editable `DateField` in the existing `AdjustCreateForm` (dual-path submit: qty / expiry / both; covers ยอดคงเหลือ + ปรับสต็อค + central via the shared form, NO new buttons); `type=expiry` rendered in the adjust list + `AdjustDetailModal`.
- audit-stock-flow **S36** (35→36). +22 vitest (unit + source-grep + flow-simulate) + real-prod e2e `scripts/e2e-v159-stock-search-and-expiry.mjs` 28/0.
- Subagent dispatch blocked by 1M-context credit gate → executed INLINE (TDD per task, 8 commits).

## Next action
- IDLE / await direction. If "deploy" → `vercel --prod` only (no rules change → no Probe-Deploy-Probe). Optional: add V159 V-log entry to `.claude/rules/00-session-start.md` §2.

## Outstanding user-triggered actions
- Deploy V159 (vercel-only) when authorized (V18).
- Carryover (non-loop, low-pri): dropdown หมวดหมู่ task · Neuramis merge + junk test-course "หฟแฟ" · optional cross-collection partial-failure reconciliation report (V157 follow-on) · SESSION_HANDOFF head trim <150 KB.
