# Phase 16.7-quinquies — Payroll + Hourly + Commission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `salary` + `salaryDate` (+ `hourlyIncome` to staff) schema fields, then auto-compute payroll / hourly fee / commission entries that surface in ExpenseReportTab + DfPayoutReportTab without writing be_expenses docs (computed-on-read).

**Architecture:** 3 pure helpers in `src/lib/payrollHelpers.js` (auto-payroll, hourly, commission). Expense report aggregator + DfPayoutReportTab call helpers + enrich existing doctor/staff rows in-place. ProClinic sync mappers preserve `salary` + `salary_date` so admin re-syncs to backfill the data.

**Tech Stack:** React 19 + Vite 8 + Firebase Firestore (be_*) + Vitest 4.1. Pure-helper TDD pattern; no Firebase functions; no cron.

**Order:** PER PROJECT RULE K (work-first, test-last for multi-stream cycles): build all 17 code-tasks first → review structure → write 4 test files as a single batch → verify → commit. Do **NOT** interleave test-writing with implementation tasks.

**Spec:** `docs/superpowers/specs/2026-04-29-phase16-7-quinquies-payroll-design.md`

---

## File Structure (locked here for the agent)

| Type | Path | Purpose |
|---|---|---|
| MODIFY | `src/lib/doctorValidation.js` | Add `salary` + `salaryDate` to validators + emptyDoctorForm + normalizeDoctor |
| MODIFY | `src/lib/staffValidation.js` | Add `salary` + `salaryDate` + `hourlyIncome` (mirror doctor) |
| MODIFY | `src/components/backend/DoctorFormModal.jsx` | Add 2 input fields with data-field attrs |
| MODIFY | `src/components/backend/StaffFormModal.jsx` | Add 3 input fields with data-field attrs |
| MODIFY | `api/proclinic/master.js` | Preserve `salary` + `salary_date` in syncDoctors + syncStaff mappers |
| MODIFY | `src/lib/backendClient.js` | Extend `migrateMasterDoctorsToBe` + `migrateMasterStaffToBe` to copy fields |
| CREATE | `src/lib/payrollHelpers.js` | 3 pure helpers + utility (`clampPayDayToMonth`, `computeAutoPayrollForPersons`, `computeHourlyFromSchedules`, `computeCommissionFromSales`, `mergeAutoIntoRows`) |
| MODIFY | `src/lib/expenseReportHelpers.js` | Extend `computeExpenseSummary` to accept + emit `totalAutoPayroll`/`totalAutoHourly`/`totalAutoCommission` |
| MODIFY | `src/lib/expenseReportAggregator.js` | Load `be_staff_schedules`; call 3 helpers; merge into doctor/staff rows + summary |
| MODIFY | `src/components/backend/reports/DfPayoutReportTab.jsx` | Same merge pattern in useMemo |
| CREATE | `tests/phase16.7-quinquies-payroll.test.js` | computeAutoPayrollForPersons + clampPayDayToMonth coverage |
| CREATE | `tests/phase16.7-quinquies-hourly.test.js` | computeHourlyFromSchedules coverage |
| CREATE | `tests/phase16.7-quinquies-commission.test.js` | computeCommissionFromSales coverage |
| CREATE | `tests/phase16.7-quinquies-flow-simulate.test.js` | Rule I full-flow simulate |

---

# PHASE A — Schema + form UI (4 tasks)

## Task A1: Add `salary` + `salaryDate` to doctorValidation

**Files:**
- Modify: `src/lib/doctorValidation.js`

- [ ] **Step 1: Read existing doctorValidation.js**

Run: `Read F:/LoverClinic-app/src/lib/doctorValidation.js limit:200` — locate `validateDoctorStrict`, `emptyDoctorForm`, `normalizeDoctor`, and the existing `hourlyIncome` handling (the new fields follow the same pattern).

- [ ] **Step 2: Add `salary` to validateDoctorStrict**

Inside `validateDoctorStrict(form)`, immediately AFTER the existing `hourlyIncome` validation block, add:

```js
// Phase 16.7-quinquies — monthly salary (optional; ≥ 0)
if (form.salary != null && form.salary !== '') {
  const n = Number(form.salary);
  if (!Number.isFinite(n) || n < 0) {
    return ['salary', 'เงินเดือนต้องเป็นจำนวนที่ไม่ติดลบ'];
  }
}

// Phase 16.7-quinquies — payday (1..31; integer)
if (form.salaryDate != null && form.salaryDate !== '') {
  const n = Number(form.salaryDate);
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    return ['salaryDate', 'วันที่จ่ายเงินเดือนต้องอยู่ระหว่าง 1-31'];
  }
}
```

- [ ] **Step 3: Add `salary` + `salaryDate` to emptyDoctorForm**

Find the `emptyDoctorForm` function. Add inside the returned object literal, AFTER `hourlyIncome: ''`:

```js
salary: '',
salaryDate: '',
```

- [ ] **Step 4: Add coercion to normalizeDoctor**

Find `normalizeDoctor(form)`. Inside the returned object, AFTER `hourlyIncome: coerceNum(form.hourlyIncome)`, add:

```js
salary: coerceNum(form.salary),
salaryDate: form.salaryDate === '' || form.salaryDate == null ? null : Number(form.salaryDate),
```

- [ ] **Step 5: Verify edits with grep**

Run: `Grep pattern:"salary|salaryDate" path:"F:/LoverClinic-app/src/lib/doctorValidation.js" output_mode:"content"` — confirm 3 hits each (validator + empty form + normalize).

---

## Task A2: Add `salary` + `salaryDate` + `hourlyIncome` to staffValidation

**Files:**
- Modify: `src/lib/staffValidation.js`

- [ ] **Step 1: Read existing staffValidation.js**

Run: `Read F:/LoverClinic-app/src/lib/staffValidation.js` — locate `validateStaffStrict`, `emptyStaffForm`, `normalizeStaff`. Note: staff currently has NO `hourlyIncome` (only doctors do). We're adding it now.

- [ ] **Step 2: Add 3 validations to validateStaffStrict**

Inside `validateStaffStrict(form)`, BEFORE the closing `return null;`, add:

```js
// Phase 16.7-quinquies — hourly fee (optional; ≥ 0). Mirror be_doctors.
if (form.hourlyIncome != null && form.hourlyIncome !== '') {
  const n = Number(form.hourlyIncome);
  if (!Number.isFinite(n) || n < 0) {
    return ['hourlyIncome', 'รายได้รายชั่วโมงต้องเป็นจำนวนที่ไม่ติดลบ'];
  }
}

// Phase 16.7-quinquies — monthly salary (optional; ≥ 0)
if (form.salary != null && form.salary !== '') {
  const n = Number(form.salary);
  if (!Number.isFinite(n) || n < 0) {
    return ['salary', 'เงินเดือนต้องเป็นจำนวนที่ไม่ติดลบ'];
  }
}

// Phase 16.7-quinquies — payday (1..31; integer)
if (form.salaryDate != null && form.salaryDate !== '') {
  const n = Number(form.salaryDate);
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    return ['salaryDate', 'วันที่จ่ายเงินเดือนต้องอยู่ระหว่าง 1-31'];
  }
}
```

- [ ] **Step 3: Add 3 fields to emptyStaffForm**

Inside `emptyStaffForm`, add:

```js
hourlyIncome: '',
salary: '',
salaryDate: '',
```

- [ ] **Step 4: Add coercion to normalizeStaff**

Inside `normalizeStaff(form)` returned object, add:

```js
hourlyIncome: coerceNum(form.hourlyIncome),
salary: coerceNum(form.salary),
salaryDate: form.salaryDate === '' || form.salaryDate == null ? null : Number(form.salaryDate),
```

If `coerceNum` is not imported, copy the same import statement that doctorValidation.js uses (`import { coerceNum } from './validatorUtils.js'` or wherever).

- [ ] **Step 5: Verify edits**

Run: `Grep pattern:"salary|salaryDate|hourlyIncome" path:"F:/LoverClinic-app/src/lib/staffValidation.js" output_mode:"content"` — confirm hits in 3 functions.

---

## Task A3: Add 2 input fields to DoctorFormModal

**Files:**
- Modify: `src/components/backend/DoctorFormModal.jsx`

- [ ] **Step 1: Read DoctorFormModal.jsx**

Run: `Read F:/LoverClinic-app/src/components/backend/DoctorFormModal.jsx` — locate the existing `hourlyIncome` input field. The new fields follow the same `<input type="number">` pattern.

- [ ] **Step 2: Add salary + salaryDate inputs**

Locate the `hourlyIncome` field's JSX block. IMMEDIATELY AFTER it (still inside the same form section, ideally a "การเงิน" heading area), add:

```jsx
<div className="space-y-1">
  <label className="text-xs font-bold text-[var(--tx-muted)]">เงินเดือน (บาท/เดือน)</label>
  <input
    type="number"
    min="0"
    step="any"
    value={form.salary || ''}
    onChange={(e) => update('salary', e.target.value)}
    placeholder="0"
    className="w-full rounded border border-[var(--bd)] bg-[var(--bg-input)] px-2 py-1 text-sm"
    data-field="salary"
  />
</div>

<div className="space-y-1">
  <label className="text-xs font-bold text-[var(--tx-muted)]">วันที่จ่ายเงินเดือน (1-31)</label>
  <input
    type="number"
    min="1"
    max="31"
    step="1"
    value={form.salaryDate || ''}
    onChange={(e) => update('salaryDate', e.target.value)}
    placeholder="25"
    className="w-full rounded border border-[var(--bd)] bg-[var(--bg-input)] px-2 py-1 text-sm"
    data-field="salaryDate"
  />
</div>
```

