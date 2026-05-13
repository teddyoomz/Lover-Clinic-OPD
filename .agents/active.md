---
updated_at: "2026-05-13 EOD — Phase 26.0 + 26.1 + 26.2 + 26.2f DONE · all 4 sub-phases complete · awaiting deploy"
status: "master=<NEW_SHA> · prod=ccef3c2 · 51 commits ahead · 8447 passed · build clean"
branch: "master"
last_commit: "<NEW_SHA> docs(Phase 26.2f Task 10): wiki + log + SESSION_HANDOFF + active.md"
tests: 8447
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<NEW_SHA>` · prod = `ccef3c2` (51 commits ahead — Phase 26.0 + 26.1 + 26.2 + 26.2f implementation complete, awaiting deploy)
- 8447 tests pass + 1 skipped · 0 failures · 1 known flake (Phase 17.1 cross-branch-import-rtl, intermittent under full-suite load, pre-existing) · build clean
- Saga = 4 sub-phases same-day (26.0 doctor-save → 26.1 polish + editor-attribution → 26.2 split-screen history → 26.2f read-only mirror + vitals-save — ALL EXECUTED)

## What this session shipped (Phase 26.2f addition)
- **Phase 26.2f TFP Read-Only Mirror + Vitals-Save** (11 commits) — NEW `TreatmentReadOnlyMirror.jsx` (~947 LOC) full-form mirror replacing compact panel in TFP split-screen aside + `extractDisplayString` helper (prevents `[object Object]` for doctor/assistant populated-object fields) + `saveMode='vitals'` 5th locked-X family member + `canAddNewItems` 3-branch gate (`mode==='create' || status==='doctor-recorded' || status==='vitalsigns-recorded'`) + layout reorder (หมายเหตุทั่วไป → left column, vitals-save → right column top) + AV37.12–.17 ext + AV39 NEW (`extractDisplayString` ≥5× in mirror) (+91 tests → 8447 total)

## Previously shipped (same day)
- **Phase 26.0 Doctor-Save** (11 commits) — บันทึกสำหรับแพทย์ button + status='doctor-recorded' + recordedBy/At + canAddNewItems + AV37 + F1-F8 flow-simulate (+55 tests)
- **Phase 26.1 TFP Polish + Editor-Attribution** (10 commits) — V12 reader-sweep fix at CDV summary + remove top-right button + EditAttributionModal + handleSubmit `(eventOrSaveMode, options={})` + editedBy/Name/Role/At fields + AV37.9-AV37.11 (+23 tests)
- **Phase 26.2 TFP Split-Screen History + Customer.Note** (14 commits) — HistoryTabStrip (5 recent cross-branch treatments) + split-screen 50/50 lg+/modal <lg + NEW TreatmentReadOnlyPanel (~374 LOC) + TimelineModal DRY refactor + customer.note amber callout triple-fallback + AV38 audit invariant (+36 tests)
- Detail: `.agents/sessions/2026-05-13-phase-26-0-thru-26-2.md` + wiki concepts `wiki/concepts/tfp-split-screen-history.md` + `wiki/concepts/tfp-readonly-mirror.md`

## Next action
**Pending user decision**: deploy current Phase 26.0 + 26.1 + 26.2 + 26.2f via `deploy` authorization (Rule V15 combined `vercel --prod` + `firebase deploy --only firestore:rules`). 51 commits ahead of prod.

## Outstanding user-triggered actions
- **Deploy authorization**: 51 commits ahead with Phase 26.0 + 26.1 + 26.2 + 26.2f ready; combined `vercel --prod` + `firebase deploy --only firestore:rules` per Rule V15

## Institutional memory anchors
- Phase 26.0 — `saveMode` arg = 4th locked-X family member (lockedCustomer + lockedAppointmentType + lockedChannel + saveMode='doctor')
- Phase 26.2f — `saveMode='vitals'` = 5th locked-X family member; `vitalsigns-recorded` status stage precedes `doctor-recorded`; 3-stage workflow: vitalsigns-recorded → doctor-recorded → admin finalize (deleteField)
- Phase 26.2f — `extractDisplayString` helper = canonical pattern for rendering Firestore populated-object fields (doctor/assistant may arrive as `{name, id}` not plain string). AV39 enforces ≥5 calls in TreatmentReadOnlyMirror.
- Phase 26.2f — `canAddNewItems` 3-branch: `mode==='create' || status==='doctor-recorded' || status==='vitalsigns-recorded'`. Vitals-recorded unlocks course/consumable sections same as doctor-recorded.
- Phase 26.2f — Layout reorder: หมายเหตุทั่วไป moved from right column → left column (beneath course/consumables). Vitals-save button takes top of right column. Mirror reflects reordered layout.
- Phase 26.1 — `EditAttributionModal` = 2nd "pick-a-person-before-action" pattern (with ActorConfirmModal); handleSubmit sig evolution `()` → `(eventOrSaveMode)` → `(eventOrSaveMode, options={})`
- Phase 26.2 — `TreatmentReadOnlyPanel` (compact card, ~374 LOC) vs `TreatmentReadOnlyMirror` (full form mirror, ~947 LOC) = 2 distinct use cases; Rule of 3 NOT yet triggered (2 consumers for Panel; Mirror is separate component).
- Phase 26.2 — Split-screen layout: `lg:flex lg:gap-4` outer + `<main lg:w-1/2>` form + `<aside hidden lg:block lg:w-1/2 lg:sticky lg:top-[120px]>` panel. Mobile: `historyPanelOpen` → `<dialog>`.
- Phase 26.2 — customer.note triple-fallback: `custData?.note ?? custData?.patientData?.note ?? patientData?.note ?? ''`.
- (Carried) Iron-clad A-P + BSA BS-1..BS-16 + AV1-AV30 + AV32-AV39 + CB-1..CB-5
