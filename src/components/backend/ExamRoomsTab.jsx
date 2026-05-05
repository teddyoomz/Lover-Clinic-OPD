// ─── Exam Rooms Tab — Phase 18.0 ────────────────────────────────────────
// Branch-scoped CRUD list. Shape mirrors BranchesTab + HolidaysTab.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, DoorOpen, Loader2 } from 'lucide-react';
import {
  listExamRooms,
  deleteExamRoom,
  listAppointments,
} from '../../lib/scopedDataLayer.js';
import ExamRoomFormModal from './ExamRoomFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { STATUS_OPTIONS } from '../../lib/examRoomValidation.js';

const STATUS_BADGE = {
  ใช้งาน:   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  พักใช้งาน: { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

export default function ExamRoomsTab({ clinicSettings, theme }) {
  // BS-9 (audit-branch-scope): branch-scoped tabs MUST subscribe to
  // selectedBranchId AND include it in deps so the data refetches on
  // branch switch.
  const { branchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const canDelete = useHasPermission('exam_room_management');

  const reload = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError('');
    try {
      setItems(await listExamRooms({ branchId }));
    } catch (e) {
      setError(e.message || 'โหลดห้องตรวจล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.slice().sort((a, b) =>
      (a.sortOrder || 0) - (b.sortOrder || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'th')
    ).filter(r => {
      if (q) {
        const hay = [r.name, r.nameEn, r.note].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (r.status || 'ใช้งาน') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (r) => { setEditing(r); setFormOpen(true); };

  const handleDelete = async (r) => {
    const id = r.examRoomId || r.id;
    const name = r.name || 'ห้อง';
    setDeleting(id);
    setError('');
    try {
      // Soft-confirm: count attached appointments before prompting (Phase 18.0
      // Q5=B-soft). Runtime fallback handles routing on render — no writes
      // to appt docs on delete.
      const appts = await listAppointments({ branchId }).catch(() => []);
      const attached = appts.filter(a => a.roomId === id).length;
      const msg = attached > 0
        ? `ลบห้อง "${name}" — มีนัดหมาย ${attached} รายการ จะถูกย้ายไป ไม่ระบุห้อง อัตโนมัติ — ยืนยันลบ?`
        : `ลบห้อง "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`;
      if (!window.confirm(msg)) return;
      await deleteExamRoom(id);
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
        icon={DoorOpen}
        title="ห้องตรวจ"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มห้องตรวจ"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อห้อง / EN / หมายเหตุ"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีห้องตรวจ — กด "เพิ่มห้องตรวจ" เพื่อเริ่มต้น'
        notFoundText="ไม่พบห้องตรวจที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="exam-rooms-grid">
          {filtered.map(r => {
            const id = r.examRoomId || r.id;
            const statusCfg = STATUS_BADGE[r.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const busy = deleting === id;
            return (
              <div key={id} data-testid={`exam-room-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <DoorOpen size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{r.name || '(ไม่มีชื่อ)'}</h3>
                    {r.nameEn && <p className="text-[11px] text-[var(--tx-muted)] truncate">{r.nameEn}</p>}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{r.status || 'ใช้งาน'}</span>
                      <span className="text-[10px] text-[var(--tx-muted)]">ลำดับ {r.sortOrder || 0}</span>
                    </div>
                  </div>
                </div>
                {r.note && (
                  <p className="text-[11px] text-[var(--tx-muted)] line-clamp-2 mb-2">{r.note}</p>
                )}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(r)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(r)} disabled={busy || !canDelete}
                    aria-label={`ลบห้องตรวจ ${r.name || ''}`}
                    title={!canDelete ? 'ไม่มีสิทธิ์ลบห้องตรวจ' : undefined}
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
        <ExamRoomFormModal
          room={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
