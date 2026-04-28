// ─── Phase 15.6 — ความจุ column = per-product แจ้งเกินสต็อก threshold ────────
// User report (round 1, 2026-04-28):
//   "ความจุทั้งในหน้าสต็อคและ Central stock คือปริมาณเดียวกันกับ
//    แจ้งเกินสต็อก (qty) ของสินค้านั้นๆ"
// Round 1 fix (V35): tooltip + per-row sub-label "(เป้าหมาย: N)".
//
// Round 2 (V35.2-tris, 2026-04-28): user changed direction:
//   "แถวของความจุ ให้แสดง แจ้งเกินสต็อก (qty) ของสินค้านั้นๆเลย
//    ไม่ต้องแสดงเป้าหมายอะไรแล้ว"
// → Column now shows alertQtyBeforeMaxStock directly. Sub-label removed.
// '-' rendered when threshold unset.
//
// Coverage:
//   CT.A — header has explanatory tooltip (title attribute + Info icon)
//   CT.B — per-row sub-label shows "(เป้าหมาย: N)" when alertQtyBeforeMaxStock set
//   CT.C — Info icon imported from lucide-react
//   CT.D — testids present for RTL coverage in future

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const balanceSrc = read('src/components/backend/StockBalancePanel.jsx');

// =============================================================================
describe('Phase 15.6 CT.A — ความจุ header tooltip', () => {
  it('CT.A.1 — Info icon imported from lucide-react', () => {
    expect(balanceSrc).toMatch(/import\s*\{[^}]*Info[^}]*\}\s*from\s*['"]lucide-react['"]/);
  });

  it('CT.A.2 — header has data-testid="th-capacity"', () => {
    expect(balanceSrc).toMatch(/data-testid="th-capacity"/);
  });

  it('CT.A.3 — header span has title referencing แจ้งเกินสต็อก (V35.2-tris)', () => {
    expect(balanceSrc).toMatch(/title="[^"]*แจ้งเกินสต็อก[^"]*"/);
  });

  it('CT.A.4 — header still displays "ความจุ" text', () => {
    expect(balanceSrc).toMatch(/ความจุ\s*<Info/);
  });

  it('CT.A.5 — Info icon has aria-hidden (decorative)', () => {
    expect(balanceSrc).toMatch(/<Info\s+size=\{10\}\s+aria-hidden/);
  });
});

// =============================================================================
describe('Phase 15.6 CT.B — V35.2-tris cell renders alertQtyBeforeMaxStock directly', () => {
  it('CT.B.1 — capacity cell has data-testid="td-capacity"', () => {
    expect(balanceSrc).toMatch(/data-testid="td-capacity"/);
  });

  it('CT.B.2 — cell uses alertQtyBeforeMaxStock with "-" fallback (V35.2-tris)', () => {
    // Pattern: `{p.alertQtyBeforeMaxStock != null ? fmtQty(p.alertQtyBeforeMaxStock) : '-'}`
    expect(balanceSrc).toMatch(/p\.alertQtyBeforeMaxStock\s*!=\s*null\s*\?\s*fmtQty\(p\.alertQtyBeforeMaxStock\)\s*:\s*['"]-['"]/);
  });

  it('CT.B.3 — V35.2-tris sub-label "(เป้าหมาย: N)" REMOVED', () => {
    // Round-1 sub-label dropped per user directive
    expect(balanceSrc).not.toMatch(/\(เป้าหมาย:/);
    expect(balanceSrc).not.toMatch(/data-testid="td-capacity-target"/);
  });

  it('CT.B.4 — totalCapacity aggregator still computed (used by lot-row total col)', () => {
    // p.totalCapacity is still summed from batches because lot-row expansion
    // displays per-lot qty.total. Just no longer rendered in main column.
    expect(balanceSrc).toMatch(/p\.totalCapacity\s*\+=\s*Number\(b\.qty\?\.total/);
  });

  it('CT.B.5 — V21 anti-regression: main column NOT showing fmtQty(p.totalCapacity)', () => {
    // The previous render `fmtQty(p.totalCapacity)` for the main capacity
    // cell is replaced. Lot rows still use it (allowed). Check by scoping
    // search to within the data-testid="td-capacity" block.
    const m = balanceSrc.match(/data-testid="td-capacity"[\s\S]{0,800}<\/td>/);
    expect(m, 'td-capacity block not found').not.toBeNull();
    expect(m[0]).not.toMatch(/fmtQty\(p\.totalCapacity\)/);
  });
});

// =============================================================================
describe('Phase 15.6 CT.C — institutional memory markers', () => {
  it('CT.C.1 — V35.2-tris marker present (round 2 directive — แจ้งเกินสต็อก direct)', () => {
    expect(balanceSrc).toMatch(/V35\.2-tris/);
  });

  it('CT.C.2 — แจ้งเกินสต็อก reference present (column meaning)', () => {
    expect(balanceSrc).toMatch(/แจ้งเกินสต็อก/);
  });
});
