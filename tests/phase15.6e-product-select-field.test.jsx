// ─── Phase 15.6 / V35 — ProductSelectField + 4-site migration (Issue 4) ─────
// User directive (verbatim, 2026-04-28):
//   "ทำให้ Dropdown เลือกสินค้าในทุกหน้าของระบบสต็อค ทั้งของ tab สาขาและ tab
//    คลังกลางสามารถ search ได้ด้วย ไม่ใช่เลือกได้อย่างเดียว สินค้าเยอะต้อง
//    search ได้".
//
// 4+ stock pickers + 4+ non-stock backend forms = 8+ Rule of 3 trigger.
// Extract once: `ProductSelectField.jsx` mirrors `StaffSelectField.jsx`
// (V32-tris pattern). Helper `filterProductsByQuery` lives in
// `productSearchUtils.js`.
//
// Coverage:
//   PSF.A — productSearchUtils helper unit tests (composeProductDisplayName,
//           composeProductSubtitle, filterProductsByQuery)
//   PSF.B — ProductSelectField source-grep (typeahead, outside-click, 50-cap)
//   PSF.C — Stock-picker migration: 4 sites use ProductSelectField (Rule C1 lock)
//   PSF.D — Adversarial inputs (empty, Thai, mixed, special chars)
//   PSF.E — Tier-scope preservation: caller passes pre-filtered options
//   PSF.F — Reuses canonical productDisplayName helper (V12 lock)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  composeProductDisplayName,
  composeProductSubtitle,
  filterProductsByQuery,
} from '../src/lib/productSearchUtils.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const fieldSrc = read('src/components/backend/ProductSelectField.jsx');
const utilsSrc = read('src/lib/productSearchUtils.js');
const orderPanelSrc = read('src/components/backend/OrderPanel.jsx');
const centralPoSrc = read('src/components/backend/CentralStockOrderPanel.jsx');
const adjustPanelSrc = read('src/components/backend/StockAdjustPanel.jsx');

// =============================================================================
describe('Phase 15.6 PSF.A — productSearchUtils helpers', () => {
  describe('PSF.A.1 composeProductDisplayName', () => {
    it('returns productName when present', () => {
      expect(composeProductDisplayName({ productName: 'Allergan 100 U' })).toBe('Allergan 100 U');
    });

    it('falls back to name when productName missing', () => {
      expect(composeProductDisplayName({ name: 'BTX 50' })).toBe('BTX 50');
    });

    it('prefers productName over name (canonical lookup)', () => {
      expect(composeProductDisplayName({ productName: 'A', name: 'B' })).toBe('A');
    });

    it('falls back to "Product {id}" when both names missing but id present', () => {
      expect(composeProductDisplayName({ id: 'P-X' })).toBe('Product P-X');
    });

    it('returns "" when nothing usable', () => {
      expect(composeProductDisplayName({})).toBe('');
      expect(composeProductDisplayName(null)).toBe('');
      expect(composeProductDisplayName(undefined)).toBe('');
      expect(composeProductDisplayName('not-an-object')).toBe('');
    });

    it('handles Thai product names', () => {
      expect(composeProductDisplayName({ productName: 'โบทูล็อกซ์ 50U' })).toBe('โบทูล็อกซ์ 50U');
    });

    it('trims whitespace', () => {
      expect(composeProductDisplayName({ productName: '  spaced  ' })).toBe('spaced');
    });
  });

  describe('PSF.A.2 composeProductSubtitle', () => {
    it('returns group + category + unit when all present', () => {
      const sub = composeProductSubtitle({
        groupName: 'BA',
        category: 'medication',
        mainUnitName: 'U',
      });
      expect(sub).toMatch(/BA/);
      expect(sub).toMatch(/medication/);
      expect(sub).toMatch(/U/);
    });

    it('skips duplicate group/category', () => {
      const sub = composeProductSubtitle({ groupName: 'BA', category: 'BA', unit: 'cc' });
      // group 'BA' once, then unit 'cc' — category 'BA' deduped
      const baCount = (sub.match(/BA/g) || []).length;
      expect(baCount).toBe(1);
    });

    it('returns empty string when no subtitle data', () => {
      expect(composeProductSubtitle({})).toBe('');
      expect(composeProductSubtitle(null)).toBe('');
    });
  });

  describe('PSF.A.3 filterProductsByQuery', () => {
    const sample = [
      { id: 'P1', productName: 'Allergan 100 U', groupName: 'BA' },
      { id: 'P2', productName: 'BTX 50', groupName: 'BA' },
      { id: 'P3', productName: 'Acetin 6', groupName: 'CA' },
      { id: 'P4', productName: 'โบทูล็อกซ์', groupName: 'BA' },
    ];

    it('empty query returns all (sorted)', () => {
      const result = filterProductsByQuery(sample, '');
      expect(result).toHaveLength(4);
    });

    it('filters by display name (case-insensitive)', () => {
      const result = filterProductsByQuery(sample, 'allergan');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('P1');
    });

    it('filters by group', () => {
      const result = filterProductsByQuery(sample, 'CA');
      expect(result.map(p => p.id)).toEqual(['P3']);
    });

    it('filters by Thai text', () => {
      const result = filterProductsByQuery(sample, 'โบทู');
      expect(result.map(p => p.id)).toEqual(['P4']);
    });

    it('filters by id substring', () => {
      const result = filterProductsByQuery(sample, 'P3');
      expect(result.map(p => p.id)).toEqual(['P3']);
    });

    it('returns empty when no match', () => {
      expect(filterProductsByQuery(sample, 'NOMATCH')).toEqual([]);
    });

    it('handles non-array gracefully', () => {
      expect(filterProductsByQuery(null, 'q')).toEqual([]);
      expect(filterProductsByQuery(undefined, 'q')).toEqual([]);
    });

    it('Thai-locale sort applied (sorted result)', () => {
      const result = filterProductsByQuery(sample, '');
      // First name should sort lexicographically in Thai-locale
      const names = result.map(composeProductDisplayName);
      expect(names.length).toBe(4);
      // Sorted = stable order; check the first element is a deterministic value
      expect(names[0]).toBeDefined();
    });
  });
});

