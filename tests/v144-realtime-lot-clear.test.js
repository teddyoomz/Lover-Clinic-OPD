// V144 (2026-06-02) — real-time redundant-0-lot auto-clear + "หมด" filter.
//
// Two coordinated changes on tab=stock → ยอดคงเหลือ:
//   (1) NEW "หมด (คงเหลือ 0)" filter in StockBalancePanel (pure client predicate).
//   (2) NEW _clearRedundantZeroLotsForProducts in backendClient.js, called
//       post-commit at the 7 stock-mutation entry points → makes the AV168
//       (V143-quater) planLotCleanup run in REAL TIME instead of 03:45-cron-only.
//
// User rule (verbatim clarification): "มันเป็น 0 ได้ ถ้ามี lot เดียว แต่ถ้ามี
// lot อื่นเข้ามา lot ที่เป็น 0 จะต้องหายไป" = exactly planLotCleanup.
//
// This bank is source-grep + PURE-function behavior (the panel + the helper are
// heavy Firestore/branch-context surfaces — RTL mount is V21-lock-prone per the
// AV166/Phase15.7 precedent). The REAL behavior of the deletion is verified by
// the Rule Q L2 e2e `scripts/e2e-stock-realtime-lot-clear.mjs` on real prod.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { planLotCleanup } from '../src/lib/stockLotCleanupCore.js';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const PanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/StockBalancePanel.jsx'), 'utf-8');
const ClientSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/backendClient.js'), 'utf-8');
const SkillSrc = readFileSync(path.join(REPO_ROOT, '.agents/skills/audit-anti-vibe-code/SKILL.md'), 'utf-8');

// Extract a top-level function body: from `... function <name>(` to the next
// top-level `\nexport ` (or `\n// ───` section divider), whichever comes first.
function fnBody(src, name) {
  const re = new RegExp(`(?:export\\s+)?async\\s+function\\s+${name}\\s*\\(`);
  const m = src.match(re);
  if (!m) return '';
  const start = m.index;
  const after = src.slice(start + m[0].length);
  const nextIdx = after.search(/\nexport\s+(?:async\s+)?function\s+\w+\s*\(/);
  return nextIdx === -1 ? after : after.slice(0, nextIdx);
}

describe('V144 — "หมด" out-of-stock filter (StockBalancePanel)', () => {
  describe('F1 — filter wiring (source-grep)', () => {
    it('F1.1 showOutOfStockOnly state declared', () => {
      expect(PanelSrc).toMatch(/const\s*\[showOutOfStockOnly,\s*setShowOutOfStockOnly\]\s*=\s*useState\(false\)/);
    });
    it('F1.2 isOutOfStock predicate is exactly 0 (matches "หมด" badge)', () => {
      expect(PanelSrc).toMatch(/const\s+isOutOfStock\s*=\s*useCallback\(\s*\(p\)\s*=>[\s\S]{0,120}Number\(p\.totalRemaining\)\s*===\s*0/);
    });
    it('F1.3 displayed list applies the filter', () => {
      expect(PanelSrc).toMatch(/if\s*\(showOutOfStockOnly\)\s*list\s*=\s*list\.filter\(isOutOfStock\)/);
    });
    it('F1.4 displayed useMemo deps include showOutOfStockOnly + isOutOfStock', () => {
      const memoSlice = PanelSrc.split('const displayed = useMemo')[1] || '';
      const depsMatch = memoSlice.slice(0, 4000).match(/,\s*\[([^\]]*)\]\s*\)/);
      expect(depsMatch).toBeTruthy();
      expect(depsMatch[1]).toMatch(/showOutOfStockOnly/);
      expect(depsMatch[1]).toMatch(/isOutOfStock/);
    });
    it('F1.5 checkbox has data-testid="filter-out-of-stock" + label "หมด (คงเหลือ 0)"', () => {
      expect(PanelSrc).toMatch(/data-testid="filter-out-of-stock"/);
      const block = PanelSrc.split('data-testid="filter-out-of-stock"')[1] || '';
      expect(block.slice(0, 400)).toMatch(/หมด \(คงเหลือ 0\)/);
    });
    it('F1.6 checkbox sits AFTER the ติดลบ (negative) filter', () => {
      const head = PanelSrc.split('data-testid="filter-out-of-stock"')[0] || '';
      expect(head).toMatch(/data-testid="filter-negative-stock"/); // negative comes first
    });
  });

  describe('F2 — filter predicate behavior (pure, replicates the inline logic)', () => {
    // Mirror of the component's predicate + displayed-filter composition.
    const isOutOfStock = (p) => Number(p.totalRemaining) === 0;
    const products = [
      { productId: 'A', totalRemaining: 0 },    // หมด
      { productId: 'B', totalRemaining: 50 },   // in stock
      { productId: 'C', totalRemaining: -3 },   // ติดลบ (own filter)
      { productId: 'D', totalRemaining: 0 },    // หมด
    ];
    it('F2.1 filter yields ONLY totalRemaining===0 rows', () => {
      const out = products.filter(isOutOfStock).map(p => p.productId);
      expect(out).toEqual(['A', 'D']);
    });
    it('F2.2 negative (<0) is NOT included (ติดลบ has its own filter)', () => {
      expect(products.filter(isOutOfStock).some(p => p.productId === 'C')).toBe(false);
    });
    it('F2.3 positive (>0) is NOT included', () => {
      expect(products.filter(isOutOfStock).some(p => p.productId === 'B')).toBe(false);
    });
    it('F2.4 string/float adversarial: "0" coerces to 0; 0.0001 does NOT match', () => {
      expect(isOutOfStock({ totalRemaining: '0' })).toBe(true);
      expect(isOutOfStock({ totalRemaining: 0.0001 })).toBe(false);
      expect(isOutOfStock({ totalRemaining: null })).toBe(true); // Number(null)===0 — drained placeholder shows
    });
  });
});

