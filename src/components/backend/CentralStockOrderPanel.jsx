// ─── CentralStockOrderPanel — Phase 15.2 (vendor → central PO) ──────────────
// List + create + receive + cancel for be_central_stock_orders.
//
// Mirrors OrderPanel.jsx (branch tier) shape but keyed to centralWarehouseId.
// On receive, batches are minted in be_stock_batches with locationType='central'
// + the IMPORT movement carries linkedCentralOrderId (so listStockMovements
// can filter central activity vs branch activity).
//
// Iron-clad:
//   E    no brokerClient — Firestore-only
//   H    no ProClinic sync
//   I    flow-simulate test in tests/phase15.2-* covers all paths
//   C2   no Math.random for IDs (server-side via generateCentralOrderId)
//   V14  validator strips undefined; setDoc is V14-safe
//   V31  no silent-swallow — every alert classifies the error

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingBag, Plus, Loader2, AlertCircle, CheckCircle2, ArrowLeft, X,
  PackageCheck, XCircle, Search,
} from 'lucide-react';
// Phase 15.6 / V35 (2026-04-28) — searchable product picker (Rule C1).
import ProductSelectField from './ProductSelectField.jsx';
import {
  listCentralStockOrders, createCentralStockOrder,
  receiveCentralStockOrder, cancelCentralStockOrder,
  listVendors, listProducts,
  // 2026-04-27 actor tracking
  listAllSellers,
  // Phase 15.4 (2026-04-28) item 7 — smart unit dropdown
  listProductUnitGroups,
} from '../../lib/backendClient.js';
import ActorPicker, { resolveActorUser } from './ActorPicker.jsx';
import ActorConfirmModal from './ActorConfirmModal.jsx';
// Phase 15.4 (2026-04-28) — shared 20/page pager.
import Pagination from './Pagination.jsx';
import { usePagination } from '../../lib/usePagination.js';
// Phase 15.4 (2026-04-28) item 7 — smart unit dropdown (Rule C1 shared).
import UnitField from './UnitField.jsx';
import { getUnitOptionsForProduct } from '../../lib/unitFieldHelpers.js';
// Phase 15.4 post-deploy s22 (2026-04-28) — row-click detail modal + inline summary.
import CentralOrderDetailModal from './CentralOrderDetailModal.jsx';
import { formatOrderItemsSummary } from '../../lib/orderItemsSummary.js';
import { auth } from '../../firebase.js';
import { thaiTodayISO } from '../../utils.js';
import { fmtMoney } from '../../lib/financeUtils.js';
import { fmtSlashDateTime } from '../../lib/dateFormat.js';
import {
  validateCentralStockOrder,
  emptyCentralStockOrderForm,
  normalizeCentralStockOrder,
} from '../../lib/centralStockOrderValidation.js';
import DateField from '../DateField.jsx';

function currentAuditUser() {
  const u = auth.currentUser;
  return {
    userId: u?.uid || '',
    userName: u?.email?.split('@')[0] || u?.displayName || '',
  };
}

function fmtQty(n) {
  return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
}
const fmtDate = (iso) => fmtSlashDateTime(iso, { withTime: false });

const STATUS_INFO = {
  pending: { label: 'รอรับ', color: 'amber' },
  partial: { label: 'รับบางส่วน', color: 'sky' },
  received: { label: 'รับครบ', color: 'emerald' },
  cancelled: { label: 'ยกเลิก', color: 'red' },
  cancelled_post_receive: { label: 'ยกเลิก (หลังรับ)', color: 'red' },
};
const STATUS_BADGE = {
  amber: 'bg-orange-900/30 text-orange-400 border-orange-800',
  sky: 'bg-sky-900/30 text-sky-400 border-sky-800',
  emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  red: 'bg-red-900/30 text-red-400 border-red-800',
};

