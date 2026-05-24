---
updated_at: "2026-05-24 EOD+1 LATE+1 — V124+V125+V126 DEPLOYED"
status: "9af2989e LIVE on prod. All client-only — no rule change."
branch: "master"
last_commit: "feat(appt-flow): V124 bubble parity + V125 cancel cascade + V126 mark-complete gate"
tests: "157 PASS (V125+V124+V73+V121+V118) · build clean 3.08s · L1 verified"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "9af2989e LIVE · office-to-pdf-00007-tfb (Cloud Run V110-bis)"
firestore_rules_version: "unchanged · P-D-P 200/403/403 = 200/403/403"
---

# Active Context

## State
- 3 V-entries shipped + deployed in one /systematic-debugging cycle. Bubble drops on cancel, mark-complete gated on confirmed.
- Strategic direction noted (NOT implemented): user wants นัดหมาย tab as primary; eventually deprecate คิวหน้า Clinic / จองไม่มัดจำ / จองมัดจำ tabs. V125 cascade is the tactical first step.
- V117-V123-fix1 still REVERTED (pre-perf-cron). Can re-introduce via brainstorm if needed.

## What this session shipped
- **V124** bubble↔badge predicate parity (AV124) — `isAppointmentPendingOpdSave({appt, linkedSession}) = resolveCardOpdState === 'D'`. Memo iterates `apptData.appointments`.
- **V125** cancel cascade (AV125) — predicate excludes cancelled + `hideOpdLifecycle` per-row + `onCancelAppt` cascade-archives linked opd_session.
- **V126** workflow-strict mark-complete gate — `&& rawStatus === 'confirmed'` on `showMarkCompleteBtn`. V21 fixup on V73 test bank.
- L1 verified all 3 in real browser via DOM eval.
- Detail → `.agents/sessions/2026-05-24-v124-v125-v126.md`.

## Next action
- **idle** — await user direction. L1 hands-on by user on real cancel + mark-complete flows.
- **Strategic brainstorm (deferred)** — นัดหมาย tab unification (deprecate 3 sibling tabs). User-triggered.
- **Cron monitoring** (carryover) — `be_admin_audit/{opd-session-cleanup-sweep,chat-history-retention-sweep}-*` over next 24h.

## Outstanding user-triggered actions
- L1 hands-on cancel + mark-complete flow check on real prod
- Brainstorm นัดหมาย-tab unification
- Cron audit doc monitoring (passive)

## Notes
- V124+V125+V126 all client-only. No rules/index/Cloud Run change.
- V18: deploy auth never carries forward.
- AV124+AV125 closed-list invariants; future bubble surfaces MUST go through `isAppointmentPendingOpdSave`; new cancel handlers MUST cascade-archive.
