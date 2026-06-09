---
updated_at: "2026-06-09 EOD+2 — deposit-in-reports: มัดจำ now counted in reports-payment (ยอดขาย/มัดจำ/ยอดรวม + receipt drill-down) + reports-sale 'มัดจำที่รับเข้า' section + 'มัดจำคงเหลือในระบบ' chip + deposit deep-link. Committed+pushed, NOT deployed."
status: "SHIPPED to master (ahead of prod). Rule Q L2 (real prod) + L1 (real browser, real Firestore) both VERIFIED. Awaiting explicit 'deploy' (frontend-only, vercel-only, no rules)."
branch: "master"
last_commit: "68fefb77 — reports-sale deposit rows COLUMN-ALIGNED into the 18 real columns (teal identity, was ugly band). On 20776c40 (interleave+TDZ fix) on 41024418 (verify) on c90fbf09 (UI) on fbf9a0fa (core)."
tests: "full vitest 16326/0 (16300 + 26 new: deposit-in-reports 16 + flow-simulate 10) + build clean + Rule Q L2 real-prod diag (double-count-guard 0, reconcile diff 0, ฿19,000 deposit now visible) + Rule Q L1 real-browser (new columns match diag, drill-down sale→detail, sale chip+section, deposit deep-link)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "Vercel prod = e56d2ac7. master ahead: V162 (2d13c980) + deposit-in-reports (fbf9a0fa+c90fbf09+41024418). frontend-only, no firestore.rules → vercel-only, no Probe-Deploy-Probe."
firestore_rules_version: "UNCHANGED."
---

# Active — 2026-06-09 EOD+2 — deposit-in-reports (reports-payment + reports-sale)

## State
- master ahead of prod `e56d2ac7`. Tree clean after 3 commits. NOT deployed.
- User: reports-payment ต้องนับมัดจำที่รับเข้า (เงินบัญชีจริง) — มัดจำเดิมไม่โผล่ที่ไหนเลย.

## What this session shipped (spec/plan: docs/superpowers/{specs,plans}/2026-06-09-deposit-in-reports*)
- **reports-payment**: per-channel `ยอดขาย / มัดจำ / ยอดรวม / ใบเสร็จ(กดได้) / %` + refund footnote. เลขใบเสร็จ → PaymentDocsModal (ใบขาย+ใบมัดจำ) → ใบขาย opens SaleDetailModal / ใบมัดจำ → deep-link.
- **reports-sale**: ชิป "มัดจำคงเหลือในระบบ" (Σ remaining active/partial, V154) + section "มัดจำที่รับเข้า" (NOT summed into footer) → each row deep-links.
- **No double-count** (proven real prod): SaleTab deducts deposit BEFORE channels → sale channels never carry มัดจำ. มัดจำ counted from be_deposits paymentChannel/paymentDate.
- New: `loadDepositsByDateRange`, `depositReportUtils`, `DepositReceiptRow`, `PaymentDocsModal`; aggregator rewrite (`aggregatePaymentSummary(sales,deposits,filters)` + `getMethodDocuments` + `refundsInPeriod`); deep-link (`?...&deposit=DEP-x` → BackendDashboard → FinanceTab → DepositPanel DetailModal). AV191 + 26 tests + Rule Q L2 diag.

## Next action
- IDLE / await direction. If "deploy" → `vercel --prod` (frontend-only, no rules → no Probe-Deploy-Probe).

## Outstanding user-triggered actions
- **deploy** (vercel-only) to ship. L1 already verified (real browser) — post-deploy is optional re-confirm.
- **Pre-existing (flagged, NOT this work)**: `npm run test:extended` 283/4699 fail = V50-deleted tabs still imported by 46 stale RTL tests. Opt-in suite, not the tracked baseline.
