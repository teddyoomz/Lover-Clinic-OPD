// ─── Product Groups Tab — Phase 11.2 Master Data Suite ─────────────────────
// List + search + filter (productType / status) + create/edit modal +
// Firestore-only delete. Lives under `be_product_groups` collection — OUR
// canonical data per Rule H.
//
// Shell: reuses MarketingTabShell chrome for Rule-C1 consistency with Phase
// 9 marketing tabs (3 there + this = 4 uses of the shell).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, FolderTree, Loader2, Package } from 'lucide-react';
import { listProductGroups, deleteProductGroup } from '../../lib/backendClient.js';
import ProductGroupFormModal from './ProductGroupFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { PRODUCT_TYPES, STATUS_OPTIONS } from '../../lib/productGroupValidation.js';

const STATUS_BADGE = {
  ใช้งาน:   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  พักใช้งาน: { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

const TYPE_COLOR = {
  ยา:              { cls: 'bg-rose-700/20 border-rose-700/40 text-rose-300' },
  สินค้าหน้าร้าน:    { cls: 'bg-amber-700/20 border-amber-700/40 text-amber-300' },
  สินค้าสิ้นเปลือง:  { cls: 'bg-sky-700/20 border-sky-700/40 text-sky-300' },
  บริการ:           { cls: 'bg-violet-700/20 border-violet-700/40 text-violet-300' },
};

export default function ProductGroupsTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listProductGroups());
    } catch (e) {
      setError(e.message || 'โหลดกลุ่มสินค้าล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(g => {
      if (q && !(
        (g.name || '').toLowerCase().includes(q) ||
        (g.note || '').toLowerCase().includes(q) ||
        (g.productType || '').toLowerCase().includes(q)
      )) return false;
      if (filterType && g.productType !== filterType) return false;
      if (filterStatus && (g.status || 'ใช้งาน') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterType, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (g) => { setEditing(g); setFormOpen(true); };

  const handleDelete = async (g) => {
    const id = g.groupId || g.id;
    const name = g.name || 'กลุ่มสินค้า';
    if (!window.confirm(`ลบกลุ่ม "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id);
    setError('');
    try {
      await deleteProductGroup(id);
      await reload();
    } catch (e) {
      setError(e.message || 'ลบไม่สำเร็จ');
    } finally {
      setDeleting(null);
    }
  };

  const handleSaved = async () => { setFormOpen(false); setEditing(null); await reload(); };

  const extraFilters = (
    <>
      <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">ประเภททั้งหมด</option>
        {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">สถานะทั้งหมด</option>
        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </>
  );

  return (
    <>
      <MarketingTabShell
        icon={FolderTree}
        title="กลุ่มสินค้า"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="สร้างกลุ่ม"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อกลุ่ม / note / ประเภท"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีกลุ่มสินค้า — กด "สร้างกลุ่ม" เพื่อเริ่มต้น'
        notFoundText="ไม่พบกลุ่มสินค้าที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="product-groups-grid">
          {filtered.map(g => {
            const id = g.groupId || g.id;
            const statusCfg = STATUS_BADGE[g.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const typeCfg = TYPE_COLOR[g.productType] || TYPE_COLOR['ยา'];
            const busy = deleting === id;
            const productCount = Array.isArray(g.productIds) ? g.productIds.length : 0;
            return (
              <div key={id} data-testid={`group-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <FolderTree size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{g.name || '(ไม่มีชื่อ)'}</h3>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${typeCfg.cls}`}>{g.productType || '-'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{g.status || 'ใช้งาน'}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[var(--tx-muted)] mb-2 flex items-center gap-1.5">
                  <Package size={12} /> <span className="font-semibold text-[var(--tx-primary)]">{productCount}</span> สินค้าในกลุ่ม
                </div>

                {g.note && (
                  <p className="text-[11px] text-[var(--tx-muted)] line-clamp-2 mb-2">{g.note}</p>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(g)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(g)} disabled={busy}
                    aria-label={`ลบกลุ่ม ${g.name || ''}`}
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
        <ProductGroupFormModal
          productGroup={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
