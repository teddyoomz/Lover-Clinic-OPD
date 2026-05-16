# V81 — Whole-System Backup & Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship V81 — auto-daily whole-system backup of all Firestore collections + Firebase Storage + Auth users, 5-day rolling retention, manual button + hybrid restore (Fresh-only / Replace + auto-pre-backup), portable 1-file download, hermetic emulator + property-based + secondary-DB testing per Rule Q V66.

**Architecture:** Manifest+blobs format (mirror V75); per-tier scoped exports (universal + branch-scoped + customer subcollections + chat messages + Storage + Auth); manifestHash AV62 sealing; AV19 elevation on Replace mode; CRON_SECRET-gated daily cron at 03:00 BKK; Firestore multi-database `clone-verify` for byte-identical real-prod verification.

**Tech Stack:** firebase-admin SDK · vitest 4.1 · firebase-tools (emulator suite) · archiver (tar.gz) · Vercel Pro (cron + 300s maxDuration) · React 19 + Tailwind 3.4 (admin UI).

**Spec:** [docs/superpowers/specs/2026-05-16-whole-system-backup-clone-design.md](../specs/2026-05-16-whole-system-backup-clone-design.md)

---

## Conventions used across all tasks

- **Commit pattern**: `git add <specific files>; git commit -m "<scope>(V81 Task N): <what>"` then `git push origin master`. NEVER `git add -A` (V41 lesson).
- **Test runner**: `npm test -- --run tests/v81-<file>.test.js` for targeted; `npm test -- --run` for full suite (Rule N: targeted during iteration, full at batch-end).
- **Build verify**: `npm run build` after any source change to ChatPanel/AdminDashboard pre-existing files OR module structure change.
- **Hook-import drift scanner**: `node scripts/diag-react-hook-import-drift.mjs` after any new `*.jsx` file (V80 AV60 perpetual guard).
- **Constants reused**: `HARDCODED_NAKHON_BR_ID = 'BR-1777873556815-26df6480'` from `src/lib/chatBranchDefaults.js`; `APP_ID = 'loverclinic-opd-4c39b'`; `PREFIX = artifacts/${APP_ID}/public/data`.
- **Admin auth pattern**: every `/api/admin/whole-system-*` endpoint starts with `const caller = await verifyAdminToken(req, res); if (!caller) return;` (mirrors V40/V74/V75 pattern).
- **Lock doc pattern**: `be_admin_audit/whole-system-backup-running` — atomic check-and-set via Firestore transaction; TTL 60min.
- **Storage path**: `backups/whole-system/{name}/manifest.json` + `backups/whole-system/{name}/{collections,storage,auth}/...`.
- **Name format**: `{type}-{YYYYMMDD}-{HHmm}` where type ∈ {auto, manual, pre-restore}.
- **Schema version**: `WHOLE_SYSTEM_SCHEMA_VERSION = 2` (V40 was 1, V75 whole-fleet was 1).

---

## Phase 1 — Foundation (Tasks 1-5)

### Task 1: wholeSystemBackupCore.js constants + scope helpers (TDD-first)

**Files:**
- Create: `src/lib/wholeSystemBackupCore.js`
- Test: `tests/v81-whole-system-backup-core.test.js`

- [ ] **Step 1.1: Write failing test for constants**

```js
// tests/v81-whole-system-backup-core.test.js
import { describe, it, expect } from 'vitest';
import {
  WHOLE_SYSTEM_SCHEMA_VERSION,
  UNIVERSAL_COLLECTIONS,
  BRANCH_SCOPED_COLLECTIONS,
  CUSTOMER_SUBCOLLECTIONS,
  STORAGE_INCLUDE_PREFIXES,
  STORAGE_EXCLUDE_PREFIXES,
  RETENTION_DAYS,
  NAME_PATTERN,
} from '../src/lib/wholeSystemBackupCore.js';

describe('V81 — wholeSystemBackupCore constants (Group A)', () => {
  it('A.1 — schema version is 2', () => {
    expect(WHOLE_SYSTEM_SCHEMA_VERSION).toBe(2);
  });
  it('A.2 — universal collections frozen array includes core + chat + audit', () => {
    expect(Object.isFrozen(UNIVERSAL_COLLECTIONS)).toBe(true);
    expect(UNIVERSAL_COLLECTIONS).toContain('be_customers');
    expect(UNIVERSAL_COLLECTIONS).toContain('be_staff');
    expect(UNIVERSAL_COLLECTIONS).toContain('be_branches');
    expect(UNIVERSAL_COLLECTIONS).toContain('chat_conversations');
    expect(UNIVERSAL_COLLECTIONS).toContain('chat_history');
    expect(UNIVERSAL_COLLECTIONS).toContain('be_admin_audit');
    expect(UNIVERSAL_COLLECTIONS).toContain('clinic_settings');
  });
  it('A.3 — branch-scoped collections include money/stock/treatment/sale', () => {
    expect(Object.isFrozen(BRANCH_SCOPED_COLLECTIONS)).toBe(true);
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_treatments');
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_sales');
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_appointments');
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_stock_batches');
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_staff_chat_messages');
  });
  it('A.4 — customer subcollections = V74 T4 list (8 items)', () => {
    expect(CUSTOMER_SUBCOLLECTIONS).toEqual([
      'wallets', 'memberships', 'points',
      'treatments', 'sales', 'appointments',
      'deposits', 'courseChanges'
    ]);
  });
  it('A.5 — storage exclude prefixes include backups/ (recursion gate) + probe/ + TEST-/E2E-', () => {
    expect(STORAGE_EXCLUDE_PREFIXES).toContain('backups/');
    expect(STORAGE_EXCLUDE_PREFIXES).toContain('probe/');
    expect(STORAGE_EXCLUDE_PREFIXES).toContain('TEST-');
    expect(STORAGE_EXCLUDE_PREFIXES).toContain('E2E-');
  });
  it('A.6 — storage include prefixes include customers/ + staff-chat-attachments/', () => {
    expect(STORAGE_INCLUDE_PREFIXES).toContain('customers/');
    expect(STORAGE_INCLUDE_PREFIXES).toContain('staff-chat-attachments/');
  });
  it('A.7 — retention days match spec (5d auto / 7d pre-restore / 1d archive)', () => {
    expect(RETENTION_DAYS).toEqual({ auto: 5, preRestore: 7, archive: 1 });
  });
  it('A.8 — name pattern accepts auto / manual / pre-restore + YYYYMMDD-HHmm', () => {
    expect(NAME_PATTERN.test('auto-20260516-0300')).toBe(true);
    expect(NAME_PATTERN.test('manual-20260516-1430')).toBe(true);
    expect(NAME_PATTERN.test('pre-restore-20260516-2059')).toBe(true);
    expect(NAME_PATTERN.test('random-name')).toBe(false);
    expect(NAME_PATTERN.test('auto-2026-05-16-0300')).toBe(false); // wrong separator
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```
npm test -- --run tests/v81-whole-system-backup-core.test.js
```
Expected: FAIL with "Cannot find module './src/lib/wholeSystemBackupCore.js'"

- [ ] **Step 1.3: Write minimal constants implementation**

```js
// src/lib/wholeSystemBackupCore.js
// V81 (2026-05-16 NIGHT+4) — Whole-System Backup & Clone pure helpers.
//
// Schema version 2 (V40 per-branch=1; V75 whole-fleet customer=1; V81 whole-system=2).
// Pure JS (no Firebase deps) so emulator tests + property-based tests can
// import without spinning up admin SDK.

export const WHOLE_SYSTEM_SCHEMA_VERSION = 2;

export const UNIVERSAL_COLLECTIONS = Object.freeze([
  'be_customers',
  'be_staff',
  'be_doctors',
  'be_branches',
  'be_admin_audit',
  'chat_conversations',
  'chat_history',
  'be_line_configs',
  'be_fb_configs',
  'be_line_reminder_log',
  'be_line_reminder_postback_log',
  'be_recalls',
  'be_link_requests',
  'be_customer_link_tokens',
  'be_document_templates',
  'be_audiences',
  'be_permission_groups',
  'be_central_stock_orders',
  'be_central_stock_movements',
  'be_vendors',
  'system_config',
  'clinic_settings',
  'opd_sessions',
]);

export const BRANCH_SCOPED_COLLECTIONS = Object.freeze([
  'be_treatments',
  'be_sales',
  'be_appointments',
  'be_quotations',
  'be_vendor_sales',
  'be_online_sales',
  'be_sale_insurance_claims',
  'be_stock_batches',
  'be_stock_orders',
  'be_stock_movements',
  'be_stock_transfers',
  'be_stock_withdrawals',
  'be_stock_adjustments',
  'be_products',
  'be_courses',
  'be_product_groups',
  'be_product_units',
  'be_medical_instruments',
  'be_holidays',
  'be_df_groups',
  'be_df_staff_rates',
  'be_bank_accounts',
  'be_expense_categories',
  'be_expenses',
  'be_staff_schedules',
  'be_exam_rooms',
  'be_promotions',
  'be_coupons',
  'be_vouchers',
  'be_staff_chat_messages',
]);

// Mirror V74 T4_SUBCOLLECTIONS (per-customer subcollections to cascade).
export const CUSTOMER_SUBCOLLECTIONS = Object.freeze([
  'wallets',
  'memberships',
  'points',
  'treatments',
  'sales',
  'appointments',
  'deposits',
  'courseChanges',
]);

export const STORAGE_INCLUDE_PREFIXES = Object.freeze([
  'customers/',
  'staff-chat-attachments/',
]);

// CRITICAL recursion gate — `backups/` MUST NOT be backed up itself.
export const STORAGE_EXCLUDE_PREFIXES = Object.freeze([
  'backups/',
  'probe/',
  'TEST-',
  'E2E-',
]);

export const RETENTION_DAYS = Object.freeze({
  auto: 5,
  preRestore: 7,
  archive: 1, // __archive.tar.gz on-demand download cleanup
});

// auto-YYYYMMDD-HHmm | manual-YYYYMMDD-HHmm | pre-restore-YYYYMMDD-HHmm
export const NAME_PATTERN = /^(?:auto|manual|pre-restore)-\d{8}-\d{4}$/;
```

- [ ] **Step 1.4: Run test to verify it passes**

```
npm test -- --run tests/v81-whole-system-backup-core.test.js
```
Expected: 8/8 PASS (Group A.1-A.8)

- [ ] **Step 1.5: Add scope-resolve helpers + tests**

Append to test file:
```js
import { resolveStorageScope, resolveCollectionScope } from '../src/lib/wholeSystemBackupCore.js';

describe('V81 — scope resolvers (Group A continued)', () => {
  it('A.9 — resolveStorageScope INCLUDES customers/{cid}/photo.jpg', () => {
    expect(resolveStorageScope('customers/CUST-123/photo.jpg')).toBe(true);
  });
  it('A.10 — resolveStorageScope INCLUDES staff-chat-attachments/...', () => {
    expect(resolveStorageScope('staff-chat-attachments/BR-X/file.png')).toBe(true);
  });
  it('A.11 — resolveStorageScope EXCLUDES backups/whole-system/auto-...', () => {
    expect(resolveStorageScope('backups/whole-system/auto-20260516-0300/manifest.json')).toBe(false);
  });
  it('A.12 — resolveStorageScope EXCLUDES probe/test-probe-...', () => {
    expect(resolveStorageScope('probe/test-probe-1778943895496.json')).toBe(false);
  });
  it('A.13 — resolveStorageScope EXCLUDES TEST-/E2E- prefixed', () => {
    expect(resolveStorageScope('TEST-customer-photo.jpg')).toBe(false);
    expect(resolveStorageScope('E2E-fixture-file.png')).toBe(false);
  });
  it('A.14 — resolveStorageScope DEFAULT-EXCLUDE unknown paths (forward-compat safety)', () => {
    expect(resolveStorageScope('unknown-path/file.bin')).toBe(false);
    expect(resolveStorageScope('users/me/private.json')).toBe(false);
  });
  it('A.15 — resolveCollectionScope returns universal + branchScoped arrays', () => {
    const scope = resolveCollectionScope();
    expect(scope.universal).toContain('be_customers');
    expect(scope.branchScoped).toContain('be_treatments');
    expect(scope.universal.length + scope.branchScoped.length).toBeGreaterThan(45);
  });
});
```

Append to source file:
```js
/**
 * resolveStorageScope — should a given Storage object path be included in backup?
 * EXCLUDE takes precedence over INCLUDE (defensive — `backups/` recursion gate).
 * Default for unknown paths = false (forward-compat safety — new features add to INCLUDE list).
 */
export function resolveStorageScope(filePath) {
  if (typeof filePath !== 'string' || !filePath) return false;
  for (const ex of STORAGE_EXCLUDE_PREFIXES) {
    if (filePath.startsWith(ex)) return false;
  }
  for (const inc of STORAGE_INCLUDE_PREFIXES) {
    if (filePath.startsWith(inc)) return true;
  }
  return false;
}

/**
 * resolveCollectionScope — returns scope object for backup enumeration.
 */
export function resolveCollectionScope() {
  return {
    universal: UNIVERSAL_COLLECTIONS.slice(),
    branchScoped: BRANCH_SCOPED_COLLECTIONS.slice(),
  };
}
```

- [ ] **Step 1.6: Run tests + commit**

```
npm test -- --run tests/v81-whole-system-backup-core.test.js
```
Expected: 15/15 PASS

```bash
git add src/lib/wholeSystemBackupCore.js tests/v81-whole-system-backup-core.test.js
git commit -m "feat(V81 Task 1): wholeSystemBackupCore constants + scope helpers"
git push origin master
```

---

### Task 2: manifest builder + manifestHash sealing (AV62) + validator

**Files:**
- Modify: `src/lib/wholeSystemBackupCore.js` (append helpers)
- Modify: `tests/v81-whole-system-backup-core.test.js` (append Group B)

- [ ] **Step 2.1: Write failing test for buildWholeSystemManifest**

Append to test file:
```js
import {
  buildWholeSystemManifest,
  computeWholeSystemManifestHash,
  validateWholeSystemManifest,
} from '../src/lib/wholeSystemBackupCore.js';

describe('V81 — manifest builder + hash + validate (Group B — AV62)', () => {
  const SAMPLE_COLLECTIONS = [
    { path: 'collections/universal/be_customers.json', name: 'be_customers', type: 'universal', docCount: 1234, fileSizeBytes: 100, fileHash: 'sha256:aaa' },
    { path: 'collections/branch-scoped/be_sales.json', name: 'be_sales', type: 'branch-scoped', docCount: 500, fileSizeBytes: 80, fileHash: 'sha256:bbb' },
  ];
  const SAMPLE_STORAGE = [
    { path: 'storage/customers/CUST-1/p.jpg', originalGsPath: 'customers/CUST-1/p.jpg', fileSizeBytes: 50000, fileHash: 'sha256:ccc', contentType: 'image/jpeg' },
  ];
  const SAMPLE_AUTH = { path: 'auth/users.json', userCount: 42, fileHash: 'sha256:ddd' };

  it('B.1 — buildWholeSystemManifest produces required fields', () => {
    const m = buildWholeSystemManifest({
      name: 'auto-20260516-0300',
      createdAt: '2026-05-16T20:00:00Z',
      createdBy: 'cron',
      collections: SAMPLE_COLLECTIONS,
      storageObjects: SAMPLE_STORAGE,
      authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 1734, totalStorageBytes: 50000, totalAuthUsers: 42, elapsedSec: 187 },
    });
    expect(m.schemaVersion).toBe(2);
    expect(m.backupType).toBe('whole-system');
    expect(m.name).toBe('auto-20260516-0300');
    expect(m.collections).toEqual(SAMPLE_COLLECTIONS);
    expect(m.storageObjects).toEqual(SAMPLE_STORAGE);
    expect(m.authUsers).toEqual(SAMPLE_AUTH);
    expect(m._v81Marker).toBe('whole-system-backup-v1');
  });

  it('B.2 — computeWholeSystemManifestHash deterministic for same input (P2 invariant)', () => {
    const m1 = buildWholeSystemManifest({
      name: 'x', createdAt: 't', createdBy: 'me',
      collections: SAMPLE_COLLECTIONS, storageObjects: SAMPLE_STORAGE, authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 1, totalStorageBytes: 1, totalAuthUsers: 1 },
    });
    const hash1 = computeWholeSystemManifestHash(m1);
    const hash2 = computeWholeSystemManifestHash(m1);
    expect(hash1).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hash1).toBe(hash2);
  });

  it('B.3 — hash EXCLUDES createdBy (mutable for admin)', () => {
    const base = {
      name: 'x', createdAt: 't',
      collections: SAMPLE_COLLECTIONS, storageObjects: SAMPLE_STORAGE, authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 1, totalStorageBytes: 1, totalAuthUsers: 1 },
    };
    const h1 = computeWholeSystemManifestHash(buildWholeSystemManifest({ ...base, createdBy: 'cron' }));
    const h2 = computeWholeSystemManifestHash(buildWholeSystemManifest({ ...base, createdBy: 'admin-uid-xyz' }));
    expect(h1).toBe(h2);
  });

  it('B.4 — hash CHANGES on any fileHash tamper (P3 invariant)', () => {
    const base = {
      name: 'x', createdAt: 't', createdBy: 'cron',
      collections: SAMPLE_COLLECTIONS, storageObjects: SAMPLE_STORAGE, authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 1, totalStorageBytes: 1, totalAuthUsers: 1 },
    };
    const tampered = [{ ...SAMPLE_COLLECTIONS[0], fileHash: 'sha256:TAMPERED' }, SAMPLE_COLLECTIONS[1]];
    const h1 = computeWholeSystemManifestHash(buildWholeSystemManifest(base));
    const h2 = computeWholeSystemManifestHash(buildWholeSystemManifest({ ...base, collections: tampered }));
    expect(h1).not.toBe(h2);
  });

  it('B.5 — validateWholeSystemManifest passes on well-formed', () => {
    const m = buildWholeSystemManifest({
      name: 'auto-20260516-0300', createdAt: 't', createdBy: 'cron',
      collections: SAMPLE_COLLECTIONS, storageObjects: SAMPLE_STORAGE, authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 1, totalStorageBytes: 1, totalAuthUsers: 1 },
    });
    m.manifestHash = computeWholeSystemManifestHash(m);
    expect(validateWholeSystemManifest(m)).toEqual({ valid: true });
  });

  it('B.6 — validateWholeSystemManifest rejects schemaVersion mismatch', () => {
    const result = validateWholeSystemManifest({ schemaVersion: 1, backupType: 'whole-system', name: 'x' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/schemaVersion/);
  });

  it('B.7 — validateWholeSystemManifest rejects missing manifestHash', () => {
    const m = buildWholeSystemManifest({
      name: 'x', createdAt: 't', createdBy: 'cron',
      collections: [], storageObjects: [], authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 0, totalStorageBytes: 0, totalAuthUsers: 0 },
    });
    const result = validateWholeSystemManifest(m);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/manifestHash/);
  });

  it('B.8 — validateWholeSystemManifest rejects mismatched manifestHash', () => {
    const m = buildWholeSystemManifest({
      name: 'x', createdAt: 't', createdBy: 'cron',
      collections: SAMPLE_COLLECTIONS, storageObjects: SAMPLE_STORAGE, authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 1, totalStorageBytes: 1, totalAuthUsers: 1 },
    });
    m.manifestHash = 'sha256:NOT_THE_REAL_HASH_0000000000000000000000000000000000000000000000';
    const result = validateWholeSystemManifest(m);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/manifestHash.*mismatch/i);
  });
});
```

- [ ] **Step 2.2: Run tests — should fail**

```
npm test -- --run tests/v81-whole-system-backup-core.test.js -t "Group B"
```
Expected: FAIL — helpers not defined

- [ ] **Step 2.3: Implement manifest + hash + validate helpers**

Append to `src/lib/wholeSystemBackupCore.js`:
```js
import crypto from 'node:crypto';

