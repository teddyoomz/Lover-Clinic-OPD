// ─── Coupon Tab — Phase 9 Marketing ─────────────────────────────────────────
// Shell + empty/loading chrome extracted to MarketingTabShell (AV10).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Ticket, Calendar, Loader2 } from 'lucide-react';
import { listCoupons, deleteCoupon } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import CouponFormModal from './CouponFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { resolveIsDark } from '../../lib/marketingUiUtils.js';
import { thaiTodayISO } from '../../utils.js';

function fmtDateRange(s, e) { return (s && e) ? `${s} — ${e}` : ''; }

export default function CouponTab({ clinicSettings, theme }) {
  // Phase 17.0 (BS-9) — subscribe to branch context so reload re-fires
  // immediately when the user switches the top-right BranchSelector.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  // Phase 13.5.3 — gate coupon delete on coupon_management.
  const canDelete = useHasPermission('coupon_management');

  const ac = clinicSettings?.accentColor || '#dc2626';
  const isDark = resolveIsDark(theme);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listCoupons()); }
    catch (e) { setError(e.message || 'โหลดคูปองล้มเหลว'); setItems([]); }
    finally { setLoading(false); }
    // Phase 17.0 (BS-9) — listCoupons reads resolveSelectedBranchId() internally.
  }, [selectedBranchId]);
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(c => {
      if (q && !(
        (c.coupon_name || '').toLowerCase().includes(q) ||
        (c.coupon_code || '').toLowerCase().includes(q)
      )) return false;
      if (filterType && c.discount_type !== filterType) return false;
      return true;
    });
  }, [items, query, filterType]);

  const handleDelete = async (c) => {
    const name = c.coupon_name || 'คูปอง';
    const id = c.couponId || c.id;
    if (!window.confirm(`ลบ "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id); setError('');
    try {
      await deleteCoupon(id);
      await reload();
    } catch (e) { setError(e.message || 'ลบไม่สำเร็จ'); }
    finally { setDeleting(null); }
  };

  const extraFilters = (
    <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">ประเภททั้งหมด</option>
      <option value="percent">% ส่วนลด</option>
      <option value="baht">บาท</option>
    </select>
  );

  return (
    <>
      <MarketingTabShell
        icon={Ticket}
        title="คูปอง"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="สร้างคูปอง"
        onCreate={() => { setEditing(null); setFormOpen(true); }}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ / โค้ด"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีคูปอง — กด "สร้างคูปอง" เพื่อเริ่มต้น'
        notFoundText="ไม่พบคูปองที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(c => {
            const busy = deleting === (c.couponId || c.id);
            const expired = c.end_date && c.end_date < thaiTodayISO();
            return (
              <div key={(c.couponId || c.id)}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{c.coupon_name || '(ไม่มีชื่อ)'}</h3>
                    <p className="text-[11px] text-[var(--tx-muted)] font-mono">#{c.coupon_code}</p>
                  </div>
                  {expired && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider bg-neutral-700/30 border-neutral-700/50 text-neutral-400">
                      หมดอายุ
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-black" style={{ color: ac }}>
                    {Number(c.discount || 0).toLocaleString('th-TH')}
                  </span>
                  <span className="text-xs text-[var(--tx-muted)]">
                    {c.discount_type === 'percent' ? '%' : 'บาท'}
                  </span>
                  <span className="text-xs text-[var(--tx-muted)] ml-auto">สูงสุด {Number(c.max_qty || 0).toLocaleString('th-TH')} ครั้ง</span>
                </div>
                {c.is_limit_per_user && (
                  <div className="text-[11px] text-sky-400 mb-1">ใช้ได้คนละ 1 ครั้ง</div>
                )}
                {c.start_date && (
                  <div className="text-[11px] text-[var(--tx-muted)] flex items-center gap-1 mb-1">
                    <Calendar size={11} /> {fmtDateRange(c.start_date, c.end_date)}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => { setEditing(c); setFormOpen(true); }} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(c)} disabled={busy || !canDelete}
                    title={!canDelete ? 'ไม่มีสิทธิ์ลบคูปอง' : undefined}
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
        <CouponFormModal coupon={editing} onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={async () => { setFormOpen(false); setEditing(null); await reload(); }}
          clinicSettings={clinicSettings} isDark={isDark} />
      )}
    </>
  );
}
