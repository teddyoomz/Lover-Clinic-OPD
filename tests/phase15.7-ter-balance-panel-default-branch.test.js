// Phase 15.7-ter (2026-04-28) — StockBalancePanel auto-picked the default
// branch via a userPickedLocation tracker + an auto-pick-branches[0] useEffect
// + an own "สถานที่" dropdown.
//
// ⚠ SUPERSEDED by V144 (2026-06-02). User: "เอา tab สถานที่ออกไปเลย ให้ขึ้น
// stock ตาม Branch selector ด้านบนเท่านั้น สาขาอื่นไม่ต้องขึ้น user สับสน".
// The per-panel location dropdown + the auto-pick state machine were REMOVED —
// the branch balance now follows the global top BranchSelector (selectedBranchId)
// and `locationId` is DERIVED (lockLocation ? defaultLocationId : selectedBranchId).
// This brings StockBalancePanel in line with its siblings (StockAdjustPanel /
// MovementLogPanel already follow ctxBranchId).
//
// This file is now the REMOVAL anti-regression lock (the old auto-pick/dropdown
// patterns must NOT come back). The positive V144 contract lives in
// `tests/v144-stock-ux.test.js` (B1).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const PanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/StockBalancePanel.jsx'), 'utf-8');

describe('Phase 15.7-ter / V144 — auto-pick + per-panel dropdown REMOVED', () => {
  describe('TER-V144.1 — the auto-pick state machine is gone', () => {
    it('no userPickedLocation tracker', () => {
      expect(PanelSrc).not.toMatch(/userPickedLocation/);
    });
    it('no setLocationId (locationId is derived, not state)', () => {
      expect(PanelSrc).not.toMatch(/setLocationId/);
      expect(PanelSrc).not.toMatch(/const\s*\[\s*locationId\s*,/);
    });
    it('no auto-pick-branches[0] logic', () => {
      expect(PanelSrc).not.toMatch(/const\s+first\s*=\s*branches\[0\]/);
      expect(PanelSrc).not.toMatch(/setLocationId\(String\(defId\)\)/);
    });
    it('no useState(defaultLocationId || ...) fallback', () => {
      expect(PanelSrc).not.toMatch(/useState\(defaultLocationId/);
    });
  });

  describe('TER-V144.2 — the per-panel "สถานที่" dropdown is gone', () => {
    it('no สถานที่ label', () => {
      expect(PanelSrc).not.toMatch(/สถานที่:/);
    });
    it('no location <select> bound to locationId', () => {
      expect(PanelSrc).not.toMatch(/value=\{locationId\}\s+onChange/);
    });
  });

  describe('TER-V144.3 — the NEW contract: follow the global BranchSelector', () => {
    it('destructures selectedBranchId from useSelectedBranch', () => {
      expect(PanelSrc).toMatch(/const\s*\{\s*branchId:\s*selectedBranchId\s*\}\s*=\s*useSelectedBranch\(\)/);
    });
    it('locationId derived = lockLocation ? defaultLocationId : selectedBranchId', () => {
      expect(PanelSrc).toMatch(/const\s+locationId\s*=\s*lockLocation\s*\?\s*\(defaultLocationId\s*\|\|\s*''\)\s*:\s*\(selectedBranchId\s*\|\|\s*''\)/);
    });
    it('central view (lockLocation) STILL pins to defaultLocationId', () => {
      // The ternary keeps the central path: lockLocation → defaultLocationId.
      expect(PanelSrc).toMatch(/lockLocation\s*\?\s*\(defaultLocationId/);
    });
    it('V144 marker comment present (institutional memory)', () => {
      expect(PanelSrc).toMatch(/V144 \(2026-06-02\)/);
    });
  });
});
