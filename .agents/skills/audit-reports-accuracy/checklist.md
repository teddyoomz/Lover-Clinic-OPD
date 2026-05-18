# Reports Accuracy Invariants — Full Checklist (AR1–AR15)

Each invariant: **What** (the rule), **Why** (real-world rationale), **Where** (file:line), **How** (how to check), **Expected violation class** (VIOLATION / WARN if drift).

---

## Boundary + Filter (AR1–AR3)

### AR1 — Date filter is INCLUSIVE on both ends
**What**: `dateRangeFilter(items, field, from, to)` includes both `from` and `to` (i.e. `item[field] >= from AND item[field] <= to`).
**Why**: ProClinic UX shows `period=YYYY-MM-DD` as "this exact day" — user expects from=to query to return that day's rows. Off-by-one means missing a day's revenue from the monthly total.
**Where**: `src/lib/reportsUtils.js` (`dateRangeFilter`) + every `*Aggregator.js` that calls it.
**How**:
1. Read `dateRangeFilter` source — confirm `<` vs `<=` (must be `<=`)
2. Read each aggregator — confirm date filter is applied BEFORE aggregation, not after
3. Tests must assert: `from=to=X` returns rows with date=X (boundary inclusion)
**Acceptable**: All dates stored as `YYYY-MM-DD` strings (lexicographic compare). NO Date objects passed to filter (TZ landmines).

### AR2 — Empty range returns zero, never NaN/undefined
**What**: When date range filter excludes all rows (or input is empty), aggregator returns `{ rows: [], totals: { all: 0 }, meta: { count: 0 } }` — never `NaN`, never `undefined`, never throws.
**Why**: An empty period (clinic closed for holidays) is valid. Report must render "0 รายการ / 0.00 บาท" cleanly, not crash.
**Where**: Every `*Aggregator.js`.
**How**: Read aggregator's reduce/sum loops. Confirm initial value is `0`, not undefined. Confirm divisions guard against division by zero.

### AR3 — Cancelled rows excluded from totals BY DEFAULT
**What**: Default `loadSalesByDateRange()` filters out `status === 'cancelled'`. Default report total row computes only over active rows. Explicit "show cancelled" toggle changes DISPLAY only — totals row still computes over active.
**Why**: Cancelled = refunded = money returned = not revenue. Including them double-counts. Tax filings built on cancelled-included totals = audit risk.
**Where**: `src/lib/reportsLoaders.js` (default `includeCancelled: false`) + each aggregator's `total` computation.
**How**:
1. Grep `includeCancelled` — default must be `false` everywhere except explicit "show all"
2. Read each aggregator's totals loop — confirm cancelled rows are SKIPPED in sum even if displayed in rows
3. Tests must assert: 1 active + 1 cancelled → totals = active only

---

## Money Math (AR4–AR7)

### AR4 — All currency rounded via `roundTHB(n)` (Math.round(n*100)/100, half-up)
**What**: Every currency value at every aggregation step is rounded to 2 decimals via the canonical `roundTHB` helper. Never bare `+` or `*` results stored.
**Why**: `0.1 + 0.2 = 0.30000000000000004` (IEEE 754). Across 600 sales, this drifts pennies. Bookkeeper sees discrepancy at month-end. Excel uses banker's rounding by default, we use half-up — but the choice MUST be consistent across CSV + table + aggregator.
**Where**: `src/lib/reportsUtils.js` should export `roundTHB`. Every `*Aggregator.js` should import and use it.
**How**:
1. Confirm `roundTHB` exists and uses `Math.round(n*100)/100`
2. Grep `\.toFixed|Number\(.*\)\s*\+|reduce.*=>.*\+` in aggregators — every numeric result must end with `roundTHB(...)`
3. Tests must assert: aggregator over `[{n:0.1},{n:0.2}]` returns `0.3`, not `0.30000000000000004`

