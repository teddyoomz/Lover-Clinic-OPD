// ─── Voucher Tab — Phase 9 Marketing ────────────────────────────────────────
// Shell + empty/loading chrome extracted to MarketingTabShell (AV10).
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Gift, Calendar, Loader2 } from 'lucide-react';
import { listVouchers, deleteVoucher } from '../../lib/backendClient.js';
import VoucherFormModal from './VoucherFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { VOUCHER_PLATFORMS } from '../../lib/voucherValidation.js';
import { resolveIsDark } from '../../lib/marketingUiUtils.js';

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
  const isDark = resolveIsDark(theme);

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

  const extraFilters = (
    <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)]">
      <option value="">Platform ทั้งหมด</option>
      {VOUCHER_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  );

  return (
    <>
      <MarketingTabShell
        icon={Gift}
        title="Voucher"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="สร้าง Voucher"
        onCreate={() => { setEditing(null); setFormOpen(true); }}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ Voucher"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มี Voucher — กด "สร้าง Voucher"'
        notFoundText="ไม่พบ Voucher"
        clinicSettings={clinicSettings}
      >
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
      </MarketingTabShell>

      {formOpen && (
        <VoucherFormModal voucher={editing} onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={async () => { setFormOpen(false); setEditing(null); await reload(); }}
          clinicSettings={clinicSettings} isDark={isDark} />
      )}
    </>
  );
}
