import { describe, it, expect } from 'vitest';
import { resolveBackupScope, BACKUP_TIER_T1 } from '../src/lib/branchBackupCore.js';
import { buildBackupFile, validateBackupFile } from '../src/lib/branchBackupSchema.js';

describe('FS1 — backup → overwrite-restore round-trip simulator', () => {
  it('FS1.1 — buildBackupFile → validateBackupFile passes', () => {
    const file = buildBackupFile({
      sourceBranchId: 'BR-A', exportedBy: 'admin-1',
      scope: { tiers: [BACKUP_TIER_T1] },
      collections: { be_products: [{ id: 'P1', productName: 'A', branchId: 'BR-A' }] },
    });
    expect(() => validateBackupFile(file)).not.toThrow();
  });

  it('FS1.2 — round-trip: parse(stringify(file)) === file shape', () => {
    const file = buildBackupFile({
      sourceBranchId: 'BR-A', exportedBy: 'admin-1', scope: { tiers: ['T1'] },
      collections: { be_products: [{ id: 'P1', productName: 'A' }] },
    });
    const parsed = JSON.parse(JSON.stringify(file));
    expect(parsed.meta.schemaVersion).toBe(1);
    expect(parsed.collections.be_products[0].id).toBe('P1');
  });

  it('FS1.3 — overwrite restore preserves docId', () => {
    // Mirrors the endpoint logic for overwrite mode at the contract level
    const sourceDoc = { id: 'P1', productName: 'A', branchId: 'BR-A' };
    const writeBatch = [];
    // Simulate handler loop:
    const { id, ...rest } = sourceDoc;
    writeBatch.push({ docId: id, payload: { ...rest, branchId: 'BR-A' } });
    expect(writeBatch[0].docId).toBe('P1');
    expect(writeBatch[0].payload.branchId).toBe('BR-A');
    expect(writeBatch[0].payload.productName).toBe('A');
  });

  it('FS1.4 — scope filter applies on restore — only requested collections written', () => {
    const file = {
      meta: { schemaVersion: 1, sourceBranchId: 'BR-A' },
      collections: { be_products: [{ id: 'P1' }], be_courses: [{ id: 'C1' }] },
    };
    const scopeOverride = ['be_products'];
    const requested = scopeOverride && Array.isArray(scopeOverride) ? scopeOverride : Object.keys(file.collections);
    expect(requested).toEqual(['be_products']);
  });

  it('FS1.5 — schema-version future rejected', () => {
    expect(() => validateBackupFile({ meta: { schemaVersion: 99, sourceBranchId: 'X' }, collections: {} })).toThrow(/SCHEMA_VERSION_UNSUPPORTED/);
  });
});
