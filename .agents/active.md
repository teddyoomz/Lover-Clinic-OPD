---
updated_at: "2026-05-16 EOD+1 SESSION-END — V75 DEPLOYED ✓✓✓ (Firebase rules + Vercel both LIVE; backfill --apply ran clean; awaiting Rule Q L1 hands-on by user)"
status: "DEPLOYED — V75 Items 1+2+3+4 LIVE on https://lover-clinic-app.vercel.app; firestore.rules v35 LIVE with be_fb_configs match"
branch: "master"
last_commit: "docs(V75): correct commits-ahead count 29 → 26 (git log truth)"
tests: "~210+ V75 assertions PASS across 17 test files. Full vitest 10760/10775 PASS (99.86%) — 3 pre-existing V71 failures. Build clean ✓ 23.41s. Probe-Deploy-Probe 6/6 PRE + 6/6 POST + cleanup ✓."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "V75 LIVE — Firebase rules v35 deployed + Vercel build 2m complete at 2026-05-16T11:25Z"
firestore_rules_version: "v35 LIVE (V75 be_fb_configs match added)"
v75_commits_ahead_of_prod: 0
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

✓ Combined `vercel --prod` + `firebase deploy --only firestore:rules` — **DEPLOYED 2026-05-16T11:25Z**
✓ `node scripts/v75-backfill-chat-conversations-branchid.mjs --apply` — **RAN, 0 writes** (collection was already clean — idempotent; audit doc `be_admin_audit/v75-chat-conversation-branch-backfill-1778930762379-e74b206f`)
⏳ **Rule Q L1 multi-device hands-on by USER** (cannot be done by Claude — needs real devices)

### Rule Q L1 acceptance checklist (per spec § 8)

Open https://lover-clinic-app.vercel.app on real device(s) + walk through:

**Item 1 — Button polish** ✓ scenario 1:
- [ ] Customer detail page (e.g. LC-26000001) → 4 buttons (`แก้ไข`/`ผูก LINE`/`💾 สำรอง`/`ลบลูกค้า`) single row, equal heights, no wrap

**Item 2 — Whole-fleet backup** (UI deferred to V75-bis; CLI works today):
- [ ] CLI test: `node scripts/customer-backup-export.mjs --all-customers` (dry-run, no --apply) → prints customer count + manifestHash preview
- [ ] (skip scenarios 2-3 in spec until V75-bis UI ships)

**Item 3 — Chat per-branch** ✓ scenarios 4, 5, 6:
- [ ] **CONTINUITY (สาขานครราชสีมา)**: switch to นครราชสีมา → chat tab → existing chats visible identical to pre-V75; LineSettingsTab → existing creds visible; **NEW** FbSettingsTab → auto-seed banner + pre-populated form from clinic_settings/chat_config → click save → no broken state
- [ ] **New branch** (ทดลอง 1): switch → chat tab → empty state; LineSettings → empty form; set up creds → save → simulate LINE message → chat appears under ทดลอง 1 only (NOT นครราชสีมา)
- [ ] **FB setup**: ทดลอง 1 → FbSettingsTab → save creds → simulate FB Page message → chat under ทดลอง 1 only

**Item 4 — Chat noti mute** ✓ scenarios 7, 8:
- [ ] Doctor's machine: Frontend chat tab → 🔔 click → flips to 🔕 + banner; send test LINE → no chat sound; appointment due-chime STILL rings; V73 staff-chat STILL rings; 🔕 click → 🔔 + sound resumes
- [ ] Per-device isolation: front desk unmuted + doctor muted; test LINE → only front desk hears sound (verifies localStorage scope)

If any scenario fails → report back; Claude can debug + ship V75-bis fix in next session.

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
