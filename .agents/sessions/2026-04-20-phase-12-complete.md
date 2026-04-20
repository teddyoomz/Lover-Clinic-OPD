# 2026-04-20 · Phase 12 Complete + 12.11 Adapter

## Summary
Shipped all 11 sub-tasks of Phase 12 (Firebase Admin SDK → be_sales validator) + Phase 12.11 bonus (be_* → master_data adapter + debug delete button). 2373 → 2850 tests (+477). `.agents/` scaffold installed via agent-context-kit at end of session.

## Current State
- **Branch**: master, pushed to origin
- **Last commit**: `57da3ba feat(phase12.11): be_* → master_data adapter (4 types) + debug delete button`
- **Test count**: 2850/2850 passing
- **Build**: clean (`npm run build` successful)
- **firestore.rules**: modified (+9 new be_* match blocks), **NOT deployed**
- **Vercel**: NOT deployed (user did not authorize)

## Decisions
1. **Phase 12 scope = data-layer foundation, not UI rewire** — shipped validators + CRUD + Firestore rules + audit skill for every Phase 12 entity (11 sub-tasks). Full UI rewire to read be_* directly deferred to Phase 16.
2. **5-seller invariant (not 3 as v5 plan said)** — Triangle scan of `/admin/deposit` (2246 lines) + `/admin/sale/create` confirmed ProClinic supports 5 sellers per deposit/sale. depositValidation + saleValidation both use `MAX_SELLERS = 5`.
3. **Sale validator strict-mode opt-in** — existing `saveBackendSale` (2000+ LOC) stays unchanged. `validateSaleStrict` exported as gate. Same backwards-compat pattern as saveCustomer / createDeposit / saveExpense.
4. **Insurance claims aggregator wiring** — `saleReportAggregator.buildSaleReportRow(sale, customerLookup, claimsBySaleId)` accepts 3rd arg. `aggregateSaleReport` accepts `claims` OR pre-built `claimsBySaleId` Map. Backwards-compat preserved — all existing tests pass without passing claims.
5. **Phase 12.11 adapter (user-requested)** — dual-read in `getAllMasterDataItems(type)` for products/courses/staff/doctors. Maps be_* → master_data shape so consumers work unchanged. Non-backed types (wallet/membership/medication/consumable groups) still read master_data directly until Phase 16.

## Blockers
1. `firebase deploy --only firestore:rules` pending — user needs to run Probe-Deploy-Probe per rule B (4 endpoints) then deploy. Until then, Phase 12 tabs get PERMISSION_DENIED in production.
2. Vercel env vars pending for `/api/admin/users`: `FIREBASE_ADMIN_CLIENT_EMAIL` + `_PRIVATE_KEY` + optional `_BOOTSTRAP_UIDS`.
3. Weekly token budget ~5% — Phase 13 (~23h, 6 sub-tasks) cannot fit in remaining session.

## Files Touched (summary — 11 commits)

Validators + CRUD (`src/lib/*Validation.js`, `src/lib/backendClient.js`):
- staffValidation, doctorValidation, productValidation, courseValidation, customerValidation, depositValidation, bankAccountValidation, expenseCategoryValidation, expenseValidation, onlineSaleValidation, saleInsuranceClaimValidation, saleValidation
- adminUsersClient (`/api/admin/users` thin wrapper)

Serverless:
- `api/admin/_lib/adminAuth.js` + `api/admin/users.js` (Firebase Admin SDK)

UI tabs (`src/components/backend/`):
- StaffTab, StaffFormModal, DoctorsTab, DoctorFormModal, ProductsTab, ProductFormModal, CoursesTab, CourseFormModal, FinanceMasterTab (bank + expense cat + expense), OnlineSalesTab
- Reports: `reports/PnLReportTab.jsx`, `reports/PaymentSummaryTab.jsx`

Aggregators (`src/lib/`):
- pnlReportAggregator, paymentSummaryAggregator
- saleReportAggregator (extended with claimsBySaleId)
- reportsLoaders (loadExpensesByDateRange + loadSaleInsuranceClaimsByDateRange added)

