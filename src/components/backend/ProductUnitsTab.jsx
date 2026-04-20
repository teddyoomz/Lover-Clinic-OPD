// ─── Product Units Tab — Phase 11.3 Master Data Suite ──────────────────────
// Lists `be_product_units` unit-groups. Each card previews the conversion
// chain (base → next units with amounts). Create/edit via ProductUnitFormModal.
//
// Rule C1: 5th reuse of MarketingTabShell chrome (PromotionTab, CouponTab,
// VoucherTab, ProductGroupsTab, now this).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Scale, Loader2, ArrowRight } from 'lucide-react';
import { listProductUnitGroups, deleteProductUnitGroup } from '../../lib/backendClient.js';
import ProductUnitFormModal from './ProductUnitFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { STATUS_OPTIONS } from '../../lib/productUnitValidation.js';

const STATUS_BADGE = {
  ใช้งาน:   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  พักใช้งาน: { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

export default function ProductUnitsTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listProductUnitGroups());
    } catch (e) {
      setError(e.message || 'โหลดกลุ่มหน่วยล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(g => {
      if (q) {
        const hay = [g.groupName, g.note, ...(g.units || []).map(u => u.name)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (g.status || 'ใช้งาน') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (g) => { setEditing(g); setFormOpen(true); };

  const handleDelete = async (g) => {
    const id = g.unitGroupId || g.id;
    const name = g.groupName || 'กลุ่มหน่วย';
    if (!window.confirm(`ลบกลุ่ม "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id);
    setError('');
    try {
      await deleteProductUnitGroup(id);
      await reload();
    } catch (e) {
      setError(e.message || 'ลบไม่สำเร็จ');
    } finally {
      setDeleting(null);
    }
  };

  const handleSaved = async () => { setFormOpen(false); setEditing(null); await reload(); };

  const extraFilters = (
    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">สถานะทั้งหมด</option>
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  return (
    <>
      <MarketingTabShell
        icon={Scale}
        title="หน่วยสินค้า"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="สร้างกลุ่มหน่วย"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อกลุ่ม / ชื่อหน่วย / note"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีกลุ่มหน่วย — กด "สร้างกลุ่มหน่วย" เพื่อเริ่มต้น'
        notFoundText="ไม่พบกลุ่มหน่วยที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="product-units-grid">
          {filtered.map(g => {
            const id = g.unitGroupId || g.id;
            const statusCfg = STATUS_BADGE[g.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const busy = deleting === id;
            const units = Array.isArray(g.units) ? g.units : [];
            const base = units[0];

            return (
              <div key={id} data-testid={`unit-group-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <Scale size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{g.groupName || '(ไม่มีชื่อ)'}</h3>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--bd)] text-[var(--tx-muted)]">{units.length} หน่วย</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{g.status || 'ใช้งาน'}</span>
                    </div>
                  </div>
                </div>

                {/* Conversion chain preview — base → higher */}
                {base && (
                  <div className="text-xs text-[var(--tx-muted)] mb-2 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-700/20 border border-emerald-700/40 text-emerald-300 font-semibold">
                        1 {base.name || '?'}
                      </span>
                      <span className="text-[10px]">= หน่วยฐาน</span>
                    </div>
                    {units.slice(1, 4).map((u, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] font-semibold">
                          1 {u.name || '?'}
                        </span>
                        <ArrowRight size={10} />
                        <span>{u.amount || 1} {base.name || '?'}</span>
                      </div>
                    ))}
                    {units.length > 4 && (
                      <p className="text-[10px] opacity-60">+ {units.length - 4} หน่วยเพิ่มเติม</p>
                    )}
                  </div>
                )}

                {g.note && (
                  <p className="text-[11px] text-[var(--tx-muted)] line-clamp-2 mb-2">{g.note}</p>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(g)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(g)} disabled={busy}
                    aria-label={`ลบกลุ่มหน่วย ${g.groupName || ''}`}
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
        <ProductUnitFormModal
          unitGroup={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
