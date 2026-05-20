---
updated_at: "2026-05-20 EOD+1 — Sales cancelled sub-tab (การขาย / ยกเลิกแล้ว) SHIPPED LOCAL (awaiting deploy)"
status: "✅ Sales cancelled sub-tab built + Rule Q L1 verified on real prod (read-only) · LOCAL ONLY · awaiting user 'deploy'"
branch: "master"
last_commit: "(this session) test/feat sales-cancelled-subtab — pushed"
tests: "sale-subtab-filter 15 + flow-simulate 17 = 32 NEW GREEN · targeted 145/145 · full vitest 13539 PASS / 31 pre-existing FAIL (all unrelated — see below) / 19 skip · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0511be1e LIVE (V43-followup) — sales sub-tab NOT yet deployed"
firestore_rules_version: "unchanged (idempotent — sales sub-tab is UI-only, no rules/data)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = origin (clean, all pushed). Sales cancelled sub-tab = LOCAL ONLY. Prod still on `0511be1e` (V43-followup).
- Feature is UI-only (client-side split over already-loaded sales) — no backend / no Firestore rules / no data ops / no BSA change.

## What this session shipped (Sales cancelled sub-tab)

- **Brainstorm → spec → plan → 4-task inline execution.** Splits cancelled (status=cancelled) sales out of the main "ขาย / ใบเสร็จ" list into a "ยกเลิกแล้ว" sub-tab; default "การขาย" shows only non-cancelled.
- NEW `src/lib/saleSubTabFilter.js` (pure `isCancelledSale` + `filterSalesBySubTab`, single-source — mirrors skipStockFilter pattern).
- `SaleTab.jsx`: SALE_SUB_TABS pill row (mirrors StockTab) + subTab state + handleSubTabChange (resets payment filter on switch) + filtered uses helper + dropdown active-tab-only & drops "ยกเลิก" option + per-tab header text + cancelled-empty + active-no-sales empty states. NO wiring/handler change.
- Tests: `tests/sale-subtab-filter.test.js` (15) + `tests/sales-cancelled-subtab-flow-simulate.test.js` (17 — F1 flow + F2 source-grep locks + F3 UI-conditional mirrors). Full RTL render dropped (non-idiomatic for SaleTab — tested via source-grep + mirrors per repo convention).
- Spec `docs/superpowers/specs/2026-05-20-sales-cancelled-subtab-design.html` · plan `docs/superpowers/plans/2026-05-20-sales-cancelled-subtab.html`.

## Rule Q V66 L1 verification (real browser, real prod, read-only)

- Active tab: 2 rows (both ชำระแล้ว), dropdown present WITHOUT "ยกเลิก" option, count "2 รายการ". ✓
- Cancelled tab: 9 rows (all "ยกเลิก"), dropdown HIDDEN, count "9 รายการ", desc "รายการที่ยกเลิกแล้ว…". ✓ (2+9 = 11 total — matches original screenshot)
- Round-trip → active: filterStatus reset to "ทุกสถานะ", back to 2 rows. ✓
- (Coordinate clicks were intercepted by the open mega-menu overlay; verified via real React onClick fired through element.click() + DOM eval read-back.)

## Next action

- Idle — feature done LOCAL. Await user "deploy" to ship (combined V15 — Vercel only; rules/storage idempotent, no probe needed since no rules change... but V15 convention bundles them).

## Outstanding user-triggered actions

- **Deploy sales cancelled sub-tab** — say "deploy" (Vercel; Firebase rules unchanged so V15 combined is optional). NOT deployed this turn (V18).
- **L1 hands-on** (optional, Rule Q gold): user opens `/?backend=1&tab=sales` on their device → toggle การขาย / ยกเลิกแล้ว pills.
- **31 pre-existing test failures** — all confirmed unrelated to this change (backend-menu-d ×4 / v36 deductStockForSale / rp1 SaleTab IIFE line 1228 / tf3 / phase-26-0 / audit-branch-scope AV37 / phase-17-1 flake / v81-emulator gaxios env). Separate cleanup batch when desired.
- **V106 stock-movement 30-day retention** — brainstorm locked (Q1=C / Q2=A / Q3=A / Q4=A); spec NOT written; awaiting "ship V106".
