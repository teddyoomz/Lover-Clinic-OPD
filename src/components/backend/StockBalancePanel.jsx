// ─── StockBalancePanel — current stock by product (aggregated across batches)
// Reads be_stock_batches filtered by branchId + status='active', groups by
// productId, sums remaining. Shows FEFO ordering (earliest expiry first).
//
// No Firestore aggregate(sum) query needed — lists active batches once and
// reduces client-side. With <10k active batches this is instant. If the
// clinic ever scales past that, move to backend aggregation.

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { Loader2, Package, AlertTriangle, Search, Plus, SlidersHorizontal, Warehouse, Info } from 'lucide-react';
import { listStockBatches, listStockLocations, listProducts } from '../../lib/backendClient.js';
import { hasExpired, daysToExpiry } from '../../lib/stockUtils.js';
// Phase 15.6 (2026-04-28) — legacy-main fallback for default-branch view.
// Mirrors MovementLogPanel pattern (which has had this since Phase 15.4 s19).
// Without this, batches written with branchId='main' (pre-V20 / legacy seed)
// disappear from the balance panel when admin views default branch BR-XXX.
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }

export default function StockBalancePanel({ clinicSettings, theme, onAdjustProduct, onAddStockForProduct, defaultLocationId, lockLocation }) {
  // Phase 15.6 (2026-04-28) — branches list for default-branch detection
  // (legacy-main fallback decision). useSelectedBranch is the canonical
  // source of branch metadata (matches MovementLogPanel:107–112 pattern).
  const { branches } = useSelectedBranch();
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
  const [locations, setLocations] = useState([{ id: 'main', name: 'สาขาหลัก', kind: 'branch' }]);
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
  // Phase 15.1 (2026-04-27) — defaultLocationId pre-selects a specific
  // location (e.g. central warehouse from CentralStockTab). lockLocation
  // hides the dropdown when caller wants the location fixed.
  const [locationId, setLocationId] = useState(defaultLocationId || 'main');

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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const products = await listProducts();
        if (cancelled) return;
        const map = {};
        for (const p of (Array.isArray(products) ? products : [])) {
          const pid = String(p?.id ?? p?.productId ?? '');
          if (!pid) continue;
          const numOrNull = (v) => (v == null || v === '') ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
          map[pid] = {
            alertDayBeforeExpire: numOrNull(p.alertDayBeforeExpire),
            alertQtyBeforeOutOfStock: numOrNull(p.alertQtyBeforeOutOfStock),
            alertQtyBeforeMaxStock: numOrNull(p.alertQtyBeforeMaxStock),
            // Canonical name from be_products (preferred over batch.productName)
            canonicalName: String(p.productName || p.name || '').trim(),
          };
        }
        setProductThresholdMap(map);
      } catch (e) {
        console.error('[StockBalance] listProducts threshold-map failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // V35.2-bis: cross-tier map removed — user clarified they want per-lot
  // detail (NOT cross-tier counts). Per-lot detail surfaced via expandable
  // rows below; no extra Firestore query needed (panel already has all
  // location-scoped batches loaded; .batches array IS the lot list).

  // Phase 15.1 — sync locationId when caller updates defaultLocationId
  // (e.g. CentralStockTab loads warehouses async then passes the first one).
  useEffect(() => {
    if (defaultLocationId && defaultLocationId !== locationId) {
      setLocationId(defaultLocationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultLocationId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Phase 15.6 (Issue 1, 2026-04-28) — legacy-main fallback for default-branch
      // view. Pre-V20 / legacy seed batches were written with branchId='main'.
      // Without this opt-in, default-branch BR-XXX view filters them out → admin
      // sees movement log entries but empty balance row. Mirrors MovementLogPanel
      // pattern. Gate: NOT central tier AND (locationId='main' OR isDefault branch).
      const currentLoc = locations.find(l => l.id === locationId) || { kind: 'branch' };
      const isCentralLoc = currentLoc.kind === 'central';
      const includeLegacyMain = !isCentralLoc && (
        String(locationId) === 'main' ||
        (Array.isArray(branches) && branches.some(
          (b) => (b.branchId || b.id) === locationId && b.isDefault === true
        ))
      );
      const list = await listStockBatches({ branchId: locationId, status: 'active', includeLegacyMain });
      setBatches(list);
    } catch (e) { console.error('[StockBalance] load failed:', e); setBatches([]); }
    finally { setLoading(false); }
  }, [locationId, locations, branches]);

  useEffect(() => { load(); }, [load]);

  const currentLocation = locations.find(l => l.id === locationId) || { name: locationId, kind: 'branch' };
  const isCentral = currentLocation.kind === 'central';

  // Group by productId, sum remaining + attach per-product warning thresholds.
  // Phase 15.5 / Item 1 (2026-04-28): each row carries alertDayBeforeExpire +
  // alertQtyBeforeOutOfStock + alertQtyBeforeMaxStock pulled from the per-
  // product threshold map. Filter checkboxes use these thresholds; row badges
  // render based on whether each threshold is breached.
  // V35.2 (2026-04-28) — gate: only filter batches by FK once productThresholdMap
  // has loaded. Initial render before listProducts() resolves gets empty map,
  // which would otherwise hide ALL batches. mapLoaded sentinel checks that
  // the map has at least one entry (any clinic with batches has products).
  const mapLoaded = Object.keys(productThresholdMap).length > 0;
  const products = useMemo(() => {
    const byProduct = new Map();
    for (const b of batches) {
      if (!b.productId) continue;
      // Phase 15.6 / V35.2 (2026-04-28) — defense-in-depth FK gate at READ side.
      // User report: "ทำไม Acetin 6 กับ Aloe gel 010 และสินค้าอื่นๆที่ไม่มีใน
      // database สินค้าของเรา ยังมาปรากฎในหน้าคงเหลือ ถ้าไม่มีในระบบสินค้าให้
      // ลบทิ้งไปเลย ห้ามมาปรากฎ". Even if a batch's productId references a
      // be_products doc that's been deleted (race; or dev wrote a batch via
      // a path that bypassed _assertProductExists), don't render it.
      const tEntry = productThresholdMap[String(b.productId)];
      if (mapLoaded && !tEntry) continue; // productId NOT in be_products → hide
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
    return Array.from(byProduct.values()).sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
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
    return list;
  }, [products, search, showExpiringOnly, showLowStockOnly, showOverStockOnly, isExpiryWarning, isLowStockWarning, isOverStockWarning]);

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
          {!lockLocation && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-wider text-[var(--tx-muted)] font-bold">สถานที่:</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)}
                className="px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-rose-500 min-w-[180px]">
                {locations.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}{l.kind === 'central' ? ' (คลังกลาง)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
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
                const outOfStock = p.totalRemaining <= 0;
                const isLow = isLowStockWarning(p);
                const isOver = isOverStockWarning(p);
                const isExpanded = !!expandedRows[String(p.productId)];
                return (
                  <Fragment key={p.productId}>
                  <tr className="border-t border-[var(--bd)] hover:bg-[var(--bg-hover)]" title={`Batches:\n${p.batches.map(b => `  …${b.batchId.slice(-8)}: ${fmtQty(b.qty.remaining)} ${b.unit || ''} (exp ${b.expiresAt || '-'})`).join('\n')}`} data-testid="balance-row">
                    <td className="px-3 py-2 text-[var(--tx-primary)]">
                      {p.productName || `Product ${p.productId}`}
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
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">{fmtQty(p.totalRemaining)} {p.unit}</td>
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
