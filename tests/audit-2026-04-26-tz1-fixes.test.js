// ─── Audit P0 + P2 fixes — TZ1 batch (2026-04-26) ───────────────────────
//
// Fixes from docs/audit-2026-04-26-sweep.md:
//   - P0 [TZ1]   SalePaymentModal:24      paidAt drift (was UTC slice)
//   - P2 [TZ1m]  StockReportTab:123       CSV filename drift
//   - P2 [TZ1m]  medicalInstrumentValidation:168 default-today drift
//
// V12-class TZ off-by-one: any `new Date().toISOString().slice(0, 10)`
// emits UTC, which during 00:00-07:00 Bangkok is the PREVIOUS day in BKK.
// Money records, CSV filenames, and "due-today" badges thus drift.
//
// All 3 fixes wire to the canonical `thaiTodayISO()` helper.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { thaiTodayISO } from '../src/utils.js';
import { daysUntilMaintenance } from '../src/lib/medicalInstrumentValidation.js';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ═══════════════════════════════════════════════════════════════════════
// AT1 — SalePaymentModal source-shape: paidAt uses thaiTodayISO
// ═══════════════════════════════════════════════════════════════════════

describe('AT1: SalePaymentModal paidAt uses Bangkok TZ', () => {
  const SRC = READ('src/components/backend/SalePaymentModal.jsx');

  it('AT1.1: imports thaiTodayISO from utils', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiTodayISO\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\.js['"]/);
  });

  it('AT1.2: paidAt useState initializes via thaiTodayISO()', () => {
    expect(SRC).toMatch(/useState\(thaiTodayISO\(\)\)/);
  });

  it('AT1.3: NO raw new Date().toISOString().slice(0,10) anywhere in this file', () => {
    expect(SRC).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(\s*0,\s*10\s*\)/);
  });

  it('AT1.4: comment locks the V12-class lesson reference', () => {
    expect(SRC).toMatch(/TZ1|V12-class|drifts to YESTERDAY|UTC/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AT2 — StockReportTab CSV filename uses Bangkok TZ
// ═══════════════════════════════════════════════════════════════════════

describe('AT2: StockReportTab CSV filename uses Bangkok TZ', () => {
  const SRC = READ('src/components/backend/reports/StockReportTab.jsx');

  it('AT2.1: imports thaiTodayISO', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiTodayISO\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\.js['"]/);
  });

  it('AT2.2: filename uses thaiTodayISO()', () => {
    expect(SRC).toMatch(/`stock-report_\$\{thaiTodayISO\(\)\}`/);
  });

  it('AT2.3: NO raw .toISOString().slice(0,10) in this file', () => {
    expect(SRC).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(\s*0,\s*10\s*\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AT3 — medicalInstrumentValidation default-today uses Bangkok TZ
// ═══════════════════════════════════════════════════════════════════════

describe('AT3: medicalInstrumentValidation default-today uses Bangkok TZ', () => {
  const SRC = READ('src/lib/medicalInstrumentValidation.js');

  it('AT3.1: imports thaiTodayISO from utils', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiTodayISO\s*\}\s*from\s*['"]\.\.\/utils\.js['"]/);
  });

  it('AT3.2: default fallback uses thaiTodayISO not raw Date', () => {
    expect(SRC).toMatch(/today\s*\|\|\s*thaiTodayISO\(\)/);
  });

  it('AT3.3: NO raw new Date().toISOString().slice(0,10) in this file', () => {
    expect(SRC).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(\s*0,\s*10\s*\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AT4 — runtime behavior: daysUntilMaintenance still computes correctly
// ═══════════════════════════════════════════════════════════════════════

describe('AT4: daysUntilMaintenance runtime correctness post-TZ-fix', () => {
  it('AT4.1: explicit today arg still wins over default fallback', () => {
    expect(daysUntilMaintenance('2026-05-26', '2026-04-26')).toBe(30);
    expect(daysUntilMaintenance('2026-04-25', '2026-04-26')).toBe(-1);
    expect(daysUntilMaintenance('2026-04-26', '2026-04-26')).toBe(0);
  });

  it('AT4.2: default fallback uses thaiTodayISO — value is consistent across calls', () => {
    // Two calls within the same Bangkok-day MUST agree (no UTC roll-over)
    const a = daysUntilMaintenance('2030-12-31');
    const b = daysUntilMaintenance('2030-12-31');
    expect(a).toBe(b);
    expect(typeof a).toBe('number');
  });

  it('AT4.3: invalid input returns null safely', () => {
    expect(daysUntilMaintenance(null)).toBeNull();
    expect(daysUntilMaintenance('not-a-date')).toBeNull();
    expect(daysUntilMaintenance('')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AT5 — ANTI-REGRESSION (V12-class): no Bangkok-TZ-leak elsewhere in
// money + report code paths. Source-grep guard for the most common
// failure pattern.
// ═══════════════════════════════════════════════════════════════════════

describe('AT5: V12-class anti-regression — no UTC-slice in money/date-critical paths', () => {
  // Files where a wrong-day side-effect would ship to user (money, reports, badges).
  // Adding to this list = adding a new file we must keep TZ-clean.
  const GUARDED_FILES = [
    'src/components/backend/SalePaymentModal.jsx',
    'src/components/backend/reports/StockReportTab.jsx',
    'src/lib/medicalInstrumentValidation.js',
  ];

  for (const f of GUARDED_FILES) {
    it(`AT5.guarded: ${f} — no new Date().toISOString().slice(0,10)`, () => {
      const src = READ(f);
      expect(src).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(\s*0,\s*10\s*\)/);
    });
  }
});
