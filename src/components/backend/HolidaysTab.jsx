// ─── Holidays Tab — Phase 11.5 Master Data Suite ───────────────────────────
// Lists `be_holidays`. Two kinds: specific-date(s) + weekly (day-of-week).
// Cards show either the date chips or the "ทุกวัน <dow>" banner.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, CalendarX, Loader2, Repeat } from 'lucide-react';
import { listenToHolidays, deleteHoliday } from '../../lib/backendClient.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import HolidayFormModal from './HolidayFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import {
  STATUS_OPTIONS,
  HOLIDAY_TYPES,
  DAY_OF_WEEK_LABELS,
} from '../../lib/holidayValidation.js';

const STATUS_BADGE = {
  ใช้งาน:   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  พักใช้งาน: { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

const TYPE_BADGE = {
  specific: { cls: 'bg-rose-700/20 border-rose-700/40 text-rose-300', label: 'วันเฉพาะ', icon: CalendarX },
  weekly:   { cls: 'bg-sky-700/20 border-sky-700/40 text-sky-300',   label: 'รายสัปดาห์', icon: Repeat },
};

export default function HolidaysTab({ clinicSettings, theme }) {
  // Phase BS V2 — branch-scoped reads.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  // Phase 13.5.3 — gate holiday delete on holiday_setting. Admin bypasses.
  const canDelete = useHasPermission('holiday_setting');

  // Phase 14.7.H follow-up H (2026-04-26): replaced one-shot listHolidays
  // with onSnapshot via listenToHolidays. Multi-tab CRUD (admin A creates a
  // holiday in window 1 while admin B has this tab open in window 2) now
  // refreshes both lists within ~1s without explicit reload after every
  // mutation. The legacy `reload` shim is preserved as a no-op so existing
  // post-mutation callbacks (handleSaved, handleDelete) don't need refactor;
  // the listener already keeps `items` fresh.
  const reload = useCallback(async () => {
    return Promise.resolve();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    // Phase BS V2 — pass {branchId} so the listener filters server-side.
    // Re-subscribes when admin switches branch via top-right BranchSelector.
    const unsub = listenToHolidays(
      { branchId: selectedBranchId },
      (list) => { setItems(list); setLoading(false); },
      (e) => { setError(e?.message || 'โหลดวันหยุดล้มเหลว'); setItems([]); setLoading(false); },
    );
    return unsub;
  }, [selectedBranchId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(g => {
      if (q) {
        const hay = [
          g.note,
          ...(Array.isArray(g.dates) ? g.dates : []),
          g.type === 'weekly' ? DAY_OF_WEEK_LABELS[Number(g.dayOfWeek) || 0] : '',
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterType && g.type !== filterType) return false;
      if (filterStatus && (g.status || 'ใช้งาน') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterType, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (g) => { setEditing(g); setFormOpen(true); };

  const handleDelete = async (g) => {
    const id = g.holidayId || g.id;
    const label = g.note || (g.type === 'weekly' ? `ทุกวัน${DAY_OF_WEEK_LABELS[Number(g.dayOfWeek) || 0]}` : `${(g.dates || []).length} วัน`);
    if (!window.confirm(`ลบวันหยุด "${label}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id);
    setError('');
    try {
      await deleteHoliday(id);
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
        {HOLIDAY_TYPES.map(t => <option key={t} value={t}>{t === 'specific' ? 'วันเฉพาะ' : 'รายสัปดาห์'}</option>)}
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
        icon={CalendarX}
        title="วันหยุด"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มวันหยุด"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหา note / วันที่ / วันในสัปดาห์"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีวันหยุด — กด "เพิ่มวันหยุด" เพื่อเริ่มต้น'
        notFoundText="ไม่พบวันหยุดที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="holidays-grid">
          {filtered.map(g => {
            const id = g.holidayId || g.id;
            const statusCfg = STATUS_BADGE[g.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const typeCfg = TYPE_BADGE[g.type] || TYPE_BADGE.specific;
            const TypeIcon = typeCfg.icon;        // capitalize for JSX tag
            const busy = deleting === id;
            const dates = Array.isArray(g.dates) ? g.dates : [];

            return (
              <div key={id} data-testid={`holiday-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <TypeIcon size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">
                      {g.note || (g.type === 'weekly'
                        ? `ทุกวัน${DAY_OF_WEEK_LABELS[Number(g.dayOfWeek) || 0]}`
                        : `วันหยุดเฉพาะ ${dates.length} วัน`)}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${typeCfg.cls}`}>{typeCfg.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{g.status || 'ใช้งาน'}</span>
                    </div>
                  </div>
                </div>

                {g.type === 'specific' && dates.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1 mb-2">
                    {dates.slice(0, 6).map(d => (
                      <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] font-mono">
                        {d}
                      </span>
                    ))}
                    {dates.length > 6 && <span className="text-[10px] text-[var(--tx-muted)]">+ {dates.length - 6}</span>}
                  </div>
                )}

                {/* Weekly: h3 shows the full label when no note; when note exists,
                    repeat it here for context. */}
                {g.type === 'weekly' && g.note && (
                  <div className="text-xs text-[var(--tx-muted)] mb-2 flex items-center gap-1">
                    <Repeat size={11} /> ปิดทุกวัน{DAY_OF_WEEK_LABELS[Number(g.dayOfWeek) || 0]}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(g)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(g)} disabled={busy || !canDelete}
                    aria-label={`ลบวันหยุด ${g.note || id}`}
                    title={!canDelete ? 'ไม่มีสิทธิ์ลบวันหยุด' : undefined}
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
        <HolidayFormModal
          holiday={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
