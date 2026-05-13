---
title: TFP Split-Screen History + Customer Note
type: concept
date-created: 2026-05-13
date-updated: 2026-05-13
tags: [tfp, split-screen, history, read-only, phase-26-2, customer-note]
source-count: 1
---

# TFP Split-Screen History + Customer Note

> Phase 26.2 added a 5-tab history strip to TreatmentFormPage (TFP) that shows the last 5 cross-branch recent treatments for the current customer. On lg+ screens the form splits 50/50 with the selected treatment displayed in a read-only right panel; on mobile a modal fallback is used. A new `TreatmentReadOnlyPanel` component was extracted from TimelineModal. `customer.note` is shown above the doctor-save button via a triple-fallback chain.

## Overview

Before Phase 26.2, TFP had no inline history visibility. Doctors opening a new treatment had to navigate away to CustomerDetailView → Treatment History tab to see prior treatments, losing their in-progress form state. The split-screen pattern solves this by embedding a tab strip + read-only panel directly in the form layout.

The 5-tab strip queries `be_treatments` with `orderBy('createdAt','desc').limit(5)` across **all branches** (universal query, no branch filter) so the doctor sees the full picture. Each tab shows a short label: treatment date + primary course/item name, truncated.

Selecting a tab fires a separate `getDoc` fetch for the full treatment document and renders it inside `TreatmentReadOnlyPanel`. On large screens (`lg+`) the panel appears to the right of the form in a `lg:flex lg:gap-4` parent. On small screens a button opens it in a `<dialog>`/modal overlay.

`customer.note` — a free-text field on the customer document — is shown in an amber callout box above the "บันทึกสำหรับแพทย์" button. The display uses a triple-fallback chain to handle legacy shape variants.

## Architecture

### Layout

```
TreatmentFormPage (outer)
├── lg:flex lg:gap-4
│   ├── <main> (form — lg:w-1/2)
│   │   ├── HistoryTabStrip   (5 tabs, top of form)
│   │   └── ... form fields ...
│   └── <aside hidden lg:block lg:w-1/2 lg:sticky lg:top-[120px] lg:overflow-y-auto>
│       └── TreatmentReadOnlyPanel (selected history doc)
└── <div lg:hidden>            (mobile fallback)
    └── <dialog> / modal
        └── TreatmentReadOnlyPanel
```

### State in TreatmentFormPage

| State var | Type | Purpose |
|---|---|---|
| `historyTreatments` | `array` | Top-5 recent treatments (shallow, for tab labels) |
| `selectedHistoryTreatmentId` | `string \| null` | Which tab is active |
| `historyFullDoc` | `object \| null` | Full treatment doc for selected tab |
| `historyLoading` | `boolean` | Loading indicator for full-doc fetch |
| `historyPanelOpen` | `boolean` | Mobile modal open/close |

### Data fetch

```js
// Tab strip — shallow list, all branches
const q = query(
  treatmentsCol(),
  where('customerId', '==', customerId),
  orderBy('createdAt', 'desc'),
  limit(5)
);

// Full doc — on tab click
const snap = await getDoc(treatmentDoc(selectedHistoryTreatmentId));
setHistoryFullDoc(snap.exists() ? snap.data() : null);
```

## TreatmentReadOnlyPanel

`src/components/TreatmentReadOnlyPanel.jsx` (~374 LOC) is extracted from the per-row JSX inside `TreatmentTimelineModal`. It renders a single treatment document in read-only form: doctor info, treatment items, notes, chart attachments (with Lightbox), before/after images.

### AV38 read-only contract (audit invariant)

The component enforces a strict read-only contract. **AV38** (registered in `audit-anti-vibe-code` SKILL.md) requires:

1. **No `onEditTreatment` or `onDeleteTreatment` props** — edit/delete affordances are forbidden
2. **No `<input>` or `<textarea>` elements** inside the component tree
3. **No `<button>` whose text contains "บันทึก"** (save buttons disallowed)
4. **Lightbox IS permitted** — zooming images is a read operation, not a mutation

Sanctioned exceptions: none.

Source-grep regression lock in `tests/v38-av38-treatment-read-only-panel.test.js`.

### Consumers (post-Phase 26.2)

| Consumer | How used |
|---|---|
| `TreatmentTimelineModal` | DRY refactor — replaced per-row JSX with `<TreatmentReadOnlyPanel treatment={t} />` |
| `TreatmentFormPage` | Split-screen right panel + mobile modal |

Two consumers does **not** yet trigger Rule of 3 extraction into a shared pattern; a third consumer would.

## customer.note display

`customer.note` is surfaced in TFP in an amber callout box above the "บันทึกสำหรับแพทย์" button.

### Triple-fallback chain

```js
const noteText =
  custData?.note ??
  custData?.patientData?.note ??
  patientData?.note ??
  '';
```

This mirrors the CDV-summary reader pattern (Phase 26.1) and handles:
- Current canonical shape: `customer.note` top-level field
- Legacy shape: `customer.patientData.note` nested field
- PatientForm payload shape: `patientData.note`

### Display

```jsx
{noteText && (
  <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm whitespace-pre-wrap">
    <span className="font-semibold text-amber-400">หมายเหตุลูกค้า: </span>
    {noteText}
  </div>
)}
```

Shown only when `noteText` is non-empty. Read-only — no edit affordance in TFP.

## File inventory

| File | Role |
|---|---|
| `src/components/TreatmentFormPage.jsx` | Main TFP — historyTreatments state + HistoryTabStrip + split-screen layout + customer.note callout |
| `src/components/TreatmentReadOnlyPanel.jsx` | NEW — read-only treatment viewer (AV38 contract) |
| `src/components/TreatmentTimelineModal.jsx` | DRY-refactored — now uses TreatmentReadOnlyPanel |
| `tests/v38-av38-treatment-read-only-panel.test.js` | AV38 regression lock |
| `tests/phase26-2-flow-simulate.test.js` | Rule I full-flow simulate |

## Cross-references

- Related concept: [Phase Doctor-Save (26.0)](../sources/phase-26-0-doctor-save.md)
- Related concept: [TFP Editor Attribution (26.1)](../sources/phase-26-1-tfp-polish.md)
- Related entity: TreatmentFormPage → `src/components/TreatmentFormPage.jsx`
- Related entity: TreatmentReadOnlyPanel → `src/components/TreatmentReadOnlyPanel.jsx`
- Sources: [phase-26-2-spec](../sources/phase-26-2-tfp-split-screen-history.md)
- Audit: audit-anti-vibe-code AV38 (read-only panel contract)

## See also

- `docs/superpowers/specs/2026-05-13-tfp-split-screen-history-customer-note-design.md`
- `docs/superpowers/plans/2026-05-13-phase-26-2-tfp-split-screen-history.md`

## History

- 2026-05-13 — Created. Phase 26.2 implementation complete (14 commits, +36 tests, 43 commits ahead of prod, awaiting deploy authorization).
