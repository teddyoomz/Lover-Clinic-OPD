# Branch Backup / Restore / Make-Fresh — Design Spec

**Date**: 2026-05-07
**Author**: brainstorming session, user-driven
**Status**: design approved; implementation plan pending

---

## 1. Problem statement

Clinic admin needs:

1. **Backup/Restore system** — selectable scope of branch-scoped data exported to a file, restorable later. Full backup-then-restore = exact branch state cloned ("Clone").
2. **"Make Fresh" button** — one-click admin action that wipes all branch-scoped data for a selected branch, returning it to "new branch" state. Universal data (clinic-wide) untouched.

Both are admin-only operations. Both share infrastructure (branch-scope enumeration, admin gate, audit trail).

## 2. Locked design decisions (Q&A)

| # | Question | Decision |
|---|---|---|
| Q1 | Restore mode | **Both** — same-branch overwrite (preserve docIds) AND cross-branch clone (re-mint docIds). Backup file records `meta.sourceBranchId`; admin chooses mode on import. |
| Q2 | Selection granularity | **Tier groups (default) + Advanced per-collection expand**. UI shows 4 tier checkboxes; "Advanced ▾" reveals ~38 per-collection toggles. |
| Q3 | Backup file storage | **Firebase Storage + local download**. Auto-save to `gs://...backups/{branchId}/{ts}-{rand}.json` AND offer signed-URL browser download. |
| Q4 | Cross-branch clone scope | **T1 master/setup ONLY**. T2/T3/T4 disabled in clone mode (UI greys out + tooltip). Same-branch restore allows full T1+T2+T3+T4. |
| Q5 | Make-Fresh safety | **Type-branch-name confirmation + auto-pre-fresh backup BEFORE wipe**. Recoverable safety net: admin can immediately restore from `auto-pre-fresh-{ts}.json`. |
| Q6 | Permission gate | **Admin-only for all 4 actions** (backup, restore-same, restore-clone, make-fresh). Retention = keep forever + manual delete via Backups tab. |

## 3. Collection scope matrix

### In scope (branch-scoped — operated on by all 4 actions)

```
T1 — Master/Setup (~14 collections, low volume)
  be_products                  be_promotions
  be_courses                   be_coupons
  be_product_groups            be_vouchers
  be_product_units             be_bank_accounts
  be_medical_instruments       be_expense_categories
  be_holidays                  be_staff_schedules
  be_df_groups
  be_df_staff_rates

T2 — Transactions (~10 collections, high volume)
  be_treatments                be_online_sales
  be_sales                     be_sale_insurance_claims
  be_appointments              be_deposits
  be_quotations                be_link_requests
  be_vendor_sales              be_expenses

T3 — Stock state + ledger (~6 collections; be_stock_movements is V34-immutable audit ledger)
  be_stock_batches             be_stock_transfers
  be_stock_movements           be_stock_withdrawals
  be_stock_orders              be_stock_adjustments

T4 — Customer subcollections (per-customer, filtered by branchId)
  be_customers/{customerId}/treatments
                            /sales
                            /appointments
                            /deposits
                            /wallets
                            /memberships
                            /points
                            /courseChanges
```

### Out of scope (universal — never touched)

`be_customers` (root docs), `be_staff`, `be_doctors`, `be_branches`, `be_permission_groups`, `be_wallet_types`, `be_membership_types`, `be_medicine_labels`, `be_document_templates`, `be_audiences`, `be_central_stock_*`, `be_vendors`, `system_config`, `clinic_settings`, `chat_conversations`, `be_admin_audit`.

## 4. Backup pipeline

### UI

NEW tab `📦 Backup สาขา` in `BackendDashboard.jsx`. Gated via `tabPermissions.js` admin-only.

**Layout** (2 sections in tab):

1. **สร้าง Backup**
   - Branch picker (defaults to currently selected branch)
   - Tier checkboxes T1/T2/T3/T4 (all on by default)
   - "Advanced ▾" disclosure → ~38 per-collection toggles with select-all/none
   - Live size estimate ("~5 MB based on doc counts")
   - "เริ่ม Backup" button

