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

## Phase 26.1 — Editor-attribution modal (2026-05-13 — same day)

Follow-up sub-phase to Phase 26.0. 3 items shipped:

### A. V12 multi-reader-sweep fix at CDV summary mapper

Phase 26.0e correctly added `status: t.status || null` to `rebuildTreatmentSummary` (the writer in `backendClient.js`) so customer.treatmentSummary stored in Firestore DOES carry status. But the **READER** at `src/components/backend/CustomerDetailView.jsx:432-442` was overlooked — the in-component useMemo recomputes summary locally from `treatments[]` and stripped top-level fields. Result: `paginatedTreatments` had no `status` → chip never rendered. Phase 26.1a fixed with a 1-line addition (plus 3 editor fields for forward-prep).

This is the V12 reader-sweep pattern: every writer fix MUST be paired with a sweep of every reader. Tests D5.1 lock the contract permanently.

### B. Top-right "ยืนยันการรักษา" button removed

TFP:2888-2893 (sticky header) — user reported non-functional; removed. Bottom save button at TFP:4816+ is the canonical save path.

### C. NEW editor-attribution modal

Trigger: `isEdit && saveMode === 'staff' && !editorContext`. Doctor-save and create-mode bypass.

`EditAttributionModal` (NEW component at `src/components/backend/EditAttributionModal.jsx`) is the 2nd member of the "pick a person before action" pattern family (1st = `ActorConfirmModal` for stock state-flip confirmations). Rule of 3 not yet reached.

Schema additions on `be_treatments` (additive — no migration):

| Field | Type | Set when | Display |
|---|---|---|---|
| `editedBy` | uid string | modal-confirmed staff edit-save | (not displayed; ref only) |
| `editedByName` | display name | same | CDV row meta inline + TimelineModal mirror (future) |
| `editedByRole` | 'doctor' / 'assistant' / 'staff' | same | "(แพทย์)" / "(ผู้ช่วย)" / "(พนักงาน)" via ROLE_LABEL_TH |
| `editedAt` | Timestamp | same | (not displayed; audit trail) |

Overwrite-on-each-edit (no history array — YAGNI). Future "edit log" feature can extend.

### handleSubmit signature evolution

| Phase | Signature |
|---|---|
| Pre-26.0 | `async ()` |
| 26.0a | `async (eventOrSaveMode)` |
| 26.1 | `async (eventOrSaveMode, options = {})` |

Defensive coercion preserved across all phases. `options.editorContext` plus the internal re-invoke object form `{saveMode, editorContext}` are the Phase 26.1 additions.

### Files (Phase 26.1)

Source (4 modified + 1 NEW):
- `src/components/backend/EditAttributionModal.jsx` (NEW — 176 LOC)
- `src/components/backend/CustomerDetailView.jsx` (summary mapper + ROLE_LABEL_TH + row meta)
- `src/components/TreatmentFormPage.jsx` (button removal + signature ext + state + mount + v26StatusPatch ext)
- `src/lib/backendClient.js` (top-level extraction × 2 + rebuildTreatmentSummary ext)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV37 ext)

Tests:
- `tests/edit-attribution-modal-rtl.test.jsx` (NEW — E1-E5)
- `tests/phase-26-0-doctor-save-source-grep.test.js` (G3 block: G3.1-G3.6)
- `tests/phase-26-0-status-display-rtl.test.jsx` (D5 block: D5.1-D5.4)
- `tests/phase-26-0-doctor-save-flow-simulate.test.js` (F9 block: F9.1-F9.5)
- `tests/audit-branch-scope.test.js` (AV37.9-AV37.11 + AV37.1 V21 fixup)
- `tests/tf3-tfp-a11y-coverage.test.jsx` (TF3.A.6 V21 fixup window 2500→4000)

### Test count delta

Phase 26.0 final: 8297. Phase 26.1 final: **8320 + 1 skipped** (+23 net).

10 task commits across 3 sub-phases (26.1a, 26.1b, 26.1c):
- `0af6a65` Task 1 — CDV summary mapper fix + remove top-right button
- `97a50df` Task 2 — EditAttributionModal + E1-E5
- `7e4f88a` Task 3 — handleSubmit signature ext (G3.4-G3.5)
- `476304d` Task 4 — v26StatusPatch + backendClient ext (G3.6 + D5.4)
- `6b3f768` Task 5 — TFP modal state + mount + wire (G3.1-G3.3)
- `550b771` Task 6 — CDV row meta + ROLE_LABEL_TH (D5.1-D5.3)
- `afe37a9` Task 7 — F9 flow-simulate (5 tests)
- `559d0cb` Task 8 — AV37.9-AV37.11 + SKILL.md
- (Task 9 — full vitest + build verify)
- (Task 10 — this commit)

## See also

- Spec Phase 26.0: `docs/superpowers/specs/2026-05-13-doctor-save-and-admin-finalize-mode-design.md`
- Plan Phase 26.0: `docs/superpowers/plans/2026-05-13-phase-26-0-doctor-save.md`
- **Spec Phase 26.1**: `docs/superpowers/specs/2026-05-13-phase-26-1-tfp-polish-editor-attribution-design.md`
- **Plan Phase 26.1**: `docs/superpowers/plans/2026-05-13-phase-26-1-tfp-polish-editor-attribution.md`
- Phase 25.0c lockedChannel: `concepts/appointment-15min-and-4types.md`
- Phase 21.0 locked-X family: spec history at `docs/superpowers/specs/2026-05-08-walk-in-5th-type-design.md` (referenced)
