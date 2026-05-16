# Customer Backup / Wipe / Restore + Global Backup Manager — Design (2026-05-16)

> **Status**: Brainstorming complete (Q1-Q6 locked with user). Awaiting user review of this spec before writing-plans.
>
> **Skill stack engaged**: `brainstorming` (HARD-GATE) · `real-adversarial-verification` (Rule Q L1/L2) · `safety-guard` · `security-review` · `audit-harness`. Implementation will engage `writing-plans` → `subagent-driven-development` → `test-driven-development` → `verification-before-completion` → `production-audit` + project audit skills (`audit-cascade-logic`, `audit-referential-integrity`, `audit-firebase-admin-security`, `audit-anti-vibe-code`, `audit-class-of-bug-discipline`).
>
> **Iron-clad rules in effect**: A (revert) · B (Probe-Deploy-Probe) · C1-C3 (anti-vibe-code) · D (continuous improvement) · I (full-flow simulate) · J (skill auto-trigger) · M (data ops via local + admin-SDK + canonical paths + dry-run + audit doc + idempotency) · Q (real-adversarial verification before "verified" claim) · R (env-pull standing auth for diag).
>
> **User directives anchoring this design** (verbatim, 2026-05-16):
> - "ระบบ backup ข้อมูลลูกค้าทั้งหมด ... Global ... มีผลทุกสาขา"
> - "Backup ข้อมูลทุกอย่างของลูกค้าคนนั้น ... คอร์สที่ใช้ , คอร์สคงเหลือ ,บริการ, ประวัติการรักษา, Chart , lab , ไฟล์ต่างๆ , ทุกอย่างในหน้า TFP , เงินมัดจำ , ประวัติใช้คอร์ส , นัด , ผูก line หรืออื่นๆทั้งหมดที่นายสำรวจเจอ"
> - "ถอดข้อมูลลูกค้าออก แล้วข้อมูลทุกอย่างหายไปจากระบบ และสามารถ restore กลับมาแล้วเหมือนเดิมได้ 100%"
> - "ระบบ backup เรามีเยอะมากๆแล้ว ... manage และ edit หรือ delete ได้ ... ทุกไฟล์"
> - "ห้ามมีข้อผิดพลาดใดๆก่อนปล่อยให้ผมทดลอง"

---

## 1. Goals + non-goals

### Goals

1. Per-customer GLOBAL backup file capturing 100% of customer-attached data (Firestore + Storage) at a point in time.
2. Customer wipe contract that REQUIRES a valid backup ref BEFORE wipe (AV19 elevated), gated on cryptographic body-hash + per-Storage-object SHA-256 verify.
3. Customer restore that recreates state byte-identically at the SAME IDs — cross-references (LINE userId → customerId, audit log → treatmentId, stock movement → treatmentId) remain valid.
4. Audit-immutable preservation: be_admin_audit + be_stock_movements + LINE/recall logs SURVIVE wipe (legal/MOPH retention). Restore SKIPS them (they were never deleted).
5. Unified `tab=backup-manager` admin surface managing **all** backup file types (V40 branch, V15 central stock, NEW customer) — rename (label) / download / delete with AV19 72h-grace.
6. Adversarial test catalog: 10 categories × ~30-40 assertions covering NEW patterns not already covered by V40/V15.
7. Rule Q L1 hands-on verification before any "verified" claim.

### Non-goals

- Bulk backup-creation via UI (CLI script only — bulk UI = accidental N-customer-wipe risk).
- Auto-delete retention cron (admin-managed only; AV19 72h-grace is the cleanup gate).
- Cross-customer merging / partial restore (single-customer scope; restore = full overwrite of empty slot).
- Branch / central-stock backup features (existing V40 / V15 stay as-is for create/restore flows).

---

## 2. Customer-data surface (locked by Q1=A)

| Tier | Items | Wipe action | Restore action |
|---|---|---|---|
| **CD** — customer doc | `be_customers/{customerId}` (patientData, courses[], expiredCourses[], `lineUserId_byBranch`, `patientLinkToken`, Storage-URL fields `profile_image`/`card_photo`/`gallery_upload[]`) | DELETE | RECREATE at same id |
| **C11** — cascade collections (per Phase 24.0) | `be_treatments` · `be_sales` · `be_deposits` · `be_wallets` · `be_wallet_transactions` · `be_memberships` · `be_point_transactions` · `be_appointments` · `be_course_changes` · `be_link_requests` · `be_customer_link_tokens` | DELETE all docs where `customerId == X` | RECREATE all docs at same ids |
| **CG** — gap collections (cascade stale; this design CLOSES) | `be_quotations` · `be_vendor_sales` · `be_online_sales` · `be_sale_insurance_claims` · `be_recalls` (V66 Phase 29) | DELETE all docs where `customerId == X` | RECREATE all docs at same ids |
| **CS** — customer-attached subcollections (orphan bug today — this design CLOSES) | `be_customers/{customerId}/{treatments,sales,appointments,deposits,wallets,memberships,points,courseChanges}` (8 per V40 T4) | DELETE all subcollection docs (recursive) | RECREATE all docs at same ids in same subcoll paths |
| **CF** — Storage files (orphan bug today — this design CLOSES) | `gs://.../be_customers/{customerId}/...` (profile_image, card_photo, gallery_upload images) | DELETE all objects under prefix | COPY backup-Storage-tree objects back to canonical paths |
| **CH** — chat (linked via pageId/lineUserId) | `chat_conversations` docs where `customerId === X` OR `lineUserId IN Object.values(customer.lineUserId_byBranch \|\| {})` | DELETE matching docs | RECREATE matching docs at same IDs |
| **AI** — audit-immutable (NOT customer data; legal/MOPH retention) | `be_admin_audit` · `be_stock_movements` (V34) · `be_line_reminder_log` (V67) · `be_recall_audit_log` · `be_postback_log` · `be_line_reminder_postback_log` | **LEAVE INTACT** | **SKIP** (never deleted; nothing to restore) |

