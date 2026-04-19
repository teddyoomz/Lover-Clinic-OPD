// ─── StockBalancePanel — current stock by product (aggregated across batches)
// Reads be_stock_batches filtered by branchId + status='active', groups by
// productId, sums remaining. Shows FEFO ordering (earliest expiry first).
//
// No Firestore aggregate(sum) query needed — lists active batches once and
// reduces client-side. With <10k active batches this is instant. If the
// clinic ever scales past that, move to backend aggregation.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Package, AlertTriangle, Search, Plus, SlidersHorizontal, Warehouse } from 'lucide-react';
import { listStockBatches, listStockLocations } from '../../lib/backendClient.js';
import { hasExpired, daysToExpiry } from '../../lib/stockUtils.js';

function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }

export default function StockBalancePanel({ clinicSettings, theme, onAdjustProduct, onAddStockForProduct }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [locations, setLocations] = useState([{ id: 'main', name: 'สาขาหลัก', kind: 'branch' }]);
  const [locationId, setLocationId] = useState('main');

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listStockBatches({ branchId: locationId, status: 'active' });
      setBatches(list);
    } catch (e) { console.error('[StockBalance] load failed:', e); setBatches([]); }
    finally { setLoading(false); }
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  const currentLocation = locations.find(l => l.id === locationId) || { name: locationId, kind: 'branch' };
  const isCentral = currentLocation.kind === 'central';

  // Group by productId, sum remaining
  const products = useMemo(() => {
    const byProduct = new Map();
    for (const b of batches) {
      if (!b.productId) continue;
      if (!byProduct.has(b.productId)) {
        byProduct.set(b.productId, {
          productId: b.productId,
          productName: b.productName,
          unit: b.unit,
          totalRemaining: 0,
          totalCapacity: 0,
          batches: [],
          nextExpiry: null,
          expired: 0,
          valueCost: 0,
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
  }, [batches]);

  const displayed = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => (p.productName || '').toLowerCase().includes(q) || String(p.productId).includes(q));
    }
    if (showExpiringOnly) {
      const now = Date.now();
      list = list.filter(p => {
        if (!p.nextExpiry) return false;
        const days = (new Date(p.nextExpiry).getTime() - now) / 86400000;
        return days <= 30;
      });
    }
    if (showLowStockOnly) {
      list = list.filter(p => p.totalRemaining <= 5);
    }
    return list;
  }, [products, search, showExpiringOnly, showLowStockOnly]);

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
          <div className="flex-1 relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาสินค้า..."
              className="w-full pl-9 pr-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]" />
          </div>
          <label className="flex items-center gap-2 text-[11px] text-[var(--tx-muted)] cursor-pointer">
            <input type="checkbox" checked={showExpiringOnly} onChange={e => setShowExpiringOnly(e.target.checked)} className="accent-orange-500" />
            ใกล้หมดอายุ (≤30 วัน)
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[var(--tx-muted)] cursor-pointer">
            <input type="checkbox" checked={showLowStockOnly} onChange={e => setShowLowStockOnly(e.target.checked)} className="accent-red-500" />
            สต็อกน้อย (≤5)
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
                <th className="px-3 py-2 text-right font-bold w-24">ความจุ</th>
                <th className="px-3 py-2 text-right font-bold w-28">มูลค่าทุน</th>
                <th className="px-3 py-2 text-center font-bold w-28">หมดอายุถัดไป</th>
                <th className="px-3 py-2 text-center font-bold w-28">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(p => {
                const days = p.nextExpiry ? Math.floor((new Date(p.nextExpiry).getTime() - Date.now()) / 86400000) : null;
                const expiryClass = days == null ? 'text-[var(--tx-muted)]' :
                  days < 0 ? 'text-red-400 font-bold' :
                  days <= 30 ? 'text-orange-400' :
                  'text-[var(--tx-primary)]';
                const lowStock = p.totalRemaining <= 5 && p.totalRemaining > 0;
                const outOfStock = p.totalRemaining <= 0;
                return (
                  <tr key={p.productId} className="border-t border-[var(--bd)] hover:bg-[var(--bg-hover)]" title={`Batches:\n${p.batches.map(b => `  …${b.batchId.slice(-8)}: ${fmtQty(b.qty.remaining)} ${b.unit || ''} (exp ${b.expiresAt || '-'})`).join('\n')}`}>
                    <td className="px-3 py-2 text-[var(--tx-primary)]">
                      {p.productName || `Product ${p.productId}`}
                      {outOfStock && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-red-900/30 text-red-400 border border-red-800">หมด</span>}
                      {lowStock && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-orange-900/30 text-orange-400 border border-orange-800">ใกล้หมด</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-[var(--tx-muted)]">{p.batches.length}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">{fmtQty(p.totalRemaining)} {p.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--tx-muted)]">{fmtQty(p.totalCapacity)}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
