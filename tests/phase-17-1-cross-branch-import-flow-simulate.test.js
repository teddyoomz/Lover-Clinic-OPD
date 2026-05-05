// ─── Phase 17.1 — flow-simulate F1-F8 (Rule I) ────────────────────────────
// Source-grep across registry / endpoint / button / modal / 7 tabs.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { ENTITY_TYPES, ADAPTERS } from '../src/lib/crossBranchImportAdapters/index.js';

const TARGET_TABS = [
  { tabFile: 'src/components/backend/ProductGroupsTab.jsx', entityType: 'product-groups' },
  { tabFile: 'src/components/backend/ProductUnitsTab.jsx', entityType: 'product-units' },
  { tabFile: 'src/components/backend/MedicalInstrumentsTab.jsx', entityType: 'medical-instruments' },
  { tabFile: 'src/components/backend/HolidaysTab.jsx', entityType: 'holidays' },
  { tabFile: 'src/components/backend/ProductsTab.jsx', entityType: 'products' },
  { tabFile: 'src/components/backend/CoursesTab.jsx', entityType: 'courses' },
  { tabFile: 'src/components/backend/DfGroupsTab.jsx', entityType: 'df-groups' },
];

describe('F1 — adapter registry', () => {
  it('F1.1 ENTITY_TYPES has 7 entries', () => {
    expect(ENTITY_TYPES.length).toBe(7);
  });
  it('F1.2 ADAPTERS keys match ENTITY_TYPES exactly', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual([...ENTITY_TYPES].sort());
  });
});

describe('F2 — adapter contract conformance', () => {
  for (const t of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
    it(`F2.${t} has all required exports`, () => {
      const a = ADAPTERS[t];
      expect(a.entityType).toBeDefined();
      expect(a.collection).toBeDefined();
      expect(typeof a.dedupKey).toBe('function');
      expect(typeof a.fkRefs).toBe('function');
      expect(typeof a.clone).toBe('function');
      expect(typeof a.displayRow).toBe('function');
    });
  }
});

describe('F3 — server endpoint shape', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8'); });

  it('F3.1 endpoint imports adapter registry', () => {
    expect(content).toMatch(/from\s+['"][^'"]+crossBranchImportAdapters\/index/);
  });
  it('F3.2 endpoint admin-gate runs BEFORE entity-type validation', () => {
    // Either via verifyAdminToken function call OR inline decoded.admin check —
    // both must appear before the isKnownEntityType validation.
    const handlerStart = content.indexOf('async function handler');
    const adminCheckPos = Math.min(
      ...['verifyAdminToken', 'decoded.admin', 'NOT_ADMIN'].map(needle => {
        const pos = content.indexOf(needle, handlerStart);
        return pos === -1 ? Infinity : pos;
      })
    );
    const validationPos = content.indexOf('isKnownEntityType', handlerStart);
    expect(adminCheckPos).toBeLessThan(validationPos);
  });
  it('F3.3 endpoint uses single batch.commit', () => {
    const matches = content.match(/batch\.commit\(\)/g) || [];
    expect(matches.length).toBe(1);
  });
});

describe('F4 — clone preserves audit fields', () => {
  for (const t of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
    it(`F4.${t} preserves createdAt + createdBy`, () => {
      const cloned = ADAPTERS[t].clone(
        { name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', holidayType: 'specific', createdAt: '2026-01-01', createdBy: 'src' },
        'BR-target',
        'tgt-admin'
      );
      expect(cloned.createdAt).toBe('2026-01-01');
      expect(cloned.createdBy).toBe('src');
    });
  }
});

describe('F5 — dedupKey + fkRefs invocation', () => {
  it('F5.1 endpoint calls adapter.dedupKey for classification', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/adapter\.dedupKey/);
  });
  it('F5.2 endpoint calls adapter.fkRefs for FK validation', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/adapter\.fkRefs/);
  });
});

describe('F6 — atomic batch', () => {
  it('F6.1 endpoint uses single batch.commit() (no per-doc commits)', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    const commits = content.match(/\.commit\(\)/g) || [];
    expect(commits.length).toBe(1);
  });
});

describe('F7 — audit doc emit', () => {
  it('F7.1 audit doc id starts with cross-branch-import-', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/cross-branch-import-\$\{ts\}/);
  });
  it('F7.2 audit batch.set targets be_admin_audit', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/batch\.set\([\s\S]+be_admin_audit/);
  });
});

describe('F8 — V21 anti-regression: source-grep guards', () => {
  it('F8.1 every adapter strips its id field in clone', () => {
    for (const [type, adapter] of Object.entries(ADAPTERS)) {
      const idField = adapter.collection === 'be_products' ? 'productId'
        : adapter.collection === 'be_product_groups' ? 'groupId'
        : adapter.collection === 'be_product_unit_groups' ? 'unitGroupId'
        : adapter.collection === 'be_medical_instruments' ? 'instrumentId'
        : adapter.collection === 'be_holidays' ? 'holidayId'
        : adapter.collection === 'be_courses' ? 'courseId'
        : adapter.collection === 'be_df_groups' ? 'dfGroupId'
        : 'id';
      const cloned = adapter.clone({ [idField]: 'SRC-1', name: 'X', productType: 'ยา', productName: 'X', courseName: 'X', holidayType: 'specific' }, 'BR-target', 'admin-uid');
      expect(cloned[idField], `${type} did not strip ${idField}`).toBeUndefined();
    }
  });

  it('F8.2 every target tab imports CrossBranchImportButton', () => {
    for (const { tabFile } of TARGET_TABS) {
      const content = fs.readFileSync(tabFile, 'utf8');
      expect(content, tabFile).toMatch(/import\s+CrossBranchImportButton\s+from/);
    }
  });

  it('F8.3 every target tab renders the button with correct entityType', () => {
    for (const { tabFile, entityType } of TARGET_TABS) {
      const content = fs.readFileSync(tabFile, 'utf8');
      expect(content, `${tabFile} missing entityType="${entityType}"`).toMatch(new RegExp(`entityType=["']${entityType}["']`));
    }
  });

  it('F8.4 endpoint never lets sourceBranchId === targetBranchId proceed', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/sourceBranchId\s*===\s*targetBranchId[\s\S]+SOURCE_EQUALS_TARGET/);
  });

  it('F8.5 modal admin-gate via useTabAccess.isAdmin in button', () => {
    const content = fs.readFileSync('src/components/backend/CrossBranchImportButton.jsx', 'utf8');
    expect(content).toMatch(/useTabAccess/);
    expect(content).toMatch(/isAdmin/);
    expect(content).toMatch(/if\s*\(!isAdmin\)\s*return\s+null/);
  });
});
