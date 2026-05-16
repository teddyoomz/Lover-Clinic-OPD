---
updated_at: "2026-05-17 EOD+5 — V81 Phase 1+2+Audit SHIPPED (Tasks 1-12 + 23). UI + Tests + Deploy DEFERRED to next session."
status: "PARTIAL SHIP — V81 backend + AV invariants complete; UI (13-15) + CLI (16-17) + emulator/property tests (18-22) + e2e (24) + deploy (27-28) pending"
branch: "master"
last_commit: "<latest> feat(V81 Task 23): AV62 + AV63 + AV64 + AV19 elevation invariants"
tests: "V81 cumulative: 50 unit + 7 flow-simulate + 46 source-grep = 103 tests PASS. V75-V80 chat banks: 205/205 PASS (unchanged)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "4d0edcd — V77-quater LIVE @ 2026-05-16T12:41Z; V77-fix3/V77-fix4/V78/V79/V80/V81-partial NOT YET deployed"
firestore_rules_version: "v35 LIVE — 5 composite indexes from V78 pending deploy (no V81 rule/index changes — existing Probe #7 covers backups/whole-system/)"
v75_commits_ahead_of_prod: "13+ (V77-fix3 + V77-fix4 + V78 + V79 + V80 + V81 Tasks 1-12 + 23)"
---

# Active Context

## State (2026-05-17 EOD+5)

V81 Whole-System Backup & Clone — **partial ship**: backend complete, UI + tests + deploy deferred.

### Done this session (V81)

- **Task 1-5** (Phase 1 foundation): `src/lib/wholeSystemBackupCore.js` with constants + scope helpers + manifest builder + AV62 hash sealing + AV64 retention helpers + sanitize+diff. `tests/v81-whole-system-backup-core.test.js` (50 unit tests, Groups A-F). `tests/v81-source-grep.test.js` + `tests/v81-backup-restore-roundtrip-flow-simulate.test.js` (7 Rule I tests).
- **Task 6**: `vercel.json` cron @ `0 20 * * *` UTC (= 03:00 BKK) + maxDuration:300 for V81 endpoints. npm devDeps `archiver@^8` + `firebase-tools@^15`. npm deps `bottleneck@^2`.
- **Task 7**: `api/cron/whole-system-backup-daily.js` + `api/admin/_lib/wholeSystemBackupExecutor.js` shared executor. AV63 CRON_SECRET gate + concurrency lock. AV64 cleanup retention piggyback.
- **Task 8**: `api/admin/whole-system-backup-export.js` admin manual trigger. Shares cron's lock. type='manual' default, 'pre-restore' opt-in. runCleanup:false.
- **Tasks 9-10**: `api/admin/whole-system-restore.js` + `api/admin/_lib/wholeSystemRestoreExecutor.js`. Fresh-only mode (assertTargetEmpty) + Replace mode (AV19 elevation auto-pre-backup MANDATORY + verify before wipe). V31 self-skip in Auth import + wipe. V74 cascade pattern in wipe. be_admin_audit immutable. Storage wipe skips backups/ prefix.
- **Task 11**: `api/admin/whole-system-backup-download.js` server-streams folder → tar.gz via archiver. 24h signed URL. Reuses cached `__archive.tar.gz` if < 24h old.
- **Task 12**: `api/admin/whole-system-backups-list.js` + `api/admin/whole-system-backup-delete.js`. List enumerates manifests + AV62 validates + sorts createdAt desc. Delete uses NAME_PATTERN anti-fat-finger gate.
- **Task 23**: AV62 + AV63 + AV64 + AV19 elevation entries appended to `.agents/skills/audit-anti-vibe-code/SKILL.md`. Priority table updated.

**Cumulative V81 tests**: 50 unit + 7 flow-simulate + 46 source-grep = **103 tests PASS**.
**Build clean** ✓ 3.13s post-deps install.

### Deferred to next session (V81 Tasks 13-28)

1. **Tasks 13-15** UI (3 files):
   - `src/components/backend/WholeSystemBackupModal.jsx` (manual create wizard)
   - `src/components/backend/WholeSystemRestoreModal.jsx` (Fresh/Replace radio + type-confirm + reset-emails opt-in)
   - `BackupManagerTab.jsx` extend with 🌐 Whole-System section + list rows + per-row actions (Download/Restore/Delete)

2. **Tasks 16-17** CLI mirrors (2 files): `scripts/whole-system-backup-export.mjs` + `scripts/whole-system-restore.mjs` (with --local-manifest + --verify-hash-only). Both call shared executors directly.