**FK consistency**: cross-reference invariants maintained because wipe + restore both operate at SAME doc IDs. Stock movements reference treatmentId; after wipe, refs point at deleted docs (orphaned but immutable per V34); after restore, refs re-resolve because the SAME treatmentId now exists again.

---

## 3. Backup file layout (locked by Q2=B)

### 3.1 Storage tree

```
gs://loverclinic-opd-4c39b.firebasestorage.app/backups/customers/{customerId}/{ts-rand}/
  ├── backup.json                    ← Firestore data + Storage manifest + meta
  └── storage/
      └── be_customers/{customerId}/
          ├── gallery_<uuid>.jpg
          ├── gallery_<uuid>.jpg
          ├── profile_<uuid>.jpg
          └── card_<uuid>.jpg
```

**Path constants**:
- Bucket: `${APP_ID}.firebasestorage.app` (APP_ID = `loverclinic-opd-4c39b`)
- Root prefix: `backups/customers/{customerId}/{ts}-{rand}/`
- `ts` = `Date.now()` ms epoch; `rand` = 6 random hex bytes via `crypto.randomBytes(6).toString('hex')`
- Storage tree mirrors original gs:// paths verbatim under `/storage/` so restore = "copy back to same path minus the backup prefix"

### 3.2 `backup.json` schema (extends `branchBackupSchema.js` v2)

```json
{
  "meta": {
    "schemaVersion": 2,
    "backupType": "customer",
    "customerId": "LC-26000007",
    "customerHN": "001234",
    "customerName": "นางสาว สมหญิง ใจดี",
    "exportedBy": "admin@loverclinic.com (uid)",
    "exportedAt": "2026-05-16T12:34:56.789Z",
    "isAutoPreFresh": false,
    "scope": {
      "tiers": ["CD", "C11", "CG", "CS", "CF", "CH"],
      "auditImmutableExcluded": ["be_admin_audit", "be_stock_movements", "be_line_reminder_log", "be_recall_audit_log", "be_postback_log", "be_line_reminder_postback_log"]
    },
    "userNote": "",
    "perCollectionCounts": {
      "be_customers": 1,
      "be_treatments": 47,
      "be_sales": 12,
      "be_appointments": 3,
      "...": "..."
    },
    "subcollectionCounts": {
      "treatments": 47,
      "sales": 12,
      "...": "..."
    },
    "storageManifest": [
      { "path": "be_customers/LC-26000007/profile_abc.jpg", "size": 234567, "sha256": "abc123...", "contentType": "image/jpeg" },
      { "path": "be_customers/LC-26000007/gallery_def.jpg", "size": 1234567, "sha256": "def456...", "contentType": "image/jpeg" }
    ],
    "bodyHash": "<sha256 of canonical collections+subcollections JSON>",
    "storageManifestHash": "<sha256 of sorted manifest entries>"
  },
  "collections": {
    "be_customers": [ { "id": "LC-26000007", ... } ],
    "be_treatments": [ ... ],
    "be_sales": [ ... ],
    "be_quotations": [ ... ],
    "be_vendor_sales": [ ... ],
    "be_online_sales": [ ... ],
    "be_sale_insurance_claims": [ ... ],
    "be_recalls": [ ... ],
    "...": "..."
  },
  "subcollections": {
    "treatments":     [ { "id": "BT-...", "parentCustomerId": "LC-26000007", ... } ],
    "sales":          [ ... ],
    "appointments":   [ ... ],
    "deposits":       [ ... ],
    "wallets":        [ ... ],
    "memberships":    [ ... ],
    "points":         [ ... ],
    "courseChanges":  [ ... ]
  },
  "chatConversations": [ ... ]
}
```

### 3.3 Integrity contract

**Two-layer hashing**:
1. `meta.bodyHash` = SHA-256 of canonicalized `collections + subcollections + chatConversations` (reuses `computeBodyHash` from `branchBackupSchema.js`; extends canonicalization to include `subcollections` block + `chatConversations` block).
2. `meta.storageManifestHash` = SHA-256 of sorted manifest entries `${path}|${size}|${sha256}` joined by `\n`.

**Mutable field**: `meta.userNote` is EXCLUDED from both hashes (Q5b=Y — label-edit must not invalidate integrity).

**Per-Storage-object SHA-256**: each `storage/...` object has its sha256 captured in `storageManifest[].sha256` at backup time. Restore + wipe re-verify EVERY object byte-for-byte before proceeding.

**NaN/Infinity preservation**: reuse `jsonReplacerForNonFinite` + `jsonReviverForNonFinite` from `branchBackupSchema.js`. V40-prod-fix-5 sentinel encoding `{__number__: 'NaN'|'Infinity'|'-Infinity'}`.

---