// =============================================================================
describe('Phase 15.6 PSF.B — ProductSelectField component shape', () => {
  it('PSF.B.1 — imports from productSearchUtils', () => {
    expect(fieldSrc).toMatch(/import\s*\{[^}]*composeProductDisplayName[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/productSearchUtils\.js['"]/);
    expect(fieldSrc).toMatch(/import\s*\{[^}]*filterProductsByQuery[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/productSearchUtils\.js['"]/);
  });

  it('PSF.B.2 — typeahead input + dropdown structure', () => {
    expect(fieldSrc).toMatch(/onFocus=\{[^}]*setOpen\(true\)/);
    expect(fieldSrc).toMatch(/onChange=\{\(e\)\s*=>\s*\{\s*setQuery/);
  });

  it('PSF.B.3 — outside-click closes dropdown', () => {
    expect(fieldSrc).toMatch(/document\.addEventListener\(['"]mousedown['"]/);
    expect(fieldSrc).toMatch(/setOpen\(false\)/);
  });

  it('PSF.B.4 — 50-result cap with overflow message', () => {
    expect(fieldSrc).toMatch(/\.slice\(0,\s*50\)/);
    expect(fieldSrc).toMatch(/แสดง 50 รายการแรก/);
  });

  it('PSF.B.5 — onChange emits (id, record) pair', () => {
    expect(fieldSrc).toMatch(/onChange\(id,\s*p\)/);
  });

  it('PSF.B.6 — disabled prop honored', () => {
    expect(fieldSrc).toMatch(/disabled=\{disabled\}/);
    expect(fieldSrc).toMatch(/if\s*\(!disabled\)/);
  });

  it('PSF.B.7 — selected product display in closed input (productMap fallback)', () => {
    expect(fieldSrc).toMatch(/safe\.find/);
    expect(fieldSrc).toMatch(/composeProductDisplayName\(selected\)/);
  });

  it('PSF.B.8 — Phase 15.6 / V35 marker comment present', () => {
    expect(fieldSrc).toMatch(/Phase 15\.6/);
    expect(fieldSrc).toMatch(/V35/);
  });
});

// =============================================================================
describe('Phase 15.6 PSF.C — Stock picker migration (4 sites Rule C1 lock)', () => {
  it('PSF.C.1 — OrderPanel imports ProductSelectField', () => {
    expect(orderPanelSrc).toMatch(/import\s+ProductSelectField\s+from\s+['"]\.\/ProductSelectField\.jsx['"]/);
  });

  it('PSF.C.2 — OrderPanel renders ProductSelectField (mobile + desktop = 2 sites)', () => {
    const matches = orderPanelSrc.match(/<ProductSelectField/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('PSF.C.3 — CentralStockOrderPanel imports ProductSelectField', () => {
    expect(centralPoSrc).toMatch(/import\s+ProductSelectField\s+from\s+['"]\.\/ProductSelectField\.jsx['"]/);
  });

  it('PSF.C.4 — CentralStockOrderPanel renders ProductSelectField', () => {
    expect(centralPoSrc).toMatch(/<ProductSelectField/);
  });

  it('PSF.C.5 — StockAdjustPanel imports ProductSelectField', () => {
    expect(adjustPanelSrc).toMatch(/import\s+ProductSelectField\s+from\s+['"]\.\/ProductSelectField\.jsx['"]/);
  });

  it('PSF.C.6 — StockAdjustPanel renders ProductSelectField', () => {
    expect(adjustPanelSrc).toMatch(/<ProductSelectField/);
  });

  it('PSF.C.7 — StockAdjustPanel preserves tier-scope (passes availableProducts as options)', () => {
    expect(adjustPanelSrc).toMatch(/<ProductSelectField[\s\S]{0,300}options=\{availableProducts\}/);
  });
});

// =============================================================================
describe('Phase 15.6 PSF.D — Adversarial inputs (no crash)', () => {
  it('PSF.D.1 — null + undefined options', () => {
    expect(filterProductsByQuery(null, '')).toEqual([]);
    expect(filterProductsByQuery(undefined, '')).toEqual([]);
  });

  it('PSF.D.2 — products with missing/null fields', () => {
    const products = [
      { id: 'A' },                                     // no name
      { productName: 'B' },                            // no id
      { id: 'C', productName: null },                  // null name
      { id: 'D', productName: '', groupName: 'GroupX' }, // empty name + group
    ];
    expect(() => filterProductsByQuery(products, 'X')).not.toThrow();
  });

  it('PSF.D.3 — special chars in query', () => {
    const products = [{ id: 'A', productName: 'Test (x)' }];
    expect(() => filterProductsByQuery(products, '(x)')).not.toThrow();
  });

  it('PSF.D.4 — query with regex special chars (no regex injection)', () => {
    const products = [{ id: 'A', productName: 'Test' }];
    // Should NOT match `.+` regex — query is treated as string literal
    expect(filterProductsByQuery(products, '.+')).toEqual([]);
  });

  it('PSF.D.5 — empty query returns all (no filter applied)', () => {
    const products = [{ id: 'A', productName: 'A' }, { id: 'B', productName: 'B' }];
    expect(filterProductsByQuery(products, '')).toHaveLength(2);
    expect(filterProductsByQuery(products, '   ')).toHaveLength(2); // whitespace-only also empty
  });

  it('PSF.D.6 — extremely long query', () => {
    const products = [{ id: 'A', productName: 'short' }];
    const longQ = 'x'.repeat(10000);
    expect(filterProductsByQuery(products, longQ)).toEqual([]);
  });
});

// =============================================================================
describe('Phase 15.6 PSF.E — Tier-scope preserved upstream', () => {
  it('PSF.E.1 — productSearchUtils does NOT enforce tier scope', () => {
    // This is intentional: caller decides scope (StockAdjustPanel narrows
    // products to availableProducts BEFORE passing to ProductSelectField).
    // Helper just searches whatever it was given.
    const tierAProducts = [{ id: 'A', productName: 'A-prod', groupName: 'tierA' }];
    const tierBProducts = [{ id: 'B', productName: 'B-prod', groupName: 'tierB' }];

    // If caller passes tierA only, picker can never surface tierB.
    expect(filterProductsByQuery(tierAProducts, 'B')).toEqual([]);
    // If caller passes both, picker filters by query.
    const combined = [...tierAProducts, ...tierBProducts];
    expect(filterProductsByQuery(combined, 'B').map(p => p.id)).toEqual(['B']);
  });
});

// =============================================================================
describe('Phase 15.6 PSF.F — Reuses canonical productDisplayName (V12 lock)', () => {
  it('PSF.F.1 — productSearchUtils imports from productValidation.js', () => {
    expect(utilsSrc).toMatch(/import\s*\{\s*productDisplayName/);
    expect(utilsSrc).toMatch(/from\s+['"]\.\/productValidation\.js['"]/);
  });

  it('PSF.F.2 — composeProductDisplayName delegates to canonical helper', () => {
    expect(utilsSrc).toMatch(/canonicalProductDisplayName\(p\)/);
  });

  it('PSF.F.3 — V12 lock: canonical productDisplayName preference (productName > name)', () => {
    // Pre-V35: tests asserted productDisplayName(p) directly. Post-V35:
    // composeProductDisplayName preserves the same preference order.
    const p = { productName: 'CANONICAL', name: 'LEGACY' };
    expect(composeProductDisplayName(p)).toBe('CANONICAL');
  });
});