3. **Tasks 18-22** Testing infrastructure (CRITICAL Rule Q V66 gate):
   - Task 18: `firebase.json` Emulator Suite config (auth + firestore + storage + ui ports)
   - Task 19: `tests/v81-emulator-roundtrip.test.js` E.1-E.11 hermetic round-trip (PRIMARY ship gate per Rule Q)
   - Task 20: `tests/v81-property-based-adversarial.test.js` V48 mulberry32 PRNG × 100 fixtures × 6 invariants
   - Task 21: `scripts/v81-verify-roundtrip-real-prod.mjs` secondary Firestore database `clone-verify` byte-identical real-prod verify
   - Task 22: `scripts/v81-stage-cron-verify.mjs` preview-branch cron trigger + verify

4. **Tasks 24-25** Verification batch: `scripts/e2e-v81-whole-system-backup-restore.mjs` (TEST-V81 prefix fixtures, 7-phase) + run all tests + build + drift scanner.

5. **Task 26** State docs update (post-completion): V81 compact V-entry to `.claude/rules/00-session-start.md` § 2 + SESSION_HANDOFF.md session block.

6. **Tasks 27-28** Deploy (USER explicit "deploy" verb required):
   - Combined `vercel --prod` + `firebase deploy --only firestore:rules,firestore:indexes`
   - Probe #7 anon write to `backups/whole-system/test-probe-{ts}` → expect 403 (existing rule covers)
   - Post-deploy: trigger first manual backup via admin curl + verify folder + audit doc

## Next action (this turn or next session)

Choose:
- **(A)** Continue inline with Tasks 13-15 UI (in this session — context may be tight; smaller tasks; if context runs out mid-task, defer to next)
- **(B)** Stop here + use /session-end to checkpoint → resume next session with UI + tests + deploy
- **(C)** Skip UI for now, jump to Task 19 (Firebase Emulator round-trip — PRIMARY Rule Q gate). Then UI in next session.
- **(D)** Push current state + user authorizes immediate `vercel --prod` deploy of backend-only (UI follows next session — admin can drive endpoints via curl meanwhile)

## Outstanding user-triggered

- **Combined deploy** (V77-V80 + V81 Tasks 1-12 + 23): needs explicit "deploy" verb. 13+ commits ahead of prod. firestore.indexes.json adds 5 V78 composite indexes (2-30 min build post-deploy).
- (next session) Verbose V80 + V81 V-entries in `.claude/rules/v-log-archive.md`
- (next session) ~18 deferred P2/P3 items from 3-round adversarial (pre-V81 backlog)

## Class-of-bug pattern lock (this session)

**V11/V21 family at hook-import boundary** (V80 P0a — useMemo not defined): hook used but not imported → ReferenceError at runtime → React unmounts entire tree → black screen. Build passes because identifier resolution is runtime. Mock tests pass because they hoist `useMemo` independently. Fixed via AV60 perpetual drift scanner (`scripts/diag-react-hook-import-drift.mjs`) → 0/462 files post-fix.

**Multi-reader-sweep at fall-through-filter boundary** (V80 P0b — chat history leak): 7 chat_history docs with missing branchId leaked across all 3 branch views because `!item.branchId || X` fall-through universally included them. Fixed via 3-layer: Rule M backfill (7 docs → NAKHON) + Reader NAKHON-gating (4 sites: 2 readers + handleResolve writer with HARDCODED_NAKHON_BR_ID + useChatUnread filter) + AV61 invariant.

## Resume Prompt (for next session)

```
Resume LoverClinic V81 — continue from 2026-05-17 EOD+5.

Read in order BEFORE any tool call:
1. CLAUDE.md (Rule Q V66 banner)
2. SESSION_HANDOFF.md (master ahead by 13+; prod=4d0edcd)
3. .agents/active.md (V81 Phase 1+2+Audit DONE; Tasks 13-28 pending)
4. .claude/rules/00-session-start.md
5. docs/superpowers/specs/2026-05-16-whole-system-backup-clone-design.md
6. docs/superpowers/plans/2026-05-16-whole-system-backup-clone.md (Tasks 13-28 inline)

Next action: continue subagent-driven OR inline (user choice).
- Tasks 13-15: UI modals + BackupManagerTab integration
- Tasks 16-17: CLI mirrors
- Tasks 18-22: Firebase Emulator + property-based + secondary-DB + stage-cron testing
- Tasks 24-25: e2e + full verification batch
- Tasks 27-28: combined deploy (needs explicit "deploy" verb)

103 V81 tests PASS. Build clean. AV62/AV63/AV64 + AV19 elevation locked.
No firestore.rules / storage.rules changes (Probe #7 covers backups/).
```
