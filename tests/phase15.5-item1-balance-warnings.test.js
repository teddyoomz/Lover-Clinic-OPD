// Phase 15.5 / Item 1 (2026-04-28) — StockBalancePanel per-product warnings.
//
// User directive (verbatim):
// "เพิ่มระบบ แจ้งก่อนหมดอายุ (วัน), แจ้งใกล้หมด (qty), แจ้งเกินสต็อก (qty)
//  ในหน้ายอดคงเหลือของทั้ง stock สาขา และ Central Stock"
// "จะต้องยึดตามข้อมูลที่กรอกไปในสินค้าแต่ละชิ้น และใช้ได้จริง แจ้งจริง"
//
// 3 product fields (already in productValidation.js schema, editable via
// ProductFormModal) drive per-row badges + filter visibility:
//   - alertDayBeforeExpire   → "ใกล้หมดอายุ" badge when next batch expires within N days
//   - alertQtyBeforeOutOfStock → "ใกล้หมด" badge when total remaining ≤ N (and > 0)
//   - alertQtyBeforeMaxStock → "เกินสต็อก" badge when total remaining > N
//
// Coverage:
//   IT.A — pure threshold logic (helpers locked in source-grep)
//   IT.B — source-grep regression guards (panel wires thresholds + filter)
//   IT.C — adversarial inputs (null thresholds, edge values)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PANEL_PATH = join(process.cwd(), 'src', 'components', 'backend', 'StockBalancePanel.jsx');
const PANEL_SRC = readFileSync(PANEL_PATH, 'utf-8');

const PRODUCT_VAL_PATH = join(process.cwd(), 'src', 'lib', 'productValidation.js');
const PRODUCT_VAL_SRC = readFileSync(PRODUCT_VAL_PATH, 'utf-8');

const PRODUCT_FORM_PATH = join(process.cwd(), 'src', 'components', 'backend', 'ProductFormModal.jsx');
const PRODUCT_FORM_SRC = readFileSync(PRODUCT_FORM_PATH, 'utf-8');

// ────────────────────────────────────────────────────────────────────────
// Pure logic mirrors of the panel's per-product helper functions.
// Keeps tests independent of React mounting; locks the algorithm.
// ────────────────────────────────────────────────────────────────────────
function isExpiryWarning(p, now = Date.now()) {
  if (p.alertDayBeforeExpire == null) return false;
  if (!p.nextExpiry) return false;
  const days = (new Date(p.nextExpiry).getTime() - now) / 86400000;
  return days <= Number(p.alertDayBeforeExpire);
}
function isLowStockWarning(p) {
  if (p.alertQtyBeforeOutOfStock == null) return false;
  return Number(p.totalRemaining) <= Number(p.alertQtyBeforeOutOfStock) && Number(p.totalRemaining) > 0;
}
function isOverStockWarning(p) {
  if (p.alertQtyBeforeMaxStock == null) return false;
  return Number(p.totalRemaining) > Number(p.alertQtyBeforeMaxStock);
}

