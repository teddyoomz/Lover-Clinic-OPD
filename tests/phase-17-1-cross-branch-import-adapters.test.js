// ─── Phase 17.1 — adapter contract tests ──────────────────────────────────
// Per-entity adapter shape + dedupKey + fkRefs + clone semantics +
// adversarial inputs.

import { describe, it, expect } from 'vitest';
import { ADAPTERS, ENTITY_TYPES, getAdapter, isKnownEntityType } from '../src/lib/crossBranchImportAdapters/index.js';

const REQUIRED_KEYS = ['entityType', 'collection', 'dedupKey', 'fkRefs', 'clone', 'displayRow'];

describe('Phase 17.1 — adapter registry', () => {
  it('A1.1 ADAPTERS has 7 entries', () => {
    expect(Object.keys(ADAPTERS).length).toBe(7);
  });
  it('A1.2 ENTITY_TYPES contains all 7 known types', () => {
    expect(ENTITY_TYPES.sort()).toEqual(['courses', 'df-groups', 'holidays', 'medical-instruments', 'product-groups', 'product-units', 'products'].sort());
  });
  it('A1.3 getAdapter throws on unknown', () => {
    expect(() => getAdapter('foo')).toThrow();
  });
  it('A1.4 isKnownEntityType reports correctly', () => {
    expect(isKnownEntityType('products')).toBe(true);
    expect(isKnownEntityType('foo')).toBe(false);
  });
});

