---
updated_at: "2026-06-03 EOD+2 — category dropdown + systematic-debugging stock loop (B1/B2/B3/B5) SHIPPED + DEPLOYED + L1-verified."
status: "Loop converged (R1 B1+B2 · R2 clean · R3 B5 · R4 clean) + DEPLOYED. Verified: full vitest 15992→16049/0 · build clean · real-prod Rule Q L2 e2e 34/0 · live-app L1 all 4 features green · 3 Rule R diags 0-anomaly."
branch: "master"
last_commit: "62593b2c (Rule R order-search real-shape diag) — 9 commits 2e96a847..62593b2c this session"
tests: "Full vitest 16049/0 (this session) · build clean · real-prod e2e-v159 34/0. NOT re-run at EOD."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "62593b2c — DEPLOYED this session (ships V158→V159 + dropdown + B1/B2/B3/B5). prod == master, LIVE."
firestore_rules_version: "UNCHANGED (all changes client-SDK → no Probe-Deploy-Probe; vercel-only deploy)."
---

# Active — 2026-06-03 EOD+2 — category dropdown + stock bug-loop + deploy

## State
- master `62593b2c`; prod `62593b2c` LIVE (deployed this session — prod caught up from V158).
- Working tree clean. No firestore.rules change.
- systematic-debugging loop CONVERGED (round 4 clean) → deployed per user "พอหมดลูปค่อย deploy".

## What this session shipped (detail → checkpoint 2026-06-03-stock-expiry-bugloop-deploy.md)
- **Category dropdown** (`/brainstorming`→spec×2-rev→plan→TDD): ProductFormModal หมวดหมู่ datalist = distinct `categoryName` from be_products ONLY (no master, plain options, type-new); removed dead `listProductGroups`/`groups`. 1 file → products/stock/central tabs.
- **B1** (conservation): dual-path adjust ran qty before expiry as 2 awaits → transient fail + retry DOUBLE-applied qty. Fix: reorder expiry-FIRST/qty-LAST + in-tx idempotency guard in `updateStockBatchExpiry`.
- **B2** (central sync no-op): central items key `centralOrderProductId`, sync matched only `orderProductId` → match BOTH tier keys.
- **B3+B5** (date display): stock expiry/importedDate raw ISO → `fmtSlashDate` (NEW, TZ-safe, canonical dateFormat.js) → dd/mm/yyyy across 8 components (display-only; DB stays ISO).
- **Refuted with REAL data** (no fabricated bugs): C1 category field-name · C5 DateField format · C6 balance refresh · C7 order→batch sync · C8 type/status select.
- **L1 live-app verified** (Chrome MCP): dd/mm/yyyy dates (zoomed) · 35 plain category options · expiry-edit form · "Lidocain" search→1 match.

## Next action
- IDLE / await direction. No firestore.rules pending. Deploy already done.

## Outstanding user-triggered actions
- Optional Rule P closure: `audit-stock-flow` S37 (dual-path order + tier-key sync + idempotency) + a 00-session-start §2 V-log entry for B1/B2 (regression tests `v159-fix-expiry-hardening` already lock behavior).
- Low-pri carryover: be_products data cleanup (V145 — 36 junk docs, dry-run done) · Neuramis merge + junk course "หฟแฟ" · cross-collection reconciliation report (V157 follow-on) · SESSION_HANDOFF head trim <150 KB.
