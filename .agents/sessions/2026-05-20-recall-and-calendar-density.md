# Session 2026-05-20 EOD+3 — Recall enhancements + Visual-Companion rule + appt-calendar-density spec/plan

## Summary

Three threads: (1) Recall list enhancements SHIPPED (phone tap-to-call + prominent note + staff logged-by + "Recall วันนี้" + pill rename); (2) durable skill/rule change (design → Visual Companion from question stage; plans = HTML with mockup AND flow always); (3) appointment-calendar-density brainstorm → research → spec → plan (DESIGN ONLY, not coded — implement next session). Ended early at user request ("context จะเต็ม"). All LOCAL, nothing deployed.

## Current State

- master = origin = `c5144c46` (clean, pushed). Prod still `0511be1e`.
- Full vitest **13697 pass / 0 fail / 0 skip** · build clean.
- Recall enhancements = code shipped + Rule R real-data verified; Rule Q L1 (visual) pending user.
- Calendar-density = spec + plan committed; **not implemented**. Resume by executing the plan.
- No rules/data ops this cluster; one combined `vercel --prod` pending (V18).

## Commits (this session, newest first)

```
c5144c46 docs(plan): appointment calendar density — 7-task plan
b96271c4 docs(spec): appointment calendar density + mobile — A+B+C
b0c74156 feat(recall): rename นัดหมาย sub-tab pill "Recall" → "Recall วันนี้"
08f11f41 docs(agents): EOD 2026-05-20 EOD+3 — Recall list enhancements
3671b206 chore(recall): Rule R diag (real be_recalls carry customerPhone + outcomeBy.name)
cb4a3842 test(recall): list-enhancements coverage + phase-29 contract fixups
51a8fdd8 feat(recall): tap-to-call phone + prominent note + staff logged-by + "Recall วันนี้"
91de743f docs(plan): Recall list enhancements implementation plan
9372f1e7 docs(spec): Recall list enhancements design
785c4b73 docs(rules): plans+specs HTML mockup AND flow + Visual Companion for design
```

## Files Touched (names only)

Recall source: `RecallRow.jsx` · `RecallOutcomeModal.jsx` · `RecallList.jsx` · `RecallSectionHeader.jsx` · `RecallFrontendView.jsx` · `RecallTogglePill.jsx` · `recallValidation.js` · `backendClient.js`.
Recall tests: NEW `recall-list-enhancements.test.jsx` + fixups (phase-29-recall-outcome-modal-rtl / row-rtl / list-rtl / frontend-tab-rtl / multi-surface-realtime / backend-client / flow-simulate / cdv-card-rtl / tab-rtl / 22-cases-view). Diag `scripts/diag-recall-list-enhancements-shape.mjs`.
Rule/skill: `~/.claude/skills/{brainstorming,writing-plans,executing-plans,subagent-driven-development}/SKILL.md` · `~/.claude/CLAUDE.md` · `F:/LoverClinic-app/CLAUDE.md` · memory `feedback_visual_companion_always_allowed.md` + `feedback_plans_html_with_mockup.md` + `MEMORY.md`.
Calendar-density (docs only): `docs/superpowers/research/2026-05-20-appt-calendar-density-research.html` · `specs/2026-05-20-appt-calendar-density-design.html` · `plans/2026-05-20-appt-calendar-density.html`.

## Decisions (1-line each)

- Recall Q1=A note=outcomeNote||reason · Q2=B staff dropdown blank+REQUIRED (gates Save) · Q3=A frontend = all overdue.
- recordRecallOutcome stores picked staff in `outcomeBy {name,staffId}`; logged-in account stays in `updatedBy`; RecallRow reads `outcomeBy?.name`.
- Calendar-density root cause = block height `span×SLOT_H` (15min=18px); SLOT_H already bumped 18→22 once → DON'T bump again (symptom).
- Calendar Q1=A click→read-only popover (+แก้ไข→edit modal) · Q2=A auto-agenda below `lg` + toggle · Q3=A agenda chronological + room tag.
- Calendar plan reuses STATUSES→appointmentDisplay helper + resolveAssistantNames + PhoneLink/CustomerOption + AppointmentLineBadge + existing edit modal (no dup). Names/HN never red.

## Next Todo

1. **Implement `docs/superpowers/plans/2026-05-20-appt-calendar-density.html` T1→T7** (inline rec — T3/T4/T6 edit `AppointmentCalendarView.jsx` sequentially). Order: T1 `appointmentDisplay.js` helpers → T2 `AppointmentDetailPopover.jsx` → T3 wire block click→popover → T4 span=1 single-line + "+N" rollup → T5 `AppointmentAgendaView.jsx` → T6 `useIsBelowLg` + responsive switch + toggle → T7 flow-simulate + full suite + Rule Q. (Plan NOTEs flag exact identifiers to grep: real STATUSES values, `resolveAssistantNames` path, appt `room` field, the per-day appt array feeding `apptMap`.)
2. **Deploy** combined `vercel --prod` (all EOD..EOD+3) when user says "deploy" (V18; rules unchanged).
3. **L1 hands-on** Recall enhancements (real screen) + calendar-density after build.
4. **V106** stock-movement 30-day retention (brainstorm locked, spec unwritten).

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-20 EOD+3.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=c5144c46, prod=0511be1e)
3. .agents/active.md (13697 pass / 0 fail)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-20-recall-and-calendar-density.md

Status: master=c5144c46, 13697 pass / 0 fail, prod=0511be1e LIVE
Next: implement appt-calendar-density plan docs/superpowers/plans/2026-05-20-appt-calendar-density.html (T1→T7, inline) — Recall enhancements + Visual-Companion rule already shipped this session.
Outstanding (user-triggered): deploy combined vercel --prod (EOD..EOD+3) · L1 hands-on Recall + calendar-density · V106 spec
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe; Rule Q V66 L1/L2 before "verified"; design→Visual Companion from question stage; plans=HTML mockup+flow
/session-start
```
