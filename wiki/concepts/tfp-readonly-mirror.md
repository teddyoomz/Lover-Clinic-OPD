---
title: TFP Read-Only Mirror (TreatmentReadOnlyMirror)
type: concept
date-created: 2026-05-13
date-updated: 2026-05-13
tags: [tfp, mirror, read-only, vitals-save, phase-26-2f]
source-count: 1
---

# TFP Read-Only Mirror (TreatmentReadOnlyMirror)

> Phase 26.2f introduced `TreatmentReadOnlyMirror` — a ~947 LOC component that
> mirrors the TreatmentFormPage layout with all inputs disabled, replacing
> `TreatmentReadOnlyPanel` in TFP's split-screen aside. The same phase added a
> `saveMode='vitals'` entry point (5th locked-X family member), a vitals-save
> button, and extended the doctor-save status gate to cover the new
> `'vitalsigns-recorded'` state.

## Overview

`TreatmentReadOnlyPanel` (Phase 26.2) rendered a compact read-only summary of a
historical treatment. For the split-screen aside it was adequate, but it showed a
"card" view rather than a form view — making it hard for the doctor to compare the
historical visit directly against the current form they were filling out.

Phase 26.2f replaced the aside panel with `TreatmentReadOnlyMirror`: a full mirror
of the TFP form layout where every field, section header, and tab matches the live
form, but all inputs are rendered with `disabled` / `readOnly` attributes and no
action buttons exist. The doctor can scroll the mirror alongside the live form to
compare treatments field-by-field.

`TreatmentReadOnlyMirror` is intentionally NOT extracted as a sub-component of
TFP to avoid prop-drilling the entire form state. Instead it accepts a flat
`treatment` doc prop and independently renders the display-only layout. This keeps
the Rule of 3 clean: TreatmentReadOnlyPanel (compact card) and
TreatmentReadOnlyMirror (full mirror) serve different use cases and are maintained
separately.

## TreatmentReadOnlyMirror component

**File**: `src/components/TreatmentReadOnlyMirror.jsx` (~947 LOC)

**Props**:
- `treatment` — raw Firestore `be_treatments` doc (required)
- `branchName` — display string for the branch label (optional)

**AV38 contract** (read-only invariant): same as `TreatmentReadOnlyPanel`.
No `onEditTreatment` / `onDeleteTreatment` props. No `<input>` or `<textarea>`
elements that are not `disabled`. No "บันทึก" in button labels. Lightbox (zoom)
is the only permitted interactive element.

Source-grep regression locks in `tests/v38-av38-treatment-read-only-panel.test.js`
cover both `TreatmentReadOnlyPanel` AND `TreatmentReadOnlyMirror` (shared AV38
contract).

**`extractDisplayString` helper**: Phase 26.2f added `extractDisplayString(val)`
at the top of TreatmentReadOnlyMirror. Firestore populated-object fields (doctor,
assistant) may arrive as `{name: 'X', id: '...'}` objects rather than plain
strings when the doc was saved via a picker that writes the full object. Without
this helper the mirror would render `[object Object]`. The helper:

```js
function extractDisplayString(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') return val.name || val.label || val.displayName || '';
  return String(val);
}
```

All display-only fields in the mirror run through `extractDisplayString`.

## Layout reorder (Phase 26.2f)

TFP's right column previously had **หมายเหตุทั่วไป** (general note) as the
topmost section. Phase 26.2f moved หมายเหตุทั่วไป to the **left column**
(beneath the course-items / consumables section) and placed the **vitals-save
button** in the space it vacated on the right column.

The motivation: the vitals-save button is a primary action for nurses/staff taking
initial measurements; it should be visually prominent on the right side where
action buttons cluster. หมายเหตุทั่วไป is a secondary text field that belongs
with the other note-taking UI on the left.

TreatmentReadOnlyMirror mirrors this reordered layout so the form and the aside
remain in sync.

## Vitals-save (`saveMode='vitals'`) and the locked-X family

Phase 26.2f added a 5th member to TFP's **payload-shape-routing family**:

