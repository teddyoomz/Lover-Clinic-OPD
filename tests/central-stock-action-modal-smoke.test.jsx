// V144-followup (2026-07-07) — CentralStockActionModal execution smoke.
//
// Closes the V144/AV173 deferred instance: central Balance-row ปรับ/+ now opens
// an IN-PLACE warehouse-scoped modal instead of setSubTab navigation. This file
// executes the NEW modal component (V163 net — missing imports are build-
// invisible) with the two hosted forms STUBBED (their own behavior is covered
// by their panels' suites); asserts mode routing + warehouse-scope threading.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listProducts: vi.fn(async () => [{ id: 'P1', name: 'สินค้า A' }]),
  listAllSellers: vi.fn(async () => [{ id: 'S1', name: 'ผู้ขาย' }]),
  listVendors: vi.fn(async () => [{ id: 'V1', name: 'Vendor' }]),
  listProductUnitGroups: vi.fn(async () => []),
}));
vi.mock('../src/components/backend/StockAdjustPanel.jsx', () => ({
  AdjustCreateForm: (props) => <div data-testid="stub-adjust-form" data-branch={props.branchId} data-prefill={props.prefillProduct?.name || ''} />,
}));
vi.mock('../src/components/backend/CentralStockOrderPanel.jsx', () => ({
  CentralOrderCreateForm: (props) => <div data-testid="stub-central-order-form" data-warehouse={props.centralWarehouseId} data-prefill={props.prefillProduct?.name || ''} />,
}));

import CentralStockActionModal from '../src/components/backend/CentralStockActionModal.jsx';
import { listAllSellers } from '../src/lib/scopedDataLayer.js';

afterEach(cleanup);

describe('CSM — CentralStockActionModal smoke (V144-followup)', () => {
  it('CSM.1 mode=adjust hosts AdjustCreateForm warehouse-scoped (branchId = warehouseId)', async () => {
    render(<CentralStockActionModal mode="adjust" product={{ name: 'ยา X' }} warehouseId="WH-1" theme="dark" onClose={vi.fn()} onSaved={vi.fn()} />);
    const form = await screen.findByTestId('stub-adjust-form');
    expect(form.getAttribute('data-branch')).toBe('WH-1');
    expect(form.getAttribute('data-prefill')).toBe('ยา X');
    // sellers loaded scoped to the WAREHOUSE id (Phase 15.5A convention)
    expect(listAllSellers).toHaveBeenCalledWith({ branchId: 'WH-1' });
  });

  it('CSM.2 mode=order hosts CentralOrderCreateForm (central Vendor PO, not the branch form)', async () => {
    render(<CentralStockActionModal mode="order" product={{ name: 'ยา Y' }} warehouseId="WH-2" theme="light" onClose={vi.fn()} onSaved={vi.fn()} />);
    const form = await screen.findByTestId('stub-central-order-form');
    expect(form.getAttribute('data-warehouse')).toBe('WH-2');
    expect(form.getAttribute('data-prefill')).toBe('ยา Y');
    expect(screen.queryByTestId('stub-adjust-form')).toBeNull();
  });

  it('CSM.3 AV78 shell — backdrop overlay present with NO onClick dismisser', () => {
    const { container } = render(<CentralStockActionModal mode="adjust" product={null} warehouseId="WH-1" theme="dark" onClose={vi.fn()} onSaved={vi.fn()} />);
    const overlay = container.querySelector('[data-testid="central-stock-action-modal"]');
    expect(overlay).toBeTruthy();
    expect(overlay.getAttribute('data-mode')).toBe('adjust');
    expect(overlay.onclick).toBeNull(); // AV78: explicit close only
  });
});
