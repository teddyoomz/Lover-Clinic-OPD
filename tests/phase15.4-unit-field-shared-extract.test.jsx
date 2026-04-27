// ─── Phase 15.4 — UnitField + Pagination shared extract regression bank ─────
// Rule of 3 (C1) extract from OrderPanel:
//   - getUnitOptionsForProduct + getDefaultUnitForProduct → src/lib/unitFieldHelpers.js
//   - UnitField → src/components/backend/UnitField.jsx
//
// This file proves:
//   UE.A — pure-helper unit (all branches, including V14 no-undefined)
//   UE.B — UnitField render contract: select vs input fallback
//   UE.C — anti-regression: no inline UnitField/getUnitOptionsForProduct
//          definition in OrderPanel.jsx (locks the extract)
//   UE.D — OrderPanel re-export of getUnitOptionsForProduct still works
//          (backward compat with existing tests)
//   UE.E — testId prop generates correct data-testid attributes
//   UE.F — getDefaultUnitForProduct lookup chain (mainUnitName → unit → group → '')

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  getUnitOptionsForProduct,
  getDefaultUnitForProduct,
} from '../src/lib/unitFieldHelpers.js';
import UnitField, {
  getUnitOptionsForProduct as ufExportedHelper,
} from '../src/components/backend/UnitField.jsx';
import { getUnitOptionsForProduct as orderPanelReexport } from '../src/components/backend/OrderPanel.jsx';

const FIXTURE_PRODUCTS = [
  { id: 'p1', name: 'Botox', defaultProductUnitGroupId: 'g-vial' },
  { id: 'p2', name: 'Lidocaine', defaultProductUnitGroupId: 'g-amp' },
  { id: 'p3', name: 'Gauze', mainUnitName: 'ห่อ' }, // no group, has mainUnitName
  { id: 'p4', name: 'Saline', unit: 'ขวด' }, // legacy `unit` field only
  { id: 'p5', name: 'NoUnit' }, // no unit info at all
  { id: 'p6', name: 'EmptyGroup', defaultProductUnitGroupId: 'g-empty' },
  { id: 'p7', name: 'NullGroup', defaultProductUnitGroupId: '' }, // empty group id
];

const FIXTURE_GROUPS = [
  { id: 'g-vial', units: [{ name: 'ขวด' }, { name: 'แพ็ค' }, { name: 'ลัง' }] },
  { unitGroupId: 'g-amp', units: [{ name: 'amp' }, { name: 'box' }] }, // alt id field
  { id: 'g-empty', units: [] },
  { id: 'g-junk', units: [{ name: '   ' }, { name: '' }, null, { name: 'real' }] },
];

