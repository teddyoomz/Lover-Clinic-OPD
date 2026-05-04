// ─── Products Tab — Phase 12.2 CRUD ─────────────────────────────────────────
// Firestore-only. Migration from master_data/products via MasterDataTab button.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Package, Loader2, Tag } from 'lucide-react';
import { listProducts, deleteProduct } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import ProductFormModal from './ProductFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { STATUS_OPTIONS, PRODUCT_TYPE_OPTIONS } from '../../lib/productValidation.js';

const STATUS_BADGE = {
  'ใช้งาน':   'bg-emerald-700/20 border-emerald-700/40 text-emerald-400',
  'พักใช้งาน': 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400',
};
const TYPE_BADGE = {
  'ยา':               'bg-rose-700/20 border-rose-700/40 text-rose-400',
  'สินค้าหน้าร้าน':    'bg-emerald-700/20 border-emerald-700/40 text-emerald-400',
  'สินค้าสิ้นเปลือง':  'bg-amber-700/20 border-amber-700/40 text-amber-400',
  'บริการ':           'bg-sky-700/20 border-sky-700/40 text-sky-400',
};

export default function ProductsTab({ clinicSettings, theme }) {
  // Phase BS V2 — branch-scoped reads.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listProducts({ branchId: selectedBranchId })); }
    catch (e) { setError(e.message || 'โหลดสินค้าล้มเหลว'); setItems([]); }
    finally { setLoading(false); }
  }, [selectedBranchId]);
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(p => {
      if (q) {
        const hay = [p.productName, p.productCode, p.genericName, p.categoryName, p.mainUnitName].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (p.status || 'ใช้งาน') !== filterStatus) return false;
      if (filterType && p.productType !== filterType) return false;
      return true;
    });
  }, [items, query, filterStatus, filterType]);

  const handleDelete = async (p) => {
    const id = p.productId || p.id;
    const name = p.productName || 'สินค้า';
    if (!window.confirm(`ลบ "${name}" ?\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id); setError('');
    try { await deleteProduct(id); await reload(); }
    catch (e) { setError(e.message || 'ลบไม่สำเร็จ'); }
    finally { setDeleting(null); }
  };

  const extraFilters = (
    <>
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">สถานะทั้งหมด</option>
        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">ประเภททั้งหมด</option>
        {PRODUCT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </>
  );

  return (
    <>
      <MarketingTabShell
        icon={Package}
        title="สินค้า"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มสินค้า"
        onCreate={() => { setEditing(null); setFormOpen(true); }}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ / รหัส / สามัญ / หมวด"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่มต้น'
        notFoundText="ไม่พบสินค้าที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="products-grid">
          {filtered.map(p => {
            const id = p.productId || p.id;
            const busy = deleting === id;
            return (
              <div key={id} data-testid={`product-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <Package size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{p.productName || '(ไม่มีชื่อ)'}</h3>
                    {p.productCode && <p className="text-[11px] text-[var(--tx-muted)]">รหัส: {p.productCode}</p>}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${TYPE_BADGE[p.productType] || TYPE_BADGE['ยา']}`}>{p.productType || 'ยา'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${STATUS_BADGE[p.status || 'ใช้งาน']}`}>{p.status || 'ใช้งาน'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-[var(--tx-muted)] space-y-1 mb-2">
                  {p.categoryName && <div className="flex items-center gap-1.5"><Tag size={11} /> {p.categoryName}</div>}
                  {p.mainUnitName && <div><span className="font-semibold">หน่วย:</span> {p.mainUnitName}</div>}
                  {p.price != null && <div><span className="font-semibold">ราคา:</span> {Number(p.price).toLocaleString('th-TH')} บาท</div>}
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => { setEditing(p); setFormOpen(true); }} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(p)} disabled={busy}
                    aria-label={`ลบสินค้า ${p.productName || ''}`}
                    className="px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-red-700/40 hover:text-red-400 transition-all disabled:opacity-50">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </MarketingTabShell>

      {formOpen && (
        <ProductFormModal
          product={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={async () => { setFormOpen(false); setEditing(null); await reload(); }}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
