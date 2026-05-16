# 2026-05-16 NIGHT+3 — V79 chat tab 100% per-branch (systematic-debugging caught 5 hidden V78 bugs)

## Summary

User invoked `/systematic-debugging` after V78 deploy + demanded "ของใครของมันจริงๆแบบ 100%". Phase 1 exhaustive audit found V78 was HALF-SHIPPED — server-side endpoints accepted `branchId` but CLIENT didn't pass it → same cross-branch outbound leak V78 aimed to fix was STILL LIVE in prod. V79 closed 5 critical bugs + brutal 70-assertion test bank. 4 files changed.

## Current State

- master = `72b5a39` (V79 chat tab 100% per-branch) · 6 commits ahead of prod
- prod = `4d0edcd` (V77-quater LIVE @ 2026-05-16T12:41Z)
- Test count: 205/205 V75-V79 chat banks combined PASS · V79 brutal sim 70/70
- Build clean ✓ 3.02s
- Awaiting user: combined `vercel --prod` + `firebase deploy --only firestore:rules` (5 new composite indexes pending) + Rule Q L1

## Commits (this session)

```
72b5a39 fix+test(V79): chat tab 100% per-branch isolation — 5 hidden V78 bugs
581b8da fix+test(V77-fix3 + V77-fix4 + V78): 3-round adversarial bug-hunt
be5b967 test+docs(V77 L1 spec + state)
e5c2c97 fix(V77 P0/P1 batch): adversarial-review found 5 bugs
6c9f075 fix(V77 P0-A): defensive JSON parse + maxCustomers input
```

## Files Touched (V79)

**Source (2)**:
- src/components/ChatPanel.jsx (sendMessage signature + chatApiFetch query + ChatDetailView selectedBranchId prop + outboundBranchId resolution + savedRepliesCache per-branch + lineEnabled/fbEnabled NAKHON-gated fallback + lineConfig/fbConfig clear-before-resubscribe + chat_history setHistory([]) before resubscribe)
- src/lib/chatBranchDefaults.js (NEW — client-side mirror of api/webhook/_lib/chatBranchDefaults.js; exports HARDCODED_NAKHON_BR_ID + isLegacyNakhonBranch)

**Tests (2)**:
- tests/v79-chat-100-percent-per-branch.test.js (NEW — 70 assertions: source-grep + Rule I behavioral simulate + wiring completeness + adversarial mid-flow)
- tests/v78-chat-per-branch-completeness.test.js (V21 fixups CHAT-4.2/4.3/4.4 — locked V78 universal fallback shape; updated to V79 NAKHON-gated)

## Decisions (1-line each — full reasoning in v-log-archive when V79 V-entry shipped)

- CHAT-7 outboundBranchId fallback: `conv.branchId || selectedBranchId || ''` (mirrors handleResolve writer chain — same per-branch routing as persistence)
- CHAT-8 saved-replies cache keyed by branchId (no cross-branch contamination); `_unstamped_` key for legacy fall-through convs
- CHAT-9 NAKHON-gated legacy fallback (strict per-branch for all OTHER branches; preserves V75 auto-seed continuity for นครราชสีมา)
- CHAT-10/11 clear state BEFORE re-subscribe (no stale-flash during async window — "seamlessly" demand)
- Client-side chatBranchDefaults.js mirror — server vs client copy stays in sync; one constant rotate-target

## Class-of-bug pattern lock

V78 was HALF-SHIPPED: server accepted branchId, client didn't pass it. SAME pattern as V77-bis (env var unset → empty branchId stamp) 1 day earlier. Class: "API endpoint contract has multiple sides; fixing one without the other = no-op fix". Rule P 7-step Step 3 cross-file grep MUST cover both server-receive + client-send sides of every per-branch contract.

## Next Todo

1. **User-triggered**: combined `vercel --prod` + `firebase deploy --only firestore:rules` (6 commits + 5 composite indexes)
2. **User-triggered**: Rule Q L1 multi-device hands-on (5 scenarios in active.md)
3. (next session) Verbose V78/V79 entries in v-log-archive.md
4. (next session) Address remaining ~18 P2/P3 deferred from 3-round adversarial agents (in active.md `## Closed this turn`)

## Resume Prompt

See SESSION_HANDOFF.md latest session block (V79).