### AR5 — Sum reconciliation: footer total === sum of column rows
**What**: For every report, `totals.column === sum(rows.map(r => r.column))`. Independently computed; the aggregator must NOT trust either side blindly. In dev mode, an assertion can verify.
**Why**: A common bug: footer computed from `filteredSales`, rows computed from `paginatedSales`. These differ if pagination is in the aggregator (not the renderer). Footer says 1M, visible rows sum to 200k, "where's the rest?" — bookkeeper loses trust.
**Where**: Every `*Aggregator.js` that returns `{ rows, totals }`.
**How**:
1. Read aggregator return path
2. Confirm footer totals are computed from THE SAME array as rows (not pre-filter, not post-paginate)
3. Tests must assert: `assertReconcile(out)` — sum each column independently, compare to totals
4. Optional dev-mode `if (NODE_ENV !== 'production') console.assert(reconciled)` in aggregator

### AR6 — Negative refunds handled as separate amounts (do NOT subtract from gross)
**What**: A refund is captured as a separate row (or wallet tx) with positive amount, then added to "การคืนเงิน" column. Gross "ราคาหลังหักส่วนลด" stays as the original sale's netTotal. Net "ยอดที่ชำระ" = gross - refund.
**Why**: ProClinic shows gross + refund separately so the user can see "we sold 500K but refunded 50K, net 450K". Subtracting refund from gross loses information about how much was REFUNDED vs how much was SOLD.
**Where**: SaleReport, RevenueAnalysis, PaymentSummary aggregators.
**How**:
1. Read sale report aggregator's `refundAmount` derivation
2. Confirm refund column is a separate field, not subtracted from `priceAfterDiscount`
3. Tests must assert: 1000 sale + 200 refund → gross=1000, refund=200, net=800 (3 distinct values)

### AR7 — VAT separation: Inc. VAT and Exc. VAT never derived from each other in report
**What**: When a sale has VAT, the underlying source stores BOTH `subtotalExcVat` and `subtotalIncVat` (or `vatAmount`). The report displays both as separate columns and sums them independently — never `incVat = excVat * 1.07` in the report layer.
**Why**: VAT rate may change (5% in past, 7% now, possibly 10% future). Sales from different periods have different rates. Computing in the report ignores this. Tax authorities require source-of-truth VAT for filings.
**Where**: SaleReport, RevenueAnalysis, PaymentSummary.
**How**:
1. Grep `\* 1\.07|1\.07 \*|VAT_RATE|vat.*=.*\*` in reports/lib code — should return zero results
2. Confirm aggregator reads both fields directly from sale doc
3. If the source doc lacks one of the two, default to 0 with a `_warn: 'VAT field missing'` flag in row meta

---

## Statistical Soundness (AR8–AR10)

### AR8 — RFM quintile boundaries computed over ACTIVE customers only
**What**: When computing RFM, the customer set excluded from quintile calculation = customers with 0 sales in the period (no R/F/M to score). Including them with 0 monetary skews the M-quintile boundaries downward.
**Why**: 30 active customers + 200 dormant → median M = 0 (because half are dormant). All active customers map to top quintile. Useless segmentation.
**Where**: `src/lib/rfmUtils.js` (when implemented in 10.6).
**How**:
1. Read RFM input filter — confirm dormant excluded
2. Tests must assert: dormant customers get segment "Lost" (or excluded), not Champions/Loyalty
3. Test with 1 active + 99 dormant → 1 active becomes Champions (top of small set)

### AR9 — Quantile-based segments use stable boundaries across runs
**What**: Same input → same quintile boundaries → same segment classifications. Not dependent on sort order ties or floating-point.
**Why**: Customer X is "Champions" today, "Loyalty" tomorrow with same data → confusing for marketing campaigns + erodes trust in tool.
**Where**: `src/lib/reportsUtils.js` (`quantileBoundaries`, `quintileOf`) + `rfmUtils.js`.
**How**:
1. `quantileBoundaries` sorts numerically + uses fixed `Math.floor` index — confirm
2. Tests must assert: same input → same output across multiple calls (idempotency)
3. Tests must assert: shuffled input → same segment for each customer

