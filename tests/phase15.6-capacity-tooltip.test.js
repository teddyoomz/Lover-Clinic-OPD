// ─── Phase 15.6 / V145 — ความจุ + มูลค่าทุน columns REMOVED → หมวดหมู่ + ประเภท ──
// Originally (V35 / V35.2-tris) this locked the ความจุ (capacity) column tooltip.
// V145 (2026-06-02, AV175) removed the per-row ความจุ + มูลค่าทุน columns per the
// user's directive: "เอามูลค่าทุนและความจุออกไป เพิ่ม หมวดหมู่ และ ประเภท แทน".
// The capacity threshold (alertQtyBeforeMaxStock) still drives the เกินสต็อก
// badge/filter, and the มูลค่าต้นทุนรวม header summary is kept — only the two
// per-row columns are gone. This file is REPURPOSED as the removal anti-
// regression + the new-column lock.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const balanceSrc = read('src/components/backend/StockBalancePanel.jsx');

// =============================================================================
describe('Phase 15.6 / V145 CT.A — ความจุ + มูลค่าทุน columns removed', () => {
  it('CT.A.1 ความจุ header (th-capacity) is GONE', () => {
    expect(balanceSrc).not.toMatch(/data-testid="th-capacity"/);
  });

  it('CT.A.2 capacity cell (td-capacity) is GONE', () => {
    expect(balanceSrc).not.toMatch(/data-testid="td-capacity"/);
  });

  it('CT.A.3 per-row capacity render (alertQtyBeforeMaxStock cell) is GONE', () => {
    expect(balanceSrc).not.toMatch(/p\.alertQtyBeforeMaxStock\s*!=\s*null\s*\?\s*fmtQty/);
  });

  it('CT.A.4 per-row มูลค่าทุน render (฿fmtQty(p.valueCost)) is GONE', () => {
    expect(balanceSrc).not.toMatch(/฿\{fmtQty\(p\.valueCost\)\}/);
  });

  it('CT.A.5 V35.2-tris (เป้าหมาย) sub-label stays removed', () => {
    expect(balanceSrc).not.toMatch(/\(เป้าหมาย:/);
  });
});

// =============================================================================
describe('Phase 15.6 / V145 CT.B — new หมวดหมู่ + ประเภท columns (live)', () => {
  it('CT.B.1 หมวดหมู่ column present (th + td)', () => {
    expect(balanceSrc).toMatch(/data-testid="th-category"/);
    expect(balanceSrc).toMatch(/data-testid="td-category"/);
  });

  it('CT.B.2 ประเภท column present (th + td)', () => {
    expect(balanceSrc).toMatch(/data-testid="th-type"/);
    expect(balanceSrc).toMatch(/data-testid="td-type"/);
  });

  it('CT.B.3 capacity threshold STILL drives the เกินสต็อก badge/filter (not removed entirely)', () => {
    expect(balanceSrc).toMatch(/alertQtyBeforeMaxStock/);
    expect(balanceSrc).toMatch(/badge-over-stock/);
  });

  it('CT.B.4 มูลค่าต้นทุนรวม header summary kept (totalValue from valueCost)', () => {
    expect(balanceSrc).toMatch(/valueCost/);
    expect(balanceSrc).toMatch(/มูลค่าต้นทุนรวม/);
  });
});
