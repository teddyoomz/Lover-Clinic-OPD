// ─── StockTab — container for all stock sub-panels ──────────────────────────
// Sub-tabs: Balance (ยอดคงเหลือ) / Orders (นำเข้า) / Adjust (ปรับสต็อก) / Movement Log

import { useState, useCallback } from 'react';
import { Package, ShoppingBag, SlidersHorizontal, Activity, Truck, ClipboardCheck, Warehouse } from 'lucide-react';
import { getProduct } from '../../lib/scopedDataLayer.js';
import OrderPanel from './OrderPanel.jsx';
import StockAdjustPanel from './StockAdjustPanel.jsx';
import MovementLogPanel from './MovementLogPanel.jsx';
import StockBalancePanel from './StockBalancePanel.jsx';
import StockTransferPanel from './StockTransferPanel.jsx';
import StockWithdrawalPanel from './StockWithdrawalPanel.jsx';
import CentralWarehousePanel from './CentralWarehousePanel.jsx';
import ProductFormModal from './ProductFormModal.jsx';
import StockActionModal from './StockActionModal.jsx';

const SUB_TABS = [
  { id: 'balance', label: 'ยอดคงเหลือ', icon: <Package size={14} /> },
  { id: 'orders', label: 'นำเข้า', icon: <ShoppingBag size={14} /> },
  { id: 'adjust', label: 'ปรับสต็อก', icon: <SlidersHorizontal size={14} /> },
  { id: 'transfer', label: 'โอนย้าย', icon: <Truck size={14} /> },
  { id: 'withdrawal', label: 'เบิก', icon: <ClipboardCheck size={14} /> },
  { id: 'warehouses', label: 'คลังกลาง', icon: <Warehouse size={14} /> },
  { id: 'log', label: 'Movement Log', icon: <Activity size={14} /> },
];

export default function StockTab({ clinicSettings, theme, initialSubTab }) {
  const [subTab, setSubTab] = useState(initialSubTab || 'balance');
  // V144 (2026-06-02) — a Balance row ปรับ/เพิ่ม click opens an in-place MODAL
  // (no navigation to the ปรับสต็อก/นำเข้า sub-tab → no "bounce"; after save you
  // stay on ยอดคงเหลือ + the V143-ter live listener refreshes the row).
  // { mode: 'adjust' | 'order', product }.
  const [stockAction, setStockAction] = useState(null);
  // V43-followup (2026-05-19 NIGHT+5 EOD+1) — own the ProductFormModal state
  // for the [✎ แก้ไข] button in StockBalancePanel Actions column. When admin
  // toggles skipStockDeduction + saves, the BS-18 listener in
  // StockBalancePanel will live-update; the row disappears instantly.
  const [editingProduct, setEditingProduct] = useState(null);

  const handleAdjustProduct = (product) => setStockAction({ mode: 'adjust', product });
  const handleAddStockForProduct = (product) => setStockAction({ mode: 'order', product });

  // V145 (2026-06-02, AV175) — open ProductFormModal with the COMPLETE be_products
  // doc. StockBalancePanel passes the full live doc; this guard refuses to open a
  // partial object (only {productId}, e.g. if the live map hadn't loaded) — it
  // fetches the full doc first. A partial object would default + corrupt the
  // product on save (setDoc merge:false), so we NEVER feed one to the modal.
  const handleEditProduct = useCallback(async (obj) => {
    if (obj && obj.productType) { setEditingProduct(obj); return; }
    const id = obj?.productId || obj?.id;
    if (!id) return;
    try {
      const full = await getProduct(id);
      if (full) setEditingProduct(full);
    } catch (e) {
      console.error('[StockTab] getProduct fallback failed:', e);
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="bg-[var(--bg-surface)] rounded-xl p-1.5 shadow border border-[var(--bd)] flex gap-1 overflow-x-auto">
        {SUB_TABS.map(t => {
          const active = subTab === t.id;
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                active
                  ? 'bg-rose-700 text-white shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                  : 'text-[var(--tx-muted)] hover:text-rose-400 hover:bg-[var(--bg-hover)]'
              }`}>
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {subTab === 'balance' && (
        <StockBalancePanel
          clinicSettings={clinicSettings} theme={theme}
          onAdjustProduct={handleAdjustProduct}
          onAddStockForProduct={handleAddStockForProduct}
          onEditProduct={handleEditProduct}
        />
      )}
      {subTab === 'orders' && (
        <OrderPanel clinicSettings={clinicSettings} theme={theme} />
      )}
      {subTab === 'adjust' && (
        <StockAdjustPanel clinicSettings={clinicSettings} theme={theme} />
      )}
      {subTab === 'transfer' && <StockTransferPanel clinicSettings={clinicSettings} theme={theme} />}
      {subTab === 'withdrawal' && <StockWithdrawalPanel clinicSettings={clinicSettings} theme={theme} />}
      {subTab === 'warehouses' && <CentralWarehousePanel clinicSettings={clinicSettings} theme={theme} />}
      {subTab === 'log' && <MovementLogPanel clinicSettings={clinicSettings} theme={theme} />}

      {editingProduct && (
        <ProductFormModal
          product={editingProduct}
          clinicSettings={clinicSettings}
          onClose={() => setEditingProduct(null)}
          onSaved={() => setEditingProduct(null)}
        />
      )}

      {/* V144 — in-place adjust/order modal (ปรับ/เพิ่ม from the Balance row).
          After save → close → the V143-ter live listener refreshes the row. */}
      {stockAction && (
        <StockActionModal
          mode={stockAction.mode}
          product={stockAction.product}
          theme={theme}
          onClose={() => setStockAction(null)}
          onSaved={() => setStockAction(null)}
        />
      )}
    </div>
  );
}
