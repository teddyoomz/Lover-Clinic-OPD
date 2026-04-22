---
name: audit-chat-notifications
description: Audit chat alert/badge pipeline — sound triggers must fire on UNREAD count (not total conversations), every open-chat path must mark unreadCount=0, and the filter logic must come from the shared `src/lib/chatUnreadUtils.js` helper (Rule of 3). Enforces the 2026-04-22 phantom-noti fix — "notification rang forever without any pending chat".
user-invocable: true
allowed-tools: "Read, Grep, Glob, Bash"
---

# Audit: Chat Notification Pipeline

## Context

**Bug reference**: 2026-04-22 — chat notification played every 30s even when no conversation had `unreadCount > 0`. Root cause was triple:
1. `AdminDashboard.jsx` sound trigger compared `chatConvCount` (total docs) instead of `chatUnread` (unread only).
2. `ChatDetailView` had no mark-read effect — opening a chat did not reset `unreadCount`.
3. `api/webhook/send.js` admin reply patched only `lastMessage/lastMessageAt`, never zeroed `unreadCount`.

Fix: shared `src/lib/chatUnreadUtils.js` with `countUnreadPeople`, `shouldRingChatAlert`, `shouldRingChatInterval`; mount effect in `ChatDetailView`; unreadCount reset in `send.js`.

**Scope**:
- `src/pages/AdminDashboard.jsx` — sound trigger wiring
- `src/components/ChatPanel.jsx` — ChatDetailView mount effect + useChatUnread hook + list badge
- `api/webhook/send.js` — admin reply reset
- `src/lib/chatUnreadUtils.js` — shared helpers (Rule of 3)

## Invariants

### AN1 — AdminDashboard sound triggers reference `chatUnread`, never `chatConvCount`
```bash
grep -nE "chatConvCount|chatConvCountRef|chatPrevCountRef" src/pages/AdminDashboard.jsx
```
**Expected**: empty. Any match = the phantom-noti bug is back. Sound must fire on unread only — total conversation count is a broken proxy because unresolved-but-read chats stay in the collection.

### AN2 — AdminDashboard imports `shouldRingChatAlert` + `shouldRingChatInterval` from shared helper
```bash
grep -n "from ['\"]\\.\\./lib/chatUnreadUtils" src/pages/AdminDashboard.jsx
grep -nE "shouldRingChatAlert|shouldRingChatInterval" src/pages/AdminDashboard.jsx
```
**Expected**: import present + both helpers referenced. Inline trigger logic in useEffect body is a Rule-of-3 violation — the logic exists in 3 places (transition, interval, future bell-icon-click dismiss) and must be centralized.

### AN3 — ChatDetailView has a mark-read effect that writes `unreadCount: 0`
```bash
grep -nB1 -A4 "Mark conversation as read" src/components/ChatPanel.jsx
grep -n "updateDoc.*unreadCount.*0" src/components/ChatPanel.jsx
```
**Expected**: effect present AND it calls `updateDoc(convRef, { unreadCount: 0 })`. Without this the badge never clears by reading — admin is forced to click "ตอบเรียบร้อยแล้ว" (which deletes the whole conversation) just to silence the noti.

### AN4 — `api/webhook/send.js` zeros `unreadCount` on every admin reply
```bash
grep -nE "unreadCount.*integerValue.*['\"]0['\"]" api/webhook/send.js
```
**Expected**: one match inside the `firestorePatch(convPath, …)` call. Reply without reset = badge lingers after a silent API-only reply path.

### AN5 — Badge + hook use shared `countUnreadPeople`, not inline filters
```bash
grep -nE "conversations\\.filter\\(.*unreadCount" src/components/ChatPanel.jsx
grep -nE "snap\\.docs\\.forEach.*unreadCount" src/components/ChatPanel.jsx
```
**Expected**: both empty (all counting goes through `countUnreadPeople`). Inline filters drift (old bug: one site coerced, the other didn't → off-by-one when Firestore REST returned string `unreadCount`).

### AN6 — Shared helper coerces string/NaN/undefined unreadCount
```bash
grep -nE "Number\\(.*unreadCount" src/lib/chatUnreadUtils.js
```
**Expected**: at least one match. Firestore REST `integerValue` comes back as a JSON string; missing coercion = truthy string `"0"` counts as unread.

### AN7 — Tests cover the phantom-noti reproduction
```bash
grep -n "PHANTOM-NOTI REPRO" tests/chatUnreadUtils.test.js
```
**Expected**: at least 3 reproductions (one in each of `countUnreadPeople`, `shouldRingChatAlert`, `shouldRingChatInterval`). If deleted, regression gate is gone.

### AN8 — No raw `unreadCount` read from `c.unreadCount > 0` outside shared helper
```bash
grep -rnE "unreadCount\\s*>\\s*0" src/ | grep -v chatUnreadUtils.js
```
**Expected**: ChatPanel.jsx list rendering (`conv.unreadCount > 0` for the individual badge) + the mark-read effect guard are the only allowed call sites. Elsewhere = bypass of the helper.

## Priority

P0 — chat notification is an always-on user-facing feature. Any drift re-triggers the "noti doesn't stop" complaint from the user. Treat as release-blocking.

## Integration

- `/audit-all` runs this (register under the frontend tier).
- PostToolUse hook can invoke this on any Edit/Write touching
  `src/components/ChatPanel.jsx`, `src/pages/AdminDashboard.jsx`,
  `api/webhook/send.js`, `src/lib/chatUnreadUtils.js`.

## Rule cross-refs

- `.claude/rules/03-stack.md` Chat system section — FB echo subscription, LINE no-echo, lastMessage/displayName rules.
- `.claude/rules/01-iron-clad.md` Rule C1 (Rule of 3) — shared helper mandate.
- `.claude/rules/01-iron-clad.md` Rule D (Continuous Improvement) — this skill is the invariant-gate that fulfils D after the 2026-04-22 fix.
