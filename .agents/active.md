---
updated_at: "2026-05-13 EOD — Phase 26.0 + 26.1 + 26.2 DONE · all 3 sub-phases complete · awaiting deploy"
status: "master=<NEW_SHA> · prod=ccef3c2 · 43 commits ahead · 8356 passed · build clean"
branch: "master"
last_commit: "<NEW_SHA> docs(wiki+agents): Phase 26.2 wiki concept page + log + SESSION_HANDOFF + active.md"
tests: 8356
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<NEW_SHA>` · prod = `ccef3c2` (43 commits ahead — Phase 26.0 + 26.1 + 26.2 implementation complete, awaiting deploy)
- 8356 tests pass + 1 skipped · 0 failures · 1 known flake (Phase 17.1 cross-branch-import-rtl, intermittent under full-suite load, pre-existing) · build clean
- Saga = 3 sub-phases same-day (26.0 doctor-save → 26.1 polish + editor-attribution → 26.2 split-screen history + customer.note — ALL EXECUTED)

## What this session shipped
- **Phase 26.0 Doctor-Save** (11 commits) — บันทึกสำหรับแพทย์ button + status='doctor-recorded' + recordedBy/At + canAddNewItems + AV37 + F1-F8 flow-simulate (+55 tests)
- **Phase 26.1 TFP Polish + Editor-Attribution** (10 commits) — V12 reader-sweep fix at CDV summary + remove top-right button + EditAttributionModal + handleSubmit `(eventOrSaveMode, options={})` + editedBy/Name/Role/At fields + AV37.9-AV37.11 (+23 tests)
- **Phase 26.2 TFP Split-Screen History + Customer.Note** (14 commits) — HistoryTabStrip (5 recent cross-branch treatments) + split-screen 50/50 lg+/modal <lg + NEW TreatmentReadOnlyPanel (~374 LOC) + TimelineModal DRY refactor + customer.note amber callout triple-fallback + AV38 audit invariant (+36 tests)
- Detail: `.agents/sessions/2026-05-13-phase-26-0-thru-26-2.md` + wiki concept `wiki/concepts/tfp-split-screen-history.md`

## Next action
**Pending user decision**: deploy current Phase 26.0 + 26.1 + 26.2 via `deploy` authorization (Rule V15 combined `vercel --prod` + `firebase deploy --only firestore:rules`). 43 commits ahead of prod.

## Outstanding user-triggered actions
- **Deploy authorization**: 43 commits ahead with Phase 26.0 + 26.1 + 26.2 ready; combined `vercel --prod` + `firebase deploy --only firestore:rules` per Rule V15

## Institutional memory anchors
- Phase 26.0 — `saveMode` arg = 4th locked-X family member (lockedCustomer + lockedAppointmentType + lockedChannel + saveMode)
- Phase 26.1 — `EditAttributionModal` = 2nd "pick-a-person-before-action" pattern (with ActorConfirmModal); handleSubmit sig evolution `()` → `(eventOrSaveMode)` → `(eventOrSaveMode, options={})`
- Phase 26.2 — `TreatmentReadOnlyPanel` = 2nd consumer pattern (TimelineModal + TFP split-screen); AV38 enforces no edit/delete props + no inputs + no save text + lightbox-permitted. Rule of 3 NOT yet triggered (2 consumers; 3rd would extract shared pattern).
- Phase 26.2 — Split-screen layout: `lg:flex lg:gap-4` outer + `<main lg:w-1/2>` form + `<aside hidden lg:block lg:w-1/2 lg:sticky lg:top-[120px]>` panel. Mobile: `historyPanelOpen` → `<dialog>`.
- Phase 26.2 — customer.note triple-fallback: `custData?.note ?? custData?.patientData?.note ?? patientData?.note ?? ''`. Mirrors CDV Phase 24.0-decies amber box.
- V12 multi-reader-sweep lesson reinforced — Phase 26.0e fixed writer in rebuildTreatmentSummary BUT missed reader in CDV useMemo (Phase 26.1a fix). Every "preserve X in summary" needs reader audit.
- (Carried) Iron-clad A-P + BSA BS-1..BS-16 + AV1-AV30 + AV32-AV38 + CB-1..CB-5
