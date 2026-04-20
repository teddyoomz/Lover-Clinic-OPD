// ─── Staff Tab — Phase 12.1 CRUD ────────────────────────────────────────────
// Lists `be_staff`. Firebase Auth account managed via /api/admin/users (only
// if staff has email/password). This tab is Firestore-only per rule E — no
// brokerClient import, no /api/proclinic/*; /api/admin/* is the sanctioned
// production exception documented in rules/03-stack.md #7.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, User, Loader2, Mail, ShieldCheck, Ban } from 'lucide-react';
import { listStaff, deleteStaff } from '../../lib/backendClient.js';
import { deleteAdminUser } from '../../lib/adminUsersClient.js';
import StaffFormModal from './StaffFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { STATUS_OPTIONS, POSITION_OPTIONS } from '../../lib/staffValidation.js';

const STATUS_BADGE = {
  'ใช้งาน':   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  'พักใช้งาน': { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

export default function StaffTab({ clinicSettings, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listStaff());
    } catch (e) {
      setError(e.message || 'โหลดพนักงานล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(s => {
      if (q) {
        const hay = [s.firstname, s.lastname, s.nickname, s.employeeCode, s.email, s.note].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (s.status || 'ใช้งาน') !== filterStatus) return false;
      if (filterPosition && s.position !== filterPosition) return false;
      return true;
    });
  }, [items, query, filterStatus, filterPosition]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (s) => { setEditing(s); setFormOpen(true); };

  const handleDelete = async (s) => {
    const id = s.staffId || s.id;
    const name = `${s.firstname || ''} ${s.lastname || ''}`.trim() || 'พนักงาน';
    const hasFbUser = !!s.firebaseUid;
    const msg = hasFbUser
      ? `ลบพนักงาน "${name}" ?\n\nจะลบทั้ง Firestore + Firebase Auth account\n(ย้อนไม่ได้)`
      : `ลบพนักงาน "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`;
    if (!window.confirm(msg)) return;
    setDeleting(id);
    setError('');
    try {
      if (hasFbUser) {
        try { await deleteAdminUser(s.firebaseUid); }
        catch (e) { console.warn('[StaffTab] Firebase delete failed (continuing with Firestore delete):', e.message); }
      }
      await deleteStaff(id);
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
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">สถานะทั้งหมด</option>
        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">ตำแหน่งทั้งหมด</option>
        {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    </>
  );

  return (
    <>
      <MarketingTabShell
        icon={User}
        title="พนักงาน"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มพนักงาน"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ / นามสกุล / รหัส / อีเมล"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีพนักงาน — กด "เพิ่มพนักงาน" เพื่อเริ่มต้น'
        notFoundText="ไม่พบพนักงานที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="staff-grid">
          {filtered.map(s => {
            const id = s.staffId || s.id;
            const statusCfg = STATUS_BADGE[s.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const busy = deleting === id;
            const fullName = `${s.firstname || ''} ${s.lastname || ''}`.trim();

            return (
              <div key={id} data-testid={`staff-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg border border-[var(--bd)] flex items-center justify-center"
                    style={{ backgroundColor: s.backgroundColor || 'var(--bg-hover)', color: s.color || 'var(--tx-muted)' }}>
                    <User size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{fullName || '(ไม่มีชื่อ)'}</h3>
                    {s.nickname && <p className="text-[11px] text-[var(--tx-muted)] truncate">({s.nickname})</p>}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {s.position && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-bold bg-sky-700/20 border-sky-700/40 text-sky-400">{s.position}</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{s.status || 'ใช้งาน'}</span>
                      {s.disabled && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-bold bg-red-700/20 border-red-700/40 text-red-400">
                          <Ban size={10} /> disabled
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[var(--tx-muted)] space-y-1 mb-2">
                  {s.email && <div className="flex items-center gap-1.5"><Mail size={11} /> <span className="truncate">{s.email}</span></div>}
                  {s.employeeCode && <div><span className="font-semibold">รหัส:</span> {s.employeeCode}</div>}
                  {s.firebaseUid && (
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <ShieldCheck size={11} /> <span>Firebase account ใช้งานได้</span>
                    </div>
                  )}
                  {Array.isArray(s.branchIds) && s.branchIds.length > 0 && (
                    <div><span className="font-semibold">สาขา:</span> {s.branchIds.length} สาขา</div>
                  )}
                </div>

                {s.note && <p className="text-[11px] text-[var(--tx-muted)] line-clamp-2 mb-2">{s.note}</p>}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(s)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(s)} disabled={busy}
                    aria-label={`ลบพนักงาน ${fullName}`}
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
        <StaffFormModal
          staff={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
