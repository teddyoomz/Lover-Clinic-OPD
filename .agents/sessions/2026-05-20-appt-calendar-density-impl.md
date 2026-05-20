# Session 2026-05-20 EOD+4 — Appointment calendar density A+B+C implemented (T1-T7)

## Summary

Executed `docs/superpowers/plans/2026-05-20-appt-calendar-density.html` T1→T7 inline (executing-plans skill). Shipped the 3-layer density fix: A read-only detail popover (tap any block), B adaptive span=1 single-line cell + "+N" rollup, C mobile chronological agenda + responsive auto-switch below `lg`. All LOCAL, 7 commits pushed, nothing deployed (V18).

## Current State

- master = origin = `224da316` (clean, pushed). Prod still `0511be1e`.
- Full vitest **13756 pass / 0 fail / 0 skip** (+59 net); build clean.
- Recall enhancements + Visual-Companion rule shipped prior session (EOD+3).
- No rules/data ops this cluster (UI-only). One combined `vercel --prod` pending (V18).
- Rule Q: logic/wiring/leaf-render covered (Rule I + RTL + source-grep + full suite); visual/tactile/responsive L1 = user-pending (real screen).

## Commits (this session, oldest first)

```
eb04dffa feat(appt): shared appointment display helpers (T1)
c3e36cb4 feat(appt): read-only AppointmentDetailPopover (T2)
d739b51e feat(appt): grid block click opens detail popover (T3)
75d23e88 feat(appt): span=1 single-line cell + +N rollup via popover (T4)
0ec74a8d feat(appt): AppointmentAgendaView chronological cards (T5)
70e38846 feat(appt): responsive auto-agenda below lg + grid/agenda toggle (T6)
224da316 test(appt): calendar-density flow-simulate + pre-existing fixups (T7)
```

## Files Touched (names only)

NEW src: `src/components/backend/AppointmentDetailPopover.jsx` · `src/components/backend/AppointmentAgendaView.jsx` · `src/hooks/useIsBelowLg.js`.
MOD src: `src/lib/appointmentDisplay.js` (extended) · `src/components/backend/AppointmentCalendarView.jsx`.
NEW tests: `appointment-display-helpers` · `appointment-detail-popover-rtl` · `appointment-agenda-view-rtl` · `appt-calendar-density` (source-grep) · `use-is-below-lg` · `appt-calendar-density-flow-simulate`.
V21 fixups: `phase-21-0-quinquies-visual-polish.test.js` (Q2+Q4) · `phase15.7-septies-customer-link-new-tab.test.js` (SE2.4).

## Decisions (1-line each)

- A=read-only popover (block tap → details → แก้ไข routes to existing edit modal); B=span=1 single 18px line via `nameSizeCls` + "+N" rollup pills → popover; C=auto-agenda <lg + manual toggle.
- `appointmentDisplay.js` already existed → EXTENDED (not created); `APPT_STATUSES` = single source, grid imports it (Rule of 3); kept real 4 statuses (no 'arrived'; pending=orange).
- Popover roomName resolved via `effectiveRoom(appt)` (grid loop `room` var out of scope at render); agenda fed by `typedDayAppts` + `resolveRoom={effectiveRoom}`.
- Reused `PhoneLink` for tap-to-call in popover + agenda (Rule of 3); popover portaled (AV98); backdrop-no-close (AV78); names/HN never red.
- NO SLOT_H bump (root-cause discipline — block height = span×SLOT_H−4, not a per-slot height issue).
- Agenda card = `<div role="button">` not `<button>` (nested `tel:` `<a>` would be invalid HTML inside a button).

## Next Todo

1. **Deploy** combined `vercel --prod` (all EOD..EOD+4: sub-tabs + Menu-D fixes + baseline + Recall + calendar-density) when user says "deploy" (V18; rules unchanged).
2. **L1 hands-on** (real screen): span=1 legibility at 18px · tap→popover · resize <lg → agenda · grid/agenda toggle · dark+light · names/HN non-red. + prior Recall enhancements.
3. **V106** stock-movement 30-day retention — brainstorm locked, spec NOT written.

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-20 EOD+4.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=224da316, prod=0511be1e)
3. .agents/active.md (13756 pass / 0 fail)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-20-appt-calendar-density-impl.md

Status: master=224da316, 13756 pass / 0 fail, prod=0511be1e LIVE
Next: idle — deploy (user "deploy") OR V106 stock-retention spec OR L1 hands-on
Outstanding (user-triggered): deploy combined vercel --prod (EOD..EOD+4) · L1 hands-on calendar-density + Recall · V106 spec
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe; Rule Q V66 L1/L2 before "verified"; design→Visual Companion from question stage; plans=HTML mockup+flow
/session-start
```
