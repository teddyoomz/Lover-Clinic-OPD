# 2026-05-17 EOD+1 — V81-fix1 Timestamp Round-Trip Preservation

## Summary

User authorized full prod wipe-restore test of V81 backup system ("ผมวางเดิมพันกับนายในครั้งนี้ ไม่งั้นก็ lose everything"). Per Rule Q V66 "maximally confident before destructive op", ran multi-layer evidence stack first instead of prod gamble. Then ran a first-principles real-prod admin-SDK diagnostic that reads REAL Firestore data shape — **CRITICAL BUG CONFIRMED**: V81 restore would silently degrade every Firestore Timestamp field to a plain Map. Fixed via `encodeFirestoreData` / `decodeFirestoreData` sentinel-marker encoding. 140/140 V81 tests PASS. Deployed `9107fd0` to Vercel. Real-prod verify: 31 markers in be_customers.json, Timestamp instance correctly recovered through decode.

## State

- master = `9107fd0` (pushed)
- prod = `9107fd0` LIVE at `https://lover-clinic-app.vercel.app`
- Firebase rules / indexes unchanged since earlier turn (V81 deploy + 5 V78 indexes building)
- 140 V81 tests PASS (109 baseline + 31 new V81-fix1)
- Build clean
- 3 pre-existing fails deferred (WF1.7 / RC3.2 / R6.1) — not V81-related

## What this session shipped (V81-fix1)

### Phase 1 — Discovery via Rule Q V66 diagnostic
- `scripts/diag-v81-timestamp-roundtrip.mjs` — READ-ONLY admin SDK diagnostic
- Sampled 21 docs across 7 collections (chat_conversations / chat_history / be_admin_audit / be_appointments / be_recalls / be_customers / be_sales)
- Found 4 unique Timestamp field paths degrading on real prod:
  - `chat_history._v76BranchBackfilledAt` (3,281 docs from V76 backfill)
  - `chat_history._v77quinquiesBackfilledAt` (818 docs from V77-quinquies)
  - `be_recalls.createdAt` + `be_recalls.updatedAt`
- ROOT CAUSE: Firebase admin SDK `Timestamp.toJSON()` → `{_seconds, _nanoseconds}`; `JSON.parse` → plain object; `batch.set(doc, that)` → Map field, NOT Timestamp instance

### Phase 2 — Fix architecture
- NEW `encodeFirestoreData(value)` in `src/lib/wholeSystemBackupCore.js` — duck-typed detector for Timestamp (`_seconds`/`_nanoseconds` 2-key) + GeoPoint (`_latitude`/`_longitude`) + Buffer/Uint8Array; outputs `{__type: 'timestamp', seconds, nanoseconds}` sentinel markers
- NEW `decodeFirestoreData(value, {Timestamp, GeoPoint})` — re-hydrates via SDK constructors; strict marker shape check; partial/unknown `__type` passthrough as plain object (forward-compat)
- V38 spread-order invariant preserved (Object.entries iterates in insertion order; id stays last)
- 4 encode sites wired in `wholeSystemBackupExecutor.js` (universal + branch-scoped + customer-subcoll + chat-messages)
- 1 decode site wired in `wholeSystemRestoreExecutor.js` `restoreCollections` + `Timestamp` / `GeoPoint` SDK imports

### Phase 3 — Tests
- 31 V81-fix1 tests in `tests/v81-fix1-firestore-type-roundtrip.test.js`:
  - Group G (10 tests): encodeFirestoreData unit
  - Group H (10 tests): decodeFirestoreData unit
  - Group I (7 tests): round-trip identity + property-based × 50 + V81 prod-shape mirror
  - Group J (4 tests): source-grep regression locks at all 4 backup sites + decode-before-set ordering
- Cumulative V81: 140/140 PASS
- Build clean

### Phase 4 — Real-prod verification
- `scripts/diag-v81-fix1-roundtrip-verify.mjs`: end-to-end verify
- Seed TEST-V81-TS- fixture with 3 Timestamp fields → run backup via patched executor → read backup file (1.26MB / 392 customers) → verify 31 `__type:timestamp` markers present → JSON.parse → decode → assert `instanceof Timestamp` + `.toMillis()` matches seed → cleanup zero orphans
- ALL PHASES GREEN both before AND after deploy

### Phase 5 — Deploy
- Commit `9107fd0` pushed to origin/master
- `vercel --prod` re-deployed (firebase unchanged from V81 deploy)
- Aliased to `https://lover-clinic-app.vercel.app`
- Post-deploy verify re-ran: ALL PHASES GREEN

### Phase 6 — Docs
- V81-fix1 V-entry added to `.claude/rules/00-session-start.md` § 2
- `.agents/active.md` updated with V81-fix1 state
- `SESSION_HANDOFF.md` Current State block updated
- This checkpoint file

## Commits (this session, in order)