2. **Backups ที่มี**
   - Table of files in `gs://...backups/{branchId}/*` for the picked branch
   - Columns: timestamp, scope summary (e.g., "T1+T2+T3+T4"), size, action menu (Download / Restore / Delete)
   - Filter: hide auto-pre-fresh by default; toggle "show auto" to include

### Endpoint

`POST /api/admin/branch-backup-export`

**Request body**:
```json
{
  "branchId": "BR-1777885958735-38afbdeb",
  "tiers": ["T1", "T2", "T3", "T4"],
  "collections": null,
  "isAutoPreFresh": false
}
```
- `collections` overrides `tiers` if provided (Advanced mode)
- `isAutoPreFresh` flags the file for filename + filtering in Backups list

**Auth**: `verifyAdminToken` (existing `_lib/adminAuth.js`)

**Pipeline**:
1. Resolve in-scope collection list from tiers/collections + BSA matrix
2. For each collection: admin-SDK `getDocs(...where('branchId','==',branchId))` (T1-T3) or per-customer subcollection-with-branchId-filter (T4)
3. Stream into JSON structure:
   ```json
   {
     "meta": {
       "schemaVersion": 1,
       "sourceBranchId": "BR-...",
       "exportedAt": "2026-05-07T...",
       "exportedBy": "admin-uid",
       "scope": { "tiers": [...], "collections": [...] },
       "perCollectionCounts": { "be_products": 619, ... }
     },
     "collections": {
       "be_products": [...],
       "be_courses": [...],
       ...
       "be_customers/{cid}/treatments": [...]
     }
   }
   ```
4. Upload to Firebase Storage at `backups/{branchId}/{filename}.json` via admin SDK
   - filename = `${isAutoPreFresh ? 'auto-pre-fresh' : 'manual'}-${ts}-${randHex(8)}.json`
5. Generate signed URL (24h validity) for browser download
6. Audit doc: `be_admin_audit/branch-backup-${ts}-${randHex()}` — Rule M canonical
7. Response: `{ ok: true, signedUrl, storagePath, auditId, sizeBytes, perCollectionCounts }`

**File size guard**: error if total > 100 MB (sanity limit; very mature branches near this need pagination — defer to v2).

## 5. Restore pipeline

### UI

Same Backup tab → "Restore" sub-section. Two entry points:

**(a) Pick from cloud** — admin clicks Restore on a row in "Backups ที่มี" table. Mode auto-defaults to same-branch overwrite (since `meta.sourceBranchId` matches selected branch).