| # | Locked-X member | Source |
|---|---|---|
| 1 | `lockedCustomer` | Phase 12.x |
| 2 | `lockedAppointmentType` | Phase 14.x |
| 3 | `lockedChannel` | Phase 15.x |
| 4 | `saveMode='doctor'` | Phase 26.0 |
| **5** | **`saveMode='vitals'`** | **Phase 26.2f** |

**Behavior**: when admin/nurse presses the vitals-save button,
`handleSubmit('vitals')` fires. Gates identical to `saveMode='doctor'` (course
items, consumables, purchasedItems, auto-sale all skipped). Additionally stamps:
- `status: 'vitalsigns-recorded'`
- `recordedBy: auth.currentUser.uid`
- `recordedAt: serverTimestamp()`

**`canAddNewItems` extension**: was `mode==='create' || status==='doctor-recorded'`.
Extended to also cover `status==='vitalsigns-recorded'`:

```js
const canAddNewItems =
  mode === 'create' ||
  loadedTreatmentStatus === 'doctor-recorded' ||
  loadedTreatmentStatus === 'vitalsigns-recorded';
```

This means when a doctor opens a treatment that was saved by a nurse (vitals state),
the course-items and consumables sections unlock exactly as they do for
`doctor-recorded`.

## Audit invariants

- **AV37** (extended: `.12`–`.17`): covers `saveMode='vitals'` payload routing,
  `'vitalsigns-recorded'` status stamping, `canAddNewItems` 3-branch gate,
  vitals-save button data-testid, `extractDisplayString` usage in mirror,
  mirror layout order (right column = vitals-save slot, left = หมายเหตุทั่วไป).
- **AV38** (existing): read-only contract for both TreatmentReadOnlyPanel and
  TreatmentReadOnlyMirror. No edit/delete props, no enabled inputs, no save
  buttons.
- **AV39** (NEW): `extractDisplayString` must be called on every populated-object
  field rendered in TreatmentReadOnlyMirror. Direct `{treatment.doctor}` JSX
  without the helper is a violation (`[object Object]` rendering bug class).
  Source-grep anchor: `extractDisplayString(` must appear ≥ 5 times in
  `TreatmentReadOnlyMirror.jsx`.

## File inventory (Phase 26.2f, 11 commits)

| File | Change |
|---|---|
| `src/components/TreatmentReadOnlyMirror.jsx` | NEW ~947 LOC |
| `src/components/TreatmentFormPage.jsx` | vitals-save button, layout reorder, `saveMode='vitals'` gate, `canAddNewItems` 3-branch |
| `src/lib/backendClient.js` | `'vitalsigns-recorded'` status path in `updateTreatment` |
| `tests/phase-26-2f-vitals-save-flow-simulate.test.js` | NEW Rule I flow-simulate |
| `tests/phase-26-2f-mirror-source-grep.test.js` | NEW source-grep regression locks |
| `tests/v38-av38-treatment-read-only-panel.test.js` | Extended to cover mirror |
| `tests/audit-anti-vibe-code.test.js` | AV37.12–.17 + AV39 blocks |
| `.agents/skills/audit-anti-vibe-code/SKILL.md` | AV37 ext + AV39 new |
| `wiki/concepts/tfp-readonly-mirror.md` | THIS FILE |
| `wiki/concepts/treatment-status-and-doctor-save.md` | 3-stage workflow section appended |
| `wiki/log.md` | Phase 26.2f ingest entry |

## See also

- [treatment-status-and-doctor-save.md](treatment-status-and-doctor-save.md) — 3-stage status machine (vitals → doctor → admin)
- [tfp-split-screen-history.md](tfp-split-screen-history.md) — Phase 26.2 split-screen history (TreatmentReadOnlyPanel, the compact predecessor)
- Source: `docs/superpowers/specs/2026-05-13-phase-26-2f-vitals-save-readonly-mirror-design.md`
- Plan: `docs/superpowers/plans/2026-05-13-phase-26-2f-vitals-save-readonly-mirror.md`

## History

- 2026-05-13 — Created during Phase 26.2f ingest. Covers TreatmentReadOnlyMirror, vitals-save, layout reorder, AV37 ext, AV38 + AV39.