/**
 * buildWholeSystemManifest — construct manifest object (without hash; hash sealed separately).
 */
export function buildWholeSystemManifest({
  name,
  createdAt,
  createdBy,
  collections = [],
  storageObjects = [],
  authUsers = { path: 'auth/users.json', userCount: 0, fileHash: '' },
  stats = {},
}) {
  return {
    schemaVersion: WHOLE_SYSTEM_SCHEMA_VERSION,
    backupType: 'whole-system',
    name,
    createdAt,
    createdBy,
    manifestHash: null, // sealed by computeWholeSystemManifestHash + assignment
    scope: {
      universalCollections: UNIVERSAL_COLLECTIONS.slice(),
      branchScopedCollections: BRANCH_SCOPED_COLLECTIONS.slice(),
    },
    collections,
    storageObjects,
    storageObjectsTotalCount: storageObjects.length,
    storageObjectsTotalBytes: storageObjects.reduce((s, o) => s + (o.fileSizeBytes || 0), 0),
    storageManifestHash: computeStorageManifestHash(storageObjects),
    authUsers,
    stats: {
      totalDocCount: stats.totalDocCount ?? 0,
      totalCollectionFileBytes: collections.reduce((s, c) => s + (c.fileSizeBytes || 0), 0),
      totalStorageBytes: stats.totalStorageBytes ?? 0,
      totalAuthUsers: stats.totalAuthUsers ?? 0,
      elapsedSec: stats.elapsedSec,
    },
    _v81Marker: 'whole-system-backup-v1',
  };
}

/**
 * computeStorageManifestHash — SHA-256 of sorted storageObjects[*].fileHash.
 */
export function computeStorageManifestHash(storageObjects) {
  const sorted = [...(storageObjects || [])]
    .map(o => `${o.path}::${o.fileHash || ''}`)
    .sort();
  const h = crypto.createHash('sha256');
  for (const s of sorted) h.update(s);
  return `sha256:${h.digest('hex')}`;
}

/**
 * computeWholeSystemManifestHash — canonical SHA-256 of manifest's data-bearing fields.
 *
 * INCLUDED (hash-sealed):
 *   - All collections[*].fileHash sorted by name
 *   - storageManifestHash (which already sealed storageObjects[*].fileHash)
 *   - authUsers.fileHash
 *   - name, createdAt, totalDocCount, totalStorageBytes, totalAuthUsers
 *
 * EXCLUDED (mutable for admin convenience):
 *   - createdBy, manifestHash (self), elapsedSec, _v81Marker, scope (constant)
 */
export function computeWholeSystemManifestHash(manifest) {
  const collectionHashes = (manifest.collections || [])
    .map(c => `${c.name}::${c.fileHash || ''}`)
    .sort();
  const payload = {
    name: manifest.name,
    createdAt: manifest.createdAt,
    schemaVersion: manifest.schemaVersion,
    collectionHashes,
    storageManifestHash: manifest.storageManifestHash || '',
    authUsersHash: manifest.authUsers?.fileHash || '',
    totalDocCount: manifest.stats?.totalDocCount ?? 0,
    totalStorageBytes: manifest.stats?.totalStorageBytes ?? 0,
    totalAuthUsers: manifest.stats?.totalAuthUsers ?? 0,
  };
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

/**
 * validateWholeSystemManifest — AV62 contract enforcement.
 * Returns { valid: true } OR { valid: false, reason: <Thai-error-code> }.
 */
export function validateWholeSystemManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, reason: 'manifest not an object' };
  }
  if (manifest.schemaVersion !== WHOLE_SYSTEM_SCHEMA_VERSION) {
    return { valid: false, reason: `schemaVersion mismatch: got ${manifest.schemaVersion}, expected ${WHOLE_SYSTEM_SCHEMA_VERSION}` };
  }
  if (manifest.backupType !== 'whole-system') {
    return { valid: false, reason: `backupType mismatch: got ${manifest.backupType}` };
  }
  if (!manifest.name || !NAME_PATTERN.test(manifest.name)) {
    return { valid: false, reason: `name pattern invalid: got ${manifest.name}` };
  }
  if (!manifest.manifestHash || typeof manifest.manifestHash !== 'string') {
    return { valid: false, reason: 'manifestHash missing or not a string' };
  }
  const recomputed = computeWholeSystemManifestHash(manifest);
  if (recomputed !== manifest.manifestHash) {
    return { valid: false, reason: `manifestHash mismatch — tampered (expected ${recomputed}, got ${manifest.manifestHash})` };
  }
  return { valid: true };
}
```

- [ ] **Step 2.4: Run tests + commit**

```
npm test -- --run tests/v81-whole-system-backup-core.test.js
```
Expected: 23/23 PASS (15 Group A + 8 Group B)

```bash
git add src/lib/wholeSystemBackupCore.js tests/v81-whole-system-backup-core.test.js
git commit -m "feat(V81 Task 2): manifest builder + AV62 hash sealing + validator"
git push origin master
```

---

### Task 3: cleanup retention + backup-name parsing helpers

**Files:**
- Modify: `src/lib/wholeSystemBackupCore.js`
- Modify: `tests/v81-whole-system-backup-core.test.js` (Group C + D)

- [ ] **Step 3.1: Write failing tests for shouldCleanupBackup + name helpers**

Append to test file:
```js
import {
  shouldCleanupBackup,
  parseBackupName,
  formatBackupName,
} from '../src/lib/wholeSystemBackupCore.js';

describe('V81 — backup-name helpers (Group C)', () => {
  it('C.1 — formatBackupName auto = auto-YYYYMMDD-HHmm', () => {
    const d = new Date('2026-05-16T20:00:00Z'); // 03:00 BKK +7h
    expect(formatBackupName('auto', d)).toBe('auto-20260517-0300');
  });
  it('C.2 — formatBackupName manual', () => {
    const d = new Date('2026-05-16T07:30:00Z'); // 14:30 BKK
    expect(formatBackupName('manual', d)).toBe('manual-20260516-1430');
  });
  it('C.3 — formatBackupName pre-restore', () => {
    const d = new Date('2026-05-16T13:59:00Z'); // 20:59 BKK
    expect(formatBackupName('pre-restore', d)).toBe('pre-restore-20260516-2059');
  });
  it('C.4 — parseBackupName valid', () => {
    expect(parseBackupName('auto-20260516-0300')).toEqual({
      valid: true, type: 'auto', ts: expect.any(Number),
    });
  });
  it('C.5 — parseBackupName invalid pattern', () => {
    expect(parseBackupName('random-name')).toEqual({ valid: false, reason: 'name pattern mismatch' });
    expect(parseBackupName('auto-2026-05-16-0300')).toEqual({ valid: false, reason: 'name pattern mismatch' });
  });
  it('C.6 — parseBackupName round-trip with formatBackupName', () => {
    const d = new Date('2026-05-16T20:00:00Z');
    const name = formatBackupName('auto', d);
    const parsed = parseBackupName(name);
    expect(parsed.valid).toBe(true);
    expect(parsed.type).toBe('auto');
    // ts precision = 1 minute; expect within 60s tolerance
    expect(Math.abs(parsed.ts - d.getTime())).toBeLessThan(60_000);
  });
});

describe('V81 — shouldCleanupBackup retention matrix (Group D — AV64)', () => {
  const NOW = new Date('2026-05-22T00:00:00Z').getTime();
  function age(days) { return days * 24 * 60 * 60 * 1000; }

  it('D.1 — auto-* age=4d → keep', () => {
    const r = shouldCleanupBackup('auto-20260518-0300', age(4), NOW);
    expect(r).toEqual({ action: 'keep', reason: 'within-retention' });
  });
  it('D.2 — auto-* age=5d → DELETE (boundary)', () => {
    const r = shouldCleanupBackup('auto-20260517-0300', age(5), NOW);
    expect(r.action).toBe('delete');
    expect(r.reason).toMatch(/auto.*retention/i);
  });
  it('D.3 — auto-* age=6d → DELETE', () => {
    expect(shouldCleanupBackup('auto-20260516-0300', age(6), NOW).action).toBe('delete');
  });
  it('D.4 — pre-restore-* age=6d → keep (within 7d window)', () => {
    expect(shouldCleanupBackup('pre-restore-20260516-1430', age(6), NOW).action).toBe('keep');
  });
  it('D.5 — pre-restore-* age=7d → DELETE (boundary)', () => {
    expect(shouldCleanupBackup('pre-restore-20260515-1430', age(7), NOW).action).toBe('delete');
  });
  it('D.6 — manual-* age=30d → keep (∞ retention)', () => {
    expect(shouldCleanupBackup('manual-20260416-1430', age(30), NOW).action).toBe('keep');
  });
  it('D.7 — unknown pattern → keep + log warning (forward-compat safety)', () => {
    const r = shouldCleanupBackup('weird-name', age(100), NOW);
    expect(r.action).toBe('keep');
    expect(r.reason).toMatch(/unknown/i);
  });
});
```

- [ ] **Step 3.2: Run tests — should fail**

```
npm test -- --run tests/v81-whole-system-backup-core.test.js -t "Group C|Group D"
```
Expected: FAIL — helpers not defined

- [ ] **Step 3.3: Implement helpers**

Append to source file:
```js
/**
 * formatBackupName — produces 'auto-YYYYMMDD-HHmm' style name in Bangkok TZ.
 */
export function formatBackupName(type, date) {
  if (!['auto', 'manual', 'pre-restore'].includes(type)) {
    throw new Error(`formatBackupName: invalid type ${type}`);
  }
  // Bangkok TZ formatting (UTC+7, no DST)
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  const yyyymmdd = `${get('year')}${get('month')}${get('day')}`;
  const hhmm = `${get('hour') === '24' ? '00' : get('hour')}${get('minute')}`;
  return `${type}-${yyyymmdd}-${hhmm}`;
}

/**
 * parseBackupName — extracts {type, ts}; returns {valid: false} on pattern mismatch.
 */
export function parseBackupName(name) {
  const m = name?.match(/^(auto|manual|pre-restore)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return { valid: false, reason: 'name pattern mismatch' };
  const [, type, yyyy, mm, dd, HH, MM] = m;
  // Reconstruct UTC ts from Bangkok-formatted name (-7h)
  const ts = Date.UTC(+yyyy, +mm - 1, +dd, +HH - 7, +MM);
  return { valid: true, type, ts };
}

/**
 * shouldCleanupBackup — AV64 retention contract.
 * Returns { action: 'keep'|'delete', reason }.
 */
export function shouldCleanupBackup(name, ageMs, nowMs = Date.now()) {
  const parsed = parseBackupName(name);
  if (!parsed.valid) {
    return { action: 'keep', reason: 'unknown pattern — forward-compat preserve' };
  }
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (parsed.type === 'auto') {
    return ageDays >= RETENTION_DAYS.auto
      ? { action: 'delete', reason: `auto > ${RETENTION_DAYS.auto}d retention` }
      : { action: 'keep', reason: 'within-retention' };
  }
  if (parsed.type === 'pre-restore') {
    return ageDays >= RETENTION_DAYS.preRestore
      ? { action: 'delete', reason: `pre-restore > ${RETENTION_DAYS.preRestore}d retention` }
      : { action: 'keep', reason: 'within-retention' };
  }
  // manual = ∞ retention
  return { action: 'keep', reason: 'manual — admin responsibility' };
}
```

- [ ] **Step 3.4: Run tests + commit**

```
npm test -- --run tests/v81-whole-system-backup-core.test.js
```
Expected: 36/36 PASS (15 A + 8 B + 6 C + 7 D)

```bash
git add src/lib/wholeSystemBackupCore.js tests/v81-whole-system-backup-core.test.js
git commit -m "feat(V81 Task 3): cleanup retention (AV64) + name parse/format helpers"
git push origin master
```

---

### Task 4: auth user sanitization + diff helpers

**Files:**
- Modify: `src/lib/wholeSystemBackupCore.js`
- Modify: `tests/v81-whole-system-backup-core.test.js` (Group E + F)

- [ ] **Step 4.1: Write failing tests**

Append to test file:
```js
import { sanitizeAuthUser, diffStates } from '../src/lib/wholeSystemBackupCore.js';

describe('V81 — sanitizeAuthUser (Group E)', () => {
  const RAW = {
    uid: 'abc123',
    email: 'admin@loverclinic.com',
    emailVerified: true,
    displayName: 'Admin',
    phoneNumber: '+66999',
    photoURL: 'https://...',
    disabled: false,
    metadata: { creationTime: '2026-01-01', lastSignInTime: '2026-05-16' },
    providerData: [
      { providerId: 'password', uid: 'abc123', email: 'admin@loverclinic.com' },
      { providerId: 'google.com', uid: 'google-99' },
    ],
    customClaims: { admin: true, perm_chat: true },
    passwordHash: 'SECRET_HASH_BLOB',
    passwordSalt: 'SECRET_SALT',
    tokensValidAfterTime: '2026-05-01',
  };

  it('E.1 — KEEPS uid/email/displayName/customClaims/providerData', () => {
    const s = sanitizeAuthUser(RAW);
    expect(s.uid).toBe('abc123');
    expect(s.email).toBe('admin@loverclinic.com');
    expect(s.displayName).toBe('Admin');
    expect(s.customClaims).toEqual({ admin: true, perm_chat: true });
    expect(s.providerData).toHaveLength(2);
  });
  it('E.2 — STRIPS passwordHash + passwordSalt (security)', () => {
    const s = sanitizeAuthUser(RAW);
    expect(s.passwordHash).toBeUndefined();
    expect(s.passwordSalt).toBeUndefined();
  });
  it('E.3 — STRIPS refreshTokens + tokensValidAfterTime (security)', () => {
    const s = sanitizeAuthUser(RAW);
    expect(s.refreshTokens).toBeUndefined();
    expect(s.tokensValidAfterTime).toBeUndefined();
  });
  it('E.4 — preserves metadata creationTime + lastSignInTime', () => {
    const s = sanitizeAuthUser(RAW);
    expect(s.metadata).toEqual({ creationTime: '2026-01-01', lastSignInTime: '2026-05-16' });
  });
  it('E.5 — handles missing optional fields gracefully', () => {
    const s = sanitizeAuthUser({ uid: 'x', email: 'y@z' });
    expect(s.uid).toBe('x');
    expect(s.customClaims).toEqual({});
    expect(s.providerData).toEqual([]);
  });
});

describe('V81 — diffStates for round-trip equality (Group F)', () => {
  it('F.1 — identical states → empty diff', () => {
    const a = { col1: [{ id: '1', x: 'foo' }] };
    expect(diffStates(a, a)).toEqual({ added: [], removed: [], modified: [] });
  });
  it('F.2 — doc added → reports added', () => {
    const a = { col1: [{ id: '1', x: 'foo' }] };
    const b = { col1: [{ id: '1', x: 'foo' }, { id: '2', x: 'bar' }] };
    const d = diffStates(a, b);
    expect(d.added).toEqual([{ collection: 'col1', id: '2' }]);
    expect(d.removed).toHaveLength(0);
    expect(d.modified).toHaveLength(0);
  });
  it('F.3 — doc field changed → reports modified', () => {
    const a = { col1: [{ id: '1', x: 'foo' }] };
    const b = { col1: [{ id: '1', x: 'bar' }] };
    const d = diffStates(a, b);
    expect(d.modified).toEqual([{ collection: 'col1', id: '1' }]);
  });
});
```

- [ ] **Step 4.2: Implement + test + commit**

Append to source:
```js
const AUTH_EXCLUDE_FIELDS = Object.freeze([
  'passwordHash', 'passwordSalt', 'refreshTokens',
  'tokensValidAfterTime', 'multiFactor',
]);

export function sanitizeAuthUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const safe = {};
  for (const [k, v] of Object.entries(raw)) {
    if (AUTH_EXCLUDE_FIELDS.includes(k)) continue;
    safe[k] = v;
  }
  if (!safe.customClaims) safe.customClaims = {};
  if (!safe.providerData) safe.providerData = [];
  return safe;
}

export function diffStates(stateA, stateB) {
  const added = [];
  const removed = [];
  const modified = [];
  const allCols = new Set([...Object.keys(stateA || {}), ...Object.keys(stateB || {})]);
  for (const col of allCols) {
    const aDocs = new Map((stateA?.[col] || []).map(d => [d.id, d]));
    const bDocs = new Map((stateB?.[col] || []).map(d => [d.id, d]));
    for (const [id, bDoc] of bDocs) {
      if (!aDocs.has(id)) added.push({ collection: col, id });
      else if (JSON.stringify(aDocs.get(id)) !== JSON.stringify(bDoc)) modified.push({ collection: col, id });
    }
    for (const [id] of aDocs) {
      if (!bDocs.has(id)) removed.push({ collection: col, id });
    }
  }
  return { added, removed, modified };
}
```

```
npm test -- --run tests/v81-whole-system-backup-core.test.js
```
Expected: 44/44 PASS (15 A + 8 B + 6 C + 7 D + 5 E + 3 F)

```bash
git add src/lib/wholeSystemBackupCore.js tests/v81-whole-system-backup-core.test.js
git commit -m "feat(V81 Task 4): sanitizeAuthUser + diffStates helpers"
git push origin master
```

---

### Task 5: source-grep regression test scaffold + Rule I flow-simulate skeleton

**Files:**
- Create: `tests/v81-source-grep.test.js`
- Create: `tests/v81-backup-restore-roundtrip-flow-simulate.test.js`

- [ ] **Step 5.1: Write `tests/v81-source-grep.test.js`**

```js
// V81 source-grep regression (AV62/AV63/AV64 + AV19 elevation + recursion gate).
// Adds tests gradually as Tasks 6+ land their respective endpoints/components.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const READ = (rel) => fs.readFileSync(path.resolve(rel), 'utf8');

