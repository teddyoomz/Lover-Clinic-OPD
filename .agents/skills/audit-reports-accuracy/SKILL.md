---
name: audit-reports-accuracy
description: "Audit Phase 10 report aggregators for accounting + statistical correctness. Read-only reports built over be_sales / be_appointments / be_stock / be_customers / be_deposits must reconcile EXACTLY to source — every row total, every footer sum, every CSV cell. Money is law; statistics is livelihood. Use after any change in src/lib/{saleReport,customerReport,...}Aggregator.js OR src/components/backend/reports/**, AND before every release that ships report changes."
user-invocable: true
argument-hint: "[--quick | --full | --tab=<reports-sale|reports-customer|...>]"
allowed-tools: "Read, Grep, Glob"
---

# Audit Reports Accuracy — LoverClinic Phase 10

**Purpose**: Detect places where reports can lie about money, miscount rows, drift in totals, or display a number that doesn't reconcile to source documents. This skill is READ-ONLY — it diagnoses, it does not fix. Fixes happen in a deliberate session.

## Why this skill exists (rationale)

Reports are how clinic owners read the health of the business. They drive: salary calculations, tax filings, partner payouts, Bank of Thailand requirements, internal disputes ("the doctor says she sold X but the report says Y"). A 0.5% drift over a year on a 10M-baht clinic = 50,000 baht of arguments + audit risk + employee livelihood lost.

Mutation bugs are caught by `/audit-money-flow`. **Aggregation bugs are different**: the source data is correct, but the way we sum it is wrong. Off-by-one in date filters, floating-point drift, cancelled rows leaking into totals, VAT mixed with non-VAT, decimal rounding compounding across 600 rows. None of these throw errors. None of these have unit tests if you didn't write them. The clinic owner sees them at end-of-month and loses trust in the whole system.

This skill enforces that EVERY report aggregator passes 15 invariants before shipping.

## Scope

Covers `src/lib/*Aggregator.js` + `src/components/backend/reports/**` for these tabs:
- reports-sale, reports-customer, reports-appointment, reports-stock
- reports-rfm (CRM Insight), reports-revenue, reports-appt-analysis
- ReportsHomeTab landing (lighter — only AR8/AR12 apply)

Does NOT cover mutations (use `/audit-money-flow` and `/audit-stock-flow` for those) or rules / firestore writes (use `/audit-firestore-correctness`).

## How to run

1. Read [checklist.md](checklist.md) for the full AR1–AR15 invariant catalog
2. Run greps from [patterns.md](patterns.md) — specific regex with file targets
3. For each invariant, decide PASS / WARN / VIOLATION
4. Produce a report using [report-template.md](report-template.md)

## Workflow (per invariant)

For each AR1..AR15:
1. Read the "Where to check" file:line from checklist.md
2. Run the grep pattern from patterns.md
3. Read enough surrounding code to understand the actual aggregation logic
4. Compare actual vs expected — decide:
   - **PASS**: math is correct AND tests cover the boundary AND fixture covers the edge case
   - **WARN**: math looks correct but no test exists, OR test exists but fixture doesn't cover edge (cancelled, refund, multi-channel, etc.)
   - **VIOLATION**: math is wrong, OR rounding policy violated, OR cancelled rows leaking into totals, OR floating-point drift not handled
5. For each non-PASS: emit an entry with expected/actual/impact/fix-hint

## Arguments

- `--quick` — only AR1, AR3, AR4, AR5, AR8, AR12, AR15 (the 7 highest-risk for accounting)
- `--full` — all 15 invariants (default)
- `--tab=<id>` — limit to a single report tab's aggregator (e.g. `--tab=reports-sale` audits only saleReportAggregator.js)

## Output

Single markdown report printed to chat (do NOT write to disk). Format per report-template.md. Severity-sorted: VIOLATION first, then WARN, then PASS (abbreviated).

## Integration with other skills

- `/audit-money-flow` — covers the WRITE side (deposits/wallet/points/billing math). This skill covers the READ side (aggregation over those mutations).
- `/audit-frontend-forms` — DateRangePicker uses canonical DateField (FF1).
- `/audit-frontend-timezone` — date-range filters use Bangkok TZ helpers (TZ1, TZ3).
- `/audit-anti-vibe-code` — aggregator helpers shared via `lib/reportsUtils.js` (AV1 Rule of 3).
- `/audit-all` — runs this skill in Tier 4 alongside frontend-* audits.

## Domain rationale

**Why exact reconciliation matters**: A receipt printed last Tuesday says "ลูกค้าจ่าย 2,500" via 3 channels. The end-of-month sale report sums it as 2,499.97 (floating-point). Bookkeeper reconciles at month-end: 0.03 baht discrepancy across 200 receipts = 6 baht. Trivial in absolute terms but BREAKS the bookkeeper's process — they have to either ignore (loses trust) or hunt for hours (loses time). Math.round to 2 decimals at every aggregation point eliminates this.

**Why cancelled-row exclusion matters**: A sale was cancelled 5 minutes after it was created (mistake, refund, customer changed mind). It still exists in be_sales with `status: 'cancelled'`. If the report includes it in "ยอดที่ชำระ", that day's revenue is overstated. Tax filing built on overstated revenue = paid more tax than owed = audit risk. The default filter MUST exclude cancelled. Explicit "show cancelled" toggle changes display only — totals row still excludes.

**Why date-range boundary exactness matters**: ProClinic shows "period=2026-04-19" → user expects rows from 2026-04-19 EXACTLY (00:00 to 23:59 Bangkok). If our filter is `>= '2026-04-19'` only (no upper bound), it pulls future-dated entries (typos, wrong year). If filter is `< '2026-04-20'` instead of `<= '2026-04-19'`, it works only if all dates are stored as strict date strings. Our convention: `saleDate` is `YYYY-MM-DD` string, filter is `>= from AND <= to`, both inclusive. Tests must assert from/to BOUNDARIES exactly.

**Why VAT separation matters**: Some sales have VAT, some don't. The "ยอดเงิน (Inc. VAT)" column = "ยอดเงิน (Exc. VAT)" + VAT. Mixing = silent over-statement of taxable revenue. Tax authorities require VAT-separated reports. Always render and sum BOTH columns separately; never derive one from the other in the report (only at the source of truth).

**Why CSV-table consistency matters**: Bookkeepers download the CSV, open in Excel, and do their own analysis. If the CSV has different totals than the on-screen table (because export reused a stale variable, or different filter, or different rounding), TWO sources of truth exist. The skill enforces: CSV column ↔ table column ↔ aggregator output, all identical for the same input.

**Why pagination consistency matters**: When the report shows 10 rows per page and there are 50 rows, the FOOTER total (showing across all 5 pages) must equal the sum of all 50 rows, not just the visible 10. Easy to get wrong if "footer" is computed from `paginatedRows` instead of `filteredRows`.