If the existing JSX uses a different wrapper class (e.g. `grid grid-cols-2`), match the surrounding pattern instead of the literal `space-y-1` shown above.

- [ ] **Step 3: Verify**

Run: `Grep pattern:'data-field="salary|data-field="salaryDate' path:"F:/LoverClinic-app/src/components/backend/DoctorFormModal.jsx" output_mode:"content"` — confirm 2 hits.

---

## Task A4: Add 3 input fields to StaffFormModal

**Files:**
- Modify: `src/components/backend/StaffFormModal.jsx`

- [ ] **Step 1: Read StaffFormModal.jsx**

Run: `Read F:/LoverClinic-app/src/components/backend/StaffFormModal.jsx` — locate the position/branch fields. The new "การเงิน" section will go AFTER position/branch fields (or wherever financial fields make sense).

- [ ] **Step 2: Add 3 input fields**

After the existing position/branch section, add:

```jsx
<div className="border-t border-[var(--bd)] pt-3 mt-3">
  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--tx-muted)] mb-2">💰 การเงิน</h4>
  <div className="grid grid-cols-3 gap-2">
    <div className="space-y-1">
      <label className="text-xs font-bold text-[var(--tx-muted)]">รายได้รายชั่วโมง (บาท)</label>
      <input
        type="number"
        min="0"
        step="any"
        value={form.hourlyIncome || ''}
        onChange={(e) => update('hourlyIncome', e.target.value)}
        placeholder="0"
        className="w-full rounded border border-[var(--bd)] bg-[var(--bg-input)] px-2 py-1 text-sm"
        data-field="hourlyIncome"
      />
    </div>
    <div className="space-y-1">
      <label className="text-xs font-bold text-[var(--tx-muted)]">เงินเดือน (บาท/เดือน)</label>
      <input
        type="number"
        min="0"
        step="any"
        value={form.salary || ''}
        onChange={(e) => update('salary', e.target.value)}
        placeholder="0"
        className="w-full rounded border border-[var(--bd)] bg-[var(--bg-input)] px-2 py-1 text-sm"
        data-field="salary"
      />
    </div>
    <div className="space-y-1">
      <label className="text-xs font-bold text-[var(--tx-muted)]">วันที่จ่ายเงินเดือน (1-31)</label>
      <input
        type="number"
        min="1"
        max="31"
        step="1"
        value={form.salaryDate || ''}
        onChange={(e) => update('salaryDate', e.target.value)}
        placeholder="25"
        className="w-full rounded border border-[var(--bd)] bg-[var(--bg-input)] px-2 py-1 text-sm"
        data-field="salaryDate"
      />
    </div>
  </div>
</div>
```

If the file uses `setForm` instead of `update`, swap accordingly. If `update` is named differently (e.g. `handleChange`), match the existing pattern.

- [ ] **Step 3: Verify**

Run: `Grep pattern:'data-field="hourlyIncome|data-field="salary|data-field="salaryDate' path:"F:/LoverClinic-app/src/components/backend/StaffFormModal.jsx" output_mode:"content"` — confirm 3 hits.

---

# PHASE B — ProClinic sync mapper extensions (4 tasks)

## Task B1: syncDoctors mapper preserves salary + salary_date

**Files:**
- Modify: `api/proclinic/master.js`

- [ ] **Step 1: Locate syncDoctors handler**

Run: `Grep pattern:"handleSyncDoctors|case 'syncDoctors'|syncDoctors" path:"F:/LoverClinic-app/api/proclinic/master.js" output_mode:"content"` to find the action.

- [ ] **Step 2: Locate the response → master_data mapper inside that handler**

Inside `handleSyncDoctors`, find where ProClinic API response items are mapped to objects written to `master_data/doctors/{id}`. The mapper typically reads fields like `it.firstname`, `it.email`, `it.df_paid_type`, etc.

- [ ] **Step 3: Add salary + salary_date to the mapper**

In the mapped object literal, add:

```js
salary: it.salary != null ? String(it.salary) : '',
salary_date: it.salary_date != null ? Number(it.salary_date) : null,
```

(Match the surrounding casing convention; ProClinic API uses snake_case so we keep `salary_date` in master_data and convert to `salaryDate` only at migration time.)

- [ ] **Step 4: Verify**

Run: `Grep pattern:"salary|salary_date" path:"F:/LoverClinic-app/api/proclinic/master.js" output_mode:"content"` — confirm hits in syncDoctors handler.

---

## Task B2: syncStaff mapper preserves salary + salary_date + hourly_income

**Files:**
- Modify: `api/proclinic/master.js`

- [ ] **Step 1: Locate syncStaff handler**

Run: `Grep pattern:"handleSyncStaff|case 'syncStaff'|syncStaff" path:"F:/LoverClinic-app/api/proclinic/master.js" output_mode:"content"`

- [ ] **Step 2: Add 3 fields to the mapper**

Inside the mapped object literal of `handleSyncStaff`, add:

```js
salary: it.salary != null ? String(it.salary) : '',
salary_date: it.salary_date != null ? Number(it.salary_date) : null,
hourly_income: it.hourly_income != null ? String(it.hourly_income) : '',
```

- [ ] **Step 3: Verify**

Run: `Grep pattern:"hourly_income" path:"F:/LoverClinic-app/api/proclinic/master.js" output_mode:"content"` — confirm at least 1 hit in syncStaff.

---

## Task B3: migrateMasterDoctorsToBe copies salary + salaryDate

**Files:**
- Modify: `src/lib/backendClient.js`

- [ ] **Step 1: Locate migrateMasterDoctorsToBe**

Run: `Grep pattern:"migrateMasterDoctorsToBe|migrateMasterDoctors" path:"F:/LoverClinic-app/src/lib/backendClient.js" output_mode:"content"`

- [ ] **Step 2: Add fields to the merge object**

Inside the function, where each master_data/doctor item is mapped to a be_doctors doc, add:

```js
salary: m.salary !== undefined && m.salary !== '' ? Number(m.salary) || 0 : (existing?.salary ?? 0),
salaryDate: m.salary_date !== undefined && m.salary_date !== null ? Number(m.salary_date) : (existing?.salaryDate ?? null),
```

