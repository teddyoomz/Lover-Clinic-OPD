---
updated_at: "2026-05-31 EOD+4 LATE+4 — Brainstorm→spec→PLAN: confirmed-card highlight/reorder + course-step muted (①A/②A/③B). NOT implemented (next session). + NEW rule ground-mockups-in-existing-design."
status: "Plan ready for implementation next session. NO code shipped this session (docs/rule only). Prod UNCHANGED = 0c607f68."
branch: "master"
last_commit: "EOD docs commit (on 0c607f68) — spec+plan+rule+mockups. Prod LIVE = 0c607f68."
tests: "15418/0 (last full run PRIOR session; NOT re-run — session-end rule; no src changed this session)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0c607f68 LIVE (V142 course double-deduct + V143 stock). UNCHANGED this session."
firestore_rules_version: "UNCHANGED. No rules/storage/index/cron touched."
---

# Active Context — Brainstorm + PLAN: confirmed-card + course-step (2026-05-31 EOD+4 LATE+4)

## State
- NO code shipped. Brainstorm (Visual Companion grounded in REAL component source) → spec → plan DONE. Implementation = NEXT session.
- Decisions locked: **①A** sky-tint confirmed card + reorder-to-top (today tab) realtime · **②A** course "ยังไม่ตัด"(amber)→muted "ไม่ตัดคอร์ส" · **③B** add course step to CDV history, keep teal/amber connectors.
- NEW iron-clad sub-rule **"ground every mockup in the EXISTING design FIRST"** encoded 4 places (memory + `.claude/rules/01-iron-clad.md` §S-design + brainstorming SKILL.md).

## What this session shipped (docs/rule only → checkpoint 2026-05-31-brainstorm-confirmed-card-course-step.md)
- spec `docs/superpowers/specs/2026-05-31-appt-confirmed-card-and-course-step-design.html`
- plan `docs/superpowers/plans/2026-05-31-appt-confirmed-card-and-course-step.html` (7 tasks, TDD, real line anchors)
- rule "ground-mockups-in-existing-design": memory `feedback_ground_mockups_in_existing_design.md` + MEMORY.md + `01-iron-clad.md` §S-design + `~/.claude/skills/brainstorming/SKILL.md`
- dev mockups `public/brainstorm-v2-grounded.html` + `public/brainstorm-confirmed-card-course-step.html` — **DELETE at deploy** (plan Task 7)
- ③ root-cause VERIFIED: `CustomerDetailView` treatmentSummary mapper (~L564) strips `detail` → must compute `courseDeducted` in the mapper (V139/V104 class trap)

## Next action
- Implement the plan Task 1→7 via `subagent-driven-development`. All cosmetic-shell + 1 pure sort helper; frontend/lib only; NO Probe-Deploy-Probe; NO deploy until user types "deploy".

## Outstanding user-triggered actions
- Implement plan next session (above).
- (carryover) L1 hands-on V142/V143 (2-device live balance + NK shows 0); cron stock-lot-cleanup active 03:45 BKK.
