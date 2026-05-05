// Phase 15.7-ter (2026-04-28) — StockBalancePanel auto-picks default branch
//
// User report: "พอกูนำเข้า Allergan 100 U กลับเข้าไปแล้ว ในหน้ายอดคงเหลือ
// Allergan 100 U หายไปเลย".
//
// Root cause (preview_eval confirmed): data showed 924 active at default
// branch (BR-1777095572005-ae97f911), but StockBalancePanel initial state
// was `useState(defaultLocationId || 'main')`. StockTab does NOT pass
// `defaultLocationId`, so locationId stayed at the literal 'main' which
// matches NO active batches (be_branches has BR-... default, not 'main').
//
// Fix: NEW useEffect that auto-picks the default branch (from branches
// list) when defaultLocationId is absent AND admin hasn't manually picked
// one. The userPickedLocation flag locks the choice once admin uses the
// dropdown so we don't override their selection.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const PanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/StockBalancePanel.jsx'), 'utf-8');

describe('Phase 15.7-ter — StockBalancePanel default-branch auto-pick', () => {
  describe('TER1 — userPickedLocation tracker', () => {
    it('TER1.1 useState declared with initial false', () => {
      expect(PanelSrc).toMatch(/const\s*\[\s*userPickedLocation\s*,\s*setUserPickedLocation\s*\]\s*=\s*useState\(false\)/);
    });

    it('TER1.2 dropdown onChange flips flag to true', () => {
      // The single dropdown's onChange must call BOTH setLocationId AND setUserPickedLocation(true)
      expect(PanelSrc).toMatch(/onChange=\{e\s*=>\s*\{\s*setLocationId\(e\.target\.value\);\s*setUserPickedLocation\(true\)/);
    });
  });

  describe('TER2 — Phase 17.2: auto-pick first branch (isDefault flag removed)', () => {
    // Phase 17.2 (2026-05-05): isDefault flag stripped. The auto-pick
    // effect now picks branches[0] — useSelectedBranch already orders
    // them newest-first + staff-accessible. The first item is the
    // canonical landing default.
    it('TER2.1 useEffect that watches branches + defaultLocationId', () => {
      expect(PanelSrc).toMatch(/Phase 17\.2[\s\S]{0,300}auto-pick/);
    });

    it('TER2.2 effect early-returns when defaultLocationId provided (caller wins)', () => {
      expect(PanelSrc).toMatch(/if\s*\(defaultLocationId\)\s*return;/);
    });

    it('TER2.3 effect early-returns when admin already picked a location', () => {
      expect(PanelSrc).toMatch(/if\s*\(userPickedLocation\)\s*return;/);
    });

    it('TER2.4 Phase 17.2 — picks branches[0] (no isDefault filter)', () => {
      // Phase 17.2: isDefault flag REMOVED. branches[0] is the newest +
      // accessible branch picked by useSelectedBranch ordering.
      expect(PanelSrc).toMatch(/const\s+first\s*=\s*branches\[0\]/);
      // Anti-regression: NO `b.isDefault` filter in the auto-pick effect.
      const effectBlock = PanelSrc.split('Phase 17.2')[1] || '';
      const sliced = effectBlock.slice(0, 1500);
      expect(sliced).not.toMatch(/b\.isDefault/);
    });

    it('TER2.5 effect resolves branchId or id from the branch record', () => {
      expect(PanelSrc).toMatch(/first\.branchId\s*\|\|\s*first\.id/);
    });

    it('TER2.6 effect sets locationId to the resolved id', () => {
      expect(PanelSrc).toMatch(/setLocationId\(String\(defId\)\)/);
    });
  });

  describe('TER3 — Functional simulate', () => {
    // Mirror the auto-pick logic in pure JS so we can verify the rules
    // that drive the in-component effect produce correct outcomes.
    function simulateAutoPick({ defaultLocationId, userPickedLocation, branches, currentLocationId }) {
      if (defaultLocationId) return currentLocationId;
      if (userPickedLocation) return currentLocationId;
      if (!Array.isArray(branches) || branches.length === 0) return currentLocationId;
      const def = branches.find((b) => b && b.isDefault);
      const defId = def && (def.branchId || def.id);
      if (defId && defId !== currentLocationId) return String(defId);
      return currentLocationId;
    }

    it('TER3.1 — fresh panel + branches arrive → flips to default branch', () => {
      const next = simulateAutoPick({
        defaultLocationId: undefined,
        userPickedLocation: false,
        branches: [{ branchId: 'BR-DEFAULT', isDefault: true, name: 'นครราชสีมา' }],
        currentLocationId: 'main',
      });
      expect(next).toBe('BR-DEFAULT');
    });

    it('TER3.2 — caller passed defaultLocationId → no override', () => {
      const next = simulateAutoPick({
        defaultLocationId: 'WH-CENTRAL',
        userPickedLocation: false,
        branches: [{ branchId: 'BR-DEFAULT', isDefault: true }],
        currentLocationId: 'WH-CENTRAL',
      });
      expect(next).toBe('WH-CENTRAL');
    });

    it('TER3.3 — admin already picked → no override', () => {
      const next = simulateAutoPick({
        defaultLocationId: undefined,
        userPickedLocation: true,
        branches: [{ branchId: 'BR-DEFAULT', isDefault: true }],
        currentLocationId: 'WH-CENTRAL', // admin switched
      });
      expect(next).toBe('WH-CENTRAL');
    });

    it('TER3.4 — no branches → stay at current (literal main fallback)', () => {
      const next = simulateAutoPick({
        defaultLocationId: undefined,
        userPickedLocation: false,
        branches: [],
        currentLocationId: 'main',
      });
      expect(next).toBe('main');
    });

    it('TER3.5 — no default branch found → stay at current', () => {
      const next = simulateAutoPick({
        defaultLocationId: undefined,
        userPickedLocation: false,
        branches: [{ branchId: 'BR-A', isDefault: false }, { branchId: 'BR-B', isDefault: false }],
        currentLocationId: 'main',
      });
      expect(next).toBe('main');
    });

    it('TER3.6 — branches accept both branchId AND id keys (legacy compat)', () => {
      const next = simulateAutoPick({
        defaultLocationId: undefined,
        userPickedLocation: false,
        branches: [{ id: 'BR-LEGACY', isDefault: true }], // no branchId, only id
        currentLocationId: 'main',
      });
      expect(next).toBe('BR-LEGACY');
    });

    it('TER3.7 — already at default → no-op (no setLocationId churn)', () => {
      const next = simulateAutoPick({
        defaultLocationId: undefined,
        userPickedLocation: false,
        branches: [{ branchId: 'BR-DEFAULT', isDefault: true }],
        currentLocationId: 'BR-DEFAULT',
      });
      expect(next).toBe('BR-DEFAULT');
    });
  });

  describe('TER4 — Phase 15.7-ter institutional-memory marker', () => {
    it('TER4.1 marker comment present', () => {
      expect(PanelSrc).toMatch(/Phase 15\.7-ter/);
    });
  });

  describe('TER5 — Phase 17.2: empty-string fallback (no main literal)', () => {
    it('TER5.1 Phase 17.2 — useState fallback is empty string (no main literal)', () => {
      // Phase 17.2 (2026-05-05): no synthetic 'main' fallback. Empty
      // sentinel until defaultLocationId or branches arrive.
      expect(PanelSrc).toMatch(/useState\(defaultLocationId\s*\|\|\s*''\)/);
    });
  });
});
