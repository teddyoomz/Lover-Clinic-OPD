# 2026-06-03 EOD+3 — staff-chat draft-persist + bubble indicator + stock filter relabel + V160 read-cursor fix (SHIPPED local, NOT deployed)

## Summary
Two user requests via `/brainstorming`→spec→`/writing-plans`→`/executing-plans` inline: (A) staff-chat in-progress work (text/reply/staged image+file uploads) must survive minimizing the chat with "–", (B) stock ยอดคงเหลือ filters relabel `หมด`/`ติดลบ` + reorder. During spec-review the user added a draft INDICATOR on the minimized bubble (dark-zinc ✏️, distinct from unread). After shipping, the user `/systematic-debugging`-reported a recurring read-cursor bug — root-caused as **my own hide-don't-unmount regression** (it made "open" a visibility transition not a remount, breaking the MessageList's mount-coupled on-open behaviors) → fixed + locked as V160 / AV179.

## Current State
- master `4c46a154`; prod `62593b2c` LIVE — **this session NOT deployed** (all client-SDK/UI; no firestore.rules → vercel-only when authorized, no Probe-Deploy-Probe).
- Verified: full vitest **16071/0** · build clean · **Rule Q L1 real browser (Chrome MCP)** — draft survives minimize + dark-zinc ✏️ badge; read-cursor: open→`distanceFromBottom 0` + cursor advances + persists across reload; stock filter order/labels.
- Working tree clean. No firestore.rules change.

## Commits
```
4c46a154 fix(staffchat): restore read-cursor + scroll-on-open after hide-don't-unmount (V160, AV179)
a2324e6b test(staffchat): F1.3 — staged image survives minimize (object-URL not revoked)
f8e17c19 docs(agents): EOD+3 — ... SHIPPED local + L1-verified
5f201738 feat(stock): balance filters — relabel หมด/ติดลบ + reorder (หมด before ติดลบ)
0308120f feat(staffchat): preserve draft on minimize + draft indicator on bubble
9a76a8ca docs(staffchat,stock): implementation plan
9d851749 docs(staffchat): spec rev — add Feature A-bis draft indicator
aa47af52 docs(staffchat,stock): brainstorm spec
```

## Files Touched
- src/components/staffchat/StaffChatWidget.jsx (hide-don't-unmount render + hasDraft state + visible prop)
- src/components/staffchat/StaffChatPanel.jsx (hidden prop → display:none; body-lock keyed on visible)
- src/components/staffchat/StaffChatComposer.jsx (onDraftChange effect)
- src/components/staffchat/StaffChatBubble.jsx (hasDraft → dark-zinc ✏️ badge)
- src/components/staffchat/StaffChatMessageList.jsx (V160: visible prop → scroll+mark-read+re-observe on open)
- src/components/backend/StockBalancePanel.jsx (Feature B relabel + reorder)
- tests: staffchat-draft-persist-minimize · stock-balance-filter-relabel · staffchat-read-cursor-on-open · (V21) v73-staff-chat-widget-rtl · v144-realtime-lot-clear
- .agents/skills/audit-anti-vibe-code/SKILL.md (AV179) · .claude/rules/00-session-start.md (V160)
- docs/superpowers/{specs,plans}/2026-06-03-staffchat-draft-persist-and-stock-filter-relabel*

## Decisions (1-line each)
- Feature A approach: hide-don't-unmount (keep Panel mounted, display:none) over lift-to-hook (invasive upload pipeline) / sessionStorage (can't hold staged File/Blob).
- Q2: draft persists across backend sub-tabs; clears on Frontend↔Backend / reload / tab-close.
- A-bis indicator: dark-zinc ✏️ top-left (kept ✏️ emoji, changed BG to near-black so it pops; amber/Lucide-icon rejected) — locked via Chrome-MCP rendered mockups.
- Draft trigger = text || staged file || active reply.
- V160 fix = visible-transition handling in MessageList (scroll-to-bottom + direct mark-read via ref + re-create the stuck-on-display:none IntersectionObserver), NOT revert draft-persist.
- AV179 = "hide-don't-unmount components MUST drive on-open behaviors off a visibility transition, not mount"; an observer created on a display:none node never recovers.

## Next Todo
- Deploy (user-triggered): `vercel --prod` for this session's 6 feat/fix commits.
- Carryover (low-pri): audit-stock-flow S37 + V-log B1/B2 · be_products junk cleanup (V145) · Neuramis merge + junk course "หฟแฟ" · cross-collection reconciliation report · SESSION_HANDOFF head trim <150 KB.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-03 EOD+3. Read CLAUDE.md → SESSION_HANDOFF.md (master 4c46a154, prod 62593b2c LIVE) → .agents/active.md (16071 tests) → .claude/rules/00-session-start.md → this checkpoint. Status: staff-chat draft-persist + dark-zinc ✏️ bubble indicator + stock filter relabel SHIPPED + V160/AV179 read-cursor regression fixed + L1-verified; NOT deployed. Next: idle / await direction (deploy pending — say "deploy"). No deploy without "deploy" THIS turn (V18). /session-start
