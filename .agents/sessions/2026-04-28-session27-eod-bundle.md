# 2026-04-28 EOD (session 27) — V35.3-ter + V33-customer-id + UX polish bundle

## Summary

Day-long arc, 12 commits, +144 tests. Course-row "ไม่ตัดสต็อค" flag (V15 #5) → 3 same-day stock multi-reader-sweep iterations (V35.3/bis/ter caught one layer at a time via preview_eval) → TFP grouping → SaleTab buy fix → branch-aware PDFs → V33-customer-id-resolution (5th V12 occurrence). All shipped + pushed; awaiting V15 #7 deploy auth.

## Current State

- master = `eae90c9` · production = `c36888e` (V15 #4 LIVE) · 12 commits unpushed-to-prod
- **2927/2927** focused vitest pass · build clean · working tree clean
- 13 new test files added across the day; all locked via source-grep + preview_eval
- 1 V-entry (V12 5th occurrence) reinforced into institutional memory

## Commits

```
2149eae feat(course+stock): "ไม่ตัดสต็อค" course flag + treatment silent-skip fix
f0e3042 fix(stock): treatment shortfall emits silent-skip not throw — V15 #5 hotfix
aa760b1 fix(stock): V35.3 — _deductOneItem missing includeLegacyMain (3rd V12 miss)
c2fe55a feat(treatment): group "ข้อมูลการใช้คอร์ส" rows by purchase event
397d9ff fix(stock): V35.3-bis — drop branchId from batchFifoAllocate (real fix)
a16c700 fix(treatment): BCC isAddon-key discriminator
023c1a6 fix(sale): SaleTab buy modal field-name + skipStockDeduction propagation
c48eda4 fix(stock): V35.3-ter — sale-context auto-init + silent-skip parity
409ed8d ui(receipt): rename heading + polish clinic header + fix badge alignment
9ffbe14 feat(sale+pdf): branch-aware clinic info + sales-list inline items + OPD amount visible
f206887 ui(sale+pdf): redesign sales-list items column + concat clinic name with branch
eae90c9 fix(customer+appt): V33-customer treatment-save + assistants filter + OPD Card label
```

## Files Touched

- `src/lib/courseValidation.js` — skipStockDeduction in normalize/validate/empty
- `src/components/backend/CourseFormModal.jsx` — checkbox UI on main + sub-items
- `src/lib/treatmentBuyHelpers.js` — propagate flag through buy chain + buildCustomerCourseGroups + addon-key discriminator
- `src/lib/backendClient.js` — _ensureProductTracked helper + _deductOneItem decision tree (V35.3/bis/ter) + assignCourseToCustomer flag write + beCourseToMasterShape flag propagation
- `src/components/backend/StockSeedPanel.jsx` — V35.3 includeLegacyMain
- `src/components/TreatmentFormPage.jsx` — toggleCourseSelection skipStockDeduction propagation + customerCourseGroups useMemo + render refactor
- `src/components/backend/SaleTab.jsx` — buy-modal field-name fix (course+product+medication) + รายการขาย column with category dots + amount+badge inline + "จาก OPD Card" label
- `src/components/backend/SalePrintView.jsx` — heading rename "ใบเสร็จ" only + ผู้ออกใบเสร็จ + badge alignment items-center + branch-aware clinic via useEffectiveClinicSettings
- `src/components/backend/QuotationPrintView.jsx` — same polish + remove En subtitle
- `src/components/backend/DocumentPrintModal.jsx` — useEffectiveClinicSettings wrap
- `src/lib/BranchContext.jsx` — NEW mergeBranchIntoClinic helper + useEffectiveClinicSettings hook + concat clinicName
- `src/pages/BackendDashboard.jsx` — onCreateTreatment/onEditTreatment customer.id fallback
- `src/components/backend/CustomerDetailView.jsx` — single resolved customerId const + 4 listener guards + 3 modal customerId props + ShareModal filter
- `src/components/backend/AppointmentFormModal.jsx` — assistants useMemo filter + empty-state hint
- `api/admin/migrate-courses-skip-stock.js` — NEW backfill endpoint
- `src/lib/migrateCoursesSkipStockClient.js` — NEW client wrapper
- `src/components/backend/PermissionGroupsTab.jsx` — admin migrate button
- 13 new test files: course-skip-stock-deduction · v35-3-deduct-legacy-main-and-multi-reader-sweep · customer-course-groups · sale-tab-buy-mapping · branch-aware-clinic-settings · v33-customer-id-resolution

## Decisions

- D1 — Course skip-stock flag stored at top-level (`mainSkipStockDeduction`) + per-row `skipStockDeduction`; same key name on both layers for mapper simplicity
- D2 — Treatment + sale shortfall both silent-skip (user-confirmed, mirrors V15 #6 hotfix)
- D3 — Auto-init `trackStock=true` for both treatment + sale contexts (single-writer via `_ensureProductTracked`)
- D4 — Listing/grouping addon entries use `__addon__|<courseId>` key so buy-this-visit never merges with legacy ProClinic-cloned entries
- D5 — Branch-aware PDF gen via `useEffectiveClinicSettings` hook (Rule C1 single source) — applied to SalePrintView + QuotationPrintView + DocumentPrintModal
- D6 — Concat clinicName: `<brand> <branch>` (e.g. "Lover Clinic นครราชสีมา") + remove En subtitle from receipts
- D7 — V33-customer-id pattern locked: `customer?.id || customer?.proClinicId` fallback at every reader; resolved const at top of component

Full reasoning: `.claude/rules/v-log-archive.md` (V-entry pending — V12 5th occurrence)

## Next Todo

- Awaiting V15 #7 deploy auth (12 commits)
- Live QA after deploy (8 surfaces — see active.md Outstanding)
- Add V-entry to v-log-archive.md for V12 5th occurrence (V33-customer-id silent failure pattern)

## Resume Prompt

```
Resume LoverClinic — continue from 2026-04-28 EOD (session 27).
Read: CLAUDE.md → SESSION_HANDOFF.md (master=eae90c9, prod=c36888e) →
.agents/active.md → .claude/rules/00-session-start.md → this checkpoint.
Status: 2927/2927 tests pass; 12 commits unpushed-to-prod.
Next: V15 #7 deploy auth.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe.
/session-start
```
