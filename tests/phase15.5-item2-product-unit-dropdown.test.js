// Phase 15.5 / Item 2 (2026-04-28) — ProductFormModal unit dropdown enrichment.
//
// User directive (verbatim):
// "หน่วยสินค้าในหน้าเพิ่มสินค้า ตรง Dropdown เลือกหน่วย นอกจากจะเอาตามหน่วยที่
// เคยสร้างในหน้าหน่วยสินค้าและพิมพ์ลงไปเองได้แล้ว ยังขอให้เพิ่มหน่วยที่มีอยู่
// ในสินค้าในระบบแล้วมาให้เลือกใน Dropdown ด้วย โดยถ้าสร้างหน่วยใหม่แบบพิมพ์
// ลงไปเองในหน้าเพิ่มสินค้าแล้ว add สินค้าพร้อมหน่วยใหม่นั้นเข้าระบบเราแล้ว
// ขอให้หน่วยใหม่นั้นมาปรากฎให้เลือกใน dropdown เลย แบบ real time"
//
// Solution: datalist for #product-unit-list now merges:
//   1. Master units (be_product_units → groups → units flat) — existing source
//   2. Existing product units (be_products[].mainUnitName, deduped + trimmed)
// Real-time = R1 (refetch on each modal mount). Closing + reopening modal
// after saving a new unit will surface it immediately in the next session.
//
// Coverage:
//   IT2.A — pure helper: dedupe + merge logic mirror
//   IT2.B — source-grep regression guards (modal imports listProducts, builds
//           merged datalist via useMemo, datalist iterates merged options)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FORM_PATH = join(process.cwd(), 'src', 'components', 'backend', 'ProductFormModal.jsx');
const FORM_SRC = readFileSync(FORM_PATH, 'utf-8');

