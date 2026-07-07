# Checkpoint 2026-07-08 — Reports-home fully functional — SHIPPED local, NOT deployed

## Summary
User (verbatim, + screenshot of the รายงาน landing page): *"ทำให้หน้านี้ใช้ได้ทุก fucntion และเอาที่แนะนำเพิ่มเติมด้วยได้หรือเปล่า ถ้าได้ก็จัดการเลย"*.
Finding = a **V52-class wiring gap**: `ReportsHomeTab` is a hand-maintained card grid that drifted from
navConfig — 7 fully-built, registered, working report tabs (~2,445 LOC) were shown as "เร็วๆนี้"/hidden.
`/brainstorming` (Q1=A wire-all + build-data-ready / Q2=remove-all-dead) → spec → `/writing-plans` →
`/executing-plans` inline (per `feedback_no_large_agent_fanout` — no workflow fan-out). Master ahead of
prod; NOT deployed (V18). Final gate: full vitest **17,573/17,573 · 0 fail** + build clean + Rule Q L1/L2.

## Shipped (10 commits `20223de0`..`59f2b21f`, pushed; rules UNCHANGED → deploy = vercel-only)
1. **Wired 7 mislabeled/hidden working tabs** on the home grid: กำไรขาดทุน→`reports-pnl` · รายจ่ายทั้งหมด→
   `expense-report` · ค่ามือแพทย์→`reports-df-payout` · คอร์สคงเหลือ→`reports-remaining-course` · รายงานคลินิก→
   `clinic-report` · สรุปบัญชีรับชำระ→`reports-payment` · **Smart Audience→`smart-audience`** (a real 507-line
   Phase-16.1 tab stale-labeled "เร็วๆนี้ Phase 10b" — caught by looking before deleting, iron-clad A-adjacent).
2. **4 new report tabs** (ReportShell + DateRangePicker + pure SSOT aggregator + CSV + V52 BS-11 + Rule E):
   - `reports-alt-sales` (ยอดขายช่องทางอื่น) — `altSalesReportAggregator` over listOnlineSales/listVendorSales;
     realized = online {paid,completed}, vendor {confirmed}.
   - `reports-outstanding` (ขายค้างชำระ) — `outstandingSalesAggregator`; paid = Σ`payment.channels[]` (see bug below).
   - `reports-stock-alert` (แจ้งเตือนสต็อค) — `stockAlertReportAggregator`; expired/near-expiry/low-stock via
     stockUtils `hasExpired`/`daysToExpiry` + per-product `alertDayBeforeExpire`/`alertQtyBeforeOutOfStock`. Snapshot (no date).
   - `reports-stock-movements` → **reuses existing `MovementLogPanel`** (ponytail — self-contained, richer than a
     new report; render case in BackendDashboard, no new component/aggregator/tests).
3. **Removed ALL dead cards** (Q2): ยอดขายลูกค้า/รายลูกค้า (dup of reports-customer) · โปรฯ/คอร์ส/สินค้า · กำไรต่อการรักษา ·
   รายจ่ายพนักงาน/อื่นๆ (inside expense-report) · คูปอง/Voucher · ประวัติรักษา · การใช้คอร์ส · แคตตาล็อก×3 · สรุปใช้ยา×4 ·
   นำเข้าสินค้า · ตัดสต็อคล่วงหน้า. → **zero "เร็วๆนี้"/disabled cards remain**; subtitle → "ทุกรายการพร้อมใช้งาน".
4. **Registration**: navConfig (+4 items → auto-flows to ALL_ITEM_IDS deep-link) + BackendDashboard lazy+case +
   tabPermissions (4 gates: sales→sale_view, stock→stock perms) + subTabEmoji + label map.
5. **Drift-guard test** (`tests/reports-home-wiring-drift-guard.test.js`): every active card.tabId ∈ registered
   navConfig ids; no `status:'soon'`; no `tabId:null` → **this wiring-gap class can't recur** (institutional lock).

## Verification (Rule Q)
- aggregator units **13/0** (AS+OS+SA, incl. audit-reports-accuracy Σ=source + adversarial) + registration/deep-link
  **13/0** + drift-guard **5/0** + **Rule I flow-simulate 16/0** (real render, every card clicks → exact tabId).
- **Rule Q L2** `scripts/diag-reports-new-l2.mjs` — 3 aggregators vs REAL prod + adversarial re-verify of every flagged row.
- **Rule Q L1 Playwright on REAL prod** (`tests/e2e/reports-home-wire.spec.js`, PASS): home grid all categories
  N/N active + 0 disabled + 0 "เร็วๆนี้" + Smart Audience live; stock-alert tab renders REAL data (Elonza near-expiry
  lot + 24 low-stock) through card→loader→aggregator→ReportShell. **Screenshots eyeballed (Q-vis)**:
  `test-results/rh1-home-grid.png` + `rh1-stock-alert.png`.

## 🔬 Rule Q L2 caught a would-ship bug (the session's key catch)
`outstandingSalesAggregator` first computed paid from `totalPaidAmount` — **undefined on EVERY live sale** →
the L2 diag flagged **180/219 fully-paid sales as ฿1.67M of FAKE receivables**. Real payment lives in
`payment.channels[{method,amount,enabled}]`; `billing.netTotal` already nets deposit/wallet (must NOT re-add).
Fixed paid = Σ enabled channel amounts → prod outstanding = **0** (clinic is pay-at-point-of-sale: 215 paid +
4 cancelled all reconcile). **Exact same class as the reconciliation false-positive** — Rule Q L2 vs real prod
is non-negotiable. Guarded by OS5 (deposit-netting) test + the diag script. (V-log-worthy: "a report aggregator
must read the REAL money field, verified against prod — a plausible-looking field name is not verification".)

## Files
NEW: src/lib/{altSalesReportAggregator,outstandingSalesAggregator,stockAlertReportAggregator}.js ·
src/components/backend/reports/{AltSalesTab,OutstandingTab,StockAlertTab}.jsx ·
tests/{reports-new-tabs-aggregators.test.js, reports-home-wiring-drift-guard.test.js, reports-new-tabs-flow-simulate.test.jsx} ·
tests/e2e/reports-home-wire.spec.js · scripts/diag-reports-new-l2.mjs · spec+plan HTML.
MOD: reports/ReportsHomeTab.jsx · nav/navConfig.js · pages/BackendDashboard.jsx · lib/tabPermissions.js ·
shell/subTabEmoji.js · phase16.3-flow-simulate.test.js (V21 61→65).

## Next Todo
1. **User L1**: รายงาน → หน้ารายงาน → กดการ์ด (ล็อตหมดอายุ/ใกล้หมดสต็อค = ข้อมูลจริง · ขายค้างชำระ = ว่าง ✓ ถูกต้อง ·
   ออนไลน์/คู่ค้า · กำไรขาดทุน P&L · Smart Audience) → เปิดถูกแท็บ.
2. **Deploy** when user says "deploy" → vercel-only (rules UNCHANGED, no Probe-Deploy-Probe).
3. Prior batch L1 still open (mobile cold-start / AV205 scroll / push).

## Resume Prompt
Resume LoverClinic — 2026-07-08. Reports-home wire-up (7 tabs wired + 4 new report tabs + dead cards removed)
SHIPPED local, NOT deployed (master ahead of prod `83210294`; rules UNCHANGED → vercel-only). Read CLAUDE.md →
SESSION_HANDOFF.md → .agents/active.md → 00-session-start.md → this checkpoint. full vitest 17,573/17,573 + Rule
Q L1/L2 green. Status: awaiting user L1 + explicit "deploy". No deploy without "deploy" (V18).
