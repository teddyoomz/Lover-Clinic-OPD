# Selective Make-Fresh + Backup Round-trip Integrity — Design Spec

> **Date**: 2026-05-14
> **Author**: claude (brainstormed with @teddyoomz)
> **Status**: APPROVED via brainstorming Q1-Q6 — pending spec review
> **Companion plan**: `docs/superpowers/plans/2026-05-14-selective-make-fresh-and-backup-integrity.md` (to be written by writing-plans skill)
> **V-Series**: extends V40 (Branch Backup/Restore/Make-Fresh, 2026-05-07)
> **Iron-clad refs**: Rule Q (V66 — real-adversarial verification) · Rule M (admin-SDK data ops) · AV19 (destructive ops require auto-backup)

---

## §0 — Motivation + Scope

### Problem

The V40 "ทำให้เป็นสาขาใหม่" button atomically wipes T1+T2+T3+T4 for a branch. There's no way to selectively wipe just one tier (e.g., "ลบนัดหมายเก่าๆ ออก แต่เก็บ master data ไว้"). This makes it useless for everyday developer/admin needs:

- Dev pre-seeding a test branch: wants to wipe transactions only, keep master data.
- Admin clearing accumulated test pollution: same need.
- Branch reset before a fiscal year: wants to wipe stock+sales+finance, keep customer activity intact.

### Solution

Extend V40 with **selective bucket-level wipe**, **scope-matched auto-backup**, and **cryptographic round-trip integrity** so that:

1. Admin can tick 1-7 logical buckets (appointments / treatments / sales / stock / finance / line-link / customer-activity) to wipe.
2. Auto-backup scope **exactly matches** what will be wiped — no over-capture, no under-capture.
3. Hash verification before wipe ensures **the backup file is a valid restore source** — protects against Storage corruption, network bit-flip, schema drift.
4. Master data (T1) is **permanently exempt from this button** — even Advanced mode cannot select T1 collections; server rejects T1 entries with 400 `T1_NOT_WIPEABLE`.
5. Round-trip integrity is proven via **admin-SDK e2e on real prod with TEST-prefixed fixtures** (Rule Q L2) and **Playwright real-browser drive on the deployed UI** (Rule Q L1).

### Out of scope

- Restore UX changes: V40 `BranchBackupTab` continues to support overwrite + clone modes; selective backup files naturally restore selective scope since `writtenCollections = Object.keys(file.collections)`.
- Customer-cross-branch ID reassignment.
- Universal collections (`be_customers`, `be_staff`, `be_doctors`, `clinic_settings`, `chat_conversations`, etc.) — NEVER touched by this feature.

---

## §1 — Brainstorming Decisions (Q1-Q6, user-approved)

| Q | Decision | Rationale |
|---|---|---|
| Q1 | **D — Hybrid**: bucket UI (default) + Advanced collection-level toggle + T1 protected server-side. | Admin staff use buckets (semantic); developer uses Advanced for fine-grained control; T1 unreachable via either path. |
| Q2 | **B — Match-selected-scope** backup. | AV19 preserved (always backup) + smaller file + faster upload/download + restore brings back exactly what was wiped. |
| Q3 | **A — 7 buckets** (appointments / treatments / sales / stock / finance / line-link / customer-activity). | Matches user's mental categories. Bucket 4 stock breaks into 6 T3 collections in Advanced mode. |
| Q4 | **B — Default = 6 checked + Bucket 7 (customer activity) UNCHECKED**. | Common case "ทำสาขาให้ใหม่" = 1-click "Confirm". Bucket 7 affects customer-visible state (wallet/points) → opt-in only. |
| Q5 | **B — Test-bank + Runtime SHA-256 hash verification (defense-in-depth)**. | Hash catches Storage bit-rot + schema drift; test-bank catches design bugs. Pre-wipe dry-run (C) deferred. |
| Q6 | **B — 3-step UX**: Pick → Preview (real per-bucket counts via dry-run) → Type-confirm → Run. | Preview gives admin real numbers BEFORE commit; misclick caught at preview step; matches "ทดสอบให้แน่ใจที่สุด" directive. |

---

