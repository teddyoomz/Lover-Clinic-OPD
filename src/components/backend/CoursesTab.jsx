// ─── Courses Tab — Phase 12.2 CRUD ──────────────────────────────────────────
// Firestore-only. Migration from master_data/courses via MasterDataTab button.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, Briefcase, Loader2, Tag, Clock, Package } from 'lucide-react';
import { listCourses, deleteCourse } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import CourseFormModal from './CourseFormModal.jsx';
import MarketingTabShell from './MarketingTabShell.jsx';
import CrossBranchImportButton from './CrossBranchImportButton.jsx';
import { STATUS_OPTIONS } from '../../lib/courseValidation.js';

const STATUS_BADGE = {
  'ใช้งาน':   'bg-emerald-700/20 border-emerald-700/40 text-emerald-400',
  'พักใช้งาน': 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400',
};

export default function CoursesTab({ clinicSettings, theme }) {
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
    try { setItems(await listCourses({ branchId: selectedBranchId })); }
    catch (e) { setError(e.message || 'โหลดคอร์สล้มเหลว'); setItems([]); }
    finally { setLoading(false); }
  }, [selectedBranchId]);
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(c => {
      if (q) {
        const hay = [c.courseName, c.courseCode, c.receiptCourseName, c.courseCategory].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus && (c.status || 'ใช้งาน') !== filterStatus) return false;
      return true;
    });
  }, [items, query, filterStatus]);

  const handleDelete = async (c) => {
    const id = c.courseId || c.id;
    const name = c.courseName || 'คอร์ส';
    if (!window.confirm(`ลบ "${name}" ?\nลบจาก Firestore — ย้อนไม่ได้`)) return;
    setDeleting(id); setError('');
    try { await deleteCourse(id); await reload(); }
    catch (e) { setError(e.message || 'ลบไม่สำเร็จ'); }
    finally { setDeleting(null); }
  };

  const extraFilters = (
    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
      <option value="">สถานะทั้งหมด</option>
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  return (
    <>
      <div className="flex justify-end mb-2">
        <CrossBranchImportButton
          entityType="courses"
          isDark={theme === 'dark'}
          onImported={() => reload()}
        />
      </div>
      <MarketingTabShell
        icon={Briefcase}
        title="คอร์ส"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel="เพิ่มคอร์ส"
        onCreate={() => { setEditing(null); setFormOpen(true); }}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อ / รหัส / หมวด"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีคอร์ส — กด "เพิ่มคอร์ส" เพื่อเริ่มต้น'
        notFoundText="ไม่พบคอร์สที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="courses-grid">
          {filtered.map(c => {
            const id = c.courseId || c.id;
            const busy = deleting === id;
            const price = c.salePrice != null ? Number(c.salePrice).toLocaleString('th-TH') : '—';
            return (
              <div key={id} data-testid={`course-card-${id}`}
                className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] hover:border-[var(--accent)] transition-all">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
                    <Briefcase size={16} className="text-[var(--tx-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--tx-heading)] truncate">{c.courseName || '(ไม่มีชื่อ)'}</h3>
                    {c.courseCode && <p className="text-[11px] text-[var(--tx-muted)]">รหัส: {c.courseCode}</p>}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${STATUS_BADGE[c.status || 'ใช้งาน']}`}>{c.status || 'ใช้งาน'}</span>
                      {c.courseCategory && <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-bold bg-sky-700/20 border-sky-700/40 text-sky-400">{c.courseCategory}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-[var(--tx-muted)] space-y-1 mb-2">
                  <div className="flex items-center gap-1.5"><Tag size={11} /> ราคา: {price} บาท</div>
                  {c.time != null && <div className="flex items-center gap-1.5"><Clock size={11} /> {c.time} นาที</div>}
                  {Array.isArray(c.courseProducts) && c.courseProducts.length > 0 && (
                    <div className="flex items-center gap-1.5"><Package size={11} /> สินค้า {c.courseProducts.length} รายการ</div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--bd)]">
                  <button onClick={() => { setEditing(c); setFormOpen(true); }} disabled={busy}
                    className="flex-1 px-3 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] hover:border-sky-700/40 hover:text-sky-400 transition-all disabled:opacity-50">
                    <Edit2 size={12} /> แก้ไข
                  </button>
                  <button onClick={() => handleDelete(c)} disabled={busy}
                    aria-label={`ลบคอร์ส ${c.courseName || ''}`}
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
        <CourseFormModal
          course={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={async () => { setFormOpen(false); setEditing(null); await reload(); }}
          clinicSettings={clinicSettings}
        />
      )}
    </>
  );
}