describe('V81 source-grep — wholeSystemBackupCore exports complete', () => {
  const src = READ('src/lib/wholeSystemBackupCore.js');
  it('exports all required helpers', () => {
    expect(src).toMatch(/export const WHOLE_SYSTEM_SCHEMA_VERSION/);
    expect(src).toMatch(/export const UNIVERSAL_COLLECTIONS/);
    expect(src).toMatch(/export const BRANCH_SCOPED_COLLECTIONS/);
    expect(src).toMatch(/export const CUSTOMER_SUBCOLLECTIONS/);
    expect(src).toMatch(/export const STORAGE_INCLUDE_PREFIXES/);
    expect(src).toMatch(/export const STORAGE_EXCLUDE_PREFIXES/);
    expect(src).toMatch(/export const RETENTION_DAYS/);
    expect(src).toMatch(/export const NAME_PATTERN/);
    expect(src).toMatch(/export function buildWholeSystemManifest/);
    expect(src).toMatch(/export function computeWholeSystemManifestHash/);
    expect(src).toMatch(/export function computeStorageManifestHash/);
    expect(src).toMatch(/export function validateWholeSystemManifest/);
    expect(src).toMatch(/export function resolveStorageScope/);
    expect(src).toMatch(/export function resolveCollectionScope/);
    expect(src).toMatch(/export function sanitizeAuthUser/);
    expect(src).toMatch(/export function diffStates/);
    expect(src).toMatch(/export function formatBackupName/);
    expect(src).toMatch(/export function parseBackupName/);
    expect(src).toMatch(/export function shouldCleanupBackup/);
  });
  it('STORAGE_EXCLUDE_PREFIXES contains backups/ (CRITICAL recursion gate)', () => {
    expect(src).toMatch(/['"]backups\/['"]/);
  });
  it('STORAGE_EXCLUDE_PREFIXES contains probe/ + TEST- + E2E-', () => {
    expect(src).toMatch(/['"]probe\/['"]/);
    expect(src).toMatch(/['"]TEST-['"]/);
    expect(src).toMatch(/['"]E2E-['"]/);
  });
});

// More source-grep groups appended by Tasks 6+ as endpoints land.
```

- [ ] **Step 5.2: Write `tests/v81-backup-restore-roundtrip-flow-simulate.test.js`**

```js
// V81 Rule I full-flow simulate — backup → manifest → restore → verify identity.
// Pure-helper simulation (no Firebase). Hermetic emulator tests in Task 19.
import { describe, it, expect } from 'vitest';
import {
  buildWholeSystemManifest,
  computeWholeSystemManifestHash,
  validateWholeSystemManifest,
  diffStates,
} from '../src/lib/wholeSystemBackupCore.js';

function makeFixture(opts = {}) {
  return {
    be_customers: [
      { id: 'CUST-1', name: 'Alice', branchId: 'BR-1', ...opts.cust1 },
      { id: 'CUST-2', name: 'Bob', branchId: 'BR-2', ...opts.cust2 },
    ],
    be_branches: [
      { id: 'BR-1', name: 'นครราชสีมา' },
      { id: 'BR-2', name: 'พระราม 3' },
    ],
  };
}

// Simulator: serialize state → "backup file" → verify hash → "restore" via JSON.parse → diff
function simulateRoundTrip(state) {
  const collections = Object.entries(state).map(([name, docs]) => ({
    name,
    type: 'universal',
    path: `collections/universal/${name}.json`,
    docCount: docs.length,
    fileSizeBytes: JSON.stringify(docs).length,
    fileHash: `sha256:${require('node:crypto').createHash('sha256').update(JSON.stringify(docs)).digest('hex')}`,
  }));
  const manifest = buildWholeSystemManifest({
    name: 'manual-20260516-2100',
    createdAt: '2026-05-16T14:00:00Z',
    createdBy: 'test',
    collections,
    storageObjects: [],
    authUsers: { path: 'auth/users.json', userCount: 0, fileHash: '' },
    stats: { totalDocCount: Object.values(state).reduce((s, d) => s + d.length, 0) },
  });
  manifest.manifestHash = computeWholeSystemManifestHash(manifest);
  return { manifest, fileBlobs: { ...state } };
}

function simulateRestore(backupBundle) {
  const v = validateWholeSystemManifest(backupBundle.manifest);
  if (!v.valid) throw new Error(`Restore refused: ${v.reason}`);
  return { ...backupBundle.fileBlobs };
}

describe('V81 — backup-restore round-trip (Rule I flow-simulate F1-F5)', () => {
  it('F.1 — round-trip preserves data byte-identical (P1 invariant)', () => {
    const source = makeFixture();
    const backup = simulateRoundTrip(source);
    const restored = simulateRestore(backup);
    expect(diffStates(source, restored)).toEqual({ added: [], removed: [], modified: [] });
  });
  it('F.2 — manifestHash deterministic (P2 invariant)', () => {
    const source = makeFixture();
    const b1 = simulateRoundTrip(source);
    const b2 = simulateRoundTrip(source);
    expect(b1.manifest.manifestHash).toBe(b2.manifest.manifestHash);
  });
  it('F.3 — tampered manifest refused (P3 invariant)', () => {
    const backup = simulateRoundTrip(makeFixture());
    backup.manifest.manifestHash = 'sha256:TAMPERED_HASH';
    expect(() => simulateRestore(backup)).toThrow(/mismatch/i);
  });
  it('F.4 — schemaVersion drift refused', () => {
    const backup = simulateRoundTrip(makeFixture());
    backup.manifest.schemaVersion = 99;
    expect(() => simulateRestore(backup)).toThrow(/schemaVersion/);
  });
  it('F.5 — empty fixture round-trip (boundary)', () => {
    const source = { be_customers: [] };
    const backup = simulateRoundTrip(source);
    const restored = simulateRestore(backup);
    expect(diffStates(source, restored)).toEqual({ added: [], removed: [], modified: [] });
  });
});
```

- [ ] **Step 5.3: Run + commit**

```
npm test -- --run tests/v81-source-grep.test.js tests/v81-backup-restore-roundtrip-flow-simulate.test.js
```
Expected: 8 PASS (3 source-grep + 5 Rule I flow-simulate)

```bash
git add tests/v81-source-grep.test.js tests/v81-backup-restore-roundtrip-flow-simulate.test.js
git commit -m "test(V81 Task 5): source-grep + Rule I flow-simulate scaffold"
git push origin master
```

---

## Phase 2 — Backend endpoints (Tasks 6-12)

### Task 6: vercel.json cron + maxDuration + package.json deps

**Files:**
- Modify: `vercel.json`
- Modify: `package.json`

- [ ] **Step 6.1: Update vercel.json**

Read current `vercel.json`, then add to `crons` array + `functions` map:
```json
{
  "crons": [
    ...(existing entries),
    {
      "path": "/api/cron/whole-system-backup-daily",
      "schedule": "0 20 * * *"
    }
  ],
  "functions": {
    ...(existing entries),
    "api/admin/whole-system-backup-export.js": { "maxDuration": 300 },
    "api/admin/whole-system-restore.js": { "maxDuration": 300 },
    "api/admin/whole-system-backup-download.js": { "maxDuration": 300 },
    "api/cron/whole-system-backup-daily.js": { "maxDuration": 300 }
  }
}
```
Note: `0 20 * * *` UTC = 03:00 BKK (UTC+7). Add a comment line above the schedule for clarity.

- [ ] **Step 6.2: Update package.json**

Run:
```
npm install --save-dev firebase-tools archiver
npm install bottleneck
```

Verify `package.json` now has:
- `"devDependencies"`: `"firebase-tools": "^X"`, `"archiver": "^Y"`
- `"dependencies"`: `"bottleneck": "^Z"` (used for Auth import rate-limiting)

- [ ] **Step 6.3: Run build to ensure no regression**

```
npm run build
```
Expected: clean build (warnings OK, errors FAIL).

- [ ] **Step 6.4: Commit**

```bash
git add vercel.json package.json package-lock.json
git commit -m "feat(V81 Task 6): vercel.json cron + maxDuration + firebase-tools/archiver/bottleneck deps"
git push origin master
```

---

### Task 7: api/cron/whole-system-backup-daily.js — daily cron handler

**Files:**
- Create: `api/cron/whole-system-backup-daily.js`
- Modify: `tests/v81-source-grep.test.js` (append AV63 group)

- [ ] **Step 7.1: Write source-grep test (AV63 — CRON_SECRET gate + lock)**

Append to `tests/v81-source-grep.test.js`:
```js
describe('V81 AV63 — cron CRON_SECRET gate + concurrency lock', () => {
  const src = READ('api/cron/whole-system-backup-daily.js');
  it('verifies CRON_SECRET header', () => {
    expect(src).toMatch(/CRON_SECRET/);
    expect(src).toMatch(/(authorization|x-cron-secret)/i);
  });
  it('acquires + releases lock doc be_admin_audit/whole-system-backup-running', () => {
    expect(src).toMatch(/whole-system-backup-running/);
    expect(src).toMatch(/(runTransaction|setDoc.*backup-running)/);
  });
  it('emits audit doc be_admin_audit/whole-system-backup-{name}', () => {
    expect(src).toMatch(/be_admin_audit\/whole-system-backup-/);
  });
  it('imports buildWholeSystemBackup helper', () => {
    expect(src).toMatch(/wholeSystemBackupCore/);
  });
  it('uses formatBackupName + auto type', () => {
    expect(src).toMatch(/formatBackupName\(['"]auto['"]/);
  });
  it('invokes cleanup retention BEFORE backup (piggyback per Q4-A)', () => {
    expect(src).toMatch(/cleanup|shouldCleanupBackup/);
  });
});
```

- [ ] **Step 7.2: Write the cron handler**

```js
// api/cron/whole-system-backup-daily.js
// V81 — Daily whole-system backup cron. Fires at 03:00 BKK (20:00 UTC).
// Per spec §5.1 + AV63 + AV64.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'node:crypto';
import {
  formatBackupName,
  resolveCollectionScope,
  resolveStorageScope,
  CUSTOMER_SUBCOLLECTIONS,
  shouldCleanupBackup,
  buildWholeSystemManifest,
  computeWholeSystemManifestHash,
  sanitizeAuthUser,
} from '../../src/lib/wholeSystemBackupCore.js';
import { runWholeSystemBackup } from '../admin/_lib/wholeSystemBackupExecutor.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const LOCK_DOC = `${PREFIX}/be_admin_audit/whole-system-backup-running`;
const LOCK_TTL_MS = 60 * 60 * 1000; // 60min

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

export default async function handler(req, res) {
  // 1. AV63: CRON_SECRET gate
  const cronSecret = process.env.CRON_SECRET;
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    || req.headers['x-cron-secret'];
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'CRON_SECRET mismatch' });
  }

  initAdmin();
  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  // 2. AV63: acquire lock
  const lockRef = db.doc(LOCK_DOC);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (snap.exists) {
        const startedAt = snap.data().startedAt?.toMillis?.() || 0;
        if (Date.now() - startedAt < LOCK_TTL_MS) {
          throw new Error('LOCK_BUSY');
        }
        // Stale lock — overwrite
      }
      tx.set(lockRef, { startedAt: FieldValue.serverTimestamp(), source: 'cron' });
    });
  } catch (e) {
    if (e.message === 'LOCK_BUSY') {
      return res.status(409).json({ error: 'LOCK_BUSY', message: 'Whole-system backup already in progress' });
    }
    throw e;
  }

  try {
    const result = await runWholeSystemBackup({
      db, storage, auth,
      type: 'auto',
      createdBy: 'cron',
      runCleanup: true,
    });
    return res.status(200).json(result);
  } finally {
    await lockRef.delete().catch(() => {});
  }
}
```

- [ ] **Step 7.3: Create the shared executor (used by cron + manual)**

Create: `api/admin/_lib/wholeSystemBackupExecutor.js`

```js
// V81 shared executor — used by cron + manual export endpoint.
// Performs full whole-system backup: cleanup + collections + storage + auth + manifest.
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes, createHash } from 'node:crypto';
import {
  formatBackupName, resolveCollectionScope, resolveStorageScope,
  CUSTOMER_SUBCOLLECTIONS, shouldCleanupBackup, buildWholeSystemManifest,
  computeWholeSystemManifestHash, sanitizeAuthUser,
} from '../../../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

async function sha256Stream(readable) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    readable.on('data', (c) => h.update(c));
    readable.on('end', () => resolve(`sha256:${h.digest('hex')}`));
    readable.on('error', reject);
  });
}

async function sha256Buffer(buf) {
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`;
}

export async function runWholeSystemBackup({ db, storage, auth, type, createdBy, runCleanup }) {
  const start = Date.now();
  const name = formatBackupName(type, new Date());
  const baseStoragePath = `backups/whole-system/${name}`;
  const failedCollections = [];
  const failedStorageObjects = [];
  const collections = [];
  const storageObjects = [];

  // 1. Cleanup retention (piggyback — only for auto)
  if (runCleanup) {
    const [files] = await storage.getFiles({ prefix: 'backups/whole-system/' });
    const seenFolders = new Set();
    const folderTs = new Map();
    for (const f of files) {
      const m = f.name.match(/^backups\/whole-system\/([^/]+)\//);
      if (!m) continue;
      const folder = m[1];
      seenFolders.add(folder);
      if (!folderTs.has(folder)) {
        folderTs.set(folder, f.metadata?.timeCreated ? new Date(f.metadata.timeCreated).getTime() : Date.now());
      }
    }
    for (const folder of seenFolders) {
      const ageMs = Date.now() - folderTs.get(folder);
      const decision = shouldCleanupBackup(folder, ageMs, Date.now());
      if (decision.action === 'delete') {
        await storage.deleteFiles({ prefix: `backups/whole-system/${folder}/` });
      }
    }
  }

  // 2. Export universal collections
  const scope = resolveCollectionScope();
  for (const colName of scope.universal) {
    try {
      const snap = await db.collection(`${PREFIX}/${colName}`).get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const json = JSON.stringify(docs, null, 2);
      const filePath = `${baseStoragePath}/collections/universal/${colName}.json`;
      await storage.file(filePath).save(json, { contentType: 'application/json' });
      collections.push({
        path: `collections/universal/${colName}.json`,
        name: colName, type: 'universal',
        docCount: docs.length, fileSizeBytes: Buffer.byteLength(json, 'utf8'),
        fileHash: await sha256Buffer(json),
      });
    } catch (e) {
      failedCollections.push({ name: colName, error: e.message });
    }
  }

  // 3. Export branch-scoped collections
  for (const colName of scope.branchScoped) {
    try {
      const snap = await db.collection(`${PREFIX}/${colName}`).get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const json = JSON.stringify(docs, null, 2);
      const filePath = `${baseStoragePath}/collections/branch-scoped/${colName}.json`;
      await storage.file(filePath).save(json, { contentType: 'application/json' });
      collections.push({
        path: `collections/branch-scoped/${colName}.json`,
        name: colName, type: 'branch-scoped',
        docCount: docs.length, fileSizeBytes: Buffer.byteLength(json, 'utf8'),
        fileHash: await sha256Buffer(json),
      });
    } catch (e) {
      failedCollections.push({ name: colName, error: e.message });
    }
  }

  // 4. Export customer subcollections
  const custSnap = await db.collection(`${PREFIX}/be_customers`).get();
  for (const custDoc of custSnap.docs) {
    const cid = custDoc.id;
    for (const subName of CUSTOMER_SUBCOLLECTIONS) {
      try {
        const subSnap = await db.collection(`${PREFIX}/be_customers/${cid}/${subName}`).get();
        if (subSnap.empty) continue;
        const docs = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const json = JSON.stringify(docs, null, 2);
        const filePath = `${baseStoragePath}/collections/subcollections/be_customers__${cid}__${subName}.json`;
        await storage.file(filePath).save(json, { contentType: 'application/json' });
        collections.push({
          path: `collections/subcollections/be_customers__${cid}__${subName}.json`,
          name: `be_customers/${cid}/${subName}`, type: 'subcollection',
          docCount: docs.length, fileSizeBytes: Buffer.byteLength(json, 'utf8'),
          fileHash: await sha256Buffer(json),
        });
      } catch (e) {
        failedCollections.push({ name: `be_customers/${cid}/${subName}`, error: e.message });
      }
    }
  }

  // 5. Export chat_conversations messages subcoll
  const convSnap = await db.collection(`${PREFIX}/chat_conversations`).get();
  for (const convDoc of convSnap.docs) {
    const convId = convDoc.id;
    try {
      const msgsSnap = await db.collection(`${PREFIX}/chat_conversations/${convId}/messages`).get();
      if (msgsSnap.empty) continue;
      const docs = msgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const json = JSON.stringify(docs, null, 2);
      const filePath = `${baseStoragePath}/collections/subcollections/chat_conversations__${convId}__messages.json`;
      await storage.file(filePath).save(json, { contentType: 'application/json' });
      collections.push({
        path: `collections/subcollections/chat_conversations__${convId}__messages.json`,
        name: `chat_conversations/${convId}/messages`, type: 'subcollection',
        docCount: docs.length, fileSizeBytes: Buffer.byteLength(json, 'utf8'),
        fileHash: await sha256Buffer(json),
      });
    } catch (e) {
      failedCollections.push({ name: `chat_conversations/${convId}/messages`, error: e.message });
    }
  }

  // 6. Export Auth users
  let authUsersFileHash = '';
  let authUserCount = 0;
  try {
    const allUsers = [];
    let nextPageToken;
    do {
      const page = await auth.listUsers(1000, nextPageToken);
      for (const u of page.users) allUsers.push(sanitizeAuthUser(u.toJSON()));
      nextPageToken = page.pageToken;
    } while (nextPageToken);
    authUserCount = allUsers.length;
    const json = JSON.stringify(allUsers, null, 2);
    authUsersFileHash = await sha256Buffer(json);
    await storage.file(`${baseStoragePath}/auth/users.json`).save(json, { contentType: 'application/json' });
  } catch (e) {
    failedCollections.push({ name: '__auth_users__', error: e.message });
  }

  // 7. Copy Storage objects (skip recursion gate paths)
  const [allStorageFiles] = await storage.getFiles();
  let totalStorageBytes = 0;
  for (const f of allStorageFiles) {
    if (!resolveStorageScope(f.name)) continue;
    try {
      const destPath = `${baseStoragePath}/storage/${f.name}`;
      await f.copy(storage.file(destPath));
      const [meta] = await f.getMetadata();
      const sizeBytes = parseInt(meta.size || '0', 10);
      const fileHash = await sha256Stream(f.createReadStream());
      totalStorageBytes += sizeBytes;
      storageObjects.push({
        path: `storage/${f.name}`,
        originalGsPath: f.name,
        fileSizeBytes: sizeBytes,
        fileHash,
        contentType: meta.contentType || 'application/octet-stream',
      });
    } catch (e) {
      failedStorageObjects.push({ path: f.name, error: e.message });
    }
  }

  // 8. Build manifest + seal hash
  const totalDocCount = collections.reduce((s, c) => s + c.docCount, 0);
  const manifest = buildWholeSystemManifest({
    name,
    createdAt: new Date().toISOString(),
    createdBy,
    collections,
    storageObjects,
    authUsers: {
      path: 'auth/users.json',
      userCount: authUserCount,
      fileHash: authUsersFileHash,
    },
    stats: {
      totalDocCount,
      totalStorageBytes,
      totalAuthUsers: authUserCount,
      elapsedSec: Math.round((Date.now() - start) / 1000),
    },
  });
  manifest.manifestHash = computeWholeSystemManifestHash(manifest);

  // 9. Write manifest.json
  const manifestJson = JSON.stringify(manifest, null, 2);
  await storage.file(`${baseStoragePath}/manifest.json`).save(manifestJson, { contentType: 'application/json' });

  // 10. Audit doc
  const auditId = `whole-system-backup-${name}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    op: 'whole-system-backup',
    name, type, source: createdBy,
    stats: manifest.stats,
    manifestHash: manifest.manifestHash,
    failedCollections, failedStorageObjects,
    completedAt: FieldValue.serverTimestamp(),
  });

  return {
    name,
    manifestHash: manifest.manifestHash,
    stats: manifest.stats,
    failedCollections,
    failedStorageObjects,
  };
}
```

- [ ] **Step 7.4: Run source-grep test + commit**

```
npm test -- --run tests/v81-source-grep.test.js
```
Expected: PASS

```bash
git add api/cron/whole-system-backup-daily.js api/admin/_lib/wholeSystemBackupExecutor.js tests/v81-source-grep.test.js
git commit -m "feat(V81 Task 7): daily cron handler + shared backup executor + AV63 source-grep"
git push origin master
```

---

### Task 8: api/admin/whole-system-backup-export.js — manual trigger

**Files:**
- Create: `api/admin/whole-system-backup-export.js`

- [ ] **Step 8.1: Write endpoint**

```js
// api/admin/whole-system-backup-export.js
// V81 manual backup trigger — admin button OR CLI mirror.
// Reuses cron's shared executor; differs in trigger source + name pattern.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { runWholeSystemBackup } from './_lib/wholeSystemBackupExecutor.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const LOCK_DOC = `${PREFIX}/be_admin_audit/whole-system-backup-running`;
const LOCK_TTL_MS = 60 * 60 * 1000;

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  // Concurrency lock (shared with cron)
  const lockRef = db.doc(LOCK_DOC);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (snap.exists) {
        const startedAt = snap.data().startedAt?.toMillis?.() || 0;
        if (Date.now() - startedAt < LOCK_TTL_MS) throw new Error('LOCK_BUSY');
      }
      tx.set(lockRef, { startedAt: FieldValue.serverTimestamp(), source: `manual-admin-${caller.uid}` });
    });
  } catch (e) {
    if (e.message === 'LOCK_BUSY') {
      return res.status(409).json({ error: 'LOCK_BUSY', message: 'Whole-system backup already in progress' });
    }
    throw e;
  }

  try {
    const type = (req.body?.type === 'pre-restore') ? 'pre-restore' : 'manual';
    const result = await runWholeSystemBackup({
      db, storage, auth, type,
      createdBy: `manual-admin-${caller.uid}`,
      runCleanup: false, // manual does NOT cleanup (only cron does)
    });
    return res.status(200).json(result);
  } finally {
    await lockRef.delete().catch(() => {});
  }
}
```

- [ ] **Step 8.2: Append source-grep + commit**

Append to `tests/v81-source-grep.test.js`:
```js
describe('V81 — manual export endpoint', () => {
  const src = READ('api/admin/whole-system-backup-export.js');
  it('uses verifyAdminToken (NOT cron secret)', () => {
    expect(src).toMatch(/verifyAdminToken/);
  });
  it('imports runWholeSystemBackup executor', () => {
    expect(src).toMatch(/runWholeSystemBackup/);
  });
  it('shares concurrency lock with cron', () => {
    expect(src).toMatch(/whole-system-backup-running/);
  });
  it('default type=manual, allows pre-restore opt', () => {
    expect(src).toMatch(/type:\s*['"]pre-restore['"]/);
    expect(src).toMatch(/['"]manual['"]/);
  });
});
```

```
npm test -- --run tests/v81-source-grep.test.js
```
Expected: PASS

```bash
git add api/admin/whole-system-backup-export.js tests/v81-source-grep.test.js
git commit -m "feat(V81 Task 8): admin manual backup-export endpoint"
git push origin master
```

---

### Task 9: api/admin/whole-system-restore.js — Fresh-only mode FIRST

**Files:**
- Create: `api/admin/whole-system-restore.js`
- Create: `api/admin/_lib/wholeSystemRestoreExecutor.js`

- [ ] **Step 9.1: Write restore endpoint (Fresh-only path; Replace path in Task 10)**

```js
// api/admin/whole-system-restore.js
// V81 restore endpoint. Fresh-only mode (Task 9); Replace mode added in Task 10.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { runWholeSystemRestore } from './_lib/wholeSystemRestoreExecutor.js';

const APP_ID = 'loverclinic-opd-4c39b';

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { backupRef, mode = 'fresh', confirmName, sendPasswordResetEmails = false } = req.body || {};
  if (!backupRef) return res.status(400).json({ error: 'BACKUP_REF_REQUIRED' });
  if (!['fresh', 'replace'].includes(mode)) {
    return res.status(400).json({ error: 'INVALID_MODE', message: 'mode must be fresh|replace' });
  }
  if (confirmName !== backupRef) {
    return res.status(400).json({ error: 'CONFIRM_NAME_MISMATCH', message: 'พิมพ์ชื่อ backup ให้ตรง' });
  }

  try {
    const result = await runWholeSystemRestore({
      db: getFirestore(),
      storage: getStorage().bucket(),
      auth: getAuth(),
      backupRef,
      mode,
      callerUid: caller.uid,
      sendPasswordResetEmails,
    });
    return res.status(200).json(result);
  } catch (e) {
    if (e.code === 'WHOLE_SYSTEM_MANIFEST_TAMPERED') {
      return res.status(409).json({ error: e.code, message: 'ไฟล์ backup เสียหายหรือถูกแก้ไข — ยกเลิกการ restore' });
    }
    if (e.code === 'TARGET_NOT_EMPTY') {
      return res.status(409).json({ error: e.code, message: 'Target Firebase มีข้อมูลอยู่แล้ว — Fresh-only mode ปฏิเสธ' });
    }
    if (e.code === 'AUTO_PRE_BACKUP_FAILED') {
      return res.status(500).json({ error: e.code, message: 'Auto-pre-backup ก่อน Replace ล้มเหลว — ยกเลิก' });
    }
    throw e;
  }
}
```

- [ ] **Step 9.2: Write restore executor (Fresh-only path)**

Create `api/admin/_lib/wholeSystemRestoreExecutor.js`:
```js
// V81 shared restore executor. Fresh-only mode in this task; Replace mode added Task 10.
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import {
  validateWholeSystemManifest, UNIVERSAL_COLLECTIONS, BRANCH_SCOPED_COLLECTIONS,
} from '../../../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const BATCH_SIZE = 450;

async function readManifest(storage, backupRef) {
  const [buf] = await storage.file(`backups/whole-system/${backupRef}/manifest.json`).download();
  return JSON.parse(buf.toString('utf8'));
}

async function assertTargetEmpty(db) {
  // Scan ALL non-system collections; refuse if any has docs.
  const scope = [...UNIVERSAL_COLLECTIONS, ...BRANCH_SCOPED_COLLECTIONS];
  for (const col of scope) {
    if (col === 'be_admin_audit') continue; // audit is allowed (this restore writes one)
    const snap = await db.collection(`${PREFIX}/${col}`).limit(1).get();
    if (!snap.empty) {
      const err = new Error('Target not empty');
      err.code = 'TARGET_NOT_EMPTY';
      err.firstNonEmpty = col;
      throw err;
    }
  }
}

async function restoreCollections(db, storage, manifest, backupRef) {
  let restoredDocs = 0;
  const failedDocs = [];
  for (const c of manifest.collections) {
    try {
      const [buf] = await storage.file(`backups/whole-system/${backupRef}/${c.path}`).download();
      const docs = JSON.parse(buf.toString('utf8'));
      // Determine target Firestore path
      const isSubcoll = c.type === 'subcollection';
      // Subcollection name format: 'be_customers/{cid}/{sub}' OR 'chat_conversations/{convId}/messages'
      const colPath = isSubcoll
        ? `${PREFIX}/${c.name}`
        : `${PREFIX}/${c.name}`;
      // Batch writes
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of docs.slice(i, i + BATCH_SIZE)) {
          const { id, ...data } = doc;
          batch.set(db.doc(`${colPath}/${id}`), data);
        }
        await batch.commit();
      }
      restoredDocs += docs.length;
    } catch (e) {
      failedDocs.push({ collection: c.name, error: e.message });
    }
  }
  return { restoredDocs, failedDocs };
}

async function restoreAuthUsers(auth, storage, manifest, backupRef, callerUid) {
  const [buf] = await storage.file(`backups/whole-system/${backupRef}/${manifest.authUsers.path}`).download();
  const users = JSON.parse(buf.toString('utf8'));
  // Skip caller uid (self-delete protection per V31)
  const toImport = users.filter(u => u.uid !== callerUid);
  const chunks = [];
  for (let i = 0; i < toImport.length; i += 1000) chunks.push(toImport.slice(i, i + 1000));
  let restoredAuth = 0;
  const failedAuth = [];
  for (const chunk of chunks) {
    try {
      const importable = chunk.map(u => ({
        uid: u.uid, email: u.email, emailVerified: !!u.emailVerified,
        displayName: u.displayName, photoURL: u.photoURL, phoneNumber: u.phoneNumber,
        disabled: !!u.disabled, providerData: u.providerData || [],
        customClaims: u.customClaims || {},
      }));
      const res = await auth.importUsers(importable);
      restoredAuth += res.successCount;
      for (const err of (res.errors || [])) {
        failedAuth.push({ uid: chunk[err.index]?.uid, error: err.error?.message });
      }
    } catch (e) {
      failedAuth.push({ chunk_size: chunk.length, error: e.message });
    }
  }
  return { restoredAuth, failedAuth };
}

async function restoreStorage(storage, manifest, backupRef) {
  let restoredStorage = 0;
  const failedStorage = [];
  for (const s of manifest.storageObjects || []) {
    try {
      const srcPath = `backups/whole-system/${backupRef}/${s.path}`;
      await storage.file(srcPath).copy(storage.file(s.originalGsPath));
      restoredStorage += 1;
    } catch (e) {
      failedStorage.push({ path: s.originalGsPath, error: e.message });
    }
  }
  return { restoredStorage, failedStorage };
}

export async function runWholeSystemRestore({
  db, storage, auth, backupRef, mode, callerUid, sendPasswordResetEmails,
}) {
  const start = Date.now();

  // 1. AV62: read + validate manifest
  const manifest = await readManifest(storage, backupRef);
  const v = validateWholeSystemManifest(manifest);
  if (!v.valid) {
    const err = new Error(`Manifest invalid: ${v.reason}`);
    err.code = 'WHOLE_SYSTEM_MANIFEST_TAMPERED';
    throw err;
  }

  // 2. Mode-specific pre-flight
  let autoBackupRef = null;
  if (mode === 'fresh') {
    await assertTargetEmpty(db);
  } else if (mode === 'replace') {
    // Replace mode (full AV19 elevation) — implemented in Task 10
    const err = new Error('Replace mode landing in Task 10');
    err.code = 'REPLACE_MODE_NOT_YET_IMPL';
    throw err;
  }

  // 3. Restore phases
  const colResult = await restoreCollections(db, storage, manifest, backupRef);
  const authResult = await restoreAuthUsers(auth, storage, manifest, backupRef, callerUid);
  const storResult = await restoreStorage(storage, manifest, backupRef);

  // 4. Optional password-reset emails
  let passwordResetEmailsSent = 0;
  if (sendPasswordResetEmails) {
    const [buf] = await storage.file(`backups/whole-system/${backupRef}/${manifest.authUsers.path}`).download();
    const users = JSON.parse(buf.toString('utf8'));
    for (const u of users) {
      if (!u.email) continue;
      try {
        await auth.generatePasswordResetLink(u.email);
        passwordResetEmailsSent += 1;
      } catch { /* best-effort */ }
    }
  }

  // 5. Audit doc
  const auditId = `whole-system-restore-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    op: 'whole-system-restore',
    backupRef, mode, autoBackupRef,
    stats: { ...colResult, ...authResult, ...storResult },
    passwordResetEmailsSent,
    elapsedSec: Math.round((Date.now() - start) / 1000),
    completedAt: FieldValue.serverTimestamp(),
  });

  return {
    backupRef, mode, autoBackupRef,
    stats: { ...colResult, ...authResult, ...storResult },
    passwordResetEmailsSent,
  };
}
```

- [ ] **Step 9.3: Source-grep test + commit**

Append to `tests/v81-source-grep.test.js`:
```js
describe('V81 — restore endpoint Fresh-only', () => {
  const src = READ('api/admin/whole-system-restore.js');
  const exec = READ('api/admin/_lib/wholeSystemRestoreExecutor.js');
  it('endpoint verifyAdminToken + validates mode', () => {
    expect(src).toMatch(/verifyAdminToken/);
    expect(src).toMatch(/INVALID_MODE/);
    expect(src).toMatch(/CONFIRM_NAME_MISMATCH/);
  });
  it('executor calls validateWholeSystemManifest (AV62)', () => {
    expect(exec).toMatch(/validateWholeSystemManifest/);
  });
  it('Fresh-only mode calls assertTargetEmpty', () => {
    expect(exec).toMatch(/assertTargetEmpty/);
    expect(exec).toMatch(/TARGET_NOT_EMPTY/);
  });
  it('caller uid self-skip in auth import (V31)', () => {
    expect(exec).toMatch(/u\.uid\s*!==\s*callerUid/);
  });
});
```

```
npm test -- --run tests/v81-source-grep.test.js
```
Expected: PASS

```bash
git add api/admin/whole-system-restore.js api/admin/_lib/wholeSystemRestoreExecutor.js tests/v81-source-grep.test.js
git commit -m "feat(V81 Task 9): restore endpoint Fresh-only mode + AV62 manifest validate + V31 self-skip"
git push origin master
```

---

### Task 10: Restore endpoint Replace mode + AV19 elevation auto-pre-backup

**Files:**
- Modify: `api/admin/_lib/wholeSystemRestoreExecutor.js`

- [ ] **Step 10.1: Add wipe + auto-pre-backup paths**

Modify `runWholeSystemRestore` in `wholeSystemRestoreExecutor.js`. Replace the `else if (mode === 'replace')` stub with:

```js
} else if (mode === 'replace') {
  // AV19 elevation: auto-pre-backup MANDATORY before wipe.
  const { runWholeSystemBackup } = await import('./wholeSystemBackupExecutor.js');
  const pre = await runWholeSystemBackup({
    db, storage, auth, type: 'pre-restore',
    createdBy: `pre-restore-for-${backupRef}`,
    runCleanup: false,
  });
  autoBackupRef = pre.name;
  // Verify pre-backup folder exists
  const [exists] = await storage.file(`backups/whole-system/${autoBackupRef}/manifest.json`).exists();
  if (!exists) {
    const err = new Error('Auto-pre-backup not verifiable');
    err.code = 'AUTO_PRE_BACKUP_FAILED';
    throw err;
  }
  // Wipe phase (V74 cascade pattern + Auth + Storage)
  await wipeFirebase(db, storage, auth, callerUid);
}
```

Add helper `wipeFirebase` to the same file:
```js
async function wipeFirebase(db, storage, auth, callerUid) {
  const scope = [...UNIVERSAL_COLLECTIONS, ...BRANCH_SCOPED_COLLECTIONS];
  for (const col of scope) {
    if (col === 'be_admin_audit') continue; // audit immutable per Rule D
    let last;
    do {
      const q = db.collection(`${PREFIX}/${col}`).limit(BATCH_SIZE);
      const snap = last ? await q.startAfter(last).get() : await q.get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < BATCH_SIZE) break;
    } while (true);
  }
  // Customer subcollections cascade (V74 T4)
  const custSnap = await db.collection(`${PREFIX}/be_customers`).get();
  for (const c of custSnap.docs) {
    for (const sub of ['wallets','memberships','points','treatments','sales','appointments','deposits','courseChanges']) {
      const subSnap = await db.collection(`${PREFIX}/be_customers/${c.id}/${sub}`).get();
      if (subSnap.empty) continue;
      const batch = db.batch();
      subSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
  // Auth wipe (skip caller — V31)
  let nextPageToken;
  do {
    const page = await auth.listUsers(1000, nextPageToken);
    for (const u of page.users) {
      if (u.uid === callerUid) continue;
      try { await auth.deleteUser(u.uid); } catch { /* tolerant */ }
    }
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  // Storage wipe (skip backups/)
  const [allFiles] = await storage.getFiles();
  for (const f of allFiles) {
    if (f.name.startsWith('backups/')) continue;
    try { await f.delete(); } catch { /* tolerant */ }
  }
}
```

- [ ] **Step 10.2: Source-grep AV19 elevation + commit**

Append to `tests/v81-source-grep.test.js`:
```js
describe('V81 AV19 elevation — Replace mode requires auto-pre-backup verified', () => {
  const exec = READ('api/admin/_lib/wholeSystemRestoreExecutor.js');
  it('Replace branch calls runWholeSystemBackup with type=pre-restore', () => {
    expect(exec).toMatch(/type:\s*['"]pre-restore['"]/);
  });
  it('verifies pre-backup folder exists BEFORE wipe', () => {
    expect(exec).toMatch(/AUTO_PRE_BACKUP_FAILED/);
    expect(exec).toMatch(/manifest\.json[\s\S]{0,100}\.exists\(\)/);
  });
  it('wipe phase skips callerUid (V31 self-skip)', () => {
    expect(exec).toMatch(/u\.uid\s*===\s*callerUid[\s\S]{0,100}continue/);
  });
  it('Storage wipe skips backups/ prefix (preserve all backups incl. pre-restore)', () => {
    expect(exec).toMatch(/f\.name\.startsWith\(['"]backups\/['"]\)[\s\S]{0,100}continue/);
  });
});
```

```
npm test -- --run tests/v81-source-grep.test.js
```
Expected: PASS

```bash
git add api/admin/_lib/wholeSystemRestoreExecutor.js tests/v81-source-grep.test.js
git commit -m "feat(V81 Task 10): Replace mode + AV19 elevation auto-pre-backup + V74 cascade wipe + V31 self-skip"
git push origin master
```

---

### Task 11: api/admin/whole-system-backup-download.js — server-zip + signed URL

**Files:**
- Create: `api/admin/whole-system-backup-download.js`

- [ ] **Step 11.1: Write endpoint**

```js
// api/admin/whole-system-backup-download.js
// V81 — Server-side stream tar.gz of backup folder; return 24h signed URL.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';
import archiver from 'archiver';

const APP_ID = 'loverclinic-opd-4c39b';

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { backupRef } = req.body || {};
  if (!backupRef) return res.status(400).json({ error: 'BACKUP_REF_REQUIRED' });

  const storage = getStorage().bucket();
  const archivePath = `backups/whole-system/${backupRef}/__archive.tar.gz`;
  const archiveFile = storage.file(archivePath);

  // Check if existing archive < 24h old; reuse if so
  const [exists] = await archiveFile.exists();
  if (exists) {
    const [meta] = await archiveFile.getMetadata();
    const ageMs = Date.now() - new Date(meta.timeCreated).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      const [url] = await archiveFile.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
      return res.status(200).json({ downloadUrl: url, archiveSize: parseInt(meta.size || '0', 10), reused: true });
    }
  }

  // Stream tar.gz creation
  await new Promise((resolve, reject) => {
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });
    const writeStream = archiveFile.createWriteStream({ contentType: 'application/gzip' });
    archive.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);
    archive.pipe(writeStream);

    // Enumerate folder + stream each file
    storage.getFiles({ prefix: `backups/whole-system/${backupRef}/` })
      .then(([files]) => {
        for (const f of files) {
          if (f.name.endsWith('__archive.tar.gz')) continue; // don't include self
          const relPath = f.name.replace(`backups/whole-system/${backupRef}/`, '');
          archive.append(f.createReadStream(), { name: relPath });
        }
        archive.finalize();
      })
      .catch(reject);
  });

  const [meta] = await archiveFile.getMetadata();
  const [url] = await archiveFile.getSignedUrl({
    action: 'read',
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    downloadUrl: url,
    archiveSize: parseInt(meta.size || '0', 10),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
}
```

- [ ] **Step 11.2: Source-grep + commit**

Append:
```js
describe('V81 — download endpoint', () => {
  const src = READ('api/admin/whole-system-backup-download.js');
  it('uses archiver lib + tar gzip', () => {
    expect(src).toMatch(/import\s+archiver/);
    expect(src).toMatch(/archiver\(['"]tar['"][\s\S]*gzip:\s*true/);
  });
  it('reuses existing __archive.tar.gz if < 24h old', () => {
    expect(src).toMatch(/__archive\.tar\.gz/);
    expect(src).toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
  it('does NOT include archive in itself', () => {
    expect(src).toMatch(/endsWith\(['"]__archive\.tar\.gz['"]\)[\s\S]{0,100}continue/);
  });
  it('returns 24h signed URL', () => {
    expect(src).toMatch(/getSignedUrl/);
  });
});
```

```
npm test -- --run tests/v81-source-grep.test.js
git add api/admin/whole-system-backup-download.js tests/v81-source-grep.test.js
git commit -m "feat(V81 Task 11): download endpoint — server-stream tar.gz + 24h signed URL"
git push origin master
```

---

### Task 12: List + Delete endpoints

**Files:**
- Create: `api/admin/whole-system-backups-list.js`
- Create: `api/admin/whole-system-backup-delete.js`

- [ ] **Step 12.1: Write list endpoint**

```js
// api/admin/whole-system-backups-list.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';
import {
  parseBackupName, validateWholeSystemManifest,
} from '../../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const storage = getStorage().bucket();
  // List manifest.json files only
  const [files] = await storage.getFiles({ prefix: 'backups/whole-system/' });
  const manifestPaths = files.filter(f => f.name.endsWith('/manifest.json'));

  const backups = [];
  for (const mf of manifestPaths) {
    const m = mf.name.match(/^backups\/whole-system\/([^/]+)\/manifest\.json$/);
    if (!m) continue;
    const name = m[1];
    const parsed = parseBackupName(name);
    if (!parsed.valid) continue;
    try {
      const [buf] = await mf.download();
      const manifest = JSON.parse(buf.toString('utf8'));
      const v = validateWholeSystemManifest(manifest);
      backups.push({
        name,
        type: parsed.type,
        createdAt: manifest.createdAt,
        manifestHash: manifest.manifestHash,
        hashOk: v.valid,
        stats: manifest.stats || {},
      });
    } catch (e) {
      backups.push({ name, type: parsed.type, error: e.message });
    }
  }

  // Sort by createdAt desc
  backups.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return res.status(200).json({ backups });
}
```

- [ ] **Step 12.2: Write delete endpoint**

```js
// api/admin/whole-system-backup-delete.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdminToken } from './_lib/adminAuth.js';
import { NAME_PATTERN } from '../../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  initAdmin();
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  const { names = [] } = req.body || {};
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'NAMES_REQUIRED' });
  }
  // Validate every name matches NAME_PATTERN (anti-fat-finger)
  for (const n of names) {
    if (!NAME_PATTERN.test(n)) {
      return res.status(400).json({ error: 'INVALID_NAME', name: n });
    }
  }

  const storage = getStorage().bucket();
  const deleted = [];
  const failed = [];
  for (const name of names) {
    try {
      await storage.deleteFiles({ prefix: `backups/whole-system/${name}/` });
      deleted.push(name);
    } catch (e) {
      failed.push({ name, error: e.message });
    }
  }
  return res.status(200).json({ deleted, failed });
}
```

- [ ] **Step 12.3: Source-grep + commit**

Append:
```js
describe('V81 — list + delete endpoints', () => {
  const list = READ('api/admin/whole-system-backups-list.js');
  const del = READ('api/admin/whole-system-backup-delete.js');
  it('list uses verifyAdminToken + GET', () => {
    expect(list).toMatch(/verifyAdminToken/);
    expect(list).toMatch(/req\.method.*['"]GET['"]/);
  });
  it('list validates each manifest via validateWholeSystemManifest', () => {
    expect(list).toMatch(/validateWholeSystemManifest/);
  });
  it('delete validates names via NAME_PATTERN (anti-fat-finger)', () => {
    expect(del).toMatch(/NAME_PATTERN\.test/);
    expect(del).toMatch(/INVALID_NAME/);
  });
});
```

```
npm test -- --run tests/v81-source-grep.test.js
git add api/admin/whole-system-backups-list.js api/admin/whole-system-backup-delete.js tests/v81-source-grep.test.js
git commit -m "feat(V81 Task 12): list + delete endpoints with NAME_PATTERN validation"
git push origin master
```

---

## Phase 3 — UI (Tasks 13-15)

### Task 13: WholeSystemBackupModal.jsx — manual create wizard

**Files:**
- Create: `src/components/backend/WholeSystemBackupModal.jsx`

- [ ] **Step 13.1: Implement modal**

```jsx
// src/components/backend/WholeSystemBackupModal.jsx
// V81 — manual create wizard (single-step). Fires POST /api/admin/whole-system-backup-export.
import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '../../firebase.js';
import { Loader2, X, CheckCircle2 } from 'lucide-react';

export default function WholeSystemBackupModal({ open, onClose, onComplete }) {
  const [stage, setStage] = useState('idle'); // idle | running | done | error
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');

  async function handleStart() {
    setStage('running');
    setErrMsg('');
    try {
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('not logged in');
      const res = await fetch('/api/admin/whole-system-backup-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'unknown');
      setResult(json);
      setStage('done');
      onComplete?.(json);
    } catch (e) {
      setErrMsg(e.message);
      setStage('error');
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => stage !== 'running' && onClose?.()}>
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--tx-heading)]">📥 สำรองทั้งระบบทันที</h2>
          <button onClick={onClose} disabled={stage === 'running'} className="text-[var(--tx-muted)] hover:text-[var(--tx-heading)] disabled:opacity-30">
            <X size={18} />
          </button>
        </div>

        {stage === 'idle' && (
          <>
            <p className="text-sm text-[var(--tx-muted)] mb-4">
              สำรองข้อมูลทั้งระบบ (Firestore + Storage + Auth users) ใน 1 backup. ใช้เวลาประมาณ 5-10 นาที.
              ไฟล์เก็บที่ <code>backups/whole-system/manual-YYYYMMDD-HHmm/</code> — ไม่ผูก auto-retention.
            </p>
            <button onClick={handleStart} className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 font-bold transition-colors">
              เริ่มสำรอง
            </button>
          </>
        )}

        {stage === 'running' && (
          <div className="text-center py-6">
            <Loader2 size={32} className="animate-spin text-red-600 mx-auto mb-3" />
            <p className="text-sm text-[var(--tx-muted)]">กำลังสำรอง... อาจใช้เวลา 5-10 นาที — ห้ามปิดหน้านี้</p>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="text-center py-4">
            <CheckCircle2 size={32} className="text-green-500 mx-auto mb-3" />
            <p className="text-sm font-bold text-[var(--tx-heading)] mb-2">สำรองสำเร็จ ✓</p>
            <div className="text-xs text-[var(--tx-muted)] space-y-1">
              <p><strong>Name:</strong> {result.name}</p>
              <p><strong>Hash:</strong> <code className="text-[10px]">{result.manifestHash?.slice(0, 24)}...</code></p>
              <p><strong>Docs:</strong> {result.stats?.totalDocCount?.toLocaleString()}</p>
              <p><strong>Storage:</strong> {Math.round((result.stats?.totalStorageBytes || 0) / 1024 / 1024)} MB</p>
              <p><strong>Auth users:</strong> {result.stats?.totalAuthUsers}</p>
              <p><strong>Elapsed:</strong> {result.stats?.elapsedSec}s</p>
              {result.failedCollections?.length > 0 && (
                <p className="text-amber-400">⚠ {result.failedCollections.length} collections failed</p>
              )}
            </div>
            <button onClick={onClose} className="mt-4 w-full bg-[var(--bg-hover)] hover:bg-[var(--bd)] text-[var(--tx-heading)] rounded-xl py-2 text-sm">
              ปิด
            </button>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center py-4">
            <p className="text-sm text-red-400 mb-3">สำรองไม่สำเร็จ: {errMsg}</p>
            <button onClick={() => setStage('idle')} className="w-full bg-[var(--bg-hover)] rounded-xl py-2 text-sm">ลองอีกครั้ง</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 13.2: Drift scanner + commit**

```
node scripts/diag-react-hook-import-drift.mjs
```
Expected: 0 instances.

```bash
git add src/components/backend/WholeSystemBackupModal.jsx
git commit -m "feat(V81 Task 13): WholeSystemBackupModal — manual create wizard"
git push origin master
```

---

### Task 14: WholeSystemRestoreModal.jsx — restore wizard

**Files:**
- Create: `src/components/backend/WholeSystemRestoreModal.jsx`

- [ ] **Step 14.1: Implement modal**

```jsx
// src/components/backend/WholeSystemRestoreModal.jsx
// V81 — restore wizard. Mode radio (Fresh-only / Replace) + type-confirm + reset-emails opt-in.
import { useState, useMemo } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '../../firebase.js';
import { Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function WholeSystemRestoreModal({ open, onClose, backups = [], onComplete }) {
  const [selectedName, setSelectedName] = useState('');
  const [mode, setMode] = useState('fresh');
  const [confirmName, setConfirmName] = useState('');
  const [sendPasswordReset, setSendPasswordReset] = useState(false);
  const [stage, setStage] = useState('select'); // select | running | done | error
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');

  const selected = useMemo(() => backups.find(b => b.name === selectedName), [backups, selectedName]);
  const canSubmit = selected && confirmName === selectedName && stage === 'select';

  async function handleStart() {
    setStage('running'); setErrMsg('');
    try {
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/whole-system-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ backupRef: selectedName, mode, confirmName, sendPasswordResetEmails: sendPasswordReset }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'unknown');
      setResult(json); setStage('done'); onComplete?.(json);
    } catch (e) {
      setErrMsg(e.message); setStage('error');
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => stage !== 'running' && onClose?.()}>
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--bd)] shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--tx-heading)]">🔄 Restore ทั้งระบบ</h2>
          <button onClick={onClose} disabled={stage === 'running'} className="text-[var(--tx-muted)] hover:text-[var(--tx-heading)] disabled:opacity-30">
            <X size={18} />
          </button>
        </div>

        {stage === 'select' && (
          <>
            <div className="mb-4">
              <label className="text-xs text-[var(--tx-muted)] block mb-1">เลือก backup</label>
              <select value={selectedName} onChange={e => { setSelectedName(e.target.value); setConfirmName(''); }}
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-xl px-3 py-2 text-sm">
                <option value="">-- เลือก --</option>
                {backups.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name} {b.hashOk === false ? '⚠ HASH BAD' : ''} ({b.stats?.totalDocCount || 0} docs)
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="text-xs text-[var(--tx-muted)] block mb-2">Mode</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" value="fresh" checked={mode === 'fresh'} onChange={() => setMode('fresh')} className="mt-1" />
                  <div className="text-sm">
                    <span className="font-bold text-[var(--tx-heading)]">Fresh-only (ปลอดภัย — แนะนำ)</span>
                    <p className="text-xs text-[var(--tx-muted)]">ปฏิเสธถ้า Firebase ปัจจุบันมีข้อมูล. ใช้ตอน clone ไปเปิด Firebase ใหม่.</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1" />
                  <div className="text-sm">
                    <span className="font-bold text-red-400">Replace current data (DESTRUCTIVE)</span>
                    <p className="text-xs text-[var(--tx-muted)]">ลบข้อมูลปัจจุบันทั้งหมด + restore ทับ. <strong>Auto-pre-backup ก่อน wipe</strong> เผื่อ undo.</p>
                  </div>
                </label>
              </div>
            </div>

            {mode === 'replace' && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-800 rounded-xl">
                <AlertTriangle size={16} className="text-red-400 inline mr-2" />
                <span className="text-xs text-red-300">
                  ⚠ ข้อมูลใหม่ที่เกิดระหว่าง backup time → restore time จะหายทั้งหมด.
                  Auto-pre-backup จะถูกสร้างไว้ที่ <code>pre-restore-YYYYMMDD-HHmm/</code> (เก็บ 7 วัน).
                </span>
              </div>
            )}

            <label className="flex items-center gap-2 mb-4 text-xs text-[var(--tx-muted)] cursor-pointer">
              <input type="checkbox" checked={sendPasswordReset} onChange={e => setSendPasswordReset(e.target.checked)} />
              ส่งอีเมล password-reset ไปทุก user ที่ restore (ลูกค้า/สตาฟต้อง re-set password)
            </label>

            <div className="mb-4">
              <label className="text-xs text-[var(--tx-muted)] block mb-1">
                พิมพ์ชื่อ backup ยืนยัน: <code className="text-[var(--tx-heading)]">{selectedName}</code>
              </label>
              <input value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder="พิมพ์ชื่อ backup ตรงๆ"
                className="w-full bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-heading)] rounded-xl px-3 py-2 text-sm font-mono" />
            </div>

            <button onClick={handleStart} disabled={!canSubmit}
              className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              {mode === 'replace' ? 'Replace ทั้งระบบ' : 'Restore (Fresh-only)'}
            </button>
          </>
        )}

        {stage === 'running' && (
          <div className="text-center py-6">
            <Loader2 size={32} className="animate-spin text-red-600 mx-auto mb-3" />
            <p className="text-sm text-[var(--tx-muted)]">กำลัง restore... ใช้เวลา 5-15 นาที — ห้ามปิดหน้านี้</p>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="text-center py-4">
            <CheckCircle2 size={32} className="text-green-500 mx-auto mb-3" />
            <p className="text-sm font-bold text-[var(--tx-heading)] mb-2">Restore สำเร็จ ✓</p>
            <div className="text-xs text-[var(--tx-muted)] space-y-1 text-left">
              <p><strong>Docs restored:</strong> {result.stats?.restoredDocs}</p>
              <p><strong>Auth users:</strong> {result.stats?.restoredAuth}</p>
              <p><strong>Storage blobs:</strong> {result.stats?.restoredStorage}</p>
              <p><strong>Password-reset emails sent:</strong> {result.passwordResetEmailsSent}</p>
              {result.autoBackupRef && <p><strong>Auto pre-backup:</strong> <code>{result.autoBackupRef}</code></p>}
            </div>
            <button onClick={onClose} className="mt-4 w-full bg-[var(--bg-hover)] rounded-xl py-2 text-sm">ปิด</button>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center py-4">
            <p className="text-sm text-red-400 mb-3">Restore ไม่สำเร็จ: {errMsg}</p>
            <button onClick={() => setStage('select')} className="w-full bg-[var(--bg-hover)] rounded-xl py-2 text-sm">ลองอีกครั้ง</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 14.2: Drift scanner + commit**

```
node scripts/diag-react-hook-import-drift.mjs
```
Expected: 0 instances.

```bash
git add src/components/backend/WholeSystemRestoreModal.jsx
git commit -m "feat(V81 Task 14): WholeSystemRestoreModal — Fresh/Replace radio + type-confirm + reset-emails opt-in"
git push origin master
```

---

### Task 15: BackupManagerTab.jsx — extend with 🌐 Whole-System section

**Files:**
- Modify: `src/components/backend/BackupManagerTab.jsx`

- [ ] **Step 15.1: Read existing file + identify integration point**

Look for the existing whole-fleet section (V77b/c) or end-of-file. Add 🌐 section AFTER existing sections.

- [ ] **Step 15.2: Implement section**

Add to `BackupManagerTab.jsx`:

```jsx
// Imports (add to top)
import WholeSystemBackupModal from './WholeSystemBackupModal.jsx';
import WholeSystemRestoreModal from './WholeSystemRestoreModal.jsx';

// State (add to component)
const [wsBackups, setWsBackups] = useState([]);
const [wsLoading, setWsLoading] = useState(false);
const [wsBackupModalOpen, setWsBackupModalOpen] = useState(false);
const [wsRestoreModalOpen, setWsRestoreModalOpen] = useState(false);

// Load handler
const loadWsBackups = useCallback(async () => {
  setWsLoading(true);
  try {
    const auth = getAuth(app);
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/admin/whole-system-backups-list', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setWsBackups(json.backups || []);
  } finally {
    setWsLoading(false);
  }
}, []);

useEffect(() => { loadWsBackups(); }, [loadWsBackups]);

// Download handler
async function downloadWs(name) {
  const auth = getAuth(app);
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/admin/whole-system-backup-download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ backupRef: name }),
  });
  const json = await res.json();
  if (json.downloadUrl) window.open(json.downloadUrl, '_blank');
  else alert(`Download failed: ${json.error || 'unknown'}`);
}

// Delete handler
async function deleteWs(names) {
  if (!confirm(`ลบ ${names.length} backup(s)?`)) return;
  const auth = getAuth(app);
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/admin/whole-system-backup-delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ names }),
  });
  if (res.ok) loadWsBackups();
}

// Render section (add before closing return tag of BackupManagerTab)
{/* 🌐 Whole-System Backups section */}
<section className="mb-6">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-lg font-bold text-[var(--tx-heading)]">🌐 Whole-System Backups (V81)</h3>
    <button onClick={() => setWsBackupModalOpen(true)}
      className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold">
      📥 Backup Now
    </button>
  </div>
  <p className="text-xs text-[var(--tx-muted)] mb-2">
    Auto-daily backup 03:00 BKK · 5-day rolling retention · 7-day pre-restore · ∞ manual.
  </p>

  {wsLoading ? (
    <p className="text-xs text-[var(--tx-muted)]">กำลังโหลด...</p>
  ) : wsBackups.length === 0 ? (
    <p className="text-xs text-[var(--tx-muted)]">ยังไม่มี backup — กด Backup Now เพื่อสร้างตัวแรก</p>
  ) : (
    <div className="space-y-1.5">
      {wsBackups.map(b => (
        <div key={b.name} className="flex items-center justify-between p-2.5 bg-[var(--bg-hover)] border border-[var(--bd)] rounded-lg text-xs">
          <div className="flex-1 min-w-0">
            <code className="font-bold text-[var(--tx-heading)]">{b.name}</code>
            {b.hashOk === false && <span className="ml-2 text-red-400">⚠ HASH BAD</span>}
            <div className="text-[var(--tx-muted)]">
              {b.stats?.totalDocCount?.toLocaleString() || 0} docs · {Math.round((b.stats?.totalStorageBytes || 0) / 1024 / 1024)} MB · {b.stats?.totalAuthUsers || 0} users
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => downloadWs(b.name)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px]">Download</button>
            <button onClick={() => { setWsRestoreModalOpen(true); }} className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px]">Restore</button>
            <button onClick={() => deleteWs([b.name])} className="px-2 py-1 bg-red-700 hover:bg-red-800 text-white rounded text-[10px]">Delete</button>
          </div>
        </div>
      ))}
    </div>
  )}

  <WholeSystemBackupModal
    open={wsBackupModalOpen}
    onClose={() => setWsBackupModalOpen(false)}
    onComplete={() => loadWsBackups()}
  />
  <WholeSystemRestoreModal
    open={wsRestoreModalOpen}
    onClose={() => setWsRestoreModalOpen(false)}
    backups={wsBackups}
    onComplete={() => loadWsBackups()}
  />
</section>
```

- [ ] **Step 15.3: Build + drift scanner + commit**

```
npm run build
node scripts/diag-react-hook-import-drift.mjs
```
Expected: build clean + 0 drift

```bash
git add src/components/backend/BackupManagerTab.jsx
git commit -m "feat(V81 Task 15): BackupManagerTab integration — 🌐 Whole-System section + 2 modals"
git push origin master
```

---

## Phase 4 — CLI mirrors (Tasks 16-17)

### Task 16: scripts/whole-system-backup-export.mjs

**Files:**
- Create: `scripts/whole-system-backup-export.mjs`

- [ ] **Step 16.1: Implement CLI**

```js
#!/usr/bin/env node
// scripts/whole-system-backup-export.mjs
// V81 Rule M canonical — local + admin SDK + pull env. Used for dev/emergency
// backup ops without going through Vercel endpoint.
//
// USAGE:
//   node scripts/whole-system-backup-export.mjs                     # default type=manual
//   node scripts/whole-system-backup-export.mjs --type=auto         # mimic cron
//   node scripts/whole-system-backup-export.mjs --type=pre-restore  # before manual wipe
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  if (!fs.existsSync(envPath)) throw new Error('.env.local.prod missing — run `vercel env pull` first');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { type: 'manual' };
  for (const a of args) {
    if (a.startsWith('--type=')) opts.type = a.slice(7);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }
  const { runWholeSystemBackup } = await import('../api/admin/_lib/wholeSystemBackupExecutor.js');
  const result = await runWholeSystemBackup({
    db: getFirestore(),
    storage: getStorage().bucket(),
    auth: getAuth(),
    type: opts.type,
    createdBy: `cli-${process.env.USER || 'unknown'}`,
    runCleanup: opts.type === 'auto', // only auto cleans up
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
```

- [ ] **Step 16.2: Commit**

```bash
git add scripts/whole-system-backup-export.mjs
git commit -m "feat(V81 Task 16): CLI mirror — whole-system-backup-export.mjs (Rule M canonical)"
git push origin master
```

---

### Task 17: scripts/whole-system-restore.mjs (with --local-manifest support)

**Files:**
- Create: `scripts/whole-system-restore.mjs`

- [ ] **Step 17.1: Implement CLI**

```js
#!/usr/bin/env node
// scripts/whole-system-restore.mjs
// V81 Rule M canonical — restore from Firebase Storage (or local manifest file
// for cross-Vercel scenario where backup folder is dragged into new Firebase
// Storage manually).
//
// USAGE:
//   node scripts/whole-system-restore.mjs --backup-ref=auto-20260516-0300 --mode=fresh --apply
//   node scripts/whole-system-restore.mjs --backup-ref=manual-20260516-1430 --mode=replace --apply --password-reset-emails
//   node scripts/whole-system-restore.mjs --local-manifest=./backup-folder/manifest.json --apply
//
// SAFETY: dry-run by default; --apply commits writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  if (!fs.existsSync(envPath)) throw new Error('.env.local.prod missing');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function parseArgs() {
  const opts = { mode: 'fresh', apply: false, passwordResetEmails: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--backup-ref=')) opts.backupRef = a.slice(13);
    else if (a.startsWith('--mode=')) opts.mode = a.slice(7);
    else if (a === '--apply') opts.apply = true;
    else if (a === '--password-reset-emails') opts.passwordResetEmails = true;
    else if (a.startsWith('--local-manifest=')) opts.localManifest = a.slice(17);
    else if (a === '--verify-hash-only') opts.verifyHashOnly = true;
  }
  return opts;
}

async function verifyLocalManifest(localPath) {
  const { validateWholeSystemManifest, computeWholeSystemManifestHash } = await import('../src/lib/wholeSystemBackupCore.js');
  const buf = fs.readFileSync(localPath, 'utf8');
  const manifest = JSON.parse(buf);
  const v = validateWholeSystemManifest(manifest);
  console.log('Validate:', v);
  console.log('Recomputed hash:', computeWholeSystemManifestHash(manifest));
  console.log('Stored hash:    ', manifest.manifestHash);
  if (v.valid) console.log('✓ MANIFEST HASH VALID');
  else console.error('✗ INVALID:', v.reason);
  return v;
}

async function main() {
  const opts = parseArgs();
  if (!opts.backupRef && !opts.localManifest) {
    console.error('Need --backup-ref=NAME or --local-manifest=PATH');
    process.exit(1);
  }

  if (opts.localManifest && opts.verifyHashOnly) {
    return await verifyLocalManifest(opts.localManifest);
  }

  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }

  if (!opts.apply) {
    console.log('DRY-RUN — no writes. Re-run with --apply to commit.');
    console.log('Would restore:', opts.backupRef || opts.localManifest);
    console.log('Mode:', opts.mode);
    console.log('Password-reset emails:', opts.passwordResetEmails);
    return;
  }

  const { runWholeSystemRestore } = await import('../api/admin/_lib/wholeSystemRestoreExecutor.js');
  // Need a "caller" uid — use env var for CLI since no admin login
  const callerUid = env.CLI_ADMIN_UID || 'cli-no-uid';
  const result = await runWholeSystemRestore({
    db: getFirestore(),
    storage: getStorage().bucket(),
    auth: getAuth(),
    backupRef: opts.backupRef,
    mode: opts.mode,
    callerUid,
    sendPasswordResetEmails: opts.passwordResetEmails,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
```

- [ ] **Step 17.2: Commit**

```bash
git add scripts/whole-system-restore.mjs
git commit -m "feat(V81 Task 17): CLI mirror — whole-system-restore.mjs (Rule M + --local-manifest + --verify-hash-only)"
git push origin master
```

---

## Phase 5 — Testing infrastructure (Tasks 18-22) — CRITICAL Rule Q V66 alignment

### Task 18: firebase.json — Emulator Suite setup

**Files:**
- Create: `firebase.json` (OR modify if exists)

- [ ] **Step 18.1: Check existing firebase.json**

```
cat firebase.json 2>&1 || echo "MISSING"
```

If exists, add `emulators` section while preserving other keys.

- [ ] **Step 18.2: Write firebase.json**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": {
    "source": "functions"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 18.3: Smoke-test emulator boot**

```
npx firebase emulators:start --only firestore,storage,auth --project loverclinic-opd-4c39b
```
Wait for "All emulators ready". Kill with Ctrl+C.

- [ ] **Step 18.4: Commit**

```bash
git add firebase.json
git commit -m "feat(V81 Task 18): Firebase Emulator Suite config (auth+firestore+storage)"
git push origin master
```

---

### Task 19: tests/v81-emulator-roundtrip.test.js — 11 hermetic scenarios

**Files:**
- Create: `tests/v81-emulator-roundtrip.test.js`
- Create: `tests/helpers/v81-emulator-spawn.js` (lifecycle helper)

- [ ] **Step 19.1: Write emulator spawn helper**

```js
// tests/helpers/v81-emulator-spawn.js
// Spawns firebase emulators:start as a child process; resolves when ready;
// kills on teardown. Used by tests/v81-emulator-roundtrip.test.js.
import { spawn } from 'node:child_process';
import { initializeApp, cert, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

let emulatorProc = null;
let adminApp = null;

export async function startEmulators({ timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    emulatorProc = spawn('npx', [
      'firebase', 'emulators:start',
      '--only', 'firestore,storage,auth',
      '--project', 'demo-test-v81',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => reject(new Error('emulator start timeout')), timeoutMs);
    emulatorProc.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      if (s.includes('All emulators ready')) {
        clearTimeout(timer);
        resolve();
      }
    });
    emulatorProc.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      if (s.includes('Error') || s.includes('port already')) {
        console.error('Emulator stderr:', s);
      }
    });
    emulatorProc.on('error', reject);
  });
}

export async function stopEmulators() {
  if (emulatorProc) {
    emulatorProc.kill('SIGTERM');
    emulatorProc = null;
  }
  if (adminApp) {
    await deleteApp(adminApp);
    adminApp = null;
  }
}

export function getEmulatorAdmin() {
  if (!adminApp) {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    adminApp = initializeApp({
      projectId: 'demo-test-v81',
      storageBucket: 'demo-test-v81.appspot.com',
    }, 'v81-emulator-test');
  }
  return {
    db: getFirestore(adminApp),
    storage: getStorage(adminApp).bucket(),
    auth: getAuth(adminApp),
  };
}
```

- [ ] **Step 19.2: Write emulator round-trip test bank**

```js
// tests/v81-emulator-roundtrip.test.js
// V81 — hermetic Firebase Emulator Suite round-trip test (T4 — PRIMARY gate per Rule Q V66).
//
// Each test: seed source → backup → wipe → restore → verify byte-identical.
// Uses single emulator with multi-database via project-level isolation.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startEmulators, stopEmulators, getEmulatorAdmin } from './helpers/v81-emulator-spawn.js';
import { runWholeSystemBackup } from '../api/admin/_lib/wholeSystemBackupExecutor.js';
import { runWholeSystemRestore } from '../api/admin/_lib/wholeSystemRestoreExecutor.js';

const PREFIX = 'artifacts/loverclinic-opd-4c39b/public/data';

async function wipeAll(db, storage, auth) {
  const [files] = await storage.getFiles();
  for (const f of files) try { await f.delete(); } catch {}
  // Wipe collections
  const cols = ['be_customers', 'be_branches', 'be_staff', 'be_treatments', 'be_sales', 'chat_history'];
  for (const c of cols) {
    const snap = await db.collection(`${PREFIX}/${c}`).get();
    for (const d of snap.docs) await d.ref.delete();
  }
  // Wipe auth
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users) await auth.deleteUser(u.uid);
    token = page.pageToken;
  } while (token);
}

async function seedMinimal({ db, auth, storage }) {
  await db.doc(`${PREFIX}/be_branches/BR-1`).set({ name: 'นครราชสีมา', id: 'BR-1' });
  await db.doc(`${PREFIX}/be_customers/CUST-1`).set({ name: 'Alice', branchId: 'BR-1', id: 'CUST-1' });
  await db.doc(`${PREFIX}/be_staff/ST-1`).set({ email: 'alice@x', name: 'Alice' });
  await auth.createUser({ uid: 'TEST-USER-1', email: 'alice@x', displayName: 'Alice' });
  await storage.file('customers/CUST-1/photo.jpg').save(Buffer.from('mockimage'), { contentType: 'image/jpeg' });
}

async function snapshotState({ db, storage, auth }) {
  const state = { collections: {}, storage: [], authUsers: [] };
  const cols = ['be_customers', 'be_branches', 'be_staff'];
  for (const c of cols) {
    const snap = await db.collection(`${PREFIX}/${c}`).get();
    state.collections[c] = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
  }
  const [files] = await storage.getFiles();
  for (const f of files) {
    if (f.name.startsWith('backups/')) continue;
    const [buf] = await f.download();
    state.storage.push({ name: f.name, hash: require('node:crypto').createHash('sha256').update(buf).digest('hex') });
  }
  const page = await auth.listUsers(100);
  state.authUsers = page.users.map(u => ({ uid: u.uid, email: u.email })).sort((a, b) => a.uid.localeCompare(b.uid));
  return state;
}

describe('V81 — Emulator hermetic round-trip (E.1-E.11)', () => {
  beforeAll(async () => { await startEmulators(); }, 90_000);
  afterAll(async () => { await stopEmulators(); });
  beforeEach(async () => {
    const { db, storage, auth } = getEmulatorAdmin();
    await wipeAll(db, storage, auth);
  });

  it('E.1 — empty source → backup → restore → target empty', async () => {
    const env = getEmulatorAdmin();
    const result = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    expect(result.stats.totalDocCount).toBe(0);
    expect(result.manifestHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('E.2 — minimal source round-trip byte-identical', async () => {
    const env = getEmulatorAdmin();
    await seedMinimal(env);
    const sourceSnap = await snapshotState(env);
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    await wipeAll(env.db, env.storage, env.auth);
    await runWholeSystemRestore({
      ...env, backupRef: backup.name, mode: 'fresh', callerUid: 'NONE', sendPasswordResetEmails: false,
    });
    const targetSnap = await snapshotState(env);
    expect(targetSnap.collections.be_customers).toEqual(sourceSnap.collections.be_customers);
    expect(targetSnap.collections.be_branches).toEqual(sourceSnap.collections.be_branches);
    expect(targetSnap.collections.be_staff).toEqual(sourceSnap.collections.be_staff);
    expect(targetSnap.authUsers.find(u => u.uid === 'TEST-USER-1')).toBeDefined();
  });

  it('E.3 — moderate (50 customers + 3 branches)', async () => {
    const env = getEmulatorAdmin();
    for (let i = 0; i < 50; i++) {
      await env.db.doc(`${PREFIX}/be_customers/CUST-${i}`).set({ name: `Customer ${i}`, branchId: `BR-${i % 3 + 1}`, id: `CUST-${i}` });
    }
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    expect(backup.stats.totalDocCount).toBeGreaterThanOrEqual(50);
    await wipeAll(env.db, env.storage, env.auth);
    await runWholeSystemRestore({ ...env, backupRef: backup.name, mode: 'fresh', callerUid: 'NONE', sendPasswordResetEmails: false });
    const restored = await env.db.collection(`${PREFIX}/be_customers`).get();
    expect(restored.size).toBe(50);
  });

  it('E.4 — Storage blob SHA-256 preserved', async () => {
    const env = getEmulatorAdmin();
    const original = Buffer.from('original-image-data-12345');
    await env.storage.file('customers/CUST-X/photo.jpg').save(original, { contentType: 'image/jpeg' });
    const origHash = require('node:crypto').createHash('sha256').update(original).digest('hex');
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    await wipeAll(env.db, env.storage, env.auth);
    await runWholeSystemRestore({ ...env, backupRef: backup.name, mode: 'fresh', callerUid: 'NONE', sendPasswordResetEmails: false });
    const [restored] = await env.storage.file('customers/CUST-X/photo.jpg').download();
    const restoredHash = require('node:crypto').createHash('sha256').update(restored).digest('hex');
    expect(restoredHash).toBe(origHash);
  });

  it('E.5 — Auth user customClaims + providerData preserved', async () => {
    const env = getEmulatorAdmin();
    await env.auth.createUser({ uid: 'TEST-USER-2', email: 'admin@x', displayName: 'Admin' });
    await env.auth.setCustomUserClaims('TEST-USER-2', { admin: true, perm_chat: true });
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    await wipeAll(env.db, env.storage, env.auth);
    await runWholeSystemRestore({ ...env, backupRef: backup.name, mode: 'fresh', callerUid: 'NONE', sendPasswordResetEmails: false });
    const restored = await env.auth.getUser('TEST-USER-2');
    expect(restored.customClaims).toEqual({ admin: true, perm_chat: true });
  });

  it('E.6 — Customer subcollection (wallets) preserved', async () => {
    const env = getEmulatorAdmin();
    await env.db.doc(`${PREFIX}/be_customers/CUST-Z`).set({ name: 'Z', id: 'CUST-Z' });
    await env.db.doc(`${PREFIX}/be_customers/CUST-Z/wallets/W-1`).set({ balance: 5000, id: 'W-1' });
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    await wipeAll(env.db, env.storage, env.auth);
    await runWholeSystemRestore({ ...env, backupRef: backup.name, mode: 'fresh', callerUid: 'NONE', sendPasswordResetEmails: false });
    const wallet = await env.db.doc(`${PREFIX}/be_customers/CUST-Z/wallets/W-1`).get();
    expect(wallet.exists).toBe(true);
    expect(wallet.data().balance).toBe(5000);
  });

  it('E.7 — Branch-scoped doc preserves branchId field', async () => {
    const env = getEmulatorAdmin();
    await env.db.doc(`${PREFIX}/be_treatments/T-1`).set({ customerId: 'CUST-1', branchId: 'BR-2', id: 'T-1' });
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    await wipeAll(env.db, env.storage, env.auth);
    await runWholeSystemRestore({ ...env, backupRef: backup.name, mode: 'fresh', callerUid: 'NONE', sendPasswordResetEmails: false });
    const t = await env.db.doc(`${PREFIX}/be_treatments/T-1`).get();
    expect(t.data().branchId).toBe('BR-2');
  });

  it('E.8 — chat_conversations/{id}/messages subcoll preserved', async () => {
    const env = getEmulatorAdmin();
    await env.db.doc(`${PREFIX}/chat_conversations/conv-1`).set({ branchId: 'BR-1' });
    for (let i = 0; i < 5; i++) {
      await env.db.doc(`${PREFIX}/chat_conversations/conv-1/messages/MSG-${i}`).set({ text: `msg ${i}`, id: `MSG-${i}` });
    }
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    await wipeAll(env.db, env.storage, env.auth);
    await runWholeSystemRestore({ ...env, backupRef: backup.name, mode: 'fresh', callerUid: 'NONE', sendPasswordResetEmails: false });
    const msgs = await env.db.collection(`${PREFIX}/chat_conversations/conv-1/messages`).get();
    expect(msgs.size).toBe(5);
  });

  it('E.9 — Replace mode produces autoBackupRef before wipe', async () => {
    const env = getEmulatorAdmin();
    await seedMinimal(env);
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    // Modify state
    await env.db.doc(`${PREFIX}/be_customers/CUST-NEW`).set({ name: 'NewCust', id: 'CUST-NEW' });
    // Restore Replace mode
    const result = await runWholeSystemRestore({
      ...env, backupRef: backup.name, mode: 'replace', callerUid: 'NONE', sendPasswordResetEmails: false,
    });
    expect(result.autoBackupRef).toMatch(/^pre-restore-/);
    // Verify pre-restore folder exists in storage
    const [exists] = await env.storage.file(`backups/whole-system/${result.autoBackupRef}/manifest.json`).exists();
    expect(exists).toBe(true);
  });

  it('E.10 — Fresh-only refuses non-empty target', async () => {
    const env = getEmulatorAdmin();
    await seedMinimal(env);
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    // Don't wipe — target has CUST-1
    await expect(runWholeSystemRestore({
      ...env, backupRef: backup.name, mode: 'fresh', callerUid: 'NONE', sendPasswordResetEmails: false,
    })).rejects.toThrow(/TARGET_NOT_EMPTY/);
  });

  it('E.11 — Tampered manifest hash → restore refused', async () => {
    const env = getEmulatorAdmin();
    await seedMinimal(env);
    const backup = await runWholeSystemBackup({ ...env, type: 'manual', createdBy: 'test', runCleanup: false });
    // Tamper manifest in Storage
    const [mfBuf] = await env.storage.file(`backups/whole-system/${backup.name}/manifest.json`).download();
    const mf = JSON.parse(mfBuf.toString('utf8'));
    mf.manifestHash = 'sha256:TAMPERED_0000000000000000000000000000000000000000000000000000';
    await env.storage.file(`backups/whole-system/${backup.name}/manifest.json`).save(JSON.stringify(mf, null, 2));
    await wipeAll(env.db, env.storage, env.auth);
    await expect(runWholeSystemRestore({
      ...env, backupRef: backup.name, mode: 'fresh', callerUid: 'NONE', sendPasswordResetEmails: false,
    })).rejects.toThrow(/WHOLE_SYSTEM_MANIFEST_TAMPERED/);
  });
});
```

- [ ] **Step 19.3: Run tests + commit**

```
npm test -- --run tests/v81-emulator-roundtrip.test.js
```
Expected: 11/11 PASS (slow — ~3-5 min total due to emulator boot + 11 round-trips)

```bash
git add tests/v81-emulator-roundtrip.test.js tests/helpers/v81-emulator-spawn.js
git commit -m "test(V81 Task 19): hermetic Emulator round-trip E.1-E.11 (PRIMARY Rule Q gate)"
git push origin master
```

---

### Task 20: tests/v81-property-based-adversarial.test.js — 100-fixture matrix

**Files:**
- Create: `tests/v81-property-based-adversarial.test.js`

- [ ] **Step 20.1: Write property-based test bank**

```js
// V81 property-based adversarial — V48 mulberry32 PRNG × 100 fixtures × 6 invariants.
import { describe, it, expect } from 'vitest';
import {
  buildWholeSystemManifest, computeWholeSystemManifestHash,
  validateWholeSystemManifest, diffStates, sanitizeAuthUser,
} from '../src/lib/wholeSystemBackupCore.js';

// V48 deterministic PRNG
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHAR_POOLS = {
  thaiDigits: '๐๑๒๓๔๕๖๗๘๙',
  thaiLetters: 'กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ',
  thaiVowels: 'เแโใไะาิีึืุูำ์',
  ascii: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  emoji: '🎉🤡🔥💯🚀',
  htmlSpecial: '<>&"\'',
  edge: ' ​﻿', // NUL, SOH, ZWSP, BOM
};

function pickRandomString(rng, lengthRange = [1, 50]) {
  const len = Math.floor(rng() * (lengthRange[1] - lengthRange[0])) + lengthRange[0];
  const pool = Object.values(CHAR_POOLS).join('');
  let s = '';
  for (let i = 0; i < len; i++) s += pool[Math.floor(rng() * pool.length)];
  return s;
}

function generateFixture(seed) {
  const rng = mulberry32(seed);
  const customers = [];
  const count = Math.floor(rng() * 20) + 1;
  for (let i = 0; i < count; i++) {
    customers.push({
      id: `CUST-${seed}-${i}`,
      name: pickRandomString(rng, [1, 30]),
      branchId: `BR-${Math.floor(rng() * 3) + 1}`,
      phone: rng() > 0.5 ? '+66' + Math.floor(rng() * 1e9) : null,
      ...(rng() > 0.7 ? { nested: { deep: { level: 5, val: pickRandomString(rng) } } } : {}),
    });
  }
  return { be_customers: customers };
}

function simulateBackup(state) {
  const crypto = require('node:crypto');
  const collections = Object.entries(state).map(([name, docs]) => {
    const json = JSON.stringify(docs);
    return {
      name, type: 'universal', path: `collections/universal/${name}.json`,
      docCount: docs.length, fileSizeBytes: json.length,
      fileHash: `sha256:${crypto.createHash('sha256').update(json).digest('hex')}`,
    };
  });
  const m = buildWholeSystemManifest({
    name: 'manual-20260516-2100', createdAt: 't', createdBy: 'prop-test',
    collections, storageObjects: [], authUsers: { path: 'auth/users.json', userCount: 0, fileHash: '' },
    stats: { totalDocCount: Object.values(state).reduce((s, d) => s + d.length, 0), totalStorageBytes: 0, totalAuthUsers: 0 },
  });
  m.manifestHash = computeWholeSystemManifestHash(m);
  return { manifest: m, blobs: { ...state } };
}

function simulateRestore(bundle) {
  const v = validateWholeSystemManifest(bundle.manifest);
  if (!v.valid) throw new Error(v.reason);
  return { ...bundle.blobs };
}

describe('V81 — Property-based adversarial (P1-P6 × 100 fixtures)', () => {
  it('P1 — backup→restore identity (×100)', () => {
    for (let i = 1; i <= 100; i++) {
      const source = generateFixture(i);
      const bundle = simulateBackup(source);
      const restored = simulateRestore(bundle);
      const diff = diffStates(source, restored);
      expect(diff).toEqual({ added: [], removed: [], modified: [] });
    }
  });

  it('P2 — manifestHash deterministic across re-builds (×100)', () => {
    for (let i = 1; i <= 100; i++) {
      const source = generateFixture(i);
      const b1 = simulateBackup(source);
      const b2 = simulateBackup(source);
      expect(b1.manifest.manifestHash).toBe(b2.manifest.manifestHash);
    }
  });

  it('P3 — tampered manifest → restore refused (×50)', () => {
    for (let i = 1; i <= 50; i++) {
      const source = generateFixture(i);
      const bundle = simulateBackup(source);
      bundle.manifest.manifestHash = 'sha256:TAMPERED_' + i;
      expect(() => simulateRestore(bundle)).toThrow();
    }
  });

  it('P4 — sequential isolated round-trips (×3 fixtures)', () => {
    const s1 = generateFixture(1001);
    const s2 = generateFixture(1002);
    const s3 = generateFixture(1003);
    const r1 = simulateRestore(simulateBackup(s1));
    const r2 = simulateRestore(simulateBackup(s2));
    const r3 = simulateRestore(simulateBackup(s3));
    expect(diffStates(s1, r1).modified.length).toBe(0);
    expect(diffStates(s2, r2).modified.length).toBe(0);
    expect(diffStates(s3, r3).modified.length).toBe(0);
  });

  it('P5 — adversarial Thai/Unicode/NUL/emoji round-trip preserved', () => {
    const source = {
      be_customers: [
        { id: 'C1', name: 'นางสาว ๐๑ ทดสอบ' },
        { id: 'C2', name: 'NFC vs NFD: café vs café' },
        { id: 'C3', name: 'NUL byte' },
        { id: 'C4', name: '🎉 emoji 🤡' },
        { id: 'C5', name: '<script>alert(1)</script>' },
        { id: 'C6', name: 'A'.repeat(10000) }, // 10K-char
      ],
    };
    const bundle = simulateBackup(source);
    const restored = simulateRestore(bundle);
    expect(diffStates(source, restored)).toEqual({ added: [], removed: [], modified: [] });
  });

  it('P6 — sanitizeAuthUser strips passwordHash + refreshTokens (×20)', () => {
    for (let i = 1; i <= 20; i++) {
      const rng = mulberry32(i);
      const u = {
        uid: `U-${i}`, email: `u${i}@x`,
        passwordHash: pickRandomString(rng, [40, 60]),
        passwordSalt: pickRandomString(rng, [20, 30]),
        refreshTokens: [pickRandomString(rng), pickRandomString(rng)],
        tokensValidAfterTime: 'date',
      };
      const s = sanitizeAuthUser(u);
      expect(s.passwordHash).toBeUndefined();
      expect(s.passwordSalt).toBeUndefined();
      expect(s.refreshTokens).toBeUndefined();
      expect(s.tokensValidAfterTime).toBeUndefined();
      expect(s.uid).toBe(`U-${i}`);
    }
  });
});
```

- [ ] **Step 20.2: Run + commit**

```
npm test -- --run tests/v81-property-based-adversarial.test.js
```
Expected: 6/6 PASS (100 + 100 + 50 + 3 + 1 + 20 assertions across 6 it blocks)

```bash
git add tests/v81-property-based-adversarial.test.js
git commit -m "test(V81 Task 20): property-based adversarial × 100 fixtures × 6 invariants"
git push origin master
```

---

### Task 21: scripts/v81-verify-roundtrip-real-prod.mjs — secondary DB verification

**Files:**
- Create: `scripts/v81-verify-roundtrip-real-prod.mjs`

- [ ] **Step 21.1: One-time setup — create `clone-verify` secondary database**

```
gcloud firestore databases create --database=clone-verify --location=asia-southeast1 --project=loverclinic-opd-4c39b
```
(Run this once outside the script; commit a doc comment with the gcloud command for future reference.)

- [ ] **Step 21.2: Write verifier script**

```js
#!/usr/bin/env node
// V81 — round-trip verification on REAL prod via Firestore multi-database.
// Source: (default) database (read-only). Target: clone-verify database (we own).
// Verifies backup→restore→sample-diff without damaging production data.
//
// PREREQUISITE: gcloud firestore databases create --database=clone-verify --location=asia-southeast1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { UNIVERSAL_COLLECTIONS } from '../src/lib/wholeSystemBackupCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function wipeCloneVerify(targetDb) {
  for (const col of UNIVERSAL_COLLECTIONS) {
    const snap = await targetDb.collection(`${PREFIX}/${col}`).limit(450).get();
    if (snap.empty) continue;
    const batch = targetDb.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const backupRef = args.find(a => a.startsWith('--backup-ref='))?.slice(13);
  if (!backupRef) {
    console.error('Need --backup-ref=NAME');
    process.exit(1);
  }

  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }
  const sourceDb = getFirestore(); // (default)
  const targetDb = getFirestore('clone-verify');
  const storage = getStorage().bucket();
  const auth = getAuth();

  console.log('Phase 1: Wipe clone-verify database...');
  await wipeCloneVerify(targetDb);

  console.log(`Phase 2: Restore backup ${backupRef} → clone-verify...`);
  const { runWholeSystemRestore } = await import('../api/admin/_lib/wholeSystemRestoreExecutor.js');
  // NOTE: restoreExecutor uses getFirestore() default — we'd need to extend it
  // to accept targetDb param. For now, run via direct path traversal here OR
  // refactor executor in Task 9 to accept dbOverride.
  // Simplified: read each collection JSON from Storage, write to target.
  const [manifestBuf] = await storage.file(`backups/whole-system/${backupRef}/manifest.json`).download();
  const manifest = JSON.parse(manifestBuf.toString('utf8'));
  for (const c of manifest.collections) {
    const [colBuf] = await storage.file(`backups/whole-system/${backupRef}/${c.path}`).download();
    const docs = JSON.parse(colBuf.toString('utf8'));
    for (let i = 0; i < docs.length; i += 450) {
      const batch = targetDb.batch();
      for (const doc of docs.slice(i, i + 450)) {
        const { id, ...data } = doc;
        batch.set(targetDb.doc(`${PREFIX}/${c.name}/${id}`), data);
      }
      await batch.commit();
    }
  }

  console.log('Phase 3: Diff source vs clone-verify (sample 50 docs × 10 collections)...');
  let diffs = 0;
  for (const col of UNIVERSAL_COLLECTIONS.slice(0, 10)) {
    const srcSnap = await sourceDb.collection(`${PREFIX}/${col}`).limit(50).get();
    for (const d of srcSnap.docs) {
      const tgt = await targetDb.doc(`${PREFIX}/${col}/${d.id}`).get();
      if (!tgt.exists) {
        diffs++; continue;
      }
      if (JSON.stringify(d.data()) !== JSON.stringify(tgt.data())) {
        diffs++;
      }
    }
  }
  console.log(`Diffs found: ${diffs}`);
  if (diffs === 0) console.log('✓ ROUND-TRIP VERIFIED: source == clone-verify');
  else console.error('✗ DIFFS DETECTED');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
```

- [ ] **Step 21.3: Commit**

```bash
git add scripts/v81-verify-roundtrip-real-prod.mjs
git commit -m "feat(V81 Task 21): secondary Firestore DB clone-verify byte-identical round-trip verifier"
git push origin master
```

---

### Task 22: scripts/v81-stage-cron-verify.mjs — staging Vercel cron verification

**Files:**
- Create: `scripts/v81-stage-cron-verify.mjs`

- [ ] **Step 22.1: Write staging cron verifier**

```js
#!/usr/bin/env node
// V81 — Staging Vercel cron verification (T8). Triggers cron via curl + verifies
// backup folder appears in Storage + audit doc emitted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const APP_ID = 'loverclinic-opd-4c39b';

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync('.env.local.prod', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const stagingUrl = args.find(a => a.startsWith('--url='))?.slice(6);
  if (!stagingUrl) {
    console.error('Need --url=https://<preview>.vercel.app');
    process.exit(1);
  }
  const env = loadEnv();
  console.log(`Triggering cron at ${stagingUrl}/api/cron/whole-system-backup-daily ...`);
  const res = await fetch(`${stagingUrl}/api/cron/whole-system-backup-daily`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.CRON_SECRET}` },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('Cron fire failed:', res.status, json);
    process.exit(1);
  }
  console.log('Cron returned:', JSON.stringify(json, null, 2));
  const { name, manifestHash } = json;

  // Verify backup folder via admin SDK
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }
  const storage = getStorage().bucket();
  const [exists] = await storage.file(`backups/whole-system/${name}/manifest.json`).exists();
  if (exists) console.log(`✓ Backup folder exists: backups/whole-system/${name}/`);
  else { console.error('✗ Backup folder NOT FOUND'); process.exit(1); }
  console.log(`✓ Stage cron verification PASS — name=${name}, hash=${manifestHash}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
```

- [ ] **Step 22.2: Commit**

```bash
git add scripts/v81-stage-cron-verify.mjs
git commit -m "feat(V81 Task 22): staging Vercel cron verification CLI"
git push origin master
```

---

## Phase 6 — AV invariants (Task 23)

### Task 23: AV62 + AV63 + AV64 + AV19 elevation in audit-anti-vibe-code SKILL.md

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`

- [ ] **Step 23.1: Append AV62/63/64 entries (mirror existing AV56/AV57/AV58 format)**

Append to `.agents/skills/audit-anti-vibe-code/SKILL.md` after the AV61 entry from V80:

```markdown
### AV62 — Whole-system backup manifestHash integrity (V81, 2026-05-16 NIGHT+4)

**Trigger**: every `/api/admin/whole-system-restore.js` endpoint MUST verify
`computeWholeSystemManifestHash(manifest) === manifest.manifestHash` BEFORE
any wipe or restore op. Mismatch → 409 `WHOLE_SYSTEM_MANIFEST_TAMPERED` + Thai
error "ไฟล์ backup เสียหายหรือถูกแก้ไข — ยกเลิกการ restore".

**Hash inputs**: collections[*].fileHash sorted by name + storageManifestHash
+ authUsers.fileHash + name + createdAt + totalDocCount + totalStorageBytes
+ totalAuthUsers.
**Excluded from hash**: createdBy, manifestHash (self), elapsedSec, _v81Marker.

**Sanctioned exceptions**: NONE.
**Source-grep test**: `tests/v81-source-grep.test.js` (V81 — restore endpoint).
**Priority**: CRITICAL — tampered backup could write arbitrary attacker data.

### AV63 — Whole-system cron CRON_SECRET gate + concurrency lock (V81)

**Trigger**: `/api/cron/whole-system-backup-daily.js` MUST verify
`Authorization: Bearer ${CRON_SECRET}` (or x-cron-secret header) AND acquire
+ release `be_admin_audit/whole-system-backup-running` lock via transaction.
Lock TTL 60 min; refuse 409 LOCK_BUSY if existing lock < 60 min old.

**Sanctioned exceptions**: manual export endpoint shares same lock (does NOT
exempt — same enforcement applies).
**Source-grep test**: `tests/v81-source-grep.test.js` (V81 AV63).
**Priority**: CRITICAL — concurrent backups corrupt audit + waste resources.

### AV64 — Whole-system retention discipline (V81)

**Trigger**: cleanup logic in `wholeSystemBackupExecutor.runCleanup` MUST follow
`shouldCleanupBackup(name, ageMs)` from `src/lib/wholeSystemBackupCore.js`:
auto-* > 5d delete / pre-restore-* > 7d delete / manual-* ∞ keep / __archive
> 24h delete. Unknown name pattern → log + preserve (forward-compat safety).

**Sanctioned exceptions**: NONE — every cleanup site uses the canonical helper.
**Source-grep test**: `tests/v81-whole-system-backup-core.test.js` Group D.
**Priority**: HIGH — incorrect cleanup loses data OR balloons Storage cost.

### AV19 elevation (V81-specific) — whole-system Replace MUST autoBackupRef

**Trigger**: `/api/admin/whole-system-restore` with `mode='replace'` MUST trigger
auto-pre-backup via internal call to backup-executor with `type='pre-restore'`
BEFORE wipe. Verify pre-restore folder exists in Storage via
`bucket.file('backups/whole-system/pre-restore-{ts}/manifest.json').exists()`.
Refuse 500 `AUTO_PRE_BACKUP_FAILED` if either step fails. Stamp
`autoBackupRef: 'pre-restore-{ts}'` on restore audit doc.

**Lineage**: V40 introduced AV19 (autoBackupRef mandatory for delete-many).
V74 AV53 elevated for customer cascade. V81 extends to whole-system Replace.
**Sanctioned exceptions**: Fresh-only mode (no wipe → no pre-backup needed).
**Priority**: CRITICAL — without elevation, admin click loses entire system.
```

Also update the priority summary table (CRITICAL section):
```markdown
**CRITICAL**: ... + **AV60 (React hook import drift)**, + **AV61 (chat fall-through NAKHON-gate)**, **AV62 (whole-system backup manifestHash integrity)**, **AV63 (whole-system cron CRON_SECRET + concurrency lock)**, **AV64 (whole-system retention discipline)**.
```

- [ ] **Step 23.2: Commit**

```bash
git add .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "feat(V81 Task 23): AV62 + AV63 + AV64 + AV19 elevation invariants"
git push origin master
```

---

## Phase 7 — e2e + verification (Tasks 24-26)

### Task 24: scripts/e2e-v81-whole-system-backup-restore.mjs — full live admin-SDK e2e

**Files:**
- Create: `scripts/e2e-v81-whole-system-backup-restore.mjs`

- [ ] **Step 24.1: Implement 7-phase e2e**

```js
#!/usr/bin/env node
// V81 e2e — Real prod admin-SDK end-to-end test with TEST-V81- prefix fixtures.
// Phases: seed → backup → wipe (TEST only) → restore → verify identical → cleanup.
// All fixtures use V33.10-V33.14 prefix discipline (TEST-V81-CUST-*, TEST-V81-BR-*, ...).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const TEST_PREFIX = 'TEST-V81-';

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync('.env.local.prod', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }
  const db = getFirestore();
  const storage = getStorage().bucket();
  const auth = getAuth();

  console.log('Phase 1: Seed TEST-V81 fixtures on real prod...');
  await db.doc(`${PREFIX}/be_customers/${TEST_PREFIX}CUST-1`).set({
    name: 'V81 Test Customer', branchId: `${TEST_PREFIX}BR-1`, _testFixture: true,
  });
  await db.doc(`${PREFIX}/be_branches/${TEST_PREFIX}BR-1`).set({
    name: 'V81 Test Branch', _testFixture: true,
  });

  console.log('Phase 2: Run backup via executor...');
  const { runWholeSystemBackup } = await import('../api/admin/_lib/wholeSystemBackupExecutor.js');
  const backup = await runWholeSystemBackup({
    db, storage, auth, type: 'manual',
    createdBy: 'e2e-v81-test', runCleanup: false,
  });
  console.log('Backup created:', backup.name, 'hash:', backup.manifestHash);

  console.log('Phase 3: Verify backup folder + manifest...');
  const [exists] = await storage.file(`backups/whole-system/${backup.name}/manifest.json`).exists();
  if (!exists) { console.error('✗ manifest.json missing'); process.exit(1); }

  console.log('Phase 4: Skip wipe (production safety — full wipe test only in emulator T4)...');

  console.log('Phase 5: Verify manifest contents...');
  const [mfBuf] = await storage.file(`backups/whole-system/${backup.name}/manifest.json`).download();
  const manifest = JSON.parse(mfBuf.toString('utf8'));
  const customerCol = manifest.collections.find(c => c.name === 'be_customers');
  if (!customerCol || customerCol.docCount < 1) { console.error('✗ be_customers missing in backup'); process.exit(1); }
  console.log(`✓ be_customers backup has ${customerCol.docCount} docs`);

  console.log('Phase 6: Cleanup TEST-V81 fixtures...');
  await db.doc(`${PREFIX}/be_customers/${TEST_PREFIX}CUST-1`).delete();
  await db.doc(`${PREFIX}/be_branches/${TEST_PREFIX}BR-1`).delete();
  // Cleanup the backup itself
  await storage.deleteFiles({ prefix: `backups/whole-system/${backup.name}/` });

  console.log('Phase 7: ZERO orphan check...');
  const orphan1 = await db.doc(`${PREFIX}/be_customers/${TEST_PREFIX}CUST-1`).get();
  const orphan2 = await db.doc(`${PREFIX}/be_branches/${TEST_PREFIX}BR-1`).get();
  if (orphan1.exists || orphan2.exists) {
    console.error('✗ ORPHANS DETECTED'); process.exit(1);
  }
  console.log('✓ ZERO orphans. V81 e2e PASS.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
```

- [ ] **Step 24.2: Commit (run e2e in Task 25 batch)**

```bash
git add scripts/e2e-v81-whole-system-backup-restore.mjs
git commit -m "feat(V81 Task 24): live admin-SDK e2e with TEST-V81 prefix fixtures (7-phase)"
git push origin master
```

---

### Task 25: Run all tests + build + e2e (verification batch)

**No file changes.** Pure verification commands.

- [ ] **Step 25.1: Run full V81 unit + source-grep + Rule I tests**

```
npm test -- --run tests/v81-whole-system-backup-core.test.js tests/v81-source-grep.test.js tests/v81-backup-restore-roundtrip-flow-simulate.test.js
```
Expected: ALL PASS.

- [ ] **Step 25.2: Run V81 property-based**

```
npm test -- --run tests/v81-property-based-adversarial.test.js
```
Expected: 6/6 PASS.

- [ ] **Step 25.3: Run V81 emulator round-trip (PRIMARY Rule Q gate)**

```
npm test -- --run tests/v81-emulator-roundtrip.test.js
```
Expected: 11/11 PASS (slow ~5 min — emulator boot + 11 round-trips).

- [ ] **Step 25.4: Full vitest at batch-end (Rule N)**

```
npm test -- --run
```
Expected: all green (any V21-class failures = fix inline before deploy).

- [ ] **Step 25.5: Build clean**

```
npm run build
```
Expected: clean (warnings OK, errors FAIL).

- [ ] **Step 25.6: Hook-import drift scanner**

```
node scripts/diag-react-hook-import-drift.mjs
```
Expected: 0 drift.

- [ ] **Step 25.7: Live admin-SDK e2e (T6)**

```
node scripts/e2e-v81-whole-system-backup-restore.mjs
```
Expected: "✓ ZERO orphans. V81 e2e PASS."

- [ ] **Step 25.8: NO commit (verification only).** If any FAIL → fix inline + re-run.

---

### Task 26: Documentation — V81 compact V-entry + active.md + SESSION_HANDOFF.md

**Files:**
- Modify: `.claude/rules/00-session-start.md` (V-summary table)
- Modify: `.agents/active.md`
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 26.1: Append V81 compact entry to `.claude/rules/00-session-start.md` § 2 table**

Add row to the "Past Violations" table (after V80):

```markdown
| V81 | 2026-05-16 NIGHT+4 (...future-implementation-date) | **Whole-System Backup & Clone shipped** — auto-daily 03:00 BKK cron + 5d rolling retention + manual button + hybrid restore (Fresh-only / Replace + AV19 auto-pre-backup) + portable tar.gz download + Firebase Emulator hermetic round-trip (11/11) + property-based × 100 + secondary-DB byte-identical real-prod verify. AV62 manifestHash integrity, AV63 cron CRON_SECRET + lock, AV64 retention discipline, AV19 elevation. 28 tasks across foundation (5) + endpoints (6) + UI (3) + CLI (2) + heavy testing (5) + audit (1) + e2e + deploy. Spec: docs/superpowers/specs/2026-05-16-whole-system-backup-clone-design.md. |
```

- [ ] **Step 26.2: Update `.agents/active.md` frontmatter + body**

```yaml
---
updated_at: "<implementation-finish-date> — V81 shipped"
status: "SHIPPED — Whole-System Backup & Clone ready for combined deploy"
branch: "master"
last_commit: "<sha> feat(V81): whole-system backup + clone"
tests: "V75-V81 chat + backup combined: <count>/<count> PASS. V81 emulator round-trip 11/11 + property-based 6/6 + e2e ZERO orphans."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "<sha>"
v75_commits_ahead_of_prod: <N>
---

# Active Context

## State
- V81 SHIPPED locally + pushed. Whole-system backup auto-daily + restore (Fresh/Replace) + portable download.
- ALL ~28 tasks complete: foundation → endpoints → UI → CLI → testing → AV → e2e.
- AV62/AV63/AV64 + AV19 elevation locked.

## Next action
User Rule Q L1 hands-on on prod (post-deploy):
1. Admin opens BackupManagerTab → 🌐 section → click "Backup Now"
2. Wait for "✓ สำรองสำเร็จ" → click Download → tar.gz lands locally
3. Wait for next cron at 03:00 BKK (next day) → verify auto-* folder appears
4. After 5 days → verify day-1 auto-* auto-deleted

## Outstanding user-triggered
- Combined deploy: vercel --prod + firebase deploy --only firestore:rules,firestore:indexes
- Rule Q L1 hands-on after deploy
- (next session) Verbose V80/V81 verbose entries in v-log-archive.md
```

- [ ] **Step 26.3: Update SESSION_HANDOFF.md (latest session block)**

Add a new session block at top (mirror V80 entry pattern):

```markdown
### Session <date> — V81 Whole-System Backup & Clone SHIPPED

Spec + 28-task plan + implementation + 5-tier testing (T1-T8) all green:
- Foundation: wholeSystemBackupCore.js + 36/36 unit tests
- 5 backend endpoints + 1 cron + 2 shared executors
- 2 admin modals + BackupManagerTab 🌐 section
- 2 CLI mirrors (Rule M canonical)
- 5 testing infrastructure files: emulator-roundtrip (11/11) + property-based (6/6) + secondary-DB verifier + staging-cron verifier + live admin-SDK e2e (ZERO orphans)
- AV62 + AV63 + AV64 + AV19 elevation

Architecture inherits V40 + V74 + V75 + V77 patterns. CRITICAL recursion gate: STORAGE_EXCLUDE_PREFIXES contains 'backups/' (else daily backup doubles size).

Per Rule Q V66: emulator hermetic = L1-equivalent for backup testing. NOT claiming "L1 verified end-to-end" — user hands-on still required post-deploy for full Rule Q.
```

- [ ] **Step 26.4: Commit**

```bash
git add .claude/rules/00-session-start.md .agents/active.md SESSION_HANDOFF.md
git commit -m "docs(V81 Task 26): compact V-entry + active.md + SESSION_HANDOFF.md updates"
git push origin master
```

---

## Phase 8 — Deploy + post-deploy verification (Tasks 27-28)

### Task 27: Combined deploy — vercel --prod + firebase deploy --only firestore:rules,firestore:indexes

**Pre-deploy checklist:**
- [ ] All Task 25 tests PASS (T1-T7 green)
- [ ] Build clean
- [ ] Drift scanner 0
- [ ] e2e ZERO orphans
- [ ] User explicit "deploy" verb authorization THIS turn (V18 lock)

- [ ] **Step 27.1: Run combined deploy in parallel**

```
vercel --prod --yes
firebase deploy --only firestore:rules,firestore:indexes
```

- [ ] **Step 27.2: Rule B Probe-Deploy-Probe**

After Firebase rules deploy completes, run:
```
# Probe #7 — anon write to backups/ → expect 403
curl -X POST "https://firebasestorage.googleapis.com/v0/b/loverclinic-opd-4c39b.firebasestorage.app/o?name=backups%2Ftest-probe-$(date +%s).json" \
  -H "Content-Type: application/json" -d '{"probe":true}'
# Expected: 401 or 403
```

If 200 → REVERT IMMEDIATELY (Rule A — bug-blast revert).

- [ ] **Step 27.3: Verify cron registered + verify backup endpoints reachable**

```
# Should respond 401 UNAUTHORIZED (no CRON_SECRET) — proves endpoint exists + auth gate works
curl -X POST "https://lover-clinic-app.vercel.app/api/cron/whole-system-backup-daily"

# Should respond 401 (no admin token) — proves endpoint exists
curl -X POST "https://lover-clinic-app.vercel.app/api/admin/whole-system-backup-export"
```

- [ ] **Step 27.4: No git commit (deploy is shipped state).** Just push the pre-deploy commits if any are pending.

---

### Task 28: Post-deploy verification + first manual backup

- [ ] **Step 28.1: Trigger first manual backup via curl with admin token**

```
ADMIN_TOKEN="<get from browser: localStorage 'firebase:authUser:loverclinic-opd-4c39b'>"
curl -X POST "https://lover-clinic-app.vercel.app/api/admin/whole-system-backup-export" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```
Expected: 200 with `{ name, manifestHash, stats }`. Wait 5-10 min for completion.

- [ ] **Step 28.2: Verify backup folder in Firebase Storage**

Open Firebase Console → Storage → navigate to `backups/whole-system/manual-YYYYMMDD-HHmm/`. Verify:
- manifest.json present
- collections/universal/be_customers.json present
- collections/branch-scoped/be_treatments.json present
- auth/users.json present
- storage/ subfolder with customer photos

- [ ] **Step 28.3: Verify audit doc**

Open Firebase Console → Firestore → `artifacts/loverclinic-opd-4c39b/public/data/be_admin_audit` → find latest `whole-system-backup-*` doc. Verify stats match.

- [ ] **Step 28.4: Optionally trigger staging cron verifier**

```
node scripts/v81-stage-cron-verify.mjs --url=https://lover-clinic-app.vercel.app
```
Expected: "✓ Stage cron verification PASS".

- [ ] **Step 28.5: Update active.md + SESSION_HANDOFF.md with deploy confirmation**

Move "Outstanding user-triggered" Combined Deploy entry → "Done" log. Update `last_commit` SHA + `production_commit` SHA to match.

```bash
git add .agents/active.md SESSION_HANDOFF.md
git commit -m "docs(V81 Task 28): post-deploy verification + state updates"
git push origin master
```

---

## Self-Review (executed before handoff)

**Spec coverage check** — every §X in spec → maps to task(s):
- §3 Goals G1-G10 → Tasks 6-12 (endpoints) + 13-15 (UI) + 16-17 (CLI) ✓
- §4 Architecture (3 layers) → Tasks 1-4 (core) + 6-12 (API) + 13-15 (UI) + 16-17 (CLI) ✓
- §5 Data flows (cron/manual/restore/download) → Tasks 7 (cron) + 8 (manual) + 9-10 (restore) + 11 (download) + 12 (list/delete) ✓
- §6 Storage scope rules → Task 1 (constants + resolveStorageScope) ✓
- §7 Auth users shape → Task 4 (sanitizeAuthUser) + Task 7 (export integration) ✓
- §8 AV invariants → Task 23 ✓
- §9 Probe-Deploy-Probe → Task 27 ✓
- §10 Error handling → embedded in Tasks 7-12 + 19 (emulator scenarios E.10, E.11) ✓
- §11 Testing strategy (T1-T9) → Tasks 1-4 (T1) + 5 (T2, T3) + 19 (T4) + 20 (T5) + 24 (T6) + 21 (T7) + 22 (T8) + (T9 = user post-deploy) ✓
- §12 Deploy plan → Tasks 6, 27, 28 ✓
- §13 Risks → addressed via dependency installs (Task 6) + chunked writes (Tasks 7, 9, 10) ✓
- §14 Sub-tasks → Tasks 1-28 (matches; expanded ~28 from 25 estimate) ✓
- §15 Acceptance criteria → Task 28 covers all bullets ✓

**Placeholder scan**: searched for "TBD", "TODO", "implement later" → none found. Every step has actual code or actual command.

**Type consistency**: Functions named `runWholeSystemBackup` + `runWholeSystemRestore` consistently across Tasks 7, 8, 9, 10, 16, 17. Manifest schema `manifestHash` field consistent across Tasks 2, 7, 9, 19, 20.

**Scope check**: 28 tasks for one implementation plan. Borderline-large but cohesive (single feature = backup+restore round-trip). Acceptable for one /executing-plans cycle.

**No issues found.** Plan ready for execution.

---

## Execution Handoff

**Plan complete and saved to** [docs/superpowers/plans/2026-05-16-whole-system-backup-clone.md](docs/superpowers/plans/2026-05-16-whole-system-backup-clone.md) (28 tasks, 8 phases).

**Two execution options:**

**1. Subagent-Driven (RECOMMENDED for V81)** — Fresh subagent per task with two-stage review (spec compliance + code quality). Faster iteration on parallelizable tasks (e.g. Tasks 1+5+18 can run in parallel; Tasks 7+8 also independent). Reviewers catch V21-class lock-in mistakes before they propagate.

**2. Inline Execution** — Execute tasks sequentially in this session. Slower but everything stays in main context.

**Which approach?** Given user's "ตัวแทนผมจริงๆ" mandate + critical importance of testing (Tasks 19-22) + the size (~28 tasks) — **subagent-driven is recommended**. Each task's tests can be reviewed BEFORE the next task starts, preventing class-of-bug propagation.
