# V81 — Whole-System Backup & Clone Design

> **Status**: Approved via /brainstorming Q1-Q5 (2026-05-16 NIGHT+4). Ready for /writing-plans.
> **Author**: Claude (collaborator) + user @teddyoomz
> **Estimate**: 3-4 days implementation; ~20-25 tasks for /writing-plans
> **Iron-clad refs**: Rule H (data ownership), Rule M (data ops local + admin SDK + pull env), Rule B (Probe-Deploy-Probe), Rule Q V66 (Real-Adversarial Verification), Rule P (class-of-bug expansion)
> **Class**: extension of V40 (per-branch backup), V74 (per-customer backup), V75 Item 2 + V77b/c (whole-fleet customer backup). V81 = tier สูงสุด — whole-system across ทุก branch + universal collections + Auth users + Firebase Storage objects.

---

## 1. Summary

Production LoverClinic deploy บน Vercel ปัจจุบัน + Firebase project `loverclinic-opd-4c39b` ต้องมีระบบ backup/restore ที่:

1. **Auto-daily backup** ทุกวัน 03:00 Bangkok — snapshot ทุก Firestore collection (universal + branch-scoped + customer-attached subcollections + audit) + Firebase Storage objects (รูป, attachments, signatures) + Firebase Auth users metadata (UID + email + customClaims + providerData; **no passwords** — Firebase 1-way hash)
2. **5-day rolling retention** สำหรับ auto backups — cleanup piggyback บน backup cron (single source of truth)
3. **Manual "Backup Now" button** ใน admin BackupManagerTab — name pattern `manual-YYYYMMDD-HHmm/` ที่ไม่ผูก retention (admin ลบเองได้)
4. **Restore in 2 modes** (hybrid radio at restore time):
   - **Fresh-only (DEFAULT)** — refuse if target Firebase ไม่ว่าง. ใช้ตอน clone ไป Vercel/Firebase ใหม่ (เปิด Firebase project เปล่าๆ + restore = ฝาแฝด)
   - **Replace current data** — wipe + write (DESTRUCTIVE). **AV19 elevation**: auto-pre-backup ลง `pre-restore-{ts}/` แบบ MANDATORY ก่อน wipe (safety net). 7-day retention สำหรับ pre-restore-* (เผื่อ admin ลังเล undo)
5. **Portable "1-file" download** — admin click Download → server stream tar.gz ของ folder → signed-URL 24h. Customer ใหม่ download ไป + drag-drop เข้า Firebase Storage ของ project ใหม่ + กด restore (Fresh-only) → 100% identical twin

Use cases:
- **In-place disaster recovery** (primary) — ระบบเสีย / data corrupt / admin click ผิด → กลับไป snapshot เมื่อ N วันก่อน
- **Cross-Vercel clone** (secondary) — เอา repo + 1 backup file ไปขายต่อให้คลินิกอื่นเปิด instance ใหม่ (manual Firebase setup ~5-10 นาที + restore)

---

## 2. Background

Existing backup scope ใน codebase:

| V-entry | Scope | Endpoint / CLI |
|---|---|---|
| **V40** (2026-05-07) | Per-branch — T1 master/setup + T2 transactions + T3 stock + T4 customer subcollections, scoped to 1 branchId | `/api/admin/branch-backup-export`, `/api/admin/branch-restore` (Fresh / Clone-mode + FK remap), `/api/admin/branch-make-fresh` (AV19 auto-pre-backup-mandatory) |
| **V74** (2026-05-16) | Per-customer — single customer + all 8 subcollections (T4) + storage manifestHash | `/api/admin/customer-backup-export`, `/api/admin/customer-restore` (Q3=B SAFE conflict — BLOCK on customerId-exists + HN-collision; STRIP lineUserId_byBranch conflicts) |
| **V75 Item 2 + V77b/c** (2026-05-16) | Whole-fleet customers — ทุก customer + manifest.json + AV56 manifestHash | `/api/admin/whole-fleet-customer-backup-export`, `/api/admin/whole-fleet-customer-restore`, `WholeFleetBackupModal` |
| **V77b/c** (2026-05-16) | UI for whole-fleet — manifestHash display + perCustomer failure isolation | `BackupManagerTab.jsx` (existing home) |

**Gap V81 closes**: ไม่มี backup ของ universal collections (`be_staff`, `be_doctors`, `be_branches`, `be_admin_audit`, `chat_history`, `clinic_settings`, `be_line_configs`, `be_fb_configs`, `be_line_reminder_*`, `be_recalls`, etc.) + Firebase Auth users metadata + Firebase Storage objects scope-wide. V40 covers per-branch slice; V75 covers customer slice; V81 covers EVERYTHING.

**Patterns inherited from V40/V74/V75**:
- Manifest+blobs format (Storage objects = per-blob; collections = per-JSON file)
- manifestHash AV56 sealing (SHA-256 of fileHashes + storageManifestHash + universal hashes)
- AV19 auto-pre-backup-mandatory before destructive op
- Per-customer/per-blob failure isolation (try/catch INSIDE loop + accumulate `failed[]`)
- writeBatch chunked at 450 (Firestore limit)
- Rule M two-phase dry-run + --apply for CLI mirrors
- vercel.json maxDuration: 300 for long-running endpoints (Vercel Pro)
- Storage rules: existing `match /backups/{prefix}/{file=**}` admin-only — V40/Probe #7

---

## 3. Goals + Non-goals

**Goals**:
- G1: Auto-daily backup ของทั้งระบบ (Firestore + Storage + Auth) snapshot at 03:00 Bangkok
- G2: 5-day rolling auto retention; 7-day pre-restore retention; ∞ manual retention
- G3: Manual "Backup Now" button + admin chooseable trigger
- G4: Restore in Fresh-only OR Replace mode (hybrid radio at restore time)
- G5: Replace mode MUST auto-pre-backup FIRST (AV19 elevation), verify exists, type-confirm
- G6: Portable "1-file download" via on-demand server-side tar.gz + signed URL
- G7: manifestHash integrity sealing (AV62 mirror AV56)
- G8: CLI mirrors for Rule M ops + dev/emergency use
- G9: Cron concurrency lock (refuse if backup already running)
- G10: Restored-Auth users get password-reset email (admin opt-in checkbox) since Firebase doesn't export passwords

