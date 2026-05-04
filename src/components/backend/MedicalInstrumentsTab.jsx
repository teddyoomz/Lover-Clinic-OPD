// ─── Medical Instruments Tab — Phase 11.4 Master Data Suite ────────────────
// Lists `be_medical_instruments`. Card shows name/code/cost + maintenance
// schedule badge (days until due). Create/edit via MedicalInstrumentFormModal.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Wrench, Loader2, Calendar, AlertTriangle } from 'lucide-react';
import { listMedicalInstruments, deleteMedicalInstrument } from '../../lib/backendClient.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import MedicalInstrumentFormModal from './MedicalInstrumentFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import {
  STATUS_OPTIONS,
  daysUntilMaintenance,
} from '../../lib/medicalInstrumentValidation.js';

const STATUS_BADGE = {
  ใช้งาน:   { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  พักใช้งาน: { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
  ซ่อมบำรุง:  { cls: 'bg-amber-700/20 border-amber-700/40 text-amber-300' },
};

function formatBaht(n) {
  if (n == null || n === '') return '-';
  return Number(n).toLocaleString('th-TH');
}

function maintenanceBadge(days) {
  if (days == null) return null;
  if (days < 0) return { cls: 'bg-red-700/30 border-red-600/60 text-red-300', label: `เลยกำหนด ${-days} วัน`, icon: AlertTriangle };
  if (days <= 30) return { cls: 'bg-amber-700/30 border-amber-600/50 text-amber-300', label: `เหลือ ${days} วัน`, icon: Calendar };
  return { cls: 'bg-sky-700/20 border-sky-700/40 text-sky-300', label: `อีก ${days} วัน`, icon: Calendar };
}

export default function MedicalInstrumentsTab({ clinicSettings, theme }) {
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
    setLoading(true);
    setError('');
    try {
      setItems(await listMedicalInstruments({ branchId: selectedBranchId }));
    } catch (e) {
      setError(e.message || 'โหลดเครื่องหัตถการล้มเหลว');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(g => {
      if (q) {
        const hay = [g.name, g.code, g.note].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (g.status || 'ใช้งาน') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterStatus]);

  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (g) => { setEditing(g); setFormOpen(true); };

  const handleDelete = async (g) => {
    const id = g.instrumentId || g.id;
    const name = g.name || 'เครื่องหัตถการ';
    if (!window.confirm(`ลบเครื่อง "${name}" ?\n\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id);
    setError('');
    try {
      await deleteMedicalInstrument(id);
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
        icon={Wrench}
        title="เครื่องหัตถการ"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มเครื่อง"
        onCreate={handleCreate}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ / รหัส / note"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีเครื่องหัตถการ — กด "เพิ่มเครื่อง" เพื่อเริ่มต้น'
        notFoundText="ไม่พบเครื่องที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="medical-instruments-grid">
          {filtered.map(g => {
            const id = g.instrumentId || g.id;
            const statusCfg = STATUS_BADGE[g.status || 'ใช้งาน'] || STATUS_BADGE['ใช้งาน'];
            const busy = deleting === id;
            const days = daysUntilMaintenance(g.nextMaintenanceDate);
            const maint = maintenanceBadge(days);
            const logCount = Array.isArray(g.maintenanceLog) ? g.maintenanceLog.length : 0;

            return (
              <div key={id} data-testid={`instrument-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <Wrench size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{g.name || '(ไม่มีชื่อ)'}</h3>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {g.code && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] font-mono">#{g.code}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.cls}`}>{g.status || 'ใช้งาน'}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[var(--tx-muted)] space-y-1 mb-2">
                  <div><span className="font-semibold">ราคาทุน:</span> {formatBaht(g.costPrice)} บาท</div>
                  {g.purchaseDate && <div><span className="font-semibold">ซื้อเมื่อ:</span> {g.purchaseDate}</div>}
                  {g.maintenanceIntervalMonths != null && g.maintenanceIntervalMonths !== '' && (
                    <div><span className="font-semibold">รอบบำรุง:</span> ทุก {g.maintenanceIntervalMonths} เดือน</div>
                  )}
                  {logCount > 0 && <div><span className="font-semibold">ประวัติซ่อม:</span> {logCount} ครั้ง</div>}
                </div>

                {maint && (
                  <div className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-bold ${maint.cls} mb-2`}>
                    <maint.icon size={10} /> {maint.label}
                  </div>
                )}

                {g.note && (
                  <p className="text-[11px] text-[var(--tx-muted)] line-clamp-2 mb-2">{g.note}</p>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => handleEdit(g)} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(g)} disabled={busy}
                    aria-label={`ลบเครื่อง ${g.name || ''}`}
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
        <MedicalInstrumentFormModal
          instrument={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
