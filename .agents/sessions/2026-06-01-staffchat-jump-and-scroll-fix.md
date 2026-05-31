# Checkpoint — 2026-06-01 EOD+1 — Staff-chat jump-to-latest button + cold-open scroll fix (SHIPPED + DEPLOYED + L1-verified)

## Summary
Two staff-chat changes, both deployed vercel-only + L1-verified on LIVE prod: (1) a Messenger-style **jump-to-latest button** (full brainstorm→spec→plan→execute TDD); (2) a **cold-open scroll fix** via `/systematic-debugging` — on a fresh tab open the chat opened scrolled-UP and stuck, because the smooth `scrollIntoView` auto-scroll undershot on cold mount; fixed with instant `container.scrollTop = scrollHeight`.

## Current State
- master = `6221c5a0` (docs); **prod bundle = `ede847dd` LIVE** @ lover-clinic-app.vercel.app (aliased). Both deploys vercel-only (0 rules/storage/index/cron/functions).
- Tests: full vitest **15533/15534** (1 = known flake `phase-17-1-cross-branch-import-rtl`, PASS 7/0 isolated; NOT re-run at session-end). Build clean.
- Cosmetic-shell + additive: zero change to chat send/receive/read-cursor (V82)/day-grouping flow.
- Honest Rule Q: cold-open verified on the DEPLOYED build (metrics scrollTop 5695/5695 + screenshot=image 2). Jump button verified L1 (harness + prod scroll-up→⌄→tap→bottom).

## Commits (this session, key — all pushed)
```
6221c5a0 docs(agents): active.md — cold-open scroll fix DEPLOYED (prod=ede847dd)
ede847dd fix(staffchat): chat opens at the true bottom on cold tab open — scrollTop=scrollHeight (AV169 + test + V140 V21-fixup)
6adf0da3 docs(agents): active.md — jump-to-latest DEPLOYED (prod=416e8341)
416e8341 chore(staffchat): strip dev brainstorm mockup before deploy
5c3b97b6 test(staffchat): Rule I flow-simulate for jump-to-latest (F1)
0c26e21a feat(staffchat): thread unreadCount + source-grep locks (SG1-SG9)
de6f322b feat(staffchat): jump-to-latest button — circle + unread badge
093be0ab test(staffchat): failing jump-to-latest behavior tests (J1-J7)
b235cf99 + 3af6ed29 docs(staffchat): brainstorm spec/mockup + impl plan
```

## Files Touched (names only)
- MOD `src/components/staffchat/StaffChatMessageList.jsx` (jump button + isAtBottom via existing observer + listRef + scrollContainerToBottom auto-scroll)
- MOD `src/components/staffchat/StaffChatWidget.jsx` (1 line: `unreadCount={chat.unreadCount}`)
- NEW `tests/staffchat-jump-to-latest.test.jsx` (17: J1-J7 + SG1-SG9 + F1)
- NEW `tests/staffchat-scroll-to-bottom-on-open.test.jsx` (7: U1-U2 + B1 + SG1-SG4)
- MOD `tests/v140-staff-chat-scroll-and-lightbox.test.jsx` (V21-fixup: 3 tests outcome-based)
- MOD `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV169)
- docs: spec + plan (`docs/superpowers/{specs,plans}/2026-06-01-staffchat-jump-to-latest*`); dev mockup stripped pre-deploy

## Decisions (1-line each)
- Jump button Q1=C (circle + rose unread badge, "9+" cap) · Q2=A (appear whenever scrolled up from bottom).
- Reuse the EXISTING V82 bottomSentinel IntersectionObserver to drive `isAtBottom` (one observer; V82 `onScrolledToBottom` still fires only on intersect — read-cursor timing unchanged).
- Cold-open root cause (prod-confirmed): smooth `scrollIntoView` keyed on `[lastMessageId]` undershoots on cold mount (animation interrupted by mount re-renders → 4538/5695) + never self-corrects. Fix = instant `scrollTop=scrollHeight`, immediate + rAF, deps unchanged.
- V82 read cursor is NOT the bug (saved per-device); nothing used it to scroll. "Open at bottom" = standard chat behavior + matches "where you read to".
- Customer `ChatPanel` (deps `[messages]` multi-fire → self-corrects) = working variant, NOT changed (customer-facing, not reported). Jump button `scrollToLatest` (endRef.scrollIntoView smooth) works post-mount, unchanged. (AV169 classifier.)
- Subagent-driven blocked by "1M context credits" account error → inline executing-plans fallback (controller review per task).

## Next Todo
- None pending for these features (deployed + L1-verified). No V-entry needed (additive feature + localized bugfix; AV169 covers the scroll-fix class).
- Carryover (user-triggered): cron `stock-lot-cleanup` 03:45 BKK; prior-session ship-artifact V-log entries (sales paid-column/redesign + EOD+5/+6) unwritten.

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-06-01 EOD+1.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=6221c5a0, prod=ede847dd)
3. .agents/active.md (15533/15534 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-06-01-staffchat-jump-and-scroll-fix.md

Status: master=6221c5a0, prod=ede847dd LIVE (staff-chat jump-to-latest button + cold-open scroll fix, both deployed + L1-verified). 15533/15534 (1 known flake, not re-run).
Next: idle — awaiting next task.
Outstanding (user-triggered): cron stock-lot-cleanup 03:45 BKK; prior-session V-log entries (sales/EOD+5/+6) unwritten.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules; Rule Q L1/L2 before "verified"; ground mockups in REAL design (§S-design).
/session-start
```
