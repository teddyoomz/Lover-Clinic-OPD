---
updated_at: "2026-06-21 — Staff-chat System notification cards (AV198) SHIPPED + DEPLOYED LIVE + 8-round bug-hunt converged."
status: "Feature LIVE. Intake+follow-up completion writes a 'ระบบ' card to the per-branch staff chat (clickable name+HN). full vitest 16914/0; build clean."
branch: "master"
last_commit: "a62c20c4 — fix(staff-chat AV198): hook mirrors picker (bug-hunt round 7) [+ EOD docs commit]"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "lover-clinic-cc7twr3pm (vercel) + firebase functions sendPushOnSubmit + firestore.rules — LIVE at a62c20c4"
firestore_rules_version: "CHANGED + DEPLOYED (AV198 system-card guard: clients can't forge/delete a system card) — Probe-Deploy-Probe 13/13"
tests: "full vitest 16914/0 (this session); AV198 feature: builder 8 + resolve 4 + RTL 8 + flow-sim 6 + av198 10 + Q4 3 = green; L2 e2e 14/0 real prod. Not re-run after."
---

# Active — 2026-06-21 — Staff-chat System notification cards (AV198) LIVE

## State
- `?play=filler` standalone is still LIVE (prior session); THIS session shipped the staff-chat "ระบบ" notification cards.
- When an intake / follow-up form completes, `sendPushOnSubmit` ALSO writes a System card into the per-branch `be_staff_chat_messages` (sparkles icon, customer name+HN, clickable name → `/?backend=1&customer=<id>` new tab). Intake live-resolves to clickable+HN once registered (`brokerProClinicId`). Counts unread + plays the chat sound.
- master `a62c20c4` (+ EOD docs); DEPLOYED (vercel + firebase functions + rules). full vitest 16914/0; build clean.

## What this session shipped (detail → checkpoint 2026-06-21-staff-chat-system-notification-cards.md)
- `/brainstorming` (Visual Companion, Q1=A card/Q2=sparkles/Q3=intake-live-resolve/Q4=unread+sound) → spec → `/writing-plans` (14 tasks) → inline impl.
- NEW `functions/staffChatNotify.js` (deterministic id) + `index.js` wire (before FCM, non-fatal, skip edits) + `src/lib/staffChatNotifyResolve.js` (live hook) + `StaffChatSystemCard.jsx` + `StaffChatMessage` early-branch + `useStaffChat`/`staffChatClient` guards + firestore.rules system-card immutability. AV198.
- **8-round adversarial bug-hunt (Workflow, Ultracode) → CONVERGED** (R8 clean): fixed deleted-customer downgrade, no-tokens→no-card (CRITICAL), duplicate-on-retry (CRITICAL), contrast, rule-layer immutability, hook↔picker consistency; Q4-chime adjudicated INTENDED.
- Verified: full vitest 16914/0 · build clean · L2 e2e 14/0 real prod (incl. intake flip) · Rule R diag (branchId 35/35) · Probe-Deploy-Probe 13/13.

## Next action
- Idle / await. Honest L1 gap: a real form-submit → card appears in the authed staff chat + the live pending→registered flip = USER hands-on.

## Outstanding user-triggered actions
- Deploy filler v7/v7.1/v7.2/v7.3/v7.4 polish (prior session, still pending) → `npm run deploy:filler`.
- ⚠ Rotate LINE/FB secrets (AV195). · Encode customer id in LINE OA url.