export default function CentralStockOrderPanel({ centralWarehouseId, theme, prefillProduct, onPrefillConsumed }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  // Phase 15.4 item 7 — load unit groups for smart unit dropdown in items
  const [unitGroups, setUnitGroups] = useState([]);
  const [mastersLoading, setMastersLoading] = useState(false);
  const [search, setSearch] = useState('');
  // 2026-04-27 actor tracking
  const [sellers, setSellers] = useState([]);
  const [sellersLoading, setSellersLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState(null);  // { kind:'receive'|'cancel', order }
  // Phase 15.4 post-deploy s22 — Central Balance "+" button hands a product
  // here for pre-filled Central PO creation. Mirrors OrderPanel.jsx pattern
  // for branch-tier prefill.
  const [pendingPrefill, setPendingPrefill] = useState(null);
  // Phase 15.4 post-deploy s22 — row-click detail modal state
  const [detailOrderId, setDetailOrderId] = useState(null);
  // Phase 15.5A (2026-04-28) — sellers filtered by central warehouse id;
  // legacy staff with empty branchIds[] still visible (fallback).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSellersLoading(true);
      try {
        const list = await listAllSellers({ branchId: centralWarehouseId });
        if (!cancelled && Array.isArray(list)) setSellers(list);
      } catch (e) { console.error('[CentralStockOrderPanel] listAllSellers failed:', e); }
      finally { if (!cancelled) setSellersLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [centralWarehouseId]);

  const loadOrders = useCallback(async () => {
    if (!centralWarehouseId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setOrders(await listCentralStockOrders({ centralWarehouseId }));
    } catch (e) {
      console.error('[CentralStockOrderPanel] load orders failed:', e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [centralWarehouseId]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const loadMasters = useCallback(async () => {
    setMastersLoading(true);
    try {
      // Phase 15.4 item 7 — also load unit groups for smart UnitField dropdown.
      const [v, p, ug] = await Promise.all([
        listVendors({ activeOnly: true }),
        listProducts(),
        listProductUnitGroups().catch(() => []),
      ]);
      setVendors(Array.isArray(v) ? v : []);
      setProducts(Array.isArray(p) ? p : []);
      setUnitGroups(Array.isArray(ug) ? ug : []);
    } catch (e) {
      console.error('[CentralStockOrderPanel] masters load failed:', e);
    } finally {
      setMastersLoading(false);
    }
  }, []);

  const openCreate = (prefill = null) => {
    loadMasters();
    setPendingPrefill(prefill);
    setFormOpen(true);
  };

  // Phase 15.4 post-deploy s22 — auto-open form when parent hands a prefill
  // (StockBalancePanel "+" button at central tab). Mirrors OrderPanel pattern.
  useEffect(() => {
    if (prefillProduct) {
      openCreate(prefillProduct);
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillProduct]);

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      (o.vendorName || '').toLowerCase().includes(q) ||
      (o.orderId || '').toLowerCase().includes(q)
    );
  }, [orders, search]);

  // Phase 15.4 — pagination 20/page recent-first. Reset on warehouse/search change.
  const { page, setPage, totalPages, visibleItems, totalCount } = usePagination(filteredOrders, {
    key: `${centralWarehouseId || ''}|${search}`,
  });

  // 2026-04-27 actor tracking — open ActorConfirmModal instead of confirm()/prompt()
  const handleReceive = (order) => {
    const remaining = (order.items || []).filter(it => !it.receivedBatchId);
    if (remaining.length === 0) {
      alert('ทุกรายการรับครบแล้ว');
      return;
    }
    setPendingAction({ kind: 'receive', order });
  };

  const handleCancel = (order) => setPendingAction({ kind: 'cancel', order });

  if (formOpen) {
    return (
      <CentralOrderCreateForm
        centralWarehouseId={centralWarehouseId}
        vendors={vendors}
        products={products}
        unitGroups={unitGroups}
        mastersLoading={mastersLoading}
        sellers={sellers}
        sellersLoading={sellersLoading}
        prefillProduct={pendingPrefill}
        onClose={() => { setFormOpen(false); setPendingPrefill(null); }}
        onSaved={async () => { setFormOpen(false); setPendingPrefill(null); await loadOrders(); }}
      />
    );
  }

  if (!centralWarehouseId) {
    return (
      <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)]">
        <ShoppingBag size={32} className="mx-auto text-[var(--tx-muted)] mb-2" />
        <p className="text-xs text-[var(--tx-muted)]">เลือกคลังกลางก่อน</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-orange-900/30 border border-orange-800">
            <ShoppingBag size={22} className="text-orange-400" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-lg font-bold text-[var(--tx-heading)]">นำเข้าจาก Vendor (Central PO)</h2>
            <p className="text-xs text-[var(--tx-muted)]">{orders.length} ใบสั่งซื้อ — รับสินค้า → batches ในคลังกลาง + IMPORT movement</p>
          </div>
          <div className="flex-1 relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาเลขที่/vendor..."
              className="w-full pl-9 pr-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]" />
          </div>
          <button onClick={openCreate}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-orange-700 text-white hover:bg-orange-600 flex items-center gap-1.5">
            <Plus size={14} /> สร้าง PO
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)]">
          <ShoppingBag size={32} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-xs text-[var(--tx-muted)]">
            {orders.length === 0 ? 'ยังไม่มีใบสั่งซื้อ — กด "สร้าง PO" เพื่อเริ่ม' : 'ไม่พบใบสั่งซื้อตามเงื่อนไข'}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl overflow-x-auto shadow-lg border border-[var(--bd)]">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">เลขที่</th>
                <th className="px-3 py-2 text-left font-bold">วันที่</th>
                <th className="px-3 py-2 text-left font-bold">Vendor</th>
                <th className="px-3 py-2 text-center font-bold">รายการ</th>
                <th className="px-3 py-2 text-right font-bold">ส่วนลด</th>
                <th className="px-3 py-2 text-center font-bold">สถานะ</th>
                <th className="px-3 py-2 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(o => {
                const info = STATUS_INFO[o.status] || { label: o.status, color: 'amber' };
                const canReceive = o.status === 'pending' || o.status === 'partial';
                const canCancel = o.status !== 'cancelled' && o.status !== 'cancelled_post_receive';
                // Phase 15.4 post-deploy s22 — inline product summary so admin
                // can scan list without clicking each row.
                const itemsSummary = formatOrderItemsSummary(o.items || []);
                return (
                  <tr
                    key={o.orderId}
                    onClick={() => setDetailOrderId(o.orderId)}
                    className="border-t border-[var(--bd)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    data-testid="cpo-row"
                  >
                    <td className="px-3 py-2 font-mono text-orange-400" data-testid="cpo-row-id">{o.orderId}</td>
                    <td className="px-3 py-2 text-[var(--tx-muted)] whitespace-nowrap">{fmtDate(o.importedDate || o.createdAt)}</td>
                    <td className="px-3 py-2 text-[var(--tx-primary)] text-[11px]">{o.vendorName || o.vendorId}</td>
                    <td className="px-3 py-2 text-[var(--tx-primary)]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--tx-primary)]">{(o.items || []).length}</span>
                        {itemsSummary && (
                          <span className="text-[10px] text-[var(--tx-muted)] truncate max-w-[280px]" title={itemsSummary} data-testid="cpo-items-summary">
                            {itemsSummary}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--tx-muted)]">
                      {Number(o.discount) > 0 ? `${fmtMoney(o.discount)} ${o.discountType === 'percent' ? '%' : '฿'}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${STATUS_BADGE[info.color]}`} data-testid="cpo-status-badge">
                        {info.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setDetailOrderId(o.orderId)}
                        className="px-2 py-1 rounded text-[10px] bg-sky-900/20 hover:bg-sky-900/40 text-sky-400 border border-sky-800 inline-flex items-center gap-1 mr-1"
                        data-testid="cpo-detail-btn">
                        ดู
                      </button>
                      {canReceive && (
                        <button onClick={() => handleReceive(o)}
                          className="px-2 py-1 rounded text-[10px] bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-800 inline-flex items-center gap-1 mr-1"
                          data-testid="cpo-receive-btn">
                          <PackageCheck size={10} /> รับ
                        </button>
                      )}
                      {canCancel && (
                        <button onClick={() => handleCancel(o)}
                          className="px-2 py-1 rounded text-[10px] bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800 inline-flex items-center gap-1"
                          data-testid="cpo-cancel-btn">
                          <XCircle size={10} /> ยกเลิก
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

      {/* Phase 15.4 post-deploy s22 — row-click detail modal */}
      {detailOrderId && (
        <CentralOrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
        />
      )}

      {/* 2026-04-27 actor tracking — confirm receive / cancel with ผู้ทำรายการ */}
      <ActorConfirmModal
        open={!!pendingAction}
        title={pendingAction
          ? (pendingAction.kind === 'receive'
            ? `รับสินค้า ${pendingAction.order.orderId}`
            : `ยกเลิก ${pendingAction.order.orderId}`)
          : ''}
        message={pendingAction && (pendingAction.kind === 'receive'
          ? `ระบบจะสร้าง batch ใน be_stock_batches + IMPORT movement (type 1) สำหรับ ${(pendingAction.order.items || []).filter(it => !it.receivedBatchId).length} รายการที่ยังไม่ได้รับ`
          : 'ถ้าสินค้าบาง batch ถูกใช้ไปแล้ว (ขาย/ปรับ/ย้าย) ระบบจะบล็อก. มิฉะนั้นจะ cancel + emit CANCEL_IMPORT (type 14) compensations')}
        actionLabel={pendingAction ? (pendingAction.kind === 'receive' ? 'รับสินค้า' : 'ยกเลิก') : 'ยืนยัน'}
        actionColor={pendingAction && pendingAction.kind === 'cancel' ? 'red' : 'emerald'}
        sellers={sellers}
        sellersLoading={sellersLoading}
        reasonOptional={pendingAction && pendingAction.kind === 'cancel'}
        reasonLabel={pendingAction && pendingAction.kind === 'cancel' ? 'เหตุผลการยกเลิก' : 'หมายเหตุการรับ'}
        onCancel={() => setPendingAction(null)}
        onConfirm={async ({ actor, reason }) => {
          const order = pendingAction.order;
          if (pendingAction.kind === 'receive') {
            const remaining = (order.items || []).filter(it => !it.receivedBatchId);
            const receipts = remaining.map(it => ({
              centralOrderProductId: it.centralOrderProductId,
              qty: it.qty,
            }));
            await receiveCentralStockOrder(order.orderId, receipts, { user: actor });
          } else {
            await cancelCentralStockOrder(order.orderId, { reason, user: actor });
          }
          setPendingAction(null);
          await loadOrders();
        }}
      />
    </div>
  );
}

function CentralOrderCreateForm({ centralWarehouseId, vendors, products, unitGroups = [], mastersLoading, sellers, sellersLoading, prefillProduct, onClose, onSaved }) {
  // 2026-04-27 actor tracking — required ผู้ทำรายการ picker
  const [actorId, setActorId] = useState('');
  const [form, setForm] = useState(() => {
    const base = {
      ...emptyCentralStockOrderForm(),
      centralWarehouseId,
      importedDate: thaiTodayISO(),
    };
    // Phase 15.4 post-deploy s22 — pre-fill items[0] when handed a product
    // from StockBalancePanel "+" button. User then picks vendor + qty + saves.
    if (prefillProduct) {
      const pid = String(prefillProduct.productId || prefillProduct.id || '');
      const pname = String(prefillProduct.productName || prefillProduct.name || '');
      const punit = String(prefillProduct.unit || prefillProduct.mainUnitName || '');
      const pcost = prefillProduct.cost ?? prefillProduct.price ?? '';
      base.items = [{
        productId: pid,
        productName: pname,
        qty: '',
        cost: pcost === '' ? '' : String(pcost),
        expiresAt: '',
        unit: punit,
        isPremium: false,
      }];
    }
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const updateField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const updateItem = (idx, patch) => setForm(prev => ({
    ...prev,
    items: prev.items.map((it, i) => i === idx ? { ...it, ...patch } : it),
  }));
  const addItem = () => setForm(prev => ({
    ...prev,
    items: [...prev.items, { productId: '', productName: '', qty: '', cost: '', expiresAt: '', unit: '', isPremium: false }],
  }));
  const removeItem = (idx) => setForm(prev => ({
    ...prev,
    items: prev.items.length === 1 ? prev.items : prev.items.filter((_, i) => i !== idx),
  }));

  // Auto-fill productName + unit + cost when product is picked.
  const onPickProduct = (idx, productId) => {
    const p = products.find(x => x.id === productId || x.productId === productId);
    updateItem(idx, {
      productId,
      productName: p?.productName || p?.name || '',
      unit: p?.mainUnitName || p?.unit || '',
      cost: p?.cost ?? p?.price ?? '',
    });
  };

  // Auto-fill vendorName when vendor picked.
  const onPickVendor = (vendorId) => {
    const v = vendors.find(x => x.vendorId === vendorId || x.id === vendorId);
    setForm(prev => ({
      ...prev,
      vendorId,
      vendorName: v?.name || prev.vendorName,
    }));
  };

  const validItems = form.items.filter(it => String(it.productId).trim() && Number(it.qty) > 0);
  const actorUser = resolveActorUser(actorId, sellers);
  const canSave = !!(form.centralWarehouseId && form.vendorId && validItems.length > 0 && actorUser);

  const handleSave = async () => {
    setError('');
    if (!actorUser) { setError('กรุณาเลือกผู้ทำรายการก่อนบันทึก'); return; }
    const err = validateCentralStockOrder(form);
    if (err) {
      setError(err[1] || 'ข้อมูลไม่ถูกต้อง');
      return;
    }
    setSaving(true);
    try {
      const normalized = normalizeCentralStockOrder(form);
      await createCentralStockOrder(normalized, { user: actorUser });
      setSuccess(true);
      setTimeout(onSaved, 500);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const inputCls = `w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]`;
  const labelCls = 'block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg border border-[var(--bd)]">
        <button onClick={onClose}
          className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)] flex items-center gap-1.5">
          <ArrowLeft size={14} /> กลับ
        </button>
        <div className="flex-1">
          <h2 className="text-base font-bold text-[var(--tx-heading)]">สร้าง Central PO</h2>
          <p className="text-xs text-[var(--tx-muted)]">vendor → คลังกลาง — สถานะเริ่มที่ pending จนกว่าจะกด "รับ"</p>
        </div>
        <button onClick={handleSave} disabled={!canSave || saving}
          className="px-5 py-2 rounded-lg text-xs font-bold bg-orange-700 text-white hover:bg-orange-600 disabled:opacity-40 flex items-center gap-1.5"
          data-testid="cpo-save-btn">
          {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <CheckCircle2 size={14} /> : <Plus size={14} />}
          {saving ? 'กำลังบันทึก' : success ? 'สำเร็จ' : 'สร้าง'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)] space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Vendor *</label>
            <select value={form.vendorId} onChange={e => onPickVendor(e.target.value)} className={inputCls} data-testid="cpo-vendor-select">
              <option value="">— เลือก vendor —</option>
              {vendors.map(v => (
                <option key={v.vendorId || v.id} value={v.vendorId || v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>วันที่นำเข้า *</label>
            <DateField value={form.importedDate} onChange={(v) => updateField('importedDate', v)} />
          </div>
          <div>
            <label className={labelCls}>หมายเหตุ</label>
            <input type="text" value={form.note} onChange={e => updateField('note', e.target.value)}
              className={inputCls} placeholder="เช่น ครบ ครั้งที่ 1" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>ส่วนลด</label>
            <input type="number" min="0" step="0.01" value={form.discount}
              onChange={e => updateField('discount', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>ประเภทส่วนลด</label>
            <select value={form.discountType} onChange={e => updateField('discountType', e.target.value)} className={inputCls}>
              <option value="amount">บาท</option>
              <option value="percent">%</option>
            </select>
          </div>
          <div className="col-span-2">
            {/* 2026-04-27 actor tracking — required ผู้ทำรายการ picker */}
            <ActorPicker
              value={actorId}
              onChange={setActorId}
              sellers={sellers}
              loading={sellersLoading}
              inputCls={inputCls}
              testId="central-po-create-actor"
            />
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)]">
        <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-3">รายการสินค้า</h3>
        {mastersLoading ? (
          <div className="text-[11px] text-[var(--tx-muted)] flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> โหลด vendors + products...
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[700px]">
                <thead className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)]">
                  <tr>
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2 text-left font-bold">สินค้า *</th>
                    <th className="px-2 py-2 text-left font-bold w-20">จำนวน *</th>
                    <th className="px-2 py-2 text-left font-bold w-20">ต้นทุน *</th>
                    <th className="px-2 py-2 text-left font-bold w-32">หมดอายุ</th>
                    <th className="px-2 py-2 text-left font-bold w-16">หน่วย</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, idx) => (
                    <tr key={idx} className="border-t border-[var(--bd)]">
                      <td className="px-2 py-2 text-center text-[var(--tx-muted)]">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <ProductSelectField
                          value={it.productId}
                          options={products}
                          onChange={(id) => onPickProduct(idx, id)}
                          testId={`cpo-product-${idx}`}
                          fieldKey={`cpo-item-${idx}-product`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" step="0.01" value={it.qty}
                          onChange={e => updateItem(idx, { qty: e.target.value })} className={inputCls} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min="0" step="0.01" value={it.cost}
                          onChange={e => updateItem(idx, { cost: e.target.value })} className={inputCls} />
                      </td>
                      <td className="px-2 py-2">
                        <DateField value={it.expiresAt} onChange={(v) => updateItem(idx, { expiresAt: v })} />
                      </td>
                      <td className="px-2 py-2">
                        {/* Phase 15.4 item 7 — smart unit dropdown auto-populated from
                            product's defaultProductUnitGroupId. Falls back to free-text
                            input when product has no configured unit group (legacy data). */}
                        <UnitField
                          testId={`cpo-unit-${idx}`}
                          value={it.unit}
                          options={getUnitOptionsForProduct(it.productId, products, unitGroups)}
                          inputCls={inputCls}
                          onChange={e => updateItem(idx, { unit: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => removeItem(idx)} disabled={form.items.length === 1}
                          className="p-1 rounded text-[var(--tx-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed">
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addItem}
              className="mt-3 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-orange-400 border border-[var(--bd)] hover:border-orange-700 flex items-center gap-1.5"
              data-testid="cpo-add-item-btn">
              <Plus size={12} /> เพิ่มรายการ
            </button>
          </>
        )}
      </div>
    </div>
  );
}
