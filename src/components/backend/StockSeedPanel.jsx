// ─── StockSeedPanel — bulk-seed stock from master_data/products ─────────────
// One-click "opening balance" entry: list every master product, user fills
// qty+cost+expiry for the ones they want to seed, save → single createStockOrder
// creates all batches at once. Subsequent orders go via normal OrderPanel.
//
// Scope: treats master products as a checklist. Products already stocked still
// show current qty so user can add another batch if needed.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, Plus, Loader2, AlertCircle, CheckCircle2, ArrowLeft, Search, Database,
  CheckSquare, Square,
} from 'lucide-react';
import {
  // Phase 14.10-tris (2026-04-26) — be_products canonical
  listProducts, listStockBatches, createStockOrder,
} from '../../lib/backendClient.js';
import { auth } from '../../firebase.js';
import DateField from '../DateField.jsx';
import { thaiTodayISO } from '../../utils.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

function currentAuditUser() {
  const u = auth.currentUser;
  return {
    userId: u?.uid || '',
    userName: u?.email?.split('@')[0] || u?.displayName || '',
  };
}

function fmtQty(n) { return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }

export default function StockSeedPanel({ onClose, onSaved }) {
  // Phase 14.7.H follow-up A — branch-scoped seed batch creation.
  const { branchId: BRANCH_ID } = useSelectedBranch();
  const today = thaiTodayISO();
  const [vendorName, setVendorName] = useState('ยอดยกมา');
  const [importedDate, setImportedDate] = useState(today);
  const [note, setNote] = useState('บันทึกสต็อกเริ่มต้นจากข้อมูลพื้นฐาน');
  const [products, setProducts] = useState([]);
  const [currentByProduct, setCurrentByProduct] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [rowById, setRowById] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showUntrackedOnly, setShowUntrackedOnly] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, batches] = await Promise.all([
        listProducts(),
        listStockBatches({ branchId: BRANCH_ID, status: 'active' }),
      ]);
      const map = new Map();
      for (const b of batches || []) {
        if (!b.productId) continue;
        const k = String(b.productId);
        map.set(k, (map.get(k) || 0) + (Number(b.qty?.remaining) || 0));
      }
      setProducts(prods || []);
      setCurrentByProduct(map);
      // Initialize row state: include=false, qty='', cost='', expiresAt=''
      const init = {};
      for (const p of prods || []) {
        init[String(p.id)] = {
          include: false,
          qty: '',
          cost: p.price ? String(p.price) : '',  // default cost from master price if present
          expiresAt: '',
          unit: p.unit || '',
        };
      }
      setRowById(init);
    } catch (e) {
      console.error('[StockSeedPanel] load failed:', e);
      setError(e.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateRow = (pid, patch) => {
    setRowById(prev => ({ ...prev, [pid]: { ...prev[pid], ...patch } }));
  };

  // Filter products by search + untracked-only
  const filteredProducts = useMemo(() => {
    let list = products;
    if (showUntrackedOnly) {
      list = list.filter(p => !currentByProduct.has(String(p.id)));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || String(p.id).includes(q));
    }
    return list;
  }, [products, currentByProduct, search, showUntrackedOnly]);

  const includedCount = useMemo(() => {
    let n = 0;
    for (const p of filteredProducts) {
      const r = rowById[String(p.id)];
      if (r?.include && Number(r.qty) > 0) n++;
    }
    return n;
  }, [filteredProducts, rowById]);

  const totalValue = useMemo(() => {
    let s = 0;
    for (const p of filteredProducts) {
      const r = rowById[String(p.id)];
      if (r?.include && Number(r.qty) > 0) s += Number(r.qty) * Number(r.cost || 0);
    }
    return s;
  }, [filteredProducts, rowById]);

  const toggleAll = (flag) => {
    setRowById(prev => {
      const next = { ...prev };
      for (const p of filteredProducts) {
        const id = String(p.id);
        next[id] = { ...next[id], include: flag && Number(next[id]?.qty || 0) > 0 };
      }
      return next;
    });
  };

  // When user types qty → auto-check include
  const autoInclude = (pid, qty) => {
    updateRow(pid, {
      qty,
      include: Number(qty) > 0,  // auto-check when qty entered
    });
  };

  const canSave = includedCount > 0 && vendorName.trim() && importedDate;

  const handleSave = async () => {
    if (!canSave) {
      setError('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ พร้อมกรอก qty');
      return;
    }
    setSaving(true); setError('');
    try {
      const items = [];
      for (const p of products) {
        const r = rowById[String(p.id)];
        if (!r?.include) continue;
        const qty = Number(r.qty);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        items.push({
          productId: String(p.id),
          productName: p.name || '',
          qty,
          cost: Number(r.cost) || 0,
          unit: r.unit || p.unit || '',
          expiresAt: r.expiresAt || null,
          isPremium: false,
        });
      }
      if (items.length === 0) throw new Error('ไม่มีรายการที่ถูกต้อง');
      await createStockOrder({
        vendorName: vendorName.trim(),
        importedDate, note: note.trim(),
        branchId: BRANCH_ID,
        items,
      }, { user: currentAuditUser() });
      setSuccess(true);
      setTimeout(() => { onSaved?.(); }, 600);
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  const inputCls = `w-full px-2 py-1 rounded text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg border border-[var(--bd)]">
        <button onClick={onClose}
          className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)] flex items-center gap-1.5">
          <ArrowLeft size={14} /> กลับ
        </button>
        <div className="flex-1">
          <h2 className="text-base font-bold text-[var(--tx-heading)] flex items-center gap-2">
            <Database size={16} className="text-rose-400" /> นำเข้าสต็อกจากข้อมูลพื้นฐาน
          </h2>
          <p className="text-xs text-[var(--tx-muted)]">
            เลือกสินค้า + กรอก qty/cost → สร้าง order 1 ใบสำหรับสต็อกยกมา (one-time setup)
          </p>
        </div>
        <button onClick={handleSave} disabled={!canSave || saving}
          className="px-5 py-2 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
          {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <CheckCircle2 size={14} /> : <Plus size={14} />}
          {saving ? 'กำลังบันทึก' : success ? 'สำเร็จ' : `บันทึกทั้งหมด (${includedCount})`}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Header fields */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg border border-[var(--bd)] grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">ชื่อ order *</label>
          <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">วันที่ *</label>
          <DateField value={importedDate} onChange={setImportedDate} locale="ce" size="sm" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold">หมายเหตุ</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg border border-[var(--bd)] flex flex-wrap items-center gap-3">
        <div className="flex-1 relative min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาสินค้า..."
            className="w-full pl-9 pr-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)]" />
        </div>
        <label className="flex items-center gap-2 text-[11px] text-[var(--tx-muted)] cursor-pointer">
          <input type="checkbox" checked={showUntrackedOnly} onChange={e => setShowUntrackedOnly(e.target.checked)} className="accent-rose-500" />
          เฉพาะที่ยังไม่มีสต็อก ({products.length - currentByProduct.size})
        </label>
        <button onClick={() => toggleAll(true)}
          className="px-3 py-1 rounded text-[11px] bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-rose-400 border border-[var(--bd)] flex items-center gap-1">
          <CheckSquare size={12} /> เลือก (ที่มี qty)
        </button>
        <button onClick={() => toggleAll(false)}
          className="px-3 py-1 rounded text-[11px] bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-rose-400 border border-[var(--bd)] flex items-center gap-1">
          <Square size={12} /> ยกเลิกทั้งหมด
        </button>
        <div className="text-[11px] text-[var(--tx-muted)]">
          เลือก: <span className="font-bold text-rose-400">{includedCount}</span> • มูลค่ารวม: <span className="font-mono text-orange-400">฿{fmtQty(totalValue)}</span>
        </div>
      </div>

      {/* Product table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)]">
          <Package size={32} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-xs text-[var(--tx-muted)]">{search ? 'ไม่พบสินค้าตามคำค้น' : 'ไม่มีสินค้าในข้อมูลพื้นฐาน — sync products ก่อน'}</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] rounded-2xl overflow-x-auto shadow-lg border border-[var(--bd)]">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-[var(--bg-hover)] text-[var(--tx-muted)] uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-2 py-2 w-10"></th>
                <th className="px-2 py-2 text-left font-bold">สินค้า</th>
                <th className="px-2 py-2 text-right font-bold w-20">คงเหลือ</th>
                <th className="px-2 py-2 text-left font-bold w-24">qty *</th>
                <th className="px-2 py-2 text-left font-bold w-16">หน่วย</th>
                <th className="px-2 py-2 text-left font-bold w-24">ต้นทุน</th>
                <th className="px-2 py-2 text-left font-bold w-40">หมดอายุ</th>
                <th className="px-2 py-2 text-right font-bold w-20">มูลค่า</th>
              </tr>
            </thead>
            <tbody className="max-h-[60vh] overflow-y-auto">
              {filteredProducts.map(p => {
                const id = String(p.id);
                const r = rowById[id] || {};
                const current = currentByProduct.get(id) || 0;
                const lineTotal = Number(r.qty || 0) * Number(r.cost || 0);
                return (
                  <tr key={id} className={`border-t border-[var(--bd)] ${r.include ? 'bg-rose-950/10' : ''} hover:bg-[var(--bg-hover)]`}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={!!r.include}
                        onChange={e => updateRow(id, { include: e.target.checked })}
                        className="w-4 h-4 accent-rose-500" />
                    </td>
                    <td className="px-2 py-1.5 text-[var(--tx-primary)]">
                      {p.name || `Product ${id}`}
                      {p.price ? <span className="ml-2 text-[9px] text-[var(--tx-muted)]">(ราคา ฿{Number(p.price).toLocaleString()})</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      <span className={current > 0 ? 'text-emerald-400' : 'text-[var(--tx-muted)]'}>{fmtQty(current)}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={r.qty || ''}
                        onChange={e => autoInclude(id, e.target.value)}
                        className={inputCls} placeholder="0" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="text" value={r.unit || ''}
                        onChange={e => updateRow(id, { unit: e.target.value })}
                        className={inputCls} placeholder="U" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={r.cost || ''}
                        onChange={e => updateRow(id, { cost: e.target.value })}
                        className={inputCls} placeholder="0" />
                    </td>
                    <td className="px-2 py-1.5">
                      <DateField value={r.expiresAt || ''} onChange={v => updateRow(id, { expiresAt: v })} locale="ce" size="sm" />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-orange-400">
                      {lineTotal > 0 ? `฿${fmtQty(lineTotal)}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-3 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[10px] text-[var(--tx-muted)] space-y-1">
        <div>ℹ กรอก qty → ระบบ auto-check checkbox ให้อัตโนมัติ ช่องว่าง = ข้าม</div>
        <div>ℹ เปิด "เฉพาะที่ยังไม่มีสต็อก" เพื่อโฟกัสเฉพาะสินค้าที่ยังไม่เคย seed</div>
        <div>ℹ หลังบันทึก → ทุกสินค้าที่เลือกจะถูกตั้ง stockConfig.trackStock=true อัตโนมัติ (opt-in)</div>
        <div>ℹ order จะถูกบันทึกเป็น 1 ใบ (vendor="{vendorName}") พร้อม batches ทั้งหมด — ดูได้ที่ sub-tab "นำเข้า"</div>
      </div>
    </div>
  );
}
