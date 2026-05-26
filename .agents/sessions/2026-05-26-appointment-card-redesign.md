# 2026-05-26 EOD+6 — Appointment card cosmetic-shell redesign (5-band + theme-matched OPD pills)

## Summary
Redesigned `AppointmentHubRowCard` into a 5-band layout (header / finance / detail / OPD-footer / actions), beautiful + theme-correct in BOTH Dark and Light, and fixed the user-reported washed/green-on-green OPD lifecycle pills. Pure cosmetic-shell — zero changes to any button wiring/flow/logic/data-testid/conditional. Shipped LOCAL, NOT deployed.

## Current State
- master = `4fd1c039` (docs) / feature `1e74b064`; prod UNCHANGED `459a4ea3` (awaits explicit "deploy", V18).
- Full suite **14818 pass / 0 fail** · build clean · touched src files grep-clean (no IIFE-in-JSX, name never red).
- NO firestore.rules / index / data change → no Probe-Deploy-Probe.
- L1 real-browser BOTH themes verified (Rule Q-vis); temp harness deleted, never committed.
- 3 modified rule files in working tree (`CLAUDE.md`, `00-session-start.md`, `01-iron-clad.md`) are pre-existing EOD+6 Rule S edits — NOT mine, left untouched.

## Commits
```
4fd1c039 docs(agents): EOD 2026-05-26 EOD+6 — card 5-band redesign + theme-matched OPD pills SHIPPED LOCAL
1e74b064 fix(appt-card): OPD pills data-theme-driven (OS-independent) — Rule Q-vis finding (T6)
ffc65d55 docs(audit): AV136 — appointment card cosmetic-shell redesign invariant (T5)
bd54b94b test(appt-card): V21-fix v118-rtl R3.4 for removed OPD-lifecycle header (T4)
fc7b75b1 feat(appt-card): 5-band layout re-architecture (cosmetic-shell) (T3)
789821e0 feat(appt-card): theme-match OPD pills + remove header + rename save→บันทึกเข้าระบบ (T2)
72665479 feat(appt-card): add theme-matched OPD_PILL token family (T1)
804e341b docs(plan): appointment-card redesign 6-task plan
7a6289eb docs(spec): appointment-card redesign v2 — approved (dual-theme mockup)
```

## Files Touched
- `src/components/admin/_apptHubStyles.js` — NEW `OPD_PILL` token family (data-theme classes).
- `src/components/admin/OpdLifecycleRow.jsx` — tokens + remove "OPD lifecycle" header (Q5) + rename save → "บันทึกเข้าระบบ" (Q6); all 6 data-testids/predicates/handlers byte-for-byte.
- `src/components/admin/AppointmentHubRowCard.jsx` — 5-band re-layout; every testid/handler/conditional/button verbatim; name stays sky; stepper re-parented unchanged. Dropped unused CARD_SURFACE import.
- `src/index.css` — NEW `.opd-pill-{blue,emerald,wait,save}` (dark default + `[data-theme=light|auto]` override; OS-independent).
- NEW `tests/appointment-card-redesign.test.jsx` (T1 tokens · T2 theme-match+Q5+Q6 · T3 cosmetic-shell 26-testid + T3.5 no-IIFE · T5 AV136 presence).
- `tests/v118-card-opd-lifecycle-row-rtl.test.jsx` — V21-fix R3.4 (removed-header).
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — NEW AV136.
- spec/plan `docs/superpowers/{specs,plans}/2026-05-26-appointment-card-redesign*`.

## Decisions (1-line each)
- Q1=C — full band-architecture layout redesign (not 3-column polish).
- Q2=A — OPD pills theme-matched dual-tone (blue/emerald/wait/save).
- Q3=A — refined Editorial Ember (warm accent both themes).
- Q4=A — round-circle สถานะ OPD stepper untouched, re-position only (shared Phase 28 `TreatmentLifecycleStepper`; recolor would propagate to Backend treatment-history). User emphatic "เด็ดขาด" after an early mockup drew it wrong → corrected to a verbatim screenshot replica before approval.
- Q5 — remove "⚙ OPD Lifecycle" header label · Q6 — rename save "บันทึกลง OPD"→"บันทึกเข้าระบบ" (label only; handler + data-testid unchanged).
- **Rule Q-vis pivot (T6)**: T1/T2 used Tailwind `dark:` (mirror neighbors); live real-browser check on a DARK-OS machine showed `dark:` is OS-coupled here (no `darkMode` config) → washed pills in `data-theme=light` (same bug class). Switched OPD pills to data-theme-driven `.opd-pill-*` in index.css → OS-independent → verified by eye both themes. AV136 codifies "OPD pills MUST be data-theme-driven, not dark:".
- Lesson (mockup discipline): an OFF-LIMITS component in a redesign mockup MUST be drawn as an exact replica of its real appearance (the stepper), never a stylized stand-in — an inaccurate depiction reads as redesigning the protected area + voids approval. Memory `feedback_mockup_depict_offlimits_verbatim.md`.
- GAP (disclosed): the card's neighbor chips (STATUS/TYPE/finance) still use OS-coupled `dark:` — pre-existing systemic, out of scope; only the OPD pills (the complaint) made OS-independent.

## Next Todo
- USER: "deploy" → `vercel --prod` (frontend only; no rules/index change → no Probe-Deploy-Probe).
- USER L1 post-deploy: real AdminDashboard Frontend → นัดหมาย (AppointmentHubView), flip Dark/Light → confirm cards + OPD pills.
- (optional follow-up) migrate the card's neighbor chips off OS-coupled `dark:` to data-theme for full OS-independence.

## Resume Prompt
See SESSION_HANDOFF.md Current State (EOD+6) + this checkpoint. master=4fd1c039, prod=459a4ea3 LIVE. Next = USER deploy + L1. No deploy without "deploy" THIS turn (V18).
