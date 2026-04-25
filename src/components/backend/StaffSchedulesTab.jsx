// ─── Staff Schedules Tab — Phase 13.2.3 ───────────────────────────────────
// List + inline add/edit form for be_staff_schedules.
// Rule E: no brokerClient import. Rule H: no ProClinic mirror.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit2, Trash2, CalendarClock, Plus, Loader2 } from 'lucide-react';
import DateField from '../DateField.jsx';
import {
  listStaffSchedules, saveStaffSchedule, deleteStaffSchedule,
  listStaff,
} from '../../lib/backendClient.js';
import {
  emptyStaffScheduleForm, generateStaffScheduleId,
  TYPE_OPTIONS, TYPE_LABEL, TIME_SLOTS,
} from '../../lib/staffScheduleValidation.js';
import MarketingTabShell from './MarketingTabShell.jsx';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

const TYPE_BADGE = {
  work:    { cls: 'bg-emerald-700/20 border-emerald-700/40 text-emerald-400' },
  halfday: { cls: 'bg-sky-700/20 border-sky-700/40 text-sky-400' },
  holiday: { cls: 'bg-amber-700/20 border-amber-700/40 text-amber-400' },
  leave:   { cls: 'bg-neutral-700/30 border-neutral-700/50 text-neutral-400' },
  sick:    { cls: 'bg-rose-700/20 border-rose-700/40 text-rose-400' },
};

