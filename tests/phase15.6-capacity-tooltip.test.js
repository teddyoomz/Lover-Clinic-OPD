// ─── Phase 15.6 — ความจุ column tooltip + sub-label (Issue 2) ────────────────
// User report (verbatim, 2026-04-28):
//   "ความจุทั้งในหน้าสต็อคและ Central stock คือปริมาณเดียวกันกับ
//    แจ้งเกินสต็อก (qty) ของสินค้านั้นๆ"
//
// Verdict: NO bug. ความจุ = sum(batch.qty.total) across batches per product
// (capacity at batch creation). User's observation is partial coincidence
// on rows where defaults align. Fix: tooltip + per-row sub-label so admin
// sees both concepts (capacity vs threshold) side-by-side without confusion.
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

  it('CT.A.3 — header span has title attribute referencing both concepts', () => {
    expect(balanceSrc).toMatch(/title="[^"]*capacity[^"]*"/i);
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
describe('Phase 15.6 CT.B — per-row sub-label "(เป้าหมาย: N)"', () => {
  it('CT.B.1 — capacity cell has data-testid="td-capacity"', () => {
    expect(balanceSrc).toMatch(/data-testid="td-capacity"/);
  });

  it('CT.B.2 — sub-label has data-testid="td-capacity-target"', () => {
    expect(balanceSrc).toMatch(/data-testid="td-capacity-target"/);
  });

  it('CT.B.3 — sub-label rendered conditionally on alertQtyBeforeMaxStock != null', () => {
    expect(balanceSrc).toMatch(/p\.alertQtyBeforeMaxStock\s*!=\s*null\s*&&/);
  });

  it('CT.B.4 — sub-label text reads "(เป้าหมาย: N)"', () => {
    expect(balanceSrc).toMatch(/\(เป้าหมาย:/);
  });

  it('CT.B.5 — totalCapacity value (sum batch.qty.total) preserved', () => {
    // V21 anti-regression: must not REPLACE totalCapacity with QtyBeforeMaxStock
    expect(balanceSrc).toMatch(/p\.totalCapacity\s*\+=\s*Number\(b\.qty\?\.total/);
    expect(balanceSrc).toMatch(/fmtQty\(p\.totalCapacity\)/);
  });
});

// =============================================================================
describe('Phase 15.6 CT.C — institutional memory markers', () => {
  it('CT.C.1 — Phase 15.6 / Issue 2 comment present', () => {
    expect(balanceSrc).toMatch(/Phase 15\.6\s*\/\s*Issue 2/);
  });

  it('CT.C.2 — clarification noted: capacity vs threshold distinction', () => {
    expect(balanceSrc).toMatch(/แจ้งเกินสต็อก/);
  });
});
