// ─── Coupon Tab — Phase 9 Marketing ─────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Ticket, Calendar, Loader2 } from 'lucide-react';
import { listCoupons, deleteCoupon } from '../../lib/backendClient.js';
import CouponFormModal from './CouponFormModal.jsx';
import { hexToRgb, thaiTodayISO } from '../../utils.js';

function fmtDateRange(s, e) { return (s && e) ? `${s} — ${e}` : ''; }

export default function CouponTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listCoupons()); }
    catch (e) { setError(e.message || 'โหลดคูปองล้มเหลว'); setItems([]); }
    finally { setLoading(false); }
  }, []);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black tracking-wider uppercase" style={{ color: ac }}>
            <Ticket size={20} className="inline mr-2" /> คูปอง
          </h2>
          <p className="text-xs text-[var(--tx-muted)] mt-0.5">จำนวน {items.length} · แสดง {filtered.length}</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all text-white"
          style={{ background: `linear-gradient(135deg, rgba(${acRgb},0.9), rgba(${acRgb},0.7))`, boxShadow: `0 0 15px rgba(${acRgb},0.35)` }}>
          <Plus size={16} /> สร้างคูปอง
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ / โค้ด"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
          <option value="">ประเภททั้งหมด</option>
          <option value="percent">% ส่วนลด</option>
          <option value="baht">บาท</option>
        </select>
      </div>

      {error && <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--tx-muted)]">
          <Loader2 size={24} className="animate-spin mr-2" /> กำลังโหลด…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-[var(--tx-muted)] border border-dashed border-[var(--bd)] rounded-lg">
          {items.length === 0 ? (
            <>
              <Ticket size={32} className="inline mb-2 opacity-50" />
              <p className="text-sm">ยังไม่มีคูปอง — กด "สร้างคูปอง" เพื่อเริ่มต้น</p>
            </>
          ) : <p className="text-sm">ไม่พบคูปองที่ตรงกับตัวกรอง</p>}
        </div>
      ) : (
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
                  <button onClick={() => handleDelete(c)} disabled={busy}
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
        <CouponFormModal coupon={editing} onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={async () => { setFormOpen(false); setEditing(null); await reload(); }}
          clinicSettings={clinicSettings} isDark={isDark} />
      )}
    </div>
  );
}
