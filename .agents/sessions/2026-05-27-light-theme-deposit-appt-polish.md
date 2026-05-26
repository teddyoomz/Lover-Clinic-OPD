# 2026-05-27 EOD+10 — deposit-list appt-date + OPD stepper polish + light-theme contrast sweep

## Summary
Started from a `/systematic-debugging` invocation that was actually a DESIGN request → reframed to brainstorming (Visual Companion) → spec.html → plan.html → executing-plans (TDD). Shipped: (1) deposit-list appointment-date display, (2) OPD status-stepper center+Ember polish. Then a user-driven light-theme contrast sweep across the deposit + appointment zone. SHIPPED + DEPLOYED (commit 8f6b7ced, vercel --prod).

## Current State
- master = origin/master = `8f6b7ced` (pushed). prod = `8f6b7ced` LIVE (vercel --prod, aliased lover-clinic-app.vercel.app).
- Full suite **14942/0**, build clean.
- NO firestore.rules/storage/data/cron touched → vercel-only deploy, NO Probe-Deploy-Probe.
- Light theme user-verified clear (real browser) AFTER dev-server restart.
- Uncommitted (user's): `CLAUDE.md` + `.claude/rules/01-iron-clad.md` (pre-existing Rule S edits, left untouched).

## Commits
```
8f6b7ced feat(finance+appt): deposit-list appt date + OPD stepper polish + light-theme contrast sweep
```
(12 files; +704 / −42. Built on top of the EOD+9 deposit-without-appointment 11-commit stack, all now pushed.)

## Files Touched
- src: `DepositPanel.jsx` · `AppointmentOpdStepperRow.jsx` · `AppointmentHubRowCard.jsx` · `VisitPurposePicker.jsx` · `AppointmentFormModal.jsx`
- tests (new): `opd-stepper-polish.test.jsx` · `deposit-appt-date.test.jsx` · `deposit-appt-date-flow-simulate.test.js`
- tests (V21 fixups): `phase-21-0-quinquies-visual-polish.test.js` · `phase-24-0-undecies-visit-purpose-other.test.js`
- docs: `docs/superpowers/{specs,plans}/2026-05-27-deposit-appt-date-and-opd-stepper-polish*.html`

## Decisions (1-line each)
- Deposit appt-date placement = B (under "มัดจำสำหรับ") · format = date + time (`fmtThaiDate` + startTime; defensive when no startTime) · clickable → reuses goto-appt nav (existing button kept) · no-appt → "ยังไม่นัด" amber.
- OPD stepper = center-align (justify-center) + Ember footer band; shared `TreatmentLifecycleStepper` NOT touched (no ripple to CustomerDetailView).
- Light-theme contrast: active/selected = SOLID bg + white text (max pop); badges/labels = saturated; theme-aware keeps dark class as `dark:` so source-grep tests still pass.
- V21 fixups: purpose-cell source-grep window changed greedy `{0,1100}` → non-greedy `*?` (size-agnostic) since my added cell-block enlarged the cell past 1100.
- Deploy = vercel-only (no rules changed); commit only my files (not the user's CLAUDE.md/rules-01).

## Lessons
- **Vite dev HMR got STUCK after rapid successive edits** → the rendered page kept showing a STALE earlier state (pale colors) while the source was already correct. Cost many wasted "still not clear" rounds; I kept claiming "fixed" off the lying render. Browser hard-reload (Ctrl+Shift+R) did NOT fix it (server-side transform cache). **Dev-server restart fixed it.** Rule Q-vis corollary: when a render contradicts the source you just confirmed via grep, suspect a stale dev server — verify on a FRESH render (restart), don't trust a possibly-stale HMR.
- Rule Q-vis honest scope: deposit feature live-verified (dark, real data); OPD stepper Ember band live-pixel NOT seen (no checked-in customer in data renders the footer band) — centering RTL-verified + ember source-verified; user L1 pending.
- `/systematic-debugging` was the wrong frame for a DESIGN request — reframed to brainstorming HARD-GATE before any code.

## Next Todo (user-triggered)
- idle — awaiting user. (Optional: 2 pre-existing Rule S doc edits still uncommitted, user's call. OPD ember L1 when a patient is mid-OPD.)

## Resume Prompt
See SESSION_HANDOFF.md Current State (2026-05-27 EOD+10). master = prod = `8f6b7ced` LIVE. Light-theme deposit/appt polish SHIPPED + DEPLOYED + tested (14942/0). idle. No commit/deploy without explicit word THIS turn (V18).
