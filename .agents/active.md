---
updated_at: "2026-05-13 — Phase 26.0 Doctor-Save complete (NOT YET DEPLOYED)"
status: "master=13b9551 · prod=ccef3c2 · 10 commits ahead · 8297 passed · build clean"
branch: "master"
last_commit: "fix(Phase 26.0-test-fixups): V21-class regex updates for 3 stale tests post Task 2"
tests: 8297
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `13b9551` · prod = `ccef3c2` (10 commits ahead — Phase 26.0 NOT YET DEPLOYED)
- 8297/8298 tests passed + 1 skipped (0 Phase 26.0 regressions; bsa-task7-h-quater-fix flake no longer surfaced in this run)
- Rule of 3 architectural family extended: `saveMode` joins `lockedCustomer` + `lockedAppointmentType` + `lockedChannel` as 4th member of payload-shape-routing pattern on TFP/AppointmentFormModal

## What this session shipped
- **Phase 26.0 — Doctor-Save (บันทึกสำหรับแพทย์) + Admin Finalize-Mode** (10 commits 26.0a..26.0g-fixups):
  - 26.0a `c54c63d` — Scaffold: auth import + canAddNewItems flag + saveMode defensive coercion
  - 26.0b `3605eaf` + `db8da4d` + `dad99bb` — handleSubmit gates (8 sites) + status/recordedBy/recordedAt stamping + 2 fixups (spec § 5.1.C edit-mode preserve + V21-class S2.5 regex)
  - 26.0c `7b584e2` — UI gates: canAddNewItems replaces !isEdit at 5+ sites (Pattern α + β)
  - 26.0d `85e1a9e` — Doctor-save button under OPD Card + edit-mode amber banner
  - 26.0e `034c866` — Status chips in CustomerDetailView + TreatmentTimelineModal + rebuildTreatmentSummary preserves status
  - 26.0f `1b0fc47` — AV37 audit invariant + 8 sub-tests in audit-branch-scope.test.js
  - 26.0g `b0e1573` — Rule I flow-simulate F1-F8 (19 assertions)
  - 26.0-test-fixups `13b9551` — 3 V21-class regex updates (TF3.A.6 signature + V36.J.1 payload var + V50.F1.12 active.md sliding window)
- Spec: `docs/superpowers/specs/2026-05-13-doctor-save-and-admin-finalize-mode-design.md` (`2092f65`)
- Plan: `docs/superpowers/plans/2026-05-13-phase-26-0-doctor-save.md` (`bb2ee23`)
- Wiki: NEW `wiki/concepts/treatment-status-and-doctor-save.md` + log appended
- AV37 invariant + 8 sub-tests; 3 NEW Phase 26.0 test files (~90 new assertions across G1+G2+D1+D2+D3+D4+F1-F8+AV37.x)
- Full suite: 8242 baseline → 8297 + 1 skipped (+55 net, 0 regressions)

## Next action
**Idle** — Phase 26.0 implementation complete; awaiting user `deploy` authorization to ship combined `vercel --prod` + `firebase deploy --only firestore:rules` (rules unchanged from `1da05bb` but Rule V15 mandates combined per directive).

## Outstanding user-triggered actions
- **Pending user authorization**: deploy Phase 26.0 to production (10 commits ahead)
- (Optional, unchanged) `scripts/probe-deploy-probe.mjs` probes 2/3/4 false-positive trim (V50-stripped collections)
- (Optional, unchanged) `bsa-task7-h-quater-fix` parallel-run flake (passes standalone)

## Institutional memory anchors
- **Phase 26.0 — `saveMode` arg = 4th locked-field family member** on TFP/AppointmentFormModal. Future locked-X / save-mode props MUST mirror: defensive coercion at entry + explicit gates at every downstream site + AV invariant + flow-simulate F-tests + source-grep regression.
- **Doctor-save asymmetric flow** — records OPD/vitals/charts/meds/DF only; SKIPS course-items/consumables/purchasedItems/auto-sale. Admin's normal save unlocks via `canAddNewItems = (mode==='create') || (loadedTreatmentStatus === 'doctor-recorded')`. Meds (stockType 7) KEPT sanctioned exception per Q2.
- **`status` field on be_treatments** — NEW additive field; legacy treatments stay `status: undefined` (no chip = "completed"). `'doctor-recorded'` set on doctor-save; cleared via `deleteField()` on admin finalize. `recordedBy` + `recordedAt` preserved across admin finalize as forensic trail.
- **rebuildTreatmentSummary** now writes `status: t.status || null` so CustomerDetailView + TreatmentTimelineModal chips have data source.
- **AV37** audit invariant locks the architectural contract: any new deduction/sale-create call site in TFP handleSubmit MUST be saveMode-gated; AV37 source-grep enforces permanently.
- (Carried) Phase 25.0c `lockedChannel` prop pattern (3rd member of family).
- (Carried) `_apptHubStyles.js` (V64-fix11) shared module.
- (Carried) `customerNavigation.js` Phase 15.7-septies pattern.
- (Carried) Iron-clad rules A-P + BSA invariants BS-1..16 + AV1-AV30 + AV32-AV37 + CB-1..5.
