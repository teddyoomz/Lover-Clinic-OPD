---
updated_at: "2026-05-16 EOD+1 — V75 partial ship (20 commits in master; deploy pending user explicit 'deploy')"
status: "PARTIAL — Items 1+3+4 architectural-complete + tests; Item 2 CLI-only (UI deferred to V75-bis); 22 tasks remaining"
branch: "master"
last_commit: "23fe62a feat(V75 Item 2): whole-fleet customer backup CLI (--all-customers) + AV56"
tests: "20 V75 test files PASS (~140 V75 assertions); full suite NOT run this session (Rule N — at batch end / next session)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "b47a6e6 — V73 + V74 LIVE (V75 batch awaiting user 'deploy' authorization)"
firestore_rules_version: "34 LIVE; v35 (V75 be_fb_configs match) staged in repo, not deployed"
v75_commits_ahead_of_prod: 20
---

# Active Context

## State

- **20 V75 commits ahead of prod**, master clean except untracked skill dirs (untouched this session)
- **Items SHIPPED**: 1 (button polish ✓) + 3 (chat per-branch — webhook stamp + backfill script + BSA reader Layer 1+2 + BS-17 + AV57 + firestore rule + Probe #12 ✓) + 4 (chat tab mute + AV58 ✓) + 2 PARTIAL (whole-fleet CLI via `--all-customers` + AV56; endpoint+UI deferred)
- **Plan deviations**: Task 13 dropped (fbConfigClient direct Firestore); BS-16 → BS-17 (V64 collision); whole-fleet shipped as CLI-only (endpoint+UI = V75-bis)

## What this session shipped (20 commits)

- **Phase 0 foundation** (Tasks 1-4): button polish + chatNotificationMute helper + wholeFleetBackupCore (manifest/hasher/validator) + fbConfigClient + fbTestClient
- **Phase 1 webhook stamps** (Tasks 5-7 / AV57): `api/webhook/{line,facebook}.js` stamp `branchId` + `branchIdSource` via resolveChatBranchIdFrom*Event helpers; fallback to LOVER_DEFAULT_BRANCH_ID
- **Phase 2 Rule M migration** (Task 8): `scripts/v75-backfill-chat-conversations-branchid.mjs` ready (--apply deferred to user post-deploy)
- **Phase 3 BSA chat reader** (Tasks 10-12 / BS-17): backendClient Layer 1 safe-by-default + scopedDataLayer Layer 2 auto-inject + BS-17 audit (16→17 invariants)
- **Phase 6 ChatPanel migration** (Tasks 19+20 + AV58): listenToChatConversationsByBranch wire + empty-state branch-aware copy + 🔔/🔕 mute toggle + banner + AdminDashboard playChatNotificationSound migration
- **Phase 5 rules+probe** (Tasks 17+18): firestore.rules be_fb_configs match + Probe #12 in probe-deploy-probe.mjs + Rule B documentation
- **Phase 7 partial** (Tasks 21+23+27): scripts/customer-backup-export.mjs extended with `--all-customers` whole-fleet mode + manifest emit + AV56 invariant
- Checkpoint: `.agents/sessions/2026-05-16-v75-partial-ship.md`

## Next action (user-triggered)

1. **User authorizes "deploy"** → combined `vercel --prod` + `firebase deploy --only firestore:rules` + Probe-Deploy-Probe (8 probes incl. #11 #12)
2. **After deploy**: admin runs `node scripts/v75-backfill-chat-conversations-branchid.mjs --apply` (Rule M; stamps legacy chat_conversations with นครราชสีมา branchId)
3. **Rule Q L1 hands-on** by user — test Items 1, 3, 4 per spec § 8 acceptance scenarios
4. **Next session continues** with: full vitest run (Rule N batch-end) + Tasks 14-16 (FbSettingsTab + nav) + Tasks 22+28 (whole-fleet restore CLI) + Tasks 24-26 (UI modals) + Tasks 29-37 (adversarial + continuity + Playwright L1) + Task 38 V-entry + Task 40 state finalize

## Outstanding user-triggered actions

- `vercel --prod` + `firebase deploy --only firestore:rules` (V75 batch — 20 commits + new be_fb_configs rule)
- `node scripts/v75-backfill-chat-conversations-branchid.mjs --apply` post-deploy (Rule M; one-shot)
- Rule Q L1 multi-device hands-on per spec § 8
