import { describe, it, expect } from 'vitest';
import { formatOrderItemsSummary } from '../src/lib/orderItemsSummary.js';

const items = [
  { productName: 'Saline', qty: 1 },
  { productName: 'Gauze', qty: 2 },
  { productName: 'Betadine', qty: 1 },
  { productName: 'Elonza', qty: 10 }, // index 3 — would be truncated at max=2
];

describe('V159 — formatOrderItemsSummary matchQuery', () => {
  it('A1 backward-compat: no matchQuery → unchanged (first 2 + overflow)', () => {
    expect(formatOrderItemsSummary(items)).toBe('Saline x1 · Gauze x2 · +2 รายการ');
  });
  it('A2 matchQuery surfaces the matched item FIRST (not truncated away)', () => {
    const out = formatOrderItemsSummary(items, { matchQuery: 'elonza' });
    expect(out.startsWith('Elonza x10')).toBe(true);
    expect(out).toContain('Elonza x10');
  });
  it('A3 case-insensitive + Thai works', () => {
    const th = [{ productName: 'น้ำเกลือ', qty: 1 }, { productName: 'อีลอนซ่า', qty: 5 }, { productName: 'ผ้าก๊อซ', qty: 1 }];
    const out = formatOrderItemsSummary(th, { matchQuery: 'อีลอนซ่า', max: 1 });
    expect(out.startsWith('อีลอนซ่า x5')).toBe(true);
  });
  it('A4 matchQuery no match → original order preserved', () => {
    expect(formatOrderItemsSummary(items, { matchQuery: 'zzz' })).toBe('Saline x1 · Gauze x2 · +2 รายการ');
  });
  it('A5 empty items → empty string', () => {
    expect(formatOrderItemsSummary([], { matchQuery: 'x' })).toBe('');
  });
});
