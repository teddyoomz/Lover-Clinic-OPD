---
updated_at: "2026-06-29 — V164: doctor-only นัดหมาย header + Recall-วันนี้ pill blink-while-pending. Committed + pushed, NOT deployed."
status: "V164 shipped local (master 76c1722b). Frontend-only (no firestore.rules / no data) → vercel-only when user says deploy; no Probe-Deploy-Probe. Idle / await deploy."
branch: "master"
last_commit: "76c1722b — feat(appt): V164 doctor-only header + Recall blink while pending"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "423159cc (filler EOD) — V164 NOT yet deployed; awaiting explicit 'deploy'."
firestore_rules_version: "UNCHANGED (V164 frontend-only)"
tests: "V164 targeted 12/0 + v64 V21-fixups (68/0 across 3 files); full vitest 16979/16983 — the 4 reds are PRE-EXISTING parallel flakes (phase-17-1-cross-branch-import-rtl · phase11-master-data-scaffold routing R1/R2 · staff-chat-lightbox stress) all GREEN in isolation (38/0); build clean; Rule Q L1 real-browser CSS verified."
---

# Active — 2026-06-29 — V164 doctor-only header + Recall blink

## State
- AdminDashboard นัดหมาย page, 2 UI changes shipped (master 76c1722b, pushed). NOT deployed.
- firestore.rules untouched → frontend-only; deploy = vercel-only on explicit "deploy" (V18).

## What V164 shipped (spec/plan: docs/superpowers/{specs,plans}/2026-06-29-doctor-header-and-recall-blink.*)
- **Change 1 — doctor-only header** (`AppointmentHubDoctorCards.jsx` + `AppointmentHubView.jsx`): shows 🩺 doctor chips (name + hours); no doctor → "ไม่มีแพทย์เข้า". Dropped assistant (purple) chips + the old generic no-staff empty text; memo returns `{ doctorShifts }` only; removed dead `assistants` prop + `dateLabel` var. (Q1=A)
- **Change 2 — Recall-วันนี้ pill blink** (`RecallTogglePill.jsx` + `index.css`): `recall-pill-blink` (gray↔red full swap 1s ∞) when the existing badge `count > 0` (pending/overdue, not done/closed); `-active` variant for the red state; stops at count 0; `prefers-reduced-motion` → static red border. Reuses the existing count hook — no new state/query. (Q2=A, Q3=A)

## Verification
- 12/0 V164 (RTL real component + recall blink-class + source-grep) + V21-fixups; full vitest 16979 pass, 4 pre-existing parallel flakes (green isolated); build clean.
- Rule Q L1 real browser (Claude Preview): computed `animationName=recall-pill-blink @1s`, `@keyframes` + `prefers-reduced-motion` override present in the bundled CSS, count-0 = `none`. (screenshot tool timed out on the heavy prod-connected app — CSS evidence + live mockup stand in.)

## Next action
- Await "deploy" (vercel-only, frontend) — or next task.

## Outstanding user-triggered actions
- Deploy V164 (when user says "deploy").
- Optional: 2 untracked filler docs (`docs/filler-math-explainer.{html,pdf}`) still uncommitted from prior session.
