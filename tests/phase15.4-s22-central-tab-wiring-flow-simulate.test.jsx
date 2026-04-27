// ─── Phase 15.4 post-deploy s22 — Central tab wiring + Order detail UX ─────
// User reports (s22, after V15 #2 deploy):
//   1. "ระบบปรับ stock ของ tab คลังกลาง มันมั่ว มันไปดึง stock ของสาขามา"
//      → wire StockBalancePanel "ปรับ" button at central tab to navigate to
//        central-tier subTab='adjust' with prefillProduct
//   2. "ปุ่ม + ในหน้า ยอดคงเหลือ ของ tab คลังกลาง กดไม่ได้"
//      → wire StockBalancePanel "+" button to navigate to central subTab='orders'
//        with prefillProduct (Central PO create form pre-filled)
//   3. "ใน tab คลังกลาง การนำเข้าจาก Vendor ให้กดเข้าไปดูรายละเอียดได้ด้วย
//      และแสดงสินค้าคร่าวๆให้เห็นในรายการเลย"
//      → row-click → CentralOrderDetailModal + inline product summary
//   4. "ใน tab stock ก็เช่นกัน ตรงรายการ Orders นำเข้าสินค้า"
//      → inline product summary in OrderPanel rows
//
// Coverage:
//   S22.A — orderItemsSummary pure helper
//   S22.B — CentralStockTab wiring (state + handlers + props)
//   S22.C — CentralStockOrderPanel prefillProduct support
//   S22.D — CentralOrderDetailModal render contract (RTL)
//   S22.E — Inline product summary in OrderPanel + CentralStockOrderPanel
//   S22.F — V14 + V21 anti-regression

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { formatOrderItemsSummary } from '../src/lib/orderItemsSummary.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const centralTabSrc = read('src/components/backend/CentralStockTab.jsx');
const centralOrderPanelSrc = read('src/components/backend/CentralStockOrderPanel.jsx');
const centralDetailModalSrc = read('src/components/backend/CentralOrderDetailModal.jsx');
const orderPanelSrc = read('src/components/backend/OrderPanel.jsx');

vi.mock('../src/lib/backendClient.js', () => ({
  getCentralStockOrder: vi.fn(),
}));
import CentralOrderDetailModal from '../src/components/backend/CentralOrderDetailModal.jsx';
import { getCentralStockOrder } from '../src/lib/backendClient.js';

// ============================================================================
describe('Phase 15.4 S22.A — orderItemsSummary pure helper', () => {
  it('S22.A.1 — empty items returns empty string', () => {
    expect(formatOrderItemsSummary([])).toBe('');
    expect(formatOrderItemsSummary(null)).toBe('');
    expect(formatOrderItemsSummary(undefined)).toBe('');
  });

  it('S22.A.2 — single item: "Name xQty"', () => {
    expect(formatOrderItemsSummary([{ productName: 'Botox', qty: 10 }])).toBe('Botox x10');
  });

  it('S22.A.3 — two items: "A xN · B xM"', () => {
    expect(formatOrderItemsSummary([
      { productName: 'A', qty: 1 },
      { productName: 'B', qty: 2 },
    ])).toBe('A x1 · B x2');
  });

  it('S22.A.4 — three items: shows first 2 + "+1 รายการ"', () => {
    expect(formatOrderItemsSummary([
      { productName: 'A', qty: 1 },
      { productName: 'B', qty: 2 },
      { productName: 'C', qty: 3 },
    ])).toBe('A x1 · B x2 · +1 รายการ');
  });

  it('S22.A.5 — custom max (max=3 shows all 3)', () => {
    expect(formatOrderItemsSummary([
      { productName: 'A', qty: 1 },
      { productName: 'B', qty: 2 },
      { productName: 'C', qty: 3 },
    ], { max: 3 })).toBe('A x1 · B x2 · C x3');
  });

  it('S22.A.6 — falls back to productId when productName missing', () => {
    expect(formatOrderItemsSummary([{ productId: 'P-999', qty: 5 }])).toBe('P-999 x5');
  });

  it('S22.A.7 — qty=0 or invalid: shows name without qty suffix', () => {
    expect(formatOrderItemsSummary([{ productName: 'A', qty: 0 }])).toBe('A');
    expect(formatOrderItemsSummary([{ productName: 'A', qty: null }])).toBe('A');
    expect(formatOrderItemsSummary([{ productName: 'A' }])).toBe('A');
  });

  it('S22.A.8 — items with empty productName/productId are filtered out', () => {
    expect(formatOrderItemsSummary([
      { productName: 'A', qty: 1 },
      { productName: '', productId: '' },
      { productName: 'B', qty: 2 },
    ])).toBe('A x1 · B x2');
  });

  it('S22.A.9 — V14 lock: never returns undefined', () => {
    const inputs = [null, undefined, [], [{}], [null]];
    for (const inp of inputs) {
      const r = formatOrderItemsSummary(inp);
      expect(typeof r).toBe('string');
    }
  });
});

