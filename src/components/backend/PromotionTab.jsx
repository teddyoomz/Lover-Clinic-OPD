// ─── Promotion Tab — Phase 9 Marketing ──────────────────────────────────────
// Lists be_promotions (Firestore), supports search / category / status
// filtering, and drives PromotionFormModal for create / edit. Delete is
// Firestore-only per rule E (Backend = Firestore ONLY).
//
// Shell + empty/loading chrome extracted to MarketingTabShell (AV10).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Tag, Calendar, Loader2 } from 'lucide-react';
import { listPromotions, deletePromotion } from '../../lib/scopedDataLayer.js';
import PromotionFormModal from './PromotionFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { resolveIsDark } from '../../lib/marketingUiUtils.js';

const STATUS_BADGE = {
  active: { label: 'ใช้งาน', cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  suspended: { label: 'พักใช้งาน', cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

function formatThaiDateRange(start, end) {
  if (!start || !end) return '';
  return `${start} — ${end}`;
}

export default function PromotionTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  // Phase 13.5.3 — gate promotion delete on promotion_management. Admin
  // bypasses (clinic_promotion_management is the broader admin scope).
  const canDelete = useHasPermission('promotion_management');

  const ac = clinicSettings?.accentColor || '#dc2626';
  const isDark = resolveIsDark(theme);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listPromotions();
      setItems(data);
    } catch (e) {
      setError(e.message || 'โหลดข้อมูลโปรโมชันล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    items.forEach(p => { if (p.category_name) set.add(p.category_name); });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(p => {
      if (q && !(
        (p.promotion_name || '').toLowerCase().includes(q) ||
        (p.promotion_code || '').toLowerCase().includes(q) ||
        (p.category_name || '').toLowerCase().includes(q)
      )) return false;
      if (filterCategory && p.category_name !== filterCategory) return false;
      if (filterStatus && (p.status || 'active') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterCategory, filterStatus]);

  const handleCreate = () => { setEditingPromotion(null); setFormOpen(true); };
  const handleEdit = (p) => { setEditingPromotion(p); setFormOpen(true); };

  const handleDelete = async (p) => {
    const name = p.promotion_name || 'โปรโมชัน';
    const id = p.promotionId || p.id;
    if (!window.confirm(`ลบ "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id);
    setError('');
    try {
      await deletePromotion(id);
      await reload();
    } catch (e) {
      setError(e.message || 'ลบไม่สำเร็จ');
    } finally {
      setDeleting(null);
    }
  };

  const handleSaved = async () => { setFormOpen(false); setEditingPromotion(null); await reload(); };

  const extraFilters = (
    <>
      <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">หมวดหมู่ทั้งหมด</option>
        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">สถานะทั้งหมด</option>
        <option value="active">ใช้งาน</option>
        <option value="suspended">พักใช้งาน</option>
      </select>
    </>
  );

  return (
    <>
      <MarketingTabShell
        icon={Tag}
        title="โปรโมชัน"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="สร้างโปรโมชัน"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ / รหัส / หมวดหมู่"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีโปรโมชัน — กด "สร้างโปรโมชัน" เพื่อเริ่มต้น'
        notFoundText="ไม่พบโปรโมชันที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(p => {
            const statusCfg = STATUS_BADGE[p.status || 'active'] || STATUS_BADGE.active;
            const busy = deleting === (p.promotionId || p.id);
            return (
              <div key={(p.promotionId || p.id)}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all group">
                <div className="flex items-start gap-3 mb-2">
                  {/* Cover thumbnail — 48x48, rounded. Firebase Storage URL or fallback icon. */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    {p.cover_image ? (
                      <img src={p.cover_image} alt="" loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Broken URL → hide image, show fallback icon via sibling.
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }} />
                    ) : null}
                    {/* Fallback icon — shown when no cover_image OR when img fails to load */}
                    <Tag size={18} className={p.cover_image ? 'hidden text-[var(--tx-muted)]' : 'text-[var(--tx-muted)]'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-[var(--tx-heading)] truncate">{p.promotion_name || '(ไม่มีชื่อ)'}</h3>
                        {p.promotion_code && (
                          <p className="text-[11px] text-[var(--tx-muted)] font-mono">#{p.promotion_code}</p>
                        )}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider shrink-0 ${statusCfg.cls}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-black" style={{ color: ac }}>
                    {Number(p.sale_price || 0).toLocaleString('th-TH')}
                  </span>
                  <span className="text-xs text-[var(--tx-muted)]">บาท</span>
                  {p.is_vat_included && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-700/20 text-sky-400 border border-sky-700/40">incl. VAT</span>}
                </div>

                {p.category_name && (
                  <div className="text-xs text-[var(--tx-muted)] mb-1">
                    <span className="font-semibold">หมวด:</span> {p.category_name}
                    {p.procedure_type_name && <span className="ml-2">· {p.procedure_type_name}</span>}
                  </div>
                )}

                {p.has_promotion_period && p.promotion_period_start && (
                  <div className="text-[11px] text-[var(--tx-muted)] flex items-center gap-1 mb-1">
                    <Calendar size={11} /> {formatThaiDateRange(p.promotion_period_start, p.promotion_period_end)}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(p)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(p)} disabled={busy || !canDelete}
                    title={!canDelete ? 'ไม่มีสิทธิ์ลบโปรโมชัน' : undefined}
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
        <PromotionFormModal
          promotion={editingPromotion}
          onClose={() => { setFormOpen(false); setEditingPromotion(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
          isDark={isDark}
        />
      )}
    </>
  );
}

