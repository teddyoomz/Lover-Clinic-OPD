---
tags: [treatment, status, doctor-save, phase-26-0, locked-x-family]
date: 2026-05-13
source-count: 1
---

# Treatment Status & Doctor-Save Pattern

## Overview

Phase 26.0 (2026-05-13) introduced an **asymmetric save flow** on `TreatmentFormPage`: the canonical "บันทึก" button writes the full treatment (deductions + auto-sale + linkages), but a NEW **"บันทึกสำหรับแพทย์"** button records OPD/vitals/charts/meds/DF only and defers the inventory-touching pieces to admin.

This solves a real clinical workflow: doctors who finish OPD examinations need to record their findings + medications + their own DF without waiting for admin to populate course-items / consumables / sale info. Admin later opens edit-mode on the doctor-recorded treatment to finalize.

## Status semantics

| Status value | Meaning | UI signal |
|---|---|---|
| `undefined` | Legacy treatment OR admin-finalized doctor-recorded treatment | No chip |
| `'doctor-recorded'` | Doctor saved; admin must finalize | Amber chip "แพทย์ลงบันทึก" |

`status` field on `be_treatments/{id}`:
- Set on doctor-save (`saveMode === 'doctor'`)
- Cleared on admin's normal save via Firestore `deleteField()` sentinel
- `recordedBy` (firebase uid) + `recordedAt` (serverTimestamp) **preserved** across admin finalize as forensic trail

The `deleteField()` clearing keeps the doc shape minimal (cleaner than setting `null`) so the absence of a status field naturally means "no further action needed" in queries + UI.

## What doctor-save records

- ✅ OPD card text (symptoms, diagnosis, treatmentInfo, treatmentPlan, treatmentNote, additionalNote)
- ✅ Vitals, blood type, congenital disease, drug allergy
- ✅ Treatment history, med-cert info
- ✅ Doctor fees (`doctorFees` + DF entries)
- ✅ Medications (`medications[]`) — stock deduction type 7 fires (sanctioned exception per Q2 brainstorming — doctor prescribes meds for the patient)
- ✅ Images, lab items, treatment files, chart canvas
- ✅ Status + recordedBy + recordedAt audit stamps

## What doctor-save SKIPS

- ❌ Course-items deduction (treatmentItems)
- ❌ Consumables stock deduction (type 6)
- ❌ Course/promotion purchases (purchasedItems)
- ❌ Auto-sale creation chain (createBackendSale, deductWallet, earnPoints, applyDepositToSale, assignCourseToCustomer)
- ❌ Edit-mode sale sync

Admin completes these via normal save when finalizing.

## Edit-mode unlock — `canAddNewItems` flag

```js
const canAddNewItems = (mode === 'create') || (loadedTreatmentStatus === 'doctor-recorded');
```

This single derived flag replaces every `!isEdit && <AddBtn>` gate in TFP at 5+ UI sites:
- Medication add buttons (Pattern α: show/hide)
- Medication grid editable layout swap (Pattern β: branch-swap editable vs read-only)
- Consumable add button (Pattern α)
- Consumable grid swap (Pattern β)
- Course/Purchase items picker trigger (Pattern α)

Effect: when admin opens TFP to edit a doctor-recorded treatment, UI behaves like CREATE mode (admin can add ANY missing pieces). Legacy edits (`status=undefined`) remain locked per existing TFP behavior — backward-compat preserved.

`isEdit` references in save-path branching, header banner text ("สร้างการรักษา" vs "แก้ไขการรักษา"), save-button label, and empty-state placeholders are NOT replaced — they're semantically tied to mode, not add-capability.

## Architectural pattern — Approach A1

Spec § 5 brainstorming chose **A1 — single `handleSubmit(saveMode)` with explicit gates** over A2 (separate handler — too much refactor) and A3 (filter payload — implicit-skip risk).

```js
const handleSubmit = async (eventOrSaveMode) => {
  const saveMode = (eventOrSaveMode === 'doctor') ? 'doctor' : 'staff';
  if (eventOrSaveMode?.preventDefault) eventOrSaveMode.preventDefault();
  // ... validation ...

  // V26.0 status routing + forensic trail
  const v26StatusPatch = saveMode === 'doctor' ? {
    status: 'doctor-recorded',
    ...(isEdit && loadedTreatmentStatus === 'doctor-recorded' ? {} : {
      recordedBy: auth.currentUser?.uid || null,
      recordedAt: serverTimestamp(),
    }),
  } : { status: deleteField() };

  const finalBackendDetail = { ...backendDetail, ...v26StatusPatch };

  // 6 gate sites in handleSubmit:
  if (saveMode !== 'doctor') { /* course validation */ }
  if (saveMode !== 'doctor') { /* reverseCourseDeduction + deductCourseItems */ }
  if (saveMode !== 'doctor') { /* deductStockForTreatment consumables type 6 */ }
  /* deductStockForTreatment medications type 7 — KEPT UNGATED per Q2 */
  if (saveMode !== 'doctor' && hasSale && !isEdit) { /* createBackendSale chain */ }
  if (saveMode !== 'doctor') { /* edit-mode sale sync */ }
};
```

