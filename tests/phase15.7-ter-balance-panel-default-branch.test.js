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

  describe('TER2 — auto-pick effect', () => {
    it('TER2.1 useEffect that watches branches + defaultLocationId', () => {
      // Find the auto-pick useEffect block (anchored on the marker comment)
      expect(PanelSrc).toMatch(/Phase 15\.7-ter[\s\S]{0,200}auto-pick the default branch/);
    });

    it('TER2.2 effect early-returns when defaultLocationId provided (caller wins)', () => {
      // Anchor on the unique comment phrase inside the auto-pick effect.
      const block = PanelSrc.split('auto-pick the default branch when branches arrive')[1] || '';
      const sliced = block.slice(0, 1500);
      expect(sliced).toMatch(/if\s*\(defaultLocationId\)\s*return;/);
    });

    it('TER2.3 effect early-returns when admin already picked a location', () => {
      const block = PanelSrc.split('auto-pick the default branch when branches arrive')[1] || '';
      const sliced = block.slice(0, 1500);
      expect(sliced).toMatch(/if\s*\(userPickedLocation\)\s*return;/);
    });

    it('TER2.4 effect uses branches.find with isDefault=true', () => {
      const block = PanelSrc.split('auto-pick the default branch when branches arrive')[1] || '';
      const sliced = block.slice(0, 1500);
      // Tolerate arrow-fn `(b) => b && b.isDefault` (parens inside arg)
      expect(sliced).toMatch(/branches\.find\([\s\S]{0,80}b\.isDefault/);
    });

    it('TER2.5 effect resolves branchId or id from the branch record (V20 multi-branch)', () => {
      const block = PanelSrc.split('auto-pick the default branch when branches arrive')[1] || '';
      const sliced = block.slice(0, 1500);
      expect(sliced).toMatch(/def\.branchId\s*\|\|\s*def\.id/);
    });

    it('TER2.6 effect sets locationId to the resolved default-branch id', () => {
      const block = PanelSrc.split('auto-pick the default branch when branches arrive')[1] || '';
      const sliced = block.slice(0, 1500);
      expect(sliced).toMatch(/setLocationId\(String\(defId\)\)/);
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

  describe('TER5 — Anti-regression: original literal "main" default still works as last-resort fallback', () => {
    it('TER5.1 useState fallback chain unchanged — defaultLocationId || "main"', () => {
      expect(PanelSrc).toMatch(/useState\(defaultLocationId\s*\|\|\s*'main'\)/);
    });
  });
});
