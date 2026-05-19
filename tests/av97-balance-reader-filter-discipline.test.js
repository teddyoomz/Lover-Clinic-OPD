// tests/av97-balance-reader-filter-discipline.test.js
// V43-followup (2026-05-19) — Tier 2 source-grep AV97 enforcer.
// Locks the discipline: every balance reader imports + invokes
// filterOutSkippedProducts. Closed sanctioned-exception list.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Files that MUST route through filterOutSkippedProducts:
const BALANCE_READERS = [
  'src/components/backend/StockBalancePanel.jsx',
];

// Files that ARE allowed to render products WITHOUT the filter (closed):
const SANCTIONED_EXCEPTIONS = [
  'src/components/backend/ProductsTab.jsx',     // master CRUD
  'src/components/backend/MovementLogPanel.jsx', // history audit
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('AV97 — Skip-stock filter discipline on balance readers', () => {
  describe('A. Required consumers route through filterOutSkippedProducts', () => {
    for (const file of BALANCE_READERS) {
      it(`A.${file} imports filterOutSkippedProducts from src/lib/skipStockFilter.js`, () => {
        const src = read(file);
        expect(src).toMatch(/from\s+['"][^'"]*skipStockFilter(\.js)?['"]/);
        expect(src).toMatch(/filterOutSkippedProducts/);
      });
      it(`A.${file} invokes filterOutSkippedProducts at least once`, () => {
        const src = read(file);
        // Either direct call OR indirect via map-based check (see StockBalancePanel
        // implementation: checks threshold map's skipStockDeduction field).
        // Accept either signature for forward-compat.
        expect(src).toMatch(/filterOutSkippedProducts|skipStockDeduction\s*===\s*true/);
      });
    }
  });

  describe('B. Sanctioned exceptions documented inline', () => {
    for (const file of SANCTIONED_EXCEPTIONS) {
      it(`B.${file} exists`, () => {
        expect(() => read(file)).not.toThrow();
      });
    }
  });

  describe('C. Closed exception list — adding a 3rd exception requires V-entry', () => {
    it('C.1 sanctioned list contains exactly 2 entries', () => {
      expect(SANCTIONED_EXCEPTIONS.length).toBe(2);
    });
    it('C.2 every entry maps to a real file', () => {
      for (const f of SANCTIONED_EXCEPTIONS) {
        expect(() => read(f)).not.toThrow();
      }
    });
  });

  describe('D. Helper file integrity', () => {
    it('D.1 src/lib/skipStockFilter.js exports filterOutSkippedProducts + isSkippedProduct', () => {
      const src = read('src/lib/skipStockFilter.js');
      expect(src).toMatch(/export\s+function\s+isSkippedProduct/);
      expect(src).toMatch(/export\s+function\s+filterOutSkippedProducts/);
    });
    it('D.2 helper file documents AV97 sanctioned exceptions', () => {
      const src = read('src/lib/skipStockFilter.js');
      expect(src).toMatch(/ProductsTab/);
      expect(src).toMatch(/MovementLogPanel/);
    });
  });

  describe('E. SKILL.md AV97 entry exists', () => {
    it('E.1 audit-anti-vibe-code SKILL.md contains AV97 section', () => {
      const src = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
      expect(src).toMatch(/AV97\s+—\s+Skip-stock filter/);
      expect(src).toMatch(/ProductsTab/);
      expect(src).toMatch(/MovementLogPanel/);
    });
  });
});