The 8 explicit gate sites (plan called for 6; implementer found 2 more) are mechanically auditable via AV37 source-grep regression.

## Rule of 3 link — `saveMode` joins the lockedX family

`saveMode` is the **4th member** of the architectural pattern family established on TFP/AppointmentFormModal:

| Member | Component | Phase | Pattern |
|---|---|---|---|
| `lockedCustomer` | AppointmentFormModal | Phase 21.0 | Defensive coercion + payload-override + UI lock-chip |
| `lockedAppointmentType` | AppointmentFormModal | Phase 21.0 | Same |
| `lockedChannel` | AppointmentFormModal | Phase 25.0c | Same |
| `saveMode` | **TreatmentFormPage** | **Phase 26.0** (this) | Defensive coercion + explicit gates at every site |

The shared pattern: **payload-shape-routing via single argument with explicit gate sites + AV invariant + source-grep regression test**.

Future "save-mode" / "lockedX" variants MUST mirror:
1. **Defensive coercion at entry** — `safeX = ALLOWED.includes(x) ? x : null` OR `mode = (arg === expected) ? expected : default`
2. **Explicit gates at EVERY downstream call site** — never rely on implicit "empty array → no-op" behavior
3. **AV audit invariant** locking the pattern (AV37 for Phase 26.0)
4. **Flow-simulate F-tests** for the round-trip (Rule I)
5. **Source-grep regression** for the gates (G-tests)

## Backward compat

- Legacy treatments (~5000+) have `status: undefined` → no chip → behave like "completed". **NO data migration needed.**
- `firestore.rules` unchanged — `be_treatments` already allows arbitrary staff write.
- No Rule B Probe-Deploy-Probe trigger; no Rule M data ops.

## Files

Source (4):
- `src/components/TreatmentFormPage.jsx` — primary (saveMode + gates + canAddNewItems + button + banner)
- `src/components/backend/CustomerDetailView.jsx` — amber chip on treatment cards
- `src/components/backend/TreatmentTimelineModal.jsx` — amber chip in row header
- `src/lib/backendClient.js` — top-level status extraction + rebuildTreatmentSummary preserves status

Tests (3 NEW):
- `tests/phase-26-0-doctor-save-source-grep.test.js` — G1 + G2 (handleSubmit gates + UI canAddNewItems)
- `tests/phase-26-0-status-display-rtl.test.jsx` — D1 + D2 + D3 + D4 (button + banner + chips + summary)
- `tests/phase-26-0-doctor-save-flow-simulate.test.js` — F1-F8 Rule I full-flow

Audit:
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV37 invariant entry
- `tests/audit-branch-scope.test.js` — AV37.1-AV37.8 sub-tests

3 V21-class test fixups (Task 8 verification):
- `tests/tf3-tfp-a11y-coverage.test.jsx` — TF3.A.6 (handleSubmit signature evolution)
- `tests/v36-treatment-skip-fail-loud.test.js` — J.1 (backendDetail → finalBackendDetail)
- `tests/v50-phase3-cross-branch-booking-flow-simulate.test.js` — F1.12 (active.md sliding window)

## Test count delta

Baseline: 8242 (Phase 25.0). Phase 26.0 final: **8297 passed + 1 skipped** (+55 net).

10 commits across 9 tasks:
- `c54c63d` Task 1 scaffold
- `3605eaf` + `db8da4d` + `dad99bb` Task 2 gates + spec-fixup + V21-fixup
- `7b584e2` Task 3 UI gates
- `85e1a9e` Task 4 button + banner
- `034c866` Task 5 chips
- `1b0fc47` Task 6 AV37
- `b0e1573` Task 7 flow-simulate F1-F8
- `13b9551` Task 8 V21 test fixups
- (Task 9 — this commit)

## See also

- Spec: `docs/superpowers/specs/2026-05-13-doctor-save-and-admin-finalize-mode-design.md`
- Plan: `docs/superpowers/plans/2026-05-13-phase-26-0-doctor-save.md`
- Phase 25.0c lockedChannel: `concepts/appointment-15min-and-4types.md`
- Phase 21.0 locked-X family: spec history at `docs/superpowers/specs/2026-05-08-walk-in-5th-type-design.md` (referenced)
