import { describe, it, expect } from 'vitest';
import {
  TIER_MAP,
  BACKUP_TIER_T1, BACKUP_TIER_T2, BACKUP_TIER_T3, BACKUP_TIER_T4,
  resolveBackupScope,
  isUniversalCollection,
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
