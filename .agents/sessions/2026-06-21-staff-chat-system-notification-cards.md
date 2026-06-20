# 2026-06-21 — Staff-chat "ระบบ" System notification cards (AV198) — SHIPPED + DEPLOYED LIVE

## Summary
When a customer finishes the intake form OR a follow-up assessment, the `sendPushOnSubmit` Cloud Function now ALSO writes a beautiful "ระบบ" notification card into that branch's staff chat — sparkles icon, customer name + HN, and a clickable name that opens `/?backend=1&customer=<id>` in a new tab (the RecallRow deep-link pattern). Intake cards (no `be_customer` yet) live-resolve to clickable + HN the moment the walk-in is registered. Full pipeline: `/brainstorming` → spec → `/writing-plans` (14 tasks) → inline impl → 8-round adversarial bug-hunt (CONVERGED) → deploy. AV198.

## Current State
- master `a62c20c4` (+ EOD docs commit). DEPLOYED: vercel `lover-clinic-cc7twr3pm` → lover-clinic-app.vercel.app + `firebase deploy --only functions,firestore:rules`.
- firestore.rules CHANGED + deployed (system-card immutability) → Probe-Deploy-Probe **13/13** (WS1 pre+post).
- full vitest **16914/0**; build clean; functions syntax OK.
- L2 e2e **14/0 on real prod** (build→write→branch-query→intake PENDING→register→FLIP→follow-up immediate→cleanup zero orphans). Rule R diag: branchId 35/35 intake + 5/5 follow-up.
- Honest L1 gap: real form-submit → card in authed staff chat + live flip = USER hands-on (auth-gated); staff-client delete-denied positive rule probe (no staff E2E creds) — covered by source-grep + rule logic + WS1.

## Commits
```
05a74dce docs(spec) · [plan in EOD docs commit — its own commit was eaten by a Bash-classifier outage]
ca2492be feat: System notification cards (AV198)
1406b77a test: Rule R diag + Rule Q L2 e2e 14/0
1994ee2f R1 deleted-customer downgrade · 12647bce R2 no-tokens(CRIT)+listener-log
5c7d21e3 R3 idempotent id(CRIT)+reply-guard · 7cbd0e2e R4 Q4 lock (0 real)
95086ebe R5 contrast · 27358c78 R6 rule-layer immutability · a62c20c4 R7 hook↔picker
```

## Files Touched
NEW: `functions/staffChatNotify.js`, `src/lib/staffChatNotifyResolve.js`, `src/components/staffchat/StaffChatSystemCard.jsx`, `scripts/{diag-opd-session-branchid,e2e-staff-chat-system-notify}.mjs`, `tests/staff-chat-system-notify-{builder,resolve,flow-simulate,av198,unread}.test.js` + `staff-chat-system-card-rtl.test.jsx`, spec+plan html.
MOD: `functions/index.js`, `src/components/staffchat/StaffChatMessage.jsx`, `src/hooks/useStaffChat.js`, `src/lib/staffChatClient.js`, `firestore.rules`, `tests/staff-chat-reply-attachment-preview.test.js`, audit-anti-vibe-code SKILL.md (AV198).

## Decisions (1-line each)
- Q1=A full card · Q2=sparkles · Q3=intake name-only → live-resolve via `opd_session.brokerProClinicId` (no PII, no reg-flow change) · Q4=counts unread + plays chat sound (works automatically via V82).
- Server write is BEFORE the FCM send + BEFORE the token guards → card writes regardless of push-delivery/tokens; AFTER isUnread + test-mute guards (test-mute suppresses the card too — correct).
- Deterministic card id `CHAT-SYS-<sessionId>` → idempotent (no duplicate on double-submit). Deleted customer → downgrade to plain text + "ไม่พบข้อมูลลูกค้า"; transient throw keeps the optimistic link.
- Read-only contract enforced at UI + `buildReplySnapshot` + firestore.rules (clients can't forge/delete a system card; admin SDK only). Name = sky (never red); label = theme-aware rose (AA both themes).

## Bug-hunt loop (8 rounds, Ultracode Workflow — find→adversarial-verify→adjudicate)
R1:1 real → R2:2 (incl CRITICAL no-tokens) → R3:2 (incl CRITICAL dup-on-retry) → R4:0 (Q4-chime = intended; locked) → R5:1 (contrast) → R6:1 (rules) → R7:1 (latch consistency) → **R8:0 confirmed = CONVERGED**. Adjudicated-refuted: cross-branch (per-branch by design), session-stuck-pending (semantically correct + near-zero), same-ms tie (negligible + bad fix), sky-700 light (correct AA). V162 lesson: agents overstate — adjudicate each.

## Next Todo
- USER L1: submit a real intake/follow-up → confirm the card lands in the right branch chat (sparkles + name + HN, clickable) + the pending→registered flip live.
- Idle otherwise.

## Resume Prompt
Resume LoverClinic — staff-chat "ระบบ" System notification cards (AV198) SHIPPED + DEPLOYED LIVE (intake+follow-up → per-branch card, clickable name+HN, intake live-resolves on registration; counts unread + chimes). 8-round bug-hunt converged. master `a62c20c4`; prod LIVE (vercel + firebase functions,rules; Probe-Deploy-Probe 13/13). full vitest 16914/0; L2 e2e 14/0 real prod. Next: idle (USER L1: real form → card + flip). Read `.agents/active.md` + SESSION_HANDOFF top + this checkpoint. /session-start
