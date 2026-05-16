---
updated_at: "2026-05-16 NIGHT+3 — V79 chat tab 100% per-branch (systematic-debugging found 5 hidden bugs in my own V78)"
status: "SHIPPED — V77-fix3 + V77-fix4 + V78 + V79 batches all local + pushed. Awaiting Rule Q L1."
branch: "master"
last_commit: "72b5a39 fix+test(V79): chat tab 100% per-branch isolation"
tests: "V75/V76/V77/V78/V79 chat banks combined: 205/205 PASS. V79 brutal sim: 70/70 PASS. Build clean ✓ 3.02s."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "4d0edcd — V77-quater LIVE @ 2026-05-16T12:41Z; V77-fix3/V77-fix4/V78/V79 NOT YET deployed"
firestore_rules_version: "v35 LIVE — 5 NEW composite indexes pending deploy (V78 XR-3/7/20)"
v75_commits_ahead_of_prod: 6
---

# Active Context

## State
- V79 SHIPPED locally + pushed. Chat tab provably 100% per-branch isolated at source-grep + Rule I behavioral simulate level.
- 6 commits ahead of prod (V77-fix3 + V77-fix4 + V78 + V79). User authorizes combined deploy separately.
- 4 Rule M backfills from V76/V77 saga applied earlier this day — already LIVE.

## What this session shipped (V79)
- V79: chat tab 100% per-branch via systematic-debugging Phase 1-4
- CHAT-7 CRITICAL: sendMessage signature gained `branchId` (V78 was half-shipped — server accepted, client didn't pass → SAME LEAK V78 fixed STILL LIVE)
- CHAT-8 CRITICAL: chatApiFetch gained query-string support + saved-replies passes `?branchId=` + cache keyed per-branch
- CHAT-9 HIGH: lineEnabled/fbEnabled legacy fallback gated to NAKHON only (strict per-branch for other branches)
- CHAT-10/11 MED: lineConfig/fbConfig + chat_history state cleared BEFORE re-subscribe (no stale-flash)
- NEW `src/lib/chatBranchDefaults.js` client-side mirror of server-side helper
- Test bank: `tests/v79-chat-100-percent-per-branch.test.js` 70 assertions (source-grep + Rule I + wiring completeness + adversarial mid-flow)
- 3 V21 fixups in v78 test bank (locked V78 fallback shape; now V79 gated form)
- Checkpoint: `.agents/sessions/2026-05-16-v79-chat-100-percent-per-branch.md`

## Next action
User Rule Q L1 hands-on on prod (post-deploy): 5 scenarios — admin reply branch identity / badge per-branch / no-FB-branch hides pill / history view stale-flash / saved-replies per-branch.

## Outstanding user-triggered actions
- Combined `vercel --prod` + `firebase deploy --only firestore:rules` (6 commits + 5 new composite indexes pending; indexes take 2-30 min build)
- Rule Q L1 multi-device hands-on after deploy
- (next session) Verbose V78/V79 entries in v-log-archive.md (compact in 00-session-start)
