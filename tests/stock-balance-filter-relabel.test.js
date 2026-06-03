// tests/stock-balance-filter-relabel.test.js
// (2026-06-03) — Feature B: on tab=stock → ยอดคงเหลือ, the หมด + ติดลบ filters
// were relabelled (drop the parentheticals) and reordered so หมด precedes ติดลบ.
// Pure presentation: predicates + state setters + data-testids unchanged.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../src/components/backend/StockBalancePanel.jsx'),
  'utf8',
);
const outBlock = (SRC.split('data-testid="filter-out-of-stock"')[1] || '').slice(0, 260);
const negBlock = (SRC.split('data-testid="filter-negative-stock"')[1] || '').slice(0, 260);

describe('stock balance filter relabel + reorder (2026-06-03)', () => {
  it('R1 หมด label has no parenthetical', () => {
    expect(outBlock).toMatch(/หมด\s*<\/label>/);
    expect(outBlock).not.toMatch(/หมด \(คงเหลือ 0\)/);
  });
  it('R2 ติดลบ label has no parenthetical', () => {
    expect(negBlock).toMatch(/ติดลบ\s*<\/label>/);
    expect(negBlock).not.toMatch(/ติดลบ \(ต้องเติมสต็อค\)/);
  });
  it('R3 หมด (out-of-stock) appears BEFORE ติดลบ (negative-stock)', () => {
    const iOut = SRC.indexOf('data-testid="filter-out-of-stock"');
    const iNeg = SRC.indexOf('data-testid="filter-negative-stock"');
    expect(iOut).toBeGreaterThan(0);
    expect(iNeg).toBeGreaterThan(0);
    expect(iOut).toBeLessThan(iNeg);
  });
  it('R4 predicates/state setters untouched', () => {
    expect(outBlock).toMatch(/setShowOutOfStockOnly/);
    expect(negBlock).toMatch(/setShowNegativeStockOnly/);
  });
});
