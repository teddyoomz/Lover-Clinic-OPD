// ─── OrderPanel — vendor orders (ProClinic /admin/order parity) ─────────────
// Phase 8d: create vendor imports → seeds be_stock_batches via backendClient.
// First time a product is ordered here, its master stockConfig auto-opts-in
// to stock tracking (trackStock=true). Future sales will deduct from these batches.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, Plus, Trash2, X, Loader2, AlertCircle, CheckCircle2,
  ShoppingBag, ArrowLeft, Search, Filter,
} from 'lucide-react';
import {
  listStockOrders, createStockOrder, cancelStockOrder,
  // Phase 14.10-tris (2026-04-26) — be_products canonical
  listProducts,
  // 2026-04-27 fix — load unit groups for smart unit dropdown in create form
  listProductUnitGroups,
  // 2026-04-27 actor tracking — staff + doctors picker for "ผู้ทำรายการ"
  listAllSellers,
} from '../../lib/scopedDataLayer.js';
import ActorPicker, { resolveActorUser } from './ActorPicker.jsx';
import ActorConfirmModal from './ActorConfirmModal.jsx';
// Phase 15.4 (2026-04-28) — shared smart-unit-dropdown (Rule C1 Rule-of-3).
// Was inlined here; extracted so Adjust/Transfer/Withdrawal/CentralPO can reuse.
import UnitField from './UnitField.jsx';
// Phase 15.6 / V35 (2026-04-28) — shared searchable product picker (Rule C1).
// Replaces inline <select>{products.map(...)} blocks.
import ProductSelectField from './ProductSelectField.jsx';
// Phase 15.4 (2026-04-28) — shared 20/page pager (item 1 of s19 user EOD).
import Pagination from './Pagination.jsx';
import { usePagination } from '../../lib/usePagination.js';
// Phase 15.4 post-deploy s22 (2026-04-28) — inline product summary in row.
import { formatOrderItemsSummary } from '../../lib/orderItemsSummary.js';
import { auth } from '../../firebase.js';
import { thaiTodayISO } from '../../utils.js';
import { fmtMoney } from '../../lib/financeUtils.js';
import { fmtSlashDateTime } from '../../lib/dateFormat.js';

// S12: pull the logged-in admin's identity so every stock mutation leaves a
// real actor on the movement log (MOPH audit).
function currentAuditUser() {
  const u = auth.currentUser;
  return {
    userId: u?.uid || '',
    userName: u?.email?.split('@')[0] || u?.displayName || '',
  };
}
import DateField from '../DateField.jsx';
// V35.2-quater (2026-04-28) — StockSeedPanel button removed per user
// directive "เอาปุ่ม นำเข้าจากข้อมูลพื้นฐานออกไป". Component file kept
// (still exists in repo) but not imported here. Re-add the import + state
// + button if the bulk-seed flow is needed again.
import OrderDetailModal from './OrderDetailModal.jsx';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { productDisplayName } from '../../lib/productValidation.js';

// fmtMoney — imported from financeUtils (Rule of 3: was duplicated across 3 files).
const fmtDate = (iso) => fmtSlashDateTime(iso, { withTime: false });

// Phase 15.4 (2026-04-28) — extracted to src/lib/unitFieldHelpers.js
// (Rule C1 Rule-of-3). Imported here for LOCAL use inside OrderCreateForm
// AND re-exported for backward compat with existing tests + callers that
// imported the helper from OrderPanel.
//
// V11-class regression-fix (post-deploy bug, 2026-04-28):
// Plain `export { ... } from '...'` is a RE-EXPORT ONLY — it does not create
// a local binding. Inside the module, `getUnitOptionsForProduct` would be
// `ReferenceError: ... is not defined`. OrderCreateForm uses the helper at
// 3 sites (line ~393 onPickProduct, ~548 mobile UnitField, ~617 desktop
// UnitField table), so clicking "create order" → blank screen.
// Fix: explicit `import` + separate `export`. Re-export still works for
// external callers (tests etc.) and the local binding is now in scope.
import { getUnitOptionsForProduct } from '../../lib/unitFieldHelpers.js';
// Phase 15.7-bis (2026-04-28) — banner UX for auto-repay of negative balances.
import { formatNegativeRepayBanner, hasNegativeRepay } from '../../lib/negativeRepayBanner.js';
export { getUnitOptionsForProduct };

