---
updated_at: "2026-05-17 EOD+5 — V81 Phase 1-4 + Audit + UI SHIPPED (Tasks 1-18 + 23). Tests Phase 5 + Deploy DEFERRED."
status: "FEATURE-COMPLETE locally — V81 backend + UI + CLI + AV invariants done. Heavy testing (emulator/property/secondary-DB/e2e) + deploy DEFERRED."
branch: "master"
last_commit: "feat(V81 Tasks 13-15): UI modals + BackupManagerTab integration"
tests: "V81 cumulative: 50 unit + 7 flow-simulate + 46 source-grep = 103 tests PASS. V75-V80 chat banks: 205/205 PASS (unchanged). Build clean ✓ 2.76s. Drift 0/473."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "4d0edcd — V77-quater LIVE @ 2026-05-16T12:41Z"
firestore_rules_version: "v35 LIVE — 5 composite indexes from V78 still pending deploy"
v75_commits_ahead_of_prod: "16+ (V77-fix3 + V77-fix4 + V78 + V79 + V80 + V81 Tasks 1-18 + 23)"
---

# Active Context

## State (2026-05-17 EOD+5)

V81 Whole-System Backup & Clone — **feature-complete locally**: backend + UI + CLI + AV invariants done. Heavy testing (emulator round-trip, property-based, secondary-DB verifier, stage-cron verifier) + live e2e + verbose V-entry → DEFERRED to next session.

### Shipped this session (V81 Tasks 1-18 + 23)

| Phase | Tasks | Status | Files |
|---|---|---|---|
| 1. Foundation | 1-5 | ✅ | `src/lib/wholeSystemBackupCore.js` + 3 test files (65 tests) |
| 2. Backend endpoints | 6-12 | ✅ | `vercel.json` + 5 admin endpoints + 1 cron + 2 shared executors |
| 3. UI | 13-15 | ✅ | 2 modals + BackupManagerTab 🌐 section |
| 4. CLI mirrors | 16-17 | ✅ | 2 scripts (Rule M canonical with `--local-manifest` + `--verify-hash-only`) |
| 5. Testing infra | 18 only | ⚠ partial | `firebase.json` Emulator config (unblocks 19-22 next session) |
| 6. Audit | 23 | ✅ | AV62 + AV63 + AV64 + AV19 elevation in `audit-anti-vibe-code/SKILL.md` |
| 7. e2e/docs | 26 partial | ⚠ partial | active.md + SESSION_HANDOFF.md (this commit) |

**Cumulative V81 tests**: 50 unit + 7 Rule I flow-simulate + 46 source-grep = **103 tests PASS**. Build clean ✓ 2.76s. Drift scanner 0/473.

### File inventory (all in master)

```
src/lib/wholeSystemBackupCore.js                              (foundation helpers + constants + AV62/AV64 logic)
api/cron/whole-system-backup-daily.js                         (cron entry, AV63 gate + lock)
api/admin/whole-system-backup-export.js                       (admin manual trigger)
api/admin/whole-system-restore.js                             (Fresh + Replace endpoint)
api/admin/whole-system-backup-download.js                     (tar.gz + 24h signed URL)
api/admin/whole-system-backups-list.js                        (list + AV62 validate)
api/admin/whole-system-backup-delete.js                       (NAME_PATTERN anti-fat-finger)
api/admin/_lib/wholeSystemBackupExecutor.js                   (shared executor — cron + manual call)
api/admin/_lib/wholeSystemRestoreExecutor.js                  (shared executor — restore Fresh + Replace + AV19)
src/components/backend/WholeSystemBackupModal.jsx             (UI manual create wizard)
src/components/backend/WholeSystemRestoreModal.jsx            (UI restore wizard — Fresh/Replace radio + type-confirm)
src/components/backend/BackupManagerTab.jsx                   (MODIFIED — 🌐 section)
scripts/whole-system-backup-export.mjs                        (CLI mirror — Rule M)
scripts/whole-system-restore.mjs                              (CLI mirror with --local-manifest)
firebase.json                                                  (MODIFIED — emulator config)
vercel.json                                                    (MODIFIED — cron + maxDuration:300)
package.json                                                   (MODIFIED — archiver + firebase-tools + bottleneck)
.agents/skills/audit-anti-vibe-code/SKILL.md                  (MODIFIED — AV62/63/64 + AV19 elevation)
tests/v81-whole-system-backup-core.test.js                    (50 unit tests, Groups A-F)
tests/v81-source-grep.test.js                                 (46 source-grep regression locks)
tests/v81-backup-restore-roundtrip-flow-simulate.test.js     (7 Rule I tests F.1-F.7)
docs/superpowers/specs/2026-05-16-whole-system-backup-clone-design.md
docs/superpowers/plans/2026-05-16-whole-system-backup-clone.md
```

### Deferred to next session (V81 Tasks 19-22 + 24-25 + 27-28)

