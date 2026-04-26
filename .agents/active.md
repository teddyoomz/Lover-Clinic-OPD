---
updated_at: "2026-04-26 (session 9 EOD — V31 + Phase 14.8-14.10 + master_data → be_* migration)"
status: "master = 9a9cde8 (5884 tests pass, build clean). Production = b2784cf at lover-clinic-93z2j8492 (T3.f saved drafts deploy). 5 commits unpushed-to-prod awaiting user 'deploy' command."
current_focus: "Big bug-fix + feature shipment session: V31 (Firebase Auth orphan recovery), Phase 14.8.B/C signature+PDF, Phase 14.9 audit log + watermark, Phase 14.10 saved drafts + QR + bulk print, plus 6 user-reported bugs all fixed. Final big move: backend 100% be_* (zero master_data mirror reads outside MasterDataTab) + listAllSellers helper resolving legacy ProClinic numeric ids → human names."
branch: "master"
project_type: "node (React 19 + Vite 8 + Firebase + Tailwind 3.4)"
last_commit: "9a9cde8"
tests: 5884
production_url: "https://lover-clinic-app.vercel.app"
last_deploy: "b2784cf via V15 combined (vercel lover-clinic-93z2j8492 + firestore.rules with be_document_prints + be_document_drafts). Pre+post 7/7=200; negative 2/2=403 (rules correctly reject anon to new collections); production smoke 3/3=200; cleanup 4/4=200."
firestore_rules_deployed: "v14 (added be_document_prints + be_document_drafts in 9a9cde8 — NOT YET DEPLOYED to prod)"
bundle: "BackendDashboard ~960 KB (added html2pdf.js lazy + signature_pad eager)"
---

# Active Context

## Objective

Resume from session 8 EOD (master = `f5c91dc`). User authorized "ทำจนจบแบบ
auto mode" + Tier 2/3 features + bug fixes as they came in. Major shipment
this session covering V31 hotfix follow-ups, Phase 14.8-14.10 feature
batch, and the master_data → be_* migration the user demanded after
seeing seller names render as numeric IDs.

## What this session shipped (8 commits, all pushed to master)

```
06d98bd fix(v31): orphan Firebase Auth recovery + credential-change revoke + self-delete protection
62251d3 feat(phase14.8-14.9): signature canvas + PDF export + audit log + watermark
b2784cf feat(phase14.10): saved drafts + QR helper + firestore rule for be_document_drafts
2cb2e36 feat(phase14.10-bulk): BulkPrintModal + CustomerListTab multi-select bulk print
7312679 fix(phase14.10-bis): PDF padding silently dropped (V31-class regression)
5b74bcb fix(phase14.10-bis): SaleTab Gen-receipt + bulk-PDF blank-page fix
3e8b9d8 fix(phase14.10-tris): receipt + bulk-PDF + seller-name + reconciler bundle
9a9cde8 fix(phase14.10-tris): backend 100% be_* — zero master_data reads + listAllSellers
```

## Current state vs production

- master = `9a9cde8` (5884/5884 tests, clean build)
- Production = `b2784cf` (deployed via `lover-clinic-93z2j8492`)
- **5 commits unpushed-to-prod**: 2cb2e36, 7312679, 5b74bcb, 3e8b9d8, 9a9cde8
  Includes: bulk-print UI, PDF padding fix, sellerName fix, M9 reconciler,
  100% backend be_* migration. **Awaiting user "deploy" command.**

## Bugs fixed this session (user-reported, all verified live)

1. **V31** — Firebase Auth orphan on staff delete (login still worked) +
   credential-change without token revoke + self-delete possible →
   3-layer fix + 111 V31 tests
2. **PDF padding lost** — body tag stripped by innerHTML → DOMParser +
   inline body styles + offstage container
3. **Bulk PDF blank** — html2canvas can't snapshot off-screen elements →
   offstage container at viewport origin + windowWidth/Height opts
4. **Bulk PDF extra blank page** — content overflow → height fixed +
   pagebreak avoid-all
5. **Templates missing HN/address** — buildPrintContext didn't expose
   patientAddress/birthdate/bloodGroup/emergency/passport/visitCount/
   nationality → all added; SECTION_1_PATIENT_DECLARATION_ALWAYS now
   includes HN; thai-traditional + fit-to-fly templates show HN+address
6. **Receipt status inverted** — was recomputed from totalPaidAmount vs
   netTotal → resolveSaleStatusLabel reads sale.payment.status
