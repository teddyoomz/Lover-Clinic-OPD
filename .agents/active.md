---
updated_at: "2026-06-18 — ED Score box (round-select + per-question detail modal + viewing-state-for-past-only) + follow-up push name+HN. SHIPPED local, NOT deployed."
status: "COMMITTED + PUSHED, NOT deployed (user: session-end, ยังไม่ต้อง deploy). full vitest 16722/0; build clean."
branch: "master"
last_commit: "92c5ab0b — feat(functions/push): follow-up assessment push shows customer name + HN"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "UNCHANGED — frontend lover-clinic-p4uawr0kx (HEAD 00da035d, mobile-load). Today's 3 features NOT deployed."
firestore_rules_version: "UNCHANGED (no rules/api/data change this session)."
tests: "full vitest 16722/0 (this session's last run) + build clean. NOT re-run at session-end."
---

# Active — 2026-06-18 — ED box detail + follow-up push name+HN (SHIPPED local, NOT deployed)

## State
- master HEAD `92c5ab0b` (= origin, tree clean). prod UNCHANGED (`00da035d`) — 3 features today NOT deployed (user: "session end เลย ยังไม่ต้อง deploy").
- full vitest **16722/0** + build clean (reused — not re-run at session-end).
- 3 features, each /brainstorming or /systematic-debugging → spec → plan → inline impl → test → adversarial Workflow.

## What this session shipped (detail → checkpoint 2026-06-18-ed-box-detail-and-push.md)
- **ED chip round-select** — click a history row → chips show that round's snapshot + "← ไปที่ครั้งล่าสุด"; default (no selection) = merged latestPerType UNCHANGED.
- **ED chip → per-question detail modal** (EDDetailModal) — click ADAM/IIEF/MRS/PE → full question text + customer's answer (option label); AV78 explicit-close. NEW canonical `src/lib/edQuestions.js`.
- **viewing-state for PAST rounds only** (/systematic-debugging) — selecting the latest (hero) = default home view; no redundant button, no stuck state. Derived `viewingPast`; robust to delete-renumber.
- **Follow-up push name+HN** (Cloud Function) — pure CJS `notificationContent.js` + `customerDisplay.js`; `functions/index.js` reads be_customers live → body "🔔 {name} · HN {hn}"; intake+edit unchanged.
- Verified: ed-score-round-select 15/0 · ed-detail-modal 10/0 · ed-questions 9/0 · notification-content 15/0 (incl ESM parity) · **Rule R real-prod 2/2** (real follow-ups → correct name+HN) · full 16722/0 · build clean.
- Adversarial: notification WF (5 lenses; cf-wiring/parity/regression clean) → 5 defensive findings fixed (trim whitespace name/title + compose-either intake name). ED-detail WF stalled (no result; feature has RTL 10/0 + chip-click verified).

## Next action
- Idle / await. **To deploy (V18 — needs "deploy" THIS turn):** frontend 3 ED features → `vercel --prod`; notification → `firebase deploy --only functions` (needed for the push to take effect live). No firestore.rules change → no Probe-Deploy-Probe.

## Outstanding (user-triggered)
- ⚠ ROTATE LINE/FB secrets (AV195).
- Pending chip: encode customer id in LINE OA message URL (task_1a3ac96c).
- Honest gap (Rule Q): ED L1 pixel render (authed CDV) + notification L1 real-push = USER hands-on after deploy (no staff creds/device this session).
- ED-detail adversarial Workflow stalled — optionally re-run for its 7-lens result.
