---
title: TreatmentFormPage (TFP)
type: entity
date-created: 2026-05-05
date-updated: 2026-05-05
tags: [treatment, form, mega-component, branch-scoped, phase-17-0]
source-count: 0
---

# TreatmentFormPage (TFP)

> The treatment creation/edit form. Biggest UI file in the repo (~4900 LOC, 129 useState calls). Wires master-data lookups, course assignment/deduction, stock writes, sale generation, DF rate computation, and customer state — all in one mega-component. Phase 17.0 will fix branch-blind modal caches.

## Overview

TFP is the central form for recording a treatment visit. It's reachable in two modes:
- **Create mode** (`mode='create'`) — admin clicks "สร้างการรักษา" on a customer detail view
- **Edit mode** (`mode='edit'`) — admin clicks "แก้ไข" on a row in the treatment timeline

The component is exported as `default function TreatmentFormPage({ mode, customerId, treatmentId, patientName, patientData, isDark, db, appId, onClose, onSaved, saveTarget })` at [TreatmentFormPage.jsx:294](../../src/components/TreatmentFormPage.jsx). The `saveTarget` prop chooses between two persistence backends:

- `saveTarget='backend'` — writes to OUR Firestore (`be_treatments`, `be_sales`, `be_stock_*`, `be_customers/courses[]`). This is the production path used by `BackendDashboard` since Phase 13.
- `saveTarget='proclinic'` — legacy path that POSTs to ProClinic via `brokerClient` (now DEV-only per Rule H-bis). Still wired for parity but not the production flow.

The UX is modal-heavy. Roughly ten modals live inline in the JSX — medication picker (single + group), consumable picker (single + group), course picker (single + group), DF entry, picture viewer, and a few smaller confirmations. The four "phantom-data modals" listed below are the ones that load master-data lazily on open and CACHE the result in component state — those caches are the Phase 17.0 bug surface.

The form has 119 useState calls counted at the close of Phase 14 ([TreatmentFormPage.jsx:73-78](../../src/components/TreatmentFormPage.jsx) cites this); current count is 129. Every leaf component (`SectionHeader`, `FormSection`, `ActionBtn`, `LabPriceSummary`, `MedPriceSummary`, `VitalsGrid`, etc.) is wrapped in `React.memo` so a keystroke in one input does not re-render the entire 4900-LOC tree ([TreatmentFormPage.jsx:80-195](../../src/components/TreatmentFormPage.jsx)).

## The 4 phantom-data modals (Phase 17.0 context)

Each of these modals loads master-data on first open and caches it in component state. The cache is keyed on a `length > 0` early-return — meaning **once the cache is populated for one branch, switching to another branch does NOT refresh it**. This is the root user-visible symptom Phase 17.0 closes.

| Modal | Opener | State var | Early-return guard | Loads via |
|---|---|---|---|---|
| Medication single | `openMedModal` ([TreatmentFormPage.jsx:1127](../../src/components/TreatmentFormPage.jsx)) | `medAllProducts` ([:479](../../src/components/TreatmentFormPage.jsx)) | `if (medAllProducts.length > 0) return;` ([:1139](../../src/components/TreatmentFormPage.jsx)) | `listProducts()` from scopedDataLayer ([:1144-1146](../../src/components/TreatmentFormPage.jsx)) |
| Medication group | `openMedGroupModal` ([:1243](../../src/components/TreatmentFormPage.jsx)) | `medGroupData` ([:491](../../src/components/TreatmentFormPage.jsx)) | `if (medGroupData.length > 0) return;` ([:1247](../../src/components/TreatmentFormPage.jsx)) | `listProductGroupsForTreatment('ยากลับบ้าน')` ([:1254-1256](../../src/components/TreatmentFormPage.jsx)) |
| Consumable single | `openConsModal` ([:1314](../../src/components/TreatmentFormPage.jsx)) | `consAllProducts` ([:516](../../src/components/TreatmentFormPage.jsx)) | `if (consAllProducts.length > 0) return;` ([:1319](../../src/components/TreatmentFormPage.jsx)) | `listProducts()` from scopedDataLayer ([:1324-1326](../../src/components/TreatmentFormPage.jsx)) |
| Consumable group | `openConsGroupModal` ([:1369](../../src/components/TreatmentFormPage.jsx)) | `consGroupData` ([:521](../../src/components/TreatmentFormPage.jsx)) | `if (consGroupData.length > 0) return;` ([:1373](../../src/components/TreatmentFormPage.jsx)) | `listProductGroupsForTreatment('สินค้าสิ้นเปลือง')` ([:1379-1381](../../src/components/TreatmentFormPage.jsx)) |

