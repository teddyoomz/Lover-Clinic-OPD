// ─── Phase 15.4 — auto-show unit on batch row across 4 create forms (item 7)
// User directive (s19, verbatim):
//   "ช่องรายการ batch ของการสร้างรายการต่างๆในทุก tab ทั้ง stock และ central-stock
//    ต้องแสดงหน่วยของสินค้าด้วย เมื่อเลือกสินค้านั้นๆ หน่วยจะดึงมาออโต้
//    เพื่อไม่ให้ user ที่ใช้งานสับสนหน่วย"
//
// 4 create forms updated:
//   - AdjustCreateForm  (StockAdjustPanel.jsx) — caption below qty input
//   - TransferCreateForm (StockTransferPanel.jsx) — "หน่วย" cell in items table
//   - WithdrawalCreateForm (StockWithdrawalPanel.jsx) — "หน่วย" cell in items table
//   - CentralOrderCreateForm (CentralStockOrderPanel.jsx) — smart UnitField dropdown
//                          (replaces raw <input type="text">)
//
// OrderPanel already had the smart dropdown (commit 74985b8) — extracted to
// shared module in commit 0792359 (Phase A.1).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ============================================================================
describe('Phase 15.4 BU.A — AdjustCreateForm shows unit caption when batch picked', () => {
  const src = read('src/components/backend/StockAdjustPanel.jsx');

  it('BU.A.1 — adjust-unit-display data-testid exists', () => {
    expect(src).toMatch(/data-testid="adjust-unit-display"/);
  });

  it('BU.A.2 — caption shows selectedBatch.unit (auto-populated from batch)', () => {
    const idx = src.indexOf('adjust-unit-display');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(Math.max(0, idx - 200), idx + 200);
    expect(block).toContain('selectedBatch.unit');
  });

  it('BU.A.3 — caption only shows when selectedBatch exists (no orphan caption)', () => {
    const idx = src.indexOf('adjust-unit-display');
    expect(idx).toBeGreaterThan(0);
    const before = src.slice(Math.max(0, idx - 300), idx);
    expect(before).toMatch(/selectedBatch\s*&&/);
  });

  it('BU.A.4 — Thai label "หน่วย:" present', () => {
    const idx = src.indexOf('adjust-unit-display');
    const block = src.slice(Math.max(0, idx - 200), idx + 200);
    expect(block).toContain('หน่วย');
  });
});

