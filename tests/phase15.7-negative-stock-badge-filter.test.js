// Phase 15.7 (2026-04-28) — StockBalancePanel negative-stock badge + filter
//
// User directive: "เพิ่ม Badge และ filter สต็อคติดลบ ใน list ในหน้า ยอดคงเหลือ".
//
// Source-grep regression bank for the panel render shape. RTL render tests
// for this panel are skipped because the component is heavy (Firestore +
// branch context + multi-listener) and prone to V21-class lock-in. The
// source-grep level catches the contract: badge present, filter wired,
// priority correct, tooltip on negative cell.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const PanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/StockBalancePanel.jsx'), 'utf-8');

describe('Phase 15.7 — Negative stock badge + filter', () => {
  describe('B1 — badge predicate', () => {
    it('B1.1 isNegativeStockWarning helper defined as totalRemaining < 0', () => {
      expect(PanelSrc).toMatch(/const\s+isNegativeStockWarning\s*=\s*useCallback\(\s*\(p\)\s*=>[\s\S]{0,150}Number\(p\.totalRemaining\)\s*<\s*0/);
    });

    it('B1.2 helper used inside render to derive isNegative flag', () => {
      expect(PanelSrc).toMatch(/const\s+isNegative\s*=\s*isNegativeStockWarning\(p\)/);
    });

    it('B1.3 outOfStock now excludes negative case (mutual exclusion)', () => {
      expect(PanelSrc).toMatch(/const\s+outOfStock\s*=\s*!isNegative\s*&&\s*p\.totalRemaining\s*<=\s*0/);
    });
  });

  describe('B2 — badge render', () => {
    it('B2.1 ติดลบ badge with data-testid="badge-negative-stock"', () => {
      expect(PanelSrc).toMatch(/data-testid="badge-negative-stock"/);
    });

    it('B2.2 ติดลบ badge has rose color scheme', () => {
      expect(PanelSrc).toMatch(/text-rose-300|bg-rose-900\/40|border-rose-700/);
    });

    it('B2.3 ติดลบ badge has admin-helpful tooltip', () => {
      expect(PanelSrc).toMatch(/title="สต็อคติดลบ — ตัดเกินคงเหลือ ต้องนำเข้า\/โอนเข้า\/ปรับเพิ่ม\/รับเบิกเข้า เพื่อเติม"/);
    });

    it('B2.4 ติดลบ badge ordered BEFORE หมด in row render', () => {
      // Find the order — both badges sit in the same <td> right after the
      // product name. We assert ติดลบ appears textually first in the source.
      const badgeBlock = PanelSrc.split('data-testid="badge-negative-stock"')[1] || '';
      const head = PanelSrc.split('data-testid="badge-negative-stock"')[0] || '';
      // ติดลบ block exists; the หมด badge appears AFTER it
      expect(badgeBlock).toMatch(/data-testid="badge-out-of-stock"/);
      // And NOT before
      expect(head).not.toMatch(/data-testid="badge-out-of-stock"/);
    });

    it('B2.5 row total cell uses rose color when negative', () => {
      expect(PanelSrc).toMatch(/isNegative\s*\?\s*'text-rose-400'\s*:\s*'text-emerald-400'/);
    });

    it('B2.6 row total cell tooltip when negative', () => {
      expect(PanelSrc).toMatch(/isNegative\s*\?\s*'สต็อคติดลบ — ต้องนำเข้า\/โอน\/ปรับ\/เบิกเข้า เพื่อปรับยอด'\s*:\s*undefined/);
    });
  });

  describe('B3 — filter checkbox', () => {
    it('B3.1 showNegativeStockOnly state declared', () => {
      expect(PanelSrc).toMatch(/const\s*\[showNegativeStockOnly,\s*setShowNegativeStockOnly\]\s*=\s*useState\(false\)/);
    });

    it('B3.2 filter checkbox with data-testid="filter-negative-stock"', () => {
      expect(PanelSrc).toMatch(/data-testid="filter-negative-stock"/);
    });

    it('B3.3 filter checkbox label is "ติดลบ"', () => {
      // The label contains both ติดลบ word and a hint about repay
      const filterBlock = PanelSrc.split('data-testid="filter-negative-stock"')[1] || '';
      const head = filterBlock.slice(0, 500);
      expect(head).toMatch(/ติดลบ/);
    });

    it('B3.4 displayed list filter applies isNegativeStockWarning', () => {
      expect(PanelSrc).toMatch(/if\s*\(showNegativeStockOnly\)\s*list\s*=\s*list\.filter\(isNegativeStockWarning\)/);
    });

    it('B3.5 displayed useMemo deps include showNegativeStockOnly + isNegativeStockWarning', () => {
      // Find the displayed useMemo body up to its deps array. We search
      // for the LAST `}, [` pattern within the next ~3000 chars after
      // useMemo opens — that's the dep-array delimiter.
      const memoSlice = PanelSrc.split('const displayed = useMemo')[1] || '';
      // Scan for `, [`-style deps at end of the memo
      const depsMatch = memoSlice.slice(0, 4000).match(/,\s*\[([^\]]*)\]\s*\)/);
      expect(depsMatch).toBeTruthy();
      const deps = depsMatch[1];
      expect(deps).toMatch(/showNegativeStockOnly/);
      expect(deps).toMatch(/isNegativeStockWarning/);
    });
  });

  describe('B4 — Phase 15.7 marker', () => {
    it('B4.1 panel carries Phase 15.7 marker comment', () => {
      expect(PanelSrc).toMatch(/Phase 15\.7/);
    });
  });
});
