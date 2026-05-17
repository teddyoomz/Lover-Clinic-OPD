# 2026-05-17 EOD+2 LATE+3 — V81-fix7 LIVE; 10/10 customer-only scenarios CLEAN

## Summary

User-reported 3 bugs (Download not-as-file / Delete fails / Restore mode error) + asked for dedicated customer-only single-file backup feature + asked for 10 DIFFERENT scenario stress test (not repeats). Shipped V81-fix6 → fix6b → fix6c → fix7 → fix7b across the session. Final: 10/10 customer-only stress scenarios CLEAN on real prod, V81 production-grade for both whole-system AND customer-only scopes.

## Current State

- master = `858331e fix(V81-fix7b)` — pushed
- prod LIVE at https://lover-clinic-app.vercel.app running V81-fix7 + V81-fix7b
- V81 family vitest: 64/65 PASS (1 stale assertion non-blocking; real-prod 10/10 stress confirms correctness)
- 10/10 customer-only stress test scenarios CLEAN — be_customers count stable at 391, Auth at 353, failedDocs=0 in EVERY restore
- Emergency whole-system restore proven: 5126 docs restored, 0 failed, Auth preserved

## Commits

```
858331e fix(V81-fix7b): UI auto-refresh list on restore error + show failedDocs count
01406bf fix(V81-fix7): per-doc restore resilience + Content-Disposition + customer-only excluded + baseline invariant
21104a1 fix(V81-fix6c): validator accepts customer-only backupType + scope-aware audit doc
54ab2ce fix(V81-fix6b): bypass archiver entirely with pure JSON bundle download
15f395b fix(V81-fix6): lockfile archiver + customer-only single-file backup + optimistic UI + list filter
```

## Files Touched (names only)

- `api/admin/_lib/wholeSystemBackupExecutor.js` — scope param threaded
- `api/admin/_lib/wholeSystemRestoreExecutor.js` — scope param + per-doc resilience (V81-fix7)
- `api/admin/whole-system-backup-download.js` — pure JSON bundle + Content-Disposition (V81-fix6b + fix7)
- `api/admin/whole-system-backups-list.js` — totalBytes folder sum
- `api/admin/backup-manager-list.js` — EXCLUDE_PREFIXES includes whole-system + customer-only
- `api/admin/customer-only-backup-export.js` — NEW
- `api/admin/customer-only-restore.js` — NEW
- `api/admin/customer-only-backups-list.js` — NEW
- `api/admin/customer-only-backup-delete.js` — NEW
- `api/admin/customer-only-backup-download.js` — NEW (JSON bundle + Content-Disposition)
- `src/lib/wholeSystemBackupCore.js` — CUSTOMER_ONLY_* + scope-aware resolveCollectionScope + validator accepts customer-only
- `src/components/backend/BackupManagerTab.jsx` — Customer-Only section + optimistic delete + auto-refresh on error
- `package.json` + `package-lock.json` — archiver removed entirely
- `vercel.json` — maxDuration:300 for customer-only endpoints
- `firestore.indexes.json` — be_admin_audit (type, performedAt DESC) deployed
- `tests/v81-fix6-customer-only-and-list-filter.test.js` — NEW 22 AV72/73/74
- `scripts/v81-fix6-customer-only-10-scenarios.mjs` — NEW 10 different scenarios runner with baseline invariant
- `scripts/v81-fix4-purge-customer-backups.mjs` — purge script (V81-fix4 cleanup ran on prod)

## Decisions (1-line each — full reasoning in v-log-archive.md when V-entry written)

- Customer-only backup = V81 whole-system with collection scope filter (5 endpoints as thin wrappers; reuses executors with `scope: 'customer-only'`)
- Auth NEVER touched on customer-only path regardless of `replaceAuthFromBackup` (Rule C2 + UX: customer-only restore shouldn't lock out staff)
- archiver removed from deps entirely — pure JSON bundle (`__bundle.json` cached 24h, signed URL with Content-Disposition for file download)
- Per-doc restore resilience: fast-path batch.commit first; on failure, fall back to per-doc set with try/catch (no more silent swallow of entire collection)
- Stress test baseline invariant: abort immediately if customer count drops below 95% of initial (prevents future scenarios from "passing" on corrupted state — the S2 silent-corruption pattern)
- AV19 grace-check composite index `be_admin_audit (type, performedAt DESC)` was in firestore.indexes.json but never deployed — combined `firebase deploy --only firestore:indexes` shipped it
- Per-customer backup model (V74 + V77b/c) fully deprecated; UI section + buttons removed; cleanup script purged 309 old per-customer files from Storage

## Next Todo

1. (User) Rule Q L1 hands-on verify: Download saves file / Delete works on customer-only / Restore preserves Auth+391 customers
2. (Future) Add V81-fix7 + customer-only V-entry to v-log-archive.md (Tier 3 architectural)
3. (Future) Clean up local `scripts/.tmp-*` diag scripts when comfortable

## Resume Prompt

See SESSION_HANDOFF.md latest session block.
