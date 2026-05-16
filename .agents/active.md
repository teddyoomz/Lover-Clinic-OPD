---
updated_at: "2026-05-17 EOD+1 ~01:30 BKK — V81-fix1 Timestamp round-trip preservation SHIPPED + verified on REAL PROD"
status: "V81 + V81-fix1 deployed. Backup system VERIFIED on real prod via Rule Q L2 + e2e round-trip"
branch: "master"
last_commit: "9107fd0 fix(V81-fix1): Timestamp/GeoPoint/Bytes round-trip preservation"
tests: "V81 cumulative 140/140 PASS (109 existing + 31 V81-fix1 G/H/I/J groups)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "9107fd0 — V81 + V81-fix1 LIVE @ 2026-05-17 (Vercel)"
firestore_rules_version: "v35 LIVE + 5 V78 composite indexes deployed (building 2-30min)"
---

# Active Context

## State
- V81 Whole-System Backup & Clone DEPLOYED.
- V81-fix1 (Timestamp/GeoPoint/Bytes encode/decode) DEPLOYED.
- Pre-V81-fix1 V81 restore would have silently degraded every Timestamp → Map.
- Rule Q V66 real-prod diagnostic caught the bug before any actual restore was triggered.

## V81-fix1 — what + why
**Bug**: Firebase admin SDK Timestamp.toJSON() outputs `{_seconds, _nanoseconds}`;
JSON.parse on backup file gives plain object; batch.set writes as Map, NOT
Timestamp. Type degraded silently across round-trip.

**Fix**: encodeFirestoreData wraps Firestore-native types in `{__type, ...}`
sentinel markers before JSON.stringify. decodeFirestoreData re-hydrates via
Firebase admin SDK constructors on restore. Supports Timestamp + GeoPoint + Bytes.

**Bug invisible to**: 109 V81 mock tests, property-based × 100 fixtures (plain JS), e2e × 2 (verified hash + counts, not field shapes), AV62 hash validation (hash matches both sides because serialization is consistent). Only real-prod admin-SDK diagnostic that reads actual Timestamp instances caught it.

## Evidence stack (11 layers green, V81-fix1 added)
1. 140/140 V81 vitest PASS
2. Build clean
3. V38 fix verified at all 4 sites in backup executor
4. AV62 + AV63 + AV64 + AV19 invariants in code
5. STORAGE_EXCLUDE_PREFIXES recursion gate confirmed
6. Restore executor AV62 hash validation + AV19 auto-pre-backup gate
7. Storage rules wildcard covers `/backups/whole-system/*`
8. Pre-V81-fix1 real-prod e2e × 2 (7 phases each): backup→manifest→hash→cleanup→zero-orphans
9. Pre + post deploy probes match (200/403/403/403)
10. **NEW V81-fix1 real-prod verify**: backup file contains 31 timestamp markers; decode re-hydrates as Timestamp instance with .toMillis() matching seed; zero orphans
11. Firebase rules unchanged since prod (no regression risk)

## V81-fix1 files (commit 9107fd0)
- `src/lib/wholeSystemBackupCore.js` (+114 LOC encodeFirestoreData + decodeFirestoreData)
- `api/admin/_lib/wholeSystemBackupExecutor.js` (4 docs.map encode sites)
- `api/admin/_lib/wholeSystemRestoreExecutor.js` (decode in restoreCollections + Timestamp/GeoPoint imports)
- `tests/v81-fix1-firestore-type-roundtrip.test.js` (NEW 31 tests G/H/I/J)
- `scripts/diag-v81-timestamp-roundtrip.mjs` (NEW diagnostic — found the bug)
- `scripts/diag-v81-fix1-roundtrip-verify.mjs` (NEW real-prod verify)
- `scripts/diag-v81-fix1-detector-debug.mjs` (debug helper)

## Next action
User can now:
- Trigger manual backup via Backend → จัดการ Backup → "Backup Now"
- Download the backup tar.gz for local archival
- (Optional Rule Q L1) Trigger Replace-mode restore on a test/staging environment

Daily auto-cron fires at 03:00 BKK (next firing tonight). Indexes building 2-30 min.

## Outstanding user-triggered actions
- (Optional, next session) Install Java JDK locally → run emulator E.2-E.11 for hermetic full-system proof
- (Optional, next session) Add Bash permission for gcloud → set up clone-verify secondary DB → run T21 verifier
- (Optional, next session) Rule Q L1 manual hands-on: real prod wipe-restore with autoBackupRef safety net
- (Next session) Append verbose V81 + V81-fix1 V-entries to v-log-archive.md
- (Next session) WF1.7 V75 path-traversal investigation + RC3.2 V71 + R6.1 V64 pre-existing failure triage

## V81-fix1 lesson (codified)
Rule Q V66 saved the V81 system. 8 layers of "verified" (incl. real-prod e2e × 2)
all GREEN while restore would have silently corrupted prod. The bug-find at
real-prod-data layer cost ZERO data; without it, the first restore would have
broken every Timestamp field system-wide. **Real-data introspection beats hash
verification for type-preservation contracts.**