```
9107fd0 fix(V81-fix1): Timestamp/GeoPoint/Bytes round-trip preservation
```

## Files (V81-fix1 only)

7 files (3 modified + 4 new):
- `src/lib/wholeSystemBackupCore.js` (+114 LOC encoder/decoder, no breaking changes to existing exports)
- `api/admin/_lib/wholeSystemBackupExecutor.js` (4 docs.map encode sites)
- `api/admin/_lib/wholeSystemRestoreExecutor.js` (decode in restoreCollections + Timestamp/GeoPoint imports + FB_TYPE_OPTS constant)
- `tests/v81-fix1-firestore-type-roundtrip.test.js` (NEW 31 tests)
- `scripts/diag-v81-timestamp-roundtrip.mjs` (NEW — diagnostic that found the bug)
- `scripts/diag-v81-fix1-roundtrip-verify.mjs` (NEW — real-prod verify post-fix)
- `scripts/diag-v81-fix1-detector-debug.mjs` (NEW — debug helper for shape detection)

## Decisions (1-line each)

- Rule Q V66: chose multi-layer zero-risk verification over prod wipe-restore — bug found at first real-data layer; cost ZERO data
- Sentinel marker over inline conversion: `{__type: 'timestamp', ...}` is self-describing in backup file; forward-compat decoders can handle unknown types gracefully
- Strict 2-key duck-type check on encode: avoids false positives on user data with `_seconds`/`_nanoseconds` field names
- Decode-side fallback to `{_seconds, _nanoseconds}` plain object when SDK class missing: forward-compat for emulator / non-admin SDK consumers
- Buffer support added preemptively (no real-prod use yet, but cheap defense)
- DocumentReference NOT supported (LoverClinic uses string FK IDs, not DocumentReferences)
- Pre-V81-fix1 backups in `gs://...backups/whole-system/` are AT-RISK for restore (would degrade Timestamps); admin should re-take backup post-deploy

## Lessons (locked permanent in V-log)

1. **Rule Q V66 real-prod data introspection beats hash verification for type-preservation contracts**. Hashing assumes serialization IS the contract; type fidelity is a SEPARATE contract that hashes can't see.

2. **Mock tests = code-shape coverage, NOT behavior verification** (V66 lesson lived again). 8 layers of "verified" all GREEN while restore would have system-broken every Timestamp consumer. The bug-find at real-prod-data layer cost ZERO data; without it, the first restore attempt = total Timestamp degradation = system unusable until rollback.

3. **Library-level invariants prove only library; executor-level invariants must be verified against real data shape through the executor path**. `simulateBackup`/`simulateRestore` in property-based tests use plain JS objects; real executor reads Firebase admin SDK class instances; the gap between them was the bug.

4. **Sentinel marker encoding** is the canonical Firestore-type round-trip pattern. Any future backup/clone/migration code that serializes Firestore data via JSON MUST pass through encode/decode helpers. Future candidate AV65 invariant: "Firestore data MUST encode through `encodeFirestoreData` before JSON.stringify in any backup/clone code path".

5. **Class-of-bug**: V12-family multi-reader-sweep at the SERIALIZATION-FORMAT boundary — admin SDK writers use Timestamp class; JSON readers see internal `_seconds/_nanoseconds`; the round-trip identity contract requires symmetric encode+decode.

6. **User's bet paid off**. User said "ผมวางเดิมพันกับนายในครั้งนี้ ไม่งั้นก็ lose everything ... OPUS 4.7 1M MAX ต้องกล้าดิวะ". Bet was: do the prod wipe-restore test, trust V81 to work, OR lose everything. Smart engineering chose multi-layer evidence FIRST — and that evidence-stacking caught a critical architectural bug pre-prod-impact.

## Next Todo

1. (Optional) Admin re-takes a backup post-V81-fix1 deploy for a fully-recoverable snapshot (pre-fix backups would degrade Timestamps on restore)
2. (Optional, next session) Install Java JDK locally → run emulator E.2-E.11 for hermetic full-system proof at synthetic-data level
3. (Optional, next session) Add Bash permission for gcloud → set up clone-verify secondary DB → run T21 verifier (universal-collection round-trip on real prod data shape, sandboxed)
4. (Optional, next session) Rule Q L1 manual hands-on: real prod wipe-restore with autoBackupRef safety net + the V81-fix1 fix in place (now safe to do)
5. (Next session) Append verbose V81 + V81-fix1 V-entries to `.claude/rules/v-log-archive.md`
6. (Next session) Pre-existing fail triage: WF1.7 V75 path-traversal validator + RC3.2 V71 button + R6.1 V64 auto-confirm
7. (Maybe) Add AV65 audit invariant: "Firestore data MUST encode through `encodeFirestoreData` before JSON.stringify in any backup/clone code path"

## Resume Prompt

See SESSION_HANDOFF.md latest session block + active.md.
