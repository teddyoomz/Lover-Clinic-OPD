---
updated_at: "2026-06-01 EOD+1 — Staff-chat jump-to-latest button + cold-open-scroll fix SHIPPED + DEPLOYED + L1-verified on LIVE prod."
status: "DEPLOYED (vercel-only, no Probe-Deploy-Probe). Cold-open L1 DONE on real prod (metrics + screenshot). prod = current code."
branch: "master"
last_commit: "ede847dd (cold-open scroll fix). Jump-button feature: de6f322b + 0c26e21a. prod bundle = ede847dd."
tests: "Full suite 15533/15534 (the 1 = known flake phase-17-1-cross-branch-import-rtl, PASS 7/0 isolated). +24 staff-chat-scroll/jump tests this session."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ede847dd LIVE (aliased; vercel --prod). Was 416e8341 (jump button), 0628f91a (sales)."
firestore_rules_version: "UNCHANGED. No rules/storage/index/cron/functions touched (both deploys vercel-only)."
---

# Active Context — staff-chat jump-button + cold-open scroll fix DEPLOYED (2026-06-01 EOD+1)

## State
- Two staff-chat changes shipped + deployed (both vercel-only):
  1. **Jump-to-latest button** (Messenger-style circle + unread badge, appears when scrolled up) — `de6f322b`/`0c26e21a`.
  2. **Cold-open scroll fix** (`/systematic-debugging`) — `ede847dd`. On a cold tab open the chat opened scrolled UP (stuck, image 1); root cause (real-prod evidence) = auto-scroll `endRef.scrollIntoView({smooth})` undershot ~1158px (4538/5695) on cold mount (animation interrupted by mount re-renders), never self-corrected. Fix = `scrollContainerToBottom(listRef.current)` → `scrollTop = scrollHeight` (instant), immediate + rAF, deps unchanged `[lastMessageId]` (V140 no-yank preserved). **AV169** + new regression test + V140 V21-fixup.
- The V82 read cursor was NOT the bug (it IS saved per-device); nothing used it to scroll. Both pre-existing-surfaced + fixed.

## Verification (Rule Q)
- **Cold-open L1 on LIVE prod (the deployed fix)**: fresh tab → open chat → `scrollTop 5695 / scrollHeight 6064` → `distanceFromBottom 0`, `atBottom true`, jump button hidden + screenshot = image 2 (latest "ok" 19:21). Before fix: 4538/5695, dist 1158, image 1.
- Full suite 15533/15534 (1 = known flake, confirmed 7/0 isolated); build clean; targeted staff-chat 95/0.

## Next action
- None pending — both deployed + L1-verified on real prod. Awaiting next task.

## Outstanding (carryover, user-triggered)
- cron `stock-lot-cleanup` active 03:45 BKK (V143-quater) — optional CRON_SECRET hit to verify.
- Prior sessions' ship-artifact V-log entries still unwritten (sales paid-column + redesign; EOD+5/+6 resizable-panel/V73-BS1/course-step). This session's jump-button + scroll-fix: AV169 written; no V-entry needed (additive feature + localized bugfix, no class-of-bug saga).
