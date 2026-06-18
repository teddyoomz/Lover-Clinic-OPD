# 2026-06-18 — ED box (round-select + detail modal + viewing-state) + follow-up push name+HN

## Summary
Three features on the ED Score box + its follow-up FCM push, each via /brainstorming or
/systematic-debugging → spec → plan → inline impl → test → adversarial Workflow. SHIPPED
local (committed + pushed), NOT deployed (user: "session end เลย ยังไม่ต้อง deploy").

## Current State
- master HEAD `92c5ab0b` (=origin, tree clean). prod UNCHANGED (`00da035d` frontend `lover-clinic-p4uawr0kx`).
- full vitest **16722/0** + build clean (16718 → +N11-13 notification + C6).
- Deploy when authorized (V18): frontend 3 ED features → `vercel --prod`; **notification → `firebase deploy --only functions`** (needed for the push to take effect). No firestore.rules change → no Probe-Deploy-Probe.
- Honest gap (Rule Q): ED L1 pixel render (authed CDV) + notification L1 real-push = USER hands-on after deploy (no staff creds/device this session).

## Features
1. **ED chip round-select** (`/brainstorming` Q1=A click-row+back, Q2=A keep-default): click a
   history row → chips show that round's snapshot + header "กำลังดู: ครั้งที่ N" + "← ไปที่ครั้งล่าสุด";
   default (no selection) = merged latestPerType UNCHANGED (additive, zero-risk).
2. **ED chip → per-question detail modal** (`/brainstorming` Q1=A modal, Q2=A canonical+new-view):
   click ADAM/IIEF/MRS/PE chip → EDDetailModal — full question text + customer's answer (option
   label) for that round + score banner; AV78 explicit-close (X/ESC, backdrop no-close). NEW
   canonical `src/lib/edQuestions.js` (questions + per-q options + `buildEdAnswerRows`). "—" chips
   not clickable; modal shows the round the chip value came from.
3. **viewing-state for PAST rounds only** (`/systematic-debugging`, ultrathink): the "← ไปที่ครั้งล่าสุด"
   button (+ the whole viewing state: "กำลังดู:" header / snapshot chips / row highlight) showed even
   when viewing the latest (hero) round. Root fix: derived `viewingPast = selectedRound && hero &&
   selectedRound.id !== hero.id` gates all of it → selecting the latest = default home view (no
   redundant button, no stuck state); robust to delete-renumber (a selected round that becomes the
   new hero self-corrects). Rewrote R6/C1-C5 to the corrected model + new C6.
4. **Follow-up push name+HN** (Cloud Function, `/brainstorming` Q1=A title=form/body=name·HN): the
   follow-up FCM push showed generic "ได้รับข้อมูลผู้ป่วยแล้ว" (follow-up session's patientData lacks
   firstName). Fix: pure CJS `functions/notificationContent.js` + `functions/customerDisplay.js` (CJS
   mirror of the ESM canonical resolver); `functions/index.js` reads `be_customers/{linkedCustomerId}`
   live (canonical BASE_PATH, non-fatal) → body "🔔 {name} · HN {hn}"; intake+edit UNCHANGED. name =
   live-resolve (fallback confirmInfo.name); HN = resolveCustomerHN(hn_no) || linkedCustomerId.

## Verified
- ed-score-round-select 15/0 · ed-detail-modal 10/0 · ed-questions 9/0 · notification-content 15/0 (incl ESM resolver parity).
- **Rule R real-prod diag 2/2** (`scripts/diag-followup-push-name-hn.mjs`): real FW-ED follow-ups → correct name+HN (e.g. "นาย จักรวาล งิ้วลาย · HN LC-26000014", "นาย สุรพันธุ์ จันทรประภา · HN LC-26000064"). Real customers have no hn_no → HN = LC id (the customer number staff use).
- full vitest **16722/0** + build clean (3.08s). The lone full-suite reds seen mid-session (staff-chat-lightbox stress / cross-branch-import / sticker-objecturl) = documented transient parallel-load flakes, all pass isolated; final full run 0-fail.
- Adversarial Workflows (Ultracode): notification 5 lenses (cf-wiring/parity/regression CLEAN) → 5 defensive findings adjudicated REAL + fixed (trim whitespace name/title ×2 + compose-either intake name = parity w/ canonical) + locked N11-13. ED-detail WF (7 lenses) STALLED — never returned a result; feature covered by RTL 10/0 + chip-click. 2 stray agent-probe files (test-a5-detail.mjs / test-adversarial.mjs) removed pre-commit (temp probes, not committed).

## Commits
```
92c5ab0b feat(functions/push): follow-up assessment push shows customer name + HN
52052020 feat(ed-score-box): round-select + per-question detail modal + viewing-state for past rounds only
```

## Files Touched
- src/components/backend/EDScoreBox.jsx (round-select + chip-click + viewingPast)
- src/components/backend/EDDetailModal.jsx (NEW) · src/lib/edQuestions.js (NEW canonical)
- functions/index.js · functions/notificationContent.js (NEW) · functions/customerDisplay.js (NEW)
- tests/ed-score-round-select.test.jsx (NEW) · ed-detail-modal.test.jsx (NEW) · ed-questions.test.js (NEW) · notification-content.test.js (NEW)
- scripts/diag-followup-push-name-hn.mjs (NEW, Rule R)
- docs/superpowers/{specs,plans}/2026-06-18-{ed-score-round-select,ed-score-answer-detail,followup-push-name-hn}*.html (6)

## Decisions (1-line each)
- ED round-select: default keeps merged latestPerType (zero behavior change); selecting a round = snapshot of that round.
- Detail modal: live question source via NEW canonical `edQuestions.js` (Rule of 3 — text was inline in PatientForm + AdminDashboard + PrintTemplates); did NOT migrate those (follow-up debt, Q2=A) to avoid V21 churn.
- viewing-state: collapse "select latest = default" (not just hide button) — consistent + no stuck state; the right root-cause fix over the minimal button-only patch.
- Push: CF is a separate CJS package → cannot import ESM src/lib → sanctioned CJS mirror `customerDisplay.js` + parity test (N9).
- HN: resolveCustomerHN(hn_no) || linkedCustomerId (real LC customers have no hn_no → the LC id is the staff-facing number).

## Next Todo
- Deploy when user says "deploy": frontend → `vercel --prod`; notification → `firebase deploy --only functions`.
- Optional: re-run the stalled ED-detail adversarial Workflow for its 7-lens result.
- Carried: ROTATE LINE/FB secrets (AV195); encode customer id in LINE OA URL (task_1a3ac96c).

## Resume Prompt
Resume LoverClinic — continue from 2026-06-18 EOD. master=92c5ab0b (=origin), prod=00da035d (today's 3 features NOT deployed). 16722/0. Read CLAUDE.md + SESSION_HANDOFF.md + .agents/active.md + .claude/rules/00-session-start.md. /session-start