// Pure helper mirror — same logic as the modal's useMemo. Tests independent
// of React mounting; locks the merge algorithm.
function buildUnitDatalistOptions(masterGroups, productMainUnitNames) {
  const seen = new Set();
  const out = [];
  for (const u of (masterGroups || [])) {
    if (!u || typeof u !== 'object') continue;
    for (const x of (u.units || [])) {
      const name = typeof x?.name === 'string' ? x.name.trim() : '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ key: `master-${u.unitGroupId || u.id}-${name}`, value: name, source: 'master' });
    }
  }
  for (const name of (productMainUnitNames || [])) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ key: `product-${name}`, value: name, source: 'product' });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// IT2.A — pure merge logic
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5/Item 2 — IT2.A pure merge logic', () => {
  it('A1 master units only (no products)', () => {
    const masters = [
      { unitGroupId: 'g1', units: [{ name: 'ml' }, { name: 'amp.' }] },
      { unitGroupId: 'g2', units: [{ name: 'ครั้ง' }] },
    ];
    const out = buildUnitDatalistOptions(masters, []);
    expect(out.map(o => o.value)).toEqual(['ml', 'amp.', 'ครั้ง']);
    expect(out.every(o => o.source === 'master')).toBe(true);
  });

  it('A2 product units only (no masters)', () => {
    const out = buildUnitDatalistOptions([], ['kg', 'pcs']);
    expect(out.map(o => o.value)).toEqual(['kg', 'pcs']);
    expect(out.every(o => o.source === 'product')).toBe(true);
  });

  it('A3 master + product, dedup overlap → master wins', () => {
    const masters = [{ unitGroupId: 'g1', units: [{ name: 'ml' }] }];
    const productUnits = ['ml', 'kg']; // 'ml' already in master
    const out = buildUnitDatalistOptions(masters, productUnits);
    expect(out.map(o => o.value)).toEqual(['ml', 'kg']);
    expect(out[0].source).toBe('master'); // 'ml' kept as master
    expect(out[1].source).toBe('product'); // 'kg' from product only
  });

  it('A4 trims whitespace + skips empty unit names', () => {
    const masters = [{ unitGroupId: 'g1', units: [{ name: '  ml  ' }, { name: '' }] }];
    const productUnits = ['  kg ', '', null, undefined];
    const out = buildUnitDatalistOptions(masters, productUnits);
    // 'ml' is trimmed; '' / null / undefined skipped
    expect(out.map(o => o.value).sort()).toEqual(['  kg ', 'ml']); // productUnits not trimmed in helper (they come pre-trimmed from caller)
  });

  it('A5 dedupes within master groups', () => {
    const masters = [
      { unitGroupId: 'g1', units: [{ name: 'ml' }] },
      { unitGroupId: 'g2', units: [{ name: 'ml' }] }, // same name, different group
    ];
    const out = buildUnitDatalistOptions(masters, []);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('ml');
  });

  it('A6 dedupes within product list', () => {
    const out = buildUnitDatalistOptions([], ['ml', 'ml', 'kg']);
    expect(out.map(o => o.value)).toEqual(['ml', 'kg']);
  });

  it('A7 stable order: master first then product (insertion order)', () => {
    const masters = [{ unitGroupId: 'g1', units: [{ name: 'ml' }, { name: 'g' }] }];
    const productUnits = ['kg', 'pcs'];
    const out = buildUnitDatalistOptions(masters, productUnits);
    expect(out.map(o => o.value)).toEqual(['ml', 'g', 'kg', 'pcs']);
  });

  it('A8 handles malformed master entries gracefully', () => {
    const masters = [
      null,
      { unitGroupId: 'g1' }, // missing units
      { unitGroupId: 'g2', units: null },
      { unitGroupId: 'g3', units: [{}] }, // missing name
      { unitGroupId: 'g4', units: [{ name: 'x' }] },
    ];
    const out = buildUnitDatalistOptions(masters, []);
    expect(out.map(o => o.value)).toEqual(['x']);
  });

  it('A9 keys are unique (React-friendly)', () => {
    const masters = [{ unitGroupId: 'g1', units: [{ name: 'ml' }] }];
    const productUnits = ['kg'];
    const out = buildUnitDatalistOptions(masters, productUnits);
    const keys = out.map(o => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('A10 empty inputs return empty', () => {
    expect(buildUnitDatalistOptions([], [])).toEqual([]);
    expect(buildUnitDatalistOptions(null, null)).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// IT2.B — source-grep regression guards
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5/Item 2 — IT2.B source-grep guards', () => {
  it('B1 ProductFormModal imports listProducts', () => {
    // BSA Task 6: UI imports backendClient via scopedDataLayer Layer 2
    expect(FORM_SRC).toMatch(/import\s*\{[^}]*listProducts[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/scopedDataLayer/);
  });

  it('B2 useEffect Promise.all includes listProducts() (eager-load on mount)', () => {
    const effectMatch = FORM_SRC.match(/Promise\.all\(\[[\s\S]*?\]\)/);
    expect(effectMatch).toBeTruthy();
    expect(effectMatch[0]).toMatch(/listProducts\(\)/);
  });

  it('B3 productUnits state extracted from existing products', () => {
    expect(FORM_SRC).toMatch(/productUnits/);
    expect(FORM_SRC).toMatch(/setProductUnits/);
    expect(FORM_SRC).toMatch(/mainUnitName/);
  });

  it('B4 unitDatalistOptions useMemo merges units + productUnits', () => {
    const memoMatch = FORM_SRC.match(/unitDatalistOptions\s*=\s*useMemo[\s\S]*?\}\,\s*\[units,\s*productUnits\]\s*\)/);
    expect(memoMatch).toBeTruthy();
  });

  it('B5 datalist renders merged options (not raw units flatMap)', () => {
    // Anti-regression: old code used `units.flatMap(u => (u.units || []).map(...)`
    // New code uses unitDatalistOptions.map(opt => ...).
    expect(FORM_SRC).toMatch(/unitDatalistOptions\.map\(\(opt\)\s*=>/);
    // The old shape might still exist in helper but NOT in datalist render
    const datalistMatch = FORM_SRC.match(/<datalist id="product-unit-list"[\s\S]*?<\/datalist>/);
    expect(datalistMatch).toBeTruthy();
    expect(datalistMatch[0]).toMatch(/unitDatalistOptions\.map/);
    expect(datalistMatch[0]).not.toMatch(/units\.flatMap/);
  });

  it('B6 datalist has data-source attribute (master vs product origin)', () => {
    expect(FORM_SRC).toMatch(/data-source=\{opt\.source\}/);
  });

  it('B7 datalist testId for RTL', () => {
    expect(FORM_SRC).toMatch(/data-testid=["']product-unit-datalist["']/);
  });

  it('B8 listProducts call is non-fatal (catch → empty array)', () => {
    expect(FORM_SRC).toMatch(/listProducts\(\)\.catch\(\(\)\s*=>\s*\[\]\)/);
  });

  it('B9 dedup uses Set with trim()', () => {
    // The eager-load extraction trims and dedupes via Set
    expect(FORM_SRC).toMatch(/new Set\(\)/);
    expect(FORM_SRC).toMatch(/trim\(\)/);
  });

  it('B10 sort uses Thai locale (so ก-ฮ ordering is correct)', () => {
    expect(FORM_SRC).toMatch(/localeCompare\(b,\s*['"]th['"]\)/);
  });

  it('B11 Phase 15.5/Item 2 marker comment present', () => {
    const matches = FORM_SRC.match(/Phase 15\.5 \/ Item 2/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
