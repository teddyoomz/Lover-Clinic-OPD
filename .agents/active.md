---
updated_at: "2026-06-09 EOD+3 — deposit-in-reports SHIPPED + DEPLOYED LIVE: reports-payment ยอดขาย/มัดจำ/ยอดรวม + receipt drill-down · reports-sale deposit rows column-aligned (teal) + มัดจำคงเหลือ chip · deposit deep-link."
status: "DEPLOYED to prod (vercel --prod, aliased lover-clinic-app.vercel.app). This deploy also caught up V162 + the 4-fix (were ahead of prod e56d2ac7). Rule Q L1 (real browser, real Firestore) + L2 (real-prod diag) verified."
branch: "master"
last_commit: "999fae66 — docs(agents) EOD+3 (column-aligned deposit rows). Feature: fbf9a0fa core → c90fbf09 UI → 41024418 verify → 20776c40 interleave+TDZ fix → 68fefb77 column-aligned."
tests: "full vitest 16326/0 EXCEPT 2 pre-existing env-flakes (bsa-task7 execSync git-grep + v85-glow cmd.exe grep — pass isolated 96/0, NOT this work). touched-area 330/0. build clean. NOT re-run at EOD."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = 999fae66 LIVE (V162 + 4-fix + deposit-in-reports). firestore.rules UNCHANGED → vercel-only, no Probe-Deploy-Probe."
firestore_rules_version: "UNCHANGED."
---

# Active — 2026-06-09 EOD+3 — deposit-in-reports (DEPLOYED)

## State
- prod = master HEAD `999fae66` LIVE. Tree clean. Deposit money now counted in reports (was invisible).
- Feature spanned 3 user asks (count deposits → "ใส่ตารางเดียว" → "ทำให้เนียน"); all shipped + deployed.

## What this session shipped (checkpoint: .agents/sessions/2026-06-09-deposit-in-reports.md)
- **reports-payment**: per-channel `ยอดขาย | มัดจำ | ยอดรวม | ใบเสร็จ(กดได้) | %` + refund footnote. กดเลขใบเสร็จ → PaymentDocsModal (ใบขาย+ใบมัดจำ) → ใบขายเปิด SaleDetailModal / ใบมัดจำเด้งหน้ามัดจำ. **No double-count proven on real prod** (sale channels never carry มัดจำ; ฿19,000 deposit now visible, was ฿0).
- **reports-sale**: ชิป "มัดจำคงเหลือในระบบ" (Σ remaining active/partial, V154) + deposit rows **column-aligned into the 18 real columns** (teal `bg-teal-900/10` + badge "มัดจำรับเข้า", ยอดที่ชำระ=amount, full details, —=N/A), interleaved by date, **NOT summed into the sale footer**. Mobile = teal card.
- **deposit deep-link**: `?...&deposit=DEP-x` → BackendDashboard → FinanceTab → DepositPanel opens existing DetailModal.
- New: `loadDepositsByDateRange` · `depositReportUtils` · `paymentSummaryAggregator` rewrite (+`getMethodDocuments`/`refundsInPeriod`) · `DepositReceiptRow` · `PaymentDocsModal` · `renderDepositCell`. AV191 + Rule Q L2 diag `scripts/diag-deposit-in-reports.mjs`.
- **TDZ crash caught by Rule Q L1** (not build): `mergedRows` used `out.rows` before `out`'s useMemo (const TDZ) → blank tab. Fixed (moved after `out`) + SG3 ordering guard.

## Next action
- IDLE / await direction.

## Outstanding user-triggered actions
- **Pre-existing (NOT this work)**: `npm run test:extended` 283 fail = V50-deleted tabs imported by 46 stale RTL tests (opt-in suite; task spawned). · 2 full-suite env-flakes (bsa-task7 / v85-glow) pass isolated.
