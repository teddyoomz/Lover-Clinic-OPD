// be_products productName-vs-name regression guard
//
// User report 2026-04-27: "หน้าปรับสต็อค มองไม่เห็นสินค้า ใน dropdown
// เลือกสินค้า"
//
// Root cause: Phase 14.10-tris (2026-04-26) migrated products from
// `master_data/products/items` (legacy `.name` field) to `be_products`
// (canonical `productName`). 5 callers across StockAdjustPanel +
// OrderPanel still rendered `p.name`. Old migrated docs displayed by
// accident (`...form` spread in normalizeProduct preserved `.name`),
// but new docs created via the Products CRUD have ONLY `productName`
// → blank options in product pickers.
//
// Side bug surfaced: OrderPanel:296 saved `productName: p.name || ''`,
// emitting empty productName on the saved order doc — would have caused
// downstream display issues on order list / batch labels.
//
// Fix:
//   1. NEW productDisplayName(p) helper in src/lib/productValidation.js
//      — productName → name → '' (V14: never undefined)
//   2. 5 sites (2 StockAdjustPanel, 3 OrderPanel) switched to helper
//   3. This test pins the contract so future product-picker render code
//      uses the helper and `p.name` regressions are caught at commit time.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { productDisplayName } from '../src/lib/productValidation.js';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const validationSrc = read('src/lib/productValidation.js');
const adjustPanelSrc = read('src/components/backend/StockAdjustPanel.jsx');
const orderPanelSrc = read('src/components/backend/OrderPanel.jsx');