### AR10 — Group-by keys never clash silently (e.g. seller "John" in branch A vs B)
**What**: When grouping by a field that may have duplicate values across distinct entities (e.g. seller name "John" exists in branch A and branch B as different staff), use composite key (`branchId + sellerId`) not just name.
**Why**: Otherwise sales from John(A) and John(B) get merged in "ยอดขายรายพนักงาน" report → John(A) gets credit for John(B)'s sales → incorrect commission.
**Where**: `groupBy` callers in aggregators (especially Phase 10 reports 10.7, 10.8).
**How**:
1. Read group-by key extractors in revenue / appt-analysis aggregators
2. Confirm keys use IDs, not names. Names are display-only.

---

## Display + Export Consistency (AR11–AR13)

### AR11 — CSV column == table column for same row (1:1)
**What**: For every row in the table, the CSV row has the SAME number of cells with SAME values (after format()). No "convenience formatting" in table that's missing in CSV.
**Why**: Bookkeeper opens CSV in Excel and totals don't match the screen. Trust eroded.
**Where**: Each report tab — the `columns` array fed to both `<table>` render AND `downloadCSV`.
**How**:
1. Confirm a single `columns` array drives both table + CSV
2. Tests must assert: render table → extract row text → matches CSV row for same input

### AR12 — All currency rendered with `fmtMoney(n)` (Thai locale, 2 decimals, comma sep)
**What**: Every currency cell uses `fmtMoney` (from `lib/financeUtils.js`). Never raw `n.toString()` or `n.toFixed(2)` directly.
**Why**: `fmtMoney(1234567.89)` = `"1,234,567.89"` — clinic owners read large numbers with comma separators. Without commas, easy to misread by 1 order of magnitude.
**Where**: Aggregator `format()` callbacks + table cell renderers.
**How**:
1. Grep `\.toFixed\(2\)|toString\(\)` in reports — should ONLY appear inside fmtMoney itself
2. Confirm every currency column.format = `(v) => fmtMoney(v)`

### AR13 — Date rendered with locale convention (dd/mm/yyyy ค.ศ. for admin reports)
**What**: All dates in reports rendered as `dd/mm/yyyy` Christian Era (admin convention; PatientDashboard/OPD uses พ.ศ.).
**Why**: Backend admin / accounting context expects Western year. Mixing พ.ศ. and ค.ศ. in same report = arithmetic confusion in spreadsheets.
**Where**: Each report's date column format function.
**How**:
1. Grep `format.*locale|locale.*be|locale: 'be'` in reports — should be 'ce' (or omitted, defaulting to ce)
2. Confirm `fmtDate` (or equivalent helper) is used; never raw `Date.toLocaleDateString` (TZ-fragile)

---

## Operational Safety (AR14–AR15)

### AR14 — Source change does not break aggregator (defensive field access)
**What**: Aggregator reads source fields with `??` or default values. If a be_sale doc lacks `payment.channels` (legacy / corrupted), aggregator treats as `[]` and continues; doesn't throw or produce NaN totals.
**Why**: Source schema evolves over phases. Phase 6 sales may lack Phase 9 fields. Aggregator must be backward-compatible with EVERY past schema version.
**Where**: Aggregator field access — every `sale.foo.bar` should be `sale.foo?.bar ?? default`.
**How**:
1. Grep `\.payment\.channels|\.billing\.|sellers\[|items\.` — confirm `?.` chain or fallback
2. Tests must include legacy fixture (sale doc with only Phase 6 fields, no payment.channels)

### AR15 — Idempotency: aggregator over same input ALWAYS produces same output
**What**: `aggregate(sales, filters)` returns deterministic output. No `Date.now()`, no `Math.random()`, no global state, no time-dependent logic in the aggregator (date filters get `from`/`to` AS PARAMETERS, not derived inside).
**Why**: A test that asserts exact totals must pass on Monday and Friday. A bookkeeper running the same period in May should get the same totals as in April. Hidden time dependency = "report changes if I open it twice" = instant trust loss.
**Where**: All aggregators.
**How**:
1. Grep `Date\.now\(\)|new Date\(\)|Math\.random\(\)|bangkokNow\(\)` in aggregators — should be ZERO. Time gets passed in.
2. Tests must assert: `aggregate(sales, f) === aggregate(sales, f)` (deep equal across two calls)

---

## Skill version log

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-04-19 | Initial: AR1–AR15. Companion to /audit-money-flow on the read side. Created during Phase 10.2 build. |