## §2 — Architecture (4 layers)

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Layer (React)                                                 │
│  MakeFreshModal.jsx (REWRITE — 3-step state machine)            │
│  BranchesTab.jsx (EDIT — button label unchanged)                │
│  MakeFreshButton.jsx (no change)                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Endpoints (Vercel serverless, admin-token gated)                 │
│  /api/admin/branch-backup-export (EDIT — bucketIds[] + dryRun)  │
│  /api/admin/branch-make-fresh    (EDIT — bucketIds[] + hash)    │
│  /api/admin/branch-restore       (NO CHANGE — handles partial)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Lib (pure ESM, branch-blind, no Firebase deps)                   │
│  src/lib/branchBackupBuckets.js   (NEW — 7-bucket schema)       │
│  src/lib/branchBackupSchema.js    (EDIT — v2 + bodyHash)        │
│  src/lib/branchBackupCore.js      (NO CHANGE — TIER_MAP reused) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Firestore (artifacts/loverclinic-opd-4c39b/public/data)          │
│  be_appointments, be_sales, be_treatments, ... (target)         │
│  be_customers/{cid}/appointments, ... (T4 subcollections)       │
│  be_admin_audit (audit trail with bodyHash field)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Cloud Storage (gs://loverclinic-opd-4c39b.firebasestorage.app)   │
│  backups/{branchId}/auto-pre-fresh-{ts}-{rand}.json (v2 schema) │
└─────────────────────────────────────────────────────────────────┘
```

**Server-side T1 protection** (CRITICAL invariant):

```
assertNotT1(resolvedCollections)
  | called inside resolveBucketScope() at both endpoints
  | even if UI somehow sends T1 collection name (Advanced mode bug, or hand-crafted curl)
  | endpoint rejects with 400 T1_NOT_WIPEABLE before any work
```

---

## §3 — Components

### 3.1 `src/lib/branchBackupBuckets.js` (NEW)

Single source of truth for the bucket schema. Pure ESM, no Firebase deps.

```js
// 7-bucket schema (Object.freeze for immutability)
export const BUCKETS = Object.freeze({
  appointments: {
    label: '📅 นัดหมาย',
    description: 'ลบนัดหมาย + per-customer appointments subcollection',
    collections: ['be_appointments'],
    customerSubcollections: ['appointments'],
    defaultChecked: true,
  },
  treatments: {
    label: '💊 การรักษา',
    description: 'ลบการรักษา + per-customer treatments subcollection',
    collections: ['be_treatments'],
    customerSubcollections: ['treatments'],
    defaultChecked: true,
  },
  sales: {
    label: '💰 การขาย',
    description: 'ลบการขาย / vendor sales / online sales / quotation / sale insurance claim + per-customer sales subcoll',
    collections: ['be_sales', 'be_vendor_sales', 'be_online_sales', 'be_quotations', 'be_sale_insurance_claims'],
    customerSubcollections: ['sales'],
    defaultChecked: true,
  },
  stock: {
    label: '📦 สต็อก (ทั้งหมด)',
    description: 'ลบสต็อกทั้ง state + ledger (T3 6 collections)',
    collections: ['be_stock_batches', 'be_stock_movements', 'be_stock_orders',
                  'be_stock_transfers', 'be_stock_withdrawals', 'be_stock_adjustments'],
    customerSubcollections: [],
    defaultChecked: true,
  },
  finance: {
    label: '💵 การเงิน + มัดจำ',
    description: 'ลบรายจ่าย + มัดจำ + per-customer deposits subcollection',
    collections: ['be_expenses', 'be_deposits'],
    customerSubcollections: ['deposits'],
    defaultChecked: true,
  },
  lineLink: {
    label: '🎫 คำขอเชื่อม LINE',
    description: 'ลบคำขอเชื่อม LINE OA → customer',
    collections: ['be_link_requests'],
    customerSubcollections: [],
    defaultChecked: true,
  },
  customerActivity: {
    label: '⭐ กิจกรรมลูกค้า (wallet/membership/points/courseChanges)',
    description: '⚠️ ลบ wallet balance + membership + loyalty points + course-exchange log ของลูกค้า — affects customer-visible state',
    collections: [],
    customerSubcollections: ['wallets', 'memberships', 'points', 'courseChanges'],
    defaultChecked: false,  // Q4 — opt-in only
  },
});

/**
 * Resolve a list of bucket IDs into a flat list of {collections, subcollections}.
 * Throws if any bucket ID is unknown.
 */
export function resolveBucketScope(bucketIds) {
  if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
    throw new Error('EMPTY_BUCKET_SET');
  }
  const collections = new Set();
  const subcollections = new Set();
  for (const id of bucketIds) {
    const b = BUCKETS[id];
    if (!b) throw new Error(`UNKNOWN_BUCKET: ${id}`);
    for (const c of b.collections) collections.add(c);
    for (const s of b.customerSubcollections) subcollections.add(s);
  }
  return { collections: [...collections], subcollections: [...subcollections] };
}

