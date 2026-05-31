---
updated_at: "2026-06-01 EOD+1 — Staff-chat jump-to-latest button SHIPPED + DEPLOYED + L1-verified on LIVE prod."
status: "DEPLOYED (vercel-only, no Probe-Deploy-Probe). L1 DONE on real prod (read-only). prod = current code."
branch: "master"
last_commit: "416e8341 (strip dev mockup pre-deploy). Feature code: de6f322b + 0c26e21a."
tests: "15527/0 full suite (ran this session). +17 new (J1-J7 + SG1-SG9 + F1)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "416e8341 LIVE (aliased; vercel --prod). Was 0628f91a (sales paid-column batch)."
firestore_rules_version: "UNCHANGED. No rules/storage/index/cron/functions touched (verified in diff)."
---

# Active Context — staff-chat jump-to-latest button DEPLOYED (2026-06-01 EOD+1)

## State
- Shipped a Messenger-style "ลงไปข้อความล่าสุด" (jump-to-latest) button on the staff-chat message list. Full `/brainstorming → spec → /writing-plans → execute` (TDD, cosmetic-shell). Subagent-driven was blocked by a "1M context credits" account error → fell back to inline execution (controller review per task).
- Deployed vercel-only (diff = 0 rules/storage/index/cron → no Probe-Deploy-Probe). Dev mockup stripped pre-deploy (416e8341).
- Full suite 15527/0; build clean.

## What shipped (detail → checkpoint 2026-06-01-staffchat-jump-to-latest.md if created)
- Decisions: Q1=C (circle + rose unread badge, "9+" cap) · Q2=A (appears whenever scrolled up from bottom).
- `StaffChatMessageList.jsx` — `isAtBottom` piggybacked on the EXISTING V82 bottomSentinel IntersectionObserver (read-cursor timing unchanged); floating ChevronDown button when `!isAtBottom`; tap → `endRef.scrollIntoView({smooth})`; new `unreadCount` prop. `StaffChatWidget.jsx` — threads `chat.unreadCount` (1 line).
- `tests/staffchat-jump-to-latest.test.jsx` — 17 tests (J1-J7 behavior + SG1-SG9 source-grep + F1 flow-simulate). Caught + fixed an SG8 false-positive (was matching the pre-existing StaffChatBubble prop; scoped to the MessageList element).

## Verification (Rule Q)
- L1 on harness (real component + real IO + real scroll, both themes) AND **L1 on LIVE prod** (real admin-gated widget + real Firestore data, read-only): at-bottom→no button / scroll-up→⌄ / set 15→"9+" / tap→smooth-scroll-to-latest→hides. Honest gap CLOSED.
- Targeted staff-chat 297/0 (no V21 regression from observer-guard relaxation / relative wrapper / Widget prop). Full 15527/0. Build clean.

## Next action
- None pending for this feature (deployed + L1-verified). Awaiting next task.

## Outstanding (carryover, user-triggered)
- cron `stock-lot-cleanup` active 03:45 BKK (V143-quater) — optional CRON_SECRET hit to verify.
- Prior sessions' ship-artifact V-log entries still unwritten (sales paid-column + redesign; EOD+5/+6 resizable-panel/V73-BS1/course-step). This jump-button feature needs no V-/AV-entry (clean additive, no class-of-bug).
