// ─── Branches Tab — Phase 11.6 Master Data Suite ───────────────────────────
// Lists `be_branches`. Shows contact + address snippet + default flag.
// 8th reuse of MarketingTabShell.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Building2, Loader2, Phone, MapPin, Star } from 'lucide-react';
import { listBranches, deleteBranch } from '../../lib/backendClient.js';
import BranchFormModal from './BranchFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { STATUS_OPTIONS } from '../../lib/branchValidation.js';

const STATUS_BADGE = {
  ใช้งาน:   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  พักใช้งาน: { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

export default function BranchesTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  // Phase 13.5.3 — gate branch delete on branch_management. Admin bypasses.
  const canDelete = useHasPermission('branch_management');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listBranches());
    } catch (e) {
      setError(e.message || 'โหลดสาขาล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(b => {
      if (q) {
        const hay = [b.name, b.nameEn, b.phone, b.address, b.addressEn, b.licenseNo, b.taxId, b.note].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (b.status || 'ใช้งาน') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (b) => { setEditing(b); setFormOpen(true); };

  const handleDelete = async (b) => {
    const id = b.branchId || b.id;
    const name = b.name || 'สาขา';
    if (!window.confirm(`ลบสาขา "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id);
    setError('');
    try {
      await deleteBranch(id);
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
        icon={Building2}
        title="สาขา"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มสาขา"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ / เบอร์ / ที่อยู่ / เลขผู้เสียภาษี"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีสาขา — กด "เพิ่มสาขา" เพื่อเริ่มต้น'
        notFoundText="ไม่พบสาขาที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="branches-grid">
          {filtered.map(b => {
            const id = b.branchId || b.id;
            const statusCfg = STATUS_BADGE[b.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const busy = deleting === id;

            return (
              <div key={id} data-testid={`branch-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <Building2 size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-bold text-[var(--tx-heading)] truncate">{b.name || '(ไม่มีชื่อ)'}</h3>
                      {b.isDefault && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-bold bg-amber-700/25 border-amber-600/50 text-amber-200">
                          <Star size={10} /> หลัก
                        </span>
                      )}
                    </div>
                    {b.nameEn && <p className="text-[11px] text-[var(--tx-muted)] truncate">{b.nameEn}</p>}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{b.status || 'ใช้งาน'}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[var(--tx-muted)] space-y-1 mb-2">
                  {b.phone && <div className="flex items-center gap-1.5"><Phone size={11} /> {b.phone}</div>}
                  {b.address && <div className="flex items-start gap-1.5"><MapPin size={11} className="mt-0.5 flex-shrink-0" /> <span className="line-clamp-2">{b.address}</span></div>}
                  {b.taxId && <div><span className="font-semibold">เลขผู้เสียภาษี:</span> {b.taxId}</div>}
                </div>

                {b.googleMapUrl && (
                  <a href={b.googleMapUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 mb-2"
                  >
                    <MapPin size={11} /> เปิด Google Maps
                  </a>
                )}

                {b.note && (
                  <p className="text-[11px] text-[var(--tx-muted)] line-clamp-2 mb-2">{b.note}</p>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(b)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(b)} disabled={busy || !canDelete}
                    aria-label={`ลบสาขา ${b.name || ''}`}
                    title={!canDelete ? 'ไม่มีสิทธิ์ลบสาขา' : undefined}
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
        <BranchFormModal
          branch={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
