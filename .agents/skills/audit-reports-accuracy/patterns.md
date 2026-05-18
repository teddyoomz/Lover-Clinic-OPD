# Grep Patterns — Reports Accuracy Audit

Run these in order. Each tied to AR1–AR15. For each match, Read surrounding code to diagnose.

---

## AR1 — Date filter inclusivity

```
Grep: "dateRangeFilter|>= from|<= to|< from|< to" in src/lib/reportsUtils.js + src/lib/*Aggregator.js, output_mode=content, -n=true, -A=2
```
Confirm `<=` is used (inclusive). Any `<` (strict less-than) on the upper bound = VIOLATION.

```
Grep: "loadSalesByDateRange|loadAppointmentsByDateRange" in src/components/backend/reports/, output_mode=content, -n=true, -A=2
```
Confirm callers pass both `from` AND `to` (not just `from`).

## AR2 — Empty range guards

```
Grep: "reduce\\(.*,\\s*0\\)|\\|\\| 0|\\?\\? 0" in src/lib/*Aggregator.js, output_mode=content, -n=true
```
Sums must initialize at 0. Defaults must guard against undefined.

```
Grep: "/ \\(.*\\.length|\\.length \\?" in src/lib/*Aggregator.js, output_mode=content, -n=true
```
Divisions by length must check for 0 (e.g. `count > 0 ? sum/count : 0`).

## AR3 — Cancelled-row exclusion

```
Grep: "includeCancelled|status === 'cancelled'|status !== 'cancelled'" in src/lib/, output_mode=content, -n=true, -A=2
```
Default of `includeCancelled` must be `false`. Aggregators must skip cancelled rows in totals computation even if shown in display.

```
Grep: "totals|footer.*sum|footer.*total" in src/lib/*Aggregator.js, output_mode=content, -n=true, -A=4
```
Confirm totals exclude cancelled.

## AR4 — roundTHB usage

```
Grep: "export function roundTHB|roundTHB" in src/lib/, output_mode=content, -n=true
```
Confirm `roundTHB` exists in reportsUtils.js. Confirm aggregators import + use it.

```
Grep: "Math\\.round\\(.*100\\) ?/ ?100|\\.toFixed\\(2\\)|parseFloat" in src/lib/*Aggregator.js, output_mode=content, -n=true
```
Inline rounding outside roundTHB = WARN (use the helper consistently).

## AR5 — Sum reconciliation

```
Grep: "filteredRows|paginatedRows|totals.*=" in src/lib/*Aggregator.js, output_mode=content, -n=true, -A=3
```
Footer totals must be computed from FULL filtered set, not paginated subset.

```
Grep: "assertReconcile|console\\.assert" in src/lib/*Aggregator.js, output_mode=content, -n=true
```
Dev-mode assertion welcome (not required, but a strong signal).

## AR6 — Refund handled separately

```
Grep: "refund|refundAmount|การคืนเงิน" in src/lib/*Aggregator.js, output_mode=content, -n=true, -A=2
```
Confirm refund is its OWN column, not subtracted from gross.

## AR7 — VAT separation

```
Grep: "1\\.07|VAT_RATE|\\* 1\\.0|vat.*=.*\\*" in src/lib/, output_mode=content, -n=true
```
Should return ZERO results in report code. VAT comes from source field, never derived.

```
Grep: "subtotalIncVat|subtotalExcVat|vatAmount" in src/, output_mode=content, -n=true
```
Confirm both fields exist on source docs. If only one → VIOLATION (silent VAT inference).

## AR8 — RFM dormant exclusion (10.6 only)

```
Grep: "computeRFM|frequency === 0|F === 0|monetary === 0" in src/lib/rfmUtils.js, output_mode=content, -n=true, -A=3
```
Customers with F=0 or M=0 must be excluded from quintile boundary computation.

## AR9 — Stable quantile boundaries

```
Grep: "Math\\.random|Date\\.now|new Date\\(\\)" in src/lib/{rfm,reports}Utils.js, output_mode=content, -n=true
```
Should return ZERO. Deterministic.

## AR10 — Composite group-by keys

```
Grep: "groupBy.*name|groupBy\\(.*\\.name|groupBy\\(.*sellerName" in src/lib/, output_mode=content, -n=true
```
Group-by keys using only display names = WARN. Should use IDs.

## AR11 — CSV / table column parity

```
Grep: "buildCSV|downloadCSV|columns" in src/components/backend/reports/, output_mode=content, -n=true, -A=3
```
Confirm a SINGLE `columns` array drives both <table> render AND `downloadCSV()`.

## AR12 — fmtMoney usage

```
Grep: "\\.toFixed\\(2\\)|toLocaleString\\(\\s*['\"]th-TH['\"].*currency" in src/components/backend/reports/, output_mode=content, -n=true
```
Should be ZERO. Use `fmtMoney`.

```
Grep: "fmtMoney" in src/components/backend/reports/, output_mode=content, -n=true
```
Should be MANY. Confirm.

## AR13 — Date locale = ce (admin reports)

```
Grep: "locale.*['\"]be['\"]|locale: 'be'" in src/components/backend/reports/, output_mode=content, -n=true
```
Should be ZERO in reports/ (admin context = ค.ศ.). พ.ศ. is patient-facing only.

```
Grep: "DateField|fmtDate" in src/components/backend/reports/, output_mode=content, -n=true
```
Should be MANY. No raw `new Date(x).toLocaleDateString()`.

## AR14 — Defensive field access

```
Grep: "\\.payment\\.|\\.billing\\.|\\.items\\.|\\.sellers\\[" in src/lib/*Aggregator.js, output_mode=content, -n=true
```
Each access should use `?.` chain or have a `??` fallback.

```
Grep: "\\.payment\\.channels|\\?\\.payment\\?\\.channels" in src/lib/*Aggregator.js, output_mode=content, -n=true
```
Either pattern OK; confirm fallback to `[]` if missing.

## AR15 — Idempotency / no time leak

```
Grep: "Date\\.now|new Date\\(|bangkokNow|thaiTodayISO" in src/lib/*Aggregator.js, output_mode=content, -n=true
```
Should return ZERO inside aggregator bodies. Time gets passed in via `from` / `to` / `asOfDate` parameters.
