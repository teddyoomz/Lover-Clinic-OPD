// tests/v145-stock-product-edit-rtl.test.jsx
// V145 (2026-06-02, AV175) — StockBalancePanel RTL bank: new columns
// (หมวดหมู่ + ประเภท, no ความจุ/มูลค่าทุน), unit live-resolved from be_products
// (not the frozen batch unit), แก้ไข passes the FULL product doc, and a listener
// re-fire updates the row in real time (simulating an edit from any tab/device).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

let productsCb, batchesCb;
const hb = vi.hoisted(() => ({ branchId: 'BR-T' })); // mutable so we can simulate a branch switch
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToProducts: vi.fn((opts, cb) => { productsCb = cb; return () => {}; }),
  listenToStockBatchesByBranch: vi.fn((opts, cb) => { batchesCb = cb; return () => {}; }),
  listStockLocations: vi.fn(() => Promise.resolve([{ id: 'BR-T', name: 'นครราชสีมา', kind: 'branch' }])),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: hb.branchId }) }));

import StockBalancePanel from '../src/components/backend/StockBalancePanel.jsx';
import { listenToProducts } from '../src/lib/scopedDataLayer.js';

const PRODUCT = {
  id: 'P1', productId: 'P1', productName: 'เนื้อเยื่อเทียม Matigen 5*7*0.4 cm',
  mainUnitName: 'ชิ้น', categoryName: 'อุปกรณ์', productType: 'สินค้าสิ้นเปลือง',
  price: 1200, skipStockDeduction: false, alertQtyBeforeMaxStock: null,
};
// the batch carries the OLD/frozen unit ('ครั้ง') — the table must NOT use it.
const BATCH = {
  batchId: 'B1', productId: 'P1', productName: 'Matigen-batch-name', unit: 'ครั้ง',
  status: 'active', qty: { remaining: 3, total: 3 }, originalCost: 100, expiresAt: null,
};

function mountWith({ products = [PRODUCT], batches = [BATCH], onEditProduct } = {}) {
  const r = render(
    <StockBalancePanel onEditProduct={onEditProduct} onAdjustProduct={() => {}} onAddStockForProduct={() => {}} />
  );
  act(() => { productsCb(products); batchesCb(batches); });
  return r;
}

describe('V145.B StockBalancePanel — columns + live fields + edit', () => {
  beforeEach(() => { productsCb = batchesCb = undefined; });

  it('B1 table has หมวดหมู่ + ประเภท columns; NO ความจุ / มูลค่าทุน columns', () => {
    mountWith();
    expect(screen.getByTestId('th-category')).toBeInTheDocument();
    expect(screen.getByTestId('th-type')).toBeInTheDocument();
    expect(screen.queryByTestId('th-capacity')).toBeNull();
    // no per-row cost column
    expect(document.body.textContent).not.toContain('มูลค่าทุน');
  });

  it('B2 unit is LIVE from be_products (ชิ้น), NOT the frozen batch unit (ครั้ง)', () => {
    mountWith();
    const total = screen.getByTestId('balance-row-total');
    expect(total).toHaveTextContent('ชิ้น');
    expect(total).not.toHaveTextContent('ครั้ง');
  });

  it('B3 แก้ไข passes the FULL product doc (has productType), not the aggregated row', () => {
    const onEdit = vi.fn();
    mountWith({ onEditProduct: onEdit });
    fireEvent.click(screen.getByTestId('stock-balance-edit-P1'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({
      productId: 'P1', productType: 'สินค้าสิ้นเปลือง', categoryName: 'อุปกรณ์', mainUnitName: 'ชิ้น',
    }));
  });

  it('B4 หมวดหมู่ + ประเภท cells render the live values', () => {
    mountWith();
    expect(screen.getByTestId('td-category')).toHaveTextContent('อุปกรณ์');
    expect(screen.getByTestId('td-type')).toHaveTextContent('สินค้าสิ้นเปลือง');
  });

  it('B5 product missing from live map → แก้ไข passes {productId} only (StockTab then fetches)', () => {
    const onEdit = vi.fn();
    mountWith({ products: [], onEditProduct: onEdit }); // batch present, product not in map
    fireEvent.click(screen.getByTestId('stock-balance-edit-P1'));
    expect(onEdit).toHaveBeenCalledWith({ productId: 'P1' });
    expect(onEdit.mock.calls[0][0].productType).toBeUndefined();
  });
});

describe('V145.F real-time — listener re-fire updates the row (edit from any tab/device)', () => {
  beforeEach(() => { productsCb = batchesCb = undefined; });

  it('F1 changing be_products unit/category via listener re-fire updates the row instantly', () => {
    // start with unit ครั้ง / category อุปกรณ์
    mountWith({ products: [{ ...PRODUCT, mainUnitName: 'ครั้ง', categoryName: 'อุปกรณ์' }] });
    expect(screen.getByTestId('balance-row-total')).toHaveTextContent('ครั้ง');
    expect(screen.getByTestId('td-category')).toHaveTextContent('อุปกรณ์');

    // simulate an edit elsewhere: the live listener re-fires with new values
    act(() => { productsCb([{ ...PRODUCT, mainUnitName: 'ชิ้น', categoryName: 'วัสดุการแพทย์', productType: 'ยา' }]); });

    expect(screen.getByTestId('balance-row-total')).toHaveTextContent('ชิ้น');
    expect(screen.getByTestId('balance-row-total')).not.toHaveTextContent('ครั้ง');
    expect(screen.getByTestId('td-category')).toHaveTextContent('วัสดุการแพทย์');
    expect(screen.getByTestId('td-type')).toHaveTextContent('ยา');
  });

  it('F2 products listener RE-SUBSCRIBES on branch switch (BS-9 — was the live "-" bug)', async () => {
    hb.branchId = 'BR-T';
    listenToProducts.mockClear();
    const { rerender } = render(<StockBalancePanel onEditProduct={() => {}} onAdjustProduct={() => {}} onAddStockForProduct={() => {}} />);
    expect(listenToProducts).toHaveBeenCalledTimes(1); // initial subscribe

    // simulate switching the top BranchSelector to another branch
    await act(async () => { hb.branchId = 'BR-OTHER'; rerender(<StockBalancePanel onEditProduct={() => {}} onAdjustProduct={() => {}} onAddStockForProduct={() => {}} />); });
    expect(listenToProducts).toHaveBeenCalledTimes(2); // re-subscribed for the new branch (deps:[selectedBranchId])
    hb.branchId = 'BR-T'; // restore for other tests
  });
});