/** Returns true if `name` is a T1 collection (master/setup). */
export function isT1Collection(name) {
  // Reads TIER_MAP[BACKUP_TIER_T1] from branchBackupCore — single source of truth
}

/** Throws T1_NOT_WIPEABLE if any element of `collections` is in T1. */
export function assertNotT1(collections) {
  for (const c of collections) {
    if (isT1Collection(c)) throw new Error(`T1_NOT_WIPEABLE: ${c}`);
  }
}

/** Returns {appointments:true, ..., customerActivity:false} for UI default state. */
export function bucketDefaultsForUI() {
  const out = {};
  for (const [id, b] of Object.entries(BUCKETS)) {
    out[id] = !!b.defaultChecked;
  }
  return out;
}
```

### 3.2 `src/lib/branchBackupSchema.js` (EDIT) — file format v2

```js
export const BACKUP_SCHEMA_VERSION = 2;  // bumped from 1

// New meta fields in v2:
//   bodyHash: SHA-256 hex of canonicalized doc list
//   bucketIds: string[] (for traceability + cross-check at make-fresh)
//
// Backward compat: v1 files loadable for read but hash check skipped (no bodyHash).
// v2 files REQUIRE bodyHash (validate rejects if missing).

export function computeBodyHash(collections) {
  // Canonicalization:
  // 1. Iterate collections in alphabetical order
  // 2. Per collection, sort docs by docId
  // 3. Stringify each doc with stable key order (recursive)
  // 4. Concatenate `${collection}|${docId}|${stableJson}\n` lines
  // 5. SHA-256 hex of the concatenated string
  //
  // Firestore Timestamp serialized as `{__type__:'timestamp', seconds, nanoseconds}` (V40 schema preserved)
  // NaN/Infinity serialized as `{__type__:'nonfinite', value:'NaN'|'Infinity'|'-Infinity'}` (V40 preserved)
  // undefined never appears (V14 lock — Firestore rejects)
  //
  // Returns: hex string (64 chars)
}

export function validateBackupFile(file) {
  // v1 path: validate as before
  // v2 path: validate + require bodyHash present + 64-char hex format
  // Schema mismatch → throw SCHEMA_VERSION_UNSUPPORTED
}
```

### 3.3 `api/admin/branch-backup-export.js` (EDIT)

Request body additions:
```js
{
  branchId: string,           // required
  bucketIds?: string[],       // NEW — list of bucket IDs from BUCKETS
  tiers?: string[],           // legacy V40 (kept for backwards compat)
  collections?: string[],     // legacy V40 (kept for backwards compat)
  dryRun?: boolean,           // NEW — count-only mode
  isAutoPreFresh?: boolean,   // V40 (preserved)
}
```

Processing flow:
```
1. verifyAdminToken → caller.uid
2. If bucketIds provided → resolveBucketScope → assertNotT1
3. If tiers/collections provided → legacy path (V40 preserved)
4. If dryRun=true:
   - For each collection: snap.size (single read), per bucket
   - Return {ok:true, perBucket:{bucketId:{docs,subDocs,sizeBytes}}, totalDocs, estSizeBytes}
   - NO Storage write, NO audit doc
5. If dryRun=false:
   - Build doc list (existing V40 logic)
   - Compute bodyHash via computeBodyHash()
   - Build file v2 (schemaVersion:2, meta:{bodyHash, bucketIds, ...}, collections:{...})
   - Upload to Storage
   - Write audit doc with bodyHash field
   - Return {ok:true, storagePath, bodyHash, fileSize, ...}
