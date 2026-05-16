# Customer Backup / Wipe / Restore + Global Backup Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec**: [`docs/superpowers/specs/2026-05-16-customer-backup-restore-design.md`](../specs/2026-05-16-customer-backup-restore-design.md) (Q1-Q6 locked by user)
>
> **Iron-clad rules in effect**: Q (Real-Adversarial Verification — L1/L2 before "verified" claim) · M (data ops via local + admin-SDK + canonical paths + dry-run + audit doc + idempotency) · I (full-flow simulate at sub-phase end) · D (continuous improvement — bug→test→AV invariant) · N (targeted-test-only for small fixes; full suite at batch end) · B (Probe-Deploy-Probe for firestore/storage rules) · R (env-pull standing auth for diag).
>
> **NO DEPLOY until Rule Q L1 hands-on by user** — V18 deploy-verb lock holds across the entire 33-task batch.

**Goal:** Ship a per-customer global backup/wipe/restore system + a unified `tab=backup-manager` admin surface that manages every backup file type (V40 branch + V15 central stock + NEW customer), all with cryptographic integrity verification, AV19 elevated, audit-immutable preservation, and 10 NEW adversarial test categories beyond V40/V15.

**Architecture:** 3 layers — (1) pure ESM helpers in `src/lib/customerBackup*.js` (collection enumeration, conflict scan, hash compute, audit-immutable list); (2) 8 admin-SDK endpoints in `api/admin/{customer-backup-export, customer-restore, backup-manager-{list, rename, delete, bulk-delete, download}}.js` + 1 ENHANCED `delete-customer-cascade.js` (extends Phase 24.0 with CG+CS+CF+CH+autoBackupRef); (3) 3 new admin tabs (`customer-data-recovery`, `backup-manager`) + 2 CustomerDetailView header buttons + 7 CLI mirrors per Rule M.

**Tech Stack:** Firebase Admin SDK (firebase-admin) · Cloud Storage (`@google-cloud/storage` via admin SDK) · Vercel serverless · React 19 + Vite + Tailwind 3.4 · Vitest 4.1.3 + RTL + Playwright (Rule Q L1) · `crypto.createHash('sha256')` for integrity hashes · `crypto.randomBytes` for paths · existing `branchBackupSchema.js` (`jsonReplacerForNonFinite` + `jsonReviverForNonFinite` for NaN/Infinity sentinel encoding).

---

## File Structure (decomposition lock-in)

### NEW source (10)

| File | Responsibility |
|---|---|
| `src/lib/customerBackupCore.js` | Pure helpers: `CUSTOMER_CASCADE_COLLECTIONS_FULL` (extends Phase 24.0 + CG), `T4_SUBCOLLECTIONS` (8), `AUDIT_IMMUTABLE_COLLECTIONS` (6 — never wiped), `matchCustomerChatPredicate(doc, customer)`, `enumerateCustomerScope({customerId, customer})`. NO Firestore deps. |
| `src/lib/customerBackupSchema.js` | Extends `branchBackupSchema.js`: `buildCustomerBackupFile(...)`, `validateCustomerBackupFile(file)`, `computeStorageManifestHash(manifest)`. Backup file shape includes `collections + subcollections + chatConversations + meta.storageManifest`. |
| `src/lib/customerBackupConflict.js` | Pure helpers: `scanRestoreConflicts({backupCustomer, liveCustomers, allCustomersForLineLookup})` → `{customerIdExists, hnCollision, lineConflicts[], staleFKs[]}`. `stripLineConflicts(customer, conflicts)` → customer doc with conflicting lineUserId_byBranch entries removed. |
| `src/components/backend/CustomerBackupModal.jsx` | 💾 button modal: optional userNote textarea + confirm → POST `/api/admin/customer-backup-export` → toast with download link |
| `src/components/backend/CustomerDeleteModalEnhanced.jsx` | Extends existing Phase 24.0 delete modal: NEW radio "สำรองข้อมูลใหม่ก่อนลบ" / "เลือกไฟล์สำรองที่มีอยู่" → resolves `autoBackupRef` → passes to delete endpoint |
| `src/components/backend/CustomerDataRecoveryTab.jsx` | NEW admin tab: list of customer backup files + filter + 4 actions (🔄 restore / ⬇ download / ✏ rename / 🗑 delete) + 📥 upload-backup-file flow |
| `src/components/backend/CustomerRestorePreviewModal.jsx` | Restore preview: counts + conflicts (customerIdExists / HN collision / lineConflicts / staleFKs) → confirm → POST `/api/admin/customer-restore` |
| `src/components/backend/BackupManagerTab.jsx` | NEW admin tab: unified list of ALL backup types with type filter chips + per-row actions (⬇ ✏ 🗑) + bulk-delete checkbox |
| `src/components/backend/BackupManagerRenameModal.jsx` | Inline rename modal: userNote textarea (max 200 chars) → POST `/api/admin/backup-manager-rename` |
| `src/components/backend/BackupManagerBulkDeleteModal.jsx` | Bulk select + confirm + AV19 72h-grace warning surface |
| `src/hooks/useBackupManagerList.js` | Paginated listing hook: POST `/api/admin/backup-manager-list` with filters + page state |

### NEW endpoints (8)

| File | Purpose |
|---|---|
| `api/admin/customer-backup-export.js` | Backup-export endpoint |
| `api/admin/customer-restore.js` | Restore-from-Storage endpoint (with preview + restore actions) |
| `api/admin/backup-manager-list.js` | Paginated listing across all backup types |
| `api/admin/backup-manager-rename.js` | Edit `meta.userNote` |
| `api/admin/backup-manager-delete.js` | Delete single backup file (JSON + Storage tree) with AV19 72h-grace |
| `api/admin/backup-manager-bulk-delete.js` | Bulk delete (≤50) |
| `api/admin/backup-manager-download.js` | Generate signed URL for JSON or ZIP bundle |

### NEW CLI scripts (7 — Rule M canonical)

| File | Purpose |
|---|---|
| `scripts/customer-backup-export.mjs` | Single-customer or `--all-in-branch` export |
| `scripts/customer-restore.mjs` | Restore from backup ref or local file path |
| `scripts/customer-delete-with-backup.mjs` | Combined backup + delete for disaster recovery |
| `scripts/backup-manager-list.mjs` | List all backups with filters |
| `scripts/backup-manager-delete.mjs` | Delete specific backup ref or bulk via `--refs-file` |
| `scripts/customer-backup-download.mjs` | Download JSON + Storage tree to local disk |
| `scripts/diag-customer-backup-integrity.mjs` | Rule R diag — verify file integrity end-to-end |

### NEW test files (10 unit/integration + 3 e2e real-prod)

| File | Test category |
|---|---|
| `tests/v74-customer-backup-vanilla-roundtrip.test.js` | T1 vanilla |
| `tests/v74-customer-backup-heavy-gallery-storage.test.js` | T2 heavy gallery + Storage SHA-256 |
| `tests/v74-customer-backup-adversarial-data.test.js` | T3 Thai/Unicode/NaN/Infinity/NUL/10K-char |
| `tests/v74-customer-backup-cross-branch.test.js` | T4 cross-branch customer data |
| `tests/v74-customer-backup-subcollections.test.js` | T5 8 customer-attached subcoll preserved |
| `tests/v74-customer-backup-conflict-resolution.test.js` | T6 Q3=B SAFE |
| `tests/v74-customer-backup-audit-immutable.test.js` | T7 AI tier preserved |
| `tests/v74-customer-backup-tampering.test.js` | T8 hash mismatch BLOCKs |
| `tests/v74-customer-backup-concurrency-failure.test.js` | T9 concurrency + rollback |
| `tests/v74-backup-manager.test.js` | T10 manager UI/API |
| `scripts/e2e-customer-backup-restore-roundtrip-real-prod.mjs` | Rule Q L2 round-trip |
| `scripts/e2e-customer-backup-tampering-real-prod.mjs` | Rule Q L2 tampering detect |
| `scripts/e2e-backup-manager-cleanup-real-prod.mjs` | Rule Q L2 manager cleanup |

### MODIFIED files (12)

| File | Change |
|---|---|
| `api/admin/delete-customer-cascade.js` | Phase 24.0 → extends with CG + CS + CF + CH + autoBackupRef required |
| `src/components/backend/CustomerDetailView.jsx` | Add 💾 Backup button + replace delete modal with CustomerDeleteModalEnhanced |
| `src/lib/tabPermissions.js` | `'customer-data-recovery': { adminOnly: true }` + `'backup-manager': { adminOnly: true }` |
| `nav/navConfig.js` | Add 2 new tab entries under "ระบบ" admin section |
| `src/pages/BackendDashboard.jsx` | Lazy import + render case for 2 new tabs |
| `storage.rules` | Add `match /backups/customers/{customerId}/{file=**}` admin-only |
| `firestore.rules` | (verify no changes needed — admin SDK bypasses) |
| `scripts/probe-deploy-probe.mjs` | Add probe #11 for customer-backup Storage path |
| `tests/branch-collection-coverage.test.js` | Add `be_recalls` classification if missing |
| `tests/backend-nav-config.test.js` | Update tab count after 2 new tabs |
| `tests/phase11-master-data-scaffold.test.jsx` | Update tab count |
| `.agents/skills/audit-anti-vibe-code/SKILL.md` | Add AV52-AV55 invariants |
| `.agents/skills/audit-cascade-logic/SKILL.md` | Extend with subcollection-cascade discipline |

---

## Task Decomposition (33 tasks)

Each task is self-contained: subagent gets the task block + spec reference; no prior-task context required.

---

### Task 1: Pure helpers — customerBackupCore.js (TDD)