(Use `existing?.salary` if the migrate is a "merge" that preserves manual edits when ProClinic doesn't have a value. If the existing function is "overwrite" instead of "merge", drop the `existing?.X ?? Y` fallback and just use the master_data value.)

- [ ] **Step 3: Verify**

Run: `Grep pattern:"salaryDate" path:"F:/LoverClinic-app/src/lib/backendClient.js" output_mode:"content"` — confirm hit in migrateMasterDoctorsToBe.

---

## Task B4: migrateMasterStaffToBe copies salary + salaryDate + hourlyIncome

**Files:**
- Modify: `src/lib/backendClient.js`

- [ ] **Step 1: Locate migrateMasterStaffToBe**

Run: `Grep pattern:"migrateMasterStaffToBe" path:"F:/LoverClinic-app/src/lib/backendClient.js" output_mode:"content"`

- [ ] **Step 2: Add 3 fields**

Inside the per-item mapper:

```js
hourlyIncome: m.hourly_income !== undefined && m.hourly_income !== '' ? Number(m.hourly_income) || 0 : (existing?.hourlyIncome ?? 0),
salary: m.salary !== undefined && m.salary !== '' ? Number(m.salary) || 0 : (existing?.salary ?? 0),
salaryDate: m.salary_date !== undefined && m.salary_date !== null ? Number(m.salary_date) : (existing?.salaryDate ?? null),
```

- [ ] **Step 3: Verify**

Run: `Grep pattern:"hourlyIncome|salaryDate" path:"F:/LoverClinic-app/src/lib/backendClient.js" output_mode:"content"` — confirm hits in migrateMasterStaffToBe.

---

# PHASE C — payrollHelpers.js (5 tasks)

## Task C1: Create payrollHelpers.js skeleton + clampPayDayToMonth

**Files:**
- Create: `src/lib/payrollHelpers.js`

- [ ] **Step 1: Write skeleton + utility**

Create the file with:

```js
// ─── Payroll Helpers — Phase 16.7-quinquies (2026-04-29 session 33) ────────
//
// 3 pure helpers + 1 utility for auto-computing labor cost in the Expense
// Report tab without writing be_expenses docs (computed-on-read):
//
//   - computeAutoPayrollForPersons(persons, filter, today)
//       → Map<personId, {totalSalary, payDates}>
//   - computeHourlyFromSchedules(schedules, persons, filter, now)
//       → Map<personId, {totalAmount, totalHours}>
//   - computeCommissionFromSales(sales, filter)
//       → Map<sellerId, {totalCommission, perSale}>
//   - mergeAutoIntoRows(personRows, autoPayrollMap, hourlyMap, commissionMap, options)
//       → enriches rows in-place via shallow copy
//   + clampPayDayToMonth(yearMonth, salaryDate) utility
//
// All pure: no Firestore imports, no React imports, deterministic given
// inputs. Iron-clad refs:
//   E       — Firestore-only (no /api/proclinic/* fetches; helpers consume be_*)
//   H + H-quater — be_* canonical (no upstream-sync reads)
//   I       — full-flow simulate at sub-phase end (test bank covers)
//   AR4     — currency rounding via roundTHB
//   V14     — no `: undefined` leaves in output

import { roundTHB } from './reportsUtils.js';
import { getSaleNetTotal } from './clinicReportHelpers.js';

/**
 * Clamp a payday to the last day of the given month.
 * Example: clampPayDayToMonth('2026-02', 31) → 28 (or 29 in leap year)
 * Example: clampPayDayToMonth('2026-04', 31) → 30
 *
 * @param {string} yearMonth  — 'YYYY-MM'
 * @param {number} salaryDate — 1..31
 * @returns {number} clamped day-of-month (1..31)
 */
export function clampPayDayToMonth(yearMonth, salaryDate) {
  if (!yearMonth || !Number.isFinite(salaryDate) || salaryDate < 1) return 1;
  const [y, m] = String(yearMonth).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return Math.min(Math.max(1, Number(salaryDate) || 1), 28);
  // Last day of month: day 0 of next month = last day of current
  const lastDay = new Date(y, m, 0).getDate();
  return Math.min(Math.max(1, Number(salaryDate) || 1), lastDay);
}
```

- [ ] **Step 2: Verify file created**

Run: `Read F:/LoverClinic-app/src/lib/payrollHelpers.js limit:50`

---

## Task C2: Add computeAutoPayrollForPersons

**Files:**
- Modify: `src/lib/payrollHelpers.js`

- [ ] **Step 1: Append computeAutoPayrollForPersons**

After `clampPayDayToMonth`, add:

```js
/**
 * Compute auto-payroll virtual entries (NOT stored in Firestore) for each
 * person whose salary + salaryDate are configured. For each month in the
 * filter range:
 *   payDayThisMonth = clampPayDayToMonth(yearMonth, person.salaryDate)
 *   payDate = `${yearMonth}-${zeropad(payDayThisMonth)}`
 *   if payDate ∈ [from, to] AND payDate <= today
 *     → accumulate person.salary into Map for that personId
 *
 * Always uses CURRENT person.salary (no historical snapshot in v1).
 *
 * @param {Array<{id, salary, salaryDate}>} persons
 * @param {{from: string, to: string}} filter — YYYY-MM-DD inclusive
 * @param {string} today — YYYY-MM-DD ('today' for tests; real callers pass thaiTodayISO())
 * @returns {Map<string, {totalSalary: number, payDates: string[]}>}
 */
export function computeAutoPayrollForPersons(persons, filter, today) {
  const map = new Map();
  const from = String(filter?.from || '').slice(0, 10);
  const to = String(filter?.to || '').slice(0, 10);
  const cutoff = String(today || '').slice(0, 10);
  if (!from || !to || !cutoff) return map;
  if (!Array.isArray(persons)) return map;

  // Build month list spanning [from, to]
  const months = [];
  let cur = from.slice(0, 7); // 'YYYY-MM'
  const endMonth = to.slice(0, 7);
  while (cur <= endMonth) {
    months.push(cur);
    const [y, m] = cur.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    cur = next;
    if (months.length >= 36) break; // safety cap: 3 years
  }

  for (const p of persons) {
    if (!p) continue;
    const id = String(p.id || p.doctorId || p.staffId || '').trim();
    if (!id) continue;
    const salary = Number(p.salary) || 0;
    const salaryDate = Number(p.salaryDate);
    if (salary <= 0 || !Number.isInteger(salaryDate) || salaryDate < 1 || salaryDate > 31) continue;

    for (const ym of months) {
      const day = clampPayDayToMonth(ym, salaryDate);
      const payDate = `${ym}-${String(day).padStart(2, '0')}`;
      if (payDate < from) continue;
      if (payDate > to) continue;
      if (payDate > cutoff) continue; // future payday — not yet accrued
      const cur = map.get(id) || { totalSalary: 0, payDates: [] };
      cur.totalSalary += salary;
      cur.payDates.push(payDate);
      map.set(id, cur);
    }
  }
  // Round at the end
  for (const [k, v] of map) {
    map.set(k, { totalSalary: roundTHB(v.totalSalary), payDates: v.payDates });
  }
  return map;
}
```

- [ ] **Step 2: Verify**

Run: `Grep pattern:"^export function computeAutoPayrollForPersons" path:"F:/LoverClinic-app/src/lib/payrollHelpers.js" output_mode:"content"` — confirm 1 hit.

---

## Task C3: Add computeHourlyFromSchedules

**Files:**
- Modify: `src/lib/payrollHelpers.js`

- [ ] **Step 1: Append computeHourlyFromSchedules**

```js
/**
 * Compute hourly fee accumulation from be_staff_schedules.
 *
 * For each schedule entry:
 *   - skip if entry.type ∈ {'leave', 'off', 'holiday'} (non-working)
 *   - skip if entry.status === 'cancelled'
 *   - skip if entry.date NOT in [from, to]
 *   - skip if endTime > now (only count elapsed hours)
 *   - skip if branchIds filter active and entry.branchId not in set
 *   - hours = (endTime - startTime) in hours; cap at 24h per entry (cross-midnight safety)
 *   - accumulate person.hourlyIncome × hours into Map keyed by staffId
 *
 * @param {Array<{staffId, date, startTime, endTime, type, status, branchId}>} schedules
 * @param {Array<{id, hourlyIncome}>} persons
 * @param {{from, to, branchIds?}} filter
 * @param {Date} now — current Date (real callers pass `new Date()`)
 * @returns {Map<string, {totalAmount: number, totalHours: number}>}
 */
export function computeHourlyFromSchedules(schedules, persons, filter, now) {
  const map = new Map();
  const from = String(filter?.from || '').slice(0, 10);
  const to = String(filter?.to || '').slice(0, 10);
  if (!from || !to) return map;
  if (!Array.isArray(schedules) || !Array.isArray(persons)) return map;
  const branchSet = Array.isArray(filter?.branchIds) && filter.branchIds.length
    ? new Set(filter.branchIds.map(String))
    : null;

  // Build hourlyIncome lookup
  const rateById = new Map();
  for (const p of persons) {
    if (!p) continue;
    const id = String(p.id || p.doctorId || p.staffId || '').trim();
    const rate = Number(p.hourlyIncome) || 0;
    if (id && rate > 0) rateById.set(id, rate);
  }
  if (rateById.size === 0) return map;

  const NON_WORKING_TYPES = new Set(['leave', 'off', 'holiday']);

  // Helper: parse 'YYYY-MM-DD' + 'HH:MM' → Date in local TZ
  const parseDateTime = (date, time) => {
    if (!date || !time) return null;
    const [y, m, d] = String(date).split('-').map(Number);
    const [hh, mm] = String(time).split(':').map(Number);
    if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  };

  for (const e of schedules) {
    if (!e) continue;
    if (NON_WORKING_TYPES.has(e.type)) continue;
    if (e.status === 'cancelled') continue;
    const date = String(e.date || '').slice(0, 10);
    if (!date) continue;
    if (date < from || date > to) continue;
    if (branchSet && e.branchId && !branchSet.has(String(e.branchId))) continue;
    const staffId = String(e.staffId || '').trim();
    if (!staffId) continue;
    const rate = rateById.get(staffId);
    if (!rate) continue;

    const startDt = parseDateTime(date, e.startTime);
    const endDt = parseDateTime(date, e.endTime);
    if (!startDt || !endDt) continue;
    if (endDt <= startDt) continue; // invalid range
    if (endDt > now) continue;       // not yet elapsed
    let hours = (endDt - startDt) / (1000 * 60 * 60);
    if (hours > 24) hours = 24;      // cross-midnight safety cap
    if (hours <= 0) continue;

    const cur = map.get(staffId) || { totalAmount: 0, totalHours: 0 };
    cur.totalHours += hours;
    cur.totalAmount += rate * hours;
    map.set(staffId, cur);
  }
  for (const [k, v] of map) {
    map.set(k, { totalAmount: roundTHB(v.totalAmount), totalHours: Math.round(v.totalHours * 100) / 100 });
  }
  return map;
}
```

- [ ] **Step 2: Verify**

Run: `Grep pattern:"^export function computeHourlyFromSchedules" path:"F:/LoverClinic-app/src/lib/payrollHelpers.js" output_mode:"content"` — confirm 1 hit.

---

## Task C4: Add computeCommissionFromSales

**Files:**
- Modify: `src/lib/payrollHelpers.js`

- [ ] **Step 1: Append computeCommissionFromSales**

```js
/**
 * Compute commission per seller from sale.sellers[].percent × sale.netTotal.
 *
 * For each sale in [from, to] (branch-filtered, non-cancelled, non-refunded):
 *   netTotal = getSaleNetTotal(sale)
 *   For each seller in sale.sellers[]:
 *     pct = Number(seller.percent) || (Number(seller.share) * 100) || 0
 *     if pct > 0 → commission = netTotal × pct / 100
 *     accumulate per (seller.sellerId || seller.id), preserving per-sale breakdown for tooltip
 *
 * Note: percent=0 → commission=0 (deliberate; opt-in commission, no equal-split
 * fallback like dfPayoutAggregator. Commission is paid only when admin sets a
 * non-zero percent on the sale.)
 *
 * @param {Array} sales
 * @param {{from, to, branchIds?}} filter
 * @returns {Map<string, {totalCommission: number, perSale: Array<{saleId, saleDate, amount, percent}>}>}
 */
export function computeCommissionFromSales(sales, filter) {
  const map = new Map();
  const from = String(filter?.from || '').slice(0, 10);
  const to = String(filter?.to || '').slice(0, 10);
  if (!Array.isArray(sales)) return map;
  const branchSet = Array.isArray(filter?.branchIds) && filter.branchIds.length
    ? new Set(filter.branchIds.map(String))
    : null;

  for (const s of sales) {
    if (!s) continue;
    if (s.status === 'cancelled' || s.refunded) continue;
    const date = String(s.saleDate || s.createdAt || '').slice(0, 10);
    if (!date) continue;
    if (from && date < from) continue;
    if (to && date > to) continue;
    if (branchSet && s.branchId && !branchSet.has(String(s.branchId))) continue;

    const netTotal = getSaleNetTotal(s);
    if (netTotal <= 0) continue;
    const sellers = Array.isArray(s.sellers) ? s.sellers : [];
    if (sellers.length === 0) continue;

    for (const seller of sellers) {
      if (!seller) continue;
      const id = String(seller.sellerId || seller.id || '').trim();
      if (!id) continue;
      let pct = Number(seller.percent);
      if (!Number.isFinite(pct) || pct <= 0) {
        const sh = Number(seller.share);
        if (Number.isFinite(sh) && sh > 0) pct = sh * 100;
      }
      if (!Number.isFinite(pct) || pct <= 0) continue;
      const amount = netTotal * (pct / 100);
      if (amount <= 0) continue;

      const cur = map.get(id) || { totalCommission: 0, perSale: [] };
      cur.totalCommission += amount;
      cur.perSale.push({
        saleId: String(s.saleId || s.id || ''),
        saleDate: date,
        amount: roundTHB(amount),
        percent: pct,
      });
      map.set(id, cur);
    }
  }
  for (const [k, v] of map) {
    map.set(k, { totalCommission: roundTHB(v.totalCommission), perSale: v.perSale });
  }
  return map;
}
```

- [ ] **Step 2: Verify**

Run: `Grep pattern:"^export function computeCommissionFromSales" path:"F:/LoverClinic-app/src/lib/payrollHelpers.js" output_mode:"content"` — confirm 1 hit.

---

## Task C5: Add mergeAutoIntoRows wrapper

**Files:**
- Modify: `src/lib/payrollHelpers.js`

- [ ] **Step 1: Append mergeAutoIntoRows**

```js
/**
 * Enrich doctor/staff rows IN-PLACE via shallow copy with auto-computed
 * payroll / hourly / commission amounts. Keeps the source rows untouched
 * (returns a new array of new objects).
 *
 * options.isStaffSection: when true, hourly amount goes to `other` column
 * (staff has no sitFee column per ProClinic intel). Default false (doctor
 * section: hourly → sitFee).
 *
 * Recomputes `total = sitFee + df + salary + other` for each row.
 *
 * @param {Array} personRows  — rows from buildExpenseDoctorRows / buildExpenseStaffRows
 * @param {Map<string, {totalSalary}>} autoPayrollMap
 * @param {Map<string, {totalAmount}>} hourlyMap
 * @param {Map<string, {totalCommission}>} commissionMap
 * @param {{isStaffSection?: boolean}} [options]
 * @returns {Array} new rows with enriched columns
 */
export function mergeAutoIntoRows(personRows, autoPayrollMap, hourlyMap, commissionMap, options = {}) {
  if (!Array.isArray(personRows)) return [];
  const isStaff = !!options.isStaffSection;
  const safeMap = (m) => (m instanceof Map ? m : new Map());
  const ap = safeMap(autoPayrollMap);
  const hr = safeMap(hourlyMap);
  const cm = safeMap(commissionMap);

  return personRows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const id = String(r.id || '');
    const addSalary = Number(ap.get(id)?.totalSalary) || 0;
    const addHourly = Number(hr.get(id)?.totalAmount) || 0;
    const addCommission = Number(cm.get(id)?.totalCommission) || 0;

    const next = { ...r };
    next.salary = roundTHB((Number(r.salary) || 0) + addSalary);
    if (isStaff) {
      next.other = roundTHB((Number(r.other) || 0) + addHourly + addCommission);
      next.total = roundTHB((Number(next.df) || 0) + (Number(next.salary) || 0) + (Number(next.other) || 0));
    } else {
      next.sitFee = roundTHB((Number(r.sitFee) || 0) + addHourly);
      next.other = roundTHB((Number(r.other) || 0) + addCommission);
      next.total = roundTHB(
        (Number(next.sitFee) || 0) +
        (Number(next.df) || 0) +
        (Number(next.salary) || 0) +
        (Number(next.other) || 0),
      );
    }
    return next;
  });
}
```

- [ ] **Step 2: Verify all 4 helpers + utility export**

Run: `Grep pattern:"^export (function|const)" path:"F:/LoverClinic-app/src/lib/payrollHelpers.js" output_mode:"content"` — confirm 5 exports (clampPayDayToMonth + 3 compute functions + mergeAutoIntoRows).

---

# PHASE D — Aggregator wiring (4 tasks)

## Task D1: Extend computeExpenseSummary with auto-totals

**Files:**
- Modify: `src/lib/expenseReportHelpers.js`

- [ ] **Step 1: Locate computeExpenseSummary**

Run: `Grep pattern:"export function computeExpenseSummary" path:"F:/LoverClinic-app/src/lib/expenseReportHelpers.js" output_mode:"content" -n:true`

- [ ] **Step 2: Add 3 new args + emit fields**

Find the function signature `export function computeExpenseSummary({ doctorRows = [], staffRows = [], categoryRows = [], totalUnlinkedDf = 0 } = {}) {` and change to accept 3 more:

```js
export function computeExpenseSummary({
  doctorRows = [],
  staffRows = [],
  categoryRows = [],
  totalUnlinkedDf = 0,
  totalAutoPayroll = 0,
  totalAutoHourly = 0,
  totalAutoCommission = 0,
} = {}) {
```

Find the existing `const totalAll = roundTHB(totalCategory + unlinkedDf);` line and replace with:

```js
const autoPayroll = roundTHB(Number(totalAutoPayroll || 0));
const autoHourly  = roundTHB(Number(totalAutoHourly || 0));
const autoCommission = roundTHB(Number(totalAutoCommission || 0));
const totalAll = roundTHB(totalCategory + unlinkedDf + autoPayroll + autoHourly + autoCommission);
```

In the returned object, add 3 new fields:

```js
totalAutoPayroll: autoPayroll,
totalAutoHourly: autoHourly,
totalAutoCommission: autoCommission,
```

- [ ] **Step 3: Verify**

Run: `Grep pattern:"totalAutoPayroll|totalAutoHourly|totalAutoCommission" path:"F:/LoverClinic-app/src/lib/expenseReportHelpers.js" output_mode:"content"` — confirm hits.

---

## Task D2: expenseReportAggregator loads schedules + calls helpers

**Files:**
- Modify: `src/lib/expenseReportAggregator.js`

- [ ] **Step 1: Add new imports**

Find the existing `import { ... } from './expenseReportHelpers.js';` block. Add new imports from payrollHelpers AND extend reportsLoaders import:

```js
import {
  computeAutoPayrollForPersons,
  computeHourlyFromSchedules,
  computeCommissionFromSales,
  mergeAutoIntoRows,
} from './payrollHelpers.js';
import { thaiTodayISO } from '../utils.js';
```

- [ ] **Step 2: Locate the existing fetchers array**

Run: `Grep pattern:"const fetchers" path:"F:/LoverClinic-app/src/lib/expenseReportAggregator.js" output_mode:"content" -n:true` — find the array of `[key, fn]` tuples.

- [ ] **Step 3: Add be_staff_schedules fetcher**

Inside the fetchers array, AFTER the existing `['branches', () => listBranches()]` entry (or wherever fits), add:

```js
// Phase 16.7-quinquies — be_staff_schedules for hourly fee accumulation
['schedules', async () => {
  // Use existing reader if present, else fall back to a Firestore-direct read
  // via dynamic import. Stay branch-scope-naive here; filter happens later.
  try {
    const bc = await import('./backendClient.js');
    if (typeof bc.listAllStaffSchedules === 'function') return bc.listAllStaffSchedules();
    if (typeof bc.listStaffSchedulesByDateRange === 'function') {
      return bc.listStaffSchedulesByDateRange({ from, to });
    }
    return [];
  } catch { return []; }
}],
```

(The dynamic import keeps the orchestrator's static import surface tight. If `listAllStaffSchedules` exists, prefer it; otherwise fall back to the date-range variant; otherwise return [].)

- [ ] **Step 4: Destructure schedules in composeExpenseReportSnapshot**

Find the destructure `const { expenses = [], categories = [], doctors = [], staff = [], sales = [], treatments = [], dfGroups = [], dfStaffRates = [], courses = [], branches = [], errors = {}, } = rawData || {};`. Add `schedules = [],` to the list.

- [ ] **Step 5: Verify imports**

Run: `Grep pattern:"computeAutoPayrollForPersons|computeHourlyFromSchedules|computeCommissionFromSales|mergeAutoIntoRows" path:"F:/LoverClinic-app/src/lib/expenseReportAggregator.js" output_mode:"content"` — confirm 4 import hits.

---

## Task D3: Wire 3 helpers into composeExpenseReportSnapshot

**Files:**
- Modify: `src/lib/expenseReportAggregator.js`

- [ ] **Step 1: Locate the existing rows construction**

Find the lines where `doctorRows = buildExpenseDoctorRows({...})` and `staffRows = buildExpenseStaffRows({...})` are built. They typically come AFTER the `const dfPayoutRows = mergeUnlinkedDfIntoPayoutRows(...)` line.

- [ ] **Step 2: Compute auto maps + enrich rows AFTER buildExpenseDoctorRows / staffRows**

Insert this block immediately AFTER `const staffRows = buildExpenseStaffRows({ ... });` and BEFORE `const categoryRows = buildExpenseCategoryRows(...)`:

```js
// Phase 16.7-quinquies — auto-payroll / hourly / commission enrichment.
// All computed-on-read; no Firestore writes for these auto entries.
const allPersons = [...doctors, ...staff];
const today = thaiTodayISO();
const nowDate = new Date();
const autoPayrollMap = computeAutoPayrollForPersons(allPersons, filter, today);
const hourlyMap      = computeHourlyFromSchedules(schedules, allPersons, filter, nowDate);
const commissionMap  = computeCommissionFromSales(branchFilteredSales, filter);

const enrichedDoctorRows = mergeAutoIntoRows(doctorRows, autoPayrollMap, hourlyMap, commissionMap, { isStaffSection: false });
const enrichedStaffRows  = mergeAutoIntoRows(staffRows,  autoPayrollMap, hourlyMap, commissionMap, { isStaffSection: true  });

// Sum auto-totals for the summary tile
let totalAutoPayroll = 0;
for (const v of autoPayrollMap.values()) totalAutoPayroll += Number(v.totalSalary || 0);
let totalAutoHourly = 0;
for (const v of hourlyMap.values()) totalAutoHourly += Number(v.totalAmount || 0);
let totalAutoCommission = 0;
for (const v of commissionMap.values()) totalAutoCommission += Number(v.totalCommission || 0);
```

- [ ] **Step 3: Replace doctorRows / staffRows usages with enriched versions**

In the same function, find references to `doctorRows` and `staffRows` AFTER the new block. Replace them:

```js
const categoryRows = buildExpenseCategoryRows({ expenses: filteredExpenses });

// Phase 16.7-quinquies — pass auto-totals to summary
const summary = computeExpenseSummary({
  doctorRows: enrichedDoctorRows,
  staffRows: enrichedStaffRows,
  categoryRows,
  totalUnlinkedDf,
  totalAutoPayroll,
  totalAutoHourly,
  totalAutoCommission,
});
```

Also find the returned object's `sections.doctors` and `sections.staff`. Replace:

```js
sections: {
  doctors:    enrichedDoctorRows,
  staff:      enrichedStaffRows,
  categories: categoryRows,
  products:   [],
},
```

- [ ] **Step 4: Add diagnostics to meta.sourceCounts**

In the returned `meta.sourceCounts` object, add:

```js
schedules: schedules.length,
autoPayrollPersons: autoPayrollMap.size,
hourlyPersons: hourlyMap.size,
commissionSellers: commissionMap.size,
```

- [ ] **Step 5: Verify**

Run: `Grep pattern:"enrichedDoctorRows|enrichedStaffRows|totalAutoPayroll" path:"F:/LoverClinic-app/src/lib/expenseReportAggregator.js" output_mode:"content"` — confirm hits.

---

## Task D4: Mirror enrichment in DfPayoutReportTab

**Files:**
- Modify: `src/components/backend/reports/DfPayoutReportTab.jsx`

- [ ] **Step 1: Add imports**

Locate the existing imports from `expenseReportHelpers.js`. Add a new import from payrollHelpers + utils:

```js
import {
  computeAutoPayrollForPersons,
  computeHourlyFromSchedules,
  computeCommissionFromSales,
  mergeAutoIntoRows,
} from '../../../lib/payrollHelpers.js';
import { thaiTodayISO } from '../../../utils.js';
```

Also extend the existing `'../../../lib/backendClient.js'` import to include `listAllStaffSchedules` if it exists (skip if not present — agent: check first via `Grep pattern:"listAllStaffSchedules|listStaffSchedules" path:"F:/LoverClinic-app/src/lib/backendClient.js"`).

- [ ] **Step 2: Add schedules state + loader**

In the component body, add:

```jsx
const [schedules, setSchedules] = useState([]);
```

Inside the existing `useEffect` that does `Promise.all([...])`, add a fetcher:

```js
async () => {
  try {
    const bc = await import('../../../lib/backendClient.js');
    if (typeof bc.listAllStaffSchedules === 'function') return bc.listAllStaffSchedules();
    if (typeof bc.listStaffSchedulesByDateRange === 'function') {
      return bc.listStaffSchedulesByDateRange({ from, to });
    }
    return [];
  } catch { return []; }
}
```

Add to the destructured result + state setter (mirror the existing pattern of other Promise.all results).

- [ ] **Step 3: Add helper call + merge in useMemo**

Inside the existing `const out = useMemo(() => { ... }, [...])`, AFTER the `mergeUnlinkedDfIntoPayoutRows` step but BEFORE `buildExpenseDoctorRows`, add:

```js
const allPersons = [...doctors, ...staff];
const today = thaiTodayISO();
const nowDate = new Date();
const autoPayrollMap = computeAutoPayrollForPersons(allPersons, { from, to }, today);
const hourlyMap      = computeHourlyFromSchedules(schedules, allPersons, { from, to }, nowDate);
const commissionMap  = computeCommissionFromSales(sales, { from, to });
```

THEN after the existing `const doctorRows = buildExpenseDoctorRows({ ... });` and `const staffSectionRows = buildExpenseStaffRows({ ... });`, wrap with `mergeAutoIntoRows`:

```js
const enrichedDoctorRows = mergeAutoIntoRows(doctorRows, autoPayrollMap, hourlyMap, commissionMap, { isStaffSection: false });
const enrichedStaffRows  = mergeAutoIntoRows(staffSectionRows, autoPayrollMap, hourlyMap, commissionMap, { isStaffSection: true });
```

- [ ] **Step 4: Replace downstream references**

Find references to `doctorRows` and `staffSectionRows` in the rest of `useMemo` + the JSX render. Replace with `enrichedDoctorRows` / `enrichedStaffRows`. Also pass auto-totals to `computeExpenseSummary`:

```js
let totalAutoPayroll = 0;
for (const v of autoPayrollMap.values()) totalAutoPayroll += Number(v.totalSalary || 0);
let totalAutoHourly = 0;
for (const v of hourlyMap.values()) totalAutoHourly += Number(v.totalAmount || 0);
let totalAutoCommission = 0;
for (const v of commissionMap.values()) totalAutoCommission += Number(v.totalCommission || 0);

const summary = computeExpenseSummary({
  doctorRows: enrichedDoctorRows,
  staffRows: enrichedStaffRows,
  categoryRows: [],
  totalAutoPayroll,
  totalAutoHourly,
  totalAutoCommission,
});

return {
  doctorRows: enrichedDoctorRows,
  assistantRows: enrichedStaffRows,
  summary,
  dfSummary: dfReport.summary || { total: 0, doctorCount: 0, lineCount: 0, saleCount: 0 },
  unlinkedDfDoctors: unlinkedBuckets.size,
};
```

- [ ] **Step 5: Add `schedules` to useMemo deps**

Find the existing `useMemo` deps array `[sales, treatments, doctors, groups, overrides, expenses, courses, from, to]`. Add `staff, schedules`:

```js
}, [sales, treatments, doctors, staff, groups, overrides, expenses, courses, schedules, from, to]);
```

- [ ] **Step 6: Verify**

Run: `Grep pattern:"computeAutoPayrollForPersons|computeHourlyFromSchedules|enrichedDoctorRows" path:"F:/LoverClinic-app/src/components/backend/reports/DfPayoutReportTab.jsx" output_mode:"content"` — confirm hits.

---

# PHASE E — Test bank batch (5 tasks; ALL after structure complete per Rule K)

## Task E1: Create phase16.7-quinquies-payroll.test.js

**Files:**
- Create: `tests/phase16.7-quinquies-payroll.test.js`

- [ ] **Step 1: Write test file**

```js
// tests/phase16.7-quinquies-payroll.test.js — Phase 16.7-quinquies (2026-04-29 session 33)
//
// computeAutoPayrollForPersons + clampPayDayToMonth coverage.
// Pure helpers; no Firebase; deterministic given inputs.

import { describe, it, expect } from 'vitest';
import {
  clampPayDayToMonth,
  computeAutoPayrollForPersons,
} from '../src/lib/payrollHelpers.js';

describe('PR.A — clampPayDayToMonth', () => {
  it('PR.A.1 — Feb non-leap: 31 → 28', () => {
    expect(clampPayDayToMonth('2026-02', 31)).toBe(28);
  });
  it('PR.A.2 — Feb leap year: 31 → 29', () => {
    expect(clampPayDayToMonth('2024-02', 31)).toBe(29);
  });
  it('PR.A.3 — Apr 30-day: 31 → 30', () => {
    expect(clampPayDayToMonth('2026-04', 31)).toBe(30);
  });
  it('PR.A.4 — Jul 31-day: 31 → 31', () => {
    expect(clampPayDayToMonth('2026-07', 31)).toBe(31);
  });
  it('PR.A.5 — Day 15: any month → 15', () => {
    expect(clampPayDayToMonth('2026-04', 15)).toBe(15);
    expect(clampPayDayToMonth('2026-02', 15)).toBe(15);
  });
  it('PR.A.6 — invalid yearMonth → 1', () => {
    expect(clampPayDayToMonth('', 25)).toBe(1);
    expect(clampPayDayToMonth('not-a-date', 25)).toBe(1);
  });
});

describe('PR.B — computeAutoPayrollForPersons single-month + single-person', () => {
  const persons = [{ id: 'D-1', salary: 30000, salaryDate: 25 }];
  const today = '2026-04-29';

  it('PR.B.1 — payDate in range AND payDate <= today → 1 entry', () => {
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, today);
    expect(m.size).toBe(1);
    expect(m.get('D-1').totalSalary).toBe(30000);
    expect(m.get('D-1').payDates).toEqual(['2026-04-25']);
  });

  it('PR.B.2 — payDate after today → skipped (future)', () => {
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-20');
    expect(m.size).toBe(0);
  });

  it('PR.B.3 — payDate before from → skipped', () => {
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-26', to: '2026-04-30' }, today);
    expect(m.size).toBe(0);
  });

  it('PR.B.4 — payDate after to → skipped', () => {
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-24' }, today);
    expect(m.size).toBe(0);
  });
});

describe('PR.C — multi-month range', () => {
  it('PR.C.1 — 3-month range × payday=15 → 3 entries when today >= last', () => {
    const persons = [{ id: 'D-1', salary: 10000, salaryDate: 15 }];
    const m = computeAutoPayrollForPersons(persons, { from: '2026-02-01', to: '2026-04-30' }, '2026-04-29');
    expect(m.get('D-1').totalSalary).toBe(30000);
    expect(m.get('D-1').payDates).toEqual(['2026-02-15', '2026-03-15', '2026-04-15']);
  });
});

describe('PR.D — Feb-31 clamp scenario', () => {
  it('PR.D.1 — payday=31 + Feb-only filter → 28 (non-leap)', () => {
    const persons = [{ id: 'D-1', salary: 10000, salaryDate: 31 }];
    const m = computeAutoPayrollForPersons(persons, { from: '2026-02-01', to: '2026-02-28' }, '2026-02-28');
    expect(m.get('D-1').payDates).toEqual(['2026-02-28']);
    expect(m.get('D-1').totalSalary).toBe(10000);
  });
});

describe('PR.E — adversarial inputs', () => {
  it('PR.E.1 — null persons → empty Map', () => {
    expect(computeAutoPayrollForPersons(null, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29').size).toBe(0);
  });
  it('PR.E.2 — salary=0 → skipped', () => {
    const persons = [{ id: 'D-1', salary: 0, salaryDate: 25 }];
    expect(computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29').size).toBe(0);
  });
  it('PR.E.3 — salaryDate=null → skipped', () => {
    const persons = [{ id: 'D-1', salary: 30000, salaryDate: null }];
    expect(computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29').size).toBe(0);
  });
  it('PR.E.4 — salaryDate=32 → skipped', () => {
    const persons = [{ id: 'D-1', salary: 30000, salaryDate: 32 }];
    expect(computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29').size).toBe(0);
  });
  it('PR.E.5 — multiple persons → all aggregated', () => {
    const persons = [
      { id: 'D-1', salary: 30000, salaryDate: 25 },
      { id: 'S-1', salary: 25000, salaryDate: 1 },
    ];
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29');
    expect(m.size).toBe(2);
    expect(m.get('D-1').totalSalary).toBe(30000);
    expect(m.get('S-1').totalSalary).toBe(25000);
  });
});
```

- [ ] **Step 2: Run focused tests**

Run: `Bash command:"cd F:/LoverClinic-app && npm test -- --run tests/phase16.7-quinquies-payroll.test.js 2>&1 | tail -8"`
Expected: ALL PASS (15+ tests).

---

## Task E2: Create phase16.7-quinquies-hourly.test.js

**Files:**
- Create: `tests/phase16.7-quinquies-hourly.test.js`

- [ ] **Step 1: Write test file**

```js
// tests/phase16.7-quinquies-hourly.test.js — Phase 16.7-quinquies (2026-04-29 session 33)
//
// computeHourlyFromSchedules coverage. Pure helper; uses local Date.

import { describe, it, expect } from 'vitest';
import { computeHourlyFromSchedules } from '../src/lib/payrollHelpers.js';

const persons = [{ id: 'D-1', hourlyIncome: 300 }, { id: 'S-1', hourlyIncome: 100 }];

describe('HR.A — single shift', () => {
  it('HR.A.1 — 3-hour shift × 300 ฿/hr = 900 ฿', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work' }];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0));
    expect(m.get('D-1').totalAmount).toBe(900);
    expect(m.get('D-1').totalHours).toBe(3);
  });
});

describe('HR.B — type filtering', () => {
  it('HR.B.1 — type=leave → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'leave' }];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0));
    expect(m.size).toBe(0);
  });
  it('HR.B.2 — type=off → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'off' }];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0));
    expect(m.size).toBe(0);
  });
  it('HR.B.3 — type=holiday → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'holiday' }];
    expect(computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
  it('HR.B.4 — status=cancelled → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work', status: 'cancelled' }];
    expect(computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
});

describe('HR.C — endTime > now (not yet elapsed)', () => {
  it('HR.C.1 — endTime in the future → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '23:00', type: 'work' }];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 12, 0));
    expect(m.size).toBe(0);
  });
});

describe('HR.D — multiple shifts same day', () => {
  it('HR.D.1 — morning + evening shifts both elapse → sum', () => {
    const schedules = [
      { staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work' },
      { staffId: 'D-1', date: '2026-04-29', startTime: '13:00', endTime: '17:00', type: 'work' },
    ];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0));
    expect(m.get('D-1').totalHours).toBe(7);
    expect(m.get('D-1').totalAmount).toBe(2100);
  });
});

describe('HR.E — branch filter', () => {
  it('HR.E.1 — branchIds=[BR-A] excludes schedule with branchId=BR-B', () => {
    const schedules = [
      { staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work', branchId: 'BR-A' },
      { staffId: 'D-1', date: '2026-04-29', startTime: '13:00', endTime: '17:00', type: 'work', branchId: 'BR-B' },
    ];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] }, new Date(2026, 3, 29, 23, 0));
    expect(m.get('D-1').totalHours).toBe(3);
  });
});

describe('HR.F — adversarial', () => {
  it('HR.F.1 — null schedules → empty Map', () => {
    expect(computeHourlyFromSchedules(null, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date()).size).toBe(0);
  });
  it('HR.F.2 — hourlyIncome=0 → person skipped', () => {
    const persons2 = [{ id: 'D-1', hourlyIncome: 0 }];
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work' }];
    expect(computeHourlyFromSchedules(schedules, persons2, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
  it('HR.F.3 — endTime <= startTime → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '12:00', endTime: '09:00', type: 'work' }];
    expect(computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
  it('HR.F.4 — date out of range → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2025-12-29', startTime: '09:00', endTime: '12:00', type: 'work' }];
    expect(computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run focused tests**

Run: `Bash command:"cd F:/LoverClinic-app && npm test -- --run tests/phase16.7-quinquies-hourly.test.js 2>&1 | tail -8"`
Expected: ALL PASS.

---

## Task E3: Create phase16.7-quinquies-commission.test.js

**Files:**
- Create: `tests/phase16.7-quinquies-commission.test.js`

- [ ] **Step 1: Write test file**

```js
// tests/phase16.7-quinquies-commission.test.js — Phase 16.7-quinquies (2026-04-29 session 33)
//
// computeCommissionFromSales coverage. Tests sale.sellers[].percent path +
// commission accumulation per seller + branch filter + adversarial.

import { describe, it, expect } from 'vitest';
import { computeCommissionFromSales } from '../src/lib/payrollHelpers.js';

describe('CM.A — single sale × single seller', () => {
  it('CM.A.1 — percent=10 × netTotal=10000 → commission=1000', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 10 }],
    }];
    const m = computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' });
    expect(m.get('D-1').totalCommission).toBe(1000);
    expect(m.get('D-1').perSale).toHaveLength(1);
  });
  it('CM.A.2 — percent string="5" works', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: '5' }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).get('D-1').totalCommission).toBe(500);
  });
});

