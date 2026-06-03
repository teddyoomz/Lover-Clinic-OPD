// หมวดหมู่ datalist enrichment — product-harvest ONLY (no master be_product_groups).
// User directive (2026-06-03): dropdown หมวดหมู่ = หมวดที่มีอยู่จริงบนสินค้าเท่านั้น,
// ไม่มี master, ไม่มี tag, พิมพ์ใหม่ได้. Mirrors the หน่วย harvest (phase15.5-item2)
// but product-only (หน่วย keeps master+product; category drops master entirely).
//
// Groups:
//   A — pure mirror: categoryDatalistOptions algorithm (dedup → {key,value})
//   B — source-grep regression (modal harvests categoryName, renders memo, NO master)
//   C — RTL: mount modal w/ mocked products → datalist shows harvested categories
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';

const FORM_PATH = join(process.cwd(), 'src', 'components', 'backend', 'ProductFormModal.jsx');
const FORM_SRC = readFileSync(FORM_PATH, 'utf-8');

// Pure mirror of the modal's categoryDatalistOptions useMemo (product-only, no master).
function buildCategoryDatalistOptions(productCategoryNames) {
  const seen = new Set();
  const out = [];
  for (const name of (productCategoryNames || [])) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ key: `product-${name}`, value: name });
  }
  return out;
}