// ============================================================================
describe('Phase 15.4 BU.B — TransferCreateForm items table has หน่วย column', () => {
  const src = read('src/components/backend/StockTransferPanel.jsx');

  it('BU.B.1 — thead has <th>หน่วย</th>', () => {
    expect(src).toMatch(/<th[^>]*>\s*หน่วย\s*<\/th>/);
  });

  it('BU.B.2 — tbody has data-testid={`transfer-unit-${idx}`} cell', () => {
    expect(src).toMatch(/data-testid=\{`transfer-unit-\$\{idx\}`\}/);
  });

  it('BU.B.3 — unit cell reads from picked batch (b?.unit)', () => {
    const idx = src.indexOf('transfer-unit-');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(Math.max(0, idx - 100), idx + 200);
    expect(block).toMatch(/b\?\.unit/);
  });

  it('BU.B.4 — fallback to "-" when no batch picked yet', () => {
    const idx = src.indexOf('transfer-unit-');
    const block = src.slice(Math.max(0, idx - 100), idx + 300);
    // Either renders <span>-</span> or `b?.unit || '-'`
    expect(block).toMatch(/['"]-['"]|>-</);
  });
});

// ============================================================================
describe('Phase 15.4 BU.C — WithdrawalCreateForm items table has หน่วย column', () => {
  const src = read('src/components/backend/StockWithdrawalPanel.jsx');

  it('BU.C.1 — thead has <th>หน่วย</th>', () => {
    expect(src).toMatch(/<th[^>]*>\s*หน่วย\s*<\/th>/);
  });

  it('BU.C.2 — tbody has data-testid={`withdrawal-unit-${idx}`} cell', () => {
    expect(src).toMatch(/data-testid=\{`withdrawal-unit-\$\{idx\}`\}/);
  });

  it('BU.C.3 — unit cell reads from picked batch (b?.unit)', () => {
    const idx = src.indexOf('withdrawal-unit-');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(Math.max(0, idx - 100), idx + 200);
    expect(block).toMatch(/b\?\.unit/);
  });

  it('BU.C.4 — fallback rendering when no batch picked', () => {
    const idx = src.indexOf('withdrawal-unit-');
    const block = src.slice(Math.max(0, idx - 100), idx + 300);
    expect(block).toMatch(/['"]-['"]|>-</);
  });
});

// ============================================================================
describe('Phase 15.4 BU.D — CentralOrderCreateForm uses smart UnitField dropdown', () => {
  const src = read('src/components/backend/CentralStockOrderPanel.jsx');

  it('BU.D.1 — imports UnitField from shared ./UnitField.jsx', () => {
    expect(src).toMatch(/import\s+UnitField\s+from\s+['"]\.\/UnitField\.jsx['"]/);
  });

  it('BU.D.2 — imports getUnitOptionsForProduct from shared helpers', () => {
    expect(src).toMatch(/import\s*\{\s*getUnitOptionsForProduct\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/unitFieldHelpers\.js['"]/);
  });

  it('BU.D.3 — imports listProductUnitGroups from backendClient', () => {
    expect(src).toMatch(/listProductUnitGroups/);
  });

  it('BU.D.4 — loadMasters fetches unit groups in parallel', () => {
    expect(src).toMatch(/listProductUnitGroups\(\)/);
    expect(src).toMatch(/setUnitGroups/);
  });

  it('BU.D.5 — CentralOrderCreateForm accepts unitGroups prop', () => {
    expect(src).toMatch(/function\s+CentralOrderCreateForm\(\{[\s\S]{0,200}unitGroups/);
  });

  it('BU.D.6 — items table renders <UnitField> with getUnitOptionsForProduct', () => {
    // Item rendering uses UnitField with options computed from getUnitOptionsForProduct
    const matches = src.match(/<UnitField[\s\S]{0,500}\/>/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const cpoMatch = matches.find((m) => m.includes('cpo-unit-'));
    expect(cpoMatch).toBeTruthy();
    expect(cpoMatch).toMatch(/options=\{getUnitOptionsForProduct\(it\.productId,\s*products,\s*unitGroups\)\}/);
  });

  it('BU.D.7 — V21 anti-regression: NO raw <input type="text"> for unit (was the bug pattern)', () => {
    // Within the items table specifically (around the unit cell), there must
    // be NO `<input type="text" value={it.unit}>` pattern.
    const idx = src.indexOf('cpo-unit-');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(Math.max(0, idx - 500), idx + 500);
    expect(block).not.toMatch(/<input\s+type="text"\s+value=\{it\.unit\}/);
  });

  it('BU.D.8 — onPickProduct still auto-fills unit from product master', () => {
    // The auto-fill on product pick is what makes the dropdown immediately show
    // the right unit. Must remain.
    expect(src).toMatch(/unit:\s*p\?\.mainUnitName/);
  });
});

// ============================================================================
describe('Phase 15.4 BU.E — cross-cutting source-grep guards', () => {
  it('BU.E.1 — every batch-row form has unit visibility hook (Rule of 3 lock)', () => {
    const adjust = read('src/components/backend/StockAdjustPanel.jsx');
    const transfer = read('src/components/backend/StockTransferPanel.jsx');
    const withdrawal = read('src/components/backend/StockWithdrawalPanel.jsx');
    const central = read('src/components/backend/CentralStockOrderPanel.jsx');

    // Each form has SOMETHING that displays the unit auto-driven by product/batch
    expect(adjust).toMatch(/adjust-unit-display/);
    expect(transfer).toMatch(/transfer-unit-/);
    expect(withdrawal).toMatch(/withdrawal-unit-/);
    expect(central).toMatch(/cpo-unit-/);
  });

  it('BU.E.2 — UnitField shared file is the SINGLE source of truth (no duplicate)', () => {
    const dir = path.join(process.cwd(), 'src/components/backend');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsx'));
    let count = 0;
    for (const f of files) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      if (/^function UnitField\s*\(/m.test(content)) count++;
    }
    // UnitField.jsx EXPORTS via `export default function` — that's not `^function`.
    // So count should be 0 (no inline function declarations anywhere).
    expect(count).toBe(0);
  });

  it('BU.E.3 — V14 anti-regression: getUnitOptionsForProduct + getDefaultUnitForProduct never return undefined', () => {
    const helpers = read('src/lib/unitFieldHelpers.js');
    // Source-grep: function bodies always return [] or '' on early-exit
    expect(helpers).toMatch(/return\s*\[\]/);
    expect(helpers).toMatch(/return\s*['"]['"]/);
    expect(helpers).not.toMatch(/return\s+undefined/);
  });
});
