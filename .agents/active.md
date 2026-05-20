---
updated_at: "2026-05-20 EOD+4 — appt-calendar-density T1-T7 implemented (popover + adaptive cell + agenda + responsive)"
status: "✅ Calendar-density shipped (13756 pass/0 fail/build clean); pushed; awaiting deploy + L1"
branch: "master"
last_commit: "224da316 test(appt): calendar-density flow-simulate + pre-existing fixups (T7)"
tests: "13756 pass / 0 fail / 0 skip · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0511be1e LIVE — NOTHING from EOD..EOD+4 deployed yet"
firestore_rules_version: "unchanged (UI-only cluster — no rules/data ops)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = origin = `224da316` (clean, pushed). Prod still `0511be1e` — full EOD..EOD+4 cluster queued for ONE combined deploy.
- Calendar-density plan fully implemented (7 commits, inline). Recall enhancements + Visual-Companion rule shipped prior session.
- Checkpoint: `.agents/sessions/2026-05-20-appt-calendar-density-impl.md`.

## What this session shipped (all LOCAL, awaiting deploy)

- **Appt calendar density A+B+C** — executed `plans/2026-05-20-appt-calendar-density.html` T1-T7 inline: T1 `appointmentDisplay.js` extended (`APPT_STATUSES` single-source + 4 helpers; grid imports palette = Rule of 3) · T2 `AppointmentDetailPopover` (portaled AV98, reuses PhoneLink, AV78 backdrop-no-close, name/HN non-red) · T3 block click→popover (แก้ไข→edit) · T4 span=1 single 18px line + +N rollup→popover (NO SLOT_H bump) · T5 `AppointmentAgendaView` (chronological cards, `<div role=button>` so `tel:` `<a>` legal) · T6 `useIsBelowLg` auto-agenda <lg + grid/agenda toggle (fed by `typedDayAppts`) · T7 flow-simulate + 3 V21 fixups.
- Plan adaptations: `appointmentDisplay.js` already existed → extended; real 4 statuses (no 'arrived', pending=orange); room via `effectiveRoom`; agenda fed `typedDayAppts`+`resolveRoom`.
- Full vitest 13756/0 (+59 net); build clean. Rule Q: logic/wiring/leaf-render covered (Rule I + RTL + source-grep); visual/tactile/responsive L1 = user-pending (real screen). NOT deployed (V18).

## Next action

- **Deploy** combined `vercel --prod` (all EOD..EOD+4) when user says "deploy" (V18; rules unchanged) — OR start V106 stock-retention spec.

## Outstanding user-triggered actions

- **Deploy** all queued work — one combined `vercel --prod` (V18; rules unchanged).
- **L1 hands-on** calendar-density (span=1 legibility 18px · tap→popover · resize<lg→agenda · toggle · dark+light · names/HN non-red) + prior Recall enhancements — headless preview can't show visual/tactile, real screen needed.
- **V106** stock-movement 30-day retention — brainstorm locked, spec NOT written.
