import { describe, it, expect } from 'vitest';
import {
  buildCustomerBackupFile,
  validateCustomerBackupFile,
  computeStorageManifestHash,
} from '../src/lib/customerBackupSchema.js';

const baseBuild = {
  customerId: 'LC-1', customerHN: '0001', customerName: 'A', exportedBy: 'x',
  collections: {}, subcollections: {}, chatConversations: [], storageManifest: [],
};

describe('buildCustomerBackupFile', () => {
  it('S1.1 produces file with meta.backupType="customer"', () => {
    const file = buildCustomerBackupFile(baseBuild);
    expect(file.meta.backupType).toBe('customer');
    expect(file.meta.customerId).toBe('LC-1');
    expect(file.meta.customerHN).toBe('0001');
    expect(file.meta.schemaVersion).toBe(2);
  });
  it('S1.2 bodyHash spans collections+subcollections+chatConversations', () => {
    const collections = { be_treatments: [{ id: 'T1', customerId: 'LC-1' }] };
    const subcollections = { treatments: [{ id: 'T1' }] };
    const chatConversations = [{ id: 'C1', lineUserId: 'U1' }];
    const file = buildCustomerBackupFile({ ...baseBuild, collections, subcollections, chatConversations });
    expect(file.meta.bodyHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('S1.3 storageManifestHash present when manifest non-empty', () => {
    const file = buildCustomerBackupFile({
      ...baseBuild,
      storageManifest: [{ path: 'be_customers/LC-1/img.jpg', size: 100, sha256: 'abc' }],
    });
    expect(file.meta.storageManifestHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('S1.4 userNote optional; empty default', () => {
    const file = buildCustomerBackupFile(baseBuild);
    expect(file.meta.userNote).toBe('');
  });
  it('S1.5 userNote stored as-is when provided', () => {
    const file = buildCustomerBackupFile({ ...baseBuild, userNote: 'EOD checkpoint' });
    expect(file.meta.userNote).toBe('EOD checkpoint');
  });
  it('S1.6 scope tiers + auditImmutableExcluded present in meta', () => {
    const file = buildCustomerBackupFile(baseBuild);
    expect(file.meta.scope.tiers).toEqual(['CD', 'C11', 'CG', 'CS', 'CF', 'CH']);
    expect(file.meta.scope.auditImmutableExcluded).toContain('be_admin_audit');
    expect(file.meta.scope.auditImmutableExcluded).toContain('be_stock_movements');
  });
  it('S1.7 userNote NOT in bodyHash — label edit preserves hash', () => {
    const f1 = buildCustomerBackupFile({ ...baseBuild, userNote: 'A' });
    const f2 = buildCustomerBackupFile({ ...baseBuild, userNote: 'B' });
    expect(f1.meta.bodyHash).toBe(f2.meta.bodyHash);
    expect(f1.meta.storageManifestHash).toBe(f2.meta.storageManifestHash);
  });
});

describe('validateCustomerBackupFile', () => {
  it('S2.1 accepts canonical v2 file', () => {
    const file = buildCustomerBackupFile(baseBuild);
    expect(() => validateCustomerBackupFile(file)).not.toThrow();
  });
  it('S2.2 throws on missing meta.customerId', () => {
    const f = { meta: { schemaVersion: 2, backupType: 'customer' }, collections: {}, subcollections: {} };
    expect(() => validateCustomerBackupFile(f)).toThrow(/CUSTOMER_ID_MISSING/);
  });
  it('S2.3 throws on backupType !== customer', () => {
    const f = {
      meta: { schemaVersion: 2, backupType: 'branch', customerId: 'LC-1' },
      collections: {}, subcollections: {},
    };
    expect(() => validateCustomerBackupFile(f)).toThrow(/BACKUP_TYPE_MISMATCH/);
  });
  it('S2.4 throws on missing collections block', () => {
    const f = { meta: { schemaVersion: 2, backupType: 'customer', customerId: 'LC-1' } };
    expect(() => validateCustomerBackupFile(f)).toThrow(/COLLECTIONS_BLOCK_MISSING/);
  });
  it('S2.5 throws on missing subcollections block', () => {
    const f = {
      meta: { schemaVersion: 2, backupType: 'customer', customerId: 'LC-1' },
      collections: {},
    };
    expect(() => validateCustomerBackupFile(f)).toThrow(/SUBCOLLECTIONS_BLOCK_MISSING/);
  });
  it('S2.6 throws on invalid bodyHash format', () => {
    const f = {
      meta: { schemaVersion: 2, backupType: 'customer', customerId: 'LC-1', bodyHash: 'short' },
      collections: {}, subcollections: {},
    };
    expect(() => validateCustomerBackupFile(f)).toThrow(/INVALID_BODY_HASH_FORMAT/);
  });
  it('S2.7 throws on invalid storageManifestHash format', () => {
    const f = {
      meta: { schemaVersion: 2, backupType: 'customer', customerId: 'LC-1', storageManifestHash: 'short' },
      collections: {}, subcollections: {},
    };
    expect(() => validateCustomerBackupFile(f)).toThrow(/INVALID_STORAGE_MANIFEST_HASH_FORMAT/);
  });
  it('S2.8 throws on schemaVersion > current', () => {
    const f = {
      meta: { schemaVersion: 99, backupType: 'customer', customerId: 'LC-1' },
      collections: {}, subcollections: {},
    };
    expect(() => validateCustomerBackupFile(f)).toThrow(/SCHEMA_VERSION_UNSUPPORTED/);
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
    expect(computeStorageManifestHash([])).toBe(h);
  });
});