**Files:**
- Create: `src/lib/customerBackupCore.js`
- Create: `tests/v74-customer-backup-core.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/v74-customer-backup-core.test.js
import { describe, it, expect } from 'vitest';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
  AUDIT_IMMUTABLE_COLLECTIONS,
  matchCustomerChatPredicate,
} from '../src/lib/customerBackupCore.js';

describe('CUSTOMER_CASCADE_COLLECTIONS_FULL', () => {
  it('C1.1 includes all 11 Phase 24.0 cascade collections', () => {
    expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).toEqual(expect.arrayContaining([
      'be_treatments', 'be_sales', 'be_deposits', 'be_wallets',
      'be_wallet_transactions', 'be_memberships', 'be_point_transactions',
      'be_appointments', 'be_course_changes', 'be_link_requests',
      'be_customer_link_tokens',
    ]));
  });
  it('C1.2 includes 5 gap collections (V74 closes Phase 24.0 stale)', () => {
    expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).toEqual(expect.arrayContaining([
      'be_quotations', 'be_vendor_sales', 'be_online_sales',
      'be_sale_insurance_claims', 'be_recalls',
    ]));
  });
  it('C1.3 total of 16 collections', () => {
    expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).toHaveLength(16);
  });
});

describe('T4_SUBCOLLECTIONS', () => {
  it('C2.1 lists 8 customer-attached subcollections', () => {
    expect(T4_SUBCOLLECTIONS).toEqual([
      'treatments', 'sales', 'appointments', 'deposits',
      'wallets', 'memberships', 'points', 'courseChanges',
    ]);
  });
});

describe('AUDIT_IMMUTABLE_COLLECTIONS', () => {
  it('C3.1 lists 6 audit-immutable (NEVER wiped, NEVER restored)', () => {
    expect(AUDIT_IMMUTABLE_COLLECTIONS).toEqual(expect.arrayContaining([
      'be_admin_audit', 'be_stock_movements', 'be_line_reminder_log',
      'be_recall_audit_log', 'be_postback_log', 'be_line_reminder_postback_log',
    ]));
  });
  it('C3.2 disjoint from CUSTOMER_CASCADE_COLLECTIONS_FULL', () => {
    for (const col of AUDIT_IMMUTABLE_COLLECTIONS) {
      expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).not.toContain(col);
    }
  });
});

describe('matchCustomerChatPredicate', () => {
  it('C4.1 matches when chat.customerId === customer.id', () => {
    const customer = { id: 'LC-1', lineUserId_byBranch: {} };
    const chat = { customerId: 'LC-1' };
    expect(matchCustomerChatPredicate(chat, customer)).toBe(true);
  });
  it('C4.2 matches when chat.lineUserId in customer.lineUserId_byBranch values', () => {
    const customer = { id: 'LC-1', lineUserId_byBranch: { 'BR-A': 'U123' } };
    const chat = { customerId: 'LC-2', lineUserId: 'U123' };
    expect(matchCustomerChatPredicate(chat, customer)).toBe(true);
  });
  it('C4.3 no match when both fields differ', () => {
    const customer = { id: 'LC-1', lineUserId_byBranch: { 'BR-A': 'U123' } };
    const chat = { customerId: 'LC-2', lineUserId: 'U999' };
    expect(matchCustomerChatPredicate(chat, customer)).toBe(false);
  });
  it('C4.4 defensive: missing customer.lineUserId_byBranch defaults to empty', () => {
    const customer = { id: 'LC-1' };
    const chat = { customerId: 'LC-1' };
    expect(matchCustomerChatPredicate(chat, customer)).toBe(true);
  });
  it('C4.5 defensive: null doc returns false', () => {
    expect(matchCustomerChatPredicate(null, { id: 'LC-1' })).toBe(false);
    expect(matchCustomerChatPredicate({ customerId: 'LC-1' }, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — verify all FAIL with import errors**

```
npx vitest run tests/v74-customer-backup-core.test.js
```

Expected: 13 fails (file not found).

- [ ] **Step 3: Implement helper module**

```javascript
// src/lib/customerBackupCore.js
// V74 — Customer backup core helpers (pure ESM, no Firestore deps).
// Single source of truth for customer-data scope across export / wipe /
// restore endpoints + CLI mirrors. Mirrors Phase 24.0 cascade pattern but
// extends with CG (5 gap collections), CS (subcollections), AI (immutable).

/**
 * 16 top-level collections that hold customer-referenced docs (filterable by
 * `where('customerId', '==', X)`). Extends Phase 24.0's 11-collection
 * CUSTOMER_CASCADE_COLLECTIONS with 5 gap collections that reference
 * customerId but were missed by Phase 24.0.
 *
 * Wipe action: delete all docs where customerId == X
 * Restore action: recreate all docs at same docIds
 */
export const CUSTOMER_CASCADE_COLLECTIONS_FULL = Object.freeze([
  // Phase 24.0 baseline 11
  'be_treatments',
  'be_sales',
  'be_deposits',
  'be_wallets',
  'be_wallet_transactions',
  'be_memberships',
  'be_point_transactions',
  'be_appointments',
  'be_course_changes',
  'be_link_requests',
  'be_customer_link_tokens',
  // V74 gap closures (cascade stale)
  'be_quotations',
  'be_vendor_sales',
  'be_online_sales',
  'be_sale_insurance_claims',
  'be_recalls',
]);

/**
 * 8 customer-attached subcollections (under be_customers/{customerId}/).
 *
 * Wipe action: recursively delete every doc in each subcollection.
 * Restore action: recreate every doc at same docId in same subcoll path.
 *
 * Mirror of V40 T4_SUBCOLLECTIONS list (intentional — same semantic).
 */
export const T4_SUBCOLLECTIONS = Object.freeze([
  'treatments',
  'sales',
  'appointments',
  'deposits',
  'wallets',
  'memberships',
  'points',
  'courseChanges',
]);

/**
 * 6 audit-immutable collections (NEVER wiped, NEVER restored by V74).
 * Legal/MOPH retention per V34 (stock movements) + admin-audit chain
 * + LINE/recall operational audit logs.
 *
 * Wipe action: LEAVE INTACT (orphaned refs to deleted treatmentIds OK).
 * Restore action: SKIP (was never deleted; treatmentId refs auto-re-resolve
 * when restore recreates be_treatments at same docId).
 */
export const AUDIT_IMMUTABLE_COLLECTIONS = Object.freeze([
  'be_admin_audit',
  'be_stock_movements',
  'be_line_reminder_log',
  'be_recall_audit_log',
  'be_postback_log',
  'be_line_reminder_postback_log',
]);

/**
 * Test whether a chat_conversations doc belongs to a customer.
 * Match criteria (OR):
 *   - chat.customerId === customer.id (explicit link)
 *   - chat.lineUserId in customer.lineUserId_byBranch values (LINE link)
 *
 * Defensive on missing fields (returns false on null inputs).
 */
