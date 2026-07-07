// ─── CentralStockActionModal — in-place adjust/order modal (CENTRAL tier) ────
// V144-followup (2026-07-07). Closes the KNOWN same-class deferred instance
// from V144/AV173: the central Balance rows' ปรับ/+ buttons previously
// setSubTab('adjust'/'orders') — the "bounce" the user asked V144 to kill on
// the branch StockTab. This mirrors StockActionModal but WAREHOUSE-scoped:
//   - mode 'adjust' → AdjustCreateForm with branchId = the central warehouse id
//     (same semantics as StockAdjustPanel's branchIdOverride at the central tab)
//   - mode 'order'  → CentralOrderCreateForm (Vendor PO into the central
//     warehouse — a DIFFERENT form from the branch OrderCreateForm)
// After save → onSaved closes → the BS-18 live listener in StockBalancePanel
// refreshes the row (+ V144 real-time lot-clear), same as the branch modal.
//
// AV78: backdrop click does NOT close (explicit close only — the form's own
// "กลับ" button + save). z-[60] + bg-black/70 match StockActionModal.
import { useState, useEffect } from 'react';
import { listProducts, listAllSellers, listVendors, listProductUnitGroups } from '../../lib/scopedDataLayer.js';
import { AdjustCreateForm } from './StockAdjustPanel.jsx';
import { CentralOrderCreateForm } from './CentralStockOrderPanel.jsx';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

export default function CentralStockActionModal({ mode, product, warehouseId, theme, onClose, onSaved }) {
  useModalScrollLock(true); // AV205 — renders only while open
  const isDark = theme === 'dark';
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [sellers, setSellers] = useState([]);
  const [sellersLoading, setSellersLoading] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [unitGroups, setUnitGroups] = useState([]);
  const [mastersLoading, setMastersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await listProducts();
        if (!cancelled) setProducts(Array.isArray(d) ? d : []);
      } catch (e) {
        if (!cancelled) { console.error('[CentralStockActionModal] listProducts failed:', e); setProducts([]); }
      } finally { if (!cancelled) setProductsLoading(false); }
    })();
    (async () => {
      try {
        // Phase 15.5A convention — sellers filtered by the central warehouse id;
        // legacy staff with empty branchIds[] still visible (fallback in lister).
        const s = await listAllSellers({ branchId: warehouseId });
        if (!cancelled) setSellers(Array.isArray(s) ? s : []);
      } catch (e) {
        if (!cancelled) { console.error('[CentralStockActionModal] listAllSellers failed:', e); setSellers([]); }
      } finally { if (!cancelled) setSellersLoading(false); }
    })();
    (async () => {
      // Central PO masters (vendors + unit groups) — only the 'order' form
      // consumes these; loading them unconditionally keeps the effect simple
      // and the lists are tiny.
      try {
        const [v, ug] = await Promise.all([
          listVendors({ activeOnly: true }),
          listProductUnitGroups().catch(() => []),
        ]);
        if (!cancelled) {
          setVendors(Array.isArray(v) ? v : []);
          setUnitGroups(Array.isArray(ug) ? ug : []);
        }
      } catch (e) {
        if (!cancelled) { console.error('[CentralStockActionModal] masters load failed:', e); }
      } finally { if (!cancelled) setMastersLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [warehouseId]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm overflow-y-auto overscroll-contain flex items-start justify-center p-4 py-8"
      data-testid="central-stock-action-modal"
      data-mode={mode}
    >
      {/* AV78 — backdrop has NO onClick: explicit close only (the form's กลับ + save). */}
      <div className="w-full max-w-4xl">
        {mode === 'order' ? (
          <CentralOrderCreateForm
            centralWarehouseId={warehouseId}
            vendors={vendors}
            products={products}
            unitGroups={unitGroups}
            mastersLoading={mastersLoading || productsLoading}
            sellers={sellers}
            sellersLoading={sellersLoading}
            prefillProduct={product}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : (
          <AdjustCreateForm
            isDark={isDark}
            products={products}
            productsLoading={productsLoading}
            prefillProduct={product}
            branchId={warehouseId}
            sellers={sellers}
            sellersLoading={sellersLoading}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}
