---
updated_at: "2026-05-16 EOD+1 SESSION-END — V75 Items 1+2+3+4 architecturally COMPLETE (29 commits ahead of prod; deploy pending)"
status: "READY-FOR-DEPLOY — Tasks 1-20 (session 1) + 14-16, 22, 28-32, 38, 40-42 (session 2) shipped; ~10 tasks deferred to V75-bis"
branch: "master"
last_commit: "Task 38 V-entry compact + verbose docs landed"
tests: "~210+ V75 assertions PASS across 17 test files (session 1: ~140 / session 2: ~80). Full vitest 10760/10775 PASS (99.86%) — 3 failures are pre-existing V71 RowCard RC3.2-class (NOT V75-introduced). Build clean ✓ 23.41s."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "b47a6e6 — V73 + V74 LIVE (V75 batch awaiting user 'deploy' authorization)"
firestore_rules_version: "34 LIVE; v35 (V75 be_fb_configs match) staged in repo, not deployed"
v75_commits_ahead_of_prod: 26
---

# Active Context

## State (session 2 — EOD+1 wrap)

- **~29 V75 commits ahead of prod**; master clean except untracked skill dirs (untouched this session)
- **Items SHIPPED architecturally**:
  - **Item 1** ✓ CustomerDetailView 4-button row polish (session 1)
  - **Item 2** ✓ Whole-fleet customer backup — CLI export (`--all-customers`) + endpoint + CLI restore + AV56 (session 1 + session 2 Tasks 22, 28). UI modals (WholeFleetBackupModal / RestoreModal / BackupManagerTab whole-fleet wire) DEFERRED to V75-bis.
  - **Item 3** ✓ Chat per-branch — webhook resolvers + Rule M backfill script + BSA reader (BS-17) + ChatPanel migration + `/api/admin/fb-test` (Task 14) + FbSettingsTab (Task 15) + nav wire (Task 16) + firestore.rules + Probe #12 (session 1 + session 2)
  - **Item 4** ✓ Chat tab mute helper + AdminDashboard wrapper migration + AV58 + Task 32 extensions
- **V-entry shipped** (Task 38): compact + verbose in `.claude/rules/00-session-start.md` § 2 + `.claude/rules/v-log-archive.md`

## Session 2 commits (this — EOD+1)

```
Task 14: feat(V75 Item 3): /api/admin/fb-test endpoint
Task 15: feat(V75 Item 3): FbSettingsTab.jsx — per-branch FB Page settings
Task 16: feat(V75 Item 3): wire fb-settings tab into nav + permissions + dashboard
Task 22: feat(V75 Item 2): /api/admin/whole-fleet-customer-restore endpoint
Task 28: feat(V75 Item 2): scripts/whole-fleet-customer-restore.mjs CLI
Task 29: test(V75 Item 2): MAHA-ADVERSARIAL test bank for whole-fleet backup
Task 30: test(V75 Item 3 CRITICAL): นครราชสีมา continuity verification
Task 31: test(V75 Item 3): Rule I full-flow simulate — 5-layer chat chain
Task 32: test(V75 Item 4): extend AV58 cross-surface scope audit
Task 38: docs(V75): V-entry compact + verbose
Task 40: docs(V75 state finalize): active.md + SESSION_HANDOFF.md  ← (this commit)
```

## Next action (user-triggered)

1. **User authorizes "deploy"** → combined `vercel --prod` + `firebase deploy --only firestore:rules` + Probe-Deploy-Probe (8 probes incl. #11 V74 + #12 V75 be_fb_configs)
2. **After deploy**: admin runs `node scripts/v75-backfill-chat-conversations-branchid.mjs --apply` (Rule M one-shot; stamps legacy chat_conversations with นครราชสีมา branchId)
3. **Rule Q L1 hands-on** by user — test Items 1, 3, 4 per spec § 8 acceptance scenarios on real prod (multi-device per spec)
4. **V75-bis follow-up session** continues with: Tasks 24-26 (UI modals for whole-fleet) + Tasks 33-34 (live admin-SDK e2e) + Tasks 35-37 (Playwright L1 specs) + cosmetic refactor (extract loadAndVerifyBackup)

## Outstanding user-triggered actions

- Combined `vercel --prod` + `firebase deploy --only firestore:rules` (V75 batch — ~29 commits + new be_fb_configs rule)
- `node scripts/v75-backfill-chat-conversations-branchid.mjs --apply` post-deploy (Rule M; one-shot, idempotent)
- Rule Q L1 multi-device hands-on per spec § 8 acceptance scenarios

## V75-bis backlog (deferred this session)

- Task 21: `/api/admin/whole-fleet-customer-backup-export` endpoint (UI route — CLI works today)
- Task 24: WholeFleetBackupModal.jsx UI
- Task 25: WholeFleetRestoreModal.jsx UI (two-stage preview→confirm)
- Task 26: BackupManagerTab whole-fleet wire (entry button + list type-badge)
- Tasks 33-34: Live admin-SDK e2e against real prod with TEST-V75-WF-CUST-* fixtures (Rule Q L2)
- Tasks 35-37: Playwright L1 specs (Rule Q PREFERRED)
- Cosmetic: extract `loadAndVerifyBackup` from `api/admin/customer-restore.js` to shared module so whole-fleet-restore reuses (zero behavior change)

## Per Rule Q (V66, mandatory)

V75 architectural code shipped + mock + source-grep + Rule I full-flow simulate tests PASS (Tier 2 maha-adversarial pattern). **L1 hands-on verification is USER'S responsibility per spec § 8.** Until L1 confirms on real prod, V75 status = "code shipped, L1-pending". This is NOT a "verified" claim — this is "code complete, user-gated for deploy + L1 verification".
