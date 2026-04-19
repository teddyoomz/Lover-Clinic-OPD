// ─── Voucher Tab — Phase 9 Marketing ────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Gift, Calendar, Loader2 } from 'lucide-react';
import { listVouchers, deleteVoucher } from '../../lib/backendClient.js';
import VoucherFormModal from './VoucherFormModal.jsx';
import { VOUCHER_PLATFORMS } from '../../lib/voucherValidation.js';
import { hexToRgb } from '../../utils.js';

export default function VoucherTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listVouchers()); }
    catch (e) { setError(e.message || 'โหลด Voucher ล้มเหลว'); setItems([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(v => {
      if (q && !(v.voucher_name || '').toLowerCase().includes(q)) return false;
      if (filterPlatform && v.platform !== filterPlatform) return false;
      return true;
    });
  }, [items, query, filterPlatform]);

  const handleDelete = async (v) => {
    const id = v.voucherId || v.id;
    if (!window.confirm(`ลบ "${v.voucher_name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id); setError('');
    try {
      await deleteVoucher(id);
      await reload();
    } catch (e) { setError(e.message || 'ลบไม่สำเร็จ'); }
    finally { setDeleting(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black tracking-wider uppercase" style={{ color: ac }}>
            <Gift size={20} className="inline mr-2" /> Voucher
          </h2>
          <p className="text-xs text-[var(--tx-muted)] mt-0.5">จำนวน {items.length} · แสดง {filtered.length}</p>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }}
          className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-2 text-white"
          style={{ background: `linear-gradient(135deg, rgba(${acRgb},0.9), rgba(${acRgb},0.7))`, boxShadow: `0 0 15px rgba(${acRgb},0.35)` }}>
          <Plus size={16} /> สร้าง Voucher
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ Voucher"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)]">
          <option value="">Platform ทั้งหมด</option>
          {VOUCHER_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {error && <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--tx-muted)]">
          <Loader2 size={24} className="animate-spin mr-2" /> กำลังโหลด…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-[var(--tx-muted)] border border-dashed border-[var(--bd)] rounded-lg">
          {items.length === 0 ? (<><Gift size={32} className="inline mb-2 opacity-50" /><p className="text-sm">ยังไม่มี Voucher — กด "สร้าง Voucher"</p></>) : <p className="text-sm">ไม่พบ Voucher</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(v => {
            const busy = deleting === (v.voucherId || v.id);
            return (
              <div key={(v.voucherId || v.id)} className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-[var(--tx-heading)] flex-1 truncate">{v.voucher_name || '(ไม่มีชื่อ)'}</h3>
                  {v.platform && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border font-bold bg-violet-700/20 border-violet-700/40 text-violet-300">
                      {v.platform}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-black" style={{ color: ac }}>{Number(v.sale_price || 0).toLocaleString('th-TH')}</span>
                  <span className="text-xs text-[var(--tx-muted)]">บาท</span>
                  <span className="text-xs text-[var(--tx-muted)] ml-auto">ค่าธรรมเนียม {Number(v.commission_percent || 0)}%</span>
                </div>
                {v.has_period && v.period_start && (
                  <div className="text-[11px] text-[var(--tx-muted)] flex items-center gap-1 mb-1">
                    <Calendar size={11} /> {v.period_start} — {v.period_end}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => { setEditing(v); setFormOpen(true); }} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] hover:border-sky-700/40 hover:text-sky-400 disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(v)} disabled={busy}
                    className="px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] hover:border-red-700/40 hover:text-red-400 disabled:opacity-50">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <VoucherFormModal voucher={editing} onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={async () => { setFormOpen(false); setEditing(null); await reload(); }}
          clinicSettings={clinicSettings} isDark={isDark} />
      )}
    </div>
  );
}