**Non-goals** (out of V81 scope):
- N1: Auto-create new Firebase project via Firebase Management API (D2/D3 spectrum) — Phase 2 if needed
- N2: Auto-set Vercel env vars via Vercel API OAuth — Phase 2
- N3: Multi-tenant single-Firebase architecture (rejected — contradicts true clone)
- N4: Bundle Vercel env vars / secrets in backup file (security risk; user re-sets manually)
- N5: Backup Firestore rules / indexes / Storage rules / Cloud Functions code (already in git — `firebase deploy` re-applies)
- N6: Incremental / diff backups — daily full snapshot only (simpler, more reliable)
- N7: Backup-of-backup recursion (explicitly excluded via Storage scope filter — see §6)
- N8: FCM tokens / web-push subscriptions (device-specific; cannot be cloned meaningfully)
- N9: Storage object dedup via content-hash (premature optimization; deferred to future iteration if Storage cost grows)

---

## 4. Architecture

### 4.1 Component Layer Diagram

```
┌─ UI Layer ───────────────────────────────────────────────────────┐
│  BackupManagerTab.jsx (extended)                                 │
│  └─ 🌐 Whole-System Backups section (NEW)                       │
│      ├─ "📥 Backup Now (whole-system)" button                   │
│      ├─ List of backups (auto-* / manual-* / pre-restore-*)     │
│      │   ├─ Per-row actions: Download / Restore / Delete         │
│      │   └─ Status indicators: size, createdAt, hashOk, type     │
│      ├─ WholeSystemBackupModal (NEW — manual create wizard)     │
│      └─ WholeSystemRestoreModal (NEW — restore wizard)          │
│          ├─ Backup picker dropdown                              │
│          ├─ Mode radio: Fresh-only (default) | Replace          │
│          ├─ Replace warning + auto-pre-backup status            │
│          ├─ Type-confirm input (must type backup name verbatim) │
│          └─ "Email password-reset to all restored users" toggle │
└──────────────────────────────────────────────────────────────────┘
                          │ admin idToken (verifyAdminToken)
                          ▼
┌─ API Layer ──────────────────────────────────────────────────────┐
│  /api/admin/whole-system-backup-export   (POST manual trigger)   │
│  /api/admin/whole-system-restore         (POST select + mode)    │
│  /api/admin/whole-system-backup-download (POST → signed URL)     │
│  /api/admin/whole-system-backups-list    (GET — list metadata)   │
│  /api/admin/whole-system-backup-delete   (DELETE — single OR bulk)│
│  /api/cron/whole-system-backup-daily     (CRON_SECRET-gated)     │
└──────────────────────────────────────────────────────────────────┘
                          │ firebase-admin SDK
                          ▼
┌─ Pure Core Module ───────────────────────────────────────────────┐
│  src/lib/wholeSystemBackupCore.js                                │
│  ├─ Constants:                                                   │
│  │   ├─ WHOLE_SYSTEM_SCHEMA_VERSION = 2                          │
│  │   ├─ UNIVERSAL_COLLECTIONS = [...] (fixed list)              │
│  │   ├─ BRANCH_SCOPED_COLLECTIONS = [...] (fixed list)          │
│  │   ├─ CUSTOMER_SUBCOLLECTIONS = T4 from V74                   │
│  │   ├─ STORAGE_INCLUDE_PREFIXES = ['customers/', 'staff-chat-attachments/', ...] │
│  │   ├─ STORAGE_EXCLUDE_PREFIXES = ['backups/', 'probe/']       │
│  │   ├─ RETENTION_DAYS = { auto: 5, preRestore: 7, archive: 1 } │
│  │   └─ NAME_PATTERN = /^(auto|manual|pre-restore)-\d{8}-\d{4}$/│
│  ├─ Helpers:                                                     │
│  │   ├─ buildWholeSystemManifest({collections, storage, auth})  │
│  │   ├─ computeWholeSystemManifestHash(manifest) → SHA-256      │
│  │   ├─ validateWholeSystemManifest(manifest)                    │
│  │   ├─ resolveCollectionScope() → {universal[], branchScoped[]}│
│  │   ├─ resolveStorageScope(prefixList) → include? boolean      │
│  │   ├─ sanitizeAuthUser(authUserRecord) — strip passwordHash/  │
│  │   │   refreshTokens; keep uid/email/displayName/             │
│  │   │   emailVerified/disabled/customClaims/providerData       │
│  │   ├─ shouldCleanupBackup(name, ageMs) → {keep|delete, reason}│
│  │   ├─ parseBackupName(name) → {type, ts, valid}               │
│  │   └─ formatBackupName(type, date) → 'auto-YYYYMMDD-HHmm'     │
│  └─ Exports tested via tests/v81-whole-system-backup-core.test.js │
└──────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─ CLI Mirrors (Rule M canonical) ─────────────────────────────────┐
│  scripts/whole-system-backup-export.mjs                          │
│      └─ Args: --apply | --name=<custom> | --type=manual          │
│  scripts/whole-system-restore.mjs                                │
│      └─ Args: --backup-ref=<name> --mode=fresh|replace --apply   │
│        --password-reset-emails | --local-manifest=<path>         │
│      └─ Local-manifest mode: read manifest from local disk       │
│        (cross-Vercel scenario — backup file copied to new        │
│        Firebase Storage manually, then run restore CLI locally)  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Storage layout per backup

```
backups/whole-system/{name}/                    ← name = auto-YYYYMMDD-HHmm | manual-... | pre-restore-...
├─ manifest.json                                ← AV62 hash-sealed
├─ collections/
│   ├─ universal/be_customers.json              ← All docs in collection (JSON array)
│   ├─ universal/be_staff.json
│   ├─ universal/be_doctors.json
│   ├─ universal/be_branches.json
│   ├─ universal/be_admin_audit.json
│   ├─ universal/chat_conversations.json
│   ├─ universal/chat_history.json
│   ├─ universal/be_line_configs.json
│   ├─ universal/be_fb_configs.json
│   ├─ universal/be_line_reminder_log.json
│   ├─ universal/be_line_reminder_postback_log.json
│   ├─ universal/be_recalls.json
│   ├─ universal/be_link_requests.json
│   ├─ universal/be_customer_link_tokens.json
│   ├─ universal/be_document_templates.json
│   ├─ universal/be_audiences.json
│   ├─ universal/be_permission_groups.json
│   ├─ universal/be_central_stock_orders.json
│   ├─ universal/be_central_stock_movements.json
│   ├─ universal/be_vendors.json
│   ├─ universal/system_config.json
│   ├─ universal/clinic_settings.json           ← /chat_config etc.
│   ├─ universal/opd_sessions.json
│   ├─ branch-scoped/be_treatments.json         ← all branches (branchId field discriminates)
│   ├─ branch-scoped/be_sales.json
│   ├─ branch-scoped/be_appointments.json
│   ├─ branch-scoped/be_quotations.json
│   ├─ branch-scoped/be_vendor_sales.json
│   ├─ branch-scoped/be_online_sales.json
│   ├─ branch-scoped/be_sale_insurance_claims.json
│   ├─ branch-scoped/be_stock_batches.json
│   ├─ branch-scoped/be_stock_orders.json
│   ├─ branch-scoped/be_stock_movements.json
│   ├─ branch-scoped/be_stock_transfers.json
│   ├─ branch-scoped/be_stock_withdrawals.json
│   ├─ branch-scoped/be_stock_adjustments.json
│   ├─ branch-scoped/be_products.json
│   ├─ branch-scoped/be_courses.json
│   ├─ branch-scoped/be_product_groups.json
│   ├─ branch-scoped/be_product_units.json
│   ├─ branch-scoped/be_medical_instruments.json
│   ├─ branch-scoped/be_holidays.json
│   ├─ branch-scoped/be_df_groups.json
│   ├─ branch-scoped/be_df_staff_rates.json
│   ├─ branch-scoped/be_bank_accounts.json
│   ├─ branch-scoped/be_expense_categories.json
│   ├─ branch-scoped/be_expenses.json
│   ├─ branch-scoped/be_staff_schedules.json
│   ├─ branch-scoped/be_exam_rooms.json
│   ├─ branch-scoped/be_promotions.json
│   ├─ branch-scoped/be_coupons.json
│   ├─ branch-scoped/be_vouchers.json
│   ├─ branch-scoped/be_staff_chat_messages.json
│   ├─ subcollections/be_customers__{cid}__wallets.json
│   ├─ subcollections/be_customers__{cid}__memberships.json
│   ├─ subcollections/be_customers__{cid}__points.json
│   ├─ subcollections/be_customers__{cid}__treatments.json
│   ├─ subcollections/be_customers__{cid}__sales.json
│   ├─ subcollections/be_customers__{cid}__appointments.json
│   ├─ subcollections/be_customers__{cid}__deposits.json
│   ├─ subcollections/be_customers__{cid}__courseChanges.json
│   └─ subcollections/chat_conversations__{convId}__messages.json
├─ storage/                                     ← Mirror gs:// paths verbatim
│   ├─ customers/{cid}/photo-*.jpg
│   ├─ staff-chat-attachments/{branchId}/{file}
│   └─ ... (skip backups/ + probe/)
├─ auth/
│   └─ users.json                               ← sanitized list (no passwordHash/refreshTokens)
└─ __archive.tar.gz                             ← created on-demand by download endpoint; 24h cleanup
```

### 4.3 manifest.json schema

```json
{
  "schemaVersion": 2,
  "backupType": "whole-system",
  "name": "auto-20260516-0300",
  "createdAt": "2026-05-16T20:00:00Z",
  "createdBy": "cron|admin-uid",
  "manifestHash": "sha256:abc123...",
  "scope": {
    "universalCollections": [...],
    "branchScopedCollections": [...],
    "subcollectionsBuilt": {
      "be_customers": { "customerCount": 1234, "subcollections": ["wallets","memberships",...] },
      "chat_conversations": { "convCount": 2 }
    }
  },
  "collections": [
    {
      "path": "collections/universal/be_customers.json",
      "name": "be_customers",
      "type": "universal",
      "docCount": 1234,
      "fileSizeBytes": 12345678,
      "fileHash": "sha256:..."
    },
    ...
  ],
  "storageObjects": [
    {
      "path": "storage/customers/{cid}/photo.jpg",
      "originalGsPath": "customers/{cid}/photo.jpg",
      "fileSizeBytes": 234567,
      "fileHash": "sha256:...",
      "contentType": "image/jpeg"
    },
    ...
  ],
  "storageObjectsTotalCount": 5678,
  "storageObjectsTotalBytes": 1234567890,
  "storageManifestHash": "sha256:...",
  "authUsers": {
    "path": "auth/users.json",
    "userCount": 42,
    "fileHash": "sha256:..."
  },
  "stats": {
    "totalDocCount": 25678,
    "totalCollectionFileBytes": 56789012,
    "totalStorageBytes": 1234567890,
    "totalAuthUsers": 42,
    "elapsedSec": 187
  },
  "_v81Marker": "whole-system-backup-v1"
}
```

`manifestHash` = SHA-256 of canonical JSON form of:
- All `collections[*].fileHash` (sorted by name)
- `storageManifestHash` (which is SHA-256 of all `storageObjects[*].fileHash` sorted by path)
- `authUsers.fileHash`
- `name`, `createdAt`, `totalDocCount`, `totalStorageBytes`, `totalAuthUsers`
- **Excluded** (mutable, for admin convenience): `createdBy`, optional notes/labels

---

## 5. Data flows

### 5.1 Daily cron flow (auto backup at 03:00 BKK)

```
1. Vercel cron POST /api/cron/whole-system-backup-daily (CRON_SECRET in header)
2. Authentication: verify CRON_SECRET matches env (AV63)
3. Acquire concurrency lock:
   - getDoc(be_admin_audit/whole-system-backup-running)
   - if exists AND age < 60min → refuse 409 LOCK_BUSY (Thai error)
   - setDoc(be_admin_audit/whole-system-backup-running, {startedAt, source:'cron'})
