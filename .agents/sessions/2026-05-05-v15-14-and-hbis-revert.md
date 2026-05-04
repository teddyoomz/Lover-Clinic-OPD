# Session 2026-05-05 — V15 #14 deploy + H-bis ProClinic strip explored + fully reverted

## Summary
User authorized V15 #14 to ship the pending `1d15db5` AP1-bis multi-slot reservation. Mid-session pivot to a big-bang H-bis "backend uses our database for everything" ProClinic strip across 8 admin surfaces (52-test bank, source edits to ClinicSettingsPanel / ChartCanvas / ChartTemplateSelector / TreatmentTimeline / TreatmentFormPage / AdminDashboard / BackendDashboard / firestore.rules + cookie-relay/ deletion). User halted: "เอาทุกอย่างที่มึงเปลี่ยนใน frontend กุคืนมาให้หมด" → full revert via `git checkout HEAD -- ...` + cookie-relay/ restored, **zero commits made**. Then V15 #14 deploy ran clean (independent of strip).

## Current State
- master = `1d15db5` · prod = `1d15db5` (V15 #14 LIVE 2026-05-05) · **in-sync**
- 4612/4612 tests · build clean · firestore.rules v24 (idempotent re-publish)
- working tree clean (no tracked changes; only untracked plan/skill/cache scaffolding)
- Phase 16 ALL LIVE; AP1-bis multi-slot reservation now in production
- Branch-selector design queued for next session (2× /brainstorm fired but absorbed into system-reminders)

## Commits
```
1d15db5 feat(ap1-bis): multi-slot 15-min interval reservation closes range-overlap (already at master before this session; deployed today)
```
No new commits this session — H-bis attempt fully reverted before commit.

## Files Touched (this session — ALL REVERTED)
- src/App.jsx (routing flip + revert)
- src/components/ClinicSettingsPanel.jsx (sync UI strip + revert)
- src/components/ChartCanvas.jsx (broker drop + revert)
- src/components/ChartTemplateSelector.jsx (be_chart_templates migration + revert)
- src/components/TreatmentFormPage.jsx (default saveTarget flip + Proxy stub + revert)
- src/components/TreatmentTimeline.jsx (broker → backendClient + revert)
- src/pages/AdminDashboard.jsx (Proxy stub + revert)
- src/pages/BackendDashboard.jsx (drop setUseTrialServer + revert)
- firestore.rules (be_chart_templates rule + proclinic_session narrow + revert)
- cookie-relay/* (deleted + restored)
- tests/branch-collection-coverage.test.js (be_chart_templates entry + revert)
- tests/phase16.3-firestore-rules-gate.test.js (rule shape + revert)
- tests/extended/phase13.5.4-deploy2-claim-only.test.js (rule shape + revert)
- tests/h-bis-strip-2026-05-04.test.js (NEW 52-test bank + deleted)

Files actually KEPT (this session):
- `~/.claude/plans/database-vast-dahl.md` — marked ABORTED with carry-forward lessons
- `.agents/active.md` — updated (this session-end)
- `SESSION_HANDOFF.md` — updated (this session-end)
- This checkpoint file (NEW)

## Decisions
- H-bis abort root cause: "backend" scope overlapped with files user considers frontend (cookie-relay powers PatientDashboard.broker.getCourses; ClinicSettingsPanel sync UI is user-active; AdminDashboard's queue + listener still serve admins).
- Big-bang multi-file ProClinic strip too risky; tier-by-tier or single-file-per-deploy preferred.
- AdminDashboard / TreatmentFormPage / TreatmentTimeline / cookie-relay/ all classified as frontend-touching — leave alone in any future strip attempt.
- V15 #14 deploy ran AFTER full revert — AP1-bis was independent of strip work, shipped on the original `1d15db5`. Idempotent firebase rules re-publish.
- Plan-mode restriction during /session-end: user picked ExitPlanMode → /session-end normally (plan file updated to ABORTED first).

## V15 #14 deploy probe trail
- Pre-probe Rule B: 6/6 ✓ (chat_conversations CREATE + pc_appointments PATCH + 2× clinic_settings/proclinic_session* PATCH + opd_sessions anon CREATE+PATCH)
- vercel --prod --yes: build 3.12s, aliased `lover-clinic-app.vercel.app`
- firebase deploy --only firestore:rules: rules unchanged from V15 #13 (idempotent), released v24
- Post-probe Rule B: 6/6 ✓
- Cleanup: 4/4 200 (DELETE pc_appointments × 2, strip clinic_settings probe field × 2)
- HTTP smoke: / 200, /admin 200, /api/webhook/line 401 (LINE sig — expected)

## Next Todo
1. **Brainstorm backend branch-selector** via `Skill(superpowers:brainstorming)` per Rule J HARD-GATE
   - User-supplied scope (in args from 2× /brainstorm): top-right Tab branch switcher, shared customers/staff/permission-groups/branches/system-settings, per-branch isolation for everything else, per-staff branch access gates the Tab visibility, customer-tag bootstrap to `branchId='นครราชสีมา'` baseline before new branches
2. After brainstorm: `Skill(writing-plans)` → plan file → ExitPlanMode → execute
3. Customer-tag bootstrap is a prerequisite — likely a `/api/admin/*` migrate-once endpoint
4. 16.8 /audit-all orchestrator-only readiness check (Phase 16 closure)

## Resume Prompt
See `SESSION_HANDOFF.md` Resume Prompt block at top. Status: master=1d15db5, prod=1d15db5 LIVE (V15 #14), 4612 tests, in-sync.
