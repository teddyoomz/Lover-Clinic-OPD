# Checkpoint — 2026-06-01 EOD — Sales ยอดชำระจริง column + 30/page pagination + table redesign (SHIPPED + DEPLOYED)

## Summary
Two cosmetic-shell features on the sales tab, each via full `/brainstorming`→spec→`/writing-plans`→`/executing-plans` inline TDD: (1) a **ยอดชำระจริง** (actual-paid) column color-coded by status + **30/page pagination**; (2) a **table redesign** (clean money, source→tag, status pill, compact actions, responsive). Whole 29-commit batch (incl. carryover EOD+5/EOD+6) DEPLOYED to prod (vercel-only). USER L1 pending.

## Current State
- master = `5fe8edaa` (docs); **prod bundle = `0628f91a` LIVE** @ lover-clinic-app.vercel.app (aliased; was `0c607f68`). vercel-only — no Probe-Deploy-Probe (0 rules/storage/index/cron in diff). Dev `public/brainstorm-*.html` stripped pre-deploy.
- Full vitest **15510/0** (ran post-redesign-V21-fixups; ALL GREEN, no flake this run). Build clean.
- Cosmetic-shell both features: zero change to sale create/edit/pay/cancel flow / handlers / state / testids / row-click. No fetch/write.
- Decisions: column Q1=A channels / Q2=B color-coded / Q3=rename→ยอดสุทธิ · redesign Q1=A clean&compact / Q2=A compact-icons / Q3=A source→tag.
- Honest gap: assembled real admin-gated SaleTab pixels + real Windows-scaled screen L1 = USER (Chrome harness window-resize limited; grounded mockup + fixed-width previews verified).

## Commits (this session, key)
```
5fe8edaa docs(agents): active.md — DEPLOYED (prod=0628f91a, L1-pending)
0628f91a chore(sales): strip dev brainstorm mockups before deploy
786a07b5 test(sales): V21 fixups for table redesign (Task 3)
c29bacd0 feat(sales): redesign table — clean money/source→tag/status pill/compact actions/responsive (Task 2)
07c8f4a3 feat(sales): SaleSourceTag + SaleStatusPill pure row parts (Task 1)
9ccba81c+c8a3014b docs(sales): redesign plan + spec
5847c01c test(sales): paid column source-grep + flow-simulate + Rule Q L2 diag (Task 4)
1dd515e2 feat(sales): paid column + rename + 30/page pagination (Tasks 2+3)
78c2ecda feat(sales): resolveSalePaidAmount/Outstanding/Tone helpers (Task 1)
f9715440+30910187 docs(sales): paid-column plan + spec
```

## Files Touched (names only)
- NEW `src/lib/financeUtils.js` resolvers (resolveSalePaidAmount/Outstanding/Tone, reuse roundTHB)
- NEW `src/components/backend/SaleRowParts.jsx` (SaleSourceTag + SaleStatusPill, pure)
- MOD `src/components/backend/SaleTab.jsx` (paid col + rename + pagination + redesign restyle + pay-modal DRY)
- NEW tests: `sale-paid-amount-helpers` (20) · `sale-paid-column-wiring`/`-flow-simulate` (10) · `sale-row-parts-rtl` (6) · `sale-table-redesign-wiring` (5)
- V21 fixups: `branch-aware-clinic-settings` (C.1+C.4) · `v33-customer-id-resolution` (D.1)
- NEW `scripts/diag-sale-paid-shape.mjs` (Rule R + Rule Q L2)
- docs: 2 specs + 2 plans (`docs/superpowers/{specs,plans}/2026-05-31-sales-paid-column-pagination*` + `2026-06-01-sales-table-redesign*`)

## Decisions (1-line each)
- Actual-paid = Σ `payment.channels[].amount` → `totalPaidAmount` fallback → 0 (Rule R diag: 35/35 real sales use channels; 0 use totalPaidAmount).
- Pagination = reuse canonical `usePagination(items,{pageSize:30,key})` + `<Pagination>` (Rule C1) — key=subTab|search|status|branch resets page.
- Redesign extracts pure `SaleRowParts.jsx` → RTL-testable in isolation (no SaleTab mount) + trims 2000-line SaleTab.
- Responsive = `table min-w-[920px]` + truncate flexible cols + nowrap fixed cols + overflow-x-auto fallback (verified 1280/1040/900 via fixed-width preview — live window-resize harness-blocked).
- Rule Q L2 pattern: re-run the Rule R diag importing the SHIPPED helper → assert == real-prod paid (0 mismatch / 40 sales).

## Next Todo (ship artifacts — when L1 confirms / next session)
- V-log entries (this session paid-column + redesign) + carryover (EOD+6 resizable-panel, EOD+5 V73-BS1 confirm-btn + course-step). Consider AVxx for the actual-paid-resolver + redesign cosmetic-shell.
- USER L1 on LIVE prod tab=sales (paid colors + pager + redesign + responsive on a real scaled screen).

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-06-01 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=5fe8edaa, prod=0628f91a)
3. .agents/active.md (15510 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-06-01-sales-paid-column-and-redesign.md

Status: master=5fe8edaa, prod=0628f91a LIVE (sales paid-column + 30/page + table redesign + carryover EOD+5/+6 deployed), 15510/0 (not re-run).
Next: USER L1 on LIVE tab=sales (paid green/amber/gray + 30/page pager + redesign compact/responsive on a real Windows-scaled screen). If bug → /systematic-debugging + Rule P.
Outstanding (user): L1; ship-artifact V-log entries (paid-column + redesign + carryover resizable-panel/V73-BS1/course-step) not yet written; cron stock-lot-cleanup 03:45 BKK.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules; Rule Q L1/L2 before "verified"; ground mockups in REAL design (§S-design).
/session-start
```
