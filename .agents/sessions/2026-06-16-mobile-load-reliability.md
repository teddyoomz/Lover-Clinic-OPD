# Checkpoint — 2026-06-16 EOD+2 — Mobile-Load Reliability (SHIPPED + DEPLOYED + L1-verified LIVE)

## Summary
Mobile first-load reliability: pages sometimes hung on a black screen / stuck "กำลังโหลด" spinner / empty skeleton across the staff app AND every customer link (PatientForm, ED-Scoring, view-data, view-appointment) — fixed only by a manual refresh. Root cause = no long-polling fallback (half-dead WebSocket on flaky mobile) + no timeout/escape on any onSnapshot + a hangable anon-auth gate. `/brainstorming`→spec→`/writing-plans`(14 tasks)→inline impl→adversarial bug-hunt Workflow loop (Ultracode). Converged after R1→R4 (R4 clean), DEPLOYED frontend-only to prod, L1-verified on the live build.

## Current State
- master `d54d58c4` (=origin), tree clean. prod = frontend `lover-clinic-p4uawr0kx` @ lover-clinic-app.vercel.app (HTTP 200). firestore.rules UNCHANGED (frontend-only → no Probe-Deploy-Probe).
- full vitest **16673/0** (+~65; lone utils.test.js full-suite blip = confirmed transient parallel flake — green isolated 84/0 + clean re-run) + build clean.
- **Rule Q L1 Playwright 3/0 on the LIVE deployed build** (iPhone-13): blocked-auth→ลองใหม่→recover; half-dead-firestore→auto-recover WITHOUT refresh (captured live t3s `กำลังโหลด`→t10s resolved); normal→resolves.
- **Rule Q L2 7/0 real prod** (`scripts/e2e-mobile-load-coldstart.mjs`): exact anon + staff queries resolve under BOTH autoDetectLongPolling AND forced long-polling → fallback transport proven on prod.
- Adversarial loop CONVERGED: R1 (6-finder/verify)→1 race; R2→resetKey gap; R3→orphaned-timer (MY R2 fix's bug, re-hunt caught); R4→0 findings.

## Commits (this session, on master)
```
a4374004 docs(agents): mobile-load reliability SHIPPED + DEPLOYED + L1-verified live
d54d58c4 fix(useResilientLoad): R3 — resetKey in timer-effect deps (orphaned mount-timer)
564282c4 fix(useResilientLoad): adversarial-hunt — sync settledRef + resetKey re-arm
060ff26f test(mobile-reliability): Rule-Q L1 Playwright 3/0 + L2 cold-start 7/0 real prod
fcb3b8c1 feat(mobile-reliability): autoDetectLongPolling + useResilientLoad + LoadErrorRetry + shared reconnect; wire 6 surfaces + App.jsx auth gate
347aa945 docs(mobile-reliability): spec + plan
(+ EOD docs commit for this checkpoint)
```

## Files Touched
- SRC (new): `src/lib/firestoreReconnect.js` · `src/hooks/useResilientLoad.js` · `src/components/LoadErrorRetry.jsx`
- SRC (edit): `src/firebase.js` (initializeFirestore autoDetectLongPolling) · `src/App.jsx` (V17→shared reconnect + resilient anon-auth gate) · `src/pages/PatientForm.jsx` · `src/pages/ClinicSchedule.jsx` · `src/pages/PatientDashboard.jsx` · `src/pages/AdminDashboard.jsx` · `src/hooks/useBranchAwareListener.js` · `src/pages/BackendDashboard.jsx`
- TESTS (new): `tests/firestore-reconnect.test.js` · `use-resilient-load.test.jsx` · `load-error-retry-rtl.test.jsx` · `use-branch-aware-listener-retry.test.jsx` · `clinic-schedule-resilient-flow.test.jsx` · `mobile-load-reliability-source.test.js` · `tests/e2e/mobile-load-reliability.spec.js` · `scripts/e2e-mobile-load-coldstart.mjs`. V21 fixups: `tests/extended/{mobile-resume-firestore-reconnect,public-link-auth-race}.test.js`
- DOCS: spec+plan `docs/superpowers/{specs,plans}/2026-06-16-mobile-load-reliability*` · V-log entry (00-session-start §2)

## Decisions (1-line each)
- Q1 = NO offline cache (fresh-always) — customers must never see stale course/appointment data.
- Q2 = auto-retry (8s) → silent → if still failing, "ลองใหม่" card (never stuck, no full reload).
- Q3 = all test layers + L2 (Playwright mobile + unit/flow-sim + client-SDK cold-start).
- autoDetectLongPolling not forceLongPolling (keep WS speed; fall back only when broken) — ponytail ceiling noted in firebase.js.
- One shared debounced reconnectFirestore (Rule of 3: V17 + useResilientLoad + useBranchAwareListener) → no multi-listener toggle thrash.
- doc-not-found = markReady (a successful load); only never-fires/onError → retry.
- settledRef set SYNCHRONOUSLY (R1) — a state-synced ref read by a setTimeout is racy.
- resetKey re-arms the loader on a context switch (AdminDashboard branch) + lives in the TIMER deps (R3) so the stale mount-timer is cleared.
- Backend tabs auto-heal silently via useBranchAwareListener (backward-compatible, void return); per-tab error buttons out of scope.

## Next Todo
- Idle / await next task. Optional: staff-browser hands-on of the AdminDashboard queue banner + backend auto-heal (unit + L2 proven; not in the automated L1).
- Carried (user-triggered): ROTATE LINE/FB secrets (AV195); LINE-OA URL-encode chip `task_1a3ac96c`.

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-06-16 EOD+2.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=d54d58c4, prod=lover-clinic-p4uawr0kx)
3. .agents/active.md (16673 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-06-16-mobile-load-reliability.md

Status: master=d54d58c4 (=origin), 16673/0 pass, prod LIVE (frontend-only, L1-verified on the deployed build). Mobile-load reliability shipped; adversarial loop converged R1→R4.
Next: idle / await task.
Outstanding (user-triggered): ROTATE LINE/FB secrets (AV195); LINE-OA URL-encode chip task_1a3ac96c.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (Rule B).
/session-start
```
