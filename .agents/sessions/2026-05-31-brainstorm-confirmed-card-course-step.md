# Checkpoint — 2026-05-31 EOD+4 LATE+4 — Brainstorm + PLAN: confirmed-card highlight + course-step polish + ground-mockups rule

## Summary
Full `/brainstorming → spec → /writing-plans` cycle for 3 user-requested UI refinements
(confirmed-appt card highlight+reorder; OPD course-step muted; course-step in customer-detail
history). NO code shipped — implementation is NEXT session. Also encoded a NEW iron-clad
sub-rule (ground every mockup in the REAL existing design) after the user (rightly) scolded an
un-grounded first mockup.

## Current State
- master HEAD = this EOD docs commit (on `c5e3d47a`); prod UNCHANGED = `0c607f68` LIVE.
- NO src/ change. Tests NOT re-run (session-end rule) — last full = 15418/0 prior session.
- Decisions locked: **①A** sky-tint confirmed card + reorder-to-top (today, realtime) · **②A** course "ยังไม่ตัด"→muted "ไม่ตัดคอร์ส" · **③B** course step in CDV history, keep teal/amber connectors.
- Plan = 7 tasks, TDD, real line anchors; all cosmetic-shell + 1 pure helper; frontend/lib only.
- Ready to implement next session via subagent-driven-development.

## Commits (this session)
```
(EOD docs commit) docs(agents): EOD 2026-05-31 — brainstorm+spec+PLAN confirmed-card+course-step + ground-mockups rule
```
(No code commits — brainstorm/spec/plan/rule only.)

## Files Touched (names only)
- docs/superpowers/specs/2026-05-31-appt-confirmed-card-and-course-step-design.html (NEW spec)
- docs/superpowers/plans/2026-05-31-appt-confirmed-card-and-course-step.html (NEW plan, 7 tasks)
- docs/superpowers/mockups/2026-05-31-confirmed-card-and-course-step.html (NEW, v1 un-grounded — superseded)
- public/brainstorm-v2-grounded.html + public/brainstorm-confirmed-card-course-step.html (dev mockups — DELETE at deploy, plan Task 7)
- .claude/rules/01-iron-clad.md (NEW §S-design — ground mockups in existing design)
- ~/.claude (outside repo, persisted): memory feedback_ground_mockups_in_existing_design.md + MEMORY.md line + skills/brainstorming/SKILL.md
- .agents/active.md + SESSION_HANDOFF.md + this checkpoint

## Decisions (1-line each)
- ①A sky (not emerald) — matches the app's real "ยืนยันแล้ว" sky→cyan accent/chip (cohesive). Reorder = today tab only; recolour wherever confirmed.
- ② one SSOT (resolveCourseStepState 'warn'→'not-deducted') → muted reuses the existing pending/skip dim style; label "ไม่ตัดคอร์ส"; dot "–". Affects Frontend card + CDV history together.
- ③B (not 3A unify) — keep CDV's teal/amber connectors; just enable withCourseStep on the existing TreatmentLifecycleStepper call (simpler, less change).
- ③ trap: treatmentSummary mapper strips detail → compute courseDeducted in the mapper from raw t (V139/V104 family). Verify on real prod (Rule R) at implement.
- NEW rule: design mockups MUST replicate the REAL design first (screenshots + live app + exact source); BEFORE→AFTER; never invent. Origin: user anger this session.
- Tool-lag note: Chrome MCP can't open file:// (forces https://) — serve mockups via Vite public/ + http://localhost:5173/...; Claude Preview headless may lack CDN, so verify on the user's Browser 1.

## Next Todo
- Implement plan Task 1→7 (subagent-driven-development). No deploy until user says "deploy".
- At ship: add V-entry + AVxx (course-step consumers must receive courseDeducted from a source that has detail) per Rule P; delete public/brainstorm-*.html.

## Resume Prompt
```text
Resume LoverClinic — implement plan docs/superpowers/plans/2026-05-31-appt-confirmed-card-and-course-step.html
(spec: docs/superpowers/specs/2026-05-31-appt-confirmed-card-and-course-step-design.html · มติ ①A ②A ③B).
Read CLAUDE.md + SESSION_HANDOFF.md + .agents/active.md + .claude/rules/00-session-start.md first.
Status: master HEAD docs commit on c5e3d47a, prod 0c607f68 LIVE, 15418/0 (not re-run).
Start Task 1 (sortApptsConfirmedFirst). Use subagent-driven-development.
All cosmetic-shell + 1 pure sort helper; frontend/lib only; no Probe-Deploy-Probe; no deploy without "deploy".
```