// ════════ A — pure algorithm ════════
describe('หมวดหมู่ datalist — A pure algorithm', () => {
  it('A1 maps names to {key,value} (product-only, no source field)', () => {
    const out = buildCategoryDatalistOptions(['อุปกรณ์ทั่วไป', 'Filler']);
    expect(out).toEqual([
      { key: 'product-อุปกรณ์ทั่วไป', value: 'อุปกรณ์ทั่วไป' },
      { key: 'product-Filler', value: 'Filler' },
    ]);
    expect(out.every(o => !('source' in o))).toBe(true);
  });
  it('A2 dedupes repeated names', () => {
    expect(buildCategoryDatalistOptions(['ยาชา', 'ยาชา', 'เลเซอร์']).map(o => o.value))
      .toEqual(['ยาชา', 'เลเซอร์']);
  });
  it('A3 skips empty / null / undefined', () => {
    expect(buildCategoryDatalistOptions(['', null, undefined, 'x']).map(o => o.value)).toEqual(['x']);
  });
  it('A4 empty / null input returns empty', () => {
    expect(buildCategoryDatalistOptions([])).toEqual([]);
    expect(buildCategoryDatalistOptions(null)).toEqual([]);
  });
  it('A5 keys are unique (React-friendly)', () => {
    const keys = buildCategoryDatalistOptions(['ยาชา', 'เลเซอร์']).map(o => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('A6 preserves caller order (caller pre-sorts Thai-locale)', () => {
    expect(buildCategoryDatalistOptions(['Filler', 'ยาชา', 'เลเซอร์']).map(o => o.value))
      .toEqual(['Filler', 'ยาชา', 'เลเซอร์']);
  });
});

// ════════ B — source-grep regression ════════
describe('หมวดหมู่ datalist — B source-grep regression', () => {
  it('B1 productCategories state harvested from existing products', () => {
    expect(FORM_SRC).toMatch(/productCategories/);
    expect(FORM_SRC).toMatch(/setProductCategories/);
    expect(FORM_SRC).toMatch(/categoryName/);
  });
  it('B2 categoryDatalistOptions useMemo keyed on [productCategories]', () => {
    expect(FORM_SRC).toMatch(/categoryDatalistOptions\s*=\s*useMemo[\s\S]*?\}\,\s*\[productCategories\]\s*\)/);
  });
  it('B3 #product-group-list datalist renders categoryDatalistOptions.map (plain option, no data-source)', () => {
    const dl = FORM_SRC.match(/<datalist id="product-group-list"[\s\S]*?<\/datalist>/);
    expect(dl).toBeTruthy();
    expect(dl[0]).toMatch(/categoryDatalistOptions\.map/);
    expect(dl[0]).not.toMatch(/data-source/);          // category options are PLAIN (no tag)
    expect(dl[0]).not.toMatch(/groups\.map/);           // anti-regression: no master render
  });
  it('B4 product-group-datalist testid present', () => {
    expect(FORM_SRC).toMatch(/data-testid=["']product-group-datalist["']/);
  });
  it('B5 master fully removed — no listProductGroups import / call, no groups state', () => {
    expect(FORM_SRC).not.toMatch(/listProductGroups/);
    expect(FORM_SRC).not.toMatch(/\bsetGroups\b/);
    expect(FORM_SRC).not.toMatch(/\bconst \[groups\b/);
  });
  it('B6 harvest dedups via Set + trim + Thai-locale sort', () => {
    expect(FORM_SRC).toMatch(/new Set\(\)/);
    expect(FORM_SRC).toMatch(/trim\(\)/);
    expect(FORM_SRC).toMatch(/localeCompare\(b,\s*['"]th['"]\)/);
  });
  it('B7 หน่วย untouched — unit datalist + listProductUnitGroups still present', () => {
    expect(FORM_SRC).toMatch(/unitDatalistOptions/);
    expect(FORM_SRC).toMatch(/listProductUnitGroups/);
    expect(FORM_SRC).toMatch(/data-testid=["']product-unit-datalist["']/);
  });
});

// ════════ C — RTL render + wiring ════════
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  saveProduct: vi.fn().mockResolvedValue(undefined),
  listProductUnitGroups: vi.fn().mockResolvedValue([]),
  listProducts: vi.fn().mockResolvedValue([
    { mainUnitName: 'ขวด', categoryName: 'อุปกรณ์ทั่วไป' },
    { mainUnitName: 'amp.', categoryName: 'ยาชา' },
    { categoryName: 'อุปกรณ์ทั่วไป' },   // duplicate category
    { categoryName: '  เลเซอร์  ' },      // needs trim
    { categoryName: '' },                  // skip empty
    { categoryName: 'Filler' },
  ]),
}));
vi.mock('../src/components/backend/MarketingFormShell.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../src/lib/marketingUiUtils.js', () => ({ scrollToField: vi.fn() }));

import ProductFormModal from '../src/components/backend/ProductFormModal.jsx';

describe('หมวดหมู่ datalist — C RTL render', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // The <datalist> element renders synchronously (empty); options populate
  // AFTER the async load effect resolves → must waitFor options before asserting.
  async function waitDatalistValues() {
    const dl = await screen.findByTestId('product-group-datalist');
    await waitFor(() => expect(dl.querySelectorAll('option').length).toBeGreaterThan(0));
    return [...dl.querySelectorAll('option')].map(o => o.value);
  }

  it('C1 datalist lists harvested product categories (trimmed, deduped, no empty)', async () => {
    render(<ProductFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const vals = await waitDatalistValues();
    expect(vals).toContain('อุปกรณ์ทั่วไป');
    expect(vals).toContain('ยาชา');
    expect(vals).toContain('Filler');
    expect(vals).toContain('เลเซอร์');                 // trimmed from '  เลเซอร์  '
    expect(vals.filter(v => v === 'อุปกรณ์ทั่วไป')).toHaveLength(1); // deduped
    expect(vals).not.toContain('');                     // empty skipped
  });

  it('C2 options are Thai-locale sorted', async () => {
    render(<ProductFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const vals = await waitDatalistValues();
    const sorted = [...vals].sort((a, b) => a.localeCompare(b, 'th'));
    expect(vals).toEqual(sorted);
  });

  it('C3 datalist options are PLAIN (no data-source attribute / tag)', async () => {
    render(<ProductFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    const dl = await screen.findByTestId('product-group-datalist');
    await waitFor(() => expect(dl.querySelectorAll('option').length).toBeGreaterThan(0));
    const opts = [...dl.querySelectorAll('option')];
    expect(opts.every(o => !o.hasAttribute('data-source'))).toBe(true);
  });
});