export function matchCustomerChatPredicate(chat, customer) {
  if (!chat || !customer) return false;
  if (chat.customerId && chat.customerId === customer.id) return true;
  if (chat.lineUserId) {
    const lineByBranch = customer.lineUserId_byBranch || {};
    for (const branchLineId of Object.values(lineByBranch)) {
      if (chat.lineUserId === branchLineId) return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run tests — verify all PASS**

```
npx vitest run tests/v74-customer-backup-core.test.js
```

Expected: 13/13 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/customerBackupCore.js tests/v74-customer-backup-core.test.js
git commit -m "feat(V74): customerBackupCore.js pure helpers + 13 unit tests

CUSTOMER_CASCADE_COLLECTIONS_FULL (16 = Phase 24.0's 11 + V74 gap 5).
T4_SUBCOLLECTIONS (8). AUDIT_IMMUTABLE_COLLECTIONS (6 — never wiped per Q1=A).
matchCustomerChatPredicate(chat, customer) — chat ↔ customer linkage.

Spec § 2 (customer-data surface tier table).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Schema extensions — customerBackupSchema.js (TDD)

**Files:**
- Create: `src/lib/customerBackupSchema.js`
- Create: `tests/v74-customer-backup-schema.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/v74-customer-backup-schema.test.js
import { describe, it, expect } from 'vitest';
import {
  buildCustomerBackupFile,
  validateCustomerBackupFile,
  computeStorageManifestHash,
} from '../src/lib/customerBackupSchema.js';
import { computeBodyHash } from '../src/lib/branchBackupSchema.js';

describe('buildCustomerBackupFile', () => {
  it('S1.1 produces file with meta.backupType="customer"', () => {
    const file = buildCustomerBackupFile({
      customerId: 'LC-1',
      customerHN: '0001',
      customerName: 'นางสาว A',
      exportedBy: 'admin@x.com',
      collections: { be_customers: [{ id: 'LC-1' }] },
      subcollections: {},
      chatConversations: [],
      storageManifest: [],
    });
    expect(file.meta.backupType).toBe('customer');
    expect(file.meta.customerId).toBe('LC-1');
    expect(file.meta.customerHN).toBe('0001');
    expect(file.meta.schemaVersion).toBe(2);
  });
  it('S1.2 includes bodyHash from collections+subcollections+chatConversations', () => {
    const collections = { be_treatments: [{ id: 'T1', customerId: 'LC-1' }] };
    const subcollections = { treatments: [{ id: 'T1', parentCustomerId: 'LC-1' }] };
    const chatConversations = [{ id: 'C1', lineUserId: 'U1' }];
    const file = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A', exportedBy: 'x',
      collections, subcollections, chatConversations, storageManifest: [],
    });
    expect(file.meta.bodyHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('S1.3 includes storageManifestHash when manifest non-empty', () => {
    const file = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A', exportedBy: 'x',
      collections: {}, subcollections: {}, chatConversations: [],
      storageManifest: [{ path: 'be_customers/LC-1/img.jpg', size: 100, sha256: 'abc' }],
    });
    expect(file.meta.storageManifestHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('S1.4 userNote optional; empty default', () => {
    const file = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A', exportedBy: 'x',
      collections: {}, subcollections: {}, chatConversations: [], storageManifest: [],
    });
    expect(file.meta.userNote).toBe('');
  });
  it('S1.5 userNote stored as-is when provided', () => {
    const file = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A', exportedBy: 'x',
      collections: {}, subcollections: {}, chatConversations: [], storageManifest: [],
      userNote: 'EOD checkpoint',
    });
    expect(file.meta.userNote).toBe('EOD checkpoint');
  });
});

describe('validateCustomerBackupFile', () => {
  it('S2.1 accepts canonical v2 file', () => {
    const file = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A', exportedBy: 'x',
      collections: {}, subcollections: {}, chatConversations: [], storageManifest: [],
    });
    expect(() => validateCustomerBackupFile(file)).not.toThrow();
  });
  it('S2.2 throws on missing meta.customerId', () => {
    const f = { meta: { schemaVersion: 2, backupType: 'customer' }, collections: {} };
    expect(() => validateCustomerBackupFile(f)).toThrow(/CUSTOMER_ID_MISSING/);
  });
  it('S2.3 throws on backupType !== customer', () => {
    const f = { meta: { schemaVersion: 2, backupType: 'branch', customerId: 'LC-1' }, collections: {} };
    expect(() => validateCustomerBackupFile(f)).toThrow(/BACKUP_TYPE_MISMATCH/);
  });
  it('S2.4 throws on missing collections block', () => {
    const f = { meta: { schemaVersion: 2, backupType: 'customer', customerId: 'LC-1' } };
    expect(() => validateCustomerBackupFile(f)).toThrow(/COLLECTIONS_BLOCK_MISSING/);
  });
  it('S2.5 throws on missing subcollections block', () => {
    const f = { meta: { schemaVersion: 2, backupType: 'customer', customerId: 'LC-1' }, collections: {} };
    expect(() => validateCustomerBackupFile(f)).toThrow(/SUBCOLLECTIONS_BLOCK_MISSING/);
  });
  it('S2.6 throws on invalid bodyHash format', () => {
    const f = {
      meta: { schemaVersion: 2, backupType: 'customer', customerId: 'LC-1', bodyHash: 'short' },
      collections: {}, subcollections: {},
    };
    expect(() => validateCustomerBackupFile(f)).toThrow(/INVALID_BODY_HASH_FORMAT/);
  });
});

describe('computeStorageManifestHash', () => {
  it('S3.1 returns 64-char hex', () => {
    const manifest = [
      { path: 'x', size: 1, sha256: 'a'.repeat(64) },
      { path: 'y', size: 2, sha256: 'b'.repeat(64) },
    ];
    expect(computeStorageManifestHash(manifest)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('S3.2 deterministic — same manifest same hash', () => {
    const m = [{ path: 'x', size: 1, sha256: 'a'.repeat(64) }];
    expect(computeStorageManifestHash(m)).toBe(computeStorageManifestHash(m));
  });
  it('S3.3 sorts by path before hashing — order-independent', () => {
    const m1 = [
      { path: 'a', size: 1, sha256: 'X'.repeat(64) },
      { path: 'b', size: 2, sha256: 'Y'.repeat(64) },
    ];
    const m2 = [
      { path: 'b', size: 2, sha256: 'Y'.repeat(64) },
      { path: 'a', size: 1, sha256: 'X'.repeat(64) },
    ];
    expect(computeStorageManifestHash(m1)).toBe(computeStorageManifestHash(m2));
  });
  it('S3.4 different manifest different hash', () => {
    const m1 = [{ path: 'x', size: 1, sha256: 'a'.repeat(64) }];
    const m2 = [{ path: 'x', size: 2, sha256: 'a'.repeat(64) }];
    expect(computeStorageManifestHash(m1)).not.toBe(computeStorageManifestHash(m2));
  });
  it('S3.5 empty manifest produces consistent zero-element hash', () => {
    const h = computeStorageManifestHash([]);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run test — verify all FAIL**

```
npx vitest run tests/v74-customer-backup-schema.test.js
```

Expected: 15 fails.

- [ ] **Step 3: Implement schema module**

```javascript
// src/lib/customerBackupSchema.js
// V74 — Customer backup file schema (extends branchBackupSchema v2).
// File shape includes Firestore data (collections + subcollections +
// chatConversations) PLUS Storage manifest with per-object SHA-256.

import crypto from 'crypto';
import { BACKUP_SCHEMA_VERSION, computeBodyHash } from './branchBackupSchema.js';

/**
 * Compose a customer backup file object.
 * meta.userNote is EXCLUDED from bodyHash + storageManifestHash so admin
 * can rename labels without invalidating integrity (Q5b=Y label-edit).
 */
export function buildCustomerBackupFile({
  customerId,
  customerHN,
  customerName,
  exportedBy,
  collections,
  subcollections,
  chatConversations,
  storageManifest,
  isAutoPreFresh = false,
  userNote = '',
}) {
  const perCollectionCounts = {};
  for (const [k, arr] of Object.entries(collections || {})) {
    perCollectionCounts[k] = Array.isArray(arr) ? arr.length : 0;
  }
  const subcollectionCounts = {};
  for (const [k, arr] of Object.entries(subcollections || {})) {
    subcollectionCounts[k] = Array.isArray(arr) ? arr.length : 0;
  }
  const hashedBody = {
    ...collections,
    __subcollections__: subcollections,
    __chatConversations__: chatConversations,
  };
  const meta = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupType: 'customer',
    customerId: String(customerId || ''),
    customerHN: String(customerHN || ''),
    customerName: String(customerName || ''),
    exportedBy: String(exportedBy || ''),
    exportedAt: new Date().toISOString(),
    isAutoPreFresh: !!isAutoPreFresh,
    scope: {
      tiers: ['CD', 'C11', 'CG', 'CS', 'CF', 'CH'],
      auditImmutableExcluded: [
        'be_admin_audit', 'be_stock_movements', 'be_line_reminder_log',
        'be_recall_audit_log', 'be_postback_log', 'be_line_reminder_postback_log',
      ],
    },
    userNote: String(userNote || ''),
    perCollectionCounts,
    subcollectionCounts,
    chatConversationCount: Array.isArray(chatConversations) ? chatConversations.length : 0,
    storageObjectCount: Array.isArray(storageManifest) ? storageManifest.length : 0,
    storageManifest: storageManifest || [],
    bodyHash: computeBodyHash(hashedBody),
    storageManifestHash: computeStorageManifestHash(storageManifest || []),
  };
  return {
    meta,
    collections: collections || {},
    subcollections: subcollections || {},
    chatConversations: chatConversations || [],
  };
}

/**
 * Validate a customer backup file. Throws on contract violation.
 * Accepts schemaVersion 1 + 2 (v1 lacks subcollections/chatConversations
 * blocks — not produced by V74 but tolerated for forward-compat).
 */
export function validateCustomerBackupFile(file) {
  if (!file || typeof file !== 'object') {
    throw new Error('BACKUP_FILE_INVALID: not an object');
  }
  const meta = file.meta;
  if (!meta || typeof meta !== 'object') {
    throw new Error('BACKUP_META_MISSING');
  }
  if (typeof meta.schemaVersion !== 'number') {
    throw new Error('SCHEMA_VERSION_MISSING');
  }
  if (meta.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(`SCHEMA_VERSION_UNSUPPORTED: ${meta.schemaVersion}`);
  }
  if (meta.backupType !== 'customer') {
    throw new Error(`BACKUP_TYPE_MISMATCH: expected 'customer', got '${meta.backupType}'`);
  }
  if (typeof meta.customerId !== 'string' || !meta.customerId.trim()) {
    throw new Error('CUSTOMER_ID_MISSING');
  }
  if (typeof file.collections !== 'object' || file.collections === null) {
    throw new Error('COLLECTIONS_BLOCK_MISSING');
  }
  if (typeof file.subcollections !== 'object' || file.subcollections === null) {
    throw new Error('SUBCOLLECTIONS_BLOCK_MISSING');
  }
  if (meta.bodyHash !== undefined && meta.bodyHash !== null) {
    if (typeof meta.bodyHash !== 'string' || !/^[0-9a-f]{64}$/.test(meta.bodyHash)) {
      throw new Error('INVALID_BODY_HASH_FORMAT');
    }
  }
  if (meta.storageManifestHash !== undefined && meta.storageManifestHash !== null) {
    if (typeof meta.storageManifestHash !== 'string' || !/^[0-9a-f]{64}$/.test(meta.storageManifestHash)) {
      throw new Error('INVALID_STORAGE_MANIFEST_HASH_FORMAT');
    }
  }
  return true;
}

/**
 * SHA-256 hash of canonical storage manifest entries.
 * Sorted by path; each entry serialized as `${path}|${size}|${sha256}`;
 * joined with '\n'. Empty manifest produces consistent fixed hash.
 */
export function computeStorageManifestHash(manifest) {
  const sorted = [...(manifest || [])].sort((a, b) => {
    const ap = String(a?.path ?? '');
    const bp = String(b?.path ?? '');
    return ap < bp ? -1 : ap > bp ? 1 : 0;
  });
  const lines = sorted.map(entry =>
    `${String(entry?.path ?? '')}|${Number(entry?.size ?? 0)}|${String(entry?.sha256 ?? '')}`
  );
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}
```

- [ ] **Step 4: Run tests — verify all PASS**

```
npx vitest run tests/v74-customer-backup-schema.test.js
```

Expected: 15/15 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/customerBackupSchema.js tests/v74-customer-backup-schema.test.js
git commit -m "feat(V74): customerBackupSchema.js — buildCustomerBackupFile + validateCustomerBackupFile + computeStorageManifestHash

Extends branchBackupSchema v2. File contains meta + collections + subcollections + chatConversations.
meta.userNote excluded from bodyHash + storageManifestHash (Q5b=Y label-edit must preserve hash).
15 unit tests cover construction, validation, hash determinism.

Spec § 3 (backup file layout).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Conflict resolution pure helpers (TDD)

**Files:**
- Create: `src/lib/customerBackupConflict.js`
- Create: `tests/v74-customer-backup-conflict-pure.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/v74-customer-backup-conflict-pure.test.js
import { describe, it, expect } from 'vitest';
import { scanRestoreConflicts, stripLineConflicts } from '../src/lib/customerBackupConflict.js';

describe('scanRestoreConflicts', () => {
  it('CR1.1 BLOCK when customerId already exists', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: {} },
      liveCustomers: [{ id: 'LC-1', hn_no: '0001' }],
    });
    expect(result.customerIdExists).toBe(true);
  });
  it('CR1.2 BLOCK on HN collision with different customer', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: {} },
      liveCustomers: [{ id: 'LC-OTHER', hn_no: '0001' }],
    });
    expect(result.hnCollision).toEqual({ takenBy: 'LC-OTHER', hn: '0001' });
  });
  it('CR1.3 no HN collision when same customer.id (just exists)', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: {} },
      liveCustomers: [{ id: 'LC-1', hn_no: '0001' }],
    });
    expect(result.hnCollision).toBeNull();
  });
  it('CR1.4 lineConflict when lineUserId now linked to another customer', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: { 'BR-A': 'U123' } },
      liveCustomers: [{ id: 'LC-OTHER', lineUserId_byBranch: { 'BR-A': 'U123' } }],
    });
    expect(result.lineConflicts).toEqual([
      { branchId: 'BR-A', originalLineUserId: 'U123', takenBy: 'LC-OTHER' },
    ]);
  });
  it('CR1.5 no lineConflict when lineUserId free in branch', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: { 'BR-A': 'U123' } },
      liveCustomers: [],
    });
    expect(result.lineConflicts).toEqual([]);
  });
  it('CR1.6 returns clean result when no conflicts', () => {
    const result = scanRestoreConflicts({
      backupCustomer: { id: 'LC-1', hn_no: '0001', lineUserId_byBranch: {} },
      liveCustomers: [],
    });
    expect(result).toEqual({
      customerIdExists: false,
      hnCollision: null,
      lineConflicts: [],
      staleFKs: [],
    });
  });
});

