# Phase 16.7-quinquies — Payroll + Hourly Fee + Commission Design

> **Status**: APPROVED 2026-04-29 session 33
> **Type**: Design spec (brainstorming output → writing-plans next)
> **Predecessor**: Phase 16.7 (NEW Expense Report tab) + 16.7-bis/ter/quater shipped earlier this session.

## Context

User requested 5 connected enhancements to the Phase 16.7 Expense Report tab during session 33 testing:

1. Add salary + payday fields to StaffFormModal + DoctorFormModal; link to clinic expenses for that person.
2. Auto-payroll: when payday passes, the person's salary expense appears in the report immediately.
3. Verify ProClinic sync preserves salary + payday fields; if not, extend sync mapper + migration; admin clicks "นำเข้า" to merge into our DB.
4. Hourly fee (ค่านั่ง column): hourly rate × hours-from-schedule, accumulating per elapsed hour.
5. Commission %: sale.sellers[].percent × sale.netTotal flows into "รายจ่ายอื่นๆ" column with tooltip showing it's commission.

**Project context already verified** (preview_eval against live April 2026 production data):

- ProClinic admin/user form HAS `salary` + `salary_date` fields (intel at `docs/proclinic-scan/admin-user-forms.json`).
- Our `be_doctors.hourlyIncome` (numeric) ALREADY EXISTS (sample value 300 ฿/hour) and is wired into doctorValidation.js.
- Missing in our schema: `salary`, `salaryDate` on both be_doctors + be_staff. `hourlyIncome` missing from be_staff.
- Master sync infrastructure already covers `staff` + `doctors` types via `syncStaff` / `syncDoctors` + `migrateMasterStaffToBe` / `migrateMasterDoctorsToBe`. Mapper extension only.

**User design decisions** (locked via AskUserQuestion this turn):

| # | Question | Choice |
|---|---|---|
| Q1 | Auto-payroll trigger | **Computed-on-read AUTO** (no approval step; no be_expenses doc writes) |
| Q2 | Hourly source | **be_staff_schedules** (Phase 13.2.x already in production) |
| Q3 | Commission % source | **sale.sellers[].percent × sale.billing.netTotal** |

