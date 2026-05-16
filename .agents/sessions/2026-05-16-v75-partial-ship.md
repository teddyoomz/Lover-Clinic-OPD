# 2026-05-16 EOD+1 — V75 Partial Ship (20 commits — Items 1+3+4 complete, Item 2 CLI-only)

## Summary

V75 4-item batch from V74 L1 hands-on shipped 20 commits across 12-phase plan. Items 1 (button polish), 3 (chat per-branch — webhook stamp + Rule M backfill script + BSA reader Layer 1+2 + ChatPanel migration + firestore rule + Probe #12), and 4 (chat tab mute + AdminDashboard wrapper migration) are architecturally complete with their canonical AV invariants (AV56/57/58) + BS-17. Item 2 (whole-fleet backup) shipped as CLI-only via `customer-backup-export.mjs --all-customers`; endpoint + UI modals deferred to V75-bis. Remaining: FbSettingsTab UI (Tasks 14-16), whole-fleet restore CLI (Task 28), UI modals (Tasks 24-26), adversarial/continuity/Playwright tests (Tasks 29-37), V-entry + final verify (Tasks 38-43).

## Current State

- master=`23fe62a` · 20 V75 commits ahead of prod=`b47a6e6` (V73+V74 LIVE)
- 20 V75 test files PASS (~140 V75 assertions across helper + RTL + source-grep + audit invariants)
- Full vitest suite NOT run this session (Rule N — small bugfix + targeted iteration; batch-end full run deferred to next session per Tasks 41-43)
- Working tree: only `.claude/settings.local.json` modified + pre-existing untracked skill dirs (untouched by V75)
- Plan: `docs/superpowers/plans/2026-05-16-v75-chat-and-backup-batch.md` (5760 lines, 43 tasks); Spec: `docs/superpowers/specs/2026-05-16-v75-chat-and-backup-batch-design.md`

## Commits (this session — 20 V75 + 2 docs)

```
23fe62a feat(V75 Item 2): whole-fleet customer backup CLI (--all-customers) + AV56
413bc95 feat(V75 Item 3): firestore.rules be_fb_configs + Probe-Deploy-Probe #12
7a39dd9 feat(V75 Item 3+4): ChatPanel listener migration + mute toggle + AV58
02d527e feat(V75 Item 3): chat_conversations BSA Layer 1 + Layer 2 + BS-17 audit
37993b1 feat(V75 Item 3 Rule M): chat_conversations branchId backfill script
20838c7 feat(V75 Item 3): chat webhook branchId stamp (Tasks 5+6+7 / AV57)
b3215e1 feat(V75 Item 3): fbConfigClient + fbTestClient
d9d616d feat(V75 Item 2): wholeFleetBackupCore — manifest + hasher + validator
[6c3eb5d feat(V75 Item 4): chatNotificationMute helper]
[1e3a0fe feat(V75 Item 1): CustomerDetailView 4-button row polish]
[fac42aa docs(V75): 43-task implementation plan with maha-adversarial test bank]
[5f05f93 docs(V75): brainstorm-locked spec]
```

## Files Touched (V75 surface — names only)

**Source (10 new + 6 modified)**:
- src/lib/chatNotificationMute.js + wholeFleetBackupCore.js + fbConfigClient.js + fbTestClient.js (NEW)
- api/webhook/_lib/lineChatBranchResolver.js + fbChatBranchResolver.js + fbConfig.js (NEW)
- api/webhook/{line,facebook}.js (branchId stamp)
- src/components/ChatPanel.jsx (listener migration + mute toggle + banner + empty-state copy)
- src/pages/AdminDashboard.jsx (playAlertSound → playChatNotificationSound × 2)
- src/components/backend/CustomerDetailView.jsx (button row polish)
- src/lib/backendClient.js (listenToChatConversationsByBranch Layer 1)
- src/lib/scopedDataLayer.js (Layer 2 wrapper)
- firestore.rules (be_fb_configs match)

**Scripts (2 modified)**:
- scripts/v75-backfill-chat-conversations-branchid.mjs (NEW Rule M)
- scripts/customer-backup-export.mjs (--all-customers + exportWholeFleet)
- scripts/probe-deploy-probe.mjs (Probe #12)

**Tests (8 new)**:
- v75-button-polish-rtl + v75-chat-noti-mute-helper + v75-whole-fleet-backup-core + v75-fb-config-client + v75-chat-webhook-branchid-stamp-flow + v75-chat-webhook-branchid-stamp-av57 + v75-backfill-chat-conversations-branchid + v75-chat-noti-mute-scope-av58 + v75-firestore-rules-fb-configs + v75-whole-fleet-backup-av56 + audit-branch-scope.test.js (+BS-17 block)

**Audit skills (2 modified)**:
- .agents/skills/audit-anti-vibe-code/SKILL.md — AV56 + AV57 + AV58
- .agents/skills/audit-branch-scope/SKILL.md — BS-17 (16→17 invariants)

**Rules**:
- .claude/rules/01-iron-clad.md — Probe #11 (V74) + Probe #12 (V75) in Rule B

## Decisions (one-line each — full reasoning in v-log-archive.md)

- DEVIATION Task 13 DROPPED: fbConfigClient mirrors lineConfigClient direct-Firestore pattern (no /api/admin/fb-config-by-branch endpoint needed)
- DEVIATION BS-16 → BS-17: V64 already used BS-16 (AppointmentHub branch-scope); V75 chat_conversations gets BS-17
- DEVIATION Tasks 21+27 consolidated: whole-fleet shipped as `--all-customers` flag in existing customer-backup-export.mjs (CLI-only; endpoint+UI deferred to V75-bis per context budget)
- DEFERRED Task 9 (--apply dry-run on real prod): runs at user deploy time per Rule M discipline
- CONTINUITY contract for นครราชสีมา: client-side filter fall-through preserves un-stamped legacy chats during V75 backfill transition window
- Subagent thrashed on Task 1 → switched to inline execution for remaining tasks (more reliable for this batch)

## Next Todo (next-session priorities)

**Pre-deploy (user-triggered)**:
1. User says "deploy" → combined `vercel --prod` + `firebase deploy --only firestore:rules` + Probe-Deploy-Probe (8 endpoints incl. #11 V74 + #12 V75 be_fb_configs)
2. Post-deploy: admin runs `node scripts/v75-backfill-chat-conversations-branchid.mjs --apply` (Rule M one-shot; stamps legacy chats)
3. Rule Q L1 multi-device hands-on per spec § 8

**Remaining V75 tasks (22 of 43)**:
- Task 22: /api/admin/whole-fleet-customer-restore endpoint (or extend restore CLI with --whole-fleet-manifest flag)
- Task 28: scripts/whole-fleet-customer-restore.mjs CLI extension
- Task 14: /api/admin/fb-test endpoint
- Task 15-16: FbSettingsTab.jsx UI + nav + permissions wire
- Task 24-26: WholeFleetBackupModal + RestoreModal + BackupManagerTab wire (V75-bis if low priority)
- Task 29-30: Maha-adversarial bank for whole-fleet (V48 pattern × 100 fixtures) + CRITICAL continuity test (นครราชสีมา zero-action)
- Task 31: Rule I full-flow simulate (5-layer chat chain)
- Task 32: AV58 extended cross-surface noti scope audit (partially done in commit `7a39dd9`)
- Task 33-34: Live admin-SDK e2e (Rule Q L2)
- Task 35-37: Playwright L1 specs (Rule Q PREFERRED)
- Task 38: V75 V-entry compact + verbose in v-log-archive.md
- Task 39: Consolidated AV invariants (mostly done)
- Task 40: SESSION_HANDOFF + active.md final state
- Task 41: Full vitest run (Rule N batch-end)
- Task 42: Build clean verify
- Task 43: V21-class regression sweep + audit-all dry-run

## Resume Prompt

See SESSION_HANDOFF.md Resume Prompt block (next-session entry point).