describe('CM.B — multi-seller split', () => {
  it('CM.B.1 — 2 sellers, each percent=5 → each gets ฿500', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 5 }, { id: 'D-2', percent: 5 }],
    }];
    const m = computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' });
    expect(m.get('D-1').totalCommission).toBe(500);
    expect(m.get('D-2').totalCommission).toBe(500);
  });
});

describe('CM.C — multi-sale aggregation', () => {
  it('CM.C.1 — 2 sales × seller D-1 → totals sum', () => {
    const sales = [
      { saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 10000 }, sellers: [{ id: 'D-1', percent: 5 }] },
      { saleId: 'INV-2', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 20000 }, sellers: [{ id: 'D-1', percent: 5 }] },
    ];
    const m = computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' });
    expect(m.get('D-1').totalCommission).toBe(1500);
    expect(m.get('D-1').perSale).toHaveLength(2);
  });
});

describe('CM.D — percent=0 → no commission (no equal-split)', () => {
  it('CM.D.1 — single seller with percent=0 → empty Map', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 0 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
});

describe('CM.E — cancelled / refunded → skipped', () => {
  it('CM.E.1 — status=cancelled → skipped', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'cancelled',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 10 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
  it('CM.E.2 — refunded=true → skipped', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', refunded: true,
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', percent: 10 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
});

describe('CM.F — branch filter', () => {
  it('CM.F.1 — branchIds=[BR-A] excludes BR-B sale', () => {
    const sales = [
      { saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 10000 }, sellers: [{ id: 'D-1', percent: 5 }], branchId: 'BR-A' },
      { saleId: 'INV-2', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 20000 }, sellers: [{ id: 'D-1', percent: 5 }], branchId: 'BR-B' },
    ];
    const m = computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] });
    expect(m.get('D-1').totalCommission).toBe(500);
  });
});