```

### 3.4 `api/admin/branch-make-fresh.js` (EDIT)

Request body additions:
```js
{
  branchId: string,
  bucketIds: string[],         // NEW — REQUIRED (no more all-wipe default)
  autoBackupRef: string,       // V40 preserved
  expectedBodyHash?: string,   // NEW optional — UI sends to enable mismatch detection
}
```

Processing flow:
```
1. verifyAdminToken
2. Validate bucketIds: array, ≥1 element, all in BUCKETS, no T1 leak via assertNotT1
3. AV19: bucket.file(autoBackupRef).exists() → 400 AUTO_BACKUP_NOT_FOUND if missing
4. Download autoBackup file
5. Parse + validateBackupFile → 400 if schema invalid
6. assert file.meta.bucketIds === request.bucketIds (sorted) → 400 SCOPE_MISMATCH if differ
7. recompute bodyHash → compare with file.meta.bodyHash → 500 BACKUP_INTEGRITY_FAIL if differ
8. (Optional) compare with request.expectedBodyHash → 400 if differ
9. resolveBucketScope(bucketIds) → {collections, subcollections}
10. assertNotT1(collections) (defense-in-depth)
11. Wipe collections (where branchId == target) — BATCH_LIMIT=400
12. Wipe customer subcollections (per-customer, where branchId == target) — parallel-batched 50/8
13. Write audit doc {action, branchId, bucketIds, bodyHash, deletedCounts, autoBackupRef, executedBy, executedAt}
14. Return {ok:true, deletedCounts, autoBackupRef, bodyHash, auditId}
```

### 3.5 `src/components/backend/MakeFreshModal.jsx` (REWRITE)

State machine: `idle` → `previewing` → `confirming` → `backing-up` → `wiping` → `done` | `error`

```
idle:
  Header: "ทำให้เป็นสาขาใหม่" + branch name
  Body:
    - 7 bucket rows (default: 6 checked + Bucket 7 unchecked per Q4-B)
    - Each row: checkbox + icon + label + description (small text)
    - Tooltip: collection list per bucket
    - "ขั้นสูง (Developer)" toggle → reveals per-bucket collection-level checkboxes
  Footer:
    [ ยกเลิก ]   [ ดูผลกระทบ ]  // disabled until ≥1 bucket ticked

previewing:
  Body: loader "กำลังคำนวณ..."
  On success → return to UI with impact panel:
    📊 ผลกระทบ (สาขา: นครราชสีมา)
    ✓ นัดหมาย — 145 docs (+ 12 subcoll docs)
    ✓ การขาย — 89 docs (+ 89 subcoll docs)
    ✓ สต็อก — 234 docs
    ✗ การเงิน — skipped (not ticked)
    ──────────────
    📦 ลบทั้งหมด: 480 docs
    💾 Backup ขนาดประมาณ: 1.2 MB
  Footer: [ ← ปรับ ]   [ ดำเนินการต่อ ]

confirming:
  Body: typed-branch-name gate (V40 pattern)
    "พิมพ์ '<branchName>' เพื่อยืนยัน"
    + reminder: "ระบบจะ backup ก่อนลบ + ตรวจสอบ SHA-256 hash ก่อนลบ"
  Footer: [ ยกเลิก ]   [ ยืนยัน — สำรองและลบ ]  // disabled until name matches

backing-up:
  Loader: "1/3 กำลังสำรอง..."

wiping:
  ✓ 1/3 สำรองสำเร็จ (storagePath, bodyHash, fileSize)
  ✓ 2/3 ตรวจสอบ hash สำเร็จ
  Loader: "3/3 กำลังลบ..."

done:
  ✓ เสร็จสิ้น
  - Backup: {storagePath}
  - Hash: {bodyHash}
  - ลบ: {deletedCounts}
  - Audit: {auditId} (clickable link to be_admin_audit doc)
  [ ปิด ]

error:
  ✗ ข้อผิดพลาด: {error code + message}
  - If backup succeeded but wipe failed → show storagePath for manual restore via BranchBackupTab
  [ ปิด ]
```

Advanced mode reveals per-collection checkboxes inside each bucket (collapsed by default). Tick all in bucket via bucket-checkbox; untick individual via collection-checkbox. T1 collections NEVER shown.

### 3.6 `BranchesTab.jsx` (minor EDIT)

Button label unchanged ("ทำให้เป็นสาขาใหม่"). Inner modal swap.

---

## §4 — Data Flow

```
[User clicks button]
  ↓
[MakeFreshModal opens, idle]
  ↓
[Ticks/unticks 7 buckets, optional Advanced mode]
  ↓
[Click ดูผลกระทบ] → POST /branch-backup-export {bucketIds, dryRun:true}
  ↓ Server: resolveBucketScope → assertNotT1 → count per collection
  ← 200 {perBucket: {...}, totalDocs, estSizeBytes}