// ============================================================================
describe('Phase 15.4 UE.A — getUnitOptionsForProduct pure helper', () => {
  it('UE.A.1 — returns unit names for product with valid group', () => {
    expect(getUnitOptionsForProduct('p1', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toEqual([
      'ขวด',
      'แพ็ค',
      'ลัง',
    ]);
  });

  it('UE.A.2 — handles alternate group id field (unitGroupId)', () => {
    expect(getUnitOptionsForProduct('p2', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toEqual([
      'amp',
      'box',
    ]);
  });

  it('UE.A.3 — empty array when product has no group configured', () => {
    expect(getUnitOptionsForProduct('p3', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toEqual([]);
  });

  it('UE.A.4 — empty array when group id is empty string', () => {
    expect(getUnitOptionsForProduct('p7', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toEqual([]);
  });

  it('UE.A.5 — empty array when product not found', () => {
    expect(getUnitOptionsForProduct('nope', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toEqual([]);
  });

  it('UE.A.6 — empty array when group not found', () => {
    expect(
      getUnitOptionsForProduct('p1', FIXTURE_PRODUCTS, [
        { id: 'other-group', units: [] },
      ])
    ).toEqual([]);
  });

  it('UE.A.7 — empty array when productId null/undefined/empty', () => {
    expect(getUnitOptionsForProduct(null, FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toEqual([]);
    expect(getUnitOptionsForProduct(undefined, FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toEqual([]);
    expect(getUnitOptionsForProduct('', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toEqual([]);
  });

  it('UE.A.8 — empty array when products not array', () => {
    expect(getUnitOptionsForProduct('p1', null, FIXTURE_GROUPS)).toEqual([]);
    expect(getUnitOptionsForProduct('p1', {}, FIXTURE_GROUPS)).toEqual([]);
  });

  it('UE.A.9 — empty array when unitGroups not array', () => {
    expect(getUnitOptionsForProduct('p1', FIXTURE_PRODUCTS, null)).toEqual([]);
    expect(getUnitOptionsForProduct('p1', FIXTURE_PRODUCTS, {})).toEqual([]);
  });

  it('UE.A.10 — coerces id to string (numeric productId)', () => {
    const products = [{ id: 123, defaultProductUnitGroupId: 'g-vial' }];
    expect(getUnitOptionsForProduct(123, products, FIXTURE_GROUPS)).toEqual([
      'ขวด',
      'แพ็ค',
      'ลัง',
    ]);
    expect(getUnitOptionsForProduct('123', products, FIXTURE_GROUPS)).toEqual([
      'ขวด',
      'แพ็ค',
      'ลัง',
    ]);
  });

  it('UE.A.11 — filters junk units (whitespace, empty, null)', () => {
    const prods = [{ id: 'pj', defaultProductUnitGroupId: 'g-junk' }];
    expect(getUnitOptionsForProduct('pj', prods, FIXTURE_GROUPS)).toEqual(['real']);
  });

  it('UE.A.12 — V14 lock: never returns undefined or throws', () => {
    // Adversarial: every input variation must return an array
    const inputs = [
      [null, null, null],
      [undefined, undefined, undefined],
      ['', '', ''],
      ['p1', [], []],
      ['p1', [null, undefined], []],
      ['p1', FIXTURE_PRODUCTS, [null, undefined]],
    ];
    for (const [pid, prods, grps] of inputs) {
      const result = getUnitOptionsForProduct(pid, prods, grps);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    }
  });
});

// ============================================================================
describe('Phase 15.4 UE.B — UnitField render contract', () => {
  it('UE.B.1 — renders <select> when options provided', () => {
    render(<UnitField value="ขวด" options={['ขวด', 'แพ็ค']} onChange={() => {}} testId="t" />);
    const sel = screen.getByTestId('t-select');
    expect(sel.tagName).toBe('SELECT');
    expect(sel.value).toBe('ขวด');
    expect(screen.queryByTestId('t-input')).toBeNull();
  });

  it('UE.B.2 — renders <input> fallback when options empty', () => {
    render(<UnitField value="custom" options={[]} onChange={() => {}} testId="t" />);
    const inp = screen.getByTestId('t-input');
    expect(inp.tagName).toBe('INPUT');
    expect(inp.type).toBe('text');
    expect(inp.value).toBe('custom');
    expect(screen.queryByTestId('t-select')).toBeNull();
  });

  it('UE.B.3 — renders <input> fallback when options not array', () => {
    render(<UnitField value="x" options={null} onChange={() => {}} testId="t" />);
    expect(screen.getByTestId('t-input')).toBeTruthy();
  });

  it('UE.B.4 — uses default testId="unit" when not provided', () => {
    render(<UnitField value="" options={['a']} onChange={() => {}} />);
    expect(screen.getByTestId('unit-select')).toBeTruthy();
  });

  it('UE.B.5 — fires onChange with select event', () => {
    let captured = null;
    render(
      <UnitField
        value=""
        options={['ขวด', 'แพ็ค']}
        onChange={(e) => {
          captured = e.target.value;
        }}
        testId="t"
      />
    );
    fireEvent.change(screen.getByTestId('t-select'), { target: { value: 'แพ็ค' } });
    expect(captured).toBe('แพ็ค');
  });

  it('UE.B.6 — fires onChange with input event in fallback mode', () => {
    let captured = null;
    render(
      <UnitField
        value=""
        options={[]}
        onChange={(e) => {
          captured = e.target.value;
        }}
        testId="t"
      />
    );
    fireEvent.change(screen.getByTestId('t-input'), { target: { value: 'มัด' } });
    expect(captured).toBe('มัด');
  });

  it('UE.B.7 — disabled mode renders disabled select', () => {
    render(<UnitField value="ขวด" options={['ขวด']} onChange={() => {}} disabled testId="t" />);
    expect(screen.getByTestId('t-select').disabled).toBe(true);
  });

  it('UE.B.8 — disabled mode renders readOnly+disabled input fallback', () => {
    render(<UnitField value="ขวด" options={[]} onChange={() => {}} disabled testId="t" />);
    const inp = screen.getByTestId('t-input');
    expect(inp.disabled).toBe(true);
    expect(inp.readOnly).toBe(true);
  });

  it('UE.B.9 — null/undefined value renders without crash (native select fallback)', () => {
    // Native <select> falls back to first option when value is empty + no
    // <option value=""> placeholder exists. Contract is "no crash + no
    // React controlled/uncontrolled warning". Normalized via `value || ''`.
    render(<UnitField value={null} options={['ขวด']} onChange={() => {}} testId="t" />);
    const sel = screen.getByTestId('t-select');
    expect(sel.tagName).toBe('SELECT');
    // Either '' or 'ขวด' is acceptable depending on browser fallback.
    expect(['', 'ขวด']).toContain(sel.value);
  });

  it('UE.B.10 — passes inputCls to both select + input', () => {
    const { rerender } = render(
      <UnitField value="" options={['a']} onChange={() => {}} inputCls="custom-x" testId="t" />
    );
    expect(screen.getByTestId('t-select').className).toContain('custom-x');
    rerender(<UnitField value="" options={[]} onChange={() => {}} inputCls="custom-x" testId="t" />);
    expect(screen.getByTestId('t-input').className).toContain('custom-x');
  });
});

// ============================================================================
describe('Phase 15.4 UE.C — anti-regression: OrderPanel uses shared UnitField', () => {
  const orderPanelPath = path.join(process.cwd(), 'src/components/backend/OrderPanel.jsx');
  const src = fs.readFileSync(orderPanelPath, 'utf8');

  it('UE.C.1 — OrderPanel imports UnitField from ./UnitField.jsx', () => {
    expect(src).toMatch(/import\s+UnitField\s+from\s+['"]\.\/UnitField\.jsx['"]/);
  });

  it('UE.C.2 — OrderPanel re-exports getUnitOptionsForProduct from unitFieldHelpers', () => {
    expect(src).toMatch(
      /export\s*\{\s*getUnitOptionsForProduct\s*\}\s*from\s+['"]\.\.\/\.\.\/lib\/unitFieldHelpers\.js['"]/
    );
  });

  it('UE.C.3 — OrderPanel does NOT contain inline UnitField function definition', () => {
    // Catch the V21 anti-pattern: inline UnitField pre-extract pattern.
    // Match `function UnitField(` at start of line (function declaration).
    expect(src).not.toMatch(/^function UnitField\s*\(/m);
  });

  it('UE.C.4 — OrderPanel does NOT contain inline getUnitOptionsForProduct definition', () => {
    // The export-from re-export is OK; an inline `export function getUnitOptionsForProduct` is NOT.
    expect(src).not.toMatch(/^export\s+function\s+getUnitOptionsForProduct\s*\(/m);
  });

  it('UE.C.5 — OrderPanel UnitField use sites pass testId="order-unit" (backward compat)', () => {
    // Backward compat with test data-testids: ensure use sites preserve `order-unit` prefix.
    const matches = src.match(/<UnitField[\s\S]*?\/>/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // 2 use-sites in mobile + desktop
    for (const m of matches) {
      expect(m).toMatch(/testId=["']order-unit["']/);
    }
  });

  it('UE.C.6 — V32-style anti-regression: no other inline UnitField anywhere in src/components/backend/', () => {
    const dir = path.join(process.cwd(), 'src/components/backend');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsx'));
    for (const f of files) {
      if (f === 'UnitField.jsx') continue; // canonical home
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(
        content.match(/^function UnitField\s*\(/m),
        `${f} should NOT define its own UnitField — import from UnitField.jsx`
      ).toBeFalsy();
    }
  });
});

// ============================================================================
describe('Phase 15.4 UE.D — backward compat: getUnitOptionsForProduct re-exports', () => {
  it('UE.D.1 — UnitField.jsx re-exports getUnitOptionsForProduct', () => {
    expect(typeof ufExportedHelper).toBe('function');
    expect(ufExportedHelper).toBe(getUnitOptionsForProduct);
  });

  it('UE.D.2 — OrderPanel.jsx re-exports getUnitOptionsForProduct', () => {
    expect(typeof orderPanelReexport).toBe('function');
    expect(orderPanelReexport).toBe(getUnitOptionsForProduct);
  });

  it('UE.D.3 — all three import paths return the same function reference', () => {
    expect(orderPanelReexport).toBe(ufExportedHelper);
    expect(orderPanelReexport).toBe(getUnitOptionsForProduct);
  });
});

// ============================================================================
describe('Phase 15.4 UE.F — getDefaultUnitForProduct lookup chain', () => {
  it('UE.F.1 — prefers mainUnitName when present', () => {
    expect(getDefaultUnitForProduct('p3', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toBe('ห่อ');
  });

  it('UE.F.2 — falls back to legacy unit field', () => {
    expect(getDefaultUnitForProduct('p4', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toBe('ขวด');
  });

  it('UE.F.3 — falls back to first option in unit group', () => {
    expect(getDefaultUnitForProduct('p1', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toBe('ขวด');
  });

  it('UE.F.4 — empty string when nothing resolvable', () => {
    expect(getDefaultUnitForProduct('p5', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toBe('');
  });

  it('UE.F.5 — empty string when product not found', () => {
    expect(getDefaultUnitForProduct('nope', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toBe('');
  });

  it('UE.F.6 — empty string when productId null', () => {
    expect(getDefaultUnitForProduct(null, FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toBe('');
    expect(getDefaultUnitForProduct(undefined, FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toBe('');
    expect(getDefaultUnitForProduct('', FIXTURE_PRODUCTS, FIXTURE_GROUPS)).toBe('');
  });

  it('UE.F.7 — empty string when products not array', () => {
    expect(getDefaultUnitForProduct('p1', null, FIXTURE_GROUPS)).toBe('');
    expect(getDefaultUnitForProduct('p1', {}, FIXTURE_GROUPS)).toBe('');
  });

  it('UE.F.8 — handles whitespace-only mainUnitName as missing', () => {
    const prods = [{ id: 'pw', mainUnitName: '   ', unit: 'fallback' }];
    expect(getDefaultUnitForProduct('pw', prods, FIXTURE_GROUPS)).toBe('fallback');
  });

  it('UE.F.9 — V14 lock: never returns undefined', () => {
    const inputs = [
      [null, null, null],
      [undefined, undefined, undefined],
      ['', [], []],
      ['p1', [{ id: 'p1' }], []],
    ];
    for (const [pid, prods, grps] of inputs) {
      const r = getDefaultUnitForProduct(pid, prods, grps);
      expect(typeof r).toBe('string');
      expect(r).toBe('');
    }
  });
});
