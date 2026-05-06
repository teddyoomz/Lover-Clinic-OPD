import { describe, it, expect } from 'vitest';
import {
  TIER_MAP,
  BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, BACKUP_TIER_T4,
  resolveBackupScope,
  isUniversalCollection,
  buildFkRemapTable,
  applyFkRemap,
} from '../src/lib/branchBackupCore.js';

describe('H1 — BSA tier matrix', () => {
  it('H1.1 — TIER_MAP has 4 tiers covering 30+ branch-scoped collections', () => {
    expect(Object.keys(TIER_MAP).sort()).toEqual([BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, BACKUP_TIER_T4].sort());
    const all = Object.values(TIER_MAP).flat();
    expect(all.length).toBeGreaterThanOrEqual(30);
  });

  it('H1.2 — T1 contains catalog/setup collections', () => {
    expect(TIER_MAP[BACKUP_TIER_T1]).toContain('be_products');
    expect(TIER_MAP[BACKUP_TIER_T1]).toContain('be_courses');
    expect(TIER_MAP[BACKUP_TIER_T1]).toContain('be_promotions');
  });

  it('H1.5 — T1 includes both be_product_units (rules-canonical) and be_product_unit_groups (V39 adapter target)', () => {
    expect(TIER_MAP[BACKUP_TIER_T1]).toContain('be_product_units');
    expect(TIER_MAP[BACKUP_TIER_T1]).toContain('be_product_unit_groups');
  });

  it('H1.6 — T1 includes be_exam_rooms (Phase 18.0 branch-spread)', () => {
    expect(TIER_MAP[BACKUP_TIER_T1]).toContain('be_exam_rooms');
  });

  it('H1.3 — T3 contains stock_movements (V34 immutable)', () => {
    expect(TIER_MAP[BACKUP_TIER_T3]).toContain('be_stock_movements');
  });

  it('H1.4 — universal collections classified correctly', () => {
    expect(isUniversalCollection('be_staff')).toBe(true);
    expect(isUniversalCollection('be_products')).toBe(false);
    expect(isUniversalCollection('chat_conversations')).toBe(true);
  });
});

describe('H2 — resolveBackupScope', () => {
  it('H2.1 — tiers expand to collection list', () => {
    const out = resolveBackupScope({ tiers: [BACKUP_TIER_T1] });
    expect(out).toContain('be_products');
    expect(out).not.toContain('be_treatments');
  });

  it('H2.2 — collections override tiers when both provided', () => {
    const out = resolveBackupScope({ tiers: [BACKUP_TIER_T1], collections: ['be_promotions'] });
    expect(out).toEqual(['be_promotions']);
  });

  it('H2.3 — empty tiers + empty collections → empty list (not all-tiers)', () => {
    expect(resolveBackupScope({ tiers: [], collections: [] })).toEqual([]);
  });

  it('H2.4 — rejects universal collection in scope', () => {
    expect(() => resolveBackupScope({ collections: ['be_staff'] })).toThrow(/UNIVERSAL_COLLECTION_NOT_BACKUPABLE/);
  });
});

describe('H3 — FK remap (clone mode)', () => {
  it('H3.1 — buildFkRemapTable maps source IDs to new IDs', () => {
    const sources = [{ id: 'OLD-1' }, { id: 'OLD-2' }];
    const newIds = ['NEW-1', 'NEW-2'];
    const map = buildFkRemapTable(sources, newIds);
    expect(map.get('OLD-1')).toBe('NEW-1');
    expect(map.get('OLD-2')).toBe('NEW-2');
  });

  it('H3.2 — applyFkRemap rewrites flat productId reference', () => {
    const map = new Map([['OLD-1', 'NEW-1']]);
    const out = applyFkRemap({ productId: 'OLD-1', name: 'X' }, { productId: 'be_products' }, { be_products: map });
    expect(out.productId).toBe('NEW-1');
  });

  it('H3.3 — applyFkRemap rewrites array-of-objects refs', () => {
    const map = new Map([['OLD-1', 'NEW-1'], ['OLD-2', 'NEW-2']]);
    const doc = { items: [{ productId: 'OLD-1' }, { productId: 'OLD-2' }] };
    const out = applyFkRemap(doc, { 'items[].productId': 'be_products' }, { be_products: map });
    expect(out.items[0].productId).toBe('NEW-1');
    expect(out.items[1].productId).toBe('NEW-2');
  });

  it('H3.4 — applyFkRemap leaves unmapped IDs unchanged + flags in audit', () => {
    const map = new Map([['OLD-1', 'NEW-1']]);
    const audit = { unmapped: [] };
    const out = applyFkRemap({ productId: 'UNKNOWN' }, { productId: 'be_products' }, { be_products: map }, audit);
    expect(out.productId).toBe('UNKNOWN');
    expect(audit.unmapped).toContainEqual({ field: 'productId', oldId: 'UNKNOWN', collection: 'be_products' });
  });
});

import { BACKUP_SCHEMA_VERSION, validateBackupFile, buildBackupFile } from '../src/lib/branchBackupSchema.js';

describe('H4 — schema validators', () => {
  it('H4.1 — BACKUP_SCHEMA_VERSION is 1', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(1);
  });

  it('H4.2 — validateBackupFile rejects missing meta.schemaVersion', () => {
    expect(() => validateBackupFile({ meta: {}, collections: {} })).toThrow(/SCHEMA_VERSION_MISSING/);
  });

  it('H4.3 — validateBackupFile rejects future schemaVersion', () => {
    expect(() => validateBackupFile({ meta: { schemaVersion: 999 }, collections: {} })).toThrow(/SCHEMA_VERSION_UNSUPPORTED/);
  });

  it('H4.4 — validateBackupFile rejects missing sourceBranchId', () => {
    expect(() => validateBackupFile({ meta: { schemaVersion: 1 }, collections: {} })).toThrow(/SOURCE_BRANCH_ID_MISSING/);
  });

  it('H4.5 — buildBackupFile produces shape with meta + collections', () => {
    const file = buildBackupFile({
      sourceBranchId: 'BR-A', exportedBy: 'admin-1', scope: { tiers: ['T1'] },
      collections: { be_products: [{ id: 'P1' }] },
    });
    expect(file.meta.schemaVersion).toBe(1);
    expect(file.meta.sourceBranchId).toBe('BR-A');
    expect(file.collections.be_products).toHaveLength(1);
    expect(file.meta.perCollectionCounts.be_products).toBe(1);
  });
});