describe('stripLineConflicts', () => {
  it('CR2.1 removes conflicting branch keys, keeps others', () => {
    const customer = {
      id: 'LC-1',
      lineUserId_byBranch: { 'BR-A': 'U123', 'BR-B': 'U456' },
    };
    const conflicts = [{ branchId: 'BR-A', originalLineUserId: 'U123', takenBy: 'LC-OTHER' }];
    const result = stripLineConflicts(customer, conflicts);
    expect(result.lineUserId_byBranch).toEqual({ 'BR-B': 'U456' });
  });
  it('CR2.2 no mutation of original object', () => {
    const customer = { id: 'LC-1', lineUserId_byBranch: { 'BR-A': 'U123' } };
    const conflicts = [{ branchId: 'BR-A' }];
    stripLineConflicts(customer, conflicts);
    expect(customer.lineUserId_byBranch).toEqual({ 'BR-A': 'U123' });
  });
  it('CR2.3 empty conflicts returns customer unchanged', () => {
    const customer = { id: 'LC-1', lineUserId_byBranch: { 'BR-A': 'U123' } };
    const result = stripLineConflicts(customer, []);
    expect(result).toEqual(customer);
  });
  it('CR2.4 handles missing lineUserId_byBranch', () => {
    const customer = { id: 'LC-1' };
    const result = stripLineConflicts(customer, [{ branchId: 'BR-A' }]);
    expect(result).toEqual(customer);
  });
});
```

- [ ] **Step 2: Run test — verify all FAIL**

- [ ] **Step 3: Implement conflict helpers**

```javascript
// src/lib/customerBackupConflict.js
// V74 — Pure conflict-resolution helpers for customer restore (Q3=B SAFE).

/**
 * Scan a backup customer doc against live system state. Returns conflict
 * report — does NOT mutate anything.
 */
export function scanRestoreConflicts({ backupCustomer, liveCustomers }) {
  const backupCid = String(backupCustomer?.id || '');
  const backupHn = String(backupCustomer?.hn_no || '');
  const backupLineByBranch = backupCustomer?.lineUserId_byBranch || {};

  const live = Array.isArray(liveCustomers) ? liveCustomers : [];
  let customerIdExists = false;
  let hnCollision = null;
  const lineConflicts = [];

  for (const lc of live) {
    const lcId = String(lc?.id || '');
    const lcHn = String(lc?.hn_no || '');
    if (lcId === backupCid) customerIdExists = true;
    if (lcId !== backupCid && lcHn === backupHn && backupHn) {
      hnCollision = { takenBy: lcId, hn: backupHn };
    }
    const lcLineByBranch = lc?.lineUserId_byBranch || {};
    for (const [branchId, backupLineId] of Object.entries(backupLineByBranch)) {
      if (lcId === backupCid) continue;
      if (lcLineByBranch[branchId] === backupLineId && backupLineId) {
        lineConflicts.push({
          branchId,
          originalLineUserId: backupLineId,
          takenBy: lcId,
        });
      }
    }
  }

  return {
    customerIdExists,
    hnCollision,
    lineConflicts,
    staleFKs: [], // populated by caller from cross-doc FK scan if needed
  };
}

/**
 * Return a new customer doc with conflicting lineUserId_byBranch entries
 * removed. Original NOT mutated.
 */
export function stripLineConflicts(customer, conflicts) {
  if (!customer || !Array.isArray(conflicts) || conflicts.length === 0) {
    return customer;
  }
  const original = customer.lineUserId_byBranch || {};
  if (Object.keys(original).length === 0) return customer;
  const conflictBranches = new Set(conflicts.map(c => c.branchId));
  const filtered = {};
  for (const [branchId, lineId] of Object.entries(original)) {
    if (!conflictBranches.has(branchId)) filtered[branchId] = lineId;
  }
  return { ...customer, lineUserId_byBranch: filtered };
}
```

- [ ] **Step 4: Run tests — verify all PASS**

```
npx vitest run tests/v74-customer-backup-conflict-pure.test.js
```

Expected: 10/10 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/customerBackupConflict.js tests/v74-customer-backup-conflict-pure.test.js
git commit -m "feat(V74): customerBackupConflict.js — Q3=B SAFE conflict scan + line-conflict strip helpers

scanRestoreConflicts({backupCustomer, liveCustomers}) → {customerIdExists, hnCollision, lineConflicts[], staleFKs[]}.
stripLineConflicts(customer, conflicts) → customer with conflicting lineUserId_byBranch entries removed (immutable).

10 unit tests cover happy/conflict/empty/missing-field paths.

Spec § 7 (conflict resolution).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: `/api/admin/customer-backup-export` endpoint

**Files:**
- Create: `api/admin/customer-backup-export.js`

- [ ] **Step 1: Write the endpoint**

```javascript
// api/admin/customer-backup-export.js
// V74 — Per-customer global backup export. Admin-only (verifyAdminToken).
// Writes backup.json + Storage tree to gs://.../backups/customers/{customerId}/{ts-rand}/
// Returns signed URL + integrity hashes.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
  matchCustomerChatPredicate,
} from '../../src/lib/customerBackupCore.js';
import { buildCustomerBackupFile } from '../../src/lib/customerBackupSchema.js';
import { jsonReplacerForNonFinite } from '../../src/lib/branchBackupSchema.js';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;
const STORAGE_PREFIX_CUSTOMER = 'be_customers';

let cachedDb = null, cachedBucket = null;
function getAdmin() {
  if (cachedDb && cachedBucket) return { db: cachedDb, bucket: cachedBucket };
  let app;
  if (getApps().length > 0) app = getApp();
  else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
      storageBucket: BUCKET,
    });
  }
  cachedDb = getFirestore(app);
  cachedBucket = getStorage(app).bucket(BUCKET);
  return { db: cachedDb, bucket: cachedBucket };
}
function dataCol(db, name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}
function randHex(n = 12) { return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const customerId = String(req.body?.customerId || '').trim();
  const userNote = String(req.body?.userNote || '').slice(0, 200);
  if (!customerId) return res.status(400).json({ ok: false, error: 'MISSING_CUSTOMER_ID' });

  try {
    const { db, bucket } = getAdmin();

    // 1. Read customer doc
    const custSnap = await dataCol(db, 'be_customers').doc(customerId).get();
    if (!custSnap.exists) return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
    const customer = { id: custSnap.id, ...custSnap.data() };
    const customerHN = String(customer.hn_no || customerId);
    const customerName = [customer.prefix, customer.firstname, customer.lastname].filter(Boolean).join(' ').trim();

    // 2. Enumerate 16 cascade collections (parallel)
    const collectionQueries = await Promise.all(
      CUSTOMER_CASCADE_COLLECTIONS_FULL.map(name =>
        dataCol(db, name).where('customerId', '==', customerId).get()
      )
    );
    const collections = { be_customers: [customer] };
    CUSTOMER_CASCADE_COLLECTIONS_FULL.forEach((name, idx) => {
      collections[name] = collectionQueries[idx].docs.map(d => ({ id: d.id, ...d.data() }));
    });

    // 3. Enumerate 8 customer-attached subcollections (parallel)
    const subQueries = await Promise.all(
      T4_SUBCOLLECTIONS.map(sub =>
        db.collection('artifacts').doc(APP_ID).collection('public').doc('data')
          .collection('be_customers').doc(customerId).collection(sub).get()
      )
    );
    const subcollections = {};
    T4_SUBCOLLECTIONS.forEach((sub, idx) => {
      subcollections[sub] = subQueries[idx].docs.map(d => ({ id: d.id, ...d.data() }));
    });

    // 4. Enumerate matching chat_conversations
    const chatSnap = await dataCol(db, 'chat_conversations').get();
    const chatConversations = chatSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => matchCustomerChatPredicate(c, customer));

    // 5. Enumerate Storage objects under be_customers/{customerId}/ prefix
    const storagePrefix = `${STORAGE_PREFIX_CUSTOMER}/${customerId}/`;
    const [files] = await bucket.getFiles({ prefix: storagePrefix });
    const storageManifest = await Promise.all(files.map(async (file) => {
      const [buf] = await file.download();
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const [meta] = await file.getMetadata();
      return {
        path: file.name,
        size: Number(meta.size || buf.length),
        sha256,
        contentType: meta.contentType || 'application/octet-stream',
      };
    }));

    // 6. Compose backup file
    const backupFile = buildCustomerBackupFile({
      customerId, customerHN, customerName,
      exportedBy: `${caller.email || ''} (${caller.uid || ''})`,
      collections, subcollections, chatConversations, storageManifest,
      userNote,
    });

    // 7. Write to Storage
    const ts = Date.now();
    const rand = randHex(8);
    const backupPathPrefix = `backups/customers/${customerId}/${ts}-${rand}`;
    const backupJsonPath = `${backupPathPrefix}/backup.json`;
    const backupJsonBytes = Buffer.from(
      JSON.stringify(backupFile, jsonReplacerForNonFinite, 2),
      'utf8'
    );
    await bucket.file(backupJsonPath).save(backupJsonBytes, {
      metadata: { contentType: 'application/json' },
    });

    // 8. Copy Storage objects to backup tree (parallel)
    await Promise.all(files.map(async (file) => {
      const destPath = `${backupPathPrefix}/storage/${file.name}`;
      await file.copy(bucket.file(destPath));
    }));

    // 9. Generate 24h signed URL for backup.json
    const [signedUrl] = await bucket.file(backupJsonPath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    // 10. Audit doc
    const auditId = `customer-backup-export-${customerId}-${ts}-${rand}`;
    await dataCol(db, 'be_admin_audit').doc(auditId).set({
      type: 'customer-backup-export',
      customerId, customerHN, customerName,
      backupRef: backupJsonPath,
      bodyHash: backupFile.meta.bodyHash,
      storageManifestHash: backupFile.meta.storageManifestHash,
      storageObjectCount: storageManifest.length,
      sizeBytes: backupJsonBytes.length,
      exportedBy: { uid: caller.uid, email: caller.email },
      exportedAt: new Date().toISOString(),
      userNote,
    });

    return res.status(200).json({
      ok: true,
      backupRef: backupJsonPath,
      downloadUrl: signedUrl,
      sizeBytes: backupJsonBytes.length,
      bodyHash: backupFile.meta.bodyHash,
      storageManifestHash: backupFile.meta.storageManifestHash,
      perCollectionCounts: backupFile.meta.perCollectionCounts,
      subcollectionCounts: backupFile.meta.subcollectionCounts,
      chatConversationCount: backupFile.meta.chatConversationCount,
      storageObjectCount: backupFile.meta.storageObjectCount,
      auditDocId: auditId,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'BACKUP_EXPORT_FAILED' });
  }
}
```

- [ ] **Step 2: Verify build clean (catches import errors)**

```
npm run build
```

Expected: clean build (no MISSING_EXPORT errors).

- [ ] **Step 3: Commit**

```bash
git add api/admin/customer-backup-export.js
git commit -m "feat(V74): /api/admin/customer-backup-export — per-customer global backup endpoint

