# Session 2026-05-09 EOD #21 — V64-fix8 patient name link

## Summary
V64-fix8 shipped + DEPLOYED to prod via combined `vercel --prod` + `firebase deploy --only firestore:rules`. Patient name in V64 AppointmentHubRowCard now opens customer detail page in a new browser tab via the canonical `buildCustomerDetailUrl(id)` helper from Phase 15.7-septies. 4th UI surface to adopt the helper (Rule of 3 lock).

## Current State
- master = `dcb6c41` · prod = `dcb6c41` (0 ahead)
- 8187 tests passed · build clean
- DEPLOYED 2026-05-09 #21 — vercel 50s + firebase idempotent (rules unchanged from `1da05bb`)
- Probe-Deploy-Probe pre+post: probe 1 + probe 5 GREEN both rounds; probes 2/3/4 = expected V50-followup-2 false-positives, ignored
- Cleanup: 31 probe artifacts nuked (chat_conversations 20 · pc_appointments 1 · opd_sessions 9 · proclinic_session probe-field stripped 1)

## Commits

```
dcb6c41 feat(V64-fix8): patient name → clickable link to customer detail (new tab)
```

## Files Touched
- `src/components/admin/AppointmentHubRowCard.jsx` — import `buildCustomerDetailUrl` + conditional `<a>`/`<div>` on patient-name; data-testid `row-name` preserved + new `data-customer-id` attr; hover-underline + sky-500 + Thai title tooltip
- `tests/v64-appointment-hub-rtl.test.jsx` — V64.R8 nested describe block, 7 tests R8.1–R8.7

## Decisions (one-liner each)
- `<a target="_blank">` over `button + onClick` — right-click / middle-click / keyboard activation work natively + `rel="noopener noreferrer"` for security defense-in-depth
- Conditional render (anchor when customerId truthy, fallback `<div>` when falsy) — avoids `<a href="#">` dead-link anti-pattern + handles walk-in/unlinked appointments
- Reuse `buildCustomerDetailUrl` from `src/lib/customerNavigation.js` — Rule of 3 lock at 4 callsites (AdminDashboard kiosk + AppointmentFormModal + DepositPanel + MembershipPanel + V64-fix8); no new helper
- Skip preview verification per `feedback_user_workstyle` standing rule "ไม่ต้อง self-test UI" — 7 RTL tests + build clean cover the wiring; user verifies UI themselves
- Per Rule N: small UX edit → targeted-test-only during iteration; full vitest at end-of-batch (= now session-end)
- Combined deploy per Rule 02 V15: vercel + firebase parallel; probes 2/3/4 = known false-positives per Session #20 precedent (collections deleted in V50-followup-2; non-blocking)

## Tests
- 47/47 V64 RTL + flow-simulate GREEN (`tests/v64-appointment-hub-rtl.test.jsx` + `tests/v64-appointment-hub-flow-simulate.test.jsx`)
- Full suite: 8187 passed (1 pre-existing `bsa-task7-h-quater-fix` flake — out of scope this session)
- Build: clean (chunk-size warning only, pre-existing)

## Verify
- https://lover-clinic-app.vercel.app/admin → tab `นัดหมาย` → list view → click patient name → new browser tab opens BackendDashboard `?backend=1&customer=<id>` → customer detail page renders

## Next action
Idle — V64-fix8 deployed; production stable.

## Outstanding user-triggered actions
- (Optional, unchanged) `scripts/probe-deploy-probe.mjs` probes 2/3/4 still test V50-stripped collections — false-positive 403 each deploy; ignored manually
- (Optional, unchanged) `bsa-task7-h-quater-fix` flake — passes standalone, flakes in full-suite parallel runs

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-09 EOD #21.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=dcb6c41, prod=dcb6c41)
3. .agents/active.md (8187 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-09-v64-fix8-patient-name-link.md

Status: master=dcb6c41, 8187 tests pass, prod=dcb6c41 LIVE
Next: idle (V64-fix8 deployed; production stable)
Outstanding (user-triggered):
  - (optional) probe-deploy-probe.mjs probes 2/3/4 false-positive trim
  - (optional) bsa-task7-h-quater-fix flake
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe
/session-start
```
