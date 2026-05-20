---
updated_at: "2026-05-20 EOD+3 LATE — Recall enhancements + pill rename shipped; calendar-density spec+plan ready to implement (next session)"
status: "✅ Recall shipped (13697 pass/0 fail/build clean); appt-calendar-density = spec+plan committed, NOT implemented yet · pushed · awaiting deploy + L1"
branch: "master"
last_commit: "c5144c46 docs(plan): appointment calendar density — 7-task plan"
tests: "13697 pass / 0 fail / 0 skip · build clean (docs-only since last full run)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0511be1e LIVE — NOTHING from EOD/EOD+1/EOD+2/EOD+3 deployed yet"
firestore_rules_version: "unchanged (UI + 1 fn-contract only — no rules/data ops this cluster)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = origin = `c5144c46` (clean, pushed). Prod still `0511be1e` — full EOD..EOD+3 cluster queued for ONE combined deploy.
- This session ended early (user: "context จะเต็ม") to resume the **appointment-calendar-density implementation** fresh next session.
- Checkpoint: `.agents/sessions/2026-05-20-recall-and-calendar-density.md`.

## What this session shipped (all LOCAL, awaiting deploy)

- **Recall list enhancements** (Q1=A note=outcomeNote||reason · Q2=B staff dropdown blank+required · Q3=A frontend all-overdue): shared RecallRow tap-to-call phone + prominent note + "บันทึกโดย" byline; recordRecallOutcome requires recordedBy→outcomeBy; RecallOutcomeModal required StaffSelectField; Frontend "Recall วันนี้" today(prominent)/overdue/tomorrow. + pill rename `🔔 Recall`→`Recall วันนี้`. Full vitest 13697/0; Rule R real-data confirmed; Rule Q L1 (visual/tactile) pending user.
- **Durable rule/skill change**: design topics → brainstorming auto-uses Visual Companion from question stage; plans (not just specs) = HTML with **mockup AND flow always**. Edited 4 user skills + both CLAUDE.md + 2 memory files + MEMORY.md.
- **Appointment calendar density (RESEARCH + DESIGN ONLY — not coded)**: root cause = block height `span×SLOT_H` (15min=18px illegible) + mobile 2D-scroll. Approved A+B+C. Research `docs/superpowers/research/2026-05-20-appt-calendar-density-research.html`; spec `docs/superpowers/specs/2026-05-20-appt-calendar-density-design.html`; **plan `docs/superpowers/plans/2026-05-20-appt-calendar-density.html` (7 tasks)**.

## Next action

- **Implement the calendar-density plan T1→T7** (inline recommended — T3/T4/T6 edit AppointmentCalendarView.jsx sequentially). T1 appointmentDisplay helpers → T2 AppointmentDetailPopover → T3 wire popover → T4 span=1 single-line + "+N" → T5 AppointmentAgendaView → T6 responsive auto-agenda<lg + toggle → T7 flow-simulate + full suite + Rule Q.

## Outstanding user-triggered actions

- **Deploy** all queued work (EOD..EOD+3: sub-tabs + Menu-D fixes + baseline + Recall enhancements) — one combined `vercel --prod` (V18; rules unchanged).
- **L1 hands-on** Recall enhancements (tap-to-call / note / byline / "Recall วันนี้" sections / Save-gated-until-staff / dark+light) + prior EOD UI.
- **V106** stock-movement 30-day retention — brainstorm locked, spec NOT written.