The corresponding modal JSX buttons are at [:3538](../../src/components/TreatmentFormPage.jsx) (med-single), [:3660](../../src/components/TreatmentFormPage.jsx) (med-group), [:4294](../../src/components/TreatmentFormPage.jsx) (cons-single), and [:4355](../../src/components/TreatmentFormPage.jsx) (cons-group).

The single-product modals (`openMedModal` / `openConsModal`) currently filter `listProducts()` results by `p.type === 'ยา'` / `p.type === 'สินค้าสิ้นเปลือง'` after fetch. Since `listProducts()` already auto-injects `branchId` through the Layer 2 wrapper, the cache CONTENTS are correct for the branch active at open time — but the cache is never invalidated on branch switch. The group modals (`openMedGroupModal` / `openConsGroupModal`) call [`listProductGroupsForTreatment`](list-product-groups-for-treatment.md), which currently does NOT auto-inject branchId at all (its Layer 2 wrapper is a pass-through). Both bugs combine to give cross-branch data leakage in TFP.

## Key state (grouped by domain)

State is sprawling. The major groups (line ranges approximate):
- **Treatment items / OPD** ([:295-380](../../src/components/TreatmentFormPage.jsx)) — `treatmentItems`, `treatmentDate`, `doctor`, `assistant`, `opdNote`, `vitals`, `bmi`, `chartLines`
- **Course picker** ([:380-470](../../src/components/TreatmentFormPage.jsx)) — `courseModalOpen`, `selectedCourseItems`, `courseRows`, `courseFilters`, `purchasedItems`, `pickedCourseEntries`
- **Medications** ([:470-510](../../src/components/TreatmentFormPage.jsx)) — `medications`, `medModalOpen`, `medAllProducts`, `medGroupData`, `medGroupChecked`, `editingMedIndex`
- **Consumables** ([:510-540](../../src/components/TreatmentFormPage.jsx)) — `consumables`, `consModalOpen`, `consAllProducts`, `consGroupData`, `consGroupChecked`
- **Sale / payment** ([:540-600](../../src/components/TreatmentFormPage.jsx)) — `pmSellers`, `pmChannels`, `paymentDate`, `discountType`, `discount`, `vat`, `useDeposit`, `useWallet`, `usePoints`, `coupons`
- **DF (doctor fee) rates** ([:600-630](../../src/components/TreatmentFormPage.jsx)) — `dfEntries`, `dfModalOpen`, `dfGroups`, `dfStaffRates`
- **Branch-aware writes** ([:24-25](../../src/components/TreatmentFormPage.jsx)) — `useSelectedBranch()` from `BranchContext`, falls back to `'main'` when no provider mounted (defensive — TFP is reachable both inside `BranchProvider` from BackendDashboard AND from AdminDashboard's create-treatment overlay where no provider exists)

## Data flow

1. **Customer load** — `customerId` prop drives a `getDoc(customerDoc)` to populate `patientData` + `customer.courses[]` snapshot ([:501](../../src/components/TreatmentFormPage.jsx) `existingStockSnapshot` is taken at edit-load time so handleSubmit can diff stock changes per V19).
2. **Master-data load** — when `saveTarget === 'backend'` ([:634-657](../../src/components/TreatmentFormPage.jsx)), TFP calls `Promise.all([listDoctors(), listProducts(), listStaff(), listCourses(), listDfGroups(), listDfStaffRates()])` from [scopedDataLayer.js](scoped-data-layer.md) to populate the doctor/staff dropdowns + course picker + DF rate table. This was the H-quater fix landing site.
3. **User fills the form** — vitals, OPD note, treatment items via course picker, medications via med modal, consumables via cons modal. Each modal opens lazily (see "phantom-data modals" above).
4. **Submit (handleSubmit)** — validates required fields with `data-field` registry ([:31-69](../../src/components/TreatmentFormPage.jsx)), then on backend path: writes `be_treatments/{tid}` doc → calls `assignCourseToCustomer` (for newly bought courses) → calls `deductCourseItems` (for course usage) → calls `deductStockForTreatment` (for medication/consumable stock) → creates an auto-sale via `saveBackendSale` if billing total > 0. Each step is branch-aware via `useSelectedBranch()`.

## Branch-scope wiring

Pre-Phase BSA, TFP read master-data via `getAllMasterDataItems('products'/'courses'/'staff'/'doctors')` which read `master_data/*` directly. That violated Rule H-quater (no master_data reads in feature code) and was branch-blind because `master_data/*` is single-source.

Phase BSA Task 7 (commit `6f76ec6`) replaced those calls with `listProducts/listCourses/listStaff/listDoctors` from `scopedDataLayer.js`, which auto-inject `branchId` via the Layer 2 wrapper. See [`scoped-data-layer.md`](scoped-data-layer.md) for the wrapper pattern. The fix landed at [:646-655](../../src/components/TreatmentFormPage.jsx) (load path) and [:1144](../../src/components/TreatmentFormPage.jsx) / [:1324](../../src/components/TreatmentFormPage.jsx) (medication + consumable single-modal openers). The two `listProductGroupsForTreatment` callsites at [:1254](../../src/components/TreatmentFormPage.jsx) and [:1379](../../src/components/TreatmentFormPage.jsx) were also pointed through scopedDataLayer — but the wrapper for that function is currently a pass-through and the underlying Layer 1 implementation is branch-blind. That's the remaining gap Phase 17.0 closes.

Phase 17.0 will additionally add a `useEffect` that watches `selectedBranchId` and resets the four modal caches (`medAllProducts`, `medGroupData`, `consAllProducts`, `consGroupData`) to `[]` so the next open re-fetches against the new branch.

## Cross-references

- Concept: [Branch-Scope Architecture](../concepts/branch-scope-architecture.md)
- Concept: [Rule H-quater](../concepts/rule-h-quater.md)
- Entity: [scopedDataLayer.js](scoped-data-layer.md)
- Entity: [listProductGroupsForTreatment](list-product-groups-for-treatment.md)
- V-entries: V21 (lightbox + close-on-edit at TreatmentTimelineModal interaction with TFP edit page), V13 (full-flow simulate mandate after 3 rounds of buffet/expiry/shadow bugs that helper-only tests missed), V11 (mock-shadowed missing export — `npm run build` mandatory), V12 (shape-migration multi-reader sweep — applies to any TFP shape change consumed by readers)

## Phase 17.2 fix series (2026-05-05)

Four sibling commits closed cross-branch correctness gaps in TFP — all instances of [V12 shape-drift bug class](../concepts/v12-shape-drift.md):

- **17.2-quinquies** (`c76e953`) — Modal data caches leaked across branches. BS-9 cache-reset useEffect at line ~329 missed `buyItems` + `buyCategories` (course/OTC/promotion modal caches). Fix: extend BS-9 to drain those slots + drop `length>0` short-circuits in 5 modal openers + add `SELECTED_BRANCH_ID` to form-data useEffect deps.
- **17.2-septies** (`9046dcf`) — Reader field-name drift. TFP filter+map sites read legacy `p.type` / `p.name` / `p.category` / `p.unit`, but `be_products` and `be_courses` use canonical `productType` / `productName` / `categoryName` / `mainUnitName` / `courseName` / `salePrice` / `courseCategory`. Filter `p.type === 'ยา'` returned 0 of 178 ยา products → empty modals. Fix: every site uses canonical-first fallback. PLUS: branch indicator banner at TFP top header (`data-testid="tfp-branch-indicator"`) shows current branch — diagnostic for both user and Claude.
- **17.2-octies** (`c248c67`) — `isCourseUsableInTreatment` was flat-shape only (`c.qty` string). Call site at line ~1982 passes the GROUPED-shape output from `mapRawCoursesToForm` (`c.products[]`). 3 IV Drip courses for asdas dasd (8/89/26 remaining) all rejected → courses panel empty. Fix: helper accepts both shapes.
- **18.0 family** — Branch Exam Rooms shipped (V15 #19 + V15 #20). TFP modal openers no longer affected (Phase 17.2-quinquies dropped the cache short-circuit so empty branches don't re-show stale data). See [Branch Exam Rooms concept](../concepts/branch-exam-rooms.md).

## History

- 2026-04-26 — V21 lightbox + close-on-edit fixes shipped. The treatment timeline modal had two latent click bugs (image `<a href=data:>` blocked by Chrome + edit button hidden under modal z-100). TFP itself wasn't changed but its z-80 stack relationship was the structural fix.
- 2026-05-04 — Phase BSA Task 7 H-quater fix (commit `6f76ec6`). `getAllMasterDataItems` removed from TFP load path; replaced with `listProducts/listCourses/listStaff/listDoctors` from scopedDataLayer. Single-modal openers also migrated.
- 2026-05-05 — Phase 17.2 quinquies/septies/octies + Phase 18.0 family shipped (V15 #19 + V15 #20). Cross-branch correctness fully restored. Branch indicator banner added at TFP top.