## 4. Endpoints (8 new + 1 ENHANCED)

All endpoints: `verifyAdminToken` gate (admin claim required), `POST` only, CORS-enabled, structured Thai error messages on failure.

### 4.1 NEW `/api/admin/customer-backup-export`

```
POST  { customerId: 'LC-26000007', userNote?: '' }
→ 200 { ok: true, backupRef: 'backups/customers/LC-.../1234567890-abc123/backup.json',
         downloadUrl: '<signed URL 24h>', sizeBytes: 12345, bodyHash, storageManifestHash,
         perCollectionCounts, subcollectionCounts, storageObjectCount }
```

**Flow**: read customer doc → enumerate C11+CG+CS+CH using customerId filter → enumerate CF Storage objects under `be_customers/{customerId}/` prefix → compute per-object SHA-256 → `buildBackupFile()` extended → write `backup.json` to Storage → COPY Storage objects under `/storage/` subtree → write audit doc `be_admin_audit/customer-backup-export-{customerId}-{ts}-{rand}`.

### 4.2 ENHANCED `/api/admin/delete-customer-cascade` (Phase 24.0 extends)

```
POST  { customerId, action: 'preview' | 'delete', authorizedBy: {...},
        autoBackupRef: 'backups/...', expectedBodyHash, expectedStorageManifestHash }
```

**Changes vs Phase 24.0**:
- ADD `autoBackupRef` REQUIRED on `action: 'delete'` (AV19 elevated). Server verifies file exists in Storage + body bytes parse + bodyHash recomputed matches + Storage manifest hash matches + every manifest object exists at backup path + per-object SHA-256 matches.
- ADD CG to cascade collection list (be_quotations, be_vendor_sales, be_online_sales, be_sale_insurance_claims, be_recalls).
- ADD CS subcollection iteration (8 customer-attached subcollections recursively deleted).
- ADD CF Storage object deletion (every object under `be_customers/{customerId}/` prefix removed).
- ADD CH chat_conversations matching customer's linked profiles.
- ENHANCED audit doc payload: `autoBackupRef`, `bodyHash`, `storageManifestHash`, `storageObjectCount`, `chatConversationCount`, `subcollectionCounts`.
- PRESERVE Phase 24.0 contract: `customer_delete` perm still works, branch-roster validation still enforced, authorizedBy single/legacy shape still accepted.

### 4.3 NEW `/api/admin/customer-restore`

```
POST  { backupRef: 'backups/customers/.../backup.json',
        expectedBodyHash, expectedStorageManifestHash,
        action: 'preview' | 'restore' }
→ 200 (preview) { ok: true, customerId, customerHN, customerName,
                  cascadeRecreateCounts, subcollectionRecreateCounts,
                  storageObjectCount, conflicts: { customerIdExists, hnCollision,
                  lineConflicts: [...], staleFKs: [...] } }
→ 200 (restore) { ok: true, customerId, recreated: {...}, stripped: { lineConflicts: [...] }, auditDocId }
→ 400 SAFE-mode block: { ok: false, error: 'CUSTOMER_ID_EXISTS'|'HN_COLLISION', detail }
```

**Q3=B SAFE flow**:
1. Download `backup.json` → `validateBackupFile()` → recompute `bodyHash` → verify match
2. Re-fetch storageManifest → for each object: download from backup path → SHA-256 → verify match
3. Conflict scan:
   - `customerId` already in `be_customers` → **400 BLOCK** `CUSTOMER_ID_EXISTS`
   - `hn_no` collision with any other customer → **400 BLOCK** `HN_COLLISION`
   - For each `branchId` in `lineUserId_byBranch`: if `lineUserId` is now linked to a DIFFERENT customer in that branch's `be_customers` index → STRIP that branch's entry from restored customer doc + record in `audit.lineConflicts[]`
   - Stale FKs (staff/doctor IDs deleted/hidden) → preserve verbatim (V41 lookup-map with `includeHidden:true` handles missing-FK display)
4. On `action: 'preview'`: return scan results, do NOT mutate
5. On `action: 'restore'`:
   - Batch-write all docs at original IDs (chunk by 450 — Firestore batch limit)
   - COPY Storage objects back from backup tree to canonical paths
   - Write audit doc `be_admin_audit/customer-restore-{customerId}-{ts}-{rand}` with restore counts + stripped LINE conflicts + bodyHashes

### 4.4 NEW `/api/admin/backup-manager-list`

```
POST  { types?: ['customer', 'branch', 'central-stock'],
        from?: '2026-05-01', to?: '2026-05-16',
        search?: 'HN/customerName/branchName',
        page?: 1, pageSize?: 50 }
→ 200 { ok: true, items: [ { backupRef, type, scopeId, scopeName, customerHN?,
        userNote, exportedAt, exportedBy, sizeBytes, hasStorageTree, isAutoPreFresh,
        bodyHash, storageManifestHash } ], total, page, pageSize }
```

Iterates `backups/**/*.json` Storage prefixes (paginated via `bucket.getFiles({prefix, maxResults})`). Returns metadata-only (no body); UI uses for list rendering.

### 4.5 NEW `/api/admin/backup-manager-rename`

```
POST  { backupRef, userNote: 'นางสาว สมหญิง EOD 2026-05-16' }
→ 200 { ok: true, backupRef, userNote, bodyHash, storageManifestHash }
→ 400 { ok: false, error: 'USER_NOTE_TOO_LONG' | 'INVALID_BACKUP_REF' }
```