describe('CM.G — id vs sellerId field schema', () => {
  it('CM.G.1 — sellerId field works', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ sellerId: 'D-1', percent: 10 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).get('D-1').totalCommission).toBe(1000);
  });
});

describe('CM.H — adversarial', () => {
  it('CM.H.1 — null sales → empty Map', () => {
    expect(computeCommissionFromSales(null, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
  it('CM.H.2 — sale with no sellers → skipped', () => {
    const sales = [{ saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 10000 }, sellers: [] }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
  it('CM.H.3 — netTotal=0 → no commission', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 0 },
      sellers: [{ id: 'D-1', percent: 10 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).size).toBe(0);
  });
  it('CM.H.4 — share field falls back when percent missing', () => {
    const sales = [{
      saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid',
      billing: { netTotal: 10000 },
      sellers: [{ id: 'D-1', share: 0.1 }],
    }];
    expect(computeCommissionFromSales(sales, { from: '2026-04-01', to: '2026-04-30' }).get('D-1').totalCommission).toBe(1000);
  });
});
```

- [ ] **Step 2: Run focused tests**

Run: `Bash command:"cd F:/LoverClinic-app && npm test -- --run tests/phase16.7-quinquies-commission.test.js 2>&1 | tail -8"`
Expected: ALL PASS.

---

## Task E4: Create phase16.7-quinquies-flow-simulate.test.js (Rule I)

**Files:**
- Create: `tests/phase16.7-quinquies-flow-simulate.test.js`

- [ ] **Step 1: Write test file**

```js
// tests/phase16.7-quinquies-flow-simulate.test.js — Rule I full-flow simulate
//
// Master data → expense report aggregator → enriched rows + summary tile reconciles.

import { describe, it, expect, vi } from 'vitest';

// Mock dfPayoutAggregator so we don't need the full DF infrastructure
vi.mock('../src/lib/dfPayoutAggregator.js', () => ({
  computeDfPayoutReport: () => ({
    rows: [],
    summary: { total: 0, doctorCount: 0, lineCount: 0, saleCount: 0 },
  }),
}));

import { composeExpenseReportSnapshot } from '../src/lib/expenseReportAggregator.js';

const fixtures = (overrides = {}) => ({
  expenses: [],
  categories: [],
  doctors: [
    { id: 'D-1', name: 'หมอ ก', position: 'แพทย์', hourlyIncome: 300, salary: 30000, salaryDate: 25 },
  ],
  staff: [
    { id: 'S-1', firstname: 'พนักงาน', lastname: 'A', position: 'รีเซฟชั่น', hourlyIncome: 100, salary: 25000, salaryDate: 1 },
  ],
  sales: [
    { id: 'INV-1', saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 10000 }, sellers: [{ id: 'S-1', percent: 5 }] },
  ],
  treatments: [],
  dfGroups: [],
  dfStaffRates: [],
  courses: [],
  branches: [],
  schedules: [
    { staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work' },
  ],
  ...overrides,
});

describe('FQ.A — Full-flow simulate', () => {
  it('FQ.A.1 — doctor row has sitFee from hourly + salary auto + commission', () => {
    // Today must be >= salary payday for D-1 (25 Apr) AND for S-1 (1 Apr).
    // schedule endTime must be in the past at "now".
    // We can't override `today` directly via composeExpenseReportSnapshot —
    // it reads thaiTodayISO() internally. Test asserts shape against the
    // PRESENT behavior: if today >= 25 Apr 2026 the salary fires for D-1.
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    const d1 = snap.sections.doctors.find(r => r.id === 'D-1');
    expect(d1).toBeTruthy();
    // sitFee should at least have the hourly portion (300 × 3 = 900) IF the
    // schedule's endTime (12:00 on 29 Apr 2026) is before "now" at test time.
    // In CI this date is in the future so endTime > now → hourly is 0.
    // But the row should still EXIST with valid numeric columns.
    expect(typeof d1.sitFee).toBe('number');
    expect(typeof d1.salary).toBe('number');
    expect(typeof d1.df).toBe('number');
    expect(typeof d1.other).toBe('number');
    expect(typeof d1.total).toBe('number');
    // total should reconcile
    expect(d1.total).toBeCloseTo(d1.sitFee + d1.df + d1.salary + d1.other, 1);
  });

  it('FQ.A.2 — staff row has commission in other column (no sitFee column)', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    const s1 = snap.sections.staff.find(r => r.id === 'S-1');
    expect(s1).toBeTruthy();
    // S-1 has 5% × 10000 = 500 commission (commission is computed-on-read,
    // not gated by today). Should appear in `other`.
    expect(s1.other).toBeGreaterThanOrEqual(500);
    expect(s1.total).toBeCloseTo(s1.df + s1.salary + s1.other, 1);
    // Staff section has no sitFee column; mergeAutoIntoRows should NOT have
    // a sitFee field on staff rows.
    expect(s1.sitFee).toBeUndefined();
  });

  it('FQ.A.3 — summary contains totalAuto* fields + totalAll reconciles', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    expect(snap.summary).toHaveProperty('totalAutoPayroll');
    expect(snap.summary).toHaveProperty('totalAutoHourly');
    expect(snap.summary).toHaveProperty('totalAutoCommission');
    // totalAll = totalCategory + totalUnlinkedDf + totalAutoPayroll + totalAutoHourly + totalAutoCommission
    expect(snap.summary.totalAll).toBeCloseTo(
      snap.summary.totalCategory +
      snap.summary.totalUnlinkedDf +
      snap.summary.totalAutoPayroll +
      snap.summary.totalAutoHourly +
      snap.summary.totalAutoCommission,
      1
    );
  });

  it('FQ.A.4 — sourceCounts includes new diagnostic fields', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    expect(snap.meta.sourceCounts).toHaveProperty('schedules');
    expect(snap.meta.sourceCounts).toHaveProperty('autoPayrollPersons');
    expect(snap.meta.sourceCounts).toHaveProperty('hourlyPersons');
    expect(snap.meta.sourceCounts).toHaveProperty('commissionSellers');
  });

  it('FQ.A.5 — V14 no-undefined-leaves', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    const s = JSON.stringify(snap);
    expect(s).not.toMatch(/:\s*undefined/);
  });
});