4. Cleanup retention (V75 + Q4-A pattern):
   - List backups/whole-system/* via bucket.getFiles({prefix: 'backups/whole-system/'})
   - Parse name → shouldCleanupBackup(name, ageMs):
     - auto-* > 5 days → delete folder
     - pre-restore-* > 7 days → delete folder
     - manual-* → preserve (admin's responsibility)
     - __archive.tar.gz > 24h → delete archive only (parent backup preserved)
   - Per-folder delete: list + batch delete (page 1000 / call)
5. Export current state:
   a) Build name = formatBackupName('auto', new Date())
   b) For each collection in resolveCollectionScope():
      - admin SDK fetch all docs (paginated 5000/call)
      - Serialize to JSON array
      - Compute SHA-256 fileHash
      - Upload to backups/whole-system/{name}/collections/<universal|branch-scoped>/<colName>.json
   c) For each customer doc:
      - For each T4 subcollection (wallets/memberships/.../courseChanges):
        - List subcoll docs, write to subcollections/be_customers__{cid}__{subcol}.json
   d) For each chat_conversation:
      - List messages subcoll, write to subcollections/chat_conversations__{convId}__messages.json
   e) auth.listUsers(1000) paginated → sanitizeAuthUser for each → write auth/users.json
   f) Enumerate Storage objects via bucket.getFiles() paginated:
      - resolveStorageScope(filePath) returns false → skip (recursive backups/, probe/)
      - For each include: bucket.file(srcPath).copy(bucket.file(`backups/whole-system/{name}/storage/${srcPath}`))
      - Compute SHA-256 per blob (stream — no full-in-memory)
      - Track failures in failedStorageObjects[] (don't abort batch)
   g) buildWholeSystemManifest({collections, storage, auth, stats})
   h) computeWholeSystemManifestHash(manifest) → manifest.manifestHash
   i) Upload manifest.json
6. Release lock: deleteDoc(be_admin_audit/whole-system-backup-running)
7. Emit audit doc be_admin_audit/whole-system-backup-{name}-{ts}-{rand}:
   {
     op: 'whole-system-backup',
     name, type: 'auto', source: 'cron',
     stats, manifestHash,
     failedStorageObjects, failedCollections,
     elapsedSec,
     completedAt: serverTimestamp()
   }
8. Return 200 OK { name, manifestHash, stats }
```

### 5.2 Manual backup flow (admin button)

Identical to cron flow except:
- Trigger: admin click "📥 Backup Now" → WholeSystemBackupModal → POST /api/admin/whole-system-backup-export
- Auth: verifyAdminToken (NOT cron-secret)
- name pattern: `manual-YYYYMMDD-HHmm` (NOT auto-)
- Retention: ∞ (manual = admin's responsibility)
- Lock check: same shared lock as cron
- Audit source: 'manual-admin-{uid}'

### 5.3 Restore flow

```
1. Admin opens BackupManagerTab → 🌐 section → picks backup row → click "Restore"
2. WholeSystemRestoreModal opens:
   - Backup details: name, createdAt, manifestHash, totalDocs, totalStorageBytes, totalAuthUsers
   - Radio: ◉ Fresh-only target (default) | ○ Replace current data
   - If Replace selected: warning banner + "Auto-pre-backup will be created before wipe" notice
   - Type-confirm input: admin must type backup name verbatim
   - Optional toggle: "Email password-reset to all restored users after restore"
3. Admin click "Restore" → POST /api/admin/whole-system-restore:
   { backupRef, mode, confirmName, sendPasswordResetEmails }
4. Pre-flight:
   a) Read manifest.json from Storage
   b) validateWholeSystemManifest(manifest) — schemaVersion + required fields
   c) computeWholeSystemManifestHash(manifest) → must match manifest.manifestHash
      - If mismatch: refuse 409 WHOLE_SYSTEM_MANIFEST_TAMPERED (Thai error)
   d) If Fresh-only mode: scan target Firebase for non-system docs
      - getCount on each universal+branch-scoped collection
      - If any > 0 (excluding be_admin_audit + backups in Storage): refuse 409 TARGET_NOT_EMPTY
   e) If Replace mode (AV19 elevation):
      - Trigger auto-pre-backup via internal call to backup-export (name='pre-restore-{ts}')
      - Wait for completion (synchronous — restore waits)
      - Verify pre-restore folder exists in Storage: bucket.file('backups/whole-system/pre-restore-{ts}/manifest.json').exists()
      - If !exists: refuse 500 AUTO_PRE_BACKUP_FAILED
   f) confirmName must match backupRef name (anti-fat-finger)
5. Wipe phase (Replace mode only):
   a) For each universal+branch-scoped collection:
      - Paginated batch delete (450/batch)
   b) For each customer doc → wipe all 8 subcollections (V74 T4 cascade pattern)
   c) For each chat_conversation → wipe messages subcoll
   d) Enumerate Auth users → auth.deleteUser(uid) for each (EXCEPT caller's uid — self-delete protection per V31)
   e) Enumerate Storage objects (skip backups/) → bucket.deleteFiles({prefix: ...})
6. Restore phase:
   a) Read each collections/*.json → bulk setDoc via writeBatch chunks of 450
   b) Read auth/users.json → auth.importUsers(chunk of 1000) — Firebase admin SDK importUsers API
   c) For each storage/* blob → bucket.file(`backups/whole-system/{name}/storage/${origPath}`).copy(bucket.file(origPath))
   d) Track failedDocs/failedAuthUsers/failedStorage in restored counts
7. If sendPasswordResetEmails: for each restored user with email →
   auth.generatePasswordResetLink(email) → POST to user via mail (async best-effort)
8. Emit audit doc be_admin_audit/whole-system-restore-{ts}-{rand}:
   {
     op: 'whole-system-restore', backupRef, mode, autoBackupRef: 'pre-restore-{ts}' || null,
     stats: { docsRestored, authUsersRestored, storageObjectsRestored },
     failed: { docs, authUsers, storage },
     passwordResetEmailsSent,
     completedAt
   }
9. Return 200 OK { stats, failed, autoBackupRef }
```

### 5.4 Download flow ("1-file" portable)

```
1. Admin click "Download" on backup row
2. POST /api/admin/whole-system-backup-download { backupRef }
3. Check existing __archive.tar.gz:
   - If exists AND age < 24h: generate signed URL → return immediately
4. If not exists or stale:
   a) Stream tar.gz creation via Node archiver lib:
      - List all files under backups/whole-system/{name}/
      - For each: bucket.file(filePath).createReadStream() → pipe to archiver
      - Archiver pipes to bucket.file(`backups/whole-system/{name}/__archive.tar.gz`).createWriteStream()
   b) Wait for stream complete → compute archive size
5. Generate signed URL with 24h expiry: bucket.file(archivePath).getSignedUrl({action:'read', expires: Date.now() + 24*60*60*1000})
6. Return { downloadUrl, archiveSize, expiresAt }
7. Browser fetches signed URL → tar.gz downloaded to local disk

For new-Vercel restore:
- Admin extracts tar.gz locally
- Logs into new Firebase Console
- Drag-drop the `backups/whole-system/{name}/` folder into new Firebase Storage
- (OR uses gsutil/firebase CLI to upload)
- Runs `node scripts/whole-system-restore.mjs --backup-ref={name} --mode=fresh --apply` against NEW Firebase env
- Done — 100% clone in new Firebase project
```

### 5.5 List + Delete flows (straightforward — like V75/V40 patterns)

- **List**: GET /api/admin/whole-system-backups-list — bucket.getFiles({prefix:'backups/whole-system/', delimiter:'/'}) → parse names + read manifest.json for each → return [{name, type, createdAt, stats, manifestHash, hashOk}]
- **Delete**: DELETE /api/admin/whole-system-backup-delete { names: ['name1', 'name2'] } — per-name recursive folder delete; refuse if name not parsed (NAME_PATTERN regex)

---

## 6. Storage scope rules (CRITICAL — recursion gate)

`resolveStorageScope(filePath)`:

```js
// Include if matches INCLUDE prefix
const INCLUDE_PREFIXES = [
  'customers/',           // patient photos, treatment images, signatures
  'staff-chat-attachments/',  // V73
  // future Storage paths added here as features ship
];

// Exclude (highest priority — overrides Include)
const EXCLUDE_PREFIXES = [
  'backups/',             // RECURSION GATE — backup-of-backup-of-backup
  'probe/',               // test artifacts
  'TEST-',                // dev/test prefixed
  'E2E-',                 // e2e prefixed
];

function resolveStorageScope(filePath) {
  for (const ex of EXCLUDE_PREFIXES) if (filePath.startsWith(ex)) return false;
  for (const inc of INCLUDE_PREFIXES) if (filePath.startsWith(inc)) return true;
  return false;  // default: exclude unknown paths (forward-compat safety)
}
```

**Why recursion gate matters**: ถ้า `backups/` ไม่ excluded → daily backup คูณทวีขนาดทุกวัน (day 1 = 1 GB, day 2 = 2 GB, day 3 = 4 GB ...). Lock-in via source-grep test (AV62 sub-check).

---

## 7. Auth users export shape (sanitized)

```json
[
  {
    "uid": "abc123...",
    "email": "admin@loverclinic.com",
    "emailVerified": true,
    "displayName": "Admin User",
    "phoneNumber": "+66...",
    "disabled": false,
    "customClaims": { "admin": true },
    "providerData": [
      { "providerId": "password", "uid": "abc123..." },
      { "providerId": "google.com", "uid": "google-123" }
    ],
    "metadata": { "creationTime": "...", "lastSignInTime": "..." }
    // EXCLUDED: passwordHash, salt, refreshTokens, passwordSalt, passwordUpdatedAt
  }
]
```

Firebase `auth.listUsers()` returns `UserRecord` objects with `toJSON()` method but it INCLUDES `passwordHash` and `passwordSalt`. `sanitizeAuthUser()` strips those (security).

`auth.importUsers()` accepts users WITHOUT passwordHash — those users have NO password, must use providerData login (Google/LINE OAuth) OR password-reset flow.

---

## 8. AV invariants (new)

### AV62 — Whole-system backup manifestHash integrity (mirror AV56)

**Trigger**: every restore endpoint MUST verify `computeWholeSystemManifestHash(manifest) === manifest.manifestHash` BEFORE any wipe/restore op. Mismatch → 409 `WHOLE_SYSTEM_MANIFEST_TAMPERED` + Thai error "ไฟล์ backup เสียหายหรือถูกแก้ไข — ยกเลิกการ restore".

**Hash inputs** (canonical JSON ordered):
- All `collections[*].fileHash` sorted by collection name
- `storageManifestHash` (= SHA-256 of `storageObjects[*].fileHash` sorted by path)
- `authUsers.fileHash`
- `name`, `createdAt`, `totalDocCount`, `totalStorageBytes`, `totalAuthUsers`

**Excluded from hash**: `createdBy`, optional notes/labels (mutable for admin convenience, don't taint integrity seal — V75 AV56 lesson).

**Sanctioned exceptions**: NONE — every restore verifies.

**Grep target**: `tests/v81-whole-system-backup-core.test.js` group A asserts contract.

### AV63 — Daily cron CRON_SECRET gate + lock-against-concurrent

**Trigger**: `/api/cron/whole-system-backup-daily` MUST:
1. Verify `req.headers.authorization === 'Bearer ${CRON_SECRET}'` OR `req.headers['x-cron-secret'] === CRON_SECRET` — refuse 401 if not
2. Check + set lock doc `be_admin_audit/whole-system-backup-running` — refuse 409 if exists AND age < 60min
3. Release lock in finally{} regardless of success/failure

**Mirror existing patterns**: V67 LINE reminder cron + V70 recall reminder cron + appointment-snapshot-archive cron all use this gate.

**Sanctioned exceptions**: NONE.

### AV64 — Retention discipline lock

**Trigger**: `shouldCleanupBackup(name, ageMs)` MUST follow:
- `auto-*` > 5 days → delete (RETENTION_DAYS.auto)
- `pre-restore-*` > 7 days → delete (RETENTION_DAYS.preRestore)
- `manual-*` → preserve (∞ — admin's responsibility)
- `__archive.tar.gz` > 24h → delete (RETENTION_DAYS.archive)
- Unknown name pattern → log warning + preserve (forward-compat safety)

**Source**: `src/lib/wholeSystemBackupCore.js` constants. Source-grep test `tests/v81-whole-system-backup-core.test.js` group D locks the constants + branch behavior.

**Sanctioned exceptions**: NONE.

### AV19 elevation (V81-specific) — whole-system Replace MUST autoBackupRef

**Trigger**: `/api/admin/whole-system-restore` with `mode='replace'` MUST:
1. Trigger auto-pre-backup (internal call to backup-export with name='pre-restore-{ts}') BEFORE wipe
2. Verify the pre-restore folder exists in Storage via `bucket.file('backups/whole-system/pre-restore-{ts}/manifest.json').exists()` BEFORE proceeding
3. Refuse 500 `AUTO_PRE_BACKUP_FAILED` if either step fails
4. Stamp `autoBackupRef: 'pre-restore-{ts}'` on restore audit doc

**Why**: V40 introduced AV19 (autoBackupRef mandatory for delete-many/wipe-branch). V74 AV53 elevated for customer cascade. V81 extends to whole-system Replace.

**Sanctioned exceptions**: Fresh-only mode (no wipe, no pre-backup needed). Source-grep test asserts Fresh-mode does NOT trigger pre-backup.

---

## 9. Probe-Deploy-Probe extension

**No new probe required** — existing **Probe #7** (anon write to `backups/` Storage path → 403) covers whole-system Storage path via wildcard `match /backups/{prefix}/{file=**}` (V40). Re-verify Probe #7 in next combined deploy.

**No new Firestore rule** — be_admin_audit existing rule covers audit docs; collections being backed up read via firebase-admin SDK (bypasses rules).

---

## 10. Error handling + concurrency

### Concurrency
- **Single in-flight lock** via `be_admin_audit/whole-system-backup-running` doc — atomic create-if-missing pattern. Lock TTL 60min (auto-release after stale lock).
- Cron + manual button + CLI all respect same lock.

### Partial backup failure
- Per-collection: try/catch INSIDE loop → record in `failedCollections[]` → continue. Don't abort batch.
- Per-storage-blob: try/catch INSIDE copy loop → record in `failedStorageObjects[]` → continue. Audit doc + manifest record list of failed paths.
- Per-auth-user-export: paginated `auth.listUsers()` should not fail unless transient API issue → retry 3x with exponential backoff.

### Memory limits during streaming archive (Vercel)
- Vercel function memory: 1024 MB (Pro). Pro plan max function duration: 60min (custom config).
- tar.gz of 1-5 GB: stream via `archiver` lib (chunked, ~50 MB peak heap).
- Estimated time: ~5-10 min for 5 GB backup → fits Vercel Pro max function timeout.
- For >10 GB: server-side __archive.tar.gz generation may exceed 60min limit. Fallback: admin uses CLI direct gs:// download (no need to materialize __archive.tar.gz at all).

### Restore validation
- manifestHash mismatch → 409 `WHOLE_SYSTEM_MANIFEST_TAMPERED` + Thai error → restore aborted
- Missing collection JSON file → log + continue (partial restore acceptable; failed collection list in audit)
- Auth importUsers conflict (uid exists) → Fresh-only mode = refuse; Replace mode = caller's uid auto-skip (V31 self-delete protection), other conflicts = re-create on top
- Storage blob copy failure → per-blob retry 3x with backoff; final fail = log + continue
- Replace-mode wipe-without-pre-backup-verified → 500 `AUTO_PRE_BACKUP_FAILED` (AV19 elevation)
- Type-confirm name mismatch → 400 `CONFIRM_NAME_MISMATCH` + Thai error

### Self-delete protection (V31)
- Replace mode wipe step skips `auth.deleteUser(caller.uid)` so admin doesn't lock themselves out mid-restore.
- After restore: caller's auth user may NOT exist in backup → admin still logged in but their data is now from backup. UX caveat: admin needs to re-login if backup contained different admin set.

---

## 11. Testing strategy

### 11.1 Unit tests (vitest)
`tests/v81-whole-system-backup-core.test.js` — pure helper tests:
- Group A: manifestHash compute + verify (mirror AV56 V75 contract)
- Group B: validateWholeSystemManifest (schema enforcement)
- Group C: resolveCollectionScope + resolveStorageScope (especially `backups/` recursion gate)
- Group D: shouldCleanupBackup (5d auto / 7d pre-restore / ∞ manual / 24h archive)
- Group E: sanitizeAuthUser (passwordHash / refreshTokens stripped; uid/email/claims/providerData kept)
- Group F: parseBackupName + formatBackupName (round-trip)
- Group G: V81 marker + AV62 + AV63 + AV64 invariant references

### 11.2 Source-grep regression
`tests/v81-source-grep.test.js`:
- AV62: every restore endpoint calls validateWholeSystemManifest + computeWholeSystemManifestHash before mutation
- AV63: cron endpoint verifies CRON_SECRET + concurrency lock acquire/release
- AV64: shouldCleanupBackup constants present in source
- AV19 elevation: restore Replace branch triggers pre-backup before wipe
- Storage scope: EXCLUDE_PREFIXES contains 'backups/' (recursion gate)
- Caller uid self-skip in Replace wipe (V31)

### 11.3 Rule I full-flow simulate
`tests/v81-backup-restore-roundtrip-flow-simulate.test.js`:
- F1: backup → manifest → hash seal verify
- F2: backup → restore Fresh-only → identical state (admin SDK against real prod test fixtures, TEST- prefix)
- F3: backup → restore Replace → identical state + autoBackupRef present
- F4: tampered manifest → restore refuses
- F5: tampered storage blob → manifest verification catches
- F6: cleanup retention enforces correctly
- F7: lock-against-concurrent → second cron call refused

### 11.4 Live admin-SDK e2e
`scripts/e2e-v81-whole-system-backup-restore.mjs`:
- Phase 1: Create TEST-prefixed fixtures (TEST-CUSTOMER-V81-*, TEST-BR-V81-*, TEST-V81-auth-user)
- Phase 2: Trigger manual backup via CLI
- Phase 3: Verify backup folder + manifest hash + counts match
- Phase 4: Wipe TEST fixtures from prod
- Phase 5: Restore from backup
- Phase 6: Verify TEST fixtures restored identically (doc count + manifest hash + storage blob hash + auth user existence)
- Phase 7: Cleanup TEST fixtures
- ZERO orphans check at end

### 11.5 Rule Q L1 hands-on (post-deploy)
- Admin opens BackupManagerTab → 🌐 section → click "Backup Now (whole-system)"
- Wait for backup completion (~5-10 min for prod size)
- Verify backup appears in list with correct stats
- Click "Download" → tar.gz lands on local disk
- Inspect tar.gz: extract → see manifest.json + collections/ + storage/ + auth/
- Re-verify manifestHash locally via `node scripts/whole-system-restore.mjs --backup-ref=... --verify-hash-only`
- **Acceptance criterion**: manifestHash matches + all expected collections present + storage blob count > 0 + auth users count matches prod auth count
- (Restore to fresh test Firebase project = separate hands-on; not required for V81 ship — can be deferred to Phase 2 polish)

---

## 12. Deploy plan

### 12.1 Pre-deploy checklist
- [ ] All vitest passing (V75-V80 chat suite + V81 new tests)
- [ ] Build clean
- [ ] Drift scanner (V80 P0a) — 0 instances
- [ ] firestore.rules + storage.rules unchanged (no rule probes needed beyond existing #7)
- [ ] vercel.json updated with whole-system cron + maxDuration:300 for backup/restore/download endpoints

### 12.2 Deploy command
Single combined deploy:
```
vercel --prod --yes
firebase deploy --only firestore:rules,firestore:indexes
```
(per V18 lock + Rule B Probe-Deploy-Probe — even though no rule changes, re-deploy is idempotent + prevents Console-side drift V1/V9).

### 12.3 Post-deploy verify
- Probe #7 anon write to `backups/whole-system/test-probe-$ts` → expect 403
- Cron self-test: admin trigger manual backup → verify completion within 10 min
- Cleanup test: wait next cron at 03:00 BKK → verify auto-* > 5 days deleted

### 12.4 Cron config in vercel.json
```json
{
  "crons": [
    ...(existing crons),
    {
      "path": "/api/cron/whole-system-backup-daily",
      "schedule": "0 20 * * *"  // 03:00 BKK = 20:00 UTC (-7h)
    }
  ],
  "functions": {
    "api/admin/whole-system-backup-export.js": { "maxDuration": 300 },
    "api/admin/whole-system-restore.js": { "maxDuration": 300 },
    "api/admin/whole-system-backup-download.js": { "maxDuration": 300 },
    "api/cron/whole-system-backup-daily.js": { "maxDuration": 300 }
  }
}
```

---

## 13. Risks + open questions

### R1: Backup file size scaling
- Current clinic Firestore size: ~50-200 MB. Storage (photos): unknown — could be 1-10 GB.
- Daily × 5 retention: ~50 GB Storage cost at max ~$1.30/month per 50GB (Firebase Storage US-central1 ~$0.026/GB).
- Mitigation: monitor `manifest.stats.totalStorageBytes` over time. If clinic grows >50 GB Storage, consider:
  - Skip `__archive.tar.gz` for admin (use CLI direct download)
  - Per-blob content-hash dedup across daily snapshots (future iteration)
  - Daily → weekly schedule for very large clinics

### R2: Vercel function timeout for large restores
- Restore 5 GB backup: ~10-20 min over Vercel function. Pro plan: 60min max.
- Mitigation: chunked restore (split into 10MB-of-data-per-function-call, store progress in be_admin_audit). Defer to Phase 2 if R1 triggers.

### R3: Auth password loss UX
- Restored users have NO password → must use Google/LINE OAuth OR password-reset flow.
- Mitigation: admin opt-in "Send password-reset emails" toggle at restore time. For clinic staff with @loverclinic.com email, Firebase auth.generatePasswordResetLink() works.
- Caveat: customers / patients with LINE-only login don't have email → can't reset password. They re-OAuth via LINE.

### R4: Cron timezone drift (DST not applicable in Thailand, but cron uses UTC)
- Vercel cron uses UTC. 03:00 BKK = 20:00 UTC. Stable since Thailand has no DST.
- Mitigation: comment in vercel.json clarifies BKK target.

### R5: Firebase Auth importUsers rate limit
- Firebase admin SDK: 1000 users per importUsers call, 5 calls/sec.
- For typical clinic with <100 users → trivial.
- For very large user-base (>10K): paginate + add throttle. Defer to scale-time.

### R6: Concurrent restore prevention
- Same lock pattern as backup. Restore and backup share lock (one or the other, not both simultaneously).

---

## 14. Sub-task summary (handoff to /writing-plans)

Estimated ~20-25 tasks for implementation plan:

**Foundation (5 tasks)**:
1. `src/lib/wholeSystemBackupCore.js` — pure helpers + constants
2. `tests/v81-whole-system-backup-core.test.js` — unit + source-grep groups A-G
3. `tests/v81-source-grep.test.js` — AV62/AV63/AV64 + Storage scope regression
4. `tests/v81-backup-restore-roundtrip-flow-simulate.test.js` — Rule I flow F1-F7
5. `vercel.json` — cron + maxDuration config

**Backend endpoints (6 tasks)**:
6. `/api/cron/whole-system-backup-daily.js` (cron handler with lock + cleanup + export)
7. `/api/admin/whole-system-backup-export.js` (manual trigger; shares export helper)
8. `/api/admin/whole-system-restore.js` (Fresh-only + Replace modes; AV19 elevation)
9. `/api/admin/whole-system-backup-download.js` (stream tar.gz + signed URL)
10. `/api/admin/whole-system-backups-list.js`
11. `/api/admin/whole-system-backup-delete.js`

**UI (3 tasks)**:
12. `BackupManagerTab.jsx` — extend with 🌐 Whole-System section + list rows + per-row actions
13. `src/components/backend/WholeSystemBackupModal.jsx` — manual create wizard
14. `src/components/backend/WholeSystemRestoreModal.jsx` — restore wizard (mode radio + type-confirm + reset-emails opt-in)

**CLI Mirrors (2 tasks)**:
15. `scripts/whole-system-backup-export.mjs` — Rule M canonical
16. `scripts/whole-system-restore.mjs` — Rule M canonical (with --local-manifest for cross-Vercel)

**Tests / Audit (3 tasks)**:
17. `scripts/e2e-v81-whole-system-backup-restore.mjs` — Phase 1-7 live admin-SDK e2e on prod with TEST- fixtures
18. Audit invariants AV62/AV63/AV64 + AV19 elevation entries in `.agents/skills/audit-anti-vibe-code/SKILL.md`
19. V21 fixups in existing V40/V74/V75 tests if AV56-related contracts changed (likely no, but verify)

**Documentation (2 tasks)**:
20. Compact V81 V-entry in `.claude/rules/00-session-start.md` § 2
21. Update active.md + SESSION_HANDOFF.md with V81 ship status

**Verification (2 tasks)**:
22. Rule N targeted test run + full vitest at batch-end
23. Build clean + drift scanner (V80 P0a) — 0 instances

**(Optional / Phase 2 follow-up — NOT in this spec)**:
- 24. Rule Q L1 hands-on multi-device verification (admin UI walkthrough)
- 25. Verbose V81 V-entry in `.claude/rules/v-log-archive.md`

---

## 15. Acceptance criteria

After V81 ships + first auto-backup runs:

- [ ] `backups/whole-system/auto-YYYYMMDD-0300/` folder exists at next cron fire
- [ ] manifest.json present + manifestHash valid
- [ ] All universal collections + branch-scoped collections present in `collections/`
- [ ] Customer subcollections present (T4 × N customers)
- [ ] chat_conversations/{convId}/messages subcoll present (per active conv)
- [ ] auth/users.json present + count matches `auth.listUsers()` count
- [ ] storage/ directory contains all customer photos + staff-chat-attachments (skip backups/)
- [ ] Audit doc `be_admin_audit/whole-system-backup-auto-*` emitted with stats
- [ ] After 5 days: oldest auto-* auto-deleted; manual-* preserved
- [ ] Admin can click "Download" → tar.gz lands on local disk
- [ ] manifestHash matches across server + local extraction
- [ ] Restore Fresh-only → empty target Firebase → restored state matches backup state (doc count + storage blob count + auth user count)

---

## 16. Approval

**Q1 ✓** Option A — true 100% clone (new Firebase project assumed for cloned-target; Phase 1 D1 manual setup acceptable cost-of-entry).
**Q2 ✓** (c) — Firestore + Storage + Auth users (no passwords, no env secrets).
**Q3 ✓** (c) hybrid — Fresh-only default + Replace radio + auto-pre-backup mandatory.
**Q4 ✓** all-A — 03:00 BKK cron + piggyback cleanup + `auto-YYYYMMDD-HHmm` + manual button + 7-day pre-restore retention.
**Q5 ✓** all-A — manifest+blobs (V75 pattern) + manifestHash AV62 + skip `backups/` recursion + auth UIDs/claims/providers + admin "download = server-zip" signed URL.
**Section 1 ✓** Architecture + components + data flow.
**Section 2 ✓** (approved as part of "ทั้งหมด") — Testing + ops + AV invariants + edge cases (covered in §11-13).

**Status**: Spec approved by user 2026-05-16 NIGHT+4. Next step: user reviews this written spec → invoke `/writing-plans` to materialize the ~20-25 implementation tasks.

---

*Spec file written by Claude (collaborator). Sourced from /brainstorming session 2026-05-16 NIGHT+4 with user @teddyoomz. References V40 + V74 + V75 + V77 + V80 codebase patterns. Iron-clad rule alignment: Rule H + M + B + Q + P + D. Estimate: 3-4 days implementation, ~20-25 tasks for /writing-plans.*