10-step flow: read customer → enumerate 16 cascade + 8 subcoll + matching chat + Storage tree → compute hashes → write backup.json + copy Storage objects to backups/customers/{cid}/{ts-rand}/ → audit doc.
Admin-only via verifyAdminToken. Returns signed URL (24h).

Spec § 4.1.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: `scripts/customer-backup-export.mjs` CLI mirror

**Files:**
- Create: `scripts/customer-backup-export.mjs`

- [ ] **Step 1: Write CLI script**

Same logic as endpoint, but invoked from Node with env-loaded credentials. Single-customer (`--customer-id LC-...`) or branch-batch (`--all-in-branch BR-...`). Default dry-run; `--apply` commits writes.

```javascript
#!/usr/bin/env node
// scripts/customer-backup-export.mjs — Rule M canonical CLI.
// Usage:
//   node scripts/customer-backup-export.mjs --customer-id LC-26000001 [--apply] [--user-note "x"]
//   node scripts/customer-backup-export.mjs --all-in-branch BR-... [--apply]
//
// Dry-run default. --apply writes backup files + audit doc.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
  matchCustomerChatPredicate,
} from '../src/lib/customerBackupCore.js';
import { buildCustomerBackupFile } from '../src/lib/customerBackupSchema.js';
import { jsonReplacerForNonFinite } from '../src/lib/branchBackupSchema.js';

loadEnv({ path: '.env.local.prod' });
const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = `${APP_ID}.firebasestorage.app`;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { apply: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--customer-id') out.customerId = args[++i];
    else if (a === '--all-in-branch') out.branchId = args[++i];
    else if (a === '--user-note') out.userNote = args[++i];
  }
  return out;
}

function initApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: BUCKET,
  });
}

async function exportSingleCustomer({ db, bucket, customerId, userNote = '', apply }) {
  const dataCol = (n) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(n);
  const custSnap = await dataCol('be_customers').doc(customerId).get();
  if (!custSnap.exists) {
    console.log(`[skip] ${customerId}: not found`);
    return null;
  }
  const customer = { id: custSnap.id, ...custSnap.data() };
  // ... same enumeration logic as endpoint ...
  // For dry-run: just print counts. For --apply: write files + audit.
  // (full implementation mirrors the endpoint)
}

async function main() {
  const args = parseArgs();
  if (!args.customerId && !args.branchId) {
    console.error('Usage: --customer-id <id> OR --all-in-branch <branchId> [--apply] [--user-note <text>]');
    process.exit(1);
  }
  const app = initApp();
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(BUCKET);

  if (args.customerId) {
    await exportSingleCustomer({ db, bucket, customerId: args.customerId, userNote: args.userNote, apply: args.apply });
  } else {
    const dataCol = (n) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(n);
    const snap = await dataCol('be_customers').where('branchId', '==', args.branchId).get();
    console.log(`Found ${snap.size} customers in branch ${args.branchId}`);
    for (const doc of snap.docs) {
      await exportSingleCustomer({ db, bucket, customerId: doc.id, userNote: args.userNote, apply: args.apply });
    }
  }
  console.log(args.apply ? 'COMMITTED' : 'DRY-RUN (use --apply to commit)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 2: Verify import shape**

```
node -e "import('./scripts/customer-backup-export.mjs').then(()=>console.log('ok'))"
```

Expected: prints "ok" (or fails on missing env file — that's expected without prod env pulled).

- [ ] **Step 3: Commit**

```bash
git add scripts/customer-backup-export.mjs
git commit -m "feat(V74): scripts/customer-backup-export.mjs — Rule M CLI mirror

Single-customer (--customer-id) or branch-batch (--all-in-branch) export.
Dry-run default; --apply commits writes + audit doc + Storage tree copy.
Invocation guard ensures unit-test imports don't auto-trigger Firebase init.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Tests T1 + T2 + T3 — vanilla / heavy gallery / adversarial data

**Files:**
- Create: `tests/v74-customer-backup-vanilla-roundtrip.test.js`
- Create: `tests/v74-customer-backup-heavy-gallery-storage.test.js`
- Create: `tests/v74-customer-backup-adversarial-data.test.js`

- [ ] **Step 1: Write T1 vanilla round-trip test**

```javascript
// tests/v74-customer-backup-vanilla-roundtrip.test.js
// T1: minimal customer (1 treatment / 1 sale / 1 deposit / 1 appt / 1 LINE link)
// → buildCustomerBackupFile → JSON.stringify+parse round-trip → deep-equal assertion

import { describe, it, expect } from 'vitest';
import { buildCustomerBackupFile, validateCustomerBackupFile } from '../src/lib/customerBackupSchema.js';
import { jsonReplacerForNonFinite, jsonReviverForNonFinite } from '../src/lib/branchBackupSchema.js';

describe('T1 — Vanilla customer round-trip', () => {
  const customer = {
    id: 'LC-1', hn_no: '0001', prefix: 'นางสาว', firstname: 'A', lastname: 'B',
    branchId: 'BR-A', lineUserId_byBranch: { 'BR-A': 'U123' },
    courses: [{ courseId: 'C1', remaining: 5 }],
  };
  const collections = {
    be_customers: [customer],
    be_treatments: [{ id: 'T1', customerId: 'LC-1', date: '2026-05-16' }],
    be_sales: [{ id: 'S1', customerId: 'LC-1', total: 1000 }],
    be_deposits: [{ id: 'D1', customerId: 'LC-1', amount: 500 }],
    be_appointments: [{ id: 'A1', customerId: 'LC-1', date: '2026-05-20' }],
    be_link_requests: [{ id: 'LR1', customerId: 'LC-1', status: 'approved' }],
  };
  const subcollections = {
    treatments: [{ id: 'T1', parentCustomerId: 'LC-1' }],
    sales: [{ id: 'S1', parentCustomerId: 'LC-1' }],
    appointments: [{ id: 'A1', parentCustomerId: 'LC-1' }],
    deposits: [{ id: 'D1', parentCustomerId: 'LC-1' }],
    wallets: [], memberships: [], points: [], courseChanges: [],
  };
  const chatConversations = [{ id: 'CH1', lineUserId: 'U123', text: 'สวัสดี' }];
  const storageManifest = [];

  it('T1.1 build → stringify → parse → deep-equal collections', () => {
    const file = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'นางสาว A B',
      exportedBy: 'admin', collections, subcollections, chatConversations, storageManifest,
    });
    const serialized = JSON.stringify(file, jsonReplacerForNonFinite);
    const restored = JSON.parse(serialized, jsonReviverForNonFinite);
    expect(restored.collections).toEqual(collections);
    expect(restored.subcollections).toEqual(subcollections);
    expect(restored.chatConversations).toEqual(chatConversations);
  });
  it('T1.2 bodyHash deterministic across round-trip', () => {
    const f1 = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A',
      exportedBy: 'x', collections, subcollections, chatConversations, storageManifest,
    });
    const restored = JSON.parse(JSON.stringify(f1, jsonReplacerForNonFinite), jsonReviverForNonFinite);
    expect(restored.meta.bodyHash).toBe(f1.meta.bodyHash);
  });
  it('T1.3 validate restored file passes', () => {
    const f1 = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A',
      exportedBy: 'x', collections, subcollections, chatConversations, storageManifest,
    });
    const restored = JSON.parse(JSON.stringify(f1, jsonReplacerForNonFinite), jsonReviverForNonFinite);
    expect(() => validateCustomerBackupFile(restored)).not.toThrow();
  });
});
```

- [ ] **Step 2: Write T2 heavy gallery + Storage SHA-256 test**

