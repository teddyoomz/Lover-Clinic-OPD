// ─── OrderPanel — vendor orders (ProClinic /admin/order parity) ─────────────
// Phase 8d: create vendor imports → seeds be_stock_batches via backendClient.
// First time a product is ordered here, its master stockConfig auto-opts-in
// to stock tracking (trackStock=true). Future sales will deduct from these batches.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, Plus, Trash2, X, Loader2, AlertCircle, CheckCircle2,
  ShoppingBag, ArrowLeft, Search, Filter, Database,
} from 'lucide-react';
import {
  listStockOrders, createStockOrder, cancelStockOrder,
  getAllMasterDataItems,
} from '../../lib/backendClient.js';
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
import StockSeedPanel from './StockSeedPanel.jsx';
import OrderDetailModal from './OrderDetailModal.jsx';

const BRANCH_ID = 'main';

// fmtMoney — imported from financeUtils (Rule of 3: was duplicated across 3 files).
const fmtDate = (iso) => fmtSlashDateTime(iso, { withTime: false });

export default function OrderPanel({ clinicSettings, theme, prefillProduct, onPrefillConsumed }) {
  const isDark = theme === 'dark';
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingPrefill, setPendingPrefill] = useState(null);
  const [detailOrderId, setDetailOrderId] = useState(null);

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
      const data = await getAllMasterDataItems('products');
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
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      (o.vendorName || '').toLowerCase().includes(q) ||
      (o.orderId || '').toLowerCase().includes(q)
    );
  }, [orders, search]);

  const handleCancel = async (order) => {
    const msg = `ยกเลิกใบสั่งซื้อ ${order.orderId}?\nถ้ามีสินค้าบาง lot ถูกใช้ไปแล้ว (ขาย/ปรับ/ย้าย) — ระบบจะบล็อกไม่ให้ยกเลิก`;
    if (!confirm(msg)) return;
    try {
      await cancelStockOrder(order.orderId, { reason: '', user: currentAuditUser() });
      await loadOrders();
    } catch (e) {
      alert(`ยกเลิกไม่สำเร็จ: ${e.message}`);
    }
  };

  const openDetail = (orderId) => setDetailOrderId(orderId);
  const closeDetail = () => setDetailOrderId(null);

  if (seedOpen) {
    return (
      <StockSeedPanel
        onClose={() => setSeedOpen(false)}
        onSaved={async () => { setSeedOpen(false); await loadOrders(); }}
      />
    );
  }
  if (formOpen) {
    return (
      <OrderCreateForm
        isDark={isDark}
        products={products}
        productsLoading={productsLoading}
        prefillProduct={pendingPrefill}
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
          <button onClick={() => setSeedOpen(true)}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-rose-400 border border-[var(--bd)] hover:border-rose-700 flex items-center gap-1.5"
            title="เลือกสินค้าจากข้อมูลพื้นฐาน แล้วคีย์ qty/ต้นทุน/วันหมดอายุ ทีละหลายๆ ตัวในครั้งเดียว">
            <Database size={14} /> นำเข้าจากข้อมูลพื้นฐาน
          </button>
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
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)] space-y-4">
          <Package size={32} className="mx-auto text-[var(--tx-muted)]" />
          <p className="text-xs text-[var(--tx-muted)]">{search ? 'ไม่พบ order ที่ตรงกับคำค้น' : 'ยังไม่มี order — เริ่มได้ 2 วิธี'}</p>
          {!search && (
            <div className="flex justify-center gap-3">
              <button onClick={() => setSeedOpen(true)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 flex items-center gap-1.5 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
                <Database size={14} /> นำเข้าจากข้อมูลพื้นฐาน (แนะนำ — bulk)
              </button>
              <button onClick={openCreate}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-rose-400 border border-[var(--bd)] flex items-center gap-1.5">
                <Plus size={14} /> สร้าง Order รายการเดียว
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl overflow-hidden shadow-lg border border-[var(--bd)]">
          <table className="w-full text-xs">
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
              {filteredOrders.map(o => {
                const itemCount = Array.isArray(o.items) ? o.items.length : 0;
                const total = (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);
                return (
                  <tr key={o.orderId} onClick={() => openDetail(o.orderId)}
                    className="border-t border-[var(--bd)] hover:bg-[var(--bg-hover)] cursor-pointer">
                    <td className="px-3 py-2 font-mono text-sky-400">{o.orderId}</td>
                    <td className="px-3 py-2 text-[var(--tx-primary)]">{o.vendorName || '-'}</td>
                    <td className="px-3 py-2 text-[var(--tx-muted)]">{fmtDate(o.importedDate)}</td>
                    <td className="px-3 py-2 text-center text-[var(--tx-primary)]">{itemCount}</td>
                    <td className="px-3 py-2 text-right font-mono text-orange-400">{fmtMoney(total)}</td>
                    <td className="px-3 py-2 text-center">
                      {o.status === 'cancelled' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/30 text-red-400 border border-red-800">ยกเลิก</span>
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
        </div>
      )}

      {detailOrderId && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={closeDetail}
          onSaved={loadOrders}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Order Create Form
// ═══════════════════════════════════════════════════════════════════════════
function OrderCreateForm({ isDark, products, productsLoading, prefillProduct, onClose, onSaved }) {
  const today = thaiTodayISO();
  const [vendorName, setVendorName] = useState('');
  const [importedDate, setImportedDate] = useState(today);
  const [note, setNote] = useState('');
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
    updateItem(idx, {
      productId: String(p.id),
      productName: p.name || '',
      unit: p.unit || items[idx]?.unit || '',
    });
  };

  const validItems = items.filter(it => it.productId && Number(it.qty) > 0);
  const canSave = vendorName.trim() && importedDate && validItems.length > 0;
  const total = validItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);

  const handleSave = async () => {
    if (!canSave) {
      setError('กรุณากรอก vendor + วันที่ + รายการสินค้าอย่างน้อย 1 รายการ');
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        vendorName: vendorName.trim(),
        importedDate,
        note: note.trim(),
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
      await createStockOrder(payload, { user: currentAuditUser() });
      setSuccess(true);
      setTimeout(onSaved, 600);
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
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">หมายเหตุ</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            className={`${inputCls} resize-none`} placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)" />
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

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
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
                      <select value={it.productId} onChange={e => onPickProduct(idx, e.target.value)} className={inputCls}>
                        <option value="">— เลือกสินค้า —</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0" step="0.01" value={it.qty}
                        onChange={e => updateItem(idx, { qty: e.target.value })} className={inputCls} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="text" value={it.unit} onChange={e => updateItem(idx, { unit: e.target.value })} className={inputCls} placeholder="U" />
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