[Display impact panel]
  ↓
[Click ดำเนินการต่อ]
  ↓
[Type branchName + click ยืนยัน]
  ↓
[Phase 1: POST /branch-backup-export {bucketIds, isAutoPreFresh:true}]
  ↓ Server: build file v2 → computeBodyHash → upload Storage → audit doc
  ← 200 {storagePath, bodyHash, fileSize}
  ↓
[Phase 2: POST /branch-make-fresh {bucketIds, autoBackupRef, expectedBodyHash}]
  ↓ Server: bucket.file().exists() → download → parse → validate → recompute hash
  ↓ Compare with file.meta.bodyHash + expectedBodyHash → match? → continue : 500
  ↓ resolveBucketScope → assertNotT1 → wipe collections + subcollections
  ↓ Audit doc {bucketIds, bodyHash, deletedCounts}
  ← 200 {deletedCounts, bodyHash, auditId}
[Display done panel]
```

---

## §5 — Safety + Error Handling

| Failure mode | Catch site | Response | UX |
|---|---|---|---|
| Unauth/non-admin | `verifyAdminToken` | 401/403 | Modal error |
| `bucketIds` empty | Validator | 400 `EMPTY_BUCKET_SET` | Disabled Confirm button (UX prevents) |
| T1 collection in bucketIds | `assertNotT1` (lib + endpoint × 2) | 400 `T1_NOT_WIPEABLE` | Defense-in-depth — should never reach |
| Unknown bucket ID | `resolveBucketScope` | 400 `UNKNOWN_BUCKET` | Defense-in-depth |
| Backup file missing in Storage | `bucket.file().exists()` | 400 `AUTO_BACKUP_NOT_FOUND` | Modal error |
| **Hash mismatch (corruption)** | `branch-make-fresh.js` recompute | 500 `BACKUP_INTEGRITY_FAIL` | **Modal error, wipe ABORTED, backup preserved** |
| `file.bucketIds !== request.bucketIds` | Validator | 400 `SCOPE_MISMATCH` | Modal error, retry from Preview step |
| Schema validation fail (v1 file passed) | `validateBackupFile` | 400 `SCHEMA_VERSION_UNSUPPORTED` | Modal error |
| Wipe failure mid-batch | try/catch wipe loop | 500 `WIPE_PARTIAL` + audit doc records partial counts | Modal shows storagePath for manual restore |
| Network/Storage unavailable | try/catch | 500 + retry-safe | Modal error |

**Idempotency**:
- Backup phase is idempotent (re-running creates new file; previous file orphaned but accessible via audit log).
- Wipe phase is idempotent at the doc level (delete is idempotent; re-running on same branch+bucketIds with same backup = no-op since docs already gone). Hash check ensures we don't wipe based on a wrong backup.

**Recovery from `WIPE_PARTIAL`**:
- Admin sees storagePath in error panel.
- Open BranchBackupTab → use "Restore" with this storagePath → overwrite mode → branchId match → V40 restore writes back everything in the file.
- Data fully recovered.

---

## §6 — Test Strategy (Rule Q L1 + L2 + Rule I)

### 6.1 Unit tests (Rule Q L2 — helpers)

`tests/branch-make-fresh-selective-helpers.test.js`:
- BUCKETS schema invariants: frozen, ≥1 collection or subcoll per bucket, no T1 overlap, defaultChecked semantics (6 true, 1 false)
- resolveBucketScope: 1 bucket / multi-bucket / unknown bucket / empty → throws
- assertNotT1: passes for T2/T3 collections; throws for T1 collections; defense-in-depth verified
- bucketDefaultsForUI returns exactly the expected 7-key object

`tests/branch-backup-hash-canonicalization.test.js`:
- computeBodyHash deterministic across calls with same input
- Key-order-permuted docs produce IDENTICAL hash (stable stringify)
- Doc-order-permuted lists produce IDENTICAL hash (sort by docId)
- Firestore Timestamp serialization round-trip (preserved across hash)
- NaN/Infinity sentinel round-trip
- Empty collection produces stable hash
- 1000-doc fixture produces deterministic hash
- Different content → different hash (1 char change → hash differs)
- Adversarial: Thai/NUL/Unicode NFC vs NFD/deeply-nested (5+ levels)

### 6.2 Flow simulate (Rule I)

`tests/branch-make-fresh-selective-flow-simulate.test.js`:
- BranchProvider injection + MakeFreshModal mount
- 7 bucket combos (each bucket alone) + 3 multi-bucket combos
- Modal flow: idle → click ดูผลกระทบ → fetch mock returns counts → previewing → click ดำเนินการต่อ → confirming → type branchName → click ยืนยัน → backing-up → wiping → done
- Error paths: hash mismatch (mock returns wrong hash) → error panel shows storagePath
- Default state: 6 buckets checked + Bucket 7 unchecked verified on mount

### 6.3 Source-grep audit (V21 lock + AV20-class)

`tests/branch-make-fresh-selective-source-grep.test.js`:
- UI imports `BUCKETS` from branchBackupBuckets.js (not hand-coding collection lists)
- MakeFreshModal sends `bucketIds` (not raw `collections` / `tiers`) in API request bodies
- Both endpoints (`branch-backup-export` + `branch-make-fresh`) call `assertNotT1`
- Both endpoints validate `bucketIds` array
- `make-fresh` recomputes hash + compares before wipe (regex: `BACKUP_INTEGRITY_FAIL`)
- `backup-export` includes `bodyHash` in audit doc + return shape

### 6.4 ★ **Real-prod admin-SDK round-trip e2e** (Rule Q L2 — THE CRITICAL ARTIFACT)

`scripts/e2e-backup-restore-roundtrip-real-prod.mjs`:

```
Usage:
  vercel env pull .env.local.prod --environment=production
  node scripts/e2e-backup-restore-roundtrip-real-prod.mjs           # dry-run
  node scripts/e2e-backup-restore-roundtrip-real-prod.mjs --apply    # commit writes
