// ─── Doctors Tab — Phase 12.1 CRUD ──────────────────────────────────────────
// Lists `be_doctors` (includes ผู้ช่วยแพทย์ via `position` discriminator).
// Firestore-only; /api/admin/users handles Firebase account lifecycle.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Stethoscope, Loader2, Mail, ShieldCheck, Ban } from 'lucide-react';
import { listDoctors, deleteDoctor } from '../../lib/backendClient.js';
import { deleteAdminUser } from '../../lib/adminUsersClient.js';
import DoctorFormModal from './DoctorFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import { STATUS_OPTIONS, POSITION_OPTIONS } from '../../lib/doctorValidation.js';

const STATUS_BADGE = {
  'ใช้งาน':   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  'พักใช้งาน': { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
};

const POSITION_BADGE = {
  'แพทย์':       { cls: 'bg-sky-700/20 border-sky-700/40 text-sky-400' },
  'ผู้ช่วยแพทย์': { cls: 'bg-purple-700/20 border-purple-700/40 text-purple-400' },
};

export default function DoctorsTab({ clinicSettings, theme }) {
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
      setItems(await listDoctors());
    } catch (e) {
      setError(e.message || 'โหลดแพทย์ล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(d => {
      if (q) {
        const hay = [d.firstname, d.lastname, d.firstnameEn, d.lastnameEn, d.nickname, d.email, d.professionalLicense, d.note].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (d.status || 'ใช้งาน') !== filterStatus) return false;
      if (filterPosition && d.position !== filterPosition) return false;
      return true;
    });
  }, [items, query, filterStatus, filterPosition]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (d) => { setEditing(d); setFormOpen(true); };

  const handleDelete = async (d) => {
    const id = d.doctorId || d.id;
    const name = `${d.firstname || ''} ${d.lastname || ''}`.trim() || 'แพทย์';
    const hasFbUser = !!d.firebaseUid;
    const msg = hasFbUser
      ? `ลบ "${name}" ?\n\nจะลบทั้ง Firestore + Firebase Auth account\n(ย้อนไม่ได้)`
      : `ลบ "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`;
    if (!window.confirm(msg)) return;
    setDeleting(id);
    setError('');
    try {
      if (hasFbUser) {
        try { await deleteAdminUser(d.firebaseUid); }
        catch (e) { console.warn('[DoctorsTab] Firebase delete failed (continuing with Firestore delete):', e.message); }
      }
      await deleteDoctor(id);
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
        icon={Stethoscope}
        title="แพทย์ & ผู้ช่วย"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มแพทย์ / ผู้ช่วย"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ / ใบประกอบ / อีเมล"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีแพทย์ — กด "เพิ่มแพทย์ / ผู้ช่วย" เพื่อเริ่มต้น'
        notFoundText="ไม่พบแพทย์ที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="doctors-grid">
          {filtered.map(d => {
            const id = d.doctorId || d.id;
            const statusCfg = STATUS_BADGE[d.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const posCfg = POSITION_BADGE[d.position] || POSITION_BADGE['แพทย์'];
            const busy = deleting === id;
            const fullName = `${d.firstname || ''} ${d.lastname || ''}`.trim();

            return (
              <div key={id} data-testid={`doctor-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg border border-[var(--bd)] flex items-center justify-center"
                    style={{ backgroundColor: d.backgroundColor || 'var(--bg-hover)', color: d.color || 'var(--tx-muted)' }}>
                    <Stethoscope size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{fullName || '(ไม่มีชื่อ)'}</h3>
                    {(d.firstnameEn || d.lastnameEn) && (
                      <p className="text-[11px] text-[var(--tx-muted)] truncate">{`${d.firstnameEn || ''} ${d.lastnameEn || ''}`.trim()}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${posCfg.cls}`}>{d.position || 'แพทย์'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{d.status || 'ใช้งาน'}</span>
                      {d.disabled && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-bold bg-red-700/20 border-red-700/40 text-red-400">
                          <Ban size={10} /> disabled
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[var(--tx-muted)] space-y-1 mb-2">
                  {d.email && <div className="flex items-center gap-1.5"><Mail size={11} /> <span className="truncate">{d.email}</span></div>}
                  {d.professionalLicense && <div><span className="font-semibold">ใบประกอบ:</span> {d.professionalLicense}</div>}
                  {d.firebaseUid && (
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <ShieldCheck size={11} /> <span>Firebase account ใช้งานได้</span>
                    </div>
                  )}
                  {Array.isArray(d.branchIds) && d.branchIds.length > 0 && (
                    <div><span className="font-semibold">สาขา:</span> {d.branchIds.length} สาขา</div>
                  )}
                  {d.hourlyIncome != null && d.hourlyIncome !== '' && (
                    <div><span className="font-semibold">รายได้ต่อชม.:</span> {Number(d.hourlyIncome).toLocaleString('th-TH')} บาท</div>
                  )}
                </div>

                {d.note && <p className="text-[11px] text-[var(--tx-muted)] line-clamp-2 mb-2">{d.note}</p>}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(d)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(d)} disabled={busy}
                    aria-label={`ลบ ${fullName}`}
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
        <DoctorFormModal
          doctor={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
