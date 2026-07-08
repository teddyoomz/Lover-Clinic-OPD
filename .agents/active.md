---
updated_at: "2026-07-08 — Reports-home wire-up: 7 mislabeled/hidden tabs wired + 4 data-ready new report tabs + dead cards removed. SHIPPED + DEPLOYED LIVE (vercel-only)."
status: "master = prod LIVE (alias 200 + fresh version.json). Awaiting user L1 on the reports page. Prior batch (EOD+3 + coldstart/AV205) also prod."
branch: "master"
last_commit: "9c02daf9 — docs(state): reports-home wire-up checkpoint + handoff"
tests: "full vitest 17,573/17,573 · 0 fail + build clean + Rule Q L2 (3 aggregators vs real prod) + Rule Q L1 Playwright PASS (home grid + stock-alert real-data render, screenshots eyeballed). Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "= master (deployed 2026-07-08, vercel-only `lover-clinic-n999lj1l7`; firestore.rules UNCHANGED → no Probe-Deploy-Probe; alias 200)"
firestore_rules_version: "UNCHANGED (reports = frontend-only Firestore reads → deploy was vercel-only)"
---

# Active — 2026-07-08 — Reports-home fully functional

## State
- User: make the รายงาน landing page's every card work + add recommended reports.
- Finding = a wiring gap (V52-family): 7 fully-built, registered, working tabs were shown as
  "เร็วๆนี้"/hidden on the home grid (P&L, expense, DF-payout, remaining-course, clinic-report,
  payment-summary, **Smart Audience**). Wired them + built 4 data-ready new reports; removed all
  dead cards → zero "เร็วๆนี้"/disabled cards remain.
- 4 new report tabs: `reports-alt-sales` (online+vendor) · `reports-outstanding` (ค้างชำระ) ·
  `reports-stock-alert` (expiry+low-stock) · `reports-stock-movements` → **reuses MovementLogPanel**
  (ponytail — didn't rebuild a richer existing viewer). SSOT pure aggregators + ReportShell scaffold.
- **Drift-guard test** (`reports-home-wiring-drift-guard.test.js`): every active card's tabId must be
  a registered navConfig id → this wiring-gap class can't recur.
- 🔬 **Rule Q L2 caught a would-ship bug**: outstanding read `totalPaidAmount` (undefined on every live
  sale) → ฿1.67M FAKE receivables. Real payment = `payment.channels[]`. Fixed → prod outstanding = 0
  (pay-at-point-of-sale). Same class as the recon false-positive. `scripts/diag-reports-new-l2.mjs`.

## Next action
- **User L1 on LIVE prod**: backend → รายงาน → หน้ารายงาน → กดการ์ดต่างๆ (โดยเฉพาะ ล็อตหมดอายุ/ใกล้หมดสต็อค,
  ขายค้างชำระ [ควรว่าง = ถูกต้อง], การขายออนไลน์/คู่ค้า, กำไรขาดทุน P&L, Smart Audience) → เปิดถูกแท็บ + ข้อมูลจริง.

## Outstanding user-triggered actions
- (none — reports-home DEPLOYED LIVE). Prior batch L1 still open (mobile cold-start / AV205 scroll / push).