```

8-phase round-trip on **TEST-prefixed branch** + **TEST-prefixed fixtures**:

```
Phase 1: Seed TEST fixtures
  - Create TEST-BR-{ts} branch
  - For each bucket, seed N docs with realistic shapes:
    * Thai text fields (ชื่อ, นามสกุล)
    * Unicode NFC vs NFD variants
    * NUL bytes (intentional adversarial)
    * Firestore Timestamps (serverTimestamp at write)
    * Cross-doc references (sale.customerId → be_customers/TEST-CUST-{ts})
    * Large arrays (treatment.items[] with 100 entries)
    * Deeply-nested objects (5+ levels)
  - Verify seed count matches expected per bucket

Phase 2: Snapshot pre-state
  - For each collection in each bucket, list all docs where branchId == TEST-BR-{ts}
  - For each subcollection, list per-customer where branchId == TEST-BR-{ts}
  - Compute canonical hash of pre-state (using same computeBodyHash helper)
  - Save snapshot to memory + dump to /tmp/e2e-pre-state-{ts}.json

Phase 3: Selective backup (each bucket independently + 3 multi-bucket combos)
  - For each test scenario:
    * Call /api/admin/branch-backup-export {branchId, bucketIds, isAutoPreFresh:true}
    * Assert response.ok + response.bodyHash matches local-computed hash of scoped subset
    * Download Storage file + verify exists + parse → valid v2 schema
    * Verify file.meta.bucketIds == scenario.bucketIds
    * Verify file.meta.bodyHash byte-equal local-computed hash

Phase 4: Selective wipe
  - For each scenario:
    * Call /api/admin/branch-make-fresh {branchId, bucketIds, autoBackupRef, expectedBodyHash}
    * Assert response.ok + deletedCounts match expected per bucket
    * Verify audit doc written with correct fields

Phase 5: Assert wiped scope empty + untouched buckets intact
  - For wiped buckets: list collections → assert 0 docs where branchId == TEST-BR
  - For untouched buckets: list collections → assert original count preserved
  - For T1 collections (master): assert UNTOUCHED (count == pre-state count) — proves T1 protection

Phase 6: Restore from backup
  - Call /api/admin/branch-restore {mode:'overwrite', sourceStoragePath, targetBranchId}
  - Assert response.ok + perCollection counts match scoped backup

