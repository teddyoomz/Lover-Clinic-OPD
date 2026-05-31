---
title: Course double-deduct + the persisted _courseDeducted flag (V142)
type: concept
date-created: 2026-05-31
date-updated: 2026-05-31
tags: [course-deduct, treatment, tfp, save-modes, av165, v142, v104]
source-count: 0
---

# Course double-deduct + the persisted `_courseDeducted` flag (V142)

> A course bought-and-used in a treatment must decrement `customer.courses[]` exactly
> ONCE across the multi-save lifecycle (vitals → doctor → finalize, in any order, with
> re-saves). V142-quater/quinquies fixed the cases where it decremented twice (or
> over-credited) by persisting a `_courseDeducted` flag on the treatment doc.

## Overview

[TreatmentFormPage (TFP)](../entities/treatment-form-page.md) saves the same treatment
through several `saveMode`s — `vitals` (nurse), `doctor` (แพทย์), and the bottom finalize
(`staff`/`course`) which owns course-deduction. Each save reverses the prior deduction and
re-applies the fresh one (the [edit-resave symmetry](v12-shape-drift.md) lineage of V104 /
V142). The bug class: deciding *whether this save already deducted* from a **status
heuristic** (`status !== 'doctor-recorded' && status !== 'vitalsigns-recorded'`) is
fragile — a `finalize → doctor → finalize` sequence mis-reads the prior state and
**deducts a second time** (`customer.courses` goes more negative than the real usage), or
over-credits on a `doctor → finalize`.

**Fix (V142-quinquies)**: persist a boolean `_courseDeducted` in the treatment's `detail`
(round-trips through `createBackendTreatment` / `updateBackendTreatment` / `getTreatment`).
It is **set** by deducting saves, **preserved** by course-neutral saves (doctor/vitals),
and drives `priorSaveDeducted` — replacing the status heuristic with a fact the doc
actually remembers. **AV165** locks the flag's read/write/preserve contract.

## Key facts / claims

- **Doctor-save must NOT deduct courses** (user directive, verbatim:
  *"ปุ่มบันทึกสำหรับแพทย์ ไม่ต้องบันทึกพวกข้อมูลการตัดคอร์สนะ ที่จะบันทึกตัดคอร์สด้วยจะเป็น
  บันทึกด้านล่างของ TFP"*). The bottom finalize save owns course-deduction; doctor + vitals
  saves are course-neutral and must carry `_courseDeducted` forward unchanged.
- TFP wiring (`src/components/TreatmentFormPage.jsx`): state `loadedCourseDeducted`;
  edit-load reads `existing.detail._courseDeducted` (boolean) else falls back to the old
  status heuristic for legacy docs; `courseItems` uses the existing items for
  doctor/vitals saves (no re-serialize) vs `buildCourseItemsForSave` for finalize;
  `priorSaveDeducted = loadedCourseDeducted`; the new flag (`courseDeductedAfter`) is
  written into `finalBackendDetail._courseDeducted`.
- **V142-quater** is the companion gate: a `doctor → finalize` could OVER-CREDIT; the
  `priorSaveDeducted` value closes it.
- This is the V104 / V12 multi-reader-sweep family at the **save-lifecycle** boundary —
  the "reader" is the next save deciding what the previous save did. Persist the fact;
  don't re-derive it.

## Verification (Rule Q)

- L2 (real client SDK / real prod): finalize→doctor→finalize matrix **30/0** + flag
  round-trip / fuzz / stock e2e **30/0** (the bug was REPRODUCED at 3/5 on real prod, then
  the fix verified).
- Full vitest 15418/0 + build clean.
- Honest gap → user L1: assembled real-browser multi-save on the auth-gated AdminDashboard.

## Cross-references

- Entity: [TreatmentFormPage (TFP)](../entities/treatment-form-page.md)
- Concept: [V12 shape-drift bug class](v12-shape-drift.md) (this is the save-lifecycle variant; V104 is the edit-reverse variant)
- Rules: V142 / V104 V-entries in `.claude/rules/v-log-archive.md`

## History

- 2026-05-31 — Created with V142-quater + V142-quinquies ship + deploy (`0c607f68`). The persisted `_courseDeducted` flag is the architectural backstop replacing the status heuristic.
