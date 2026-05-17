# 2026-05-18 EOD+3 — Menu Variant A v2 + V82-fix7-bis + V2-bis (3 deploys)

## Summary

Frontend Menu redesign shipped end-to-end: 4-variant visual companion → user picked Variant A refined → Menu V2 deployed (commit `24b116a3`) → 2 user-reported mobile bugs (chat scroll-bleed + drawer bubble overlap + light theme dock) fixed in 2 follow-up rounds (V82-fix7-bis `357acf45` + V2-bis `ef4bd5c3`). V82 force-open contract preserved; pure UI session — no data layer changes. 11369/0 PASS.

## Current State

- master = `ef4bd5c3` · origin matches
- prod aliased lover-clinic-app.vercel.app · 3 deploys today all post-probe verified
- 11369 PASS / 0 FAIL (+47 from V82-fix6 baseline 11322)
- HN counter still absent; opd_sessions state unchanged from EOD+2
- Menu V2 LIVE: pill bar (≥768px) + floating bottom dock + จอง BottomSheet + ⋯ Drawer

## Commits (chronological)

```
24b116a3 feat(menu): Variant A v2 — compact pill bar + mobile bottom dock (Phase A)
91d9863d chore(agents): EOD+2 — Menu Variant A v2 shipped 11366/0 PASS
abc36e25 fix(V82-fix7): mobile chat minimize unblock — click "—" = ack all read   [SUPERSEDED]
357acf45 fix(V82-fix7-bis): mobile chat scroll-bleed + revert minimize ack — V82 force-open intact
ef4bd5c3 fix(menu-V2-bis): hide chat bubble while mobile drawer/sheet open + light theme dock surface
```

## Files Touched

- `src/pages/AdminDashboard.jsx` — header replaced (lines 5735-5961) + mobile dock/sheet/drawer JSX + 2 new useState + useEffect for `html[data-mobile-menu-overlay-open]` + MoreHorizontal lucide import
- `src/index.css` — menu utility classes (menu-tab/menu-dock-tab/menu-grad-line) + body padding-bottom 88px + `html[data-staff-chat-open]` mobile body lock + light theme overrides + chat bubble hide rule + `.menu-dock-surface` themed bg
- `src/components/staffchat/StaffChatBubble.jsx` — bottom-[88px] on mobile
- `src/components/staffchat/StaffChatPanel.jsx` — useEffect html[data-staff-chat-open] + overscroll-contain + touchAction:pan-y
- `src/components/staffchat/StaffChatMessageList.jsx` — overscroll-contain + touchAction + WebkitOverflowScrolling
- `src/components/staffchat/StaffChatHeader.jsx` — V82 force-open gate restored (post-V82-fix7-bis revert)
- `src/hooks/useStaffChat.js` — minimize() restored to setMinimized(true) only (post-V82-fix7-bis revert)
- `tests/menu-variant-a-v2-source-grep.test.jsx` — NEW 43-test regression bank
- `tests/phase-25-0-walk-in-tab-rename.test.js` — V21 fixup (JSX shape migration)
- `tests/v82-staff-chat-cursor-and-badge.test.js` — D.4/D.5 restored + D.6/D.7/D.8 added for V82-fix7-bis scroll-bleed contract
- `docs/superpowers/plans/2026-05-18-menu-redesign-variant-a-v2.md` — NEW plan
- `docs/brainstorm/menu-redesign-variants.html` — NEW visual companion mockup

## Decisions (1-line each)

- Visual companion 4 variants → user picked **A (Compact Pill Bar)** in single iteration; A-v1 mockup → user feedback (real logo + unread badges + chat bubble) → A-v2 refined → "ok เริ่มเลย"
- Implementation strategy: INLINE rewrite of `<header>` block (not separate AdminTopNav/AdminBottomNav components). Single commit. Reason: previous failed attempt (22 commits, 25 tasks, scope creep) was over-abstracted; inline keeps direct access to all state hooks
- V82 force-open: KEEP (user explicit clarification "ใช้ระบบที่บอกไปได้เลย") — V82-fix7 ack-on-click was reverted
- Mobile scroll-bleed fix: body lock via `html[data-staff-chat-open]` attribute + CSS @media gates to mobile-only; desktop unaffected (corner-anchored 360×480 panel)
- Chat bubble hide on drawer/sheet open: body attribute approach (`html[data-mobile-menu-overlay-open]`) instead of z-index raise — cleaner UX (bubble doesn't poke out)
- Light theme dock: `.menu-dock-surface` class + `[data-theme="light"]` overrides (not hardcoded rgba); pattern reusable for future themed surfaces
- Test discipline: 43-test menu regression bank locks every wiring contract (8 setAdminMode handlers verbatim + 4 badge expressions + Notif popover preservation + slot wiring + StaffChatBubble lift + anti-regression on legacy 2-row menu)
- Bug-loop discipline: 3 deploys in one session — each one post-probe verified, no rules changes, idempotent firestore re-release every round per V15

## Next Todo

1. AWAIT user L1 hands-on re-verify on prod mobile:
   - Bug 1: tap ⋯ → bubble hides → "ออกจากระบบ" visible
   - Bug 2: theme=light → bottom dock white + amber-700 active tab
   - V82 force-open: open chat → scroll inside chat list works → reach bottom → "—" unlocks → close works
2. If pass → consider Phase B (15 modals redesign) when user opts in
3. If new bugs found → quick iterate

## Resume Prompt

Resume LoverClinic — continue from 2026-05-18 EOD+3.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=ef4bd5c3, prod=ef4bd5c3)
3. .agents/active.md (11369 PASS / 0 FAIL)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-18-menu-v2-shipped.md (this file)

Status: master=ef4bd5c3, 11369 tests pass, prod=ef4bd5c3 LIVE
Next: idle — await user L1 mobile re-verify (Bug 1 chat-bubble-hide on drawer + Bug 2 light theme dock + V82 force-open round-trip)
Outstanding (user-triggered): user hands-on; future Phase B (modals) on opt-in
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe
/session-start
