// ─── Promotion Tab — Phase 9 Marketing ──────────────────────────────────────
// Lists be_promotions (Firestore), supports search / category / status
// filtering, and drives PromotionFormModal for create / edit. Delete goes
// through brokerClient so ProClinic stays in sync.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Tag, Calendar, Loader2 } from 'lucide-react';
import { listPromotions, deletePromotion } from '../../lib/backendClient.js';
import PromotionFormModal from './PromotionFormModal.jsx';
import { hexToRgb } from '../../utils.js';

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

  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

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

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black tracking-wider uppercase" style={{ color: ac }}>
            <Tag size={20} className="inline mr-2" /> โปรโมชัน
          </h2>
          <p className="text-xs text-[var(--tx-muted)] mt-0.5">
            จำนวน {items.length} รายการ · แสดง {filtered.length} รายการ
          </p>
        </div>
        <button onClick={handleCreate}
          className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all"
          style={{
            background: `linear-gradient(135deg, rgba(${acRgb},0.9), rgba(${acRgb},0.7))`,
            color: '#fff',
            boxShadow: `0 0 15px rgba(${acRgb},0.35)`,
          }}>
          <Plus size={16} /> สร้างโปรโมชัน
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส / หมวดหมู่"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] placeholder-[var(--tx-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
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
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--tx-muted)]">
          <Loader2 size={24} className="animate-spin mr-2" /> กำลังโหลด…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-[var(--tx-muted)] border border-dashed border-[var(--bd)] rounded-lg">
          {items.length === 0 ? (
            <>
              <Tag size={32} className="inline mb-2 opacity-50" />
              <p className="text-sm">ยังไม่มีโปรโมชัน — กด "สร้างโปรโมชัน" เพื่อเริ่มต้น</p>
            </>
          ) : (
            <p className="text-sm">ไม่พบโปรโมชันที่ตรงกับตัวกรอง</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(p => {
            const statusCfg = STATUS_BADGE[p.status || 'active'] || STATUS_BADGE.active;
            const busy = deleting === (p.promotionId || p.id);
            return (
              <div key={(p.promotionId || p.id)}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all group">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{p.promotion_name || '(ไม่มีชื่อ)'}</h3>
                    {p.promotion_code && (
                      <p className="text-[11px] text-[var(--tx-muted)] font-mono">#{p.promotion_code}</p>
                    )}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>
                    {statusCfg.label}
                  </span>
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
                  <button onClick={() => handleDelete(p)} disabled={busy}
                    className="px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-red-700/40 hover:text-red-400 transition-all disabled:opacity-50">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <PromotionFormModal
          promotion={editingPromotion}
          onClose={() => { setFormOpen(false); setEditingPromotion(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
          isDark={isDark}
        />
      )}
    </div>
  );
}
