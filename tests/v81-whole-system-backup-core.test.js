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
    expect(NAME_PATTERN.test('auto-2026-05-16-0300')).toBe(false);
  });
});

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

// ─── Task 2 — Group B: manifest builder + AV62 hash + validator ────────────

import {
  buildWholeSystemManifest,
  computeWholeSystemManifestHash,
  computeStorageManifestHash,
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
      name: 'auto-20260516-0300', createdAt: 't', createdBy: 'me',
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
      name: 'auto-20260516-0300', createdAt: 't',
      collections: SAMPLE_COLLECTIONS, storageObjects: SAMPLE_STORAGE, authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 1, totalStorageBytes: 1, totalAuthUsers: 1 },
    };
    const h1 = computeWholeSystemManifestHash(buildWholeSystemManifest({ ...base, createdBy: 'cron' }));
    const h2 = computeWholeSystemManifestHash(buildWholeSystemManifest({ ...base, createdBy: 'admin-uid-xyz' }));
    expect(h1).toBe(h2);
  });

  it('B.4 — hash CHANGES on any fileHash tamper (P3 invariant)', () => {
    const base = {
      name: 'auto-20260516-0300', createdAt: 't', createdBy: 'cron',
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
    const result = validateWholeSystemManifest({ schemaVersion: 1, backupType: 'whole-system', name: 'auto-20260516-0300' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/schemaVersion/);
  });

  it('B.7 — validateWholeSystemManifest rejects missing manifestHash', () => {
    const m = buildWholeSystemManifest({
      name: 'auto-20260516-0300', createdAt: 't', createdBy: 'cron',
      collections: [], storageObjects: [], authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 0, totalStorageBytes: 0, totalAuthUsers: 0 },
    });
    const result = validateWholeSystemManifest(m);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/manifestHash/);
  });

  it('B.8 — validateWholeSystemManifest rejects mismatched manifestHash', () => {
    const m = buildWholeSystemManifest({
      name: 'auto-20260516-0300', createdAt: 't', createdBy: 'cron',
      collections: SAMPLE_COLLECTIONS, storageObjects: SAMPLE_STORAGE, authUsers: SAMPLE_AUTH,
      stats: { totalDocCount: 1, totalStorageBytes: 1, totalAuthUsers: 1 },
    });
    m.manifestHash = 'sha256:NOT_THE_REAL_HASH_0000000000000000000000000000000000000000000000';
    const result = validateWholeSystemManifest(m);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/manifestHash.*mismatch/i);
  });

  it('B.9 — computeStorageManifestHash deterministic + sorted-input invariant', () => {
    const objs1 = [
      { path: 'storage/a.jpg', fileHash: 'sha256:111' },
      { path: 'storage/b.jpg', fileHash: 'sha256:222' },
    ];
    const objs2 = [
      { path: 'storage/b.jpg', fileHash: 'sha256:222' },
      { path: 'storage/a.jpg', fileHash: 'sha256:111' },
    ];
    expect(computeStorageManifestHash(objs1)).toBe(computeStorageManifestHash(objs2));
  });

  it('B.10 — computeStorageManifestHash empty input → deterministic empty hash', () => {
    const h1 = computeStorageManifestHash([]);
    const h2 = computeStorageManifestHash([]);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

// ─── Task 3 — Group C: backup-name helpers + Group D: retention matrix ────

import {
  shouldCleanupBackup,
  parseBackupName,
  formatBackupName,
} from '../src/lib/wholeSystemBackupCore.js';

describe('V81 — backup-name helpers (Group C)', () => {
  it('C.1 — formatBackupName auto = auto-YYYYMMDD-HHmm', () => {
    const d = new Date('2026-05-16T20:00:00Z');
    expect(formatBackupName('auto', d)).toBe('auto-20260517-0300');
  });
  it('C.2 — formatBackupName manual', () => {
    const d = new Date('2026-05-16T07:30:00Z');
    expect(formatBackupName('manual', d)).toBe('manual-20260516-1430');
  });
  it('C.3 — formatBackupName pre-restore', () => {
    const d = new Date('2026-05-16T13:59:00Z');
    expect(formatBackupName('pre-restore', d)).toBe('pre-restore-20260516-2059');
  });
  it('C.4 — parseBackupName valid', () => {
    const r = parseBackupName('auto-20260516-0300');
    expect(r.valid).toBe(true);
    expect(r.type).toBe('auto');
    expect(typeof r.ts).toBe('number');
  });
  it('C.5 — parseBackupName invalid pattern', () => {
    expect(parseBackupName('random-name').valid).toBe(false);
    expect(parseBackupName('auto-2026-05-16-0300').valid).toBe(false);
  });
  it('C.6 — parseBackupName round-trip with formatBackupName', () => {
    const d = new Date('2026-05-16T20:00:00Z');
    const name = formatBackupName('auto', d);
    const parsed = parseBackupName(name);
    expect(parsed.valid).toBe(true);
    expect(parsed.type).toBe('auto');
    expect(Math.abs(parsed.ts - d.getTime())).toBeLessThan(60_000);
  });
  it('C.7 — formatBackupName throws on invalid type', () => {
    expect(() => formatBackupName('weird', new Date())).toThrow(/invalid type/);
  });
});

describe('V81 — shouldCleanupBackup retention matrix (Group D — AV64)', () => {
  const NOW = new Date('2026-05-22T00:00:00Z').getTime();
  function age(days) { return days * 24 * 60 * 60 * 1000; }

  it('D.1 — auto-* age=4d → keep', () => {
    expect(shouldCleanupBackup('auto-20260518-0300', age(4), NOW)).toEqual({
      action: 'keep', reason: 'within-retention',
    });
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

// ─── Task 4 — Group E: sanitizeAuthUser + Group F: diffStates ─────────────

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
    refreshTokens: ['token1', 'token2'],
    tokensValidAfterTime: '2026-05-01',
    multiFactor: { enrolledFactors: [] },
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
  it('E.3 — STRIPS refreshTokens + tokensValidAfterTime + multiFactor (security)', () => {
    const s = sanitizeAuthUser(RAW);
    expect(s.refreshTokens).toBeUndefined();
    expect(s.tokensValidAfterTime).toBeUndefined();
    expect(s.multiFactor).toBeUndefined();
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
  it('E.6 — returns null for non-object input', () => {
    expect(sanitizeAuthUser(null)).toBe(null);
    expect(sanitizeAuthUser(undefined)).toBe(null);
    expect(sanitizeAuthUser('string')).toBe(null);
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
  it('F.4 — doc removed → reports removed', () => {
    const a = { col1: [{ id: '1', x: 'foo' }, { id: '2', x: 'bar' }] };
    const b = { col1: [{ id: '1', x: 'foo' }] };
    const d = diffStates(a, b);
    expect(d.removed).toEqual([{ collection: 'col1', id: '2' }]);
  });
  it('F.5 — handles missing state keys (one side has collection, other does not)', () => {
    const a = { col1: [{ id: '1' }] };
    const b = { col2: [{ id: '2' }] };
    const d = diffStates(a, b);
    expect(d.added).toEqual([{ collection: 'col2', id: '2' }]);
    expect(d.removed).toEqual([{ collection: 'col1', id: '1' }]);
  });
});