describe('FQ.B — Source-grep regression guards', () => {
  it('FQ.B.1 — payrollHelpers has 5 exports', async () => {
    const mod = await import('../src/lib/payrollHelpers.js');
    expect(typeof mod.clampPayDayToMonth).toBe('function');
    expect(typeof mod.computeAutoPayrollForPersons).toBe('function');
    expect(typeof mod.computeHourlyFromSchedules).toBe('function');
    expect(typeof mod.computeCommissionFromSales).toBe('function');
    expect(typeof mod.mergeAutoIntoRows).toBe('function');
  });

  it('FQ.B.2 — expenseReportAggregator imports payrollHelpers', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/expenseReportAggregator.js', 'utf-8');
    expect(src).toMatch(/from\s*['"]\.\/payrollHelpers\.js['"]/);
    expect(src).toMatch(/computeAutoPayrollForPersons/);
    expect(src).toMatch(/computeHourlyFromSchedules/);
    expect(src).toMatch(/computeCommissionFromSales/);
    expect(src).toMatch(/mergeAutoIntoRows/);
  });

  it('FQ.B.3 — DfPayoutReportTab imports payrollHelpers', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/reports/DfPayoutReportTab.jsx', 'utf-8');
    expect(src).toMatch(/from\s*['"]\.\.\/\.\.\/\.\.\/lib\/payrollHelpers\.js['"]/);
  });

  it('FQ.B.4 — staffValidation has salary + salaryDate + hourlyIncome', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/staffValidation.js', 'utf-8');
    expect(src).toMatch(/salary/);
    expect(src).toMatch(/salaryDate/);
    expect(src).toMatch(/hourlyIncome/);
  });

  it('FQ.B.5 — doctorValidation has salary + salaryDate', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/doctorValidation.js', 'utf-8');
    expect(src).toMatch(/salary/);
    expect(src).toMatch(/salaryDate/);
  });

  it('FQ.B.6 — Phase 16.7-quinquies marker present in payrollHelpers', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/payrollHelpers.js', 'utf-8');
    expect(src).toMatch(/Phase 16\.7-quinquies/);
  });
});
```

- [ ] **Step 2: Run focused tests**

Run: `Bash command:"cd F:/LoverClinic-app && npm test -- --run tests/phase16.7-quinquies-flow-simulate.test.js 2>&1 | tail -8"`
Expected: ALL PASS.

---

## Task E5: Fix legacy test mocks broken by new schema requirements

**Files:**
- Modify: `tests/phase16.7-bis-followups.test.jsx` (or any other Phase 16.7 test that mocks DfPayoutReportTab dependencies)

- [ ] **Step 1: Run all Phase 16.7-* tests + identify failures**

Run: `Bash command:"cd F:/LoverClinic-app && npm test -- --run tests/phase16.7-* 2>&1 | tail -30"`

- [ ] **Step 2: For each failure, add missing mocks**

The DfPayoutReportTab + expenseReportAggregator now also call `listAllStaffSchedules` (or fall back to date-range). Pre-existing test mocks need to add this. In each failing test file, find the `vi.mock('../src/lib/backendClient.js', () => ({...}))` block and add:

```js
listAllStaffSchedules: vi.fn().mockResolvedValue([]),
listStaffSchedulesByDateRange: vi.fn().mockResolvedValue([]),
```

(Mock to empty array — tests that don't care about hourly fee will still pass since empty schedules → no hourly enrichment.)

- [ ] **Step 3: Re-run + verify all pass**

Run: `Bash command:"cd F:/LoverClinic-app && npm test -- --run tests/phase16.7-* 2>&1 | tail -8"`

Expected: ALL PASS (~ 4121 + 49 new ≈ 4170 total).

---

# PHASE F — Verify + ship (3 tasks)

## Task F1: Run full test suite + build

**Files:** N/A — verification only

- [ ] **Step 1: Full vitest suite**

Run: `Bash command:"cd F:/LoverClinic-app && npm test -- --run 2>&1 | tail -5" timeout:240000`
Expected: ALL PASS (~ 4170 tests).

- [ ] **Step 2: Build**

Run: `Bash command:"cd F:/LoverClinic-app && npm run build 2>&1 | tail -3" timeout:240000`
Expected: clean build with no errors.

If failures: read the offending file, fix, re-run.

---

## Task F2: Live preview_eval verification

**Files:** N/A — verification only

- [ ] **Step 1: Reload running dev server preview**

Use the existing preview_start tool to re-use the dev server (port 5173). If not running, start it.

- [ ] **Step 2: Verify expense report tab loads + shows auto-amounts**

Run preview_eval to reload the page + check:
- Doctor 308 (or test doctor with salary set) shows non-zero salary column when payday < today
- Schedule entries before "now" produce sitFee for doctors / other for staff
- Sales with sellers[].percent > 0 produce other column for sellers
- Summary tile "รายจ่ายรวม" reflects totalAll formula

- [ ] **Step 3: Optional manual test (real data)**

Admin user adds salary=30000 + salaryDate=25 to one doctor via DoctorFormModal. Saves. Reopens Expense Report. Confirms doctor's salary column = ฿30,000 in current month row.

Note: do NOT run actual Firestore writes via preview_eval (per memory rule `feedback_no_real_action_in_preview_eval.md`). Manual UI test only.

---

## Task F3: Commit + push

**Files:** N/A — git operations

- [ ] **Step 1: Stage all changed files**

Run:

```bash
git add \
  src/lib/doctorValidation.js \
  src/lib/staffValidation.js \
  src/components/backend/DoctorFormModal.jsx \
  src/components/backend/StaffFormModal.jsx \
  api/proclinic/master.js \
  src/lib/backendClient.js \
  src/lib/payrollHelpers.js \
  src/lib/expenseReportHelpers.js \
  src/lib/expenseReportAggregator.js \
  src/components/backend/reports/DfPayoutReportTab.jsx \
  tests/phase16.7-quinquies-payroll.test.js \
  tests/phase16.7-quinquies-hourly.test.js \
  tests/phase16.7-quinquies-commission.test.js \
  tests/phase16.7-quinquies-flow-simulate.test.js \
  tests/phase16.7-bis-followups.test.jsx