7. **Receipt customer/seller signature dates blank** → pre-fill from
   record createdAt/saleDate
8. **Receipt sellerName blank** — read wrong key (`sellerName` not
   `name`) → fallback chain firstSeller.name → sellerName → lookup → id
9. **Sale modal seller as numeric "614"** — sellers state sourced from
   master_data (stale ProClinic mirror with empty name) → switched
   to listAllSellers (be_staff + be_doctors); verified live: 614→Test
10. **20 backend tabs were reading master_data** — user demanded zero
    mirror reads → migrated all to be_* canonical helpers (listAllSellers,
    listProducts, listCourses, listPromotions, listMembershipTypes,
    listWalletTypes); PV.F.11 directory-walk invariant test guards future
    regressions

## Outstanding user-triggered actions

### Pending production deploy
5 commits at master are NOT live in production:
- 2cb2e36 BulkPrintModal + select-mode in CustomerListTab
- 7312679 PDF padding fix
- 5b74bcb Sale Print receipt button + bulk PDF blank fix
- 3e8b9d8 receipt status + signature data + sellerName + M9
- 9a9cde8 backend 100% be_* migration

When user says "deploy" → run V15 combined (vercel + firebase rules with
full 7-endpoint Probe-Deploy-Probe per Rule B). Firestore rules deploy
needs to ship be_document_prints + be_document_drafts new rules from
b2784cf → 9a9cde8.

### Tier 3 deferred (each = 3-6h focused session)
- T3.e Phase 14.9 email/LINE delivery — needs SMTP + LINE channel config
- T4 Phase 14.4 G5 customer-product-change (course exchange + refund) — XL
- T5.a Phase 14.11 visual template designer — mega XL (~2000 LOC)
- T5.b TFP 3200 LOC refactor — XL technical debt

### P3 deferred
- PDPA suite (consent / audit log / data export / erasure) — substantial
- M9 reconciler — HELPER SHIPPED (recomputeCustomerSummary +
  reconcileAllCustomerSummaries) but NO admin button in UI yet

## Decisions (non-obvious)

1. **PDF wrapper offstage strategy** — 0×0 fixed container at viewport
   origin (not negative left coordinates) so html2canvas snapshots
   correctly. Negative-left positioning was producing blank PDFs in bulk
   mode. (commit 5b74bcb)
2. **Single-page enforcement via pagebreak.mode='avoid-all' + height
   fixed** — html2pdf default split heuristic was producing blank 2nd
   pages even when content fit. Better to crop visible overflow than
   silently emit a blank page. (commit 5b74bcb)
3. **listAllSellers emits row per id alias** — not just the canonical
   staffId/doctorId but also legacy proClinicId numbers. Lets old sales
   saved with "614" still resolve to "Test" without database migration.
   (commit 9a9cde8)
4. **PV.F.11 directory-walk invariant test** — directory-recursive scan
   of src/components/backend that fails CI if anyone re-introduces
   getAllMasterDataItems('staff'|'doctors'). Permanent regression guard
   for the user's "ไม่ต้องการ mirror from master_data อีกสักที่" directive.
5. **MasterDataTab + brokerClient still allowed** — dev-only sync seed
   per Rule H-bis. Not part of production. PV.F.11 explicitly excludes it.

## Key tests added this session (~300 new tests)

- `tests/v31-firebase-auth-orphan-recovery.test.js` — 111 tests (V31.A-N)
- `tests/phase14.8b-signature-canvas-flow.test.js` — 52 tests (SC.A-H)
- `tests/signature-canvas-field-rtl.test.jsx` — 13 tests (RTL mount)
- `tests/phase14.8c-pdf-export-flow.test.js` — 50 tests (PE.A-F + padding fix)
- `tests/phase14.9-audit-log-watermark.test.js` — 41 tests (AL.A-G)
- `tests/phase14.10-saved-drafts-qr.test.js` — 76 tests (SD.A-H)
- `tests/bulk-print-modal-flow.test.js` — 34 tests (BP.A-F)
- `tests/saletab-print-receipt.test.js` — 15 tests (SP.A-D)
- `tests/sale-quotation-print-view-fixes.test.js` — 50 tests (PV.A-F + 11)
- 5 mock-update patches (dfGroups / phase10-* / phase11-wiring /
  phase9-promotion / quotationUi)

## Detail checkpoint

`.agents/sessions/2026-04-26-session9-V31-phase14.8-10-master-data-migration.md`