describe('Phase 17.1 — adapter contract conformance', () => {
  for (const entityType of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
    describe(entityType, () => {
      const adapter = getAdapter(entityType);

      it(`exports all required keys`, () => {
        for (const k of REQUIRED_KEYS) {
          expect(adapter[k]).toBeDefined();
        }
      });

      it(`entityType matches registry key`, () => {
        expect(adapter.entityType).toBe(entityType);
      });

      it(`collection is a be_* string`, () => {
        expect(adapter.collection).toMatch(/^be_/);
      });

      it(`dedupKey returns a stable string`, () => {
        const item = { name: 'TestName', productType: 'ยา', productName: 'Acetin', courseName: 'Course1', holidayType: 'specific' };
        const key = adapter.dedupKey(item);
        expect(typeof key).toBe('string');
      });

      it(`dedupKey is deterministic`, () => {
        const item = { name: 'X', productType: 'Y', productName: 'Z', courseName: 'C', holidayType: 'specific' };
        expect(adapter.dedupKey(item)).toBe(adapter.dedupKey(item));
      });

      it(`fkRefs returns an array`, () => {
        const refs = adapter.fkRefs({ products: [], items: [] });
        expect(Array.isArray(refs)).toBe(true);
      });

      it(`clone strips id field`, () => {
        const idField = adapter.collection === 'be_products' ? 'productId'
          : adapter.collection === 'be_product_groups' ? 'groupId'
          : adapter.collection === 'be_product_unit_groups' ? 'unitGroupId'
          : adapter.collection === 'be_medical_instruments' ? 'instrumentId'
          : adapter.collection === 'be_holidays' ? 'holidayId'
          : adapter.collection === 'be_courses' ? 'courseId'
          : adapter.collection === 'be_df_groups' ? 'dfGroupId'
          : 'id';
        const sourceItem = { [idField]: 'SRC-1', name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', branchId: 'BR-source' };
        const cloned = adapter.clone(sourceItem, 'BR-target', 'admin-uid');
        expect(cloned[idField]).toBeUndefined();
      });

      it(`clone stamps target branchId`, () => {
        const cloned = adapter.clone({ name: 'X', productType: 'ยา', productName: 'X', courseName: 'X' }, 'BR-target', 'admin-uid');
        expect(cloned.branchId).toBe('BR-target');
      });

      it(`clone preserves createdAt + createdBy`, () => {
        const cloned = adapter.clone(
          { name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', createdAt: '2026-01-01T00:00:00Z', createdBy: 'src-admin' },
          'BR-target',
          'tgt-admin'
        );
        expect(cloned.createdAt).toBe('2026-01-01T00:00:00Z');
        expect(cloned.createdBy).toBe('src-admin');
      });

      it(`clone sets new updatedAt + updatedBy`, () => {
        const cloned = adapter.clone({ name: 'X', productType: 'ยา', productName: 'X', courseName: 'X' }, 'BR-target', 'tgt-admin');
        expect(cloned.updatedAt).toBeDefined();
        expect(cloned.updatedBy).toBe('tgt-admin');
      });

      it(`displayRow returns object with primary`, () => {
        const row = adapter.displayRow({ name: 'X', productName: 'X', productType: 'ยา', courseName: 'X' });
        expect(row.primary).toBeDefined();
      });

      it(`adversarial: clone handles null inputs`, () => {
        expect(() => adapter.clone({}, 'BR-target', null)).not.toThrow();
      });

      it(`adversarial: dedupKey handles missing fields`, () => {
        expect(() => adapter.dedupKey({})).not.toThrow();
      });
    });
  }
});

describe('Phase 17.1 — entity-specific dedupKey + fkRefs', () => {
  it('A2.products dedupKey is productType:productName', () => {
    expect(getAdapter('products').dedupKey({ productType: 'ยา', productName: 'Acetin' })).toBe('ยา:Acetin');
  });

  it('A2.products fkRefs picks unitId + categoryId when present', () => {
    const refs = getAdapter('products').fkRefs({ unitId: 'U-1', categoryId: 'C-1' });
    expect(refs.length).toBe(2);
    expect(refs.find(r => r.collection === 'be_product_unit_groups').ids).toEqual(['U-1']);
    expect(refs.find(r => r.collection === 'be_product_groups').ids).toEqual(['C-1']);
  });

  it('A2.products fkRefs returns empty when no refs present', () => {
    expect(getAdapter('products').fkRefs({})).toEqual([]);
  });

  it('A2.product-groups dedupKey is productType:name', () => {
    expect(getAdapter('product-groups').dedupKey({ productType: 'ยากลับบ้าน', name: 'G1' })).toBe('ยากลับบ้าน:G1');
  });

  it('A2.product-groups fkRefs collects products[].productId', () => {
    const refs = getAdapter('product-groups').fkRefs({ products: [{ productId: 'P-1' }, { productId: 'P-2' }] });
    expect(refs[0].collection).toBe('be_products');
    expect(refs[0].ids).toEqual(['P-1', 'P-2']);
  });

  it('A2.courses fkRefs collects items[].productId', () => {
    const refs = getAdapter('courses').fkRefs({ items: [{ productId: 'P-1' }] });
    expect(refs[0].collection).toBe('be_products');
    expect(refs[0].ids).toEqual(['P-1']);
  });

  it('A2.standalone adapters return empty fkRefs', () => {
    for (const t of ['product-units', 'medical-instruments', 'holidays', 'df-groups']) {
      expect(getAdapter(t).fkRefs({})).toEqual([]);
    }
  });

  it('A2.holidays dedupKey includes holidayType', () => {
    const a = getAdapter('holidays');
    expect(a.dedupKey({ holidayType: 'specific', name: 'X' })).toBe('specific:X');
    expect(a.dedupKey({ holidayType: 'weekly', name: 'X' })).toBe('weekly:X');
  });
});

describe('Phase 17.1 — V14 anti-regression (no undefined leaves in clone output)', () => {
  for (const entityType of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
    it(`${entityType} clone output has no undefined values`, () => {
      const cloned = getAdapter(entityType).clone(
        { name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', holidayType: 'specific', items: [], products: [] },
        'BR-target',
        'admin-uid'
      );
      function walk(obj, path = '') {
        if (obj === undefined) {
          throw new Error(`undefined leaf at ${path || '(root)'}`);
        }
        if (obj === null || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          obj.forEach((v, i) => walk(v, `${path}[${i}]`));
          return;
        }
        for (const k of Object.keys(obj)) {
          walk(obj[k], `${path}.${k}`);
        }
      }
      expect(() => walk(cloned)).not.toThrow();
    });
  }
});
