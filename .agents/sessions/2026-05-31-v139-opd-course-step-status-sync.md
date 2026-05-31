# 2026-05-31 EOD+2 — V139 OPD course-step + appointment status↔tab real-time sync

## Summary
`/brainstorming (Visual Companion; Q1=B warn "ยังไม่ตัด" / Q2=A violet / Q3=A symmetric) → spec HTML → writing-plans HTML → executing-plans (inline, 8 tasks)`. Two user-requested features for the Frontend "นัดหมาย วันนี้" card. **Code complete + FULLY verified (incl. TRUE-L2 real-prod e2e + theme-AA via Chrome MCP) but UNCOMMITTED/HELD** (no commit auth this turn). V138 also still held in the same working tree.

## Features
1. **ขั้น "คอร์ส" ในสเต็ปเปอร์ OPD** — insert between ② แพทย์ + ③ เสร็จ → 4 dots. `done`=violet ✓ (ตัดคอร์สแล้ว) · `warn`=amber "ยังไม่ตัด" (เสร็จแต่ไม่ตัด — catches staff who forget to deduct) · `pending`=เลขจาง (ระหว่างทาง). Purchase-only (ซื้อ) ≠ deduct. Real-time via the existing `listenToTreatmentsByDateRange` onSnapshot.
2. **sync status ↔ tab** — couple `appt.status` ('done'/'confirmed') ↔ `serviceCompletedAt` (tab SSOT) at 3 backendClient chokepoints → mark-complete / กลับคิวรอ / แก้ status ใน modal (Frontend หรือ Backend) ย้าย tab "กำลังรอ/✓ เสร็จแล้ว" ทันที, cross-surface cross-device (existing onSnapshot listeners). Tab filter UNCHANGED → no legacy migration.

## Root-cause / design facts (Rule R + grep verified)
- `courseItems`/`treatmentItems` live under `t.detail` (top-level=0 on prod — Rule R diag scanned 88 docs: 57 deducted / 24 completed-no-deduct / 0 top-level). Predicate = V136 `loadedHasNoCourseUsage` logic, now SSOT.
- Pre-V139: tab = `serviceCompletedAt` (timestamp), ORTHOGONAL to `appt.status` (modal dropdown) → status="เสร็จแล้ว" in modal left card stuck in "กำลังรอ". Coupling unifies them.
- Badge `effectiveStatus = serviceCompletedAt ? 'done' : rawStatus` already coheres; coupling also FIXES the mark-complete button gate (needs `rawStatus==='confirmed'` → unmark must reset status).

## Files (uncommitted/held, stacked on V138)
- `src/lib/treatmentDisplayResolvers.js` — NEW `resolveCourseDeducted` + `resolveCourseStepState`
- `src/lib/appointmentDisplay.js` — NEW `decideApptStatusServiceSync`
- `src/lib/backendClient.js` — import + 3 chokepoints (mark/unmark/updateBackendAppointment) [also V138]
- `src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx` — opt-in `withCourseStep` + violet/warn states
- `src/components/admin/AppointmentOpdStepperRow.jsx` — pass `withCourseStep` + `courseDeducted`
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV159 [also V138 AV158]
- NEW tests: `v139-opd-course-step.test.jsx` (14) · `v139-appt-status-service-sync.test.js` (12) · `v139-flow-simulate.test.js` (17)
- V21 fixups: `opd-stepper-polish` · `v71-mark-service-completed` · `v71-opd-stepper-row` · `v71a-edit-fix-and-unmark` (3→4 dots / +status payload)
- NEW scripts: `diag-opd-course-step-field-path.mjs` (Rule R) · `e2e-v139-status-sync-course-step.mjs` (TRUE-L2)
- docs: spec + plan HTML + mockup

## Verification
- V139 targeted: 14 + 12 + 17 = 43/0. Stepper-consumer regression 142/0. V71/V73/appt cluster 170/0.
- **FULL vitest 15319/0** (698 files; was V138 baseline 15276 → +43). Build clean (3.09s).
- **TRUE-L2 e2e 13/0 on REAL prod** (`e2e-v139-...mjs`): SHIPPED updateBackendAppointment stamp/clear/no-clobber + mark/unmark coupling + resolveCourseDeducted on seeded AND real prod docs; zero-orphan cleanup.
- **Theme-AA (Rule Q-vis, Chrome MCP)**: violet ✓ distinct both themes · amber "ยังไม่ตัด" legible both (amber-700 light / amber-300 dark = V125 AA palette) · 4 dots fit 360px + 300px narrow (no overflow). [zoom infra-timed-out; full screenshot decisive]

## Honest Rule Q gap
USER L1 post-deploy = the ASSEMBLED real-browser flow on auth-gated AdminDashboard: deduct a real course → course dot lights live; mark-complete/edit-modal-status cross-surface → card hops tab live cross-device. Harness can't drive auth-gated multi-device live.

## Next (user-triggered)
1. Commit V139 (decide grouping vs held V138 — backendClient.js + SKILL.md carry both).
2. Deploy (frontend-only, no Probe-Deploy-Probe; V18 needs "deploy").
3. V138 still held: heal `--apply` + commit + deploy.
4. L1 hands-on prod.

## Resume Prompt
Resume LoverClinic — 2026-05-31 EOD+2. V139 (OPD course-step + status↔tab sync) DONE+verified (full vitest 15319/0 + TRUE-L2 13/0 + theme-AA), UNCOMMITTED/HELD with V138. Read CLAUDE.md · SESSION_HANDOFF.md (prod=409804fc) · .agents/active.md · this checkpoint. When authorized: commit V139 → deploy (frontend-only). V138 separately: heal --apply + commit + deploy. No commit/deploy without explicit word THIS turn (V18 + Rule M).
