// ─── DF Groups Tab — Phase 13.3.3 ─────────────────────────────────────────
// Lists be_df_groups + drives DfGroupFormModal. Firestore-only (Rule E).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Banknote, Loader2 } from 'lucide-react';
import { listDfGroups, deleteDfGroup } from '../../lib/backendClient.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import DfGroupFormModal from './DfGroupFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { STATUS_OPTIONS } from '../../lib/dfGroupValidation.js';

const STATUS_BADGE = {
  active:   { label: 'ใช้งาน',    cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  disabled: { label: 'พักใช้งาน', cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

export default function DfGroupsTab({ clinicSettings, theme }) {
  // Phase BS V2 — branch-scoped reads.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await listDfGroups({ branchId: selectedBranchId })); }
    catch (e) { setError(e.message || 'โหลดกลุ่ม DF ล้มเหลว'); setItems([]); }
    finally { setLoading(false); }
  }, [selectedBranchId]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((g) => {
      if (q && !((g.name || '').toLowerCase().includes(q) || (g.note || '').toLowerCase().includes(q))) return false;
      if (filterStatus && (g.status || 'active') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (g) => { setEditing(g); setFormOpen(true); };
  const handleDelete = async (g) => {
    const id = g.groupId || g.id;
    if (!window.confirm(`ลบกลุ่ม DF "${g.name || id}"? (อย่าลืมย้ายแพทย์ที่อยู่กลุ่มนี้ไปก่อน)`)) return;
    setDeleting(id); setError('');
    try { await deleteDfGroup(id); await reload(); }
    catch (e) { setError(e.message || 'ลบไม่สำเร็จ'); }
    finally { setDeleting(null); }
  };
  const handleSaved = async () => { setFormOpen(false); setEditing(null); await reload(); };

  const extraFilters = (
    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">สถานะทั้งหมด</option>
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>{STATUS_BADGE[s]?.label || s}</option>
      ))}
    </select>
  );

  return (
    <>
      <MarketingTabShell
        icon={Banknote}
        title="กลุ่ม DF (ค่ามือ)"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="สร้างกลุ่ม DF"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อกลุ่ม / หมายเหตุ"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีกลุ่ม DF — กด "สร้างกลุ่ม DF" เพื่อเริ่ม'
        notFoundText="ไม่พบกลุ่มที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="space-y-1.5" data-testid="df-group-list">
          {filtered.map((g) => {
            const id = g.groupId || g.id;
            const status = g.status || 'active';
            const badge = STATUS_BADGE[status] || STATUS_BADGE.active;
            const rateCount = (g.rates || []).length;
            const busy = deleting === id;
            return (
              <div key={id} data-testid={`df-group-row-${id}`}
                className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="font-bold text-[var(--tx-heading)] flex-1 min-w-0 truncate">{g.name || '(ไม่มีชื่อ)'}</span>
                  <span className="text-xs text-[var(--tx-muted)] shrink-0">{rateCount} อัตรา</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleEdit(g)} disabled={busy} aria-label={`แก้ไขกลุ่ม ${id}`}
                      className="p-1.5 rounded text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] hover:text-sky-400 disabled:opacity-50"
                      data-testid={`df-group-edit-${id}`}>
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(g)} disabled={busy} aria-label={`ลบกลุ่ม ${id}`}
                      className="p-1.5 rounded text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] hover:text-red-400 disabled:opacity-50"
                      data-testid={`df-group-delete-${id}`}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
                {g.note && <div className="text-[11px] text-[var(--tx-muted)] italic mt-1">{g.note}</div>}
              </div>
            );
          })}
        </div>
      </MarketingTabShell>

      {formOpen && (
        <DfGroupFormModal
          group={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