**(b) Upload local file** — admin uploads a `.json` file (admin's off-cloud archive). Server validates schema, then shows mode picker.

**Mode toggle** (after file selected):
- ⦿ **Restore เดิม (overwrite by ID)** — branchId of file === branchId of UI selection. T1+T2+T3+T4 all restorable.
- ⦿ **Clone ไปสาขาอื่น (T1 only)** — only enabled when target ≠ source. T2/T3/T4 toggles auto-disable + tooltip "ใช้ได้เฉพาะ Restore เดิม per Phase BSA design (transactions/stock/history are inherently per-branch)".

**Confirmation modal** — shows scope summary + counts ("จะ overwrite 619 products, 537 courses, ..."), requires "Confirm" click.

### Endpoint

`POST /api/admin/branch-restore`

**Request body**:
```json
{
  "mode": "overwrite",
  "sourceStoragePath": "backups/BR-.../manual-...-....json",
  "uploadedFileBase64": null,
  "targetBranchId": "BR-...",
  "scopeOverride": null
}
```
- One of `sourceStoragePath` (cloud pick) or `uploadedFileBase64` (local upload, base64 ≤100MB) MUST be set
- `scopeOverride` lets admin restore subset of file's contents (e.g., file has T1+T2 but admin only wants T1 today)

**Pipeline (overwrite mode)**:
1. Read file from Storage (or decode base64)
2. Validate `meta.schemaVersion === 1`; reject unknown future versions
3. Validate `meta.sourceBranchId === targetBranchId` for overwrite mode (server-enforced; client UI pre-locks this)
4. For each in-scope collection:
   - Iterate docs → admin-SDK `batch.set(docRef, doc, {merge:false})` preserving docIds
   - Chunk into 400-write batches (Firestore limit 500 ops; 400 = headroom)
5. Audit doc with before/after diffs

**Pipeline (clone mode, T1 only)**:
1. Validate `mode === 'clone' && scope ⊆ T1`
2. For each T1 collection:
   - Resolve target's existing dedup keys (per `cross-branch-import.js` adapter `dedupKey()`)
   - For each source doc:
     - Skip if dedupKey already exists in target (logged in audit)
     - Else: mint new docId via `${entity}_${ts}_${randHex(4).toUpperCase()}` (matches V39 cross-branch-import pattern)
     - Apply adapter `clone(item, targetBranchId, adminUid)` — strips stray `id`, restamps branchId, writes canonicalIdField
     - Write via `batch.set(colRef.doc(newId), cloned)`
3. **FK remap** for cross-collection refs (e.g., be_courses.items[].productId → be_products): build `(sourceProductId → newProductId)` lookup map per V39 adapter `fkRefs()`; rewrite source courses' product refs before write
4. Audit doc records skipped-by-dedup + remapped-FK counts

**Atomicity**: per-collection batched commits; if any batch fails, audit records partial-write state. Idempotent re-run: overwrite mode is naturally idempotent (same docIds + same data); clone mode dedup-skips already-imported docs.

## 6. Make-Fresh pipeline

### UI

NEW button `🆕 ทำให้เป็นสาขาใหม่` on each branch row in `BranchesTab.jsx`.

**Visibility**: only when `useTabAccess().isAdmin === true`. Hidden from non-admin entirely (not just disabled).

**Confirmation modal** (multi-stage):

**Stage 1 — preview**:
- Branch name displayed prominently
- Live counts: "จะลบ: 619 สินค้า, 537 คอร์ส, 122 รักษา, 45 นัด, ... (รวม XXXX docs)"
- Warning banner: "การกระทำนี้จะลบทุกข้อมูลที่ไม่ universal ของสาขานี้ พร้อมประวัติทั้งหมด — ระบบจะสำรอง backup อัตโนมัติก่อนลบ คุณสามารถ Restore กลับได้จาก Backups ที่มี"

**Stage 2 — confirmation**:
- Text input: `พิมพ์ชื่อสาขา "พระราม 3" เพื่อยืนยัน`
- Submit button DISABLED until input matches branch name verbatim
- Cancel button always enabled

**Stage 3 — execution** (after submit):
- Phase 1 progress: "1/2 กำลังสำรอง..." → calls `/api/admin/branch-backup-export` with `tiers: ['T1','T2','T3','T4']` + `isAutoPreFresh: true`
- Phase 2 progress: "2/2 กำลังลบ..." → calls `/api/admin/branch-make-fresh` with `autoBackupRef` from phase 1
- Result panel: "✓ เสร็จสิ้น — สาขา [name] ถูกลบทั้งหมดแล้ว สำรอง: [storagePath] (กดเพื่อดู Backups)"

### Endpoint

`POST /api/admin/branch-make-fresh`

**Request body**:
```json
{
  "branchId": "BR-...",
  "autoBackupRef": "backups/BR-.../auto-pre-fresh-...-....json"
}
```

**Pre-conditions** (server-enforced):
- `verifyAdminToken` passes
- `autoBackupRef` MUST exist in Storage. Server checks via `bucket.file(...).exists()`. If missing, return 400 "AUTO_BACKUP_REQUIRED".

**Pipeline**:
1. Resolve full T1+T2+T3+T4 collection list from BSA matrix
2. For each collection:
   - Query `where('branchId','==',branchId)` (T1-T3) or per-customer subcollection-with-branchId-filter (T4)
   - For each doc: `batch.delete(docRef)` chunked at 400/batch
3. Audit doc: `be_admin_audit/branch-make-fresh-${ts}-${randHex()}` with `{ branchId, autoBackupRef, deletedCounts: { be_products: N, ... }, deletedAt, performedBy }`
4. Response: `{ ok: true, deletedCounts, autoBackupRef, auditId }`

**Idempotency**: re-run yields 0 deletes (collections already empty). Audit is per-call.

**Concurrent-call safety**: optional per-branch lock doc at `system_config/branch-locks/{branchId}` with TTL — first request takes lock, second returns 409 "BRANCH_OPERATION_IN_PROGRESS". Defer to implementation; not blocker for v1.

## 7. Storage rules + Probe-Deploy-Probe

### `storage.rules` add

```
match /backups/{branchId=**} {
  allow read, write, delete: if request.auth.token.admin == true;
}
```

(Pattern `{branchId=**}` allows nested paths under `backups/{branchId}/...`)

### Probe-Deploy-Probe addition (Rule B)

Pre/post-deploy probes for Storage rules:
1. Negative probe: anonymous Bearer call to `gs://.../backups/test-probe.json` → expect 403
2. Positive probe: admin token write to `gs://.../backups/TEST-PROBE-{ts}.json` → expect 200, then read + delete
3. Add to `.claude/rules/01-iron-clad.md` Rule B as 7th endpoint

## 8. Audit / forensic-trail / Rule M

Every action writes a Rule-M-canonical audit doc to `be_admin_audit`:

| Action | Audit doc id pattern | Key fields |
|---|---|---|
| Backup export | `branch-backup-{ts}-{hex}` | `branchId, scope, perCollectionCounts, fileSizeBytes, storagePath, signedUrl(masked), exportedBy, schemaVersion, isAutoPreFresh` |
| Restore overwrite | `branch-restore-overwrite-{ts}-{hex}` | `sourceStoragePath, targetBranchId, scope, perCollectionCounts, beforeCounts, afterCounts, executedBy` |
| Restore clone | `branch-restore-clone-{ts}-{hex}` | Above + `dedupSkippedCount, fkRemappedCount, sourceBranchId, targetBranchId` |
| Make-Fresh | `branch-make-fresh-{ts}-{hex}` | `branchId, autoBackupRef, deletedCounts, executedBy` |

Crypto-secure rand: `randomBytes(8).hex` for the `{hex}` suffix.

Rules already block update/delete on `be_admin_audit`. Doc creation via firebase-admin SDK bypasses client-write rule (admin SDK bypasses all rules).

## 9. Edge cases + invariants

| Concern | Handling |
|---|---|
| `be_stock_movements` immutability (V34) on same-branch restore | OK — overwriting movements WITH historical movements that existed at backup time is restoring known-good state, not fabricating. Audit records the snapshot ts. |
| Cross-branch clone FK remap | Re-uses V39 `cross-branch-import.js` adapter pattern + `canonicalIdField` stamp + FK dedup-key matching. Skip dup-name items per adapter `dedupKey`. |
| T4 customer subcollections — restore for orphan customers | If source backup contains subcollections for customerId X but target has no `be_customers/X` doc (e.g., customer was deleted), skip those docs + report in audit `orphanCustomerSubdocs` array. |
| Backup file > Firestore 1MB limit | N/A — stored in Firebase Storage (up to 5GB per file). Firestore only stores audit metadata. |
| File size > 100MB | Server returns 413 "FILE_TOO_LARGE". v1 limit; raise + add streaming-restore for v2. |
| Schema evolution | `meta.schemaVersion` field. Restore endpoint rejects unknown future versions with 400. v1 = `1`. |
| Concurrent Make-Fresh on same branch | Optional per-branch lock at `system_config/branch-locks/{branchId}` with serverTimestamp + TTL via Cloud Function. Defer; v1 ships without lock. |
| Time-travel restore (file from 6 months ago) restoring to active branch | Audit warns "source backup age > 90 days; verify foreign keys to universal collections (staff, products) still exist". |
| Customer subcollection restore creates docs at non-existent paths | Admin SDK creates parent docs implicitly; safe. |
| Network interruption mid-restore | Atomic per-batch commit; partial failure logged in audit; admin can re-run (idempotent overwrite). |
| Mode mismatch (file says `sourceBranchId=A` but UI selected target `B` for overwrite) | Server rejects with 400 "MODE_MISMATCH"; client UI pre-locks toggle. |

## 10. Rule M canonical CLI scripts (parallel to UI)

For dev-time + emergency use, ship matching admin-SDK CLI scripts:

- `scripts/branch-backup-export.mjs --branch=<id> [--tiers=T1,T2,T3,T4] [--collections=be_products,be_courses]`
- `scripts/branch-restore.mjs --file=<path> --mode=overwrite|clone [--target=<branchId>]`
- `scripts/branch-make-fresh.mjs --branch=<id>` (with same auto-backup discipline)

Scripts share core logic with endpoints via a common helper module `src/lib/branchBackupCore.js` (re-exports admin-SDK-agnostic primitives).

## 11. Out of scope (deferred to v2+)

- **Auto-retention** of old backups (v1 = manual delete only)
- **Diff/preview before restore** ("this will overwrite N docs")
- **Schema migration** between versions (v1 has only schemaVersion=1)
- **Encryption at rest beyond Storage default** (Firebase Storage encrypts; admin-only access via rules)
- **Cross-tenant backup** — N/A (single-tenant clinic)
- **Streaming restore** for files > 100MB
- **Per-branch concurrent-op lock** (race condition with admin-SDK is rare; admin operates serially)

## 12. Test coverage plan

Per Rule I (full-flow simulate at sub-phase end) + V34 lock (preview_eval against real Firestore for stock paths):

| Test file | Scope |
|---|---|
| `tests/branch-backup-export-helper.test.js` | Pure helpers: tier-to-collection resolver, scope validator, JSON shape builder, FK remap helper |
| `tests/branch-restore-helper.test.js` | Mode validator (overwrite vs clone scope guard), schemaVersion check, dedup-skip helper |
| `tests/branch-make-fresh-helper.test.js` | Pre-condition checker (autoBackupRef exists), wipe-list builder, T4 customer iteration |
| `tests/branch-backup-flow-simulate.test.js` (Rule I) | Chain: export → import overwrite → diff is zero (round-trip) |
| `tests/branch-clone-flow-simulate.test.js` (Rule I) | Chain: export source → import clone target → target has expected counts + branchId stamp + FK remap correctness |
| `tests/branch-make-fresh-flow-simulate.test.js` (Rule I) | Chain: pre-fresh state → make-fresh → 0 docs in any branch-scoped collection for branch + auto-backup file exists in Storage |
| `scripts/e2e-branch-backup-restore.mjs` | Live admin-SDK e2e on real prod with TEST-prefixed test branch + cleanup |

## 13. Implementation order (high-level — full plan in writing-plans)

Phase 1 — Helpers + types
- `src/lib/branchBackupCore.js` — tier matrix, scope resolver, FK remap helpers
- `src/lib/branchBackupSchema.js` — schemaVersion, JSON validators

Phase 2 — Endpoints
- `api/admin/branch-backup-export.js`
- `api/admin/branch-restore.js`
- `api/admin/branch-make-fresh.js`

Phase 3 — Storage rules + Rule B probe extension
- `storage.rules` update
- `.claude/rules/01-iron-clad.md` Rule B probe list extension

Phase 4 — UI
- NEW `src/components/backend/BranchBackupTab.jsx` (in BackendDashboard)
- NEW `src/components/backend/MakeFreshButton.jsx` (in BranchesTab row)
- NEW `src/components/backend/MakeFreshModal.jsx` (multi-stage confirmation)
- Permission key `branch_backup_admin` (or just gate on `isAdmin`)
- nav config + tabPermissions update

Phase 5 — Tests + Rule I flow-simulate
- Unit + integration + e2e per Section 12

Phase 6 — CLI scripts
- `scripts/branch-backup-export.mjs`
- `scripts/branch-restore.mjs`
- `scripts/branch-make-fresh.mjs`

Phase 7 — V40 entry + AV-* invariant
- V40 in `00-session-start.md` + verbose in `v-log-archive.md`
- New audit invariant for "destructive ops require auto-backup ref"

## 14. Approval state

- Design Q1-Q6 locked via brainstorming session 2026-05-07
- Spec self-reviewed: no TBD/TODO; internal consistency verified; scope = single implementation plan; no ambiguity flags
- Pending: user review of this spec → invoke writing-plans skill

---

**Decided**: 2026-05-07. **Spec status**: ready for user review → writing-plans.
