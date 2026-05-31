// Task 2 (2026-06-01) — source-grep regression locking the SaleTab table redesign
// (cosmetic-shell). Future edits can't silently revert the cleanup (V21 guard).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'src/components/backend/SaleTab.jsx'), 'utf8');

describe('SaleTab redesign wiring', () => {
  it('imports SaleSourceTag + SaleStatusPill from SaleRowParts', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*SaleSourceTag[^}]*SaleStatusPill[^}]*\}\s*from\s*'\.\/SaleRowParts\.jsx'/);
  });
  it('source tag in items cell + status pill used; inline status ternary gone', () => {
    expect(SRC).toContain('<SaleSourceTag source={sale.source}');
    expect(SRC).toContain('<SaleStatusPill color={st.color} label={st.label}');
    expect(SRC).not.toMatch(/st\.color === 'emerald' \?/); // old inline status ternary removed
  });
  it('money columns nowrap + source badges removed from money cell', () => {
    expect(SRC).toMatch(/netTotal\)\} ฿<\/td>/);                       // net = bare nowrap td
    expect(SRC).not.toContain('จาก OPD Card');                       // source label moved to SaleRowParts.jsx
    expect(SRC).not.toMatch(/justify-end gap-1\.5 flex-wrap/);        // old money-cell flex-wrap gone
    expect(SRC).toMatch(/text-right font-mono whitespace-nowrap/);    // paid cell nowrap
  });
  it('actions compact + right-aligned (row eye button p-1.5)', () => {
    expect(SRC).toContain('flex gap-0.5 justify-end');
    expect(SRC).toMatch(/setViewingSale\(sale\)\} className="p-1\.5 rounded hover:bg-violet/); // eye btn compacted
  });
  it('responsive: table min-w + customer truncate present', () => {
    expect(SRC).toContain('min-w-[920px]');
    expect(SRC).toMatch(/truncate inline-block max-w-\[170px\]/);
  });
});
