---
updated_at: "2026-05-26 EOD+6 — Appointment card cosmetic-shell redesign (5-band + theme-matched OPD pills) SHIPPED LOCAL"
status: "LOCAL — committed + pushed; NOT deployed (awaits explicit 'deploy', V18). prod UNCHANGED 459a4ea3."
branch: "master"
last_commit: "1e74b064 fix(appt-card): OPD pills data-theme-driven (OS-independent) — Rule Q-vis finding (T6)"
tests: "full suite 14818 pass / 0 fail · build clean · 3 touched src files grep-clean (no IIFE-in-JSX, name sky)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "459a4ea3 LIVE — appointment-card redesign NOT yet deployed"
firestore_rules_version: "UNCHANGED — pure presentation (no rules/index/data change) → no Probe-Deploy-Probe"
---

# Active Context

## State
- AppointmentHubRowCard redesigned into a 5-band cosmetic-shell layout (header / finance / detail / OPD-footer / actions), beautiful + theme-correct in BOTH Dark and Light. ZERO changes to any button wiring/flow/logic/data-testid/conditional.
- OPD lifecycle pills (`OpdLifecycleRow`) fixed: were unconditional dark-only classes → green-on-green in light theme. Now **data-theme-driven** `.opd-pill-{blue,emerald,wait,save}` (src/index.css, dark default + [data-theme=light] override) → OS-independent (NOT Tailwind `dark:`, which is OS-coupled here). AV136.
- Q5 removed the "⚙ OPD Lifecycle" header label · Q6 renamed the save button "บันทึกลง OPD" → "บันทึกเข้าระบบ" (label text only). The round-circle สถานะ OPD stepper (shared Phase 28 `TreatmentLifecycleStepper`) is OFF-LIMITS — re-parented verbatim, never restyled/recolored.

## What this session shipped
- Full `/session-start → brainstorming (Visual Companion in live Chrome, Rule S EOD+6 design timing) → spec (v2, approved after a stepper-mockup correction) → writing-plans → executing-plans INLINE`.
- 7 commits: spec `7a6289eb` · plan `804e341b` · T1 `72665479` · T2 `789821e0` · T3 `fc7b75b1` · T4 `bd54b94b` · T5 `ffc65d55` · T6 `1e74b064`.
- 3 src files: `_apptHubStyles.js` (OPD_PILL tokens) · `OpdLifecycleRow.jsx` (tokens + remove header + rename save) · `AppointmentHubRowCard.jsx` (5-band re-layout) + `src/index.css` (.opd-pill-* data-theme classes). Tests: NEW `tests/appointment-card-redesign.test.jsx` (T1-T5 + T3.5 IIFE lock) + V21-fix `v118-card-opd-lifecycle-row-rtl.test.jsx` R3.4. AV136.
- Decisions: Q1=C band layout · Q2=A theme-matched pills · Q3=A Editorial Ember · Q4=A stepper untouched · Q5 remove header · Q6 rename save.

## Verification (Rule Q-vis / Q-honest)
- **L1 real-browser BOTH themes (Chrome, Browser 1)** — mounted the REAL AppointmentHubRowCard in a temp vite harness (deleted after, never committed) + verified by eye: data-theme=light → light readable OPD pills (the fix); data-theme=dark → dark readable pills. Computed-style confirmed (light: blue-100 bg + blue-900 text). 5-band layout, name sky, no header, save="บันทึกเข้าระบบ", stepper intact — all confirmed.
- **Rule Q-vis FINDING (this is why the live check mattered)**: the initial T1/T2 `dark:` approach washed out on this DARK-OS machine in light theme (Tailwind `dark:` = OS-coupled, no darkMode config). Switched to data-theme-driven → OS-independent → correct in both themes. Caught + fixed in the browser before claiming done.
- Code: full suite 14818/0; build clean; touched-file grep clean (no IIFE-in-JSX, name never red).
- **GAP (disclosed):** the card's NEIGHBOR chips (STATUS/TYPE/finance) still use Tailwind `dark:` (OS-coupled) — pre-existing systemic, out of scope. On the user's light-OS machine they render light/consistent in light theme anyway; only the OPD pills (the complaint) were made fully OS-independent.

## Next action
- USER: say "deploy" → `vercel --prod` (frontend only; NO rules/index change → no Probe-Deploy-Probe).
- USER L1 post-deploy: open Frontend → นัดหมาย (AppointmentHubView) in the real AdminDashboard, flip Dark/Light → confirm the cards + OPD pills look right (per workstyle "ไม่ self-test UI").

## Outstanding user-triggered actions
- Deploy (above). Bug → /systematic-debugging + Rule P.