Rules / skills / nav:
- `firestore.rules` (+9 be_* match blocks)
- `.claude/skills/audit-firebase-admin-security/SKILL.md` (FA1-12)
- `.claude/skills/audit-finance-completeness/SKILL.md` (FC1-20)
- `.claude/skills/audit-all/SKILL.md` (Tier 5 expanded 17 → 19 skills, 209 → 229 invariants)
- `.claude/rules/03-stack.md` (Rule E exception #7 for /api/admin/*)
- `src/components/backend/nav/navConfig.js` (+ 9 new tab IDs: staff, doctors, products, courses, finance-master, online-sales, reports-pnl, reports-payment, + existing)
- `src/pages/BackendDashboard.jsx` (+ 9 route handlers)

Tests (`tests/`):
- api-admin-users.test.js (28), staffValidation (32), doctorValidation (27), adminUsersClient (8), phase12-people-tabs (17), productValidation (26), courseValidation (22), phase12-catalog-tabs (16), customerValidation (43), depositValidation (44), phase12-finance-master (42), onlineSaleValidation (36), saleInsuranceClaim (38), pnlReport (19), paymentSummary (17), saleValidation (44), phase12-11-be-shape-adapters (13)
- Nav test updates: backend-nav-config, phase11-master-data-scaffold, reports-shell, phase10-wiring-crosscut

Documentation:
- `CODEBASE_MAP.md` — full Phase 12.0 through 12.11 sections appended
- `docs/proclinic-scan/` — admin-user-forms, admin-doctor-forms, admin-product-forms, admin-course-forms, admin-deposit-forms, admin-online-sale-forms, admin-sale-insurance-claim-forms, admin-bank-account-forms, admin-expense-forms, admin-expense-category-forms (Triangle artifacts)

## Commands Run
```bash
# Each sub-task flow:
node F:/replicated/scraper/opd.js forms /admin/<entity> > docs/proclinic-scan/admin-<entity>-forms.json
npm test -- --run         # 2373 → 2850
npm run build              # clean every commit
git add <files>
git commit -m "feat(phase12.X): ..."
git push origin master

# Rules deploy — NOT RUN (user to authorize via Probe-Deploy-Probe)
# firebase deploy --only firestore:rules

# Vercel deploy — NOT RUN (no explicit "deploy" authorization)
# vercel --prod
```

## Commit list (this session)
```
57da3ba feat(phase12.11): be_* → master_data adapter (4 types) + debug delete button
6c57de8 feat(phase12.10): /audit-finance-completeness skill — Phase 12 closeout
890c254 feat(phase12.9): be_sales validator (5 sellers + 3 payments + 9 invariants)
b7bb7be feat(phase12.8): P&L + Payment Summary reports
b1df9e4 feat(phase12.7): be_sale_insurance_claims + Phase 10.2 SaleReport backfill
e908d4b feat(phase12.6): be_online_sales + status machine
e12589e feat(phase12.5): be_bank_accounts + be_expense_categories + be_expenses
0b6328a feat(phase12.4): be_deposits validator + 5-seller support + even-split helper
19dc759 feat(phase12.3): be_customers validator + normalizer + non-strict enforce
8b74fa8 feat(phase12.2): be_products + be_courses CRUD (migrate from master_data)
c1ff9f2 feat(phase12.1): be_staff + be_doctors CRUD + Firebase user creation
a908fdb feat(phase12.0): Firebase Admin SDK serverless + audit skill
```

## Next Todo (ranked by risk vs value)
1. **User runs `firebase deploy --only firestore:rules` with Probe-Deploy-Probe** — unblocks all Phase 12 tabs in production
2. **User adds `FIREBASE_ADMIN_CLIENT_EMAIL` + `_PRIVATE_KEY` to Vercel env** — unblocks staff/doctor Firebase account creation
3. **Debug verification flow**: user runs the [A3] "ล้าง master_data" button in MasterDataTab to empirically verify Phase 12.11 adapter works for products/courses/staff/doctors
4. **Phase 13 decision** — options A/B/C in `.agents/active.md`

## Resume Prompt

Paste this into a fresh session to continue:

```
Resume from session 2026-04-20 — Phase 12 complete (master = 57da3ba, 2850 tests).

1. Read CLAUDE.md + .claude/rules/00-session-start.md + .agents/AGENTS.md + .agents/active.md
2. Read .agents/sessions/2026-04-20-phase-12-complete.md for full checkpoint
3. Confirm git state: `git log -5` + `git status`
4. User will choose Phase 13 approach:
   - A = stop + wait for next budget cycle
   - B = Phase 13.5 Permission tab-gate only (3h, +30 tests, low risk)
   - C = 13.5 + 13.6 Treatment validator (7h, +70 tests)
5. Before any Phase 13 task: run opd.js forms /admin/<entity> Triangle scan fresh (per rule F)

Outstanding user-triggered actions (NOT auto-run):
- firebase deploy --only firestore:rules (Probe-Deploy-Probe 4 endpoints first)
- Vercel env vars: FIREBASE_ADMIN_CLIENT_EMAIL + _PRIVATE_KEY + optional _BOOTSTRAP_UIDS
- vercel --prod (requires explicit "deploy" authorization per rule 02)
```