function formatDateThai(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function staffDisplayName(s) {
  if (!s) return '';
  const full = `${s.firstname || ''} ${s.lastname || ''}`.trim();
  const nick = s.nickname ? ` (${s.nickname})` : '';
  return full ? `${full}${nick}` : (s.nickname || s.name || s.staffId || s.id);
}

export default function StaffSchedulesTab({ clinicSettings }) {
  // Phase 14.7.H follow-up D — branch-aware staff-schedule writes.
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStaffId, setFilterStaffId] = useState('');
  const [form, setForm] = useState(emptyStaffScheduleForm());
  const [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [sc, st] = await Promise.all([
        listStaffSchedules(),
        listStaff().catch(() => []),
      ]);
      setItems(sc);
      setStaff(st);
    } catch (e) {
      setError(e.message || 'โหลดตารางงานล้มเหลว');
      setItems([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((e) => {
      if (filterType && (e.type || 'work') !== filterType) return false;
      if (filterStaffId && String(e.staffId) !== String(filterStaffId)) return false;
      if (q && !(
        (e.staffName || '').toLowerCase().includes(q) ||
        (e.note || '').toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [items, query, filterType, filterStaffId]);

  const handleClear = () => { setForm(emptyStaffScheduleForm()); setEditingId(null); };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setError(''); setSaving(true);
    try {
      const s = staff.find((x) => (x.staffId || x.id) === form.staffId);
      const id = editingId || generateStaffScheduleId();
      await saveStaffSchedule(id, {
        ...form,
        staffName: s ? staffDisplayName(s) : form.staffName,
        branchId: selectedBranchId,
      });
      handleClear();
      await reload();
    } catch (e) { setError(e.message || 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };

  const handleEdit = (e) => {
    setForm({ ...emptyStaffScheduleForm(), ...e });
    setEditingId(e.scheduleId || e.id);
  };

  const handleDelete = async (e) => {
    const id = e.scheduleId || e.id;
    if (!window.confirm(`ลบตารางงาน ${e.staffName || ''} ${formatDateThai(e.date)}?`)) return;
    setDeleting(id); setError('');
    try { await deleteStaffSchedule(id); await reload(); }
    catch (err) { setError(err.message || 'ลบไม่สำเร็จ'); }
    finally { setDeleting(null); }
  };

  const extraFilters = (
    <>
      <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">ประเภททั้งหมด</option>
        {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
      </select>
      <select value={filterStaffId} onChange={(e) => setFilterStaffId(e.target.value)}
        className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)]">
        <option value="">พนักงานทั้งหมด</option>
        {staff.slice(0, 500).map((s) => {
          const sid = s.staffId || s.id;
          return <option key={sid} value={sid}>{staffDisplayName(s)}</option>;
        })}
      </select>
    </>
  );

  const needsTime = form.type === 'work' || form.type === 'halfday';

  return (
    <div className="space-y-4">
      {/* Inline form — kept outside MarketingTabShell so it stays visible
          in empty state (shell hides children when filteredCount === 0). */}
      <form onSubmit={handleSubmit} data-testid="staff-schedule-form"
        className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)]">
        <select required value={form.staffId}
          onChange={(e) => setForm({ ...form, staffId: e.target.value })}
          className="md:col-span-2 px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)]">
          <option value="">— พนักงาน *</option>
          {staff.slice(0, 500).map((s) => {
            const sid = s.staffId || s.id;
            return <option key={sid} value={sid}>{staffDisplayName(s)}</option>;
          })}
        </select>
        <div className="md:col-span-1">
          <DateField value={form.date}
            onChange={(v) => setForm({ ...form, date: v })}
            locale="ce" placeholder="วันที่ *" />
        </div>
        <select value={form.type} data-testid="schedule-type-select"
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)]">
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        {needsTime ? (
          <>
            <select required value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)]">
              <option value="">เริ่ม *</option>
              {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select required value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)]">
              <option value="">สิ้นสุด *</option>
              {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </>
        ) : (
          <input type="text" placeholder="หมายเหตุ (ถ้ามี)" value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="md:col-span-2 px-2 py-1.5 rounded text-sm bg-[var(--bg-hover)] border border-[var(--bd)]" />
        )}
        <button type="submit" disabled={saving}
          className="md:col-span-6 px-3 py-2 rounded text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50">
          {saving ? <Loader2 size={12} className="inline animate-spin mr-1" /> : <Plus size={12} className="inline mr-1" />}
          {editingId ? 'บันทึกการแก้ไข' : 'เพิ่มตารางงาน'}
        </button>
      </form>

      {/* List with search + filters via MarketingTabShell */}
      <MarketingTabShell
        icon={CalendarClock}
        title="ตารางงานพนักงาน"
        totalCount={items.length}
        filteredCount={filtered.length}
        createLabel={editingId ? 'ยกเลิกแก้ไข' : 'เคลียร์ฟอร์ม'}
        onCreate={handleClear}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="ค้นหาชื่อพนักงาน / หมายเหตุ"
        extraFilters={extraFilters}
        error={error}
        loading={loading}
        emptyText='ยังไม่มีตารางงาน — กรอกฟอร์มด้านบนเพื่อเพิ่ม'
        notFoundText="ไม่พบตารางงานที่ตรงกับตัวกรอง"
        clinicSettings={clinicSettings}
      >
        <div className="space-y-1.5" data-testid="staff-schedule-list">
          {filtered.map((e) => {
            const id = e.scheduleId || e.id;
            const badge = TYPE_BADGE[e.type] || TYPE_BADGE.work;
            const busy = deleting === id;
            return (
              <div key={id} data-testid={`staff-schedule-row-${id}`}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] text-sm flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${badge.cls}`}>
                  {TYPE_LABEL[e.type] || e.type}
                </span>
                <span className="text-xs text-[var(--tx-muted)]">{formatDateThai(e.date)}</span>
                <span className="font-bold text-[var(--tx-heading)] flex-1 min-w-0 truncate">
                  {e.staffName || e.staffId || '(ไม่ระบุพนักงาน)'}
                </span>
                {(e.startTime || e.endTime) && (
                  <span className="text-xs font-mono text-[var(--tx-muted)] shrink-0">
                    {e.startTime || '—'} — {e.endTime || '—'}
                  </span>
                )}
                {e.note && <span className="text-[11px] text-[var(--tx-muted)] italic">· {e.note}</span>}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleEdit(e)} disabled={busy} aria-label={`แก้ไขตารางงาน ${id}`}
                    className="p-1.5 rounded text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] hover:text-sky-400 disabled:opacity-50"
                    data-testid={`staff-schedule-edit-${id}`}>
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(e)} disabled={busy} aria-label={`ลบตารางงาน ${id}`}
                    className="p-1.5 rounded text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] hover:text-red-400 disabled:opacity-50"
                    data-testid={`staff-schedule-delete-${id}`}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </MarketingTabShell>
    </div>
  );
}
