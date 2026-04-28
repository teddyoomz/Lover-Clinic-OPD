// ─── StockAdjustPanel — manual stock +/- per batch ──────────────────────────
// ProClinic /admin/stock-change parity: user picks product → picks specific batch
// (FIFO lot from vendor order) → add/reduce qty → writes ADJ doc + MVT movement.
// backendClient.createStockAdjustment wraps read+verify+mutate+write in one tx.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, Plus, Minus, X, Loader2, AlertCircle, CheckCircle2,
  SlidersHorizontal, ArrowLeft, Search,
} from 'lucide-react';
import {
  listStockBatches, createStockAdjustment,
  listStockMovements, getStockBatch,
  // Phase 14.10-tris (2026-04-26) — be_products canonical
  listProducts,
  // 2026-04-27 actor tracking — required ผู้ทำรายการ picker
  listAllSellers,
} from '../../lib/backendClient.js';
import ActorPicker, { resolveActorUser } from './ActorPicker.jsx';
// Phase 15.4 (2026-04-28) — shared 20/page pager.
import Pagination from './Pagination.jsx';
import { usePagination } from '../../lib/usePagination.js';
// Phase 15.4 post-deploy bug 3 (2026-04-28) — Adjust detail modal mirroring
// Transfer/Withdrawal pattern. User report: "รายการหน้าปรับสต็อคจะต้องกด
// เข้าไปดูรายละเอียดในแต่ละรายการได้เหมือนหน้าอื่นๆ".
import AdjustDetailModal from './AdjustDetailModal.jsx';
import { fmtSlashDateTime } from '../../lib/dateFormat.js';
import {
  getFirestore, collection, getDocs, query, where,
} from 'firebase/firestore';
import { db, appId, auth } from '../../firebase.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { productDisplayName } from '../../lib/productValidation.js';
// Phase 15.4 fix (post-deploy bug 4) — gate legacy-main fallback to branch-tier
// only. When CentralStockTab passes branchIdOverride=WH-XXX, we MUST NOT pull
// 'main' (branch-tier) batches into the central adjust picker.
import { deriveLocationType, LOCATION_TYPE } from '../../lib/stockUtils.js';

function currentAuditUser() {
  const u = auth.currentUser;
  return {
    userId: u?.uid || '',
    userName: u?.email?.split('@')[0] || u?.displayName || '',
  };
}

const fmtDate = fmtSlashDateTime;
function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }

export default function StockAdjustPanel({ clinicSettings, theme, prefillProduct, onPrefillConsumed, branchIdOverride }) {
  const isDark = theme === 'dark';
  // Phase 14.7.H follow-up A — branch-scoped batch lookups + adjust writes.
  // Phase 15.3 (2026-04-27) — branchIdOverride lets CentralStockTab open this
  // panel against a central warehouse instead of BranchContext's branch.
  // Mirrors the pattern from MovementLogPanel.jsx (Phase 15.1).
  const { branchId: ctxBranchId, branches } = useSelectedBranch();
  const BRANCH_ID = branchIdOverride || ctxBranchId;
  const [adjustments, setAdjustments] = useState([]);
  // Phase 15.4 post-deploy bug 3 — row-click detail modal state.
  const [detailId, setDetailId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [pendingPrefill, setPendingPrefill] = useState(null);
  // 2026-04-27 actor tracking — eager-load sellers (be_staff + be_doctors)
  // Phase 15.5A (2026-04-28) — branch-filter the list; sellers with empty
  // branchIds[] still appear (legacy fallback). Re-fetches when BRANCH_ID changes.
  const [sellers, setSellers] = useState([]);
  const [sellersLoading, setSellersLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSellersLoading(true);
      try {
        const list = await listAllSellers({ branchId: BRANCH_ID });
        if (!cancelled && Array.isArray(list)) setSellers(list);
      } catch (e) {
        console.error('[StockAdjustPanel] listAllSellers failed:', e);
      } finally {
        if (!cancelled) setSellersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [BRANCH_ID]);

  const loadAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const col = collection(db, 'artifacts', appId, 'public', 'data', 'be_stock_adjustments');
      const q = query(col, where('branchId', '==', BRANCH_ID));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setAdjustments(list);
    } catch (e) { console.error('[StockAdjustPanel] load failed:', e); setAdjustments([]); }
    finally { setLoading(false); }
  }, [BRANCH_ID]);

  useEffect(() => { loadAdjustments(); }, [loadAdjustments]);

  // Phase 15.4 — pagination 20/page recent-first. Reset on branch change.
  const { page, setPage, totalPages, visibleItems, totalCount } = usePagination(adjustments, {
    key: BRANCH_ID,
  });

  const openCreate = async (prefill = null) => {
    setProductsLoading(true);
    try {
      const data = await listProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch { setProducts([]); }
    finally { setProductsLoading(false); }
    setPendingPrefill(prefill);
    setFormOpen(true);
  };

  // Auto-open form when parent hands us a prefill (from Balance row "ปรับ" button)
  useEffect(() => {
    if (prefillProduct) {
      openCreate(prefillProduct);
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillProduct]);

  if (formOpen) {
    return (
      <AdjustCreateForm
        isDark={isDark}
        products={products}
        productsLoading={productsLoading}
        prefillProduct={pendingPrefill}
        branchId={BRANCH_ID}
        sellers={sellers}
        sellersLoading={sellersLoading}
        onClose={() => { setFormOpen(false); setPendingPrefill(null); }}
        onSaved={async () => { setFormOpen(false); setPendingPrefill(null); await loadAdjustments(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-orange-900/30 border border-orange-800">
            <SlidersHorizontal size={22} className="text-orange-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--tx-heading)]">ปรับสต็อก</h2>
            <p className="text-xs text-[var(--tx-muted)]">เพิ่ม/ลด stock ต่อ batch (lot) — เช่น นับสต็อก, ของเสีย, คืน vendor</p>
          </div>
          <button onClick={openCreate}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-orange-700 text-white hover:bg-orange-600 flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            <Plus size={14} /> ปรับสต็อกใหม่
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : adjustments.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)]">
          <SlidersHorizontal size={32} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-xs text-[var(--tx-muted)]">ยังไม่มีการปรับสต็อก</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl overflow-x-auto shadow-lg border border-[var(--bd)]">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">วันที่</th>
                <th className="px-3 py-2 text-left font-bold">สินค้า</th>
                <th className="px-3 py-2 text-left font-bold">Batch</th>
                <th className="px-3 py-2 text-center font-bold">ประเภท</th>
                <th className="px-3 py-2 text-right font-bold">จำนวน</th>
                <th className="px-3 py-2 text-left font-bold">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(a => (
                <tr
                  key={a.adjustmentId}
                  onClick={() => setDetailId(a.adjustmentId)}
                  className="border-t border-[var(--bd)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  data-testid="adjust-row"
                >
                  <td className="px-3 py-2 text-[var(--tx-muted)] whitespace-nowrap">{fmtDate(a.createdAt)}</td>
                  <td className="px-3 py-2 text-[var(--tx-primary)]">{a.productName}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-[var(--tx-muted)]" title={a.batchId}>…{a.batchId?.slice(-8)}</td>
                  <td className="px-3 py-2 text-center">
                    {a.type === 'add' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-800 inline-flex items-center gap-1">
                        <Plus size={9} /> เพิ่ม
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/30 text-red-400 border border-red-800 inline-flex items-center gap-1">
                        <Minus size={9} /> ลด
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold">
                    <span className={a.type === 'add' ? 'text-emerald-400' : 'text-red-400'}>
                      {a.type === 'add' ? '+' : '−'}{fmtQty(a.qty)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--tx-muted)] text-[11px]">{a.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalCount={totalCount} />
        </div>
      )}

      {/* Phase 15.4 post-deploy bug 3 — row-click detail modal */}
      {detailId && (
        <AdjustDetailModal
          adjustmentId={detailId}
          branches={branches}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function AdjustCreateForm({ isDark, products, productsLoading, prefillProduct, branchId, sellers, sellersLoading, onClose, onSaved }) {
  // Phase 15.3 (2026-04-27) — branchId passed in from StockAdjustPanel.
  // Pre-existing bug: BRANCH_ID was referenced inside this sibling function
  // (lines 191 + 220 below) but never declared in its scope — silently
  // resolved to `undefined` at runtime, causing batch picker to show empty.
  // Now explicitly threaded so central-tier adjusts work correctly.
  const BRANCH_ID = branchId;
  const isBranchTier = deriveLocationType(BRANCH_ID) === LOCATION_TYPE.BRANCH;

  // 2026-04-27 actor tracking — required ผู้ทำรายการ picker.
  const [actorId, setActorId] = useState('');
  const [productId, setProductId] = useState(prefillProduct ? String(prefillProduct.productId || prefillProduct.id) : '');
  const [productName, setProductName] = useState(prefillProduct ? (prefillProduct.productName || prefillProduct.name || '') : '');
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchId, setBatchId] = useState('');
  const [type, setType] = useState('reduce');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Phase 15.4 post-deploy s23 (2026-04-28) — TIER-SCOPED PRODUCT FILTER.
  // User report: at central tab adjust, the product dropdown showed ALL
  // master products (including products only stocked at branch tier).
  // User picks a branch-only product → batch dropdown empty → "ไม่มี batch
  // — สร้าง Order ก่อน" → confusion → user thinks "system pulls branch stock".
  //
  // Fix: pre-load all active batches at THIS tier once, derive the unique
  // productIds that have stock here, filter the products dropdown to that
  // set. Same logic in branch tier so users only see products with branch
  // batches. Empty result → helpful CTA to create an order first.
  const [availableProductIds, setAvailableProductIds] = useState(null); // null = loading
  useEffect(() => {
    if (!BRANCH_ID) { setAvailableProductIds(new Set()); return; }
    let cancelled = false;
    (async () => {
      try {
        const list = await listStockBatches({ branchId: BRANCH_ID, status: 'active', includeLegacyMain: isBranchTier });
        if (cancelled) return;
        const ids = new Set();
        for (const b of list || []) {
          if (b?.productId) ids.add(String(b.productId));
        }
        setAvailableProductIds(ids);
      } catch (e) {
        console.error('[AdjustForm] preload available batches failed:', e);
        if (!cancelled) setAvailableProductIds(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [BRANCH_ID, isBranchTier]);

  const availableProducts = useMemo(() => {
    if (!availableProductIds) return []; // still loading
    if (availableProductIds.size === 0) return [];
    return products.filter((p) => availableProductIds.has(String(p.id)));
  }, [products, availableProductIds]);

  // Load batches when product picked.
  // Phase 15.4 (s19 item 2): includeLegacyMain so pre-V20 batches written
  // with branchId='main' surface in picker until admin migrates.
  // Bug 4 (s20): gated to BRANCH tier only — central-tier MUST NOT pull
  // 'main' branch-tier batches into its picker.
  useEffect(() => {
    if (!productId) { setBatches([]); setBatchId(''); return; }
    let cancelled = false;
    setBatchesLoading(true);
    (async () => {
      try {
        const list = await listStockBatches({ productId, branchId: BRANCH_ID, status: 'active', includeLegacyMain: isBranchTier });
        if (!cancelled) {
          setBatches(list);
          // auto-pick first available batch
          if (list.length > 0) setBatchId(list[0].batchId);
          else setBatchId('');
        }
      } catch (e) {
        console.error('[AdjustForm] batches load failed:', e);
        if (!cancelled) { setBatches([]); setBatchId(''); }
      } finally { if (!cancelled) setBatchesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [productId, BRANCH_ID, isBranchTier]);

  const selectedBatch = useMemo(() => batches.find(b => b.batchId === batchId), [batches, batchId]);
  const actorUser = resolveActorUser(actorId, sellers);
  const canSave = productId && batchId && Number(qty) > 0 && type && !!actorUser;

  const onPickProduct = (pid) => {
    const p = products.find(x => String(x.id) === String(pid));
    setProductId(pid);
    // Phase 14.10-tris fix (2026-04-27) — be_products canonical productName
    setProductName(productDisplayName(p));
  };

  const handleSave = async () => {
    if (!canSave) {
      if (!actorUser) setError('กรุณาเลือกผู้ทำรายการก่อนบันทึก');
      else setError('กรุณากรอกข้อมูลให้ครบ');
      return;
    }
    setSaving(true); setError('');
    try {
      await createStockAdjustment(
        { batchId, type, qty: Number(qty), note: note.trim(), branchId: BRANCH_ID },
        { user: actorUser }
      );
      setSuccess(true);
      setTimeout(onSaved, 600);
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  const inputCls = `w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-orange-500`;
  const labelCls = 'block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg border border-[var(--bd)]">
        <button onClick={onClose}
          className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)] flex items-center gap-1.5">
          <ArrowLeft size={14} /> กลับ
        </button>
        <div className="flex-1">
          <h2 className="text-base font-bold text-[var(--tx-heading)]">ปรับสต็อก (manual)</h2>
          <p className="text-xs text-[var(--tx-muted)]">เพิ่ม/ลด qty ต่อ batch — บันทึกเหตุผลเพื่อ audit</p>
        </div>
        <button onClick={handleSave} disabled={!canSave || saving}
          className="px-5 py-2 rounded-lg text-xs font-bold bg-orange-700 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <CheckCircle2 size={14} /> : <Plus size={14} />}
          {saving ? 'กำลังบันทึก' : success ? 'สำเร็จ' : 'บันทึก'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)] space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>สินค้า *</label>
            <select
              value={productId}
              onChange={e => onPickProduct(e.target.value)}
              className={inputCls}
              data-testid="adjust-product-select"
              disabled={availableProductIds === null}
            >
              <option value="">— เลือกสินค้า —</option>
              {/* Phase 15.4 post-deploy s23 — TIER-SCOPED: only products with
                  active batches at this branch/warehouse appear in dropdown.
                  Prevents user from picking branch-only products at central
                  tab (and vice versa). */}
              {availableProducts.map(p => <option key={p.id} value={p.id}>{productDisplayName(p)}</option>)}
            </select>
            {productsLoading && <div className="text-[10px] text-[var(--tx-muted)] mt-1">กำลังโหลดรายการสินค้า...</div>}
            {!productsLoading && availableProductIds !== null && availableProducts.length === 0 && (
              <div className="text-[10px] text-orange-400 mt-1" data-testid="adjust-no-products">
                ⚠ ยังไม่มีสินค้าในคลังนี้ — สร้าง Order นำเข้าก่อน
              </div>
            )}
            {availableProductIds === null && (
              <div className="text-[10px] text-[var(--tx-muted)] mt-1">กำลังโหลดสินค้าในคลังนี้...</div>
            )}
          </div>
          <div>
            <label className={labelCls}>Batch / Lot *</label>
            <select value={batchId} onChange={e => setBatchId(e.target.value)} className={inputCls} disabled={!productId || batchesLoading}>
              <option value="">— เลือก batch —</option>
              {batches.map(b => (
                <option key={b.batchId} value={b.batchId}>
                  ...{b.batchId.slice(-8)} — คงเหลือ {fmtQty(b.qty.remaining)}/{fmtQty(b.qty.total)} {b.unit || ''}
                  {b.expiresAt ? ` (หมด ${b.expiresAt})` : ''}
                </option>
              ))}
            </select>
            {batchesLoading && <div className="text-[10px] text-[var(--tx-muted)] mt-1">กำลังโหลด batch...</div>}
            {productId && !batchesLoading && batches.length === 0 && (
              <div className="text-[10px] text-red-400 mt-1">สินค้านี้ยังไม่มี batch — สร้าง Order ก่อน</div>
            )}
          </div>
        </div>

        {selectedBatch && (
          <div className="p-3 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[11px] text-[var(--tx-muted)] grid grid-cols-4 gap-3">
            <div>คงเหลือ <div className="text-sm font-mono text-[var(--tx-heading)] font-bold">{fmtQty(selectedBatch.qty.remaining)} {selectedBatch.unit}</div></div>
            <div>ทั้งหมด <div className="text-sm font-mono text-[var(--tx-primary)]">{fmtQty(selectedBatch.qty.total)} {selectedBatch.unit}</div></div>
            <div>ต้นทุน/หน่วย <div className="text-sm font-mono text-orange-400">฿{fmtQty(selectedBatch.originalCost)}</div></div>
            <div>หมดอายุ <div className="text-sm text-[var(--tx-primary)]">{selectedBatch.expiresAt || '-'}</div></div>
          </div>
        )}

        <div>
          <label className={labelCls}>ประเภท *</label>
          <div className="flex gap-3">
            <label className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${type === 'add' ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400' : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:border-emerald-700'}`}>
              <input type="radio" name="adjustType" value="add" checked={type === 'add'} onChange={() => setType('add')} className="accent-emerald-500" />
              <Plus size={14} /> เพิ่ม
            </label>
            <label className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${type === 'reduce' ? 'bg-red-900/30 border-red-700 text-red-400' : 'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] hover:border-red-700'}`}>
              <input type="radio" name="adjustType" value="reduce" checked={type === 'reduce'} onChange={() => setType('reduce')} className="accent-red-500" />
              <Minus size={14} /> ลด
            </label>
          </div>
        </div>

        <div>
          <label className={labelCls}>จำนวน *</label>
          <input type="number" min="0" step="0.01" value={qty} onChange={e => setQty(e.target.value)}
            className={inputCls} placeholder="กรอกจำนวนที่ต้องการปรับ" />
          {/* Phase 15.4 item 7 — auto-show unit when batch picked (no confusion) */}
          {selectedBatch && (
            <div className="text-[10px] text-[var(--tx-muted)] mt-1" data-testid="adjust-unit-display">
              หน่วย: <span className="font-bold text-[var(--tx-primary)]">{selectedBatch.unit || '-'}</span>
            </div>
          )}
          {selectedBatch && type === 'reduce' && Number(qty) > Number(selectedBatch.qty.remaining) && (
            <div className="text-[10px] text-red-400 mt-1">⚠ เกินยอดคงเหลือ ({fmtQty(selectedBatch.qty.remaining)})</div>
          )}
        </div>

        <div>
          <label className={labelCls}>หมายเหตุ</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            className={`${inputCls} resize-none`} placeholder="เหตุผลการปรับสต็อก (เช่น นับสต็อก, ของเสีย, คืน vendor)" />
        </div>

        {/* 2026-04-27 actor tracking — required ผู้ทำรายการ picker */}
        <ActorPicker
          value={actorId}
          onChange={setActorId}
          sellers={sellers}
          loading={sellersLoading}
          inputCls={inputCls}
          testId="adjust-create-actor"
        />

        <div className="p-3 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[10px] text-[var(--tx-muted)]">
          ℹ การปรับจะเขียน movement log (type=3 เพิ่ม / type=4 ลด) ไม่สามารถแก้ไขหรือลบทีหลังได้ — ถ้าผิดให้สร้าง adjustment ใหม่ในทิศทางตรงกันข้าม
        </div>
      </div>
    </div>
  );
}
