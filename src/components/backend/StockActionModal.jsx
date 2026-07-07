// ─── StockActionModal — in-place adjust/order create-form modal ─────────────
// V144 (2026-06-02). User: "เวลากดปุ่มปรับสต็อค/เพิ่มในหน้ายอดคงเหลือ มันเด้งไป
// หน้าปรับสต็อค/นำเข้า ไม่สะดวก ... อยากให้กดแล้วบันทึกเสร็จยังอยู่ที่เดิม". The
// ปรับ + เพิ่ม buttons in StockBalancePanel previously navigated to the
// ปรับสต็อก / นำเข้า sub-tabs (the "bounce"). Now they open the SAME create
// forms (AdjustCreateForm / OrderCreateForm — identical prop signatures) as an
// in-place MODAL on the balance page. After save → onSaved closes → the
// V143-ter live listener in StockBalancePanel refreshes the row (+ V144
// real-time lot-clear). Mirrors the ProductFormModal in-place pattern already
// used by the ✎ แก้ไข button.
//
// AV78: backdrop click does NOT close (explicit close only — the form's own
// "กลับ" button + save). z-[60] + bg-black/70 match MarketingFormShell.
import { useState, useEffect } from 'react';
import { listProducts, listAllSellers } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { AdjustCreateForm } from './StockAdjustPanel.jsx';
import { OrderCreateForm } from './OrderPanel.jsx';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

export default function StockActionModal({ mode, product, theme, onClose, onSaved }) {
  useModalScrollLock(true); // AV205 — renders only while open
  const isDark = theme === 'dark';
  const { branchId } = useSelectedBranch();
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [sellers, setSellers] = useState([]);
  const [sellersLoading, setSellersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await listProducts();
        if (!cancelled) setProducts(Array.isArray(d) ? d : []);
      } catch (e) {
        if (!cancelled) { console.error('[StockActionModal] listProducts failed:', e); setProducts([]); }
      } finally { if (!cancelled) setProductsLoading(false); }
    })();
    (async () => {
      try {
        const s = await listAllSellers({ branchId });
        if (!cancelled) setSellers(Array.isArray(s) ? s : []);
      } catch (e) {
        if (!cancelled) { console.error('[StockActionModal] listAllSellers failed:', e); setSellers([]); }
      } finally { if (!cancelled) setSellersLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [branchId]);

  const Form = mode === 'order' ? OrderCreateForm : AdjustCreateForm;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm overflow-y-auto overscroll-contain flex items-start justify-center p-4 py-8"
      data-testid="stock-action-modal"
      data-mode={mode}
    >
      {/* AV78 — backdrop has NO onClick: explicit close only (the form's กลับ + save). */}
      <div className="w-full max-w-4xl">
        <Form
          isDark={isDark}
          products={products}
          productsLoading={productsLoading}
          prefillProduct={product}
          branchId={branchId}
          sellers={sellers}
          sellersLoading={sellersLoading}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
