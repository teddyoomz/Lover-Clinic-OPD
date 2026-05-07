---
updated_at: "2026-05-08 — V49 picker dropdown empty rows (canonical→legacy shape mismatch class) — 8 victim sites migrated + AV27 invariant locked + 95-assertion live e2e GREEN"
status: "master=pending-commit · prod=c92f924 (V42-V49 NOT yet deployed — 8 V-entries pending one combined vercel --prod)"
branch: "master"
last_commit: "pending V49"
tests: 366
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "c92f924"
firestore_rules_version: 28
storage_rules_version: 2
---

# Active Context

## State
- master = pending V49 commit · prod = `c92f924` (V42 + V43 + V44 + V45 + V46 + V47 + V48 + V49 ALL pending deploy)
- V49 verification: 37/37 V49 unit + 95/95 live admin-SDK e2e + 44/44 adjacent regression + preview_eval against real prod Firestore (349 courses + 607 products + 4 promos shape-correct) = **+176 V49 points GREEN**
- V42-V48 cumulative: 366/366 V34-V48 unit + 698 e2e verification points + AV20-AV27 invariant set COMPLETE
- 2 poisoned batches migrated on prod via V46 backfill (LC-26000006 PRP/Stapple cluster) + 3 customer.courses[] entries restamped via V43 backfill — both audit-doc'd
- V49 e2e audit doc emitted: `be_admin_audit/v49-e2e-1778174951960-167t6dnz`

## What this session shipped (V49)

User-reported: "บั๊คใน modal หน้าสร้างและแก้ไข โปรโมชั่น มองไม่เห็นคอร์สหรือสินค้าใดๆใน search dropdown เลย" — PromotionFormModal dropdowns rendered empty rows with `+` and `0 ฿`.

**Root cause**: Phase 14.10-tris (2026-04-26) migrated 8 UI pickers from `master_data/*` (legacy shape) to `be_courses`/`be_products`/`be_promotions` (canonical shape) WITHOUT updating field-name reads. Legacy fields (`name`/`price`/`category`/`products`/`unit`) ALL `undefined` on prod (verified via diag script on real Firestore).

**Fix (architectural)**:
1. Exported `beProductToMasterShape` + `bePromotionToMasterShape` from `backendClient.js` (were private — V36 lesson reaffirmed)
2. NEW `listCoursesForPicker` / `listProductsForPicker` / `listPromotionsForPicker` exports in `scopedDataLayer.js` — auto-apply canonical→legacy adapter; listCoursesForPicker pre-builds productLookup so sub-products inherit accurate units
3. Migrated 8 victim sites: PromotionFormModal · DfGroupFormModal · QuotationFormModal · ExchangeCourseModal · CustomerDetailView (ProductExchangeModal sub-modal) · MovementLogPanel · StockSeedPanel · VendorSalesTab
4. Added **AV27** audit invariant + V49 V-entry + 12-category prof-grade test bank (37 assertions) + 5-phase live admin-SDK cross-branch e2e (95/95 PASS, 9 TEST-V49 fixtures × 3 branches × 8 assertions + cleanup zero orphans + audit-doc)

## Next action
**Deploy** — `vercel --prod` after user "deploy" auth (V18). 8 V-entries committed-not-deployed (V42-V49). NO data migration needed for V49 (forward-defense — adapter applies at runtime).

## Pre-existing failures (NOT V49)
Confirmed via stash-test against pre-V49 master HEAD: 5 tests fail without V49 changes — `bsa-task6-ui-imports.test.js T6.1` (TFP dynamic-import of backendClient.js missing audit-branch-scope annotation) + `phase-17-2-septies-tfp-schema-reader.test.js S3.1-3.4` (block-extraction regex returns wrong slice). Both unrelated to V49; deferred for separate fix.

## Outstanding (user-triggered)
- 🚨 V42-V49 `vercel --prod` (V18 — explicit "deploy" THIS turn)
- TFP audit-branch-scope annotation + phase-17-2-septies block-regex fix (5 pre-existing test failures)
- H-bis ProClinic full strip (deferred from prior sessions)
- Hard-gate Firebase custom claim (deferred)
- /audit-all pre-release pass (recommended before next big release)
