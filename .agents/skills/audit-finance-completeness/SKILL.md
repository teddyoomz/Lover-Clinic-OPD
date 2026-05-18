---
name: audit-finance-completeness
description: Audit Phase 12 financial data layer completeness — staff/doctors, products/courses, customer + deposit + sale validators, bank accounts, expense categories + expenses, online sales, sale insurance claims, P&L + payment summary reports. Ensures every entity has a validator + normalizer + tests + Firestore rule + Rule E cleanliness. Required before every release after Phase 12.0 ships.
user-invocable: true
allowed-tools: "Read, Grep, Glob, Bash"
---

# Audit: Phase 12 Finance + Data Layer Completeness

## Context

**Scope**: Every `be_*` collection shipped in Phase 12 (12.1 → 12.9). Phase 12 is the finance foundation — staff/doctors so auth + commissions can attribute, products/courses so items on sales resolve, customer schema so privacy + marketing work, deposit 5-seller so commissions reconcile, bank accounts + expenses so P&L has real sides, online-sale status machine for pre-sale, insurance claims backfilling Phase 10.2 col, P&L + payment summary closing the report suite, and sale validator gating the 101-field reconciliation.

**Why this skill exists**: before Phase 13+ extends the schema, every Phase 12 entity must have:
1. Pure validator + normalizer + generateId (`src/lib/<entity>Validation.js`)
2. backendClient CRUD (list + save + delete at minimum)
3. firestore.rules match block gated on `isClinicStaff()`
4. Adversarial tests (validator + optional tab)
5. No brokerClient import, no /api/proclinic/* call (Rule E)
6. @dev-only marker if it's sync scaffolding (Rule H-bis)

## Entity matrix + invariants (FC1-FC20)

### FC1 — every Phase 12 entity has a validator file
```bash
for f in staff doctor product course customer deposit bankAccount expenseCategory expense onlineSale saleInsuranceClaim sale; do
  test -f "src/lib/${f}Validation.js" || echo "MISSING: src/lib/${f}Validation.js"
done
```
**Expected**: no output.

### FC2 — every validator exports validate + normalize + emptyForm + generateId
```bash
for f in staff doctor product course customer deposit bankAccount expenseCategory expense onlineSale saleInsuranceClaim; do
  grep -lE "export function validate" src/lib/${f}Validation.js >/dev/null || echo "MISSING validate: $f"
  grep -lE "export function normalize" src/lib/${f}Validation.js >/dev/null || echo "MISSING normalize: $f"
  grep -lE "export function empty.*Form" src/lib/${f}Validation.js >/dev/null || echo "MISSING emptyForm: $f"
done
```
**Expected**: no output. (sale validator uses `validateSaleStrict` + `normalizeSale` + `emptySaleForm` — Phase 12.9 variation.)

### FC3 — every entity has a Firestore rule block
```bash
grep -cE "match /be_(staff|doctors|products|courses|customers|deposits|bank_accounts|expense_categories|expenses|online_sales|sale_insurance_claims|sales)" firestore.rules
```
**Expected**: ≥ 12 matches.

### FC4 — every rule gated on isClinicStaff (no "allow: if true")
```bash
grep -nE "^\s*match /be_" firestore.rules -A 2 | grep -E "if true" || true
```
**Expected**: empty. Any match = security regression — be_* collections must never be world-writable.

### FC5 — every entity has adversarial tests
```bash
ls tests/{staff,doctor,product,course,customer,deposit,bankAccount,expenseCategory,expense,onlineSale,saleInsuranceClaim,sale}Validation.test.js 2>/dev/null | wc -l
ls tests/phase12-{people,catalog,finance-master}-tabs.test.jsx tests/phase12-finance-master.test.js 2>/dev/null | wc -l
```
**Expected**: ≥ 12 validator test files OR combined (phase12-*) test files covering them.

### FC6 — backendClient has CRUD for every entity
```bash
for e in Staff Doctor Product Course BankAccount ExpenseCategory Expense OnlineSale SaleInsuranceClaim; do
  grep -lE "export async function (list|save|delete)${e}" src/lib/backendClient.js >/dev/null || echo "MISSING CRUD: $e"
done
# Customer + Deposit + Sale use different naming (saveCustomer / createDeposit / saveBackendSale).
grep -E "^export async function (saveCustomer|createDeposit|saveBackendSale)" src/lib/backendClient.js
```
**Expected**: all 9 + legacy 3 present.

### FC7 — Rule E: no brokerClient in Phase 12 tabs
```bash
grep -rn "brokerClient" src/components/backend/{Staff,Doctors,Products,Courses,FinanceMaster,OnlineSales}*.jsx 2>/dev/null
grep -rn "brokerClient" src/components/backend/reports/{PnLReport,PaymentSummary}Tab.jsx 2>/dev/null
```
**Expected**: empty.

### FC8 — Rule E: no /api/proclinic in Phase 12 libs
```bash
grep -rnE "/api/proclinic/" src/lib/{staff,doctor,product,course,customer,deposit,bankAccount,expenseCategory,expense,onlineSale,saleInsuranceClaim,sale,adminUsersClient}*.js 2>/dev/null
```
**Expected**: empty.

### FC9 — /api/admin/* only from adminUsersClient (Phase 12.0 exception)
```bash
grep -rnE "/api/admin/" src/lib/ src/components/ 2>/dev/null | grep -v "adminUsersClient.js" | grep -v "StaffFormModal.jsx" | grep -v "DoctorFormModal.jsx" | grep -v "StaffTab.jsx" | grep -v "DoctorsTab.jsx"
```
**Expected**: empty. `api/admin/users` should only be hit via adminUsersClient (used by Staff + Doctor FormModals).

### FC10 — status enums exported + frozen
```bash
for f in staffValidation doctorValidation productValidation courseValidation depositValidation bankAccountValidation expenseCategoryValidation expenseValidation onlineSaleValidation saleInsuranceClaimValidation; do
  grep -cE "Object\.freeze\(" src/lib/${f}.js
done
```
**Expected**: each ≥ 1.

### FC11 — crypto-random ID generators (Rule C2)
```bash
grep -rn "Math.random()" src/lib/{staff,doctor,product,course,deposit,bankAccount,expenseCategory,expense,onlineSale,saleInsuranceClaim,sale}Validation.js
```
**Expected**: empty. All generateId funcs use `crypto.getRandomValues(new Uint8Array(8))`.

### FC12 — no leaked Firebase Admin SDK in src/
```bash
grep -rn "from ['\"]firebase-admin" src/
```
**Expected**: empty. Admin SDK stays server-side (api/admin/_lib/adminAuth.js only). Cross-reference with /audit-firebase-admin-security FA11.

### FC13 — sale insurance claims properly backfill Phase 10.2 report col
```bash
grep -nE "claimsBySaleId|aggregateClaimsBySaleId" src/lib/saleReportAggregator.js
grep -nE "loadSaleInsuranceClaimsByDateRange" src/lib/reportsLoaders.js
```
**Expected**: both present. SaleReportTab + exported `claims` filter option should consume loader.

### FC14 — 5-seller support in deposit + sale validators
```bash
grep -n "MAX_SELLERS.*5" src/lib/{deposit,sale}Validation.js
```
**Expected**: both files show MAX_SELLERS = 5.

### FC15 — 3-payment-methods in sale validator (ProClinic actual limit)
```bash
grep -n "MAX_PAYMENT_METHODS.*3" src/lib/saleValidation.js
```
**Expected**: exactly 1 match.

### FC16 — Status state-machine integrity (online-sale + sale-claim)
```bash
grep -nE "applyStatusTransition|applyClaimStatusTransition" src/lib/{onlineSale,saleInsuranceClaim}Validation.js
```
**Expected**: both present. Both functions throw on invalid transition (tests cover terminal-state blocks).

### FC17 — P&L reconcile (row sum == total sum, AR5)
```bash
grep -nE "netProfit:\s*roundTHB|roundTHB.*revenueSum" src/lib/pnlReportAggregator.js
```
**Expected**: present. Tests should include PL14 "rows reconcile to totals".

### FC18 — Payment summary method normalization
```bash
grep -nE "canonicalMethod|KNOWN_METHODS" src/lib/paymentSummaryAggregator.js
```
**Expected**: both present. Tests cover case-insensitive aliases (PS9-10).

### FC19 — Phase 12 nav parity (12 master-data + 2 sales + 2 reports tabs)
```bash
grep -cE "id:\s*'(staff|doctors|products|courses|finance-master|online-sales|reports-pnl|reports-payment)'" src/components/backend/nav/navConfig.js
```
**Expected**: ≥ 8 (Phase 12 tab IDs).

### FC20 — every new collection has a dev-only marker check OR is production
```bash
grep -rE "@dev-only" src/lib/{staff,doctor,product,course,customer,deposit,bankAccount,expenseCategory,expense,onlineSale,saleInsuranceClaim,sale}Validation.js
grep -rE "@dev-only" src/components/backend/{Staff,Doctors,Products,Courses,FinanceMaster,OnlineSales}*.jsx
```
**Expected**: empty. Phase 12 entities are production — sync flow stays in MasterDataTab + brokerClient which ARE dev-only per rule H-bis.

## Severity mapping

- **CRITICAL** (FC4, FC8, FC11, FC12) — open rule, ProClinic write-back leak, weak ID, Admin SDK in bundle. Block release.
- **HIGH** (FC1, FC3, FC6, FC13, FC14, FC15, FC16) — missing validator / rule / CRUD / state machine / reconciliation wiring. Fix before release.
- **MEDIUM** (FC2, FC5, FC7, FC9, FC10, FC17, FC18, FC19) — missing test coverage / export completeness / nav wiring.
- **LOW** (FC20) — marker hygiene.

## Priority

P0 — required before shipping Phase 13. Closes the Phase 12 financial foundation so downstream phases can build on validated data shape. Registered in `/audit-all` Tier 5.

## Integration

- Runs inside `/audit-all` Tier 5 as the 19th skill.
- Run on any edit under `src/lib/*Validation.js`, `src/components/backend/**` Phase 12 tabs, or `firestore.rules` Phase 12 blocks.
- Pairs with `/audit-firebase-admin-security` (FA for Admin SDK) + `/audit-anti-vibe-code` (AV for Rule of 3 / crypto IDs / schema lean) + `/audit-backend-firestore-only` (BF for brokerClient leaks).

## Phase 12 scorecard (2026-04-20 close)

| Sub-task | Entity | Validator | Tab | Tests | Rule | ✅ |
|---|---|---|---|---|---|---|
| 12.0  | api/admin/users | adminAuth helper | — | 28 | — | ✅ |
| 12.1  | be_staff / be_doctors | staff + doctor | StaffTab + DoctorsTab | 92 | ✅ | ✅ |
| 12.2  | be_products / be_courses | product + course | ProductsTab + CoursesTab | 64 | ✅ | ✅ |
| 12.3  | be_customers | customer | (existing CloneTab/CustomerListTab) | 43 | existed | ✅ |
| 12.4  | be_deposits | deposit | (existing DepositPanel) | 44 | existed | ✅ |
| 12.5  | be_bank_accounts + be_expense_categories + be_expenses | 3 validators | FinanceMasterTab | 42 | ✅ | ✅ |
| 12.6  | be_online_sales | onlineSale | OnlineSalesTab | 36 | ✅ | ✅ |
| 12.7  | be_sale_insurance_claims | saleInsuranceClaim | (integrated via SaleReport aggregator) | 38 | ✅ | ✅ |
| 12.8  | — (reports) | 2 aggregators | PnLReportTab + PaymentSummaryTab | 33 | reused | ✅ |
| 12.9  | be_sales | sale (strict) | (existing SaleTab — opt-in) | 44 | existed | ✅ |

**Total Phase 12 additions: 2373 → 2837 tests (+464).** Target was +465 per v5 plan. Off by 1, within tolerance.
