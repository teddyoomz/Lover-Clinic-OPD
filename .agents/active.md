---
updated_at: "2026-05-13 — Phase 26.0 + 26.1 BOTH complete (NOT YET DEPLOYED)"
status: "master=559d0cb · prod=ccef3c2 · 21+ commits ahead · 8320 passed · build clean"
branch: "master"
last_commit: "feat(Phase 26.1c): AV37 audit invariant extension — editor attribution"
tests: 8320
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `559d0cb` (Task 10 final docs commit will land after this file save) · prod = `ccef3c2` (21+ commits ahead — Phase 26.0 + 26.1 NOT YET DEPLOYED)
- 8320/8321 tests passed + 1 skipped (0 Phase 26.1 regressions)
- Phase 26.1 follows Phase 26.0 same-day (both 2026-05-13)
- Rule of 3 status: `EditAttributionModal` = 2nd member of "pick-a-person-before-action" family (with `ActorConfirmModal`); not yet a Rule of 3 trigger

## What this session shipped (Phase 26.0 + 26.1, all 2026-05-13)

### Phase 26.0 — Doctor-Save (11 commits earlier)
- 26.0a Scaffold (`c54c63d`): auth import + canAddNewItems flag + saveMode coercion
- 26.0b Gates + status (`3605eaf` + `db8da4d` + `dad99bb`): 8 gate sites + v26StatusPatch + 2 fixups
- 26.0c UI gates (`7b584e2`): canAddNewItems × 5+ sites
- 26.0d Button + banner (`85e1a9e`)
- 26.0e Status chips (`034c866`)
- 26.0f AV37 (`1b0fc47`)
- 26.0g Flow-simulate F1-F8 (`b0e1573`)
- Test fixups (`13b9551`)
- Docs (`d2c8a95`)

### Phase 26.1 — TFP Polish + Editor-Attribution (10 task commits this turn)
- 26.1a (`0af6a65`): CDV summary mapper V12 fix + top-right button removal
- 26.1b (`97a50df`): NEW EditAttributionModal component + E1-E5 RTL
- 26.1c (`7e4f88a` + `476304d` + `6b3f768` + `550b771` + `afe37a9` + `559d0cb`): handleSubmit signature ext + v26StatusPatch ext + backendClient extraction + CDV inline meta display + ROLE_LABEL_TH + F9 + AV37.9-AV37.11
- (Task 10 docs — committed after this file save)

## Next action
**Idle** — Phase 26.0 + 26.1 awaiting user `deploy` authorization to ship combined vercel --prod + firebase deploy --only firestore:rules per Rule V15. 21+ commits ahead of prod.

## Outstanding user-triggered actions
- **Pending user authorization**: deploy Phase 26.0 + 26.1 to production
- (Optional, unchanged) `scripts/probe-deploy-probe.mjs` probes 2/3/4 false-positive trim (V50-stripped collections)
- (Optional, unchanged) `bsa-task7-h-quater-fix` parallel-run flake (didn't surface this run)

## Institutional memory anchors
- **Phase 26.1 — `EditAttributionModal` is 2nd "pick-a-person-before-action" pattern** (1st = `ActorConfirmModal`). Future 3rd similar modal should consider extracting `<PersonPickerModal>` base.
- **handleSubmit signature evolution**: `async ()` → `async (eventOrSaveMode)` [26.0a] → `async (eventOrSaveMode, options = {})` [26.1c]. Defensive coercion preserved across all forms.
- **V12 multi-reader-sweep at component-level memo** — Phase 26.0e fixed the writer (rebuildTreatmentSummary in backendClient.js) but missed the reader (in-component useMemo in CDV). Phase 26.1a closed the gap; AV37 extension locks. Lesson: every "preserve field X in summary" change must audit ALL summary readers, not just the canonical writer.
- **Top-level vs detail-nested treatment fields**: Phase 26.0b established the extraction pattern (`const {X, Y, ...rest} = detail; if (X !== undefined) topLevelPatch.X = X;`). Phase 26.1c extends with 4 more fields. AV37.11 locks the contract.
- **Phase 26.1 schema additions** on `be_treatments` (additive — no migration): `editedBy` (uid) + `editedByName` (display) + `editedByRole` ('doctor'/'assistant'/'staff') + `editedAt` (Timestamp). Stamped on staff edit-save when modal confirms.
- **ROLE_LABEL_TH** constant at top of `CustomerDetailView.jsx` maps editedByRole → Thai label for inline meta display.
- (Carried) Phase 26.0 `saveMode` arg = 4th member of locked-X family (lockedCustomer + lockedAppointmentType + lockedChannel + saveMode).
- (Carried) Iron-clad rules A-P + BSA invariants BS-1..16 + AV1-AV30 + AV32-AV37 + CB-1..5.
