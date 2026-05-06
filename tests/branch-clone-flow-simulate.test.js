import { describe, it, expect } from 'vitest';
import { buildFkRemapTable, applyFkRemap, T1_FK_SPEC, TIER_MAP, BACKUP_TIER_T1 } from '../src/lib/branchBackupCore.js';

describe('FS2 — clone-T1 with FK remap', () => {
  it('FS2.1 — products clone re-mints IDs', () => {
    const sources = [{ id: 'OLD-P1', productName: 'A' }, { id: 'OLD-P2', productName: 'B' }];
    const newIds = ['NEW-P1', 'NEW-P2'];
    const map = buildFkRemapTable(sources, newIds);
    expect(map.get('OLD-P1')).toBe('NEW-P1');
    expect(map.get('OLD-P2')).toBe('NEW-P2');
  });

  it('FS2.2 — courses items[].productId remapped to new product IDs', () => {
    const productMap = new Map([['OLD-P1', 'NEW-P1'], ['OLD-P2', 'NEW-P2']]);
    const sourceCourse = { courseName: 'Course A', items: [{ productId: 'OLD-P1', qty: 1 }, { productId: 'OLD-P2', qty: 2 }] };
    const remapped = applyFkRemap(sourceCourse, T1_FK_SPEC.be_courses, { be_products: productMap });
    expect(remapped.items[0].productId).toBe('NEW-P1');
    expect(remapped.items[1].productId).toBe('NEW-P2');
  });

  it('FS2.3 — unmapped FKs are flagged in audit + left unchanged', () => {
    const productMap = new Map([['OLD-P1', 'NEW-P1']]);
    const audit = { unmapped: [] };
    const out = applyFkRemap({ items: [{ productId: 'OLD-P1' }, { productId: 'UNKNOWN' }] }, T1_FK_SPEC.be_courses, { be_products: productMap }, audit);
    expect(out.items[0].productId).toBe('NEW-P1');
    expect(out.items[1].productId).toBe('UNKNOWN');
    expect(audit.unmapped).toContainEqual({ field: 'items[].productId', oldId: 'UNKNOWN', collection: 'be_products' });
  });

  it('FS2.4 — clone scope rejection for non-T1 collection', () => {
    const t1set = new Set(TIER_MAP[BACKUP_TIER_T1]);
    expect(t1set.has('be_treatments')).toBe(false);
    expect(t1set.has('be_products')).toBe(true);
    expect(t1set.has('be_courses')).toBe(true);
  });

  it('FS2.5 — branchId stamped to target on clone', () => {
    const targetBranchId = 'BR-TARGET';
    const sourceDoc = { productName: 'A', branchId: 'BR-SOURCE' };
    const stamped = { ...sourceDoc, branchId: targetBranchId };
    expect(stamped.branchId).toBe('BR-TARGET');
  });
});