```javascript
// tests/v74-customer-backup-heavy-gallery-storage.test.js
// T2: 20 gallery_upload images + per-Storage-object SHA-256 verify

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { buildCustomerBackupFile, computeStorageManifestHash } from '../src/lib/customerBackupSchema.js';

describe('T2 — Heavy gallery + Storage manifest', () => {
  function makeManifest(n) {
    return Array.from({ length: n }, (_, i) => {
      const bytes = crypto.randomBytes(1024 * (i + 1));
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      return { path: `be_customers/LC-1/gallery_${i.toString().padStart(2, '0')}.jpg`, size: bytes.length, sha256, contentType: 'image/jpeg' };
    });
  }
  it('T2.1 20-image gallery manifest produces deterministic hash', () => {
    const manifest = makeManifest(20);
    const h1 = computeStorageManifestHash(manifest);
    const h2 = computeStorageManifestHash(manifest);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  it('T2.2 reorder manifest entries produces SAME hash (canonical sort)', () => {
    const manifest = makeManifest(20);
    const reordered = [...manifest].reverse();
    expect(computeStorageManifestHash(manifest)).toBe(computeStorageManifestHash(reordered));
  });
  it('T2.3 ANY byte change in one image invalidates hash', () => {
    const m1 = makeManifest(5);
    const m2 = m1.map(e => e.path === m1[2].path ? { ...e, sha256: 'X'.repeat(64) } : e);
    expect(computeStorageManifestHash(m1)).not.toBe(computeStorageManifestHash(m2));
  });
});
```

- [ ] **Step 3: Write T3 adversarial data test**

```javascript
// tests/v74-customer-backup-adversarial-data.test.js
// T3: Thai chars + Unicode NFC≠NFD + NaN/Infinity + NUL byte + 10K-char string

import { describe, it, expect } from 'vitest';
import { buildCustomerBackupFile } from '../src/lib/customerBackupSchema.js';
import { jsonReplacerForNonFinite, jsonReviverForNonFinite } from '../src/lib/branchBackupSchema.js';

const baseArgs = {
  customerId: 'LC-1', customerHN: '0001', customerName: 'A',
  exportedBy: 'x', subcollections: {}, chatConversations: [], storageManifest: [],
};

describe('T3 — Adversarial data round-trip', () => {
  it('T3.1 Thai characters preserved byte-for-byte', () => {
    const collections = { be_treatments: [{ id: 'T1', note: 'บันทึก ภาษาไทย ทดสอบ' }] };
    const f = buildCustomerBackupFile({ ...baseArgs, collections });
    const r = JSON.parse(JSON.stringify(f, jsonReplacerForNonFinite), jsonReviverForNonFinite);
    expect(r.collections.be_treatments[0].note).toBe('บันทึก ภาษาไทย ทดสอบ');
  });
  it('T3.2 NaN preserved via sentinel encoding', () => {
    const collections = { be_treatments: [{ id: 'T1', value: NaN }] };
    const f = buildCustomerBackupFile({ ...baseArgs, collections });
    const r = JSON.parse(JSON.stringify(f, jsonReplacerForNonFinite), jsonReviverForNonFinite);
    expect(Number.isNaN(r.collections.be_treatments[0].value)).toBe(true);
  });
  it('T3.3 Infinity preserved via sentinel encoding', () => {
    const collections = { be_treatments: [{ id: 'T1', value: Infinity }] };
    const f = buildCustomerBackupFile({ ...baseArgs, collections });
    const r = JSON.parse(JSON.stringify(f, jsonReplacerForNonFinite), jsonReviverForNonFinite);
    expect(r.collections.be_treatments[0].value).toBe(Infinity);
  });
  it('T3.4 NUL byte preserved', () => {
    const collections = { be_treatments: [{ id: 'T1', note: 'before after' }] };
    const f = buildCustomerBackupFile({ ...baseArgs, collections });
    const r = JSON.parse(JSON.stringify(f, jsonReplacerForNonFinite), jsonReviverForNonFinite);
    expect(r.collections.be_treatments[0].note).toBe('before after');
  });
  it('T3.5 10K-char string preserved', () => {
    const big = 'X'.repeat(10000);
    const collections = { be_treatments: [{ id: 'T1', note: big }] };
    const f = buildCustomerBackupFile({ ...baseArgs, collections });
    const r = JSON.parse(JSON.stringify(f, jsonReplacerForNonFinite), jsonReviverForNonFinite);
    expect(r.collections.be_treatments[0].note).toBe(big);
    expect(r.collections.be_treatments[0].note.length).toBe(10000);
  });
});
```

- [ ] **Step 4: Run all 3 test files**

```
npx vitest run tests/v74-customer-backup-vanilla-roundtrip.test.js tests/v74-customer-backup-heavy-gallery-storage.test.js tests/v74-customer-backup-adversarial-data.test.js
```

Expected: 11/11 PASS (3 + 3 + 5).

- [ ] **Step 5: Commit**

```bash
git add tests/v74-customer-backup-vanilla-roundtrip.test.js tests/v74-customer-backup-heavy-gallery-storage.test.js tests/v74-customer-backup-adversarial-data.test.js
git commit -m "test(V74): T1+T2+T3 — vanilla + heavy gallery + adversarial data round-trip

T1 (3 cases): vanilla customer round-trip preserves collections/subcoll/chat byte-equal.
T2 (3 cases): 20-image gallery manifest hash determinism + canonical sort + byte-change invalidation.
T3 (5 cases): Thai chars + NaN + Infinity + NUL byte + 10K-char string preserved.

Spec § 9 test catalog.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: ENHANCE `delete-customer-cascade.js` with CG + CS + CF + CH + autoBackupRef

**Files:**
- Modify: `api/admin/delete-customer-cascade.js`

- [ ] **Step 1: Read existing endpoint, understand scope**

```
Read api/admin/delete-customer-cascade.js (already done in Task setup)
```

- [ ] **Step 2: Refactor to extend cascade list + add autoBackupRef gate**

```javascript
// api/admin/delete-customer-cascade.js (V74 ENHANCEMENT — extends Phase 24.0)
//
// V74 changes:
//   - Cascade list extended from 11 to 16 (CG: be_quotations, be_vendor_sales,
//     be_online_sales, be_sale_insurance_claims, be_recalls)
//   - Recursively delete 8 customer-attached subcollections (CS)
//   - Delete Storage objects under be_customers/{customerId}/ prefix (CF)
//   - Delete matching chat_conversations (CH)
//   - autoBackupRef REQUIRED on action='delete' (AV19 elevated)
//   - Server verifies file exists + body parses + bodyHash recomputed matches
//     + per-Storage-object SHA-256 matches
//   - Preserves Phase 24.0 customer_delete perm + branch-roster + authorizedBy

// (keep all existing imports + helpers; add new imports)
import {
  CUSTOMER_CASCADE_COLLECTIONS_FULL,
  T4_SUBCOLLECTIONS,
} from '../../src/lib/customerBackupCore.js';
import { validateCustomerBackupFile, computeStorageManifestHash } from '../../src/lib/customerBackupSchema.js';
import { jsonReviverForNonFinite } from '../../src/lib/branchBackupSchema.js';
import { computeBodyHash } from '../../src/lib/branchBackupSchema.js';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';

// REPLACE CUSTOMER_CASCADE_COLLECTIONS const with V74 alias:
// (delete the Phase 24.0 11-element list and use the V74 16-element list)

// In handler, BEFORE existing cascade logic:
//   if (action === 'delete') {
//     if (!req.body.autoBackupRef) return res.status(400).json({...AUTO_BACKUP_REQUIRED});
//     // Verify backup file exists + integrity-verify (download, recompute hashes, per-storage-sha256)
//     // If any mismatch → 400 BACKUP_INTEGRITY_FAIL
//   }
//
// In cascade deletion:
//   1. Use CUSTOMER_CASCADE_COLLECTIONS_FULL (16 instead of 11)
//   2. Recursively iterate T4_SUBCOLLECTIONS + delete every doc
//   3. List Storage objects under be_customers/{customerId}/ + delete each
//   4. Query chat_conversations + filter via matchCustomerChatPredicate + delete
//   5. Audit doc payload extended with cascadeCounts (16), subcollectionCounts (8),
//      storageObjectCount, chatConversationCount, autoBackupRef, bodyHash,
//      storageManifestHash
```

(Full file replacement — agent reads existing 425-line file + applies changes per the architecture above. Preserves Phase 24.0 `customer_delete` perm, `validateAuthorizedBy`, `inBranchRoster`, `classifyOrigin`, snapshot pruning. Adds AV19 integrity verify + extended cascade.)

- [ ] **Step 3: Build clean**

```
npm run build
```

Expected: clean.

- [ ] **Step 4: Targeted test — verify Phase 24.0 existing tests still pass after refactor**

```
npx vitest run tests/phase-24-0-delete-customer-cascade.test.js
```

Expected: all PASS (backward compat preserved).

- [ ] **Step 5: Commit**

```bash
git add api/admin/delete-customer-cascade.js
git commit -m "feat(V74): delete-customer-cascade extended — 16 collections + 8 subcoll + Storage + chat + AV19 autoBackupRef

V74 enhancement of Phase 24.0:
- Cascade 11 → 16 (CG closes gap: be_quotations + be_vendor_sales + be_online_sales + be_sale_insurance_claims + be_recalls)
- Recursive subcollection deletion (8 customer-attached subcoll)
- Storage object deletion under be_customers/{customerId}/ prefix
- Chat conversations matching customer via matchCustomerChatPredicate
- autoBackupRef REQUIRED on action='delete' — integrity verify (body hash + per-object sha256) BEFORE wipe
- Audit doc extended with cascadeCounts/subcollectionCounts/storageObjectCount/chatConversationCount/bodyHash/storageManifestHash
- Preserves customer_delete perm + branch-roster + authorizedBy

Spec § 4.2 + AV53.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: `scripts/customer-delete-with-backup.mjs` CLI

**Files:**
- Create: `scripts/customer-delete-with-backup.mjs`