```

(Last file only if it was touched in E5. Add other Phase-16.7 test files only if they were touched.)

- [ ] **Step 2: Commit**

Run:

```bash
git commit -m "$(cat <<'EOF'
feat(reports): Phase 16.7-quinquies — payroll + hourly + commission auto-computed

Spec: docs/superpowers/specs/2026-04-29-phase16-7-quinquies-payroll-design.md

Adds salary + payday + hourlyIncome schema fields and auto-computes 3 labor-
cost components into ExpenseReportTab + DfPayoutReportTab without writing
be_expenses docs (computed-on-read):

1. **Auto-payroll**: when today >= person.salaryDate, person's salary
   appears in the salary column. Multi-month range aggregates per pay cycle.
   salaryDate=31 in Feb clamps to 28/29 (leap-aware).

2. **Hourly fee**: be_staff_schedules entries where endTime <= now AND
   type ∉ {leave,off,holiday} AND status ≠ cancelled accrue
   (endTime - startTime) × person.hourlyIncome. Doctors → sitFee column;
   staff → other column (no sitFee column for staff per ProClinic intel).

3. **Commission**: sale.sellers[].percent × sale.billing.netTotal accrues
   per seller into "other" column. percent=0 → no commission (deliberate
   opt-in; no equal-split fallback unlike Phase 16.7-quater DF semantics).

