---
updated_at: "2026-06-29 — V164 (doctor-only header + recall blink) + V164-fix (per-date 'work' shift dropped → 'ไม่มีแพทย์เข้า' bug). Committed + pushed, NOT deployed."
status: "V164 + V164-fix shipped local (master ef40ff12). Frontend-only (no firestore.rules / no data) → vercel-only when user says deploy; no Probe-Deploy-Probe. Idle / await deploy."
branch: "master"
last_commit: "ef40ff12 — fix(appt): V164-fix header showed ไม่มีแพทย์เข้า while a doctor WAS in"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "423159cc (filler EOD) — V164 + V164-fix NOT yet deployed; awaiting explicit 'deploy'."
firestore_rules_version: "UNCHANGED (V164 + V164-fix frontend-only)"
tests: "V164+fix targeted (v164 + v64-fix + v64-rtl) green; full vitest 16991 pass / 4 reds = PRE-EXISTING parallel flakes (phase11-routing R1/R2 · phase15.5b PF.4 global.fetch-leak · staff-chat-lightbox stress) all GREEN isolated (phase15.5b 51/0); build clean; Rule Q L2 real helper vs real prod data verified."
---

# Active — 2026-06-29 — V164 doctor-only header + recall blink + V164-fix

## State
- AdminDashboard นัดหมาย page. V164 (display) + V164-fix (data-match bug). master ef40ff12, pushed. NOT deployed.
- firestore.rules untouched → frontend-only; deploy = vercel-only on explicit "deploy" (V18).

## V164 (spec/plan: docs/superpowers/{specs,plans}/2026-06-29-doctor-header-and-recall-blink.*)
- doctor-only header (🩺 chips; none → "ไม่มีแพทย์เข้า"; assistant chips dropped) + Recall-วันนี้ pill blinks while badge count>0 (reduced-motion → static red). Q1/Q2/Q3=A.

## V164-fix (root-cause via /systematic-debugging + Rule R real-prod diag)
- BUG (latent since V64): header showed "ไม่มีแพทย์เข้า" while a doctor WAS in. The inline filter matched per-date entries by literal `type==='override'`, but real be_staff_schedules per-date shifts have type 'work'/'halfday' (no 'override' type) → หมอมุก (work 17:00-20:00, นครราชสีมา) dropped.
- FIX: NEW canonical `deriveWorkingDoctorShiftsForDate` (staffScheduleValidation.js — mergeSchedulesForDate override-wins + exported WORKING_TIME_TYPES). AppointmentHubView routes through it; TodaysDoctorsPanel shares WORKING_TIME_TYPES (Rule of 3). Class-of-bug grep: 1 instance, no siblings. AV199 + tests SS1-9/SG2/SC2 + diag-v164-verify-fix.mjs (Rule Q L2).
- ⚠ self-introduced+fixed this session: a cp accidentally overwrote the canonical `.claude/skills/audit-anti-vibe-code/SKILL.md` (602-line, has AV85-197) with the divergent `.agents` copy (3788-line, lacks AV85) → 20 AV-content tests red. Reverted both; AV199 re-added to .claude only. (.agents + .claude SKILL.md are DIVERGENT files — different AV sets; rtk `diff` falsely reported identical.)

## Next action
- Await "deploy" (vercel-only, frontend) — or next task.

## Outstanding user-triggered actions
- Deploy V164 + V164-fix (when user says "deploy"). Rule Q L1: on a real authed session, นครราชสีมา → นัดหมาย/วันนี้ should now show หมอมุก 17:00-20:00 (was "ไม่มีแพทย์เข้า").
- Optional: 2 untracked filler docs still uncommitted.
