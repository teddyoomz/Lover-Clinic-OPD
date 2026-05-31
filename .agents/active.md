---
updated_at: "2026-06-01 EOD — Sales paid-column + table redesign SHIPPED + DEPLOYED. prod = current code."
status: "DEPLOYED (vercel-only, no Probe-Deploy-Probe). USER L1 pending. HEAD=docs commit; prod bundle = code HEAD."
branch: "master"
last_commit: "5fe8edaa (active.md post-deploy). prod bundle = 0628f91a LIVE (code identical; 5fe8edaa is docs-only)."
tests: "15510/0 full suite (ran this session after redesign V21 fixups; NOT re-run at session-end per rule)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0628f91a LIVE (aliased). Was 0c607f68 (V142+V143). Deployed the 29-commit batch this turn."
firestore_rules_version: "UNCHANGED. No rules/storage/index/cron touched."
---

# Active Context — sales paid-column + table redesign DEPLOYED (2026-06-01)

## State
- Deployed the 29-commit batch to prod (`vercel --prod` → aliased lover-clinic-app.vercel.app). Frontend/lib only → no Probe-Deploy-Probe (verified 0 rules/storage/index/cron in diff). Dev `public/brainstorm-*.html` stripped pre-deploy.
- Two features shipped this session (brainstorm→spec→plan→implement each, cosmetic-shell, Rule Q): paid column + table redesign. Batch also carried prior EOD+5/EOD+6 work (staffchat resizable, confirmed-card/course-step).
- Full suite 15510/0; build clean.

## What this session shipped (detail → checkpoint 2026-06-01-sales-paid-column-and-redesign.md)
- **ยอดชำระจริง column + 30/page pagination** (tab=sales): NEW financeUtils resolveSalePaidAmount/Outstanding/Tone (Rule R diag 35/35 use payment.channels; Rule Q L2 0-mismatch/40 prod sales) + reuse canonical usePagination(30)+Pagination.
- **Sales table redesign** (clean money nowrap, source→tag, status pill, compact actions, responsive min-w+truncate): NEW `SaleRowParts.jsx` (pure SaleSourceTag+SaleStatusPill, RTL 6/0).
- Tests: unit/RTL/source-grep/flow-simulate + 3 V21 fixups (header 8-col / money-clean / OPD label→SaleRowParts). Rule Q-vis: 2 themes + responsive 1280/1040/900 SEEN in Chrome MCP.

## Next action
- **USER L1** on the LIVE admin-gated SaleTab + real Windows-scaled screen: paid column (green/amber/gray) + 30/page pager + redesign (compact actions, status pill nowrap, source tag, responsive). Cosmetic-shell + class-locked — high confidence, SEE-it pending.

## Outstanding user-triggered actions
- USER L1 (above). If a bug surfaces → /systematic-debugging + Rule P.
- Ship artifact: V-log entries for this session (paid-column + redesign) + carryover (EOD+6 resizable-panel, EOD+5 V73-BS1 confirm-btn + course-step) — not yet written.
- (carryover) cron stock-lot-cleanup active 03:45 BKK.
- Honest gap: assembled real-SaleTab pixels + responsive on a real scaled screen = USER (Chrome harness window-resize limited; mockup + fixed-width previews verified).