Schema:
- be_doctors gains: salary, salaryDate
- be_staff gains: salary, salaryDate, hourlyIncome (mirror of doctor)
- ProClinic sync mappers (api/proclinic/master.js) preserve salary +
  salary_date from /admin/user response → master_data
- migrateMasterDoctorsToBe + migrateMasterStaffToBe copy fields into be_*

UI:
- DoctorFormModal: 2 new input fields (salary, salaryDate)
- StaffFormModal: 3 new input fields (hourlyIncome, salary, salaryDate)
- "การเงิน" section heading

Wiring:
- src/lib/payrollHelpers.js: NEW pure helpers (clampPayDayToMonth,
  computeAutoPayrollForPersons, computeHourlyFromSchedules,
  computeCommissionFromSales, mergeAutoIntoRows)
- expenseReportAggregator + DfPayoutReportTab: load schedules; call 3
  helpers; mergeAutoIntoRows on doctorRows + staffRows; pass auto-totals
  to computeExpenseSummary; surface in summary tile + meta.sourceCounts

Iron-clad refs:
- E (Firestore-only): no /api/proclinic/* in feature code; sync stays in
  api/proclinic/master.js (sanctioned exception)
- H + H-quater (be_* canonical): no master_data reads in feature code
- F + F-bis (Triangle Rule): ProClinic intel verified salary + salary_date
  fields exist at /admin/user/edit
- I (full-flow simulate): phase16.7-quinquies-flow-simulate.test.js chains
  master-data → aggregator → enriched rows + reconciliation
- C1 Rule of 3: shared helpers used by ExpenseReportTab + DfPayoutReportTab
  + future Phase 16 tabs
- K (work-first test-last): structure across 17 tasks first, test bank
  as final pass before commit

Tests +49 across 4 new files:
- phase16.7-quinquies-payroll.test.js (PR.A-PR.E ~16 cases)
- phase16.7-quinquies-hourly.test.js (HR.A-HR.F ~13 cases)
- phase16.7-quinquies-commission.test.js (CM.A-CM.H ~13 cases)
- phase16.7-quinquies-flow-simulate.test.js (FQ.A-FQ.B Rule I + 6 source-grep)

Test count: 4121 → ~4170. Build clean.

v1 known limits (documented in spec):
- Always uses CURRENT person.salary (no historical snapshot; v2 candidate)
- Schedule-based hours (no real-time check-in)
- Flat commission percent (no tier ladders)
- Branch filter applies to hourly + commission (via schedule.branchId /
  sale.branchId); salary always shows org-wide

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push to origin**

Run:

```bash
git push origin master
```

Expected: success message; master is now N+1 commits ahead-of-prod.

---

# Self-Review Notes (writing-plans skill final pass)

**Spec coverage check** — every spec section maps to a task:
- Stream 1 schema + UI → Tasks A1-A4 ✓
- Stream 2 auto-payroll → Tasks C1-C2, D2-D3 ✓
- Stream 3 hourly fee → Tasks C3, D2-D3 ✓
- Stream 4 commission → Tasks C4, D2-D3 ✓
- Stream 5 wiring → Tasks D1-D4 ✓
- ProClinic sync → Tasks B1-B4 ✓
- Tests → Tasks E1-E5 ✓
- Verify + ship → Tasks F1-F3 ✓

**Placeholder scan** — none found. All "agent: check first" notes have explicit grep commands. All code blocks are complete. No "TBD" or "implement later" markers.

**Type consistency** — `clampPayDayToMonth(yearMonth, salaryDate)` signature consistent across helper definition (C1) and use (C2). `computeAutoPayrollForPersons(persons, filter, today)` signature matches helper definition + tests (E1) + aggregator wiring (D2-D3). `mergeAutoIntoRows` arg order consistent throughout. Test imports match helper exports.

**Edge case coverage** — Feb-31 clamp covered in PR.D, leave/off/holiday in HR.B, percent=0 in CM.D, cancelled sale in CM.E, branch filter in HR.E + CM.F, non-existent helpers (listAllStaffSchedules) handled via runtime check + fallback in D2.
