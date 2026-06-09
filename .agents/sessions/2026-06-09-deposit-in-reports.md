# 2026-06-09 EOD+3 — Deposit money in reports (reports-payment + reports-sale) — SHIPPED + DEPLOYED

## Summary
Made the reports reflect deposit money. `reports-payment` ("เงินที่บัญชีได้รับจริง") now folds deposits-RECEIVED per channel (`ยอดขาย | มัดจำ | ยอดรวม | ใบเสร็จ(clickable) | %`) with a sale+deposit drill-down; `reports-sale` shows a "มัดจำคงเหลือในระบบ" chip + deposit rows interleaved into the one sale table (column-aligned, teal). Deposit money was previously invisible (฿0); now counted (฿19,000 on prod). 3 user asks in one flow: count deposits → "ใส่ตารางเดียวกัน" → "ทำให้เนียน". DEPLOYED (vercel-only); this deploy also caught up V162 + the prior 4-fix (were ahead of prod).

## Current State
- prod = master HEAD `999fae66` LIVE @ lover-clinic-app.vercel.app (vercel --prod aliased; frontend-only, NO firestore.rules → no Probe-Deploy-Probe).
- Tree clean. full vitest 16326/0 except 2 pre-existing env-flakes (bsa-task7, v85-glow — pass isolated). build clean.
- Rule Q L2 (real-prod diag) + L1 (real browser, real Firestore, login) both verified.
- No double-count: SaleTab deducts deposit BEFORE building payment.channels → channels never carry the deposit portion (proven on prod: 0 sales with a มัดจำ channel).
- Money model: deposit counted by `paymentDate`/`paymentChannel`, status≠cancelled (gross, refunds shown separately not subtracted). Remaining = Σ `remainingAmount` active/partial (V154).

## Commits
```
fbf9a0fa core (loader + utils + aggregator folds deposits, no double-count)
c90fbf09 UI (payment columns + drill-down; sale section+chip; deep-link)
41024418 verify (source-grep + Rule I + AV191 + Rule Q L2 diag)
20776c40 interleave into one table + TDZ crash fix
68fefb77 deposit rows column-aligned into the 18 real columns (teal identity)
+ docs(agents) commits
```

## Files Touched
- src/lib/reportsLoaders.js (loadDepositsByDateRange) · src/lib/depositReportUtils.js (NEW) · src/lib/paymentSummaryAggregator.js (rewrite: sales+deposits, getMethodDocuments, refundsInPeriod, canonicalMethod export, new columns)
- src/components/backend/reports/PaymentSummaryTab.jsx · SaleReportTab.jsx · DepositReceiptRow.jsx (NEW) · PaymentDocsModal.jsx (NEW)
- src/pages/BackendDashboard.jsx · src/components/backend/FinanceTab.jsx · src/components/backend/DepositPanel.jsx (deep-link → DetailModal)
- tests/deposit-in-reports.test.js (NEW) · tests/deposit-in-reports-flow-simulate.test.js (NEW) · scripts/diag-deposit-in-reports.mjs (NEW, Rule Q L2)
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV191) · docs/superpowers/{specs,plans}/2026-06-09-deposit-in-reports*
- V21 fixups: v129 SG2 import regex

## Decisions (1-line each)
- Q1 มัดจำ = gross received (exclude cancelled, refunds NOT subtracted, shown separately).
- Q2 drill-down = both ใบขาย + ใบมัดจำ of the channel (sale→SaleDetailModal, deposit→deep-link).
- Q3 reports-sale = interleave deposit rows INTO the one table (after the separate-section v1 ate the viewport).
- Q4 jump = `window.open(?tab=finance&subtab=deposit&deposit=DEP-x)` → DepositPanel DetailModal.
- EOD+3 refinement: deposit row column-mapped (renderDepositCell, 18 td) + teal-tint identity + amount in ยอดที่ชำระ (NOT a colSpan band).
- TDZ lesson: a `useMemo` referencing another `useMemo`'s `const` must be declared AFTER it (const not hoisted) — build can't catch; only L1 mount does.
- AV191 = deposit-received comes from be_deposits never sale channels (no double-count); reports-sale deposit rows informational, never in the footer.

## Next Todo
- IDLE / await direction.
- Pre-existing (NOT this work): `npm run test:extended` 283 fail (V50-deleted tabs in stale RTL tests; task spawned); 2 env-flakes (bsa-task7/v85-glow) pass isolated.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-09 EOD+3.
Read: CLAUDE.md → SESSION_HANDOFF.md (master=999fae66, prod=999fae66 LIVE) → .agents/active.md → .claude/rules/00-session-start.md → this checkpoint.
Status: deposit-in-reports SHIPPED + DEPLOYED (also caught up V162 + 4-fix). reports-payment ยอดขาย/มัดจำ/ยอดรวม + drill-down; reports-sale deposit rows column-aligned (teal) + chip + deep-link. Rule Q L1+L2 verified. 16326/0 except 2 env-flakes.
Next: idle / await direction.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules.
/session-start