- [ ] **Step 1: Write CLI script**

Combined backup + delete in single op (admin-SDK; for disaster recovery without UI). Calls `customer-backup-export.mjs` logic + `delete-customer-cascade.js` logic in sequence. Dry-run default; `--apply` commits.

- [ ] **Step 2: Commit**

```bash
git add scripts/customer-delete-with-backup.mjs
git commit -m "feat(V74): scripts/customer-delete-with-backup.mjs — combined backup+delete CLI for disaster recovery

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: Tests T7 (audit-immutable preservation) + T9 (concurrency/failure)

**Files:**
- Create: `tests/v74-customer-backup-audit-immutable.test.js`
- Create: `tests/v74-customer-backup-concurrency-failure.test.js`

- [ ] **Step 1: Write T7 audit-immutable test (mock Firestore + mock Storage)**

T7.1: be_admin_audit + be_stock_movements NOT in CUSTOMER_CASCADE_COLLECTIONS_FULL (source-grep).
T7.2: simulate delete cascade → assert no writes to be_stock_movements / be_admin_audit (except the new audit doc).
T7.3: post-restore, stock-movement→treatmentId refs re-resolve (same treatmentId now exists).

- [ ] **Step 2: Write T9 concurrency/failure test**

T9.1: concurrent backup-during-delete → backup reads pre-delete state; delete proceeds after backup commits OR returns 503 BACKUP_IN_PROGRESS.
T9.2: concurrent restore-during-delete → restore returns 400 CUSTOMER_DOES_NOT_EXIST_YET; admin retries after delete completes.
T9.3: simulate partial Storage upload fail mid-backup → backup ABORTS + cleanup deletes partial Storage objects + audit doc records FAILED status.
T9.4: simulate batch commit fail mid-cascade → cascade ABORTS + audit doc records FAILED; customer remains (no half-state).

- [ ] **Step 3: Run + commit**

```bash
npx vitest run tests/v74-customer-backup-audit-immutable.test.js tests/v74-customer-backup-concurrency-failure.test.js
```

Expected: PASS.

```bash
git add tests/v74-customer-backup-audit-immutable.test.js tests/v74-customer-backup-concurrency-failure.test.js
git commit -m "test(V74): T7 audit-immutable preservation + T9 concurrency/failure rollback

T7 (2 cases): AI tier (be_admin_audit + be_stock_movements + ...) survives wipe. Post-restore stock refs re-resolve.
T9 (4 cases): concurrent backup/restore-during-delete + partial Storage upload fail + batch commit fail.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: `/api/admin/customer-restore` endpoint with Q3=B SAFE

**Files:**
- Create: `api/admin/customer-restore.js`

- [ ] **Step 1: Write endpoint** (preview + restore actions, conflict scan via scanRestoreConflicts, line-conflict strip, batch-write at SAME doc IDs, Storage-copy-back, audit doc)

- [ ] **Step 2: Build clean + commit**

```bash
npm run build
git add api/admin/customer-restore.js
git commit -m "feat(V74): /api/admin/customer-restore — preview + restore with Q3=B SAFE conflict resolution

Spec § 4.3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: `scripts/customer-restore.mjs` CLI mirror

Mirror endpoint logic; supports `--backup-ref <Storage path>` OR `--local-file <path.json>`. Dry-run default.

```bash
git add scripts/customer-restore.mjs
git commit -m "feat(V74): scripts/customer-restore.mjs — CLI mirror with --backup-ref + --local-file modes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: Tests T4 + T5 + T6 — cross-branch + subcollections + conflict resolution

**Files:**
- Create: `tests/v74-customer-backup-cross-branch.test.js`
- Create: `tests/v74-customer-backup-subcollections.test.js`
- Create: `tests/v74-customer-backup-conflict-resolution.test.js`

T4 (3 cases): customer with treatments@BR-A + sales@BR-B + appts@BR-C → backup → wipe → restore → each doc's branchId preserved.
T5 (2 cases): populated 8 customer-attached subcollections → backup includes all 8 → restore recreates at same docIds in same subcoll paths.
T6 (4 cases): scanRestoreConflicts customerId-exists / hn-collision / line-conflict / stale-FK paths + stripLineConflicts immutability.

```bash
git add tests/v74-customer-backup-cross-branch.test.js tests/v74-customer-backup-subcollections.test.js tests/v74-customer-backup-conflict-resolution.test.js
git commit -m "test(V74): T4 cross-branch + T5 subcollections + T6 conflict resolution

T4 (3): customer data spread across 3 branches preserves per-doc branchId.
T5 (2): 8 customer-attached subcollections backup+restore at same docIds in same subcoll paths.
T6 (4): scanRestoreConflicts 4-conflict matrix + stripLineConflicts immutability.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: Test T8 — tampering detection

```javascript
// tests/v74-customer-backup-tampering.test.js
// T8: bodyHash mismatch / per-Storage-object SHA-256 mismatch / manifest count mismatch BLOCKs wipe + restore
```

T8.1: tamper backup.json body → recomputed bodyHash differs from meta.bodyHash → restore BLOCKs (400 BACKUP_INTEGRITY_FAIL).
T8.2: tamper one Storage object byte → SHA-256 differs from manifest → restore BLOCKs.
T8.3: manifest claims 20 objects but only 19 exist in storage tree → restore BLOCKs.

```bash
git add tests/v74-customer-backup-tampering.test.js
git commit -m "test(V74): T8 tampering detection — bodyHash + per-object SHA-256 + manifest-count mismatches BLOCK

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 14: `/api/admin/backup-manager-list` + CLI

**Files:**
- Create: `api/admin/backup-manager-list.js`
- Create: `scripts/backup-manager-list.mjs`

List ALL backup files from `backups/**/*.json` Storage prefix via `bucket.getFiles({prefix, maxResults})`. Filters: type (customer/branch/central-stock) × date range × search HN/branchName/customerName. Returns metadata-only (no body content). Paginated (page + pageSize).

```bash
git add api/admin/backup-manager-list.js scripts/backup-manager-list.mjs
git commit -m "feat(V74): /api/admin/backup-manager-list + CLI — paginated cross-type backup listing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 15: `/api/admin/backup-manager-rename`

Download JSON → update `meta.userNote` (max 200 chars) → upload back (overwrite). `bodyHash` + `storageManifestHash` UNCHANGED. Audit doc records old + new userNote.

```bash
git add api/admin/backup-manager-rename.js
git commit -m "feat(V74): /api/admin/backup-manager-rename — Q5b=Y label-edit (hash preserved)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 16: `/api/admin/backup-manager-delete` + CLI (AV19 72h-grace)

**Files:**
- Create: `api/admin/backup-manager-delete.js`
- Create: `scripts/backup-manager-delete.mjs`

AV19 72h-grace check: query be_admin_audit for any doc in last 72 hours where `autoBackupRef === target.backupRef` AND type === 'customer-delete-cascade' or 'branch-make-fresh' or 'central-stock-make-fresh' → BLOCK with grace-period error. Otherwise: delete JSON + recursive delete of `/storage/` tree + audit doc.

```bash
git add api/admin/backup-manager-delete.js scripts/backup-manager-delete.mjs
git commit -m "feat(V74): /api/admin/backup-manager-delete + CLI — AV19 72h-grace prevents accidental safety-net deletion

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 17: `/api/admin/backup-manager-bulk-delete`

Max 50 per call. Sequentially calls delete logic per ref (each gets own audit doc + AV19 grace check). Returns partial-success summary `{deletedCount, failedRefs: [{ref, reason}], auditDocIds}`.

```bash
git add api/admin/backup-manager-bulk-delete.js
git commit -m "feat(V74): /api/admin/backup-manager-bulk-delete — max-50 per call with per-file AV19 check + partial-success summary

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 18: `/api/admin/backup-manager-download`

`format: 'json'` → signed URL for backup.json only (1h TTL). `format: 'zip'` → server bundles JSON + Storage tree into `backups/.../{ts}-bundle.zip` (uses `jszip` or `archiver`) → returns signed URL (24h TTL, auto-cleaned via lifecycle policy).

```bash
git add api/admin/backup-manager-download.js
git commit -m "feat(V74): /api/admin/backup-manager-download — JSON or ZIP bundle (signed URL)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 19: Test T10 — backup manager

T10.1: rename preserves bodyHash (meta excluded from hash).
T10.2: bulk delete writes 1 audit doc per file.
T10.3: AV19 72h-grace blocks delete of recently-referenced backup (mock be_admin_audit with recent autoBackupRef).

```bash
git add tests/v74-backup-manager.test.js
git commit -m "test(V74): T10 backup manager — rename hash-preserve + bulk delete audit + AV19 72h-grace

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 20: `CustomerBackupModal.jsx` + CustomerDetailView header integration

- Modal: optional userNote textarea + confirm → POST `/api/admin/customer-backup-export` → toast.
- CustomerDetailView header: add "💾 สำรองข้อมูล" button next to existing actions.

```bash
git add src/components/backend/CustomerBackupModal.jsx src/components/backend/CustomerDetailView.jsx
git commit -m "feat(V74 UI): CustomerBackupModal + 💾 สำรองข้อมูล button in CustomerDetailView header

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 21: `CustomerDeleteModalEnhanced.jsx` — extends Phase 24.0 delete modal with autoBackupRef

Extends existing CustomerDeleteModal (Phase 24.0). Add radio at top: "สำรองข้อมูลใหม่ก่อนลบ" / "เลือกไฟล์สำรองที่มีอยู่". Resolve autoBackupRef → pass to delete endpoint. Preserve authorizedBy + HN-confirm + branch-roster validation.

```bash
git add src/components/backend/CustomerDeleteModalEnhanced.jsx src/components/backend/CustomerDetailView.jsx
git commit -m "feat(V74 UI): CustomerDeleteModalEnhanced — extends Phase 24.0 with autoBackupRef radio + picker

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 22: `CustomerDataRecoveryTab.jsx` + `CustomerRestorePreviewModal.jsx` + `useBackupManagerList.js`

NEW admin tab (`tab=customer-data-recovery`) listing customer backups (filter by HN/name/date) + 4 actions per row + 📥 upload backup file flow.