Phase 7: Assert post-restore == pre-state (BYTE-EQUAL ROUND-TRIP)
  - Re-list all collections + subcollections where branchId == TEST-BR
  - Deep-equal per doc against pre-state snapshot
    * V40 overwrite mode preserves docId + stamps branchId targetBranch (which equals source for our case)
    * Therefore docId + branchId MUST be byte-equal
    * Timestamp fields → compare via {seconds, nanoseconds} sentinel (not real Date)
    * Server-side updatedAt fields → may be touched by writes; spec assumes restore preserves the snapshot value verbatim (V40 uses {merge:false} + raw doc data)
  - Compute canonical hash of post-restore state → assert equals pre-state hash
  - If mismatch: dump diff log to /tmp/e2e-mismatch-{ts}.json + exit 1

Phase 8: Cleanup
  - Delete TEST fixtures (all docs where branchId == TEST-BR + TEST-prefixed customer subcoll)
  - Delete TEST-BR branch
  - Delete Storage backup files
  - Verify zero orphans
  - Write completion audit doc
```

**Pass criteria**: ALL 8 phases × ALL scenarios pass + zero orphans + hash matches at every phase boundary.

**Adversarial fixtures**: deliberately include edge cases that previously broke V40 (Thai/NUL/Unicode NFC vs NFD/Timestamps/references/large arrays/empty buckets/non-finite numbers).

### 6.5 Playwright real-browser drive (Rule Q L1)

`tests/e2e/branch-make-fresh-selective.spec.js`:

```
Spec 1: Happy path (1 bucket)
  - Sign in as admin (REST signInWithPassword → inject token)
  - Navigate to /backend → BranchesTab
  - Click "ทำให้เป็นสาขาใหม่" on TEST-BR row
  - Modal opens (idle)
  - Verify default state: 6 buckets checked + Bucket 7 unchecked
  - Untick 5 buckets, leave only "นัดหมาย"
  - Click "ดูผลกระทบ"
  - Assert preview shows correct counts for appointments only
  - Click "ดำเนินการต่อ"
  - Type branchName in confirm field
  - Click "ยืนยัน — สำรองและลบ"
  - Wait for done panel
  - Verify storagePath link valid (clickable)
  - Verify audit doc link clickable
  - Click "ปิด"

Spec 2: T1 protection
  - Try to manipulate Advanced mode to send T1 collection (via DevTools)
  - Click Confirm → assert 400 T1_NOT_WIPEABLE in console + error UI
  - Verify T1 collections still intact via post-test list

Spec 3: Hash mismatch (corruption simulation)
  - Run Phase 1 (backup) normally
  - DevTools-intercept the make-fresh request → modify expectedBodyHash
  - Assert 500 BACKUP_INTEGRITY_FAIL in response + error UI
  - Verify NO wipe happened (counts unchanged)

Spec 4: Adversarial — rapid double-click Confirm
  - Trigger 2 clicks on Confirm within 100ms
  - Verify only 1 wipe operation actually fires (idempotency)

Spec 5: Adversarial — branch switch mid-modal
  - Open modal for BR-A
  - Switch top-right selector to BR-B
  - Click Confirm in modal (still showing BR-A)
  - Assert wipe targets BR-A (not BR-B) — modal carries branchId from open-time
