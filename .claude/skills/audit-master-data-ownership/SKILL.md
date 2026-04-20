---
name: audit-master-data-ownership
description: Audit Phase 11 Master Data Suite — every master-data CRUD (product-groups/units/medical-instruments/holidays/branches/permission-groups) stores in OUR Firestore (`be_*`), never writes back to ProClinic, uses crypto-random ids, and exposes pure validators. Enforces Rule H (data ownership) from `.claude/rules/00-session-start.md`.
user-invocable: true
allowed-tools: "Read, Grep, Glob, Bash"
---

# Audit: Master Data Ownership (Phase 11)

## Context

**Rule H** (`.claude/rules/00-session-start.md`): ALL master data lives in OUR Firestore; ProClinic sync = seed-only; every master-data entity gets a CRUD UI backed by `be_*`; ProClinic-origin ids (products/staff/doctors/courses) stay stable but categorization/units/instruments/holidays/branches/permissions are OWNED locally.

**Scope**: Phase 11 collections — `be_product_groups`, `be_product_units`, `be_medical_instruments`, `be_holidays`, `be_branches`, `be_permission_groups` — plus their validators, tabs, and modals.

**Related audits**: `audit-backend-firestore-only` (Rule E) · `audit-anti-vibe-code` (Rules C1-C3) · `audit-firestore-correctness`.

## Invariants (MO1-MO10)

### MO1 — Every be_* master-data collection has a Firestore rule entry
```bash
grep -E "match /be_(product_groups|product_units|medical_instruments|holidays|branches|permission_groups)" firestore.rules
```
**Expected**: 6 matches, each with `isClinicStaff()` gate (not `if true`). Missing any = Rule B trigger + feature broken.

### MO2 — No writes back to ProClinic from any master-data tab
Whitelist of allowed broker consumers in `src/components/backend/` = `MasterDataTab.jsx`, `CloneTab.jsx`, `CustomerDetailView.jsx` (pre-existing sync flows).
```bash
grep -rn "brokerClient\|/api/proclinic/" \
  src/components/backend/ProductGroup*.jsx \
  src/components/backend/ProductUnit*.jsx \
  src/components/backend/MedicalInstrument*.jsx \
  src/components/backend/Holiday*.jsx \
  src/components/backend/Branch*.jsx \
  src/components/backend/PermissionGroup*.jsx \
  src/lib/productGroupValidation.js \
  src/lib/productUnitValidation.js \
  src/lib/medicalInstrumentValidation.js \
  src/lib/holidayValidation.js \
  src/lib/branchValidation.js \
  src/lib/permissionGroupValidation.js 2>/dev/null | grep -v '^\\s*//' | grep -v '\\*'
```
**Expected**: empty. Comments that merely mention the word "brokerClient" (e.g. "Rule E: no brokerClient") are tolerated; only `import`/`from`/`fetch` statements fail the audit.

### MO3 — Every master-data entity uses `generateMarketingId(<prefix>)` (crypto-random id)
Required prefixes: `GRP`, `UNIT`, `INST`, `HOL`, `BR`, `ROLE`.
```bash
grep -rnE "generateMarketingId\\('(GRP|UNIT|INST|HOL|BR|ROLE)'\\)" src/components/backend/
```
**Expected**: each prefix present in its corresponding FormModal. `Math.random` anywhere in these files = **violation**:
```bash
grep -rn "Math\\.random" \
  src/components/backend/ProductGroup* \
  src/components/backend/ProductUnit* \
  src/components/backend/MedicalInstrument* \
  src/components/backend/Holiday* \
  src/components/backend/Branch* \
  src/components/backend/PermissionGroup*
```
**Expected**: empty.

### MO4 — Every validator is pure (no React, no Firestore imports)
```bash
grep -En "react|firebase|firestore|brokerClient|backendClient" \
  src/lib/productGroupValidation.js \
  src/lib/productUnitValidation.js \
  src/lib/medicalInstrumentValidation.js \
  src/lib/holidayValidation.js \
  src/lib/branchValidation.js \
  src/lib/permissionGroupValidation.js
```
**Expected**: empty. Validators must be pure (testable without jsdom/firebase emulator).

