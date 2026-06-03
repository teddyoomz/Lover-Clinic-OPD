# 2026-06-03 EOD+2 — category dropdown + stock expiry bug-loop + DEPLOY (SHIPPED + L1-verified)

## Summary
Two phases: (1) `/brainstorming`→spec→plan→TDD shipped the **category dropdown** (ProductFormModal หมวดหมู่ datalist = distinct `categoryName` harvested from be_products only — no master, plain options, type-new; mirrors หน่วย harvest). (2) `/systematic-debugging` adversarial loop on the V159 stock features (expiry edit · dropdown · order search · date display) per user "หมดบั๊คจริงๆ 100%" — 4 rounds: R1 found B1+B2, R2 clean, R3 found B5, R4 clean → **converged** → **DEPLOYED** (user pre-authorized deploy-after-convergence) → **L1-verified live** on all 4 features.

## Current State
- master `62593b2c`; prod `62593b2c` LIVE — **deployed this session** (ships V158→V159 + dropdown + B1/B2/B3/B5; prod caught up).
- Verified: full vitest **16049/0** · build clean · real-prod Rule Q **L2 e2e 34/0** · **live-app L1 all 4 features** (Chrome MCP) · 3 Rule R diags 0-anomaly.
- No firestore.rules change → vercel-only deploy, no Probe-Deploy-Probe.
- Working tree clean.

## Commits
```
62593b2c diag(stock): Rule R order-search real-shape audit (R4; 141 items, 0 anomalies)
79e67c1a fix(stock): V159 B5 — OrderDetailModal importedDate raw ISO → dd/mm/yyyy (R3)
87206271 diag(stock): Rule R productType/status off-list check (R2; 0 off-list)
1c03bd5d fix(stock): V159 expiry hardening — B1 dual-path torn-write + B2 central sync no-op + dd/mm/yyyy
d21be606 feat(product): หมวดหมู่ datalist = product-harvest only (drop master); plain; all stock/product tabs
7115dc5e docs(product): impl plan — หมวดหมู่ datalist (3 tasks, TDD)
07a34d95 docs(product): spec rev2 — drop master entirely (product-harvest only)
f3b01c31 docs(product): spec rev — plain names (drop source tags)
2e96a847 docs(product): brainstorm spec — หมวดหมู่ datalist enrichment
```

## Files Touched
- src/components/backend/ProductFormModal.jsx (category datalist; drop listProductGroups/groups)
- src/lib/backendClient.js (B1 idempotency guard + B2 match-both-tier-keys in updateStockBatchExpiry)
- src/components/backend/StockAdjustPanel.jsx (B1 reorder expiry-first/qty-last + B3 renders)
- src/lib/dateFormat.js (NEW `fmtSlashDate` — TZ-safe dd/mm/yyyy)
- B3 renders: StockBalancePanel, AdjustDetailModal, CentralOrderDetailModal, OrderDetailModal (+B5 importedDate), TransferDetailModal, WithdrawalDetailModal
- tests: product-category-datalist · v159-fix-expiry-hardening · v159-fix-date-display
- scripts: e2e-v159-stock-search-and-expiry (P9 idempotency-guard + P11 central-sync added) · diag-category-dropdown-and-expiry-sync · diag-product-type-status-options · diag-order-search-real-shapes
- docs/superpowers/{specs,plans}/2026-06-03-product-category-datalist*

## Decisions (1-line each)
- Category dropdown: Q1=A datalist (not strict select) · drop master entirely (user "ไม่ต้องมี master เหี้ยไรทั้งนั้น") · plain options, no source tags · read-time harvest, no migration.
- B1 fix = reorder (idempotent expiry FIRST, non-idempotent qty LAST) + in-tx idempotency guard → retry applies qty exactly once (the non-idempotent op is last → if it succeeds, nothing left to fail → no double).
- B2 fix = match `it.orderProductId === bOPI || it.centralOrderProductId === bOPI` (branch vs central tier key).
- B3 = `fmtSlashDate` TZ-safe (no `new Date` for pure YYYY-MM-DD); CE default; display-only (DB stays ISO); user chose dd/mm/yyyy slash (consistent w/ rule 04, not dashes).
- Date format CONFIRMED via AskUserQuestion (dash-vs-slash conflict with app convention).
- Refuted by REAL prod data: C1 (605/612 use categoryName, 0 legacy) · C8 (0 off-list type/status) · C7 (updateStockOrder cascades expiry→batch).
- L1 done via Chrome MCP on connected Browser 1 (Rule S); no save/mutation; staff-chat auto-opened, untouched.

## Next Todo
- Optional Rule P closure: `audit-stock-flow` S37 invariant + 00-session-start §2 V-log entry for B1/B2 (regression tests already lock the behavior).
- Low-pri carryover: be_products data cleanup (V145, 36 junk docs, dry-run done) · Neuramis merge + junk course "หฟแฟ" · cross-collection reconciliation report · SESSION_HANDOFF head trim <150 KB.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-03 EOD+2. Read CLAUDE.md → SESSION_HANDOFF.md (master 62593b2c, prod 62593b2c LIVE) → .agents/active.md (16049 tests) → .claude/rules/00-session-start.md → this checkpoint. Status: category dropdown + stock bug-loop (B1/B2/B3/B5) SHIPPED + DEPLOYED + L1-verified; loop converged. Next: idle / await direction. No deploy without "deploy" THIS turn (V18). /session-start