// ────────────────────────────────────────────────────────────────────────
// P1 — productDisplayName pure helper contract
// ────────────────────────────────────────────────────────────────────────
describe('product-display P1 — productDisplayName helper', () => {
  it('P1.1 prefers canonical productName (be_products shape)', () => {
    expect(productDisplayName({ productName: 'Botox', name: 'OldBotox' })).toBe('Botox');
  });

  it('P1.2 trims whitespace in productName', () => {
    expect(productDisplayName({ productName: '  Botox  ' })).toBe('Botox');
  });

  it('P1.3 falls back to legacy name (master_data origin)', () => {
    expect(productDisplayName({ name: 'Botox' })).toBe('Botox');
    expect(productDisplayName({ productName: '', name: 'Botox' })).toBe('Botox');
    expect(productDisplayName({ productName: '   ', name: 'Botox' })).toBe('Botox');
  });

  it('P1.4 returns empty string when nothing resolves (V14: never undefined)', () => {
    expect(productDisplayName({})).toBe('');
    expect(productDisplayName({ productName: '' })).toBe('');
    expect(productDisplayName({ name: '' })).toBe('');
    expect(productDisplayName({ productName: '   ', name: '   ' })).toBe('');
  });

  it('P1.5 adversarial — null/undefined/non-object', () => {
    expect(productDisplayName(null)).toBe('');
    expect(productDisplayName(undefined)).toBe('');
    expect(productDisplayName('Botox')).toBe('');
    expect(productDisplayName(123)).toBe('');
    expect(productDisplayName([])).toBe('');
  });

  it('P1.6 adversarial — non-string fields', () => {
    expect(productDisplayName({ productName: 123 })).toBe('');
    expect(productDisplayName({ productName: null, name: 'X' })).toBe('X');
    expect(productDisplayName({ productName: { val: 'X' } })).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────
// P2 — Helper exported + documented
// ────────────────────────────────────────────────────────────────────────
describe('product-display P2 — helper export', () => {
  it('P2.1 productValidation exports productDisplayName', () => {
    expect(validationSrc).toMatch(/^export function productDisplayName\(/m);
  });

  it('P2.2 helper docs cite Phase 14.10-tris context', () => {
    expect(validationSrc).toMatch(/Phase 14\.10-tris/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// P3 — StockAdjustPanel uses helper at all 2 sites
// ────────────────────────────────────────────────────────────────────────
describe('product-display P3 — StockAdjustPanel', () => {
  it('P3.1 imports productDisplayName', () => {
    expect(adjustPanelSrc).toMatch(/import\s*\{\s*productDisplayName\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/productValidation\.js['"]/);
  });

  it('P3.2 onPickProduct uses helper for productName state', () => {
    const block = adjustPanelSrc.match(/const onPickProduct[\s\S]{0,400}/);
    expect(block).toBeTruthy();
    expect(block[0]).toContain('productDisplayName(p)');
  });

  it('P3.3 picker renders product name via composeProductDisplayName (V35 migration)', () => {
    // Phase 15.6 / V35: <option> blocks replaced by ProductSelectField.
    // The shared component uses composeProductDisplayName from
    // productSearchUtils.js, which in turn calls productDisplayName from
    // productValidation.js — same canonical lookup, same V12 lock.
    expect(adjustPanelSrc).toMatch(/<ProductSelectField[\s\S]{0,200}options=\{availableProducts\}/);
    // V21/V35 anti-regression: NO inline <option> blocks survive in adjust panel
    const stripped = adjustPanelSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*\n/g, '\n');
    expect(stripped).not.toMatch(/<option[^>]*>\{productDisplayName\(p\)\}<\/option>/);
  });

  it('P3.4 V12 LOCK — no `{p.name}` rendering survives in StockAdjustPanel', () => {
    // strip comments before grep
    const stripped = adjustPanelSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*\n/g, '\n');
    expect(stripped).not.toMatch(/<option[^>]*>\s*\{p\.name\}\s*<\/option>/);
    expect(stripped).not.toMatch(/setProductName\(p\?\.name\s*\|\|\s*''\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// P4 — OrderPanel uses helper at all 3 sites
// ────────────────────────────────────────────────────────────────────────
describe('product-display P4 — OrderPanel', () => {
  it('P4.1 imports productDisplayName', () => {
    expect(orderPanelSrc).toMatch(/import\s*\{\s*productDisplayName\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/productValidation\.js['"]/);
  });

  it('P4.2 onPickProduct save path uses helper (was: empty productName saved bug)', () => {
    // 2026-04-27 — onPickProduct grew to include smart-unit auto-pick;
    // expand slice to cover the productName line at the bottom of the body.
    const block = orderPanelSrc.match(/const onPickProduct[\s\S]{0,800}/);
    expect(block).toBeTruthy();
    expect(block[0]).toContain('productDisplayName(p)');
    // old broken code path must be gone
    expect(block[0]).not.toMatch(/productName:\s*p\.name\s*\|\|\s*''/);
  });

  it('P4.3 V12 LOCK — no `{p.name}` in any OrderPanel option', () => {
    const stripped = orderPanelSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*\n/g, '\n');
    expect(stripped).not.toMatch(/<option[^>]*>\s*\{p\.name\}\s*<\/option>/);
  });

  it('P4.4 BOTH pickers (mobile + desktop) use ProductSelectField (V35 migration)', () => {
    // Phase 15.6 / V35: <option> blocks replaced by shared ProductSelectField.
    // The component internally uses composeProductDisplayName which wraps
    // productDisplayName — same canonical lookup, same V12 lock.
    // Both call sites pass options={products}.
    const matches = orderPanelSrc.match(/<ProductSelectField[\s\S]{0,300}options=\{products\}/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // V21/V35 anti-regression: NO inline products.map(p => <option ...>) blocks
    const stripped = orderPanelSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*\n/g, '\n');
    expect(stripped).not.toMatch(/products\.map\(p\s*=>\s*<option[^>]+>\{productDisplayName\(p\)\}<\/option>\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// P5 — Regression guard: new product-picker code must use the helper
// ────────────────────────────────────────────────────────────────────────
describe('product-display P5 — project-wide regression guard', () => {
  // The ONLY surfaces that read be_products via listProducts() and render
  // a name should funnel through productDisplayName. New panels added in
  // future slices must be added to this catalog.
  const PRODUCT_CONSUMERS = [
    ['src/components/backend/StockAdjustPanel.jsx', adjustPanelSrc],
    ['src/components/backend/OrderPanel.jsx', orderPanelSrc],
  ];

  for (const [file, src] of PRODUCT_CONSUMERS) {
    it(`P5.${file} — products.map → productDisplayName (no raw p.name)`, () => {
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*\n/g, '\n');
      // every products.map( p => <option … >…</option>) must use the helper
      const optionPatterns = [...stripped.matchAll(/products\.map\([^)]*<option[^>]*>(\{[^}]+\})/g)];
      // we don't need to find any matches — just assert that none of the
      // matches resolve to a raw `{p.name}`.
      for (const m of optionPatterns) {
        expect(m[1]).not.toBe('{p.name}');
      }
    });
  }

  it('P5.helper-doc — helper file documents the V14 contract', () => {
    expect(validationSrc).toMatch(/NEVER\s+`?undefined`?/);
  });
});
