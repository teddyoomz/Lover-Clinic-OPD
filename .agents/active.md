---
updated_at: "2026-06-21 EOD+1 — LINE OA url customer-id encodeURIComponent fix SHIPPED + DEPLOYED (deploy all); rotate-secrets dropped from Outstanding."
status: "encodeURIComponent fix LIVE (lover-clinic-app.vercel.app) + filler v7 polish LIVE (loverclinic.vercel.app). full vitest 16917/0; build clean. firestore.rules/functions UNCHANGED."
branch: "master"
last_commit: "8a1078b6 — fix(deploy): isolate filler env so deploy:filler's OPD step uses its .vercel link"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "OPD lover-clinic-f25j9j0h1 (lover-clinic-app.vercel.app) + filler loverclinic-osxf53p6n (loverclinic.vercel.app) — both LIVE; rules/functions UNCHANGED (no Probe-Deploy-Probe)"
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
- Idle / await. Honest L1 gap: clicking the per-appt "ทัก LINE" button → LINE opens with the encoded url = USER hands-on (authed admin + a customer with linked LINE; byte-identical for normal LC- ids anyway).

## What this turn shipped (2026-06-21 EOD+1)
- `AdminDashboard.jsx:6524` LINE OA quick-link: `?customer=${encodeURIComponent(customerHN || customerId)}` (was raw). T1 one-liner; byte-identical for URL-safe LC- ids. NEW `tests/encode-customer-id-line-oa-url.test.js` 6/6 (source-grep lock + encode proof). full vitest 16917/0.
- DEPLOYED ALL: `npm run deploy:filler` → OPD `lover-clinic-app.vercel.app` (encode fix + filler v7 polish) + standalone `loverclinic.vercel.app` (filler v7 polish, finally live). Both 200; public site verified no-firebase. Fixed a real bug in `scripts/deploy-filler.mjs` (env pollution broke the OPD step).

## Outstanding user-triggered actions
- (none). "Rotate LINE/FB secrets (AV195)" REMOVED per user 2026-06-21 — accepts the pre-WS1 exposure window (WS1 rule already blocks future reads of clinic_settings/chat_config; rotation would only have invalidated already-scraped values).
