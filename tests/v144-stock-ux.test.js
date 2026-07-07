// V144 stock ยอดคงเหลือ UX (2026-06-02) — two coordinated UX fixes:
//   Issue 3: the Balance-row ปรับ/เพิ่ม buttons open an IN-PLACE modal
//            (StockActionModal) instead of navigating to the ปรับสต็อก/นำเข้า
//            sub-tab. After save → stay on ยอดคงเหลือ (no "bounce").
//   Issue 4: the per-panel "สถานที่" dropdown is REMOVED — the branch balance
//            follows the global top BranchSelector (selectedBranchId) only.
//
// Source-grep (the panel + StockTab are heavy Firestore/branch-context surfaces;
// RTL mount is V21-lock-prone per the AV166 / Phase15.7 precedent). Behavior is
// verified live in the browser preview (Rule Q/S) + the existing flow tests.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');
const StockTabSrc = read('src/components/backend/StockTab.jsx');
const PanelSrc = read('src/components/backend/StockBalancePanel.jsx');
const ModalSrc = read('src/components/backend/StockActionModal.jsx');
const AdjustSrc = read('src/components/backend/StockAdjustPanel.jsx');
const OrderSrc = read('src/components/backend/OrderPanel.jsx');
const CentralSrc = read('src/components/backend/CentralStockTab.jsx');
const SkillSrc = read('.agents/skills/audit-anti-vibe-code/SKILL.md');

describe('V144 Issue 3 — in-place adjust/order modal (no bounce)', () => {
  describe('M1 — StockTab opens a modal, does NOT navigate', () => {
    it('M1.1 handleAdjustProduct sets stockAction {mode:adjust}, no setSubTab', () => {
      expect(StockTabSrc).toMatch(/handleAdjustProduct\s*=\s*\(product\)\s*=>\s*setStockAction\(\{\s*mode:\s*'adjust',\s*product\s*\}\)/);
    });
    it('M1.2 handleAddStockForProduct sets stockAction {mode:order}, no setSubTab', () => {
      expect(StockTabSrc).toMatch(/handleAddStockForProduct\s*=\s*\(product\)\s*=>\s*setStockAction\(\{\s*mode:\s*'order',\s*product\s*\}\)/);
    });
    it('M1.3 the handlers no longer call setSubTab (no bounce)', () => {
      // Neither handler navigates. (setSubTab still exists for the tab bar itself.)
      expect(StockTabSrc).not.toMatch(/setSubTab\('adjust'\)/);
      expect(StockTabSrc).not.toMatch(/setSubTab\('orders'\)/);
    });
    it('M1.4 prefill-to-tab state removed (adjustPrefill / orderPrefill gone)', () => {
      expect(StockTabSrc).not.toMatch(/adjustPrefill/);
      expect(StockTabSrc).not.toMatch(/orderPrefill/);
    });
    it('M1.5 StockTab imports + renders StockActionModal', () => {
      expect(StockTabSrc).toMatch(/import\s+StockActionModal\s+from\s+'\.\/StockActionModal\.jsx'/);
      expect(StockTabSrc).toMatch(/<StockActionModal[\s\S]{0,200}mode=\{stockAction\.mode\}/);
    });
    it('M1.6 the orders/adjust sub-tabs no longer receive a prefill prop', () => {
      expect(StockTabSrc).not.toMatch(/prefillProduct=\{(orderPrefill|adjustPrefill)\}/);
    });
  });

  describe('M2 — StockActionModal reuses the existing forms (DRY) + AV78', () => {
    it('M2.1 imports BOTH create forms', () => {
      expect(ModalSrc).toMatch(/import\s*\{\s*AdjustCreateForm\s*\}\s*from\s*'\.\/StockAdjustPanel\.jsx'/);
      expect(ModalSrc).toMatch(/import\s*\{\s*OrderCreateForm\s*\}\s*from\s*'\.\/OrderPanel\.jsx'/);
    });
    it('M2.2 picks the form by mode (order → OrderCreateForm, else AdjustCreateForm)', () => {
      expect(ModalSrc).toMatch(/mode\s*===\s*'order'\s*\?\s*OrderCreateForm\s*:\s*AdjustCreateForm/);
    });
    it('M2.3 loads products + sellers (so the reused forms get their options)', () => {
      expect(ModalSrc).toMatch(/listProducts/);
      expect(ModalSrc).toMatch(/listAllSellers\(\{\s*branchId\s*\}\)/);
    });
    it('M2.4 AV78 — backdrop has NO onClick close (explicit close only)', () => {
      // The overlay carries the testid; NO onClick anywhere in the modal (the
      // form's own กลับ/save are the only close affordances). Match `onClick=`
      // (the attribute) — the AV78 comment text "NO onClick:" must not trip it.
      expect(ModalSrc).toMatch(/data-testid="stock-action-modal"/);
      expect(ModalSrc).not.toMatch(/onClick=/);
    });
    it('M2.5 passes prefillProduct + onClose + onSaved through to the form', () => {
      expect(ModalSrc).toMatch(/prefillProduct=\{product\}/);
      expect(ModalSrc).toMatch(/onClose=\{onClose\}/);
      expect(ModalSrc).toMatch(/onSaved=\{onSaved\}/);
    });
  });

  describe('M3 — the create forms are exported for modal reuse', () => {
    it('M3.1 StockAdjustPanel exports AdjustCreateForm', () => {
      expect(AdjustSrc).toMatch(/export\s+function\s+AdjustCreateForm\s*\(/);
    });
    it('M3.2 OrderPanel exports OrderCreateForm', () => {
      expect(OrderSrc).toMatch(/export\s+function\s+OrderCreateForm\s*\(/);
    });
    it('M3.3 both forms keep the onClose + onSaved contract the modal relies on', () => {
      expect(AdjustSrc).toMatch(/export\s+function\s+AdjustCreateForm\(\{[^}]*onClose[^}]*onSaved[^}]*\}\)/);
      expect(OrderSrc).toMatch(/export\s+function\s+OrderCreateForm\(\{[^}]*onClose[^}]*onSaved[^}]*\}\)/);
    });
  });
});