### MO5 — Every CRUD set in backendClient.js covers list/get/save/delete
```bash
for entity in ProductGroup ProductUnitGroup MedicalInstrument Holiday Branch PermissionGroup; do
  echo "=== $entity ==="
  grep -cE "export async function (list|get|save|delete)${entity}s?\\(" src/lib/backendClient.js
done
```
**Expected**: each entity shows `4` (list + get + save + delete). Missing any = incomplete CRUD.

### MO6 — Every save fn runs validator + normalizer (via dynamic import)
Prevents Firestore from storing shapes the UI doesn't constrain. Applies to Phase 11.3+ (productUnit, medicalInstrument, holiday, branch, permissionGroup) — 11.2 was extracted before the pattern landed.
```bash
for fn in saveProductUnitGroup saveMedicalInstrument saveHoliday saveBranch savePermissionGroup; do
  echo "=== $fn ==="
  grep -A 8 "export async function $fn" src/lib/backendClient.js | grep -cE "normalize|validate"
done
```
**Expected**: each fn shows at least `2` (normalize + validate imports).

### MO7 — Every CRUD tab reuses MarketingTabShell (Rule C1 — 9 tabs total)
```bash
grep -lE "import.*MarketingTabShell" src/components/backend/*.jsx | wc -l
```
**Expected**: **≥ 9** (PromotionTab + CouponTab + VoucherTab + 6 Phase-11 tabs).

### MO8 — Every form modal reuses MarketingFormShell (Rule C1)
```bash
grep -lE "import.*MarketingFormShell" src/components/backend/*FormModal.jsx | wc -l
```
**Expected**: **≥ 9** (3 marketing + 6 Phase-11 modals).

### MO9 — Every date input uses DateField (rule 04, never raw `<input type="date">`)
```bash
grep -En '<input[^>]*type=["\x27]date["\x27]' \
  src/components/backend/ProductUnitFormModal.jsx \
  src/components/backend/MedicalInstrumentFormModal.jsx \
  src/components/backend/HolidayFormModal.jsx \
  src/components/backend/BranchFormModal.jsx \
  src/components/backend/PermissionGroupFormModal.jsx 2>/dev/null
```
**Expected**: empty.

### MO10 — Status enum consistency — every master-data validator exports `STATUS_OPTIONS` with at least `ใช้งาน | พักใช้งาน`
```bash
for f in productGroup productUnit medicalInstrument holiday branch permissionGroup; do
  grep -A 2 "STATUS_OPTIONS" src/lib/${f}Validation.js | head -3
done
```
**Expected**: every file contains both `ใช้งาน` and `พักใช้งาน`. Drift (e.g. one file using `active` English) = **violation**.

## When to run

- Before every Phase 11.x commit
- Before any release touching `src/components/backend/{ProductGroup,ProductUnit,MedicalInstrument,Holiday,Branch,PermissionGroup}*` or their validators
- As part of `/audit-all` Tier B

## Failures → what to do

| Invariant | Failure | Fix |
|---|---|---|
| MO1 | Missing firestore.rules entry | Add rule + Rule B probe-deploy-probe |
| MO2 | broker/proclinic import in Phase-11 file | Remove import; refactor to `be_*` Firestore only |
| MO3 | Math.random or missing crypto prefix | Use `generateMarketingId(<PREFIX>)` |
| MO4 | Validator imports react/firebase | Move to component; keep validator pure |
| MO5 | Missing CRUD fn | Add list/get/save/delete |
| MO6 | save fn doesn't call normalize+validate | Import both dynamically; guard Firestore shape |
| MO7 / MO8 | Forked shell instead of reuse | Delete custom shell, import MarketingTabShell/FormShell |
| MO9 | Raw `<input type="date">` | Replace with `<DateField/>` |
| MO10 | Status enum drift | Align on `['ใช้งาน', 'พักใช้งาน']` frozen array |