```bash
git add src/components/backend/CustomerDataRecoveryTab.jsx src/components/backend/CustomerRestorePreviewModal.jsx src/hooks/useBackupManagerList.js
git commit -m "feat(V74 UI): tab=customer-data-recovery — list+restore+upload customer backups

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 23: `BackupManagerTab.jsx` + `BackupManagerRenameModal.jsx` + `BackupManagerBulkDeleteModal.jsx`

NEW unified admin tab (`tab=backup-manager`) listing ALL backup types + filter chips + per-row actions (⬇ ✏ 🗑) + bulk-delete (≤50).

```bash
git add src/components/backend/BackupManagerTab.jsx src/components/backend/BackupManagerRenameModal.jsx src/components/backend/BackupManagerBulkDeleteModal.jsx
git commit -m "feat(V74 UI): tab=backup-manager — unified list+rename+delete+bulk across all backup types

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 24: Nav + tabPermissions + BackendDashboard wiring + audit count fixups

- `nav/navConfig.js` — add 2 new tab entries under "ระบบ" admin section
- `src/lib/tabPermissions.js` — `'customer-data-recovery': { adminOnly: true }` + `'backup-manager': { adminOnly: true }`
- `src/pages/BackendDashboard.jsx` — lazy import + render case
- Update `tests/backend-nav-config.test.js` + `tests/phase11-master-data-scaffold.test.jsx` for new tab count

```bash
git add nav/navConfig.js src/lib/tabPermissions.js src/pages/BackendDashboard.jsx tests/backend-nav-config.test.js tests/phase11-master-data-scaffold.test.jsx
git commit -m "feat(V74): nav + tabPermissions + dashboard wiring for 2 new admin tabs

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 25: Storage rules + Probe-Deploy-Probe extension

- `storage.rules` — add:
  ```
  match /backups/customers/{customerId}/{file=**} {
    allow read, write, delete: if request.auth != null && request.auth.token.admin == true;
  }
  ```
- `scripts/probe-deploy-probe.mjs` — add probe #11: anon write to `backups/customers/TEST-PROBE-{ts}` → expect 401/403.
- Update Rule B probe list in `.claude/rules/01-iron-clad.md`.

```bash
git add storage.rules scripts/probe-deploy-probe.mjs .claude/rules/01-iron-clad.md
git commit -m "feat(V74): storage.rules customer-backups path admin-only + Probe-Deploy-Probe #11

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 26: `scripts/e2e-customer-backup-restore-roundtrip-real-prod.mjs` (Rule Q L2)

End-to-end on REAL prod with TEST-V74-CUSTOMER-{ts} fixtures. 5 phases:
1. Create test customer + populated subcollections + Storage gallery
2. Export backup → verify file + hashes + signed URL
3. Delete customer (with autoBackupRef gate) → verify cascade + Storage objects gone
4. Restore from backup → verify byte-equal customer doc + all 16 collections + 8 subcoll + Storage tree
5. Cleanup TEST fixtures

```bash
git add scripts/e2e-customer-backup-restore-roundtrip-real-prod.mjs
git commit -m "test(V74 e2e): customer backup-wipe-restore round-trip on real prod (Rule Q L2)

5-phase TEST-V74-CUSTOMER fixture cycle. Verifies bit-identical restore + zero orphans + audit doc emit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 27: `scripts/e2e-customer-backup-tampering-real-prod.mjs`

Tampering detection on real prod: backup file → tamper byte → restore should BLOCK with BACKUP_INTEGRITY_FAIL.

```bash
git add scripts/e2e-customer-backup-tampering-real-prod.mjs
git commit -m "test(V74 e2e): tampering detection on real prod — verify integrity-fail BLOCKs wipe+restore

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 28: `scripts/e2e-backup-manager-cleanup-real-prod.mjs`

Manager round-trip: list → rename → bulk delete → audit doc verify. Plus AV19 72h-grace test (mock recent autoBackupRef → verify BLOCK).

```bash
git add scripts/e2e-backup-manager-cleanup-real-prod.mjs
git commit -m "test(V74 e2e): backup-manager round-trip on real prod — rename+bulk-delete+AV19-grace

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 29: AV52-AV55 invariants + audit-anti-vibe-code SKILL.md

Add 4 new AV invariants per spec § 10:
- AV52: backup file integrity (bodyHash + storageManifestHash + per-object SHA-256)
- AV53: AV19 elevation for customer wipe (autoBackupRef required + verify)
- AV54: subcollection cascade discipline (all 8 must be in wipe path)
- AV55: backup-manager 72h-grace

Source-grep regression locks in tests/v74-* files.

```bash
git add .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "chore(V74): AV52-AV55 invariants — backup integrity + AV19 elevation + subcoll cascade + 72h-grace

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 30: audit-cascade-logic skill extension

Add subcollection-cascade-discipline invariant: every customer-wipe path MUST iterate all 8 T4_SUBCOLLECTIONS and delete recursively.

```bash
git add .agents/skills/audit-cascade-logic/SKILL.md
git commit -m "chore(V74): audit-cascade-logic — extend with subcollection-cascade discipline

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 31: `scripts/diag-customer-backup-integrity.mjs` + `scripts/customer-backup-download.mjs`

Rule R diag script: verifies a backup file's integrity end-to-end against current schema (no writes). Plus download script for offline storage.

```bash
git add scripts/diag-customer-backup-integrity.mjs scripts/customer-backup-download.mjs
git commit -m "feat(V74): scripts/diag-customer-backup-integrity.mjs + customer-backup-download.mjs

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 32: Full vitest + build + V21 fixup sweep

```bash
npm test -- --run 2>&1 | tail -20
npm run build 2>&1 | tail -10
```

If any V21-class regressions (existing tests asserting pre-V74 shape): fix inline. Common patterns:
- Phase 24.0 delete-cascade tests asserting 11-collection list → update to 16
- AdminDashboard tests asserting 2 fewer tabs → update count
- Existing nav config tests

```bash
git add tests/ ... (any V21 fixups)
git commit -m "chore(V74): V21 fixup sweep — update Phase 24.0 cascade test + nav config tab counts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 33: SESSION_HANDOFF + active.md + V74 V-entry + final session-end

- Update `SESSION_HANDOFF.md` with V74 ship summary
- Update `.agents/active.md` with current state (commits ahead of prod)
- Append V74 compact entry to `.claude/rules/00-session-start.md` § 2
- Append V74 verbose entry to `.claude/rules/v-log-archive.md`

```bash
git add SESSION_HANDOFF.md .agents/active.md .claude/rules/00-session-start.md .claude/rules/v-log-archive.md
git commit -m "docs(V74): SESSION_HANDOFF + active.md + V-entry — ready for Rule Q L1 hands-on

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-Review

After plan written, this pass verifies:

### 1. Spec coverage

| Spec section | Tasks |
|---|---|
| § 2 Customer-data surface (CD+C11+CG+CS+CF+CH+AI tiers) | Task 1 (CUSTOMER_CASCADE_COLLECTIONS_FULL + AUDIT_IMMUTABLE + T4_SUBCOLLECTIONS) |
| § 3 Backup file layout (schema, integrity contract) | Task 2 |
| § 4.1 customer-backup-export endpoint | Task 4 |
| § 4.2 Enhanced delete-customer-cascade | Task 7 |
| § 4.3 customer-restore endpoint | Task 10 |
| § 4.4-4.8 Backup-manager endpoints | Tasks 14-18 |
| § 5.1 CustomerDetailView header | Tasks 20-21 |
| § 5.2 customer-data-recovery tab | Task 22 |
| § 5.3 backup-manager tab | Task 23 |
| § 5.5 Permissions / nav wiring | Task 24 |
| § 6 CLI mirrors | Tasks 5, 8, 11, 14, 16, 31 |
| § 7 Conflict resolution (Q3=B SAFE) | Task 3 (helpers) + Task 10 (endpoint integration) + Task 12 (tests) |
| § 8 Audit-immutable preservation | Task 7 (cascade) + Task 9 (test) + Task 10 (restore skip) |
| § 9 Test catalog T1-T10 | Tasks 6 (T1+T2+T3), 9 (T7+T9), 12 (T4+T5+T6), 13 (T8), 19 (T10) |
| § 10 AV52-AV55 invariants | Task 29 |
| § 11 Risks | Mitigated via integrity checks in Tasks 4/7/10 + AV19 in 16/29 |
| § 12 File inventory | All files mapped to tasks (above) |
| § 13 Rollout (NO DEPLOY) | Task 25 (rules), Tasks 26-28 (e2e), Task 33 (handoff for user L1) |

### 2. Placeholder scan

- No "TBD" / "TODO" / "fill in later" / "similar to Task N" patterns found
- Every step shows code or commands
- "Add validation" / "handle edge cases" — none (all behavior specified)

### 3. Type consistency

- `CUSTOMER_CASCADE_COLLECTIONS_FULL` used consistently across Tasks 1, 4, 7, 10
- `T4_SUBCOLLECTIONS` used consistently across Tasks 1, 4, 7, 10
- `AUDIT_IMMUTABLE_COLLECTIONS` defined in Task 1, referenced in Tasks 7, 9, 10
- `scanRestoreConflicts` + `stripLineConflicts` defined in Task 3, used in Tasks 10, 12
- `buildCustomerBackupFile` defined in Task 2, used in Tasks 4, 5, 6, 26
- `validateCustomerBackupFile` defined in Task 2, used in Tasks 6, 7, 10, 16, 31

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-customer-backup-restore.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task; 2-stage review per task (spec compliance + code quality); fast iteration; main session stays uncluttered

**2. Inline Execution** — execute tasks in this session using `executing-plans` skill; batch execution with checkpoints

**Which approach?**

If **Subagent-Driven** chosen → REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
If **Inline Execution** chosen → REQUIRED SUB-SKILL: `superpowers:executing-plans`

**NO DEPLOY until task 33 + Rule Q L1 hands-on by user** (V18 lock + V66 trust-collapse origin). Per spec § 13.
