---
updated_at: "2026-05-14 EOD — Phase 27 saga shipped; ~32 commits ahead; NOT DEPLOYED"
status: "master=9819c2e · prod=e8086de · 32 commits ahead · 9013+ tests · build clean"
branch: "master"
last_commit: "9819c2e fix(Phase 27.2-sexies): CDV mapper V12 multi-reader-sweep — TRUE root cause of badge flash-revert"
tests: 9013
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "e8086de"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `9819c2e` · prod = `e8086de` (~32 commits ahead — Phase 27 saga + V55 brutal pre-deploy LIVE on master only)
- Phase 27.x complete: branchId attribution + display-name live-resolve + TFP unified sticky header + lifecycle badges + always-editable save buttons + EditTreatmentBranchModal wired
- 2 prod Firestore migrations applied: Phase 27.0 (18 treatments backfilled with branchId) + Phase 27.2-quater (4 customer summaries rebuilt with lifecycle fields)

## What this session shipped (Phase 27 saga)
- **27.0** treatmentDisplayResolvers + branchId stamping + AV42 + Rule M migration ✅
- **27.0 follow-up** wire EditTreatmentBranchModal (✏️ on TreatmentReadOnlyMirror) + optimistic local override ✅
- **27.1** useLayoutPreference + LayoutSwapButton + TFP CSS-only swap ✅
- **27.1-quater→sexies** unified sticky header (back + title + history tabs centered + branch chip + swap button) + redesigned EditTreatmentBranchModal + sticky offsets ✅
- **27.2** stacked lifecycle badges with HH:MM timestamps + always-editable vitals/doctor buttons + per-stage timestamps overwrite on each save ✅
- **27.2-quater** Rule M migration rebuilt 4 customer summaries ✅
- **27.2-sexies** V12 multi-reader-sweep round 3 — CDV in-component mapper STRIPPED lifecycle fields from `treatments[]` → flash-revert bug. **TRUE root cause** (Phase 27.2-quinquies dep-array fix was a symptom-level fix; still kept) ✅
- Checkpoint: `.agents/sessions/2026-05-14-phase-27-saga.md`

## Next action
- (idle) await user direction OR explicit "deploy" for combined V15 push of ~32 commits

## Outstanding user-triggered actions
- **Deploy auth**: ~32 commits ahead; combined V15 (`vercel --prod` + `firebase deploy --only firestore:rules`) per V18 explicit "deploy" THIS turn
- **Verify Phase 27.2-sexies fix**: refresh CDV for LC-26000006 — should see 2 badges (ซักประวัติ + บันทึกแล้ว) with HH:MM on latest treatment row