Iron-clad rules in scope: **C1** (Rule of 3 — shared payroll helpers across ExpenseReportTab + DfPayoutReportTab) · **D** (continuous improvement — adversarial test bank for each helper) · **E** (Firestore-only — no /api/proclinic/* in feature code; sync is the ONE sanctioned exception via MasterDataTab) · **F + F-bis** (Triangle Rule — ProClinic intel verified; behavior captured before design) · **H** (be_* canonical) · **H-quater** (no master_data reads in feature code) · **I** (full-flow simulate at sub-phase end) · **J** (brainstorming HARD-GATE — already passed) · **K** (work-first test-last for multi-stream cycle).

Outcome: Expense Report + DF Payout tabs show the FULL labor-cost picture (salary + hourly + commission) automatically based on master-data + schedule + sale activity, with zero admin-approval friction and zero phantom expense docs.

---

## Architecture

### 5 sub-streams, 1 commit, 1 deploy

All wiring is **read-time** (composeExpenseReportSnapshot + the DfPayoutReportTab useMemo). No new Firestore writes for the auto-computed entries — the 3 new helpers return Maps<personId, amount> that get added to the existing doctor/staff row totals during snapshot composition. This means:

- No race conditions (no concurrent doc writes)
- No Cloud Functions infrastructure (no scheduled cron)
- No phantom expenses to clean up if salary/payday change
- Always reflects CURRENT person.salary (documented v1 limit — historical snapshot is v2 work)

### Data layer — pure helpers (`src/lib/payrollHelpers.js`)

```ts
// 3 new pure helpers; no Firestore imports.

export function computeAutoPayrollForPersons(
  persons: Array<{id, salary, salaryDate}>,
  filter: {from, to},
  today: string  // YYYY-MM-DD
): Map<personId, {totalSalary: number, payDates: string[]}>;
// For each person × each month in [from, to]:
//   payDayThisMonth = min(salaryDate, lastDayOfMonth)
//   payDate = YYYY-MM-{payDayThisMonth}
//   if payDate ∈ [from, to] AND payDate <= today → accumulate person.salary
// Returns Map keyed by id with sum + list of pay dates that fired.

export function computeHourlyFromSchedules(
  schedules: Array<{id, staffId, date, startTime, endTime, type, status}>,
  persons: Array<{id, hourlyIncome}>,
  filter: {from, to},
  now: Date
): Map<personId, {totalAmount: number, totalHours: number}>;
// For each schedule entry:
//   skip if entry.type === 'leave' / 'off' / 'holiday' (non-working)
//   skip if entry.status === 'cancelled'
//   skip if entry.endTime > now (not yet elapsed — only count finished hours)
//   skip if entry.date NOT in [from, to]
//   hours = (endTime - startTime) in hours (handles cross-midnight by clamping to same day)
//   accumulate person.hourlyIncome × hours

export function computeCommissionFromSales(
  sales: Array<{id, saleDate, status, billing, sellers, branchId}>,
  filter: {from, to, branchIds?}
): Map<sellerId, {totalCommission: number, perSale: Array<{saleId, amount}>}>;
// For each sale in [from, to] + branch filter (skip cancelled/refunded):
//   netTotal = sale.billing.netTotal (use getSaleNetTotal helper for fallback chain)
//   For each seller in sale.sellers[]:
//     pct = Number(seller.percent || seller.share*100) || 0
//     if pct > 0 → commission = netTotal × (pct / 100)
//     accumulate per (seller.sellerId || seller.id)
// Returns Map with total + per-sale breakdown for tooltip.
```

### Wiring into existing aggregators

**`src/lib/expenseReportAggregator.js`** — extend `composeExpenseReportSnapshot`:

1. Load `be_staff_schedules` via new fetcher entry (parallels existing `treatments` fetcher).
2. After `buildExpenseDoctorRows` + `buildExpenseStaffRows` build the rows from existing be_expenses + DF, call the 3 new helpers + enrich rows IN-PLACE:
   - `salary` column: `+= autoPayrollMap[id]?.totalSalary`
   - `sitFee` column (doctors only): `+= hourlyMap[id]?.totalAmount`
   - `other` column for staff (no sitFee column): `+= hourlyMap[id]?.totalAmount`
   - `other` column (both): `+= commissionMap[id]?.totalCommission`
   - `total` column: recompute as `sitFee + df + salary + other`
3. Track auto-totals in summary fields:
   - `summary.totalAutoPayroll`, `summary.totalAutoHourly`, `summary.totalAutoCommission`
4. `totalAll` formula: extend to `totalCategory + totalUnlinkedDf + totalAutoPayroll + totalAutoHourly + totalAutoCommission` (note: hourly + commission are SUBSETS of doctor/staff row totals, so we need to be careful — see Edge cases below)

**`src/components/backend/reports/DfPayoutReportTab.jsx`** — same enrichment pattern. The 4-column doctor table (Phase 16.7-bis) and assistant table now reflect auto-computed values too.

### UI — schema fields + form inputs

**`src/lib/staffValidation.js`** changes:

```js
// Add to STAFF_FIELDS validators:
salary: { type: 'number', min: 0, optional: true },         // ฿/month, default 0
salaryDate: { type: 'integer', min: 1, max: 31, optional: true },  // day-of-month
hourlyIncome: { type: 'number', min: 0, optional: true },   // mirror doctor field

// Add to emptyStaffForm:
salary: '',
salaryDate: '',
hourlyIncome: '',

// Add to normalizeStaff (Firestore write shape):
salary: coerceNum(form.salary),
salaryDate: coerceInt(form.salaryDate),
hourlyIncome: coerceNum(form.hourlyIncome),
```

**`src/lib/doctorValidation.js`** changes: same 2 fields (salary, salaryDate). hourlyIncome already exists.

**`src/components/backend/StaffFormModal.jsx`** + **`DoctorFormModal.jsx`** changes: 3 (or 2 for doctor) new input fields. Layout: place them in a "การเงิน" section after position/branch fields. Use existing `<NumberField>` / native input patterns. data-field attributes for scrollToError compliance.

### ProClinic sync

**`api/proclinic/master.js`** — extend the `syncStaff` + `syncDoctors` action mappers (the part that maps ProClinic API response → `master_data/staff/*` doc shape) to include `salary` + `salary_date`. Direct field copies. Schema in master_data:

```json
{
  ...existing fields,
  "salary": "30000.00",      // ProClinic sends as string
  "salary_date": 25          // 1-31
}
```

**`src/lib/backendClient.js`** — extend `migrateMasterStaffToBe` + `migrateMasterDoctorsToBe` to copy `salary` (Number cast) + `salary_date` → `salaryDate` (Number cast) into be_* docs.

**MasterDataTab.jsx** — no UI change needed. The existing "ดูดข้อมูล Staff" + "นำเข้า Staff → be_staff" buttons pick up the new fields automatically once the mappers are extended.

### Iron-clad compliance

| Rule | How preserved |
|---|---|
| **E** Firestore-only | All feature code (helpers + aggregator + tabs) reads be_* via existing client; ProClinic sync stays in `api/proclinic/master.js` (the sanctioned exception per H-bis). |
| **H** + **H-quater** | No master_data reads in feature code. Migration helpers (DEV-only path) read master_data once during sync; runtime always reads be_*. |
| **F + F-bis** | ProClinic intel already captured at `docs/proclinic-scan/admin-user-forms.json` (verified salary + salary_date fields exist in `/admin/user/edit/{id}`). |
| **C1** Rule of 3 | The 3 helpers are shared between ExpenseReportTab + DfPayoutReportTab (2 surfaces) + future Phase 16 tabs (3rd surface — ready). |
| **I** | Flow-simulate test chains: schedule → hourly map → row enrich; sale → commission map → row enrich; person.salaryDate + today → payroll map → row enrich. |
| **D** | Adversarial bank: salaryDate=31 in Feb (clamp), startTime>endTime, percent='0' (ignored), staff with no hourlyIncome (skip), schedule.type='leave' (skip). |

---

## Components

### `src/lib/payrollHelpers.js` (NEW)

3 pure helpers + utility:

- `computeAutoPayrollForPersons(persons, filter, today)` — described above
- `computeHourlyFromSchedules(schedules, persons, filter, now)` — described above
- `computeCommissionFromSales(sales, filter)` — described above
- `clampPayDayToMonth(yearMonth, salaryDate)` — utility: given `'2026-04'` and `salaryDate=31` returns `30` (clamped to last day of April)
- `mergeAutoIntoRows(personRows, autoPayrollMap, hourlyMap, commissionMap, options)` — wraps the 3 enrichment steps with options.isStaffSection (controls whether hourly goes to sitFee or other)

### Form schema additions

| File | Field | Type | Validation |
|---|---|---|---|
| staffValidation.js | salary | number | ≥ 0; optional (defaults to 0) |
| staffValidation.js | salaryDate | integer | 1..31; optional |
| staffValidation.js | hourlyIncome | number | ≥ 0; optional |
| doctorValidation.js | salary | number | ≥ 0; optional |
| doctorValidation.js | salaryDate | integer | 1..31; optional |

### UI form changes

- StaffFormModal: add "การเงิน" section after "ตำแหน่ง" / "สาขา" with 3 fields
- DoctorFormModal: add 2 fields (salary + salaryDate); hourlyIncome already there

### Aggregator extensions

- expenseReportAggregator.js: load be_staff_schedules; call 3 helpers; merge into rows + summary
- DfPayoutReportTab.jsx: same merge pattern in useMemo

### Sync mapper extensions

- api/proclinic/master.js: syncStaff + syncDoctors mappers preserve salary + salary_date
- backendClient.js: migrateMasterStaffToBe + migrateMasterDoctorsToBe copy fields to be_*

---

## Data Flow

```
PERSON RECORD (be_doctors / be_staff):
  salary, salaryDate, hourlyIncome

EVERY EXPENSE REPORT RENDER:
  1. Load expenses, treatments, sales, doctors, staff, courses, branches, schedules (NEW)
  2. Build doctorRows + staffRows (existing — be_expenses + dfPayoutAggregator)
  3. computeAutoPayrollForPersons([...doctors, ...staff], filter, today)
     → Map<personId, {totalSalary}>
  4. computeHourlyFromSchedules(schedules, [...doctors, ...staff], filter, now)
     → Map<personId, {totalAmount, totalHours}>
  5. computeCommissionFromSales(sales, filter)
     → Map<sellerId, {totalCommission, perSale[]}>
  6. Enrich rows IN-PLACE:
     doctorRows.forEach(r → {
       r.sitFee += hourlyMap[r.id]?.totalAmount || 0
       r.salary += autoPayrollMap[r.id]?.totalSalary || 0
       r.other  += commissionMap[r.id]?.totalCommission || 0
       r.total   = r.sitFee + r.df + r.salary + r.other
     })
     staffRows.forEach(r → similar but no sitFee column — hourly→other)
  7. Recompute summary totals + add summary.totalAutoPayroll / .totalAutoHourly / .totalAutoCommission for badges
  8. Return snapshot

UI:
  - ExpenseReportTab + DfPayoutReportTab render the enriched rows
  - Tooltip on "รายจ่ายอื่นๆ" cell shows breakdown ("คอม INV-XYZ ฿N + …")
  - "auto" badge or icon next to auto-computed values (TBD in implementation pass)
```

---

## Edge Cases

| Edge case | Handling |
|---|---|
| `salaryDate=31` in February | Clamp to 28 (or 29 in leap year) via `clampPayDayToMonth` |
| Person has no `salary` set (0 or null) | Skip — no auto-payroll |
| Person has `salary` but no `salaryDate` | Skip with warning (incomplete config); document as TODO for admin |
| Schedule entry crosses midnight (rare) | Clamp to same-day end (assume 24h max per entry) |
| Schedule with `endTime > now` | Skip — only count elapsed hours |
| Schedule with `type: 'leave' / 'off' / 'holiday'` | Skip (non-working entry) |
| Sale with `sellers: []` AND `doctorId` set | Commission via fallback path: 100% to that doctor (matches dfPayoutAggregator semantic) |
| Sale with `sellers[].percent='0'` | Commission = 0 (different from DF — DF uses equal-split fallback per Phase 16.7-quater; commission is opt-in, 0% is deliberate) |
| Salary changed mid-month | Always uses CURRENT staff.salary at read time. Documented v1 limit. v2 candidate: snapshot to be_expenses doc once payday fires. |
| Multiple schedule entries same day same staff | All accumulate (e.g. morning + evening shift). |
| Branch filter active but staff.branchIds doesn't match | Salary still shows (salary is org-level). Hourly + commission ARE branch-scoped (via schedule.branchId / sale.branchId). Documented in tooltip. |
| Person record deleted but salary/hourly/commission would have applied historically | Skip — no auto-rows for missing persons. (Synthetic row only when DF data references the missing person, mirroring Phase 16.7-ter merge pattern.) |

---

## Test Coverage (Rule I)

4 NEW test files in `tests/`:

1. **`phase16.7-quinquies-payroll.test.js`** — `computeAutoPayrollForPersons`:
   - Single person × single month × payday in range → ฿salary entry
   - Multi-month range → multiple entries
   - salaryDate=31 in Feb → clamps to 28/29
   - salary=0 → skipped
   - salaryDate missing → skipped
   - today < payDate → skipped (future payday)
   - payDate < from → skipped (before range)

2. **`phase16.7-quinquies-hourly.test.js`** — `computeHourlyFromSchedules`:
   - Single person × single shift → hourlyIncome × hours
   - Multiple shifts same day → sum
   - Cross-midnight → clamp to 24h cap
   - leave/off/holiday → skip
   - endTime > now → skip
   - hourlyIncome=0 or missing → skip
   - branch filter (schedule.branchId)

3. **`phase16.7-quinquies-commission.test.js`** — `computeCommissionFromSales`:
   - Single sale × single seller × percent=10 → ฿netTotal × 0.1
   - Multi-seller split → per-seller commission
   - percent=0 → commission=0 (no equal-split)
   - cancelled / refunded sale → skip
   - branch filter (sale.branchId)
   - getSaleNetTotal fallback chain works

4. **`phase16.7-quinquies-flow-simulate.test.js`** — Rule I full-flow:
   - Master data (1 doctor, 1 staff, 1 branch) + 1 schedule (morning shift) + 1 sale (with sellers) + 1 expense
   - Run composeExpenseReportSnapshot
   - Assert: doctor row has DF (existing) + sitFee (hourly auto) + salary (auto) + other (commission auto) + total reconciles
   - Assert: staff row has commission (auto) + salary (auto) — no sitFee column for staff
   - Edge: salaryDate=31 + Feb-only filter → 28th payday entry (or none if filter doesn't cover)
   - Source-grep regression guards: helpers imported by both aggregator + DfTab + form fields exist

Plus extending existing tests (mock additions for `listStaffSchedules` + `salary`/`salaryDate`).

Test target: 4121 → 4170 (+49 cases) + ~10 mock fixes in pre-existing tests.

---

## Verification Plan (preview_eval against running dev server)

After implementation:

1. Add `salary=30000` + `salaryDate=25` to one doctor (e.g. doctor 308) via DoctorFormModal.
2. Open Expense Report tab; observe:
   - If today >= 2026-04-25 → doctor 308 shows salary=30,000 in expense report April row
   - totalAll increases by 30,000
3. Add a be_staff_schedules entry for doctor 308: 2026-04-29 09:00-12:00 (3 hours) + entry.endTime in past
   - sitFee column for doctor 308 += hourlyIncome × 3 = 300 × 3 = 900
4. Add a sale: INV-test with sellers=[{id:'308', percent:5}], netTotal=10000, status='paid'
   - commission for seller 308 += 10000 × 5/100 = 500 → goes into "other" column
5. Total row reconciles: 0 (sitFee from hourly = 900) + 14580 (DF unchanged) + 30000 (auto-salary) + 500 (commission) = 45,980
6. ProClinic sync test: trigger MasterDataTab "ดูด Staff" + "นำเข้า Staff" → check be_staff doc has salary + salaryDate fields populated.

---

## Out of Scope (deliberate)

- **Historical salary snapshot** — always recomputes from current value. v2 work if user reports "salary changed last month, my report shows new value". Mitigation: spec doc'd as v1 known limit.
- **Real-time check-in/check-out tracking** — uses scheduled hours only.
- **Commission tier ladders** (e.g. 5% up to 50k, 10% above) — flat percent only.
- **Partial-month hire payday** — assumes full month if hired before payday.
- **Leave / vacation salary deduction** — leave entries are skipped for hourly accumulation but full salary is still paid (simple model).
- **Withholding tax / social security** — gross salary only. v2 candidate.
- **Email notification on payday** — not in v1.
- **Cron / Cloud Function** — not used (computed-on-read approach).

---

## Phase Numbering

This is **Phase 16.7-quinquies** following the session 33 cluster:
- 16.7 (NEW Expense Report)
- 16.7-bis (DfPayout 4-col + QuotationFormModal seller fix)
- 16.7-ter (unlinked-DF + branch sidebar empty state)
- 16.7-quater (dfPayoutAggregator schema robustness)
- 16.7-quinquies (THIS — payroll + hourly + commission)

After 16.7-quinquies, the Expense Report family is feature-complete for v1. Next phase candidates: 16.5 RemainingCourse 2nd-pass / 16.1 SmartAudience / 16.4 Order parity / V15 #10 deploy.