// ============================================================================
describe('Phase 15.4 S22.B — CentralStockTab wiring', () => {
  it('S22.B.1 — adjustPrefill + orderPrefill state hooks', () => {
    expect(centralTabSrc).toMatch(/const\s+\[adjustPrefill,\s*setAdjustPrefill\]\s*=\s*useState\(null\)/);
    expect(centralTabSrc).toMatch(/const\s+\[orderPrefill,\s*setOrderPrefill\]\s*=\s*useState\(null\)/);
  });

  it('S22.B.2 — handleCentralAdjustProduct navigates to "adjust" with prefill', () => {
    expect(centralTabSrc).toMatch(/handleCentralAdjustProduct[\s\S]{0,200}setAdjustPrefill\(product\)[\s\S]{0,100}setSubTab\(['"]adjust['"]\)/);
  });

  it('S22.B.3 — handleCentralAddStockForProduct navigates to "orders" with prefill', () => {
    expect(centralTabSrc).toMatch(/handleCentralAddStockForProduct[\s\S]{0,200}setOrderPrefill\(product\)[\s\S]{0,100}setSubTab\(['"]orders['"]\)/);
  });

  it('S22.B.4 — StockBalancePanel receives onAdjustProduct + onAddStockForProduct', () => {
    expect(centralTabSrc).toMatch(/<StockBalancePanel[\s\S]{0,400}onAdjustProduct=\{handleCentralAdjustProduct\}/);
    expect(centralTabSrc).toMatch(/<StockBalancePanel[\s\S]{0,400}onAddStockForProduct=\{handleCentralAddStockForProduct\}/);
  });

  it('S22.B.5 — StockAdjustPanel receives prefillProduct + onPrefillConsumed', () => {
    expect(centralTabSrc).toMatch(/<StockAdjustPanel[\s\S]{0,400}prefillProduct=\{adjustPrefill\}/);
    expect(centralTabSrc).toMatch(/<StockAdjustPanel[\s\S]{0,400}onPrefillConsumed=\{[^}]*setAdjustPrefill\(null\)/);
  });

  it('S22.B.6 — CentralStockOrderPanel receives prefillProduct + onPrefillConsumed', () => {
    expect(centralTabSrc).toMatch(/<CentralStockOrderPanel[\s\S]{0,400}prefillProduct=\{orderPrefill\}/);
    expect(centralTabSrc).toMatch(/<CentralStockOrderPanel[\s\S]{0,400}onPrefillConsumed=\{[^}]*setOrderPrefill\(null\)/);
  });

  it('S22.B.7 — branchIdOverride still passed (preserve previous architecture)', () => {
    expect(centralTabSrc).toMatch(/<StockAdjustPanel[\s\S]{0,400}branchIdOverride=\{selectedWarehouseId\}/);
  });
});

// ============================================================================
describe('Phase 15.4 S22.C — CentralStockOrderPanel prefillProduct', () => {
  it('S22.C.1 — accepts prefillProduct + onPrefillConsumed props', () => {
    expect(centralOrderPanelSrc).toMatch(/function CentralStockOrderPanel\(\{[^}]*prefillProduct/);
    expect(centralOrderPanelSrc).toMatch(/function CentralStockOrderPanel\(\{[^}]*onPrefillConsumed/);
  });

  it('S22.C.2 — pendingPrefill state hook', () => {
    expect(centralOrderPanelSrc).toMatch(/const\s+\[pendingPrefill,\s*setPendingPrefill\]\s*=\s*useState\(null\)/);
  });

  it('S22.C.3 — useEffect auto-opens form when prefillProduct provided', () => {
    expect(centralOrderPanelSrc).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]{0,200}if\s*\(prefillProduct\)[\s\S]{0,200}openCreate\(prefillProduct\)/);
    expect(centralOrderPanelSrc).toMatch(/onPrefillConsumed\?\.\(\)/);
  });

  it('S22.C.4 — openCreate accepts prefill arg', () => {
    expect(centralOrderPanelSrc).toMatch(/const\s+openCreate\s*=\s*\(prefill\s*=\s*null\)\s*=>/);
    expect(centralOrderPanelSrc).toMatch(/setPendingPrefill\(prefill\)/);
  });

  it('S22.C.5 — CentralOrderCreateForm accepts prefillProduct + uses items[0] init', () => {
    expect(centralOrderPanelSrc).toMatch(/function CentralOrderCreateForm\(\{[^}]*prefillProduct/);
    expect(centralOrderPanelSrc).toMatch(/if\s*\(prefillProduct\)[\s\S]{0,400}base\.items\s*=\s*\[\s*\{/);
  });

  it('S22.C.6 — onClose + onSaved clear pendingPrefill', () => {
    expect(centralOrderPanelSrc).toMatch(/setFormOpen\(false\);\s*setPendingPrefill\(null\)/);
  });
});

// ============================================================================
describe('Phase 15.4 S22.D — CentralOrderDetailModal RTL', () => {
  beforeEach(() => vi.clearAllMocks());

  it('S22.D.1 — modal exists + 6 standard data-testids', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/components/backend/CentralOrderDetailModal.jsx'))).toBe(true);
    const ids = [
      'central-order-detail-modal',
      'central-detail-order-id',
      'central-detail-status',
      'central-detail-date',
      'central-detail-vendor',
      'central-detail-warehouse',
      'central-detail-actor',
      'central-detail-net-total',
      'central-detail-close',
    ];
    for (const id of ids) {
      expect(centralDetailModalSrc).toContain(`data-testid="${id}"`);
    }
  });

  it('S22.D.2 — renders all key fields when data loads', async () => {
    getCentralStockOrder.mockResolvedValue({
      orderId: 'CPO-test-1',
      status: 'pending',
      vendorName: 'Acme Vendor',
      vendorId: 'V1',
      centralWarehouseId: 'WH-Main',
      importedDate: '2026-04-28',
      createdAt: '2026-04-28T10:00:00.000+07:00',
      user: { userId: 'u1', userName: 'Admin Foo' },
      items: [
        { productName: 'Botox 100u', qty: 10, cost: 250, unit: 'ขวด', expiresAt: '2027-01-01' },
        { productName: 'Filler 1ml', qty: 5, cost: 1500, unit: 'amp' },
      ],
      discount: 0,
      discountType: 'amount',
    });
    render(<CentralOrderDetailModal orderId="CPO-test-1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('central-detail-vendor')).toBeTruthy());
    expect(screen.getByTestId('central-detail-order-id').textContent).toContain('CPO-test-1');
    expect(screen.getByTestId('central-detail-vendor').textContent).toContain('Acme Vendor');
    expect(screen.getByTestId('central-detail-warehouse').textContent).toContain('WH-Main');
    expect(screen.getByTestId('central-detail-actor').textContent).toContain('Admin Foo');
    expect(screen.getByTestId('central-detail-status').textContent).toContain('รอรับ');
    // Net total: 10*250 + 5*1500 = 2500 + 7500 = 10,000
    expect(screen.getByTestId('central-detail-net-total').textContent.replace(/,/g, '')).toContain('10000');
    // Items rendered
    expect(screen.getByTestId('central-detail-item-0').textContent).toContain('Botox');
    expect(screen.getByTestId('central-detail-item-1').textContent).toContain('Filler');
  });

  it('S22.D.3 — error state when order not found', async () => {
    getCentralStockOrder.mockResolvedValue(null);
    render(<CentralOrderDetailModal orderId="missing" onClose={() => {}} />);
    await waitFor(() => expect(screen.queryByText(/not found|โหลด/)).toBeTruthy());
  });

  it('S22.D.4 — onClose fires on close button click', async () => {
    getCentralStockOrder.mockResolvedValue({
      orderId: 'X', status: 'pending', vendorName: 'V', centralWarehouseId: 'WH',
      items: [], user: { userName: 'U' }, createdAt: '2026-04-28T00:00:00Z',
    });
    const onClose = vi.fn();
    render(<CentralOrderDetailModal orderId="X" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('central-detail-close')).toBeTruthy());
    fireEvent.click(screen.getByTestId('central-detail-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('S22.D.5 — V14 backward compat: missing fields render gracefully', async () => {
    getCentralStockOrder.mockResolvedValue({
      orderId: 'Y', status: 'pending',
      // No vendorName, vendorId, centralWarehouseId, user, items
      createdAt: '2026-04-28T00:00:00Z',
    });
    render(<CentralOrderDetailModal orderId="Y" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('central-detail-actor')).toBeTruthy());
    expect(screen.getByTestId('central-detail-actor').textContent).toBe('-');
    expect(screen.getByTestId('central-detail-vendor').textContent).toBe('-');
  });
});

// ============================================================================
describe('Phase 15.4 S22.E — inline product summary in both Order panels', () => {
  it('S22.E.1 — OrderPanel imports formatOrderItemsSummary', () => {
    expect(orderPanelSrc).toMatch(/import\s*\{\s*formatOrderItemsSummary\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/orderItemsSummary\.js['"]/);
  });

  it('S22.E.2 — OrderPanel renders order-items-summary span when summary non-empty', () => {
    expect(orderPanelSrc).toMatch(/data-testid="order-items-summary"/);
    expect(orderPanelSrc).toMatch(/itemsSummary\s*=\s*formatOrderItemsSummary/);
  });

  it('S22.E.3 — CentralStockOrderPanel imports formatOrderItemsSummary', () => {
    expect(centralOrderPanelSrc).toMatch(/import\s*\{\s*formatOrderItemsSummary\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/orderItemsSummary\.js['"]/);
  });

  it('S22.E.4 — CentralStockOrderPanel renders cpo-items-summary span', () => {
    expect(centralOrderPanelSrc).toMatch(/data-testid="cpo-items-summary"/);
    expect(centralOrderPanelSrc).toMatch(/itemsSummary\s*=\s*formatOrderItemsSummary/);
  });

  it('S22.E.5 — CentralStockOrderPanel rows are clickable + open detail modal', () => {
    expect(centralOrderPanelSrc).toMatch(/onClick=\{\(\)\s*=>\s*setDetailOrderId\(o\.orderId\)\}/);
    expect(centralOrderPanelSrc).toMatch(/cursor-pointer/);
    expect(centralOrderPanelSrc).toMatch(/data-testid="cpo-row"/);
  });

  it('S22.E.6 — CentralStockOrderPanel has separate "ดู" button with stopPropagation parent', () => {
    expect(centralOrderPanelSrc).toMatch(/data-testid="cpo-detail-btn"/);
    expect(centralOrderPanelSrc).toMatch(/onClick=\{e\s*=>\s*e\.stopPropagation\(\)\}/);
  });

  it('S22.E.7 — CentralStockOrderPanel renders <CentralOrderDetailModal/> conditionally on detailOrderId', () => {
    expect(centralOrderPanelSrc).toMatch(/import\s+CentralOrderDetailModal/);
    expect(centralOrderPanelSrc).toMatch(/\{detailOrderId\s*&&\s*\(\s*<CentralOrderDetailModal/);
  });
});

// ============================================================================
describe('Phase 15.4 S22.F — V14 + V21 anti-regression', () => {
  it('S22.F.1 — V14 lock: orderItemsSummary returns string never undefined', () => {
    const helperSrc = read('src/lib/orderItemsSummary.js');
    expect(helperSrc).toMatch(/return\s*['"]['"]/);
    expect(helperSrc).not.toMatch(/return\s+undefined/);
  });

  it('S22.F.2 — V21 lock: StockBalancePanel "ปรับ" + "+" buttons still use optional-chain (preserves no-op safety)', () => {
    const balanceSrc = read('src/components/backend/StockBalancePanel.jsx');
    expect(balanceSrc).toMatch(/onAdjustProduct\?\.\(p\)/);
    expect(balanceSrc).toMatch(/onAddStockForProduct\?\.\(p\)/);
  });

  it('S22.F.3 — central-tier branchIdOverride preserved (bug 4 fix from s20 not regressed)', () => {
    expect(centralTabSrc).toMatch(/branchIdOverride=\{selectedWarehouseId\}/);
  });

  it('S22.F.4 — CentralOrderDetailModal does NOT mutate (read-only contract)', () => {
    // Verify no updateDoc / setDoc / runTransaction calls inside the modal
    expect(centralDetailModalSrc).not.toMatch(/updateDoc|setDoc|runTransaction|deleteDoc/);
  });

  it('S22.F.5 — Phase 15.4 markers in all touched files (institutional memory)', () => {
    expect(centralTabSrc).toMatch(/Phase 15\.4 post-deploy s22/);
    expect(centralOrderPanelSrc).toMatch(/Phase 15\.4 post-deploy s22/);
    expect(centralDetailModalSrc).toMatch(/Phase 15\.4 post-deploy s22/);
    expect(orderPanelSrc).toMatch(/Phase 15\.4 post-deploy s22/);
  });
});