describe('V144 Issue 4 — balance follows the global BranchSelector (no per-panel dropdown)', () => {
  describe('B1 — StockBalancePanel derives locationId, no own selector', () => {
    it('B1.1 destructures selectedBranchId from useSelectedBranch', () => {
      expect(PanelSrc).toMatch(/const\s*\{\s*branchId:\s*selectedBranchId\s*\}\s*=\s*useSelectedBranch\(\)/);
    });
    it('B1.2 locationId is DERIVED (lockLocation ? defaultLocationId : selectedBranchId), not useState', () => {
      expect(PanelSrc).toMatch(/const\s+locationId\s*=\s*lockLocation\s*\?\s*\(defaultLocationId\s*\|\|\s*''\)\s*:\s*\(selectedBranchId\s*\|\|\s*''\)/);
      expect(PanelSrc).not.toMatch(/const\s*\[locationId,\s*setLocationId\]\s*=\s*useState/);
    });
    it('B1.3 the per-panel "สถานที่" dropdown is REMOVED', () => {
      expect(PanelSrc).not.toMatch(/สถานที่:/);
      expect(PanelSrc).not.toMatch(/value=\{locationId\}\s+onChange/); // the old <select>
    });
    it('B1.4 the auto-pick-branches[0] + userPickedLocation machinery is gone', () => {
      expect(PanelSrc).not.toMatch(/userPickedLocation/);
      expect(PanelSrc).not.toMatch(/setLocationId/);
    });
    it('B1.5 the live listener is still keyed on [locationId] (re-subscribes on branch switch)', () => {
      // Anchor on the USAGE call (not the import) → its useEffect deps array.
      expect(PanelSrc).toMatch(/listenToStockBatchesByBranch\(\{\s*branchId:\s*locationId\s*\}[\s\S]{0,400}\}\,\s*\[locationId\]\)/);
    });
    it('B1.6 central view UNTOUCHED — lockLocation still uses defaultLocationId', () => {
      // CentralStockTab pins via lockLocation + defaultLocationId.
      expect(CentralSrc).toMatch(/defaultLocationId=\{selectedWarehouseId\}/);
      expect(CentralSrc).toMatch(/lockLocation/);
    });
  });

  describe('B2 — sibling-consistency: the pattern we aligned to', () => {
    it('B2.1 StockAdjustPanel already follows ctxBranchId (no own location dropdown)', () => {
      expect(AdjustSrc).toMatch(/const\s*\{\s*branchId:\s*ctxBranchId/);
    });
  });
});

describe('V144 / AV173 — class-of-bug doc + invariant', () => {
  it('CB1 CentralStockTab deferred instance CLOSED (V144-followup 2026-07-07 — in-place modal, no bounce)', () => {
    // V144 pinned this as the KNOWN same-class deferred instance (central
    // balance buttons still setSubTab'd). V144-followup (2026-07-07) closed it
    // consciously: CentralStockActionModal hosts AdjustCreateForm (warehouse-
    // scoped via branchId=warehouseId) / the EXPORTED CentralOrderCreateForm
    // in-place. This test now locks the CLOSED state.
    expect(CentralSrc).toMatch(/handleCentralAdjustProduct\s*=\s*\(product\)\s*=>\s*setCentralAction\(\{\s*mode:\s*'adjust',\s*product\s*\}\)/);
    expect(CentralSrc).toMatch(/handleCentralAddStockForProduct\s*=\s*\(product\)\s*=>\s*setCentralAction\(\{\s*mode:\s*'order',\s*product\s*\}\)/);
    expect(CentralSrc).not.toMatch(/setSubTab\('adjust'\)/);
    expect(CentralSrc).not.toMatch(/setSubTab\('orders'\)/);
    // the central modal mirrors StockActionModal's AV78/AV205 shell
    const CentralModalSrc = read('src/components/backend/CentralStockActionModal.jsx');
    expect(CentralModalSrc).toMatch(/useModalScrollLock\(true\)/);
    expect(CentralModalSrc).toMatch(/data-testid="central-stock-action-modal"/);
    expect(CentralModalSrc).toMatch(/branchId=\{warehouseId\}/);            // adjust = warehouse-scoped
    expect(CentralModalSrc).toMatch(/centralWarehouseId=\{warehouseId\}/);  // order = central PO form
    // backdrop has NO onClick (AV78 explicit close only)
    expect(CentralModalSrc).not.toMatch(/inset-0[^>]*onClick/);
    // the central PO create form is now exported for the modal host
    const CentralOrderPanelSrc = read('src/components/backend/CentralStockOrderPanel.jsx');
    expect(CentralOrderPanelSrc).toMatch(/export function CentralOrderCreateForm\(/);
  });
  it('CB2 AV173 documented in audit skill', () => {
    expect(SkillSrc).toMatch(/### AV173 —/);
    expect(SkillSrc).toMatch(/StockActionModal/);
  });
});
