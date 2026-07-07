---
updated_at: "2026-07-08 — Reports-home wire-up: 7 mislabeled/hidden tabs wired + 4 data-ready new report tabs + dead cards removed. SHIPPED local, NOT deployed."
status: "master ahead of prod (reports work). Awaiting user L1 on the reports page + explicit 'deploy'. Prior batch (EOD+3 + coldstart/AV205) already prod."
branch: "master"
last_commit: "59f2b21f — test(reports): V21 repoint TAB_PERMISSION_MAP 61→65"
tests: "full vitest 17,573/17,573 · 0 fail + build clean + Rule Q L2 (3 aggregators vs real prod) + Rule Q L1 Playwright PASS (home grid + stock-alert real-data render, screenshots eyeballed). Do NOT re-run at boot."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "83210294 (EOD+3 batch — LIVE). Reports-home work is NOT deployed (no 'deploy' this turn)."
firestore_rules_version: "UNCHANGED (reports work = frontend-only Firestore reads → no rules change → deploy would be vercel-only)"
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
- **User L1**: backend → รายงาน → หน้ารายงาน → กดการ์ดต่างๆ (โดยเฉพาะ ล็อตหมดอายุ/ใกล้หมดสต็อค,
  ขายค้างชำระ [ควรว่าง = ถูกต้อง], การขายออนไลน์/คู่ค้า, กำไรขาดทุน P&L, Smart Audience) → เปิดถูกแท็บ + ข้อมูลจริง.
- **Deploy**: awaiting explicit "deploy" (V18) → vercel-only (rules UNCHANGED → no Probe-Deploy-Probe).

## Outstanding user-triggered actions
- Deploy the reports-home work (vercel-only) when ready.
- Prior batch L1 still open (mobile cold-start / AV205 scroll / push).
