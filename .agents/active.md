---
updated_at: "2026-05-13 EOD — Phase 26.0 + 26.1 DONE · 26.2 spec+plan ready"
status: "master=fa22018 · prod=ccef3c2 · 23 commits ahead · 8320 passed · build clean"
branch: "master"
last_commit: "docs(superpowers/plans): Phase 26.2 implementation plan"
tests: 8320
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `fa22018` · prod = `ccef3c2` (23 commits ahead — Phase 26.0 + 26.1 implementation complete, awaiting deploy; 26.2 spec+plan committed, NOT executed yet)
- 8320 tests pass + 1 skipped · 0 failures · build clean
- Saga = 3 sub-phases same-day (26.0 doctor-save → 26.1 polish + editor-attribution → 26.2 split-screen history + customer.note — planned)

## What this session shipped
- **Phase 26.0 Doctor-Save** (11 commits) — บันทึกสำหรับแพทย์ button + status='doctor-recorded' + recordedBy/At + canAddNewItems + AV37 + F1-F8 flow-simulate (+55 tests)
- **Phase 26.1 TFP Polish + Editor-Attribution** (10 commits) — V12 reader-sweep fix at CDV summary + remove top-right button + EditAttributionModal + handleSubmit `(eventOrSaveMode, options={})` + editedBy/Name/Role/At fields + AV37.9-AV37.11 (+23 tests)
- **Phase 26.2 spec + plan** (2 commits) — TFP split-screen history (5-tab strip + 50/50 lg+ / modal <lg) + customer.note display + TreatmentReadOnlyPanel extraction + AV38. NOT executed yet (8 tasks planned)
- Detail: `.agents/sessions/2026-05-13-phase-26-0-thru-26-2.md`

## Next action
**Pending user decision**: (a) execute Phase 26.2 plan (8 subagent-driven tasks, ~660 LOC, ~1 session) OR (b) deploy current Phase 26.0 + 26.1 first via "deploy" authorization.

## Outstanding user-triggered actions
- **Deploy authorization**: 21+ commits ahead with Phase 26.0 + 26.1 ready; 23 with 26.2 docs. Combined `vercel --prod` + `firebase deploy --only firestore:rules` per Rule V15
- **Phase 26.2 execution**: spec + plan committed; user chose subagent-driven → next-chat continues with Task 1
- (Optional, unchanged) probe-deploy-probe.mjs probes 2/3/4 false-positive trim; bsa-task7-h-quater-fix flake

## Institutional memory anchors
- Phase 26.0 — `saveMode` arg = 4th locked-X family member (lockedCustomer + lockedAppointmentType + lockedChannel + saveMode)
- Phase 26.1 — `EditAttributionModal` = 2nd "pick-a-person-before-action" pattern (with ActorConfirmModal); handleSubmit sig evolution `()` → `(eventOrSaveMode)` → `(eventOrSaveMode, options={})`
- Phase 26.2 (planned) — `TreatmentReadOnlyPanel` = 2nd consumer pattern (modal + TFP split); AV38 enforces no edit/delete props + no inputs + no save text + lightbox-permitted
- V12 multi-reader-sweep lesson reinforced — Phase 26.0e fixed writer in rebuildTreatmentSummary BUT missed reader in CDV useMemo (Phase 26.1a fix). Every "preserve X in summary" needs reader audit
- (Carried) Iron-clad A-P + BSA BS-1..16 + AV1-AV30 + AV32-AV37 + CB-1..5 (AV38 lands Phase 26.2)