describe('V144 — _clearRedundantZeroLotsForProducts helper', () => {
  const helperBody = fnBody(ClientSrc, '_clearRedundantZeroLotsForProducts');

  describe('H1 — helper structure (source-grep)', () => {
    it('H1.1 exported async function exists', () => {
      expect(ClientSrc).toMatch(/export\s+async\s+function\s+_clearRedundantZeroLotsForProducts\s*\(\s*affectedKeys\s*\)/);
    });
    it('H1.2 backendClient imports planLotCleanup (pure single-source)', () => {
      expect(ClientSrc).toMatch(/import\s*\{\s*planLotCleanup\s*\}\s*from\s*['"]\.\/stockLotCleanupCore\.js['"]/);
    });
    it('H1.3 helper calls planLotCleanup (reuses AV168 rule — no re-implementation)', () => {
      expect(helperBody).toMatch(/planLotCleanup\(lots\)/);
    });
    it('H1.4 helper is DELETE-ONLY — wb.delete(stockBatchDoc(...))', () => {
      expect(helperBody).toMatch(/wb\.delete\(stockBatchDoc\(/);
    });
    it('H1.5 helper NEVER mutates a batch (no wb.update / setDoc on a batch)', () => {
      expect(helperBody).not.toMatch(/wb\.update\(/);
      expect(helperBody).not.toMatch(/setDoc\(stockBatchDoc/);
      expect(helperBody).not.toMatch(/tx\.(update|set)\(/);
    });
    it('H1.6 helper reads lots via listStockBatches({ productId, branchId })', () => {
      expect(helperBody).toMatch(/listStockBatches\(\{\s*productId,\s*branchId\s*\}\)/);
    });
    it('H1.7 helper dedups via a Set + chunks at 450', () => {
      expect(helperBody).toMatch(/new Set\(\)/);
      expect(helperBody).toMatch(/n\s*>=\s*450/);
    });
  });

  describe('H2 — key-dedup / skip logic (pure mirror of the helper loop)', () => {
    // Replicates the exact dedup the helper does on affectedKeys.
    function dedup(affectedKeys) {
      const seen = new Set();
      const uniq = [];
      for (const k of (Array.isArray(affectedKeys) ? affectedKeys : [])) {
        const pid = String(k?.productId ?? '');
        const loc = String(k?.locationId ?? k?.branchId ?? '');
        if (!pid || !loc) continue;
        const key = `${pid}|${loc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push({ productId: pid, branchId: loc });
      }
      return uniq;
    }
    it('H2.1 empty / non-array → []', () => {
      expect(dedup([])).toEqual([]);
      expect(dedup(null)).toEqual([]);
      expect(dedup(undefined)).toEqual([]);
    });
    it('H2.2 duplicate (productId × location) collapses to one', () => {
      const out = dedup([
        { productId: 'P', locationId: 'L' },
        { productId: 'P', locationId: 'L' },
        { productId: 'P', branchId: 'L' }, // branchId alias = same key
      ]);
      expect(out).toEqual([{ productId: 'P', branchId: 'L' }]);
    });
    it('H2.3 missing productId OR location is skipped', () => {
      expect(dedup([{ productId: '', locationId: 'L' }])).toEqual([]);
      expect(dedup([{ productId: 'P' }])).toEqual([]);
      expect(dedup([{ locationId: 'L' }])).toEqual([]);
    });
    it('H2.4 same product different locations kept separate', () => {
      const out = dedup([
        { productId: 'P', locationId: 'A' },
        { productId: 'P', locationId: 'B' },
      ]);
      expect(out).toHaveLength(2);
    });
  });

  describe('H3 — the V144 RULE via the REAL planLotCleanup (the user clarification)', () => {
    const lot = (id, remaining, status = 'active') => ({ id, productId: 'P', branchId: 'B', status, qty: { remaining } });
    it('H3.1 a LIVE lot exists → ALL 0-lots deleted ("ถ้ามี lot อื่นเข้ามา")', () => {
      const { deleteIds } = planLotCleanup([lot('live', 50), lot('z1', 0), lot('z2', 0)]);
      expect(new Set(deleteIds)).toEqual(new Set(['z1', 'z2']));
    });
    it('H3.2 fully drained, ONE 0-lot → KEPT (placeholder; "เป็น 0 ได้ ถ้ามี lot เดียว")', () => {
      const { deleteIds, keptPlaceholders } = planLotCleanup([lot('only', 0)]);
      expect(deleteIds).toEqual([]);
      expect(keptPlaceholders).toBe(1);
    });
    it('H3.3 fully drained, MANY 0-lots → keep exactly 1, delete the rest', () => {
      const { deleteIds, keptPlaceholders } = planLotCleanup([lot('z1', 0), lot('z2', 0), lot('z3', 0)]);
      expect(deleteIds).toHaveLength(2);
      expect(keptPlaceholders).toBe(1);
    });
    it('H3.4 a NEGATIVE (debt) lot counts as LIVE → never deleted; its sibling 0-lots are', () => {
      const { deleteIds } = planLotCleanup([lot('neg', -4), lot('z1', 0)]);
      expect(deleteIds).toEqual(['z1']); // neg kept (live), z1 deleted
    });
    it('H3.5 cancelled / expired lots are NOT touched (different lifecycle)', () => {
      const { deleteIds } = planLotCleanup([lot('live', 5), lot('zc', 0, 'cancelled'), lot('ze', 0, 'expired')]);
      expect(deleteIds).toEqual([]); // cancelled/expired excluded from cleanup; no active/depleted zero to clear
    });
  });
});

describe('V144 / AV172 — entry-point wiring (anti-V36 multi-writer-sweep)', () => {
  const REQUIRED = [
    'deductStockForSale',
    'deductStockForTreatment',
    'createStockOrder',
    'receiveCentralStockOrder',
    'createStockAdjustment',
    'updateStockTransferStatus',
    'updateStockWithdrawalStatus',
  ];
  describe('W1 — all 7 required callers invoke the helper', () => {
    for (const name of REQUIRED) {
      it(`W1.${name} calls _clearRedundantZeroLotsForProducts`, () => {
        expect(fnBody(ClientSrc, name)).toMatch(/_clearRedundantZeroLotsForProducts\(/);
      });
    }
  });
  describe('W2 — exempt entry points carry the annotation', () => {
    it('W2.1 createStockTransfer is AV172-exempt (pending doc only)', () => {
      expect(fnBody(ClientSrc, 'createStockTransfer')).toMatch(/AV172-exempt/);
      expect(fnBody(ClientSrc, 'createStockTransfer')).not.toMatch(/_clearRedundantZeroLotsForProducts\(/);
    });
    it('W2.2 createStockWithdrawal is AV172-exempt (pending doc only)', () => {
      expect(fnBody(ClientSrc, 'createStockWithdrawal')).toMatch(/AV172-exempt/);
    });
    it('W2.3 deductCourseItems does NOT write be_stock_batches (course-only) → no call needed', () => {
      // It must NOT reference stockBatchDoc at all (stock decrements via deductStockForTreatment).
      expect(fnBody(ClientSrc, 'deductCourseItems')).not.toMatch(/stockBatchDoc\(/);
    });
  });
  describe('W3 — transfer/withdrawal clear BOTH source + dest, at BOTH return paths', () => {
    it('W3.1 updateStockTransferStatus builds both-location keys', () => {
      const b = fnBody(ClientSrc, 'updateStockTransferStatus');
      expect(b).toMatch(/v144AffectedKeys/);
      expect(b).toMatch(/cur\.sourceLocationId/);
      expect(b).toMatch(/cur\.destinationLocationId/);
      // called at the receive-return AND the final return = ≥2 invocations
      expect((b.match(/_clearRedundantZeroLotsForProducts\(/g) || []).length).toBeGreaterThanOrEqual(2);
    });
    it('W3.2 updateStockWithdrawalStatus builds both-location keys + ≥2 calls', () => {
      const b = fnBody(ClientSrc, 'updateStockWithdrawalStatus');
      expect(b).toMatch(/v144AffectedKeys/);
      expect((b.match(/_clearRedundantZeroLotsForProducts\(/g) || []).length).toBeGreaterThanOrEqual(2);
    });
  });
  describe('W4 — calls are non-critical (wrapped in try/catch)', () => {
    it('W4.1 deductStockForSale wraps the cleanup in try/catch', () => {
      const b = fnBody(ClientSrc, 'deductStockForSale');
      expect(b).toMatch(/try\s*\{[\s\S]{0,160}_clearRedundantZeroLotsForProducts[\s\S]{0,160}catch/);
    });
  });
  describe('W5 — AV172 invariant documented', () => {
    it('W5.1 SKILL.md has the AV172 entry', () => {
      expect(SkillSrc).toMatch(/### AV172 —/);
      expect(SkillSrc).toMatch(/_clearRedundantZeroLotsForProducts/);
    });
    it('W5.2 the 03:45 cron stays as the system-wide backstop (AV168 untouched)', () => {
      expect(SkillSrc).toMatch(/### AV168 —/);
    });
  });
});