Downloads JSON → updates `meta.userNote` (max 200 chars) → uploads back (overwrite). `bodyHash` + `storageManifestHash` UNCHANGED (meta excluded from hash). Writes audit doc `be_admin_audit/backup-rename-{ts}-{rand}` with old + new userNote.

### 4.6 NEW `/api/admin/backup-manager-delete`

```
POST  { backupRef, confirmAuditDocCheck: true }
→ 200 { ok: true, backupRef, deletedObjectCount: 23, auditDocId }
→ 400 { ok: false, error: 'AV19_GRACE_PERIOD' | 'BACKUP_NOT_FOUND',
        detail: { recentAuditDocRef, hoursRemaining } }
```

**AV19 72h-grace check**: query `be_admin_audit` for any doc in last 72 hours where `autoBackupRef === backupRef` → if found AND status='delete'-class → **BLOCK** with grace-period error (admin sees `recentAuditDocRef`, can wait or hand-resolve). Otherwise: delete JSON + recursive delete of `/storage/` tree under backupRef prefix + audit doc `be_admin_audit/backup-delete-{ts}-{rand}` with deletedObjectCount + bodyHash (forensic — admin can prove this backup existed).

### 4.7 NEW `/api/admin/backup-manager-bulk-delete`

```
POST  { backupRefs: ['backups/...', 'backups/...', ...] }
→ 200 { ok: true, deletedCount, failedRefs: [{ ref, reason }], auditDocIds }
→ 400 { ok: false, error: 'BULK_LIMIT_EXCEEDED' (>50) | 'EMPTY_SET' }
```

Sequentially calls delete logic per ref (each gets own audit doc + AV19 grace check). Returns partial-success summary. Max 50 per call.

### 4.8 NEW `/api/admin/backup-manager-download`

```
POST  { backupRef, format: 'json' | 'zip' }
→ 200 { ok: true, downloadUrl: '<signed URL 1h>', sizeBytes }
```

- `format: 'json'` → signed URL for `backup.json` only
- `format: 'zip'` → server bundles JSON + Storage tree into ZIP at `backups/customers/.../{ts}-bundle.zip`, returns signed URL (24h TTL, auto-cleaned after retrieval)

---

## 5. UI surfaces (locked by Q4=C + Q5a=B)

### 5.1 CustomerDetailView header (ENHANCED)

Add to existing header (next to current "Delete" button from Phase 24.0):

```
[💾 สำรองข้อมูล] [🗑️ ลบลูกค้า (เดิม)] [↩️ กลับ]
```

- **💾 สำรองข้อมูล** opens modal:
  - Optional textarea: "บันทึก (ไม่จำเป็น)" → maps to `userNote`
  - Confirm button → POST `/api/admin/customer-backup-export`
  - Success: toast with download link + Storage path + size + counts
- **🗑️ ลบลูกค้า** opens modal (extends Phase 24.0):
  - NEW radio at top: "ใช้ไฟล์สำรอง" ⊙ "สำรองข้อมูลใหม่ก่อนลบ (แนะนำ)" / ⊙ "เลือกไฟล์สำรองที่มีอยู่"
  - If "สำรองข้อมูลใหม่ก่อนลบ": triggers backup-export FIRST (server-side combined endpoint OR client-side sequential), gets `backupRef` → passes to delete endpoint as `autoBackupRef`
  - If "เลือกไฟล์สำรองที่มีอยู่": picker shows last 5 customer-backup files for this `customerId` (sorted by recent) — admin picks one → `autoBackupRef` set
  - Existing authorizedBy + HN-type-confirm + branch-roster validation PRESERVED
  - Confirm → POST `/api/admin/delete-customer-cascade` with autoBackupRef

### 5.2 NEW `tab=customer-data-recovery` (admin-only)