export default function OrderPanel({ clinicSettings, theme, prefillProduct, onPrefillConsumed }) {
  const isDark = theme === 'dark';
  // Phase 14.7.H follow-up A — branch-scoped order list + create.
  const { branchId: BRANCH_ID } = useSelectedBranch();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  // V35.2-quater — seedOpen state removed (button gone per user directive)
  const [editingOrder, setEditingOrder] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [search, setSearch] = useState('');
  // Phase 16.4 G2/G3/G6 (2026-04-29) — list filters (status / cost_type /
  // period date range). All client-side filters on the loaded `orders`.
  const [statusFilter, setStatusFilter] = useState('all');     // all|active|cancelled
  const [costTypeFilter, setCostTypeFilter] = useState('all'); // all|with-cost|premium-only|no-cost
  const [periodFrom, setPeriodFrom] = useState('');            // YYYY-MM-DD
  const [periodTo, setPeriodTo] = useState('');                // YYYY-MM-DD
  const [pendingPrefill, setPendingPrefill] = useState(null);
  const [detailOrderId, setDetailOrderId] = useState(null);
  // 2026-04-27 actor tracking — eager-load sellers (be_staff + be_doctors)
  // for ActorPicker. Load once on mount; reused across the create form +
  // cancel-confirm modal.
  const [sellers, setSellers] = useState([]);
  const [sellersLoading, setSellersLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState(null);
  // Phase 15.5A (2026-04-28) — branch-filter sellers; legacy fallback for
  // staff with empty branchIds[] keeps them visible.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSellersLoading(true);
      try {
        const list = await listAllSellers({ branchId: BRANCH_ID });
        if (!cancelled && Array.isArray(list)) setSellers(list);
      } catch (e) {
        console.error('[OrderPanel] listAllSellers failed:', e);
      } finally {
        if (!cancelled) setSellersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [BRANCH_ID]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try { setOrders(await listStockOrders({ branchId: BRANCH_ID })); }
    catch (e) { console.error('[OrderPanel] listStockOrders failed:', e); setOrders([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const data = await listProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) { console.error('[OrderPanel] products load failed:', e); setProducts([]); }
    finally { setProductsLoading(false); }
  }, []);

  const openCreate = (prefill = null) => {
    loadProducts();
    setEditingOrder(null);
    setPendingPrefill(prefill);
    setFormOpen(true);
  };

  // Auto-open form when parent hands us a prefill (from Balance row "เพิ่ม" button)
  useEffect(() => {
    if (prefillProduct) {
      openCreate(prefillProduct);
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillProduct]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      // Search (vendor / orderId)
      if (q && !((o.vendorName || '').toLowerCase().includes(q) || (o.orderId || '').toLowerCase().includes(q))) {
        return false;
      }
      // Phase 16.4 G2 — status filter
      if (statusFilter !== 'all') {
        const s = String(o.status || 'active');
        if (statusFilter === 'cancelled' && s !== 'cancelled' && s !== 'cancelled_post_receive') return false;
        if (statusFilter === 'active' && (s === 'cancelled' || s === 'cancelled_post_receive')) return false;
      }
      // Phase 16.4 G3 — cost_type filter (line-item shape)
      if (costTypeFilter !== 'all') {
        const items = Array.isArray(o.items) ? o.items : [];
        const hasPremium = items.some(it => !!it.isPremium);
        const hasCostBearing = items.some(it => !it.isPremium && (Number(it.cost) || 0) > 0);
        const hasZeroCost = items.some(it => (Number(it.cost) || 0) === 0);
        if (costTypeFilter === 'premium-only' && !hasPremium) return false;
        if (costTypeFilter === 'with-cost' && !hasCostBearing) return false;
        if (costTypeFilter === 'no-cost' && !hasZeroCost) return false;
      }
      // Phase 16.4 G6 — period date-range filter on importedDate
      if (periodFrom || periodTo) {
        const date = String(o.importedDate || '').slice(0, 10);
        if (!date) return false;
        if (periodFrom && date < periodFrom) return false;
        if (periodTo && date > periodTo) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter, costTypeFilter, periodFrom, periodTo]);

  // Phase 15.4 — pagination 20/page recent-first. Reset on filter change.
  const { page, setPage, totalPages, visibleItems, totalCount } = usePagination(filteredOrders, {
    key: `${BRANCH_ID}|${search}|${statusFilter}|${costTypeFilter}|${periodFrom}|${periodTo}`,
  });

  // 2026-04-27 actor tracking — handleCancel now opens ActorConfirmModal
  // instead of confirm(). User must pick "ผู้ทำรายการ" before the cancel
  // proceeds; the picked actor is stored on the CANCEL_IMPORT movement.
  const handleCancel = (order) => setCancelTarget(order);

  const openDetail = (orderId) => setDetailOrderId(orderId);
  const closeDetail = () => setDetailOrderId(null);

  if (formOpen) {
    return (
      <OrderCreateForm
        branchId={BRANCH_ID}
        isDark={isDark}
        products={products}
        productsLoading={productsLoading}
        prefillProduct={pendingPrefill}
        sellers={sellers}
        sellersLoading={sellersLoading}
        onClose={() => { setFormOpen(false); setPendingPrefill(null); }}
        onSaved={async () => {
          setFormOpen(false);
          setPendingPrefill(null);
          await loadOrders();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-rose-900/30 border border-rose-800">
            <ShoppingBag size={22} className="text-rose-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--tx-heading)] flex items-center gap-2">Orders นำเข้าสินค้า</h2>
            <p className="text-xs text-[var(--tx-muted)]">นำเข้าสินค้าจาก vendor → สร้าง batch (FIFO) → สต็อกตามคำสั่งซื้อจริง</p>
          </div>
          {/* V35.2-quater (2026-04-28) — "นำเข้าจากข้อมูลพื้นฐาน" button removed */}
          <button onClick={openCreate}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 flex items-center gap-1.5 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
            <Plus size={14} /> สร้าง Order ใหม่
          </button>
        </div>
        <div className="mt-4 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา vendor หรือ ORD-..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        </div>
        {/* Phase 16.4 G2/G3/G6 (2026-04-29) — list filters */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1">สถานะ</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              data-field="filter-status"
              className="w-full px-2 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]">
              <option value="all">ทั้งหมด</option>
              <option value="active">ใช้งาน</option>
              <option value="cancelled">ยกเลิก</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1">ประเภทต้นทุน</label>
            <select value={costTypeFilter} onChange={e => setCostTypeFilter(e.target.value)}
              data-field="filter-cost-type"
              className="w-full px-2 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]">
              <option value="all">ทั้งหมด</option>
              <option value="with-cost">มีต้นทุน</option>
              <option value="premium-only">ของแถมเท่านั้น</option>
              <option value="no-cost">ไม่มีต้นทุน</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1">ช่วงวันที่ (จาก)</label>
            <DateField value={periodFrom} onChange={setPeriodFrom} locale="ce" size="sm" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1">ถึง</label>
            <DateField value={periodTo} onChange={setPeriodTo} locale="ce" size="sm" />
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)] space-y-4">
          <Package size={32} className="mx-auto text-[var(--tx-muted)]" />
          <p className="text-xs text-[var(--tx-muted)]">{search ? 'ไม่พบ order ที่ตรงกับคำค้น' : 'ยังไม่มี order'}</p>
          {!search && (
            <div className="flex justify-center gap-3">
              {/* V35.2-quater — "นำเข้าจากข้อมูลพื้นฐาน" CTA removed */}
              <button onClick={openCreate}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 flex items-center gap-1.5 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
                <Plus size={14} /> สร้าง Order ใหม่
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl overflow-x-auto shadow-lg border border-[var(--bd)]">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">เลขที่</th>
                <th className="px-3 py-2 text-left font-bold">คู่ค้า</th>
                <th className="px-3 py-2 text-left font-bold">วันที่</th>
                <th className="px-3 py-2 text-center font-bold">รายการ</th>
                <th className="px-3 py-2 text-right font-bold">ยอด</th>
                <th className="px-3 py-2 text-center font-bold">สถานะ</th>
                <th className="px-3 py-2 text-right font-bold w-24">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(o => {
                const itemCount = Array.isArray(o.items) ? o.items.length : 0;
                const total = (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);
                // Phase 15.4 post-deploy s22 — inline product summary
                const itemsSummary = formatOrderItemsSummary(o.items || []);
                return (
                  <tr key={o.orderId} onClick={() => openDetail(o.orderId)}
                    className="border-t border-[var(--bd)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    data-testid="order-row">
                    <td className="px-3 py-2 font-mono text-sky-400">{o.orderId}</td>
                    <td className="px-3 py-2 text-[var(--tx-primary)]">{o.vendorName || '-'}</td>
                    <td className="px-3 py-2 text-[var(--tx-muted)]">{fmtDate(o.importedDate)}</td>
                    <td className="px-3 py-2 text-[var(--tx-primary)]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{itemCount}</span>
                        {itemsSummary && (
                          <span className="text-[10px] text-[var(--tx-muted)] truncate max-w-[280px]" title={itemsSummary} data-testid="order-items-summary">
                            {itemsSummary}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-orange-400">{fmtMoney(total)}</td>
                    <td className="px-3 py-2 text-center">
                      {(o.status === 'cancelled' || o.status === 'cancelled_post_receive') ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/30 text-red-400 border border-red-800"
                                title={o.cancelReason || ''}>
                            {o.status === 'cancelled_post_receive' ? 'ยกเลิก (post-receive)' : 'ยกเลิก'}
                          </span>
                          {/* Phase 16.4 G4 (2026-04-29) — surface cancelReason inline */}
                          {o.cancelReason && (
                            <span className="text-[10px] text-[var(--tx-muted)] italic max-w-[140px] truncate"
                                  title={o.cancelReason}
                                  data-testid="order-cancel-reason">
                              {o.cancelReason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-800">ใช้งาน</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openDetail(o.orderId)}
                        className="px-2 py-1 rounded text-[10px] bg-sky-900/20 hover:bg-sky-900/40 text-sky-400 border border-sky-800 hover:border-sky-600 mr-1"
                        title="ดู/แก้ไข">
                        ดู
                      </button>
                      {o.status !== 'cancelled' && (
                        <button onClick={() => handleCancel(o)}
                          className="px-2 py-1 rounded text-[10px] bg-[var(--bg-hover)] hover:bg-red-900/20 text-[var(--tx-muted)] hover:text-red-400 border border-[var(--bd)] hover:border-red-700"
                          title="ยกเลิก order">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalCount={totalCount} />
        </div>
      )}

      {detailOrderId && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={closeDetail}
          onSaved={loadOrders}
        />
      )}

      {/* 2026-04-27 actor tracking — cancel-confirm modal with required ผู้ทำรายการ picker */}
      <ActorConfirmModal
        open={!!cancelTarget}
        title={cancelTarget ? `ยกเลิกใบสั่งซื้อ ${cancelTarget.orderId}` : ''}
        message="ถ้ามีสินค้าบาง lot ถูกใช้ไปแล้ว (ขาย/ปรับ/ย้าย) ระบบจะบล็อกไม่ให้ยกเลิก"
        actionLabel="ยกเลิกใบสั่งซื้อ"
        actionColor="red"
        sellers={sellers}
        sellersLoading={sellersLoading}
        reasonOptional
        reasonLabel="เหตุผลการยกเลิก"
        onCancel={() => setCancelTarget(null)}
        onConfirm={async ({ actor, reason }) => {
          try {
            await cancelStockOrder(cancelTarget.orderId, { reason, user: actor });
            setCancelTarget(null);
            await loadOrders();
          } catch (e) {
            // V31 — surface error; modal stays open via setError pathway in modal
            throw e;
          }
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Order Create Form
// ═══════════════════════════════════════════════════════════════════════════
function OrderCreateForm({ isDark, products, productsLoading, prefillProduct, branchId, sellers, sellersLoading, onClose, onSaved }) {
  // 2026-04-27 fix — branchId passed in from OrderPanel (parent).
  // Pre-existing scope bug: BRANCH_ID was referenced inside this sibling
  // function (line 318 below) but never declared in its scope —
  // ReferenceError at save time. Mirrors StockAdjustPanel.AdjustCreateForm
  // fix shipped earlier today (Phase 15.3 commit e65d335).
  const BRANCH_ID = branchId;

  // 2026-04-27 actor tracking — required "ผู้ทำรายการ" picker. User
  // directive: empty default + force-pick every time. resolveActorUser
  // converts the picked id → {userId, userName} for the writer's user field.
  const [actorId, setActorId] = useState('');

  // 2026-04-27 — unit groups for smart unit dropdown. Loaded once on mount
  // (cheap query against be_product_units). Each group has units[] with
  // base + larger packs; the dropdown shows all options for the picked
  // product's defaultProductUnitGroupId, with row-0 (base) selected by
  // default. Products without a configured group fall back to free-text
  // input so legacy data still works.
  const [unitGroups, setUnitGroups] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listProductUnitGroups();
        if (!cancelled && Array.isArray(list)) setUnitGroups(list);
      } catch (e) {
        // Non-fatal — falls back to free-text input.
        console.warn('[OrderCreateForm] listProductUnitGroups failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const today = thaiTodayISO();
  const [vendorName, setVendorName] = useState('');
  const [importedDate, setImportedDate] = useState(today);
  const [note, setNote] = useState('');
  // Phase 16.4 G1 (2026-04-29) — surface discount + discountType form inputs.
  // Backend createStockOrder already persists these (line 4842-4843); UI was
  // missing the controls. Mirror CentralStockOrderPanel pattern.
  const [discount, setDiscount] = useState('');
  const [discountType, setDiscountType] = useState('amount');
  const [items, setItems] = useState(() => {
    if (prefillProduct) {
      const pid = String(prefillProduct.productId || prefillProduct.id);
      return [{
        productId: pid,
        productName: prefillProduct.productName || prefillProduct.name || '',
        qty: '',
        cost: prefillProduct.price ? String(prefillProduct.price) : '',
        unit: prefillProduct.unit || '',
        expiresAt: '',
        isPremium: false,
      }];
    }
    return [mkEmptyItem()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // Phase 15.7-bis (2026-04-28) — banner shown when incoming order qty
  // auto-repaid existing negative balances at the same product+branch.
  const [repayBanner, setRepayBanner] = useState('');

  function mkEmptyItem() {
    return { productId: '', productName: '', qty: '', cost: '', unit: '', expiresAt: '', isPremium: false };
  }

  const updateItem = (idx, patch) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };
  const addItem = () => setItems(prev => [...prev, mkEmptyItem()]);

  const onPickProduct = (idx, productId) => {
    const p = products.find(x => String(x.id) === String(productId));
    if (!p) { updateItem(idx, { productId: '', productName: '', unit: '' }); return; }
    // 2026-04-27 — auto-pick base unit from product's configured unit group.
    // Fallback chain: group base unit → p.mainUnitName → legacy p.unit → ''.
    const opts = getUnitOptionsForProduct(productId, products, unitGroups);
    const baseUnit = opts[0] || p.mainUnitName || p.unit || items[idx]?.unit || '';
    updateItem(idx, {
      productId: String(p.id),
      // Phase 14.10-tris fix (2026-04-27) — be_products canonical productName
      productName: productDisplayName(p),
      unit: baseUnit,
    });
  };

  const validItems = items.filter(it => it.productId && Number(it.qty) > 0);
  // 2026-04-27 actor tracking — picked actor must resolve to a real seller
  // for canSave to flip true. resolveActorUser returns null if id missing
  // OR if the loaded sellers list doesn't contain the id (race-safe).
  const actorUser = resolveActorUser(actorId, sellers);
  const canSave = vendorName.trim() && importedDate && validItems.length > 0 && !!actorUser;
  const total = validItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);

  const handleSave = async () => {
    if (!canSave) {
      if (!actorUser) {
        setError('กรุณาเลือกผู้ทำรายการก่อนบันทึก');
      } else {
        setError('กรุณากรอก vendor + วันที่ + รายการสินค้าอย่างน้อย 1 รายการ');
      }
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        vendorName: vendorName.trim(),
        importedDate,
        note: note.trim(),
        // Phase 16.4 G1 (2026-04-29) — discount surfaced from new UI inputs.
        discount: Number(discount) || 0,
        discountType: discountType === 'percent' ? 'percent' : 'amount',
        branchId: BRANCH_ID,
        items: validItems.map(it => ({
          productId: it.productId,
          productName: it.productName,
          qty: Number(it.qty),
          cost: Number(it.cost) || 0,
          unit: it.unit || '',
          expiresAt: it.expiresAt || null,
          isPremium: !!it.isPremium,
        })),
      };
      const result = await createStockOrder(payload, { user: actorUser });
      // Phase 15.7-bis — surface repay banner if incoming qty cleared
      // any existing negative balances. UX hold: 2.5s before onSaved
      // so admin sees the banner.
      if (hasNegativeRepay(result?.repays)) {
        setRepayBanner(formatNegativeRepayBanner(result.repays));
        setSuccess(true);
        setTimeout(onSaved, 2500);
      } else {
        setSuccess(true);
        setTimeout(onSaved, 600);
      }
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  const inputCls = `w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-rose-500`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg border border-[var(--bd)]">
        <button onClick={onClose}
          className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)] flex items-center gap-1.5">
          <ArrowLeft size={14} /> กลับ
        </button>
        <div className="flex-1">
          <h2 className="text-base font-bold text-[var(--tx-heading)]">สร้าง Order นำเข้า</h2>
          <p className="text-xs text-[var(--tx-muted)]">บันทึกสินค้าที่รับเข้าจาก vendor — ระบบจะสร้าง batch (FIFO lot) อัตโนมัติ</p>
        </div>
        <button onClick={handleSave} disabled={!canSave || saving}
          className="px-5 py-2 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
          {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <CheckCircle2 size={14} /> : <Plus size={14} />}
          {saving ? 'กำลังบันทึก' : success ? 'สำเร็จ' : 'บันทึก Order'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {/* Phase 15.7-bis — repay banner: shows when incoming order qty
          auto-cleared negative balances at the same product+branch. */}
      {repayBanner && (
        <div
          className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-3 text-xs text-emerald-300 whitespace-pre-line"
          data-testid="negative-repay-banner"
        >
          {repayBanner}
        </div>
      )}

      {/* Header fields */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)] space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">Vendor / คู่ค้า *</label>
            <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)}
              className={inputCls} placeholder="ชื่อผู้ขาย" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">วันที่นำเข้า *</label>
            <DateField value={importedDate} onChange={setImportedDate} locale="ce" size="sm" />
          </div>
        </div>
        {/* 2026-04-27 actor tracking — required ผู้ทำรายการ picker */}
        <ActorPicker
          value={actorId}
          onChange={setActorId}
          sellers={sellers}
          loading={sellersLoading}
          inputCls={inputCls}
          testId="order-create-actor"
        />
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">หมายเหตุ</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            className={`${inputCls} resize-none`} placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)" />
        </div>
        {/* Phase 16.4 G1 (2026-04-29) — discount + discountType inputs (parity
            with CentralStockOrderPanel + ProClinic /admin/order/create form). */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">ส่วนลด</label>
            <input type="number" min="0" step="0.01" value={discount}
              onChange={e => setDiscount(e.target.value)}
              className={inputCls}
              placeholder="0"
              data-field="discount"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">ประเภทส่วนลด</label>
            <select value={discountType} onChange={e => setDiscountType(e.target.value)}
              className={inputCls}
              data-field="discountType"
            >
              <option value="amount">บาท</option>
              <option value="percent">%</option>
            </select>
          </div>
        </div>
      </div>

      {/* Items grid */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--tx-heading)] flex items-center gap-2">
            <Package size={14} /> รายการสินค้า ({validItems.length}/{items.length})
          </h3>
          <div className="text-xs text-[var(--tx-muted)]">ยอดรวม: <span className="font-mono text-orange-400 font-bold">฿{fmtMoney(total)}</span></div>
        </div>

        {productsLoading && (
          <div className="text-xs text-[var(--tx-muted)] mb-2 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> กำลังโหลดรายการสินค้า...
          </div>
        )}

        {/* Mobile: card-per-item (labels + stacked inputs) */}
        <div className="lg:hidden space-y-3" data-testid="order-items-mobile">
          {items.map((it, idx) => {
            const lineTotal = (Number(it.qty) || 0) * (Number(it.cost) || 0);
            return (
              <div key={idx} className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-3 space-y-2" data-testid={`order-item-mobile-${idx}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[var(--tx-muted)] uppercase tracking-wider">รายการ #{idx + 1}</span>
                  <button onClick={() => removeItem(idx)} disabled={items.length === 1}
                    className="p-1.5 rounded text-[var(--tx-muted)] hover:text-red-400 hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="ลบรายการ">
                    <X size={14} />
                  </button>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--tx-muted)] uppercase tracking-wider font-bold block mb-1">สินค้า *</label>
                  <ProductSelectField
                    value={it.productId}
                    options={products}
                    onChange={(id) => onPickProduct(idx, id)}
                    testId={`order-product-mobile-${idx}`}
                    fieldKey={`item-${idx}-product`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[var(--tx-muted)] uppercase tracking-wider font-bold block mb-1">จำนวน *</label>
                    <input type="number" min="0" step="0.01" value={it.qty}
                      onChange={e => updateItem(idx, { qty: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--tx-muted)] uppercase tracking-wider font-bold block mb-1">หน่วย</label>
                    <UnitField
                      testId="order-unit"
                      value={it.unit}
                      options={getUnitOptionsForProduct(it.productId, products, unitGroups)}
                      inputCls={inputCls}
                      onChange={e => updateItem(idx, { unit: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--tx-muted)] uppercase tracking-wider font-bold block mb-1">ต้นทุน/หน่วย</label>
                    <input type="number" min="0" step="0.01" value={it.cost}
                      onChange={e => updateItem(idx, { cost: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--tx-muted)] uppercase tracking-wider font-bold block mb-1">วันหมดอายุ</label>
                    <DateField value={it.expiresAt || ''} onChange={v => updateItem(idx, { expiresAt: v })} locale="ce" size="sm" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[var(--bd)]">
                  <label className="flex items-center gap-2 text-xs text-[var(--tx-muted)] cursor-pointer select-none">
                    <input type="checkbox" checked={it.isPremium}
                      onChange={e => updateItem(idx, { isPremium: e.target.checked })}
                      className="w-4 h-4 accent-rose-500" />
                    ของแถม (premium)
                  </label>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--tx-muted)]">รวม</div>
                    <div className="font-mono font-bold text-orange-400 text-sm tabular-nums">{fmtMoney(lineTotal)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: table (≥lg) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">
                <th className="px-2 py-2 text-left font-bold w-8">#</th>
                <th className="px-2 py-2 text-left font-bold">สินค้า *</th>
                <th className="px-2 py-2 text-left font-bold w-20">จำนวน *</th>
                <th className="px-2 py-2 text-left font-bold w-16">หน่วย</th>
                <th className="px-2 py-2 text-left font-bold w-20">ต้นทุน/หน่วย</th>
                <th className="px-2 py-2 text-left font-bold w-36">วันหมดอายุ</th>
                <th className="px-2 py-2 text-center font-bold w-16">ของแถม</th>
                <th className="px-2 py-2 text-right font-bold w-24">รวม</th>
                <th className="px-2 py-2 text-center font-bold w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const lineTotal = (Number(it.qty) || 0) * (Number(it.cost) || 0);
                return (
                  <tr key={idx} className="border-t border-[var(--bd)]">
                    <td className="px-2 py-2 text-[var(--tx-muted)] text-center">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <ProductSelectField
                        value={it.productId}
                        options={products}
                        onChange={(id) => onPickProduct(idx, id)}
                        testId={`order-product-desktop-${idx}`}
                        fieldKey={`item-${idx}-product`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.01" value={it.qty}
                        onChange={e => updateItem(idx, { qty: e.target.value })} className={inputCls} />
                    </td>
                    <td className="px-2 py-2">
                      <UnitField
                        testId="order-unit"
                        value={it.unit}
                        options={getUnitOptionsForProduct(it.productId, products, unitGroups)}
                        inputCls={inputCls}
                        onChange={e => updateItem(idx, { unit: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.01" value={it.cost}
                        onChange={e => updateItem(idx, { cost: e.target.value })} className={inputCls} />
                    </td>
                    <td className="px-2 py-2">
                      <DateField value={it.expiresAt || ''} onChange={v => updateItem(idx, { expiresAt: v })} locale="ce" size="sm" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" checked={it.isPremium} onChange={e => updateItem(idx, { isPremium: e.target.checked })}
                        className="w-4 h-4 accent-rose-500" />
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-orange-400">{fmtMoney(lineTotal)}</td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => removeItem(idx)} disabled={items.length === 1}
                        className="p-1 rounded text-[var(--tx-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed">
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button onClick={addItem}
          className="mt-3 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-rose-400 border border-[var(--bd)] hover:border-rose-700 flex items-center gap-1.5">
          <Plus size={12} /> เพิ่มรายการ
        </button>

        <div className="mt-4 p-3 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[10px] text-[var(--tx-muted)] space-y-1">
          <div>ℹ ต้นทุนใช้สำหรับ report COGS (ราคาทุน) — ไม่เกี่ยวกับราคาขาย</div>
          <div>ℹ วันหมดอายุ: ถ้ากรอก → ระบบ FEFO ใช้ batch ที่หมดอายุก่อน. ถ้าไม่กรอก → batch ไม่หมดอายุ สู้ไม่ได้กับของใกล้หมดอายุ</div>
          <div>ℹ สินค้าใหม่ที่ไม่เคย order มาก่อน → ระบบจะตั้ง `stockConfig.trackStock=true` ให้อัตโนมัติ</div>
        </div>
      </div>
    </div>
  );
}

// Phase 15.4 (2026-04-28) — UnitField extracted to ./UnitField.jsx
// (Rule C1 Rule-of-3) so Adjust/Transfer/Withdrawal/CentralPO panels can
// reuse the smart-unit-dropdown pattern. Use-sites pass testId="order-unit"
// to keep the existing data-testid="order-unit-select" / "-input" contract.