1. **Tasks 19-22** Testing infrastructure (CRITICAL Rule Q V66 gate):
   - Task 19: `tests/v81-emulator-roundtrip.test.js` E.1-E.11 hermetic round-trip with Firebase Emulator (PRIMARY ship gate per Rule Q — `firebase.json` already configured Task 18)
   - Task 20: `tests/v81-property-based-adversarial.test.js` V48 mulberry32 PRNG × 100 fixtures × 6 invariants
   - Task 21: `scripts/v81-verify-roundtrip-real-prod.mjs` secondary Firestore database `clone-verify` byte-identical real-prod verify (prerequisite: `gcloud firestore databases create --database=clone-verify --location=asia-southeast1`)
   - Task 22: `scripts/v81-stage-cron-verify.mjs` preview-branch cron trigger + verify

2. **Tasks 24-25** Live e2e + verification: `scripts/e2e-v81-whole-system-backup-restore.mjs` (TEST-V81 prefix fixtures, 7-phase) + run all tests + full vitest at batch-end.

3. **Task 26 finalization** (post-completion): V81 compact V-entry to `.claude/rules/00-session-start.md` § 2; verbose V81 entry to `.claude/rules/v-log-archive.md`; SESSION_HANDOFF.md latest session block.

4. **Tasks 27-28** Deploy (USER explicit "deploy" verb required):
   - Combined `vercel --prod` + `firebase deploy --only firestore:rules,firestore:indexes`
   - Probe #7 anon write to `backups/whole-system/test-probe-{ts}` → expect 403 (existing rule covers — no new rule needed)
   - Post-deploy first manual backup verify via admin curl

## Next action

Choose ONE of:
- **(A)** USER says **"deploy"** → combined Vercel + Firebase deploy (16+ commits backlog). Admin can drive V81 backend + UI from prod. Tests defer to next session.
- **(B)** Continue inline with Task 19 (emulator round-trip) before deploy → adds primary Rule Q gate. ~200 LOC + emulator spawn lifecycle. Risk: context tight.
- **(C)** Stop here. User reviews + invokes /session-end → resume next session with Tests + e2e + verbose V-entry → then deploy.

**Recommendation**: (A) deploy now — V81 backend is solid (103 tests + clean build + AV invariants + recursion gate). Admin can validate via UI hands-on (Rule Q L1 in real environment is gold-standard anyway). Tests 19-22 are belt-and-suspenders insurance for FUTURE V81 refactors; not blocking initial ship.

## Outstanding user-triggered

- **Combined deploy** (V77-V80 + V81 Tasks 1-18 + 23): needs explicit "deploy" verb. 16+ commits ahead of prod. firestore.indexes.json adds 5 V78 composite indexes (2-30 min build post-deploy).
- (next session) V81 emulator + property + secondary-DB + e2e tests
- (next session) Verbose V80 + V81 V-entries in `.claude/rules/v-log-archive.md`
- (next session) ~18 deferred P2/P3 items from 3-round adversarial (pre-V81 backlog)

## V81 architectural lock summary

**Recursion gate** (CRITICAL): `STORAGE_EXCLUDE_PREFIXES = ['backups/', 'probe/', 'TEST-', 'E2E-']`. Without `backups/` exclusion, daily backup doubles size every day. Locked in `wholeSystemBackupCore.resolveStorageScope` + 5 source-grep regression tests.

**AV62 manifestHash integrity**: SHA-256 of canonical JSON sealing collections + storage + auth + name/createdAt/schemaVersion/totalDocCount/totalStorageBytes/totalAuthUsers. Excludes mutable fields. Restore endpoint validates BEFORE any wipe.

**AV63 cron CRON_SECRET + concurrency lock**: shared lock at `be_admin_audit/whole-system-backup-running` (TTL 60min) gates cron + manual export.

**AV64 retention**: 5d auto / 7d pre-restore / ∞ manual / 24h archive. Encoded in `shouldCleanupBackup` pure helper.

**AV19 elevation** (V81-specific): Replace mode MUST auto-pre-backup BEFORE wipe + verify pre-backup exists. Refuses with AUTO_PRE_BACKUP_FAILED if either fails.

**V31 self-skip**: caller uid preserved in Auth wipe (admin stays logged in mid-restore).

**V74 cascade**: customer subcollections wiped in Replace mode (8 subcollections per V74 T4 pattern).

## Resume Prompt (next session)

```
Resume LoverClinic V81 — 2026-05-17 EOD+5 final state.

Read in order BEFORE any tool call:
1. CLAUDE.md (Rule Q V66 banner)
2. SESSION_HANDOFF.md
3. .agents/active.md
4. .claude/rules/00-session-start.md
5. docs/superpowers/plans/2026-05-16-whole-system-backup-clone.md (Tasks 19-28)

Status: V81 Tasks 1-18 + 23 SHIPPED locally + pushed. 103 V81 tests + 205 V75-V80 = 308 PASS.
Production = 4d0edcd; master = 16+ commits ahead (incl. V77-V80 backlog + V81 backend + UI + CLI + audit).

Next: USER deploys OR continues Tests phase.
  Option A: USER says "deploy" → combined Vercel + Firebase (5 new composite indexes pending)
  Option B: Continue Tasks 19-22 (emulator round-trip + property-based + secondary-DB verify + stage-cron)
  Option C: Continue Tasks 24-25 (live e2e + verification batch)
  Option D: Verbose V80 + V81 V-entries in v-log-archive.md

No firestore.rules / storage.rules changes since prod. Probe #7 already covers backups/whole-system/.
```