Per Q4=C — for restore-from-storage + restore-from-file flows (customer no longer exists, can't navigate via CustomerDetailView).

```
[Customer Backup Files] [📥 Upload backup file]

Filter: [Date: from/to] [HN: ____] [Customer name: ____]

┌────────────────────────────────────────────────────────────────────────────┐
│ HN     │ Name                │ Backup time      │ Size  │ Note   │ Actions │
├────────────────────────────────────────────────────────────────────────────┤
│ 001234 │ นางสาว สมหญิง ใจดี  │ 2026-05-16 14:30 │ 12MB  │ ผู้ป่วย... │ 🔄 ⬇ ✏ 🗑 │
│ 005678 │ นาย ใจร้อน รีบเร่ง │ 2026-05-15 09:12 │ 3MB   │        │ 🔄 ⬇ ✏ 🗑 │
└────────────────────────────────────────────────────────────────────────────┘
[< Prev]  Page 1 / 12  [Next >]
```

**Action chips**:
- 🔄 **กู้คืน** — confirms restore preview (counts + conflicts) → final restore confirm → toast success
- ⬇️ **ดาวน์โหลด** — ZIP bundle download (Storage tree + JSON)
- ✏️ **เปลี่ยนชื่อ** — inline edit `userNote`
- 🗑️ **ลบ backup** — confirm + audit-log delete; AV19 72h-grace warning if applicable

**Upload backup file**: file picker → preview integrity check → restore preview → confirm.

### 5.3 NEW `tab=backup-manager` (admin-only — global; covers ALL backup types)

```
[All Backup Files]

Type: [☑ Customer] [☑ Branch] [☑ Central Stock]    Date: [from] [to]    Search: ____

┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Type     │ Scope        │ Name            │ Backup time      │ Size  │ Note │ Actions│
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Customer │ HN 001234    │ นางสาว สมหญิง   │ 2026-05-16 14:30 │ 12MB  │ ...  │ ⬇ ✏ 🗑 │
│ Branch   │ นครราชสีมา   │                 │ 2026-05-15 18:00 │ 45MB  │ EOD  │ ⬇ ✏ 🗑 │
│ Central  │ คลังกลาง 1   │                 │ 2026-05-14 22:00 │ 8MB   │ ...  │ ⬇ ✏ 🗑 │
└──────────────────────────────────────────────────────────────────────────────────────┘

[☑ Select all] [Bulk delete (≤50)]  Total: 342 files  •  Total size: 4.2 GB
```

**Note**: restore actions for branch / central-stock are on their EXISTING tabs (V40 branch tab, V15 central-stock tab). This manager tab is read/edit/delete only — no restore action mixed in.

### 5.4 NEW `tab=customer-data-recovery` vs `tab=backup-manager` distinction

| `tab=customer-data-recovery` | `tab=backup-manager` |
|---|---|
| Customer-backup files ONLY | ALL backup file types |
| Restore action available | Restore NOT here (use type-specific tabs) |
| Upload-and-restore workflow | No upload workflow |
| Primary entry: "I need to restore a customer" | Primary entry: "I need to clean up old backup files" |

### 5.5 Permissions

- `tab=customer-data-recovery` → `useTabAccess.isAdmin === true` (no separate perm key MVP)
- `tab=backup-manager` → `useTabAccess.isAdmin === true`
- TAB_PERMISSION_MAP entries: `'customer-data-recovery': { adminOnly: true }` + `'backup-manager': { adminOnly: true }`
- New nav entries in `nav/navConfig.js` under section "ระบบ" (admin section)

---

## 6. CLI mirrors (Rule M canonical)

NEW scripts following Phase 18.0 + Phase 19.0 + V40 + V15 canonical pattern (env-load + admin-SDK + invocation guard + dry-run by default + audit doc + idempotency + forensic-trail).

| Script | Purpose |
|---|---|
| `scripts/customer-backup-export.mjs` | Export single customer (`--customer-id LC-...`) OR all customers in branch (`--all-in-branch BR-...`) |
| `scripts/customer-restore.mjs` | Restore from `backups/customers/.../backup.json` reference OR local file path |
| `scripts/customer-delete-with-backup.mjs` | Combined backup + delete in single op (admin-SDK; bypasses UI confirmation for disaster recovery) |
| `scripts/backup-manager-list.mjs` | List all backups across types with filters |
| `scripts/backup-manager-delete.mjs` | Delete specific backup ref (or bulk via `--refs-file`) |
| `scripts/customer-backup-download.mjs` | Download backup JSON + Storage tree to local disk (offline storage) |
| `scripts/diag-customer-backup-integrity.mjs` | Rule R diag — verifies a backup file's integrity end-to-end against current schema (no writes) |

All scripts default to dry-run; commit only with `--apply`.

---

## 7. Conflict resolution (locked by Q3=B SAFE)

| Conflict | Action |
|---|---|
| `customerId` already in `be_customers` | **400 BLOCK** `CUSTOMER_ID_EXISTS` — admin must delete first |
| `hn_no` matches another live customer | **400 BLOCK** `HN_COLLISION` — admin hand-fixes |
| `lineUserId_byBranch[X]` taken by another customer at branch X | **STRIP** that branch's entry from restored customer doc + audit `lineConflicts[]` entry |
| `patientLinkToken` exists in another customer (random collision — effectively impossible) | **STRIP** + audit |
| `be_customer_link_tokens` expired (`expiresAt < now`) | RESTORE as-is — UI already handles expired tokens |
| Stale staff/doctor FK (deleted/hidden via V41) | RESTORE as-is — V41 lookup-map with `includeHidden:true` handles missing FK display |
| Stale product/course FK (deleted) | RESTORE as-is — affected docs (treatments/sales) just display "(สินค้า/คอร์สถูกลบ)" |

All conflicts recorded in restore audit doc for forensic trail.

---

## 8. Audit-immutable preservation contract (locked by Q1=A)

### Wipe behavior

- `be_admin_audit` → LEAVE INTACT. Wipe writes a NEW entry `customer-delete-cascade-{cid}-{ts}-{rand}`.
- `be_stock_movements` → LEAVE INTACT (V34 MOPH immutable). Stock-movement docs reference `treatmentId` — after wipe, those refs point at deleted treatments (orphaned but readable; UI handles missing-treatment-ref gracefully).
- `be_line_reminder_log` + `be_recall_audit_log` + `be_postback_log` + `be_line_reminder_postback_log` → LEAVE INTACT (operational audit trail).

### Restore behavior

- `be_admin_audit` → SKIP (no restore — audit log was never deleted). New entry `customer-restore-{cid}-{ts}-{rand}` appended.
- `be_stock_movements` → SKIP (no restore — was never deleted). **Cross-reference re-validation**: since restore recreates `be_treatments` at the SAME `treatmentId`, every `be_stock_movements` doc that previously orphaned a `treatmentId` now re-resolves correctly. This is the byte-identical restore guarantee in action.
- Other audit logs → SKIP.

### Stock-movement integrity verification

Post-restore verification step: query `be_stock_movements` where `treatmentId IN (restored treatment IDs)` → confirm every match resolves to a now-existing treatment doc. Recorded in audit doc as `stockReResolveCount`.

---

## 9. Test catalog (10 categories — locked by Q6)

Naming convention: `tests/v74-customer-backup-restore-*.test.{js,jsx}` + adversarial e2e under `scripts/e2e-customer-backup-*.mjs`.

| # | Test file | Cases | Asserts |
|---|---|---|---|
| **T1** | `tests/v74-customer-backup-vanilla-roundtrip.test.js` | 1 | minimal customer (1 treatment / 1 sale / 1 deposit / 1 appt / 1 LINE link) → export → wipe → restore → assert byte-identical via deep-equal |
| **T2** | `tests/v74-customer-backup-heavy-gallery-storage.test.js` | 2 | (a) 20 gallery_upload images (validator max) (b) all 3 photo fields populated → assert per-object SHA-256 round-trip + Storage tree byte-equal |
| **T3** | `tests/v74-customer-backup-adversarial-data.test.js` | 5 | Thai chars + Unicode NFC≠NFD + NaN/Infinity numeric + NUL byte + 10K-char string fields → assert byte-identical via reviver |
| **T4** | `tests/v74-customer-backup-cross-branch.test.js` | 3 | (a) customer with treatments@BR-A + sales@BR-B + appts@BR-C (b) cross-branch LINE links (c) cross-branch wallets → each doc's `branchId` preserved |
| **T5** | `tests/v74-customer-backup-subcollections.test.js` | 2 | populated 8 customer-attached subcoll → assert each preserved + re-attaches to parent customer doc after restore |
| **T6** | `tests/v74-customer-backup-conflict-resolution.test.js` | 4 | (a) customerId exists → BLOCK (b) HN collision → BLOCK (c) LINE conflict → STRIP + audit (d) stale FK → preserved verbatim |
| **T7** | `tests/v74-customer-backup-audit-immutable.test.js` | 2 | (a) be_admin_audit + be_stock_movements survive wipe (b) stock-movement→treatmentId refs re-resolve post-restore (verify count match) |
| **T8** | `tests/v74-customer-backup-tampering.test.js` | 3 | (a) bodyHash mismatch BLOCKs wipe + restore (b) per-Storage-object SHA-256 mismatch BLOCKs (c) manifest count vs actual count mismatch BLOCKs |
| **T9** | `tests/v74-customer-backup-concurrency-failure.test.js` | 4 | (a) concurrent backup-during-delete (b) concurrent restore-during-delete (c) partial Storage upload fail mid-backup → rollback (d) batch commit fail mid-cascade → rollback |
| **T10** | `tests/v74-backup-manager.test.js` | 3 | (a) rename label preserves bodyHash (label excluded from hash) (b) bulk delete writes 1 audit doc per file (c) AV19 72h-grace blocks delete of recently-referenced backup |

**Plus e2e scripts** (Rule Q L2 — real client SDK against real prod with TEST-prefixed fixtures):
- `scripts/e2e-customer-backup-restore-roundtrip-real-prod.mjs` — runs full backup-wipe-restore cycle on TEST-V74-CUSTOMER-{ts} fixture
- `scripts/e2e-customer-backup-tampering-real-prod.mjs` — verifies tampering detection blocks the wipe
- `scripts/e2e-backup-manager-cleanup-real-prod.mjs` — verifies AV19 grace + bulk delete + rename round-trip

**Rule Q L1 hands-on acceptance** (REQUIRED before user signs off on "verified"):
- Admin clicks "💾 สำรองข้อมูล" on CustomerDetailView for TEST customer → backup file appears in Storage + signed URL works ✓
- Admin clicks "🗑️ ลบลูกค้า" with "สำรองข้อมูลใหม่ก่อนลบ" → AV19 verifies + cascade fires + customer disappears ✓
- Admin opens `tab=customer-data-recovery` → finds the backup → clicks "🔄 กู้คืน" → preview shows correct counts + 0 conflicts → confirm → customer reappears in queue identical ✓
- Admin opens `tab=backup-manager` → renames one backup label → re-fetch shows new label ✓
- Admin selects 3 backups → bulk delete → 3 audit docs appear in be_admin_audit ✓
- Admin tries to delete a backup that was the autoBackupRef for a wipe < 72h ago → blocked with grace-period error showing the audit doc ref ✓

---

## 10. Class-of-bug / AV invariant locks (Rule P)

### NEW AV52 — Backup file integrity contract

Every backup-export endpoint MUST produce a file where:
- `meta.bodyHash === computeBodyHash(file.collections + file.subcollections + file.chatConversations)`
- `meta.storageManifestHash === computeStorageManifestHash(file.meta.storageManifest)`
- Every `storageManifest[].sha256` matches the actual object at `backups/.../storage/${path}`
Sanctioned exception: `meta.userNote` MUST be excluded from `bodyHash` to enable Q5b=Y label-edit.
Source-grep regression: `tests/v74-customer-backup-tampering.test.js` T8 locks.

### NEW AV53 — AV19 elevation for customer wipe

`/api/admin/delete-customer-cascade` with `action: 'delete'` MUST require `autoBackupRef` AND verify:
- Storage object exists
- JSON body parses
- Recomputed `bodyHash` matches `meta.bodyHash`
- Recomputed `storageManifestHash` matches `meta.storageManifestHash`
- Every Storage object SHA-256 matches manifest
Before any DELETE write. Otherwise BLOCK.
Source-grep regression: T8 + T9 partial.

### NEW AV54 — Subcollection cascade discipline

For per-customer wipe paths, MUST iterate ALL 8 customer-attached subcollections (`treatments`/`sales`/`appointments`/`deposits`/`wallets`/`memberships`/`points`/`courseChanges`) and recursively delete. Sanctioned exception: NONE — every subcollection must be in the cascade list.
Source-grep regression: T5 + audit-cascade-logic skill extension.

### NEW AV55 — Backup-manager 72h-grace

`/api/admin/backup-manager-delete` MUST query `be_admin_audit` for any doc within last 72 hours where `autoBackupRef === target.backupRef` → BLOCK if found.
Source-grep regression: T10c.

### Extend existing AV19 for customer scope

V40 AV19 (destructive ops require autoBackupRef + bucket.file().exists()) extends to customer scope with the additional bodyHash + storageManifestHash + per-object SHA-256 verify.

---

## 11. Risks + mitigations

| Risk | Mitigation |
|---|---|
| **Backup file > 1MB Firestore limit?** | Not applicable — backup file is in Cloud Storage, not Firestore. 100MB+ galleries are fine. |
| **Hash compute on 100MB+ file is slow** | Canonical JSON hashing on `collections + subcollections + chatConversations` (not Storage bytes) is fast (~1 sec for 50MB JSON). Per-Storage-object SHA-256 computed in parallel with download. |
| **Restore conflict at scale** (HN collision blocks restore) | Rare. Q3=B SAFE-mode contract: admin hand-resolves. Better to BLOCK than silently overwrite/corrupt. |
| **Audit-immutable orphan** (stock movement → deleted treatmentId) | Expected per V34 contract. UI handles missing-FK gracefully. Post-restore the same treatmentId re-exists → refs re-resolve. |
| **Storage cost** (lots of customer galleries × every backup keeps a copy) | Admin manages retention via `tab=backup-manager`. AV19 72h-grace prevents accidental deletion of safety nets. Future Phase 2: optional auto-retention cron. |
| **Bulk-delete partial failure** (deleted 30 of 50, 31st failed) | Per-file audit doc + return summary `{deletedCount, failedRefs}`. Admin re-runs on failed subset. |
| **Concurrent backup + delete same customer** | Backup is read-only — runs to completion even mid-delete. Delete waits for any in-flight backup to settle via short retry on `503 BACKUP_IN_PROGRESS`. Last-writer wins on the backup file (file IDs are unique per `{ts}-{rand}`). |
| **Restore mid-delete race** | Restore preview catches "customerId doesn't exist yet" → admin retries after delete completes; restore can't half-run because batch commit is atomic. |
| **Schema drift between backup time and restore time** | `meta.schemaVersion` validated by `validateBackupFile`. v1 + v2 compatible per existing reviver. Future schema bumps via additive fields only. |
| **Wipe of customer at branch A doesn't delete docs at branch B** (if customer has cross-branch data) | Customer-scoped wipe is branch-agnostic; queries use `where('customerId', '==', X)` without branch filter. Verified in T4 cross-branch test. |

---

## 12. File inventory

### NEW files (28)

**Source (10)**:
- `src/lib/customerBackupCore.js` — pure helpers (collection enumeration, conflict scan, audit-immutable list)
- `src/lib/customerBackupSchema.js` — extends branchBackupSchema.js for customer file format (or could embed in core)
- `src/components/backend/CustomerBackupModal.jsx` — "💾 สำรองข้อมูล" modal
- `src/components/backend/CustomerDeleteModalEnhanced.jsx` — extends existing Phase 24.0 delete modal with autoBackupRef
- `src/components/backend/CustomerDataRecoveryTab.jsx` — restore-from-storage + restore-from-file tab
- `src/components/backend/CustomerRestorePreviewModal.jsx` — preview before restore
- `src/components/backend/BackupManagerTab.jsx` — unified manager tab
- `src/components/backend/BackupManagerRenameModal.jsx` — inline rename modal
- `src/components/backend/BackupManagerBulkDeleteModal.jsx` — bulk select + confirm
- `src/hooks/useBackupManagerList.js` — paginated listing hook

**Endpoints (8)**:
- `api/admin/customer-backup-export.js`
- `api/admin/customer-restore.js`
- `api/admin/backup-manager-list.js`
- `api/admin/backup-manager-rename.js`
- `api/admin/backup-manager-delete.js`
- `api/admin/backup-manager-bulk-delete.js`
- `api/admin/backup-manager-download.js`
- (ENHANCED) `api/admin/delete-customer-cascade.js` — extends Phase 24.0

**CLI scripts (7)**:
- `scripts/customer-backup-export.mjs`
- `scripts/customer-restore.mjs`
- `scripts/customer-delete-with-backup.mjs`
- `scripts/backup-manager-list.mjs`
- `scripts/backup-manager-delete.mjs`
- `scripts/customer-backup-download.mjs`
- `scripts/diag-customer-backup-integrity.mjs`

**Tests (10 unit/integration + 3 e2e)**:
- `tests/v74-customer-backup-vanilla-roundtrip.test.js` — T1
- `tests/v74-customer-backup-heavy-gallery-storage.test.js` — T2
- `tests/v74-customer-backup-adversarial-data.test.js` — T3
- `tests/v74-customer-backup-cross-branch.test.js` — T4
- `tests/v74-customer-backup-subcollections.test.js` — T5
- `tests/v74-customer-backup-conflict-resolution.test.js` — T6
- `tests/v74-customer-backup-audit-immutable.test.js` — T7
- `tests/v74-customer-backup-tampering.test.js` — T8
- `tests/v74-customer-backup-concurrency-failure.test.js` — T9
- `tests/v74-backup-manager.test.js` — T10
- `scripts/e2e-customer-backup-restore-roundtrip-real-prod.mjs`
- `scripts/e2e-customer-backup-tampering-real-prod.mjs`
- `scripts/e2e-backup-manager-cleanup-real-prod.mjs`

### MODIFIED files

- `src/components/backend/CustomerDetailView.jsx` — add "💾 สำรองข้อมูล" button to header
- `src/lib/tabPermissions.js` — add `customer-data-recovery: { adminOnly: true }` + `backup-manager: { adminOnly: true }`
- `nav/navConfig.js` — add new nav entries under "ระบบ" admin section
- `src/pages/BackendDashboard.jsx` — lazy import + render case for new tabs
- `firestore.rules` — (review) if any be_* read rule changes needed (likely none — admin SDK bypasses)
- `storage.rules` — add `backups/customers/{customerId}/{file=**}` admin-only match (mirror V40 `backups/branches/...` pattern); Rule B Probe-Deploy-Probe extends to include probe #11 for customer-backups path
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — add AV52-AV55 invariants
- `.agents/skills/audit-cascade-logic/SKILL.md` — extend with subcollection-cascade discipline
- `tests/branch-collection-coverage.test.js` — add classification for `be_recalls` if missing
- `tests/backend-nav-config.test.js` — update count after 2 new tabs
- `tests/phase11-master-data-scaffold.test.jsx` — update count after 2 new admin tabs

### DOCS

- This file (spec)
- Plan file (next via writing-plans skill)
- `.claude/rules/00-session-start.md` — Add V74 compact entry post-ship
- `.claude/rules/v-log-archive.md` — Add verbose V74 entry post-ship
- SESSION_HANDOFF.md + .agents/active.md — update post-ship

---

## 13. Rollout (NO DEPLOY until L1 verified per Rule Q)

### Phase 1: Build + unit/integration tests (this design's scope)

1. Subagent-driven build per writing-plans output (~22 tasks expected; 2-stage review per task)
2. All 10 test categories GREEN
3. `npm test -- --run` full suite GREEN (Rule N batch-end)
4. `npm run build` clean

### Phase 2: Pre-deploy Rule Q L2

1. `vercel env pull .env.local.prod --environment=production` (Rule R standing auth)
2. Run e2e scripts against REAL prod with TEST-V74-CUSTOMER-* fixtures
3. Verify: round-trip byte-equal across 3 e2e scenarios on real prod
4. Cleanup: confirmed zero orphans + audit doc emit

### Phase 3: Deploy (REQUIRES USER "deploy" VERB — V18)

1. Combined: `vercel --prod --yes` + `firebase deploy --only firestore:rules,storage:rules`
2. Rule B Probe-Deploy-Probe with NEW probe #11 (anon write to `backups/customers/{cid}/...` → expect 401/403)
3. Cleanup probe artifacts

### Phase 4: Rule Q L1 hands-on by user (NON-NEGOTIABLE before "verified" claim)

Per Section 9 — 6 hands-on checks. User confirms each in writing OR finds bugs to iterate on.

### Phase 5: V74 V-entry + active.md update + close

Only after L1 confirmed.

---

## 14. Open questions

**None.** Q1-Q6 all locked with user during brainstorming.

If issues surface during writing-plans, this spec gets revised + re-reviewed.

---

## 15. References

- Phase 24.0 cascade endpoint: [api/admin/delete-customer-cascade.js](../../../api/admin/delete-customer-cascade.js)
- Phase 24.0 design: `docs/superpowers/specs/2026-05-06-customer-delete-button-design.md`
- V40 branch backup: `docs/superpowers/specs/2026-05-07-branch-backup-restore-make-fresh-design.md`
- V40 file schema: [src/lib/branchBackupSchema.js](../../../src/lib/branchBackupSchema.js)
- V40 core helpers: [src/lib/branchBackupCore.js](../../../src/lib/branchBackupCore.js)
- V40 bucket schema: [src/lib/branchBackupBuckets.js](../../../src/lib/branchBackupBuckets.js)
- V15 central stock backup: `docs/superpowers/specs/2026-05-14-selective-make-fresh-and-backup-integrity-design.md`
- V15 central stock impl: `docs/superpowers/specs/2026-05-15-central-stock-make-fresh-and-integrity-design.md`
- V66 trust-collapse origin (Rule Q): `.claude/rules/00-session-start.md` § 1 Rule Q + `.claude/rules/v-log-archive.md` V66 entry
- Iron-clad rules: `.claude/rules/01-iron-clad.md`
- AV invariant table: `.agents/skills/audit-anti-vibe-code/SKILL.md`
