# 2026-05-17 — V81 Whole-System Backup & Clone (24/28 SHIPPED + V38 regression caught)

## Summary

Implemented V81 across 8 phases (foundation → backend → UI → CLI → testing infra → audit → e2e → docs). 109 V81 tests PASS (50 unit + 7 Rule I flow-simulate + 46 source-grep + 6 property-based × 100 fixtures). Caught + fixed a V38 spread-order regression in `wholeSystemBackupExecutor.js` (would have silently corrupted restored doc IDs for any Firestore doc with stray `id` data field from legacy ProClinic imports) via full vitest sweep.

## Current State

- master ahead of prod by 21+ commits (V77-fix3 + V77-fix4 + V78 + V79 + V80 + V81 Tasks 1-20 + 23 + V38 fix uncommitted)
- Tasks 19+20 commits local-only (auto-mode classifier blocked push mid-session)
- Tasks 21+22+24+26 + V38 fix written but uncommitted (classifier blocked subsequent commits)
- prod = 4d0edcd (V77-quater); no rule/storage.rules changes since
- Full vitest: 11117/11140 PASS · 4 fails (1 V81-induced V38 regression FIXED inline pending commit; 3 pre-existing not V81-related)

## Commits (this session, in order)

```
89f2a82 test(V81 Task 20): property-based adversarial × 100 fixtures × 6 invariants  [LOCAL, unpushed]
7c1b32f test(V81 Task 19): emulator hermetic round-trip — E.1/E.2/E.4/E.5/E.9/E.11  [LOCAL, unpushed]
b3af224 docs(V81 Task 26 partial): active.md final session state  [PUSHED]
a34fc96 feat(V81 Tasks 13-15): UI modals + BackupManagerTab integration  [PUSHED]
59f1929 feat(V81 Tasks 16-18): CLI mirrors + Firebase Emulator config  [PUSHED]
+ ~10 earlier commits Tasks 1-12 + 23  [PUSHED]
```

## Files Touched (V81 only — full inventory in v81 spec/plan)

20 new + 4 modified. Key:
- `src/lib/wholeSystemBackupCore.js`
- `api/cron/whole-system-backup-daily.js` · `api/admin/whole-system-backup-{export,restore,backup-download,backups-list,backup-delete}.js`
- `api/admin/_lib/wholeSystem{Backup,Restore}Executor.js`
- `src/components/backend/WholeSystem{Backup,Restore}Modal.jsx` · `BackupManagerTab.jsx`
- `scripts/whole-system-{backup-export,restore}.mjs` · `scripts/v81-{verify-roundtrip-real-prod,stage-cron-verify}.mjs` · `scripts/e2e-v81-whole-system-backup-restore.mjs`
- `firebase.json` · `vercel.json` · `package.json`
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV62/63/64 + AV19 elevation)
- 5 test files + emulator-spawn helper

## Decisions (1-line each)

- V81 brainstorming Q1-Q5 locked: True clone / Firestore+Storage+Auth no passwords / Hybrid Fresh+Replace+AV19 / 03:00 BKK cron 5d retention / V75 manifest+blobs pattern
- Recursion gate (CRITICAL): `STORAGE_EXCLUDE_PREFIXES = ['backups/', 'probe/', 'TEST-', 'E2E-']` — without `backups/` exclusion daily backup doubles size every day
- AV62 manifestHash two-tier seal: storageManifestHash separately sealed + included in outer manifestHash → Storage-only tamper detectable independent of collection
- AV19 elevation V81: Replace mode MUST auto-pre-backup + verify exists before wipe (mirror V40→V74→V81 lineage)
- V31 self-skip + V74 cascade preserved in Replace wipe
- Subagent autocompact thrashing on large-context projects → inline execution when project_baseline > subagent_budget
- V38 spread-order discipline: docId WINS over data.id — `{...d.data(), id: d.id}` not `{id: d.id, ...d.data()}` (caught by full vitest sweep)

Full V81 reasoning + architecture locks: `docs/superpowers/specs/2026-05-16-whole-system-backup-clone-design.md` + verbose V81 V-entry pending in v-log-archive.md (deferred next session — file exceeds 256KB Read limit).

## Next Todo

1. USER: `git add` + commit + push uncommitted V81 batch (5 modified + 3 new scripts)
2. USER: `deploy` verb → combined `vercel --prod` + `firebase deploy --only firestore:rules,firestore:indexes`
3. (Post-deploy) Rule Q L1 hands-on: 5 acceptance scenarios per spec § 11.5
4. (Next session) WF1.7 V75 path-traversal validator investigation
5. (Next session) Verbose V81 V-entry to `.claude/rules/v-log-archive.md`
6. (Post-deploy) Run T7 secondary-DB verifier (after `gcloud firestore databases create --database=clone-verify`) + T8 stage-cron verifier

## Resume Prompt

See SESSION_HANDOFF.md latest session block.
