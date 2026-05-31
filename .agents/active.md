---
updated_at: "2026-06-01 — Sales paid-column + table redesign SHIPPED + DEPLOYED. prod = master."
status: "DEPLOYED this turn (vercel-only, no Probe-Deploy-Probe — frontend/lib only). USER L1 pending. 0 commits ahead."
branch: "master"
last_commit: "0628f91a (strip dev mockups before deploy). prod = 0628f91a LIVE."
tests: "15510/0 full suite (ran after redesign V21 fixups; ALL GREEN, no flake this run)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0628f91a LIVE (aliased). Was 0c607f68 (V142+V143). Deployed the 29-commit batch."
firestore_rules_version: "UNCHANGED. No rules/storage/index/cron touched this batch."
---

# Active Context — sales paid-column + table redesign DEPLOYED (2026-06-01)

## State
- Deployed the whole batch (29 commits) to prod via `vercel --prod` → aliased https://lover-clinic-app.vercel.app. Frontend/lib only → no Probe-Deploy-Probe (verified: 0 rules/storage/index/cron files in diff).
- This session shipped 2 features (brainstorm→spec→plan→implement each, cosmetic-shell + Rule Q): (1) **ยอดชำระจริง column + 30/page pagination** on tab=sales; (2) **sales table redesign** (clean money, source→tag, status pill, compact actions, responsive min-w+truncate).
- Batch also carried prior un-deployed work: staffchat resizable panel (EOD+6) + EOD+5 confirmed-card/course-step/confirm-btn + EOD docs.

## What shipped this session (detail → spec/plan in docs/superpowers/)
- NEW `src/lib/financeUtils.js` resolveSalePaidAmount/Outstanding/Tone (Rule R diag: 35/35 real sales use payment.channels; Rule Q L2 0-mismatch on 40 prod sales).
- NEW `src/components/backend/SaleRowParts.jsx` (pure SaleSourceTag + SaleStatusPill, RTL-tested 6/0).
- `SaleTab.jsx`: paid column + rename ยอดรวม→ยอดสุทธิ + pagination(usePagination 30) + redesign restyle. Cosmetic-shell.
- Tests: +unit/RTL/source-grep/flow-simulate + 3 V21 fixups (header 8-col / money-clean / OPD label→SaleRowParts). Full suite 15510/0.

## Next action
- **USER L1** on the LIVE admin-gated SaleTab + real Windows-scaled screen: paid column (green/amber/gray) + 30/page pager + redesign (compact actions, status pill nowrap, source tag, responsive). Cosmetic-shell, class-locked — high confidence, SEE-it pending.

## Outstanding user-triggered actions
- USER L1 (above). If a bug surfaces → /systematic-debugging + Rule P.
- Ship artifact (session-end): V-log entries for this session (paid-column + redesign) + carryover (EOD+6 resizable-panel, EOD+5 V73-BS1 confirm-btn + course-step). Not yet written.
- (carryover) cron stock-lot-cleanup active 03:45 BKK.
- Honest gap: assembled real-SaleTab pixels + responsive on a real scaled screen = USER (Chrome harness window-resize limited; mockup + 1280/1040/900 fixed-width previews verified).
