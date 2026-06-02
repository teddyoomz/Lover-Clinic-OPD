// ─── StockBalancePanel — current stock by product (aggregated across batches)
// Reads be_stock_batches filtered by branchId + status='active', groups by
// productId, sums remaining. Shows FEFO ordering (earliest expiry first).
//
// No Firestore aggregate(sum) query needed — lists active batches once and
// reduces client-side. With <10k active batches this is instant. If the
// clinic ever scales past that, move to backend aggregation.

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { Loader2, Package, AlertTriangle, Search, Plus, SlidersHorizontal, Warehouse, Info, Edit2 } from 'lucide-react';
import { listenToStockBatchesByBranch, listStockLocations, listenToProducts } from '../../lib/scopedDataLayer.js';
import { filterOutSkippedProducts } from '../../lib/skipStockFilter.js';
import { hasExpired, daysToExpiry } from '../../lib/stockUtils.js';
// Phase 17.2 (2026-05-05): legacy-main fallback removed — migration script
// rewrites all legacy `branchId='main'` batches to real branch IDs. Strict
// branchId filter only.
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }

export default function StockBalancePanel({ clinicSettings, theme, onAdjustProduct, onAddStockForProduct, onEditProduct, defaultLocationId, lockLocation }) {
  // V144 (2026-06-02): follow the global top BranchSelector (selectedBranchId)
  // instead of a per-panel "สถานที่" dropdown. The dropdown + auto-pick-branches[0]
  // confused users (two branch selectors out of sync — user: "เอา tab สถานที่
  // ออกไปเลย ให้ขึ้น stock ตาม Branch selector ด้านบนเท่านั้น"). Mirrors how
  // StockAdjustPanel / MovementLogPanel already follow ctxBranchId.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Phase 15.5 / Item 1 (2026-04-28) — per-product warning thresholds replace
  // the old hardcoded 30-day expiry + ≤5 qty UI filters. Three product fields
  // (already in schema; editable via ProductFormModal) drive per-row badges:
  //   - alertDayBeforeExpire   → "ใกล้หมดอายุ" badge when nextExpiry within N days
  //   - alertQtyBeforeOutOfStock → "ใกล้หมด" badge when remaining ≤ N
  //   - alertQtyBeforeMaxStock → "เกินสต็อก" badge when remaining > N
  // Filter checkboxes show only products whose corresponding threshold is
  // currently triggered (products w/o threshold OR not breaching = hidden).
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [showOverStockOnly, setShowOverStockOnly] = useState(false);
  // Phase 15.7 (2026-04-28) — negative-stock filter. The user-facing list
  // ("ยอดคงเหลือ") needs a way to surface products whose totalRemaining is
  // below zero (introduced by the new negative-stock allowance in
  // _deductOneItem). Filter is checkbox-driven and shows ONLY rows where
  // sum(batches[i].qty.remaining) < 0.
  const [showNegativeStockOnly, setShowNegativeStockOnly] = useState(false);
  // V144 (2026-06-02) — out-of-stock filter. The balance table had 4 filters
  // (near-expiry / low / over / negative) but NO "หมด" filter even though the
  // "หมด" badge already renders at totalRemaining === 0. User: "มี filter
  // เยอะแยะ แต่ไม่มี filter สินค้าที่หมดแล้ว". Shows ONLY rows where
  // sum(batches[i].qty.remaining) === 0 (negative <0 has its own ติดลบ filter).
  const [showOutOfStockOnly, setShowOutOfStockOnly] = useState(false);
  // Phase 17.2 (2026-05-05): no synthetic 'main' default — initial empty list,
  // populated from listStockLocations() once branches arrive.
  const [locations, setLocations] = useState([]);
  // Phase 15.5 / Item 1 — per-product threshold lookup map keyed by productId
  // Shape: { [productId]: { alertDayBeforeExpire, alertQtyBeforeOutOfStock, alertQtyBeforeMaxStock } }
  const [productThresholdMap, setProductThresholdMap] = useState({});
  // V35.2-bis (2026-04-28) — clarification from user: "batch ที่หมายถึง
  // หมายถึง lot ที่นำเข้าแล้ววันหมดอายุมันต่างกันอะ ที่เวลากดเข้าไปหน้า
  // ปรับสต็อคอันไหนมี lot มากกว่า 1 ก็จะสามารถเลือกปรับแต่งตาม lot ได้
  // แบบนั้นแหละที่ผมจะหมายถึง เพื่อให้โชว์ในตารางยอดคงเหลือ".
  // → Admin wants to see PER-LOT detail in balance table (each lot has
  // its own expiry + remaining qty). Implementation: clickable batches
  // count → expand row to show one sub-row per lot with FEFO sort.
  // Track which productIds are expanded.
  const [expandedRows, setExpandedRows] = useState({});
  const toggleExpandRow = useCallback((pid) => {
    setExpandedRows(prev => ({ ...prev, [String(pid)]: !prev[String(pid)] }));
  }, []);
  // V144 (2026-06-02) — locationId is DERIVED, not state. The branch balance
  // view follows the global top BranchSelector (selectedBranchId); the central
  // warehouse view (lockLocation, from CentralStockTab) stays pinned to
  // defaultLocationId. This replaces the per-panel dropdown + the
  // auto-pick-branches[0] state machine (both removed). The V143-ter live
  // listener (keyed on [locationId]) re-subscribes when the value changes —
  // so switching branch in the top selector refreshes this table.
  const locationId = lockLocation ? (defaultLocationId || '') : (selectedBranchId || '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locs = await listStockLocations();
        if (!cancelled && Array.isArray(locs) && locs.length) setLocations(locs);
      } catch (e) { console.error('[StockBalance] listStockLocations failed:', e); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Phase 15.5 / Item 1 — load product threshold map (alertDayBeforeExpire +
  // alertQtyBeforeOutOfStock + alertQtyBeforeMaxStock per productId).
  // Used to drive per-row warning badges + filter logic.
  //
  // Phase 15.6 / V35.2 (2026-04-28) — also store product.productName so the
  // panel renders the CANONICAL product name (from be_products) instead of
  // the denormalized batch.productName which is often stale or junky after
  // ProClinic re-syncs (e.g. batch shows "Acetin 6" while product name is
  // "Acetin"; user searched Products tab for "Acetin 6", got nothing,
  // concluded phantom). Also tracks productId set so balance panel can
  // FILTER OUT batches whose productId is not in be_products (FK violation
  // shouldn't render even if the batch survived; defense-in-depth on top of
  // Phase 15.6 cleanup endpoint + write-time _assertProductExists).
  // V43-followup (2026-05-19 NIGHT+5 EOD+1) — onSnapshot LIVE listener via
  // listenToProducts (BS-18). Replaces the prior one-shot listProducts() so
  // toggling skipStockDeduction in ProductFormModal causes the row to
  // disappear from this balance table INSTANTLY (no page refresh required).
  // Also surfaces canonicalName + alert thresholds + skipStockDeduction in
  // the threshold map for the products useMemo to consume.
  useEffect(() => {
    const numOrNull = (v) => (v == null || v === '') ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
    const unsub = listenToProducts({}, (products) => {
      const map = {};
      for (const p of (Array.isArray(products) ? products : [])) {
        const pid = String(p?.id ?? p?.productId ?? '');
        if (!pid) continue;
        map[pid] = {
          alertDayBeforeExpire: numOrNull(p.alertDayBeforeExpire),
          alertQtyBeforeOutOfStock: numOrNull(p.alertQtyBeforeOutOfStock),
          alertQtyBeforeMaxStock: numOrNull(p.alertQtyBeforeMaxStock),
          // Canonical name from be_products (preferred over batch.productName)
          canonicalName: String(p.productName || p.name || '').trim(),
          // V43-followup — surface the flag so the products useMemo can
          // filter via filterOutSkippedProducts.
          skipStockDeduction: p.skipStockDeduction === true,
        };
      }
      setProductThresholdMap(map);
    }, (err) => {
      console.error('[StockBalance] listenToProducts failed:', err);
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // V35.2-bis: cross-tier map removed — user clarified they want per-lot
  // detail (NOT cross-tier counts). Per-lot detail surfaced via expandable
  // rows below; no extra Firestore query needed (panel already has all
  // location-scoped batches loaded; .batches array IS the lot list).

  // V143-ter (2026-05-31) — LIVE listener (Task B real-time). Replaces the prior
  // one-shot listStockBatches getDocs so a deduction from ANY surface (treatment /
  // sale / adjust / import) on ANY device updates THIS open page for ALL viewers
  // INSTANTLY — no manual reload. User: "หน้ายอดคงเหลือไม่แสดง real time ... ทุกคน
  // ที่เปิดหน้านี้ต้องเห็นเหมือนกันแบบ real time ทันที".
  // V143 filter preserved (AV166): keep status ∈ {active, depleted} —
  // `resolveBatchStatusForRemaining` flips a batch to 'depleted' at remaining===0
  // (clearing a negative to exactly 0, or a positive draining to 0), and including
  // 'depleted' shows the product at 0/"หมด" instead of vanishing. 'cancelled'/
  // 'expired' stay excluded (voided import / past-expiry — not current stock).
  // Re-subscribes on locationId change. AV167.
  useEffect(() => {
    if (!locationId) { setBatches([]); setLoading(false); return undefined; }
    setLoading(true);
    const unsub = listenToStockBatchesByBranch({ branchId: locationId }, (list) => {
      const visible = (Array.isArray(list) ? list : []).filter(b => b.status === 'active' || b.status === 'depleted');
      setBatches(visible);
      setLoading(false);
    }, (e) => { console.error('[StockBalance] live listener failed:', e); setBatches([]); setLoading(false); });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [locationId]);

  const currentLocation = locations.find(l => l.id === locationId) || { name: locationId, kind: 'branch' };
  const isCentral = currentLocation.kind === 'central';

  // Group by productId, sum remaining + attach per-product warning thresholds.
  // Phase 15.5 / Item 1 (2026-04-28): each row carries alertDayBeforeExpire +
  // alertQtyBeforeOutOfStock + alertQtyBeforeMaxStock pulled from the per-
  // product threshold map. Filter checkboxes use these thresholds; row badges
  // render based on whether each threshold is breached.
  // V35.2-quinquies (2026-04-28) — read-side FK gate REVERTED.
  // Reason: productThresholdMap is loaded once on mount; products imported
  // AFTER mount weren't in the map → their batches were filtered out. User
  // report: "ปุ่มสร้าง Order ใหม่ ของสต็อคสาขา ไม่สามารถนำเข้าของเข้าคลังสาขา
  // ได้จริง ยอดในหน้าคงเหลือไม่เปลี่ยนแปลง ... แต่มีปรากฏใน movement log".
  // Truth: import succeeded (movement written + batch written) but balance
  // panel filtered the batch out because the product wasn't in the stale
  // map. Phantom-product prevention is now solely write-side via
  // _assertProductExists (V35.2 in backendClient.js) + cleanup endpoints.
  const products = useMemo(() => {
    const byProduct = new Map();
    for (const b of batches) {
      if (!b.productId) continue;
      // Threshold lookup (no longer used to FILTER; only for canonical name + thresholds).
      const tEntry = productThresholdMap[String(b.productId)];
      if (!byProduct.has(b.productId)) {
        // V35.2 — prefer canonical product.productName over batch.productName
        // (denormalized; often junky after re-syncs e.g. "Acetin 6" vs canonical "Acetin")
        const displayName = (tEntry?.canonicalName) || b.productName || '';
        byProduct.set(b.productId, {
          productId: b.productId,
          productName: displayName,
          unit: b.unit,
          totalRemaining: 0,
          totalCapacity: 0,
          batches: [],
          nextExpiry: null,
          expired: 0,
          valueCost: 0,
          // Phase 15.5 / Item 1 — per-product warning thresholds (null if unset)
          alertDayBeforeExpire: tEntry?.alertDayBeforeExpire ?? null,
          alertQtyBeforeOutOfStock: tEntry?.alertQtyBeforeOutOfStock ?? null,
          alertQtyBeforeMaxStock: tEntry?.alertQtyBeforeMaxStock ?? null,
          // V43-followup — stamp the flag on each row so filterOutSkippedProducts works
          skipStockDeduction: tEntry?.skipStockDeduction === true,
        });
      }
      const p = byProduct.get(b.productId);
      p.totalRemaining += Number(b.qty?.remaining || 0);
      p.totalCapacity += Number(b.qty?.total || 0);
      p.batches.push(b);
      p.valueCost += Number(b.qty?.remaining || 0) * Number(b.originalCost || 0);
      if (hasExpired(b)) p.expired += Number(b.qty?.remaining || 0);
      if (b.expiresAt) {
        if (!p.nextExpiry || b.expiresAt < p.nextExpiry) p.nextExpiry = b.expiresAt;
      }
    }
    // Sort batches inside each product by FEFO (expiresAt ASC, null last)
    for (const p of byProduct.values()) {
      p.batches.sort((a, b) => {
        const ae = a.expiresAt || '9999-99-99';
        const be = b.expiresAt || '9999-99-99';
        return ae.localeCompare(be);
      });
    }
    // V43-followup (2026-05-19 NIGHT+5 EOD+1) — filter out products flagged
    // skipStockDeduction:true via the single-source helper (AV97 invariant).
    // The flag is stamped on each row inside the groupBy loop above so the
    // helper can read it directly (Rule O single-source contract).
    const visibleRows = filterOutSkippedProducts(Array.from(byProduct.values()));
    return visibleRows.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
  }, [batches, productThresholdMap]);

  // Phase 15.5 / Item 1 — pure helpers exported on shape for testability.
  // Each returns true when the per-product threshold is configured AND breached.
  const isExpiryWarning = useCallback((p) => {
    if (p.alertDayBeforeExpire == null) return false;
    if (!p.nextExpiry) return false;
    const days = (new Date(p.nextExpiry).getTime() - Date.now()) / 86400000;
    return days <= Number(p.alertDayBeforeExpire);
  }, []);
  const isLowStockWarning = useCallback((p) => {
    if (p.alertQtyBeforeOutOfStock == null) return false;
    return Number(p.totalRemaining) <= Number(p.alertQtyBeforeOutOfStock) && Number(p.totalRemaining) > 0;
  }, []);
  const isOverStockWarning = useCallback((p) => {
    if (p.alertQtyBeforeMaxStock == null) return false;
    return Number(p.totalRemaining) > Number(p.alertQtyBeforeMaxStock);
  }, []);
  // Phase 15.7 (2026-04-28) — negative stock badge predicate. Triggered
  // when totalRemaining < 0 (set by Phase 15.7 negative-stock allowance
  // in _deductOneItem). Distinct from "หมด" (=0) so admin sees DEBT
  // (need to import/transfer/adjust to repay) vs OUT-OF-STOCK (just need
  // to import). Highest-priority badge in row render.
  const isNegativeStockWarning = useCallback((p) => {
    return Number(p.totalRemaining) < 0;
  }, []);
  // V144 (2026-06-02) — out-of-stock predicate. Exactly 0 (matches the "หมด"
  // badge at line ~414: outOfStock = !isNegative && totalRemaining <= 0 ===
  // totalRemaining === 0). Negative (<0) is excluded — covered by ติดลบ.
  const isOutOfStock = useCallback((p) => {
    return Number(p.totalRemaining) === 0;
  }, []);

  const displayed = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => (p.productName || '').toLowerCase().includes(q) || String(p.productId).includes(q));
    }
    // Phase 15.5 / Item 1 — filters now use per-product thresholds.
    // Products without a configured threshold for a given dimension are
    // hidden from that dimension's filter (no false positives).
    if (showExpiringOnly) list = list.filter(isExpiryWarning);
    if (showLowStockOnly) list = list.filter(isLowStockWarning);
    if (showOverStockOnly) list = list.filter(isOverStockWarning);
    // Phase 15.7 — negative-stock filter (totalRemaining < 0)
    if (showNegativeStockOnly) list = list.filter(isNegativeStockWarning);
    // V144 — out-of-stock filter (totalRemaining === 0)
    if (showOutOfStockOnly) list = list.filter(isOutOfStock);
    return list;
  }, [products, search, showExpiringOnly, showLowStockOnly, showOverStockOnly, showNegativeStockOnly, showOutOfStockOnly, isExpiryWarning, isLowStockWarning, isOverStockWarning, isNegativeStockWarning, isOutOfStock]);

  const totalValue = useMemo(() => products.reduce((s, p) => s + p.valueCost, 0), [products]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${isCentral ? 'bg-orange-900/30 border border-orange-800' : 'bg-emerald-900/30 border border-emerald-800'}`}>
            {isCentral ? <Warehouse size={22} className="text-orange-400" /> : <Package size={22} className="text-emerald-400" />}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--tx-heading)]">
              ยอดคงเหลือ — {currentLocation.name}
              {isCentral && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-orange-900/30 text-orange-400 border border-orange-800">คลังกลาง</span>}
            </h2>
            <p className="text-xs text-[var(--tx-muted)]">
              {products.length} สินค้า • {batches.length} batches • มูลค่าต้นทุนรวม <span className="font-mono text-orange-400">฿{fmtQty(totalValue)}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* V144 (2026-06-02) — per-panel "สถานที่" dropdown REMOVED. The branch
              balance follows the global top BranchSelector; the central view is
              pinned via lockLocation+defaultLocationId. No second selector. */}
          <div className="flex-1 relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาสินค้า..."
              className="w-full pl-9 pr-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]" />
          </div>
          {/* Phase 15.5 / Item 1 — filter labels reflect that thresholds are
              per-product (set via ProductFormModal alertDayBeforeExpire +
              alertQtyBeforeOutOfStock + alertQtyBeforeMaxStock). Products
              without a threshold for a dimension don't appear under that filter. */}
          <label className="flex items-center gap-2 text-[11px] text-[var(--tx-muted)] cursor-pointer" data-testid="filter-near-expiry">
            <input type="checkbox" checked={showExpiringOnly} onChange={e => setShowExpiringOnly(e.target.checked)} className="accent-orange-500" />
            ใกล้หมดอายุ (ตั้งใน <em>แจ้งก่อนหมดอายุ</em>)
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[var(--tx-muted)] cursor-pointer" data-testid="filter-low-stock">
            <input type="checkbox" checked={showLowStockOnly} onChange={e => setShowLowStockOnly(e.target.checked)} className="accent-red-500" />
            ใกล้หมด (ตั้งใน <em>แจ้งใกล้หมด</em>)
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[var(--tx-muted)] cursor-pointer" data-testid="filter-over-stock">
            <input type="checkbox" checked={showOverStockOnly} onChange={e => setShowOverStockOnly(e.target.checked)} className="accent-violet-500" />
            เกินสต็อก (ตั้งใน <em>แจ้งเกินสต็อก</em>)
          </label>
          {/* Phase 15.7 (2026-04-28) — negative-stock filter. Surfaces
              products whose totalRemaining < 0 (debt). Admin can drill in
              and use Adjust ADD / Transfer In / Receive Import / Withdrawal
              Receive to repay the debt. */}
          <label className="flex items-center gap-2 text-[11px] text-rose-300 cursor-pointer" data-testid="filter-negative-stock">
            <input type="checkbox" checked={showNegativeStockOnly} onChange={e => setShowNegativeStockOnly(e.target.checked)} className="accent-rose-500" />
            ติดลบ (ต้องเติมสต็อค)
          </label>
          {/* V144 (2026-06-02) — out-of-stock filter. Surfaces products whose
              totalRemaining === 0 ("หมด"). Distinct from ติดลบ (<0). Red accent
              matches the existing "หมด" row badge. */}
          <label className="flex items-center gap-2 text-[11px] text-red-300 cursor-pointer" data-testid="filter-out-of-stock">
            <input type="checkbox" checked={showOutOfStockOnly} onChange={e => setShowOutOfStockOnly(e.target.checked)} className="accent-red-500" />
            หมด (คงเหลือ 0)
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)]">
          <Package size={32} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-xs text-[var(--tx-muted)]">
            {products.length === 0 ? 'ยังไม่มีสต็อก — สร้าง Order นำเข้าก่อน' : 'ไม่พบสินค้าตามเงื่อนไข'}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl overflow-x-auto shadow-lg border border-[var(--bd)]">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left font-bold">สินค้า</th>
                <th className="px-3 py-2 text-center font-bold w-16">Batches</th>
                <th className="px-3 py-2 text-right font-bold w-24">คงเหลือ</th>
                {/* V35.2-tris (2026-04-28) — column now displays per-product
                    "แจ้งเกินสต็อก" threshold (alertQtyBeforeMaxStock) directly.
                    User: "แถวของความจุ ให้แสดง แจ้งเกินสต็อก (qty) ของสินค้า
                    นั้นๆเลย ไม่ต้องแสดงเป้าหมายอะไรแล้ว". '-' when unset. */}
                <th className="px-3 py-2 text-right font-bold w-28" data-testid="th-capacity">
                  <span title="ค่า 'แจ้งเกินสต็อก' (max-stock alert qty) ที่ตั้งในข้อมูลสินค้า — ปรับใน ProductFormModal. ' - ' = ยังไม่ได้ตั้งค่า" className="inline-flex items-center gap-1 cursor-help">
                    ความจุ <Info size={10} aria-hidden className="text-[var(--tx-muted)]" />
                  </span>
                </th>
                <th className="px-3 py-2 text-right font-bold w-28">มูลค่าทุน</th>
                <th className="px-3 py-2 text-center font-bold w-28">หมดอายุถัดไป</th>
                <th className="px-3 py-2 text-center font-bold w-28">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(p => {
                const days = p.nextExpiry ? Math.floor((new Date(p.nextExpiry).getTime() - Date.now()) / 86400000) : null;
                // Phase 15.5 / Item 1 — expiry color uses per-product threshold
                // (alertDayBeforeExpire) instead of hardcoded 30. If threshold
                // unset, expiry text stays neutral (admin must opt-in).
                const expiryThreshold = p.alertDayBeforeExpire;
                const isExpiring = expiryThreshold != null && days != null && days >= 0 && days <= Number(expiryThreshold);
                const expiryClass = days == null ? 'text-[var(--tx-muted)]' :
                  days < 0 ? 'text-red-400 font-bold' :
                  isExpiring ? 'text-orange-400' :
                  'text-[var(--tx-primary)]';
                // Phase 15.5 / Item 1 — qty badges now use per-product thresholds.
                // Phase 15.7 — outOfStock (=== 0 exactly) split from negative
                // (< 0). They're different states: out-of-stock means "buy more",
                // negative means "buy more AND repay accounting debt".
                const isNegative = isNegativeStockWarning(p);
                const outOfStock = !isNegative && p.totalRemaining <= 0;
                const isLow = isLowStockWarning(p);
                const isOver = isOverStockWarning(p);
                const isExpanded = !!expandedRows[String(p.productId)];
                return (
                  <Fragment key={p.productId}>
                  <tr className="border-t border-[var(--bd)] hover:bg-[var(--bg-hover)]" title={`Batches:\n${p.batches.map(b => `  …${b.batchId.slice(-8)}: ${fmtQty(b.qty.remaining)} ${b.unit || ''} (exp ${b.expiresAt || '-'})`).join('\n')}`} data-testid="balance-row">
                    <td className="px-3 py-2 text-[var(--tx-primary)]">
                      {p.productName || `Product ${p.productId}`}
                      {/* Phase 15.7 — ติดลบ badge has highest priority. Visually
                          distinct (rose, bold, ALL CAPS feel) so admin spots
                          the debt at a glance. Not shown alongside หมด — the
                          two states are mutually exclusive (see isNegative
                          gate above). */}
                      {isNegative && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-rose-900/40 text-rose-300 border border-rose-700/60 font-bold" data-testid="badge-negative-stock" title="สต็อคติดลบ — ตัดเกินคงเหลือ ต้องนำเข้า/โอนเข้า/ปรับเพิ่ม/รับเบิกเข้า เพื่อเติม">ติดลบ</span>}
                      {outOfStock && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-red-900/30 text-red-400 border border-red-800" data-testid="badge-out-of-stock">หมด</span>}
                      {isLow && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-orange-900/30 text-orange-400 border border-orange-800" data-testid="badge-low-stock">ใกล้หมด</span>}
                      {isOver && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-violet-900/30 text-violet-400 border border-violet-800" data-testid="badge-over-stock">เกินสต็อก</span>}
                      {isExpiring && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-orange-900/30 text-orange-400 border border-orange-800" data-testid="badge-near-expiry">ใกล้หมดอายุ</span>}
                    </td>
                    <td className="px-3 py-2 text-center" data-testid="td-batches">
                      {/* V35.2-bis — clickable batches count → expand per-lot detail
                          inline. User: "batch หมายถึง lot ที่นำเข้าแล้ววันหมดอายุ
                          มันต่างกัน". Multi-lot products (>1 batch) show button.
                          Single-lot products show plain text (no expansion needed). */}
                      {p.batches.length > 1 ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpandRow(p.productId); }}
                          className="px-2 py-0.5 rounded text-[10px] bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 border border-rose-800 hover:border-rose-600 inline-flex items-center gap-1"
                          data-testid="balance-expand-lots"
                        >
                          {p.batches.length} lots
                          <span className="text-[8px]">{expandedRows[String(p.productId)] ? '▲' : '▼'}</span>
                        </button>
                      ) : (
                        <span className="text-[var(--tx-muted)]">{p.batches.length}</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-bold ${isNegative ? 'text-rose-400' : 'text-emerald-400'}`}
                      data-testid="balance-row-total"
                      title={isNegative ? 'สต็อคติดลบ — ต้องนำเข้า/โอน/ปรับ/เบิกเข้า เพื่อปรับยอด' : undefined}
                    >
                      {fmtQty(p.totalRemaining)} {p.unit}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--tx-muted)]" data-testid="td-capacity">
                      {/* V35.2-tris (2026-04-28) — column now shows the per-product
                          QtyBeforeMaxStock threshold directly (not batch.qty.total).
                          User: "แถวของความจุ ให้แสดง แจ้งเกินสต็อก (qty) ของสินค้า
                          นั้นๆเลย ไม่ต้องแสดงเป้าหมายอะไรแล้ว". '-' when threshold unset. */}
                      {p.alertQtyBeforeMaxStock != null ? fmtQty(p.alertQtyBeforeMaxStock) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-orange-400">฿{fmtQty(p.valueCost)}</td>
                    <td className={`px-3 py-2 text-center ${expiryClass}`}>
                      {p.nextExpiry || '-'}
                      {days != null && <div className="text-[9px]">{days < 0 ? `หมดแล้ว ${-days}d` : `อีก ${days}d`}</div>}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button
                        onClick={e => { e.stopPropagation(); onAdjustProduct?.(p); }}
                        title="ปรับสต็อก (+/-)"
                        className="px-2 py-1 rounded text-[10px] bg-orange-900/20 hover:bg-orange-900/40 text-orange-400 border border-orange-800 hover:border-orange-600 inline-flex items-center gap-1 mr-1">
                        <SlidersHorizontal size={10} /> ปรับ
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onAddStockForProduct?.(p); }}
                        title="สั่งของเพิ่ม (สร้าง Order)"
                        className="px-2 py-1 rounded text-[10px] bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 border border-rose-800 hover:border-rose-600 inline-flex items-center gap-1">
                        <Plus size={10} /> เพิ่ม
                      </button>
                      {/* V43-followup (2026-05-19 NIGHT+5 EOD+1) — Edit shortcut.
                          Opens ProductFormModal owned by parent (StockTab /
                          CentralStockTab) so toggling skipStockDeduction → live
                          update via Layer 2 listenToProducts. Sky-blue tint
                          differentiates from red destructive ปรับ + เพิ่ม.
                          Rightmost per Q2=B. Wrapped in onEditProduct guard so
                          parents that don't pass the callback degrade cleanly. */}
                      {onEditProduct && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onEditProduct(p); }}
                          title="แก้ไขข้อมูลสินค้า"
                          className="ml-1 px-2 py-1 rounded text-[10px] bg-sky-900/20 hover:bg-sky-900/40 text-sky-400 border border-sky-800 hover:border-sky-600 inline-flex items-center gap-1"
                          data-testid={`stock-balance-edit-${p.productId}`}
                          aria-label={`แก้ไขสินค้า ${p.productName || ''}`}
                        >
                          <Edit2 size={10} /> แก้ไข
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* V35.2-bis — expanded per-lot detail rows (FEFO sorted).
                      Shows lot id (last 8), qty (remaining/total), expiry,
                      cost. Admin can adjust per-lot via รายการ adjust panel. */}
                  {isExpanded && p.batches.length > 1 && p.batches.map((b, bi) => {
                    const lotDays = b.expiresAt ? Math.floor((new Date(b.expiresAt).getTime() - Date.now()) / 86400000) : null;
                    const lotExpClass = lotDays == null ? 'text-[var(--tx-muted)]' :
                      lotDays < 0 ? 'text-red-400 font-bold' :
                      'text-[var(--tx-primary)]';
                    return (
                      <tr key={`${p.productId}-lot-${b.batchId || bi}`} className="border-t border-[var(--bd)] bg-[var(--bg-hover)]/30" data-testid="balance-lot-row">
                        <td className="px-3 py-1 pl-8 text-[10px] text-[var(--tx-muted)]" colSpan={2}>
                          ↳ Lot …{String(b.batchId || '').slice(-8)}
                          {b.isPremium && <span className="ml-1 px-1 rounded text-[8px] bg-rose-900/30 text-rose-400 border border-rose-800">premium</span>}
                        </td>
                        <td className="px-3 py-1 text-right font-mono text-[11px] text-emerald-400">{fmtQty(b.qty?.remaining || 0)} {b.unit || ''}</td>
                        <td className="px-3 py-1 text-right font-mono text-[10px] text-[var(--tx-muted)]">{fmtQty(b.qty?.total || 0)}</td>
                        <td className="px-3 py-1 text-right font-mono text-[10px] text-orange-400">฿{fmtQty((b.qty?.remaining || 0) * (b.originalCost || 0))}</td>
                        <td className={`px-3 py-1 text-center text-[11px] ${lotExpClass}`}>
                          {b.expiresAt || '-'}
                          {lotDays != null && <div className="text-[8px]">{lotDays < 0 ? `หมดแล้ว ${-lotDays}d` : `อีก ${lotDays}d`}</div>}
                        </td>
                        <td className="px-3 py-1 text-center text-[10px] text-[var(--tx-muted)]">@฿{fmtQty(b.originalCost || 0)}/หน่วย</td>
                      </tr>
                    );
                  })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