```

---

## §7 — Migration / Backward Compatibility

- **Backup file format**: v1 files (existing) remain READABLE by restore endpoint. v2 files (new) carry bodyHash + bucketIds. New backups always v2.
- **`branch-backup-export` legacy callers**: still accept `tiers[]` + `collections[]` (V40 contract preserved). New callers send `bucketIds[]`.
- **`branch-make-fresh` legacy callers**: NONE (this endpoint had ZERO selective scope — request shape change to require bucketIds[] is acceptable since V40 only had 1 caller, MakeFreshModal). Old callers (if any external curl) get 400 EMPTY_BUCKET_SET → admin retries with explicit bucketIds.
- **CLI mirrors** (`scripts/branch-make-fresh.mjs`): extend to accept `--bucket-ids appointments,stock,sales` arg.

---

## §8 — Out of scope (deferred)

- **Pre-wipe dry-run restore** (Q5 option C): server parses backup file + simulates restore against in-memory mock before destroying real data. Deferred — Storage SLA + hash verification cover most failure modes.
- **Selective restore UI in BranchBackupTab**: V40 BranchBackupTab supports advanced collection-level selection already; combined with v2 schema metadata, admin can restore subsets manually. New "Restore selected buckets" UI not in scope here.
- **Multi-branch batch make-fresh**: nope. One branch at a time.
- **Schedule auto-fresh** (e.g., wipe every quarter): not in scope.

---

## §9 — Open Questions / Risks

1. **Hash performance on large branches**: 1000+ doc canonicalization + SHA-256 ~50-200ms. Acceptable. >10k docs may need streaming hash; not currently a concern.
2. **Concurrent writes during backup**: Firestore eventual consistency means a doc written during backup might be missing from the file (read snapshot is timestamp-based per Firestore). Mitigation: admin should not actively write during make-fresh. Future: add a "freeze branch" toggle that blocks writes via firestore.rules during the operation.
3. **T4 customer subcollection scaling**: V40 already documented — wipe scans ALL customers, not just branch-active. 5k+ customers approaching 60s Vercel timeout. UI warns; future may add be_customer_branch_index reverse lookup.
4. **Audit doc append-only invariant**: be_admin_audit `update` blocked by rules; restored docs would attempt update → fail. Mitigation: audit collection EXCLUDED from any bucket (it's universal per branchBackupCore.UNIVERSAL set). Already handled.

---

## §10 — Acceptance Criteria

Feature is "done" when ALL of:

1. ✅ All 7 buckets selectable via UI checkboxes + Advanced collection-level toggle works
2. ✅ Default state: 6 checked + Bucket 7 unchecked on modal open
3. ✅ 3-step UX: idle → previewing → confirming → backing-up → wiping → done, with real-numbers preview
4. ✅ Selective backup file contains ONLY buckets selected (verified via file.meta.bucketIds + collection keys)
5. ✅ Hash field present + correctly computed + verified before wipe
6. ✅ Hash mismatch aborts wipe with `BACKUP_INTEGRITY_FAIL` (verified via Playwright Spec 3)
7. ✅ T1 collections NEVER touched, even via Advanced or hand-crafted curl (verified via Playwright Spec 2)
8. ✅ Restore endpoint reads selective backup correctly (no code change needed — V40 already supports)
9. ✅ All test files green (unit + flow-simulate + source-grep + round-trip e2e + Playwright)
10. ✅ **Round-trip e2e script passes ALL 8 phases × ALL scenarios with zero orphans + hash byte-equal at every boundary** (THE critical gate per user directive)
11. ✅ Full vitest suite green
12. ✅ Build clean
13. ✅ Audit doc records bucketIds + bodyHash + deletedCounts for every operation
14. ✅ Backwards compat: V40 callers (legacy tiers/collections) still work

---

## §11 — Implementation Plan

To be written by `writing-plans` skill in `docs/superpowers/plans/2026-05-14-selective-make-fresh-and-backup-integrity.md`. Will decompose into task-by-task subagent-driven implementation.

---

## §12 — Verify Locally

```bash
# Run unit + flow-simulate + source-grep
npx vitest run tests/branch-make-fresh-selective-helpers.test.js \
              tests/branch-backup-hash-canonicalization.test.js \
              tests/branch-make-fresh-selective-flow-simulate.test.js \
              tests/branch-make-fresh-selective-source-grep.test.js

# Build clean
npm run build

# Pull prod env (Rule R standing authorization)
vercel env pull .env.local.prod --environment=production

# Round-trip e2e dry-run
node scripts/e2e-backup-restore-roundtrip-real-prod.mjs

# Round-trip e2e --apply (real writes against TEST-prefixed fixtures)
node scripts/e2e-backup-restore-roundtrip-real-prod.mjs --apply

# Playwright real-browser
npx playwright test tests/e2e/branch-make-fresh-selective.spec.js

# Full suite (pre-deploy)
npm test -- --run
```

---

## §13 — Rule Q Verification Sign-off Template

Before claiming the feature "verified", I must check:

- [ ] Did I run the round-trip e2e script with `--apply` on real prod TEST fixtures? (L2 satisfied)
- [ ] Did I run Playwright real-browser spec on the deployed UI? (L1 satisfied)
- [ ] Did the round-trip e2e pass ALL 8 phases × ALL scenarios with zero diff?
- [ ] Did Playwright Spec 3 (hash mismatch) actually fire `BACKUP_INTEGRITY_FAIL` + abort wipe?
- [ ] Did I actively try adversarial inputs (Thai/NUL/Unicode/large/empty/concurrent)?
- [ ] Can I produce log + screenshots proving the round-trip integrity?

Any "no" or "I'm not sure" → DO NOT CLAIM verified. Re-test at higher level.

---

**End of design spec.**