// ════════════════════════════════════════════════════════════════════════════
// IT.A — pure threshold logic
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5/Item 1 — IT.A pure threshold logic', () => {
  // Fixed "now" for deterministic time-based assertions
  const NOW = new Date('2026-04-28T00:00:00Z').getTime();
  const daysFromNow = (n) => new Date(NOW + n * 86400000).toISOString();

  describe('isExpiryWarning', () => {
    it('A1.1 returns false when alertDayBeforeExpire is null', () => {
      expect(isExpiryWarning({ alertDayBeforeExpire: null, nextExpiry: daysFromNow(5) }, NOW)).toBe(false);
    });
    it('A1.2 returns false when alertDayBeforeExpire is undefined', () => {
      expect(isExpiryWarning({ nextExpiry: daysFromNow(5) }, NOW)).toBe(false);
    });
    it('A1.3 returns false when nextExpiry is missing', () => {
      expect(isExpiryWarning({ alertDayBeforeExpire: 30 }, NOW)).toBe(false);
    });
    it('A1.4 fires when days remaining <= threshold', () => {
      expect(isExpiryWarning({ alertDayBeforeExpire: 30, nextExpiry: daysFromNow(15) }, NOW)).toBe(true);
    });
    it('A1.5 silent when days remaining > threshold', () => {
      expect(isExpiryWarning({ alertDayBeforeExpire: 30, nextExpiry: daysFromNow(60) }, NOW)).toBe(false);
    });
    it('A1.6 fires when already expired (days < 0 ≤ threshold)', () => {
      expect(isExpiryWarning({ alertDayBeforeExpire: 30, nextExpiry: daysFromNow(-5) }, NOW)).toBe(true);
    });
    it('A1.7 boundary: days == threshold fires', () => {
      expect(isExpiryWarning({ alertDayBeforeExpire: 30, nextExpiry: daysFromNow(30) }, NOW)).toBe(true);
    });
    it('A1.8 zero threshold means "warn day-of-expiry"', () => {
      expect(isExpiryWarning({ alertDayBeforeExpire: 0, nextExpiry: daysFromNow(0) }, NOW)).toBe(true);
      expect(isExpiryWarning({ alertDayBeforeExpire: 0, nextExpiry: daysFromNow(1) }, NOW)).toBe(false);
    });
  });

  describe('isLowStockWarning', () => {
    it('A2.1 returns false when alertQtyBeforeOutOfStock is null', () => {
      expect(isLowStockWarning({ totalRemaining: 3 })).toBe(false);
    });
    it('A2.2 fires when remaining <= threshold (and > 0)', () => {
      expect(isLowStockWarning({ alertQtyBeforeOutOfStock: 5, totalRemaining: 3 })).toBe(true);
      expect(isLowStockWarning({ alertQtyBeforeOutOfStock: 5, totalRemaining: 5 })).toBe(true);
    });
    it('A2.3 silent when remaining > threshold', () => {
      expect(isLowStockWarning({ alertQtyBeforeOutOfStock: 5, totalRemaining: 6 })).toBe(false);
    });
    it('A2.4 silent when remaining = 0 (out-of-stock badge wins, not low-stock)', () => {
      expect(isLowStockWarning({ alertQtyBeforeOutOfStock: 5, totalRemaining: 0 })).toBe(false);
    });
    it('A2.5 fractional threshold respected', () => {
      expect(isLowStockWarning({ alertQtyBeforeOutOfStock: 0.5, totalRemaining: 0.3 })).toBe(true);
      expect(isLowStockWarning({ alertQtyBeforeOutOfStock: 0.5, totalRemaining: 0.6 })).toBe(false);
    });
  });

  describe('isOverStockWarning', () => {
    it('A3.1 returns false when alertQtyBeforeMaxStock is null', () => {
      expect(isOverStockWarning({ totalRemaining: 100 })).toBe(false);
    });
    it('A3.2 fires when remaining > threshold', () => {
      expect(isOverStockWarning({ alertQtyBeforeMaxStock: 50, totalRemaining: 51 })).toBe(true);
      expect(isOverStockWarning({ alertQtyBeforeMaxStock: 50, totalRemaining: 1000 })).toBe(true);
    });
    it('A3.3 silent when remaining == threshold (boundary)', () => {
      expect(isOverStockWarning({ alertQtyBeforeMaxStock: 50, totalRemaining: 50 })).toBe(false);
    });
    it('A3.4 silent when remaining < threshold', () => {
      expect(isOverStockWarning({ alertQtyBeforeMaxStock: 50, totalRemaining: 30 })).toBe(false);
    });
  });

  describe('Combined per-product example (3 thresholds set)', () => {
    it('A4.1 product approaching expiry but well-stocked → only expiry badge', () => {
      const p = {
        alertDayBeforeExpire: 30,
        alertQtyBeforeOutOfStock: 5,
        alertQtyBeforeMaxStock: 100,
        totalRemaining: 50,
        nextExpiry: daysFromNow(10),
      };
      expect(isExpiryWarning(p, NOW)).toBe(true);
      expect(isLowStockWarning(p)).toBe(false);
      expect(isOverStockWarning(p)).toBe(false);
    });
    it('A4.2 product over-stocked + near expiry → both badges', () => {
      const p = {
        alertDayBeforeExpire: 30,
        alertQtyBeforeOutOfStock: 5,
        alertQtyBeforeMaxStock: 100,
        totalRemaining: 200,
        nextExpiry: daysFromNow(10),
      };
      expect(isExpiryWarning(p, NOW)).toBe(true);
      expect(isOverStockWarning(p)).toBe(true);
      expect(isLowStockWarning(p)).toBe(false);
    });
    it('A4.3 product low + recent expiry beyond threshold → only low badge', () => {
      const p = {
        alertDayBeforeExpire: 30,
        alertQtyBeforeOutOfStock: 5,
        alertQtyBeforeMaxStock: 100,
        totalRemaining: 3,
        nextExpiry: daysFromNow(60),
      };
      expect(isExpiryWarning(p, NOW)).toBe(false);
      expect(isLowStockWarning(p)).toBe(true);
      expect(isOverStockWarning(p)).toBe(false);
    });
    it('A4.4 product no thresholds set → no badges (silent)', () => {
      const p = {
        totalRemaining: 9999,
        nextExpiry: daysFromNow(1),
      };
      expect(isExpiryWarning(p, NOW)).toBe(false);
      expect(isLowStockWarning(p)).toBe(false);
      expect(isOverStockWarning(p)).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// IT.B — source-grep regression guards (StockBalancePanel wires thresholds)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5/Item 1 — IT.B source-grep guards', () => {
  it('B1 panel imports listProducts (threshold lookup source)', () => {
    // BSA Task 6: UI imports backendClient via scopedDataLayer Layer 2
    expect(PANEL_SRC).toMatch(/import\s*\{[^}]*listProducts[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/scopedDataLayer/);
  });

  it('B2 panel maintains productThresholdMap state', () => {
    expect(PANEL_SRC).toMatch(/productThresholdMap/);
    expect(PANEL_SRC).toMatch(/setProductThresholdMap/);
  });

  it('B3 product threshold map has all 3 keys', () => {
    expect(PANEL_SRC).toMatch(/alertDayBeforeExpire:\s*numOrNull\(p\.alertDayBeforeExpire\)/);
    expect(PANEL_SRC).toMatch(/alertQtyBeforeOutOfStock:\s*numOrNull\(p\.alertQtyBeforeOutOfStock\)/);
    expect(PANEL_SRC).toMatch(/alertQtyBeforeMaxStock:\s*numOrNull\(p\.alertQtyBeforeMaxStock\)/);
  });

  it('B4 aggregator attaches per-product thresholds to row state', () => {
    // V35.2 (2026-04-28) — variable renamed from `t` to `tEntry` for clarity.
    // Optional-chaining + nullish-coalesce form: `tEntry?.alertX ?? null`.
    expect(PANEL_SRC).toMatch(/alertDayBeforeExpire:\s*tEntry\?\.alertDayBeforeExpire/);
    expect(PANEL_SRC).toMatch(/alertQtyBeforeOutOfStock:\s*tEntry\?\.alertQtyBeforeOutOfStock/);
    expect(PANEL_SRC).toMatch(/alertQtyBeforeMaxStock:\s*tEntry\?\.alertQtyBeforeMaxStock/);
  });

  it('B5 helpers exist (isExpiryWarning + isLowStockWarning + isOverStockWarning)', () => {
    expect(PANEL_SRC).toMatch(/isExpiryWarning\s*=\s*useCallback/);
    expect(PANEL_SRC).toMatch(/isLowStockWarning\s*=\s*useCallback/);
    expect(PANEL_SRC).toMatch(/isOverStockWarning\s*=\s*useCallback/);
  });

  it('B6 hardcoded ≤30 expiry filter REMOVED (anti-regression)', () => {
    // Old code: const days = (new Date(p.nextExpiry).getTime() - now) / 86400000; return days <= 30;
    // After Item 1 the filter delegates to isExpiryWarning(p) which uses the
    // per-product threshold. Locked: no naked 30-day comparison in displayed memo.
    const memoMatch = PANEL_SRC.match(/displayed\s*=\s*useMemo[\s\S]*?\}\,\s*\[/);
    expect(memoMatch).toBeTruthy();
    expect(memoMatch[0]).not.toMatch(/<=\s*30\b/);
  });

  it('B7 hardcoded ≤5 low-stock filter REMOVED (anti-regression)', () => {
    // Old: list = list.filter(p => p.totalRemaining <= 5);
    const memoMatch = PANEL_SRC.match(/displayed\s*=\s*useMemo[\s\S]*?\}\,\s*\[/);
    expect(memoMatch[0]).not.toMatch(/totalRemaining\s*<=\s*5\b/);
  });

  it('B8 displayed-memo filter delegates to per-product helpers', () => {
    expect(PANEL_SRC).toMatch(/showExpiringOnly\)\s*list\s*=\s*list\.filter\(isExpiryWarning\)/);
    expect(PANEL_SRC).toMatch(/showLowStockOnly\)\s*list\s*=\s*list\.filter\(isLowStockWarning\)/);
    expect(PANEL_SRC).toMatch(/showOverStockOnly\)\s*list\s*=\s*list\.filter\(isOverStockWarning\)/);
  });

  it('B9 3 filter checkboxes rendered with testIds', () => {
    expect(PANEL_SRC).toMatch(/data-testid=["']filter-near-expiry["']/);
    expect(PANEL_SRC).toMatch(/data-testid=["']filter-low-stock["']/);
    expect(PANEL_SRC).toMatch(/data-testid=["']filter-over-stock["']/);
  });

  it('B10 4 row badges rendered with testIds (out-of-stock + low + over + near-expiry)', () => {
    expect(PANEL_SRC).toMatch(/data-testid=["']badge-out-of-stock["']/);
    expect(PANEL_SRC).toMatch(/data-testid=["']badge-low-stock["']/);
    expect(PANEL_SRC).toMatch(/data-testid=["']badge-over-stock["']/);
    expect(PANEL_SRC).toMatch(/data-testid=["']badge-near-expiry["']/);
  });

  it('B11 over-stock badge gated by isOverStockWarning helper (not raw arithmetic)', () => {
    // Each badge condition uses the helper to keep semantics consistent.
    expect(PANEL_SRC).toMatch(/isOver\s*&&[\s\S]*?data-testid=["']badge-over-stock["']/);
  });

  it('B12 Phase 15.5/Item 1 marker comment present', () => {
    const matches = PANEL_SRC.match(/Phase 15\.5 \/ Item 1/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// IT.C — schema + form coverage (existing fields still wired correctly)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5/Item 1 — IT.C schema + form integrity', () => {
  it('C1 productValidation.js schema has 3 alert fields', () => {
    expect(PRODUCT_VAL_SRC).toMatch(/alertDayBeforeExpire/);
    expect(PRODUCT_VAL_SRC).toMatch(/alertQtyBeforeOutOfStock/);
    expect(PRODUCT_VAL_SRC).toMatch(/alertQtyBeforeMaxStock/);
  });

  it('C2 emptyProductForm initializes 3 alert fields', () => {
    expect(PRODUCT_VAL_SRC).toMatch(/alertDayBeforeExpire:\s*''/);
    expect(PRODUCT_VAL_SRC).toMatch(/alertQtyBeforeOutOfStock:\s*''/);
    expect(PRODUCT_VAL_SRC).toMatch(/alertQtyBeforeMaxStock:\s*''/);
  });

  it('C3 normalizeProduct converts 3 alert fields via numOrNull', () => {
    expect(PRODUCT_VAL_SRC).toMatch(/alertDayBeforeExpire:\s*numOrNull\(form\.alertDayBeforeExpire\)/);
    expect(PRODUCT_VAL_SRC).toMatch(/alertQtyBeforeOutOfStock:\s*numOrNull\(form\.alertQtyBeforeOutOfStock\)/);
    expect(PRODUCT_VAL_SRC).toMatch(/alertQtyBeforeMaxStock:\s*numOrNull\(form\.alertQtyBeforeMaxStock\)/);
  });

  it('C4 ProductFormModal has 3 alert input fields (data-field anchors)', () => {
    expect(PRODUCT_FORM_SRC).toMatch(/data-field=["']alertDayBeforeExpire["']/);
    expect(PRODUCT_FORM_SRC).toMatch(/data-field=["']alertQtyBeforeOutOfStock["']/);
    expect(PRODUCT_FORM_SRC).toMatch(/data-field=["']alertQtyBeforeMaxStock["']/);
  });

  it('C5 validateProduct rejects negative numbers for the 3 alert fields', () => {
    // The validator already loops these keys + rejects negative.
    expect(PRODUCT_VAL_SRC).toMatch(/'alertDayBeforeExpire',\s*'alertQtyBeforeOutOfStock',\s*'alertQtyBeforeMaxStock'/);
  });
});
