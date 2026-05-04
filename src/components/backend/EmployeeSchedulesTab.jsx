// ─── EmployeeSchedulesTab — Phase 13.2.8 (ProClinic /admin/schedule/employee parity) ──
// Calendar month grid + per-employee sidebar — same UI shell as
// DoctorSchedulesTab but sources from be_staff (not be_doctors) and gates
// by user_schedule_* permissions.
//
// Replaces the Phase 13.2.3 list-view StaffSchedulesTab. The original
// remains during Phase 13.2.6-13.2.10 for back-compat; deleted in Phase F.
//
// Rule E: Firestore-only. Rule H: be_staff_schedules is OURS.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users as UsersIcon, Loader2 } from 'lucide-react';
import {
  listStaff,
  listStaffSchedules,
  saveStaffSchedule,
  deleteStaffSchedule,
} from '../../lib/scopedDataLayer.js';
import MonthCalendarGrid from './scheduling/MonthCalendarGrid.jsx';
import ScheduleSidebarPanel from './scheduling/ScheduleSidebarPanel.jsx';
import ScheduleEntryFormModal from './scheduling/ScheduleEntryFormModal.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { filterStaffByBranch } from '../../lib/branchScopeUtils.js';

function staffDisplayName(s) {
  if (!s) return '';
  const fn = s.firstname || s.firstName || s.name || '';
  const ln = s.lastname || s.lastName || '';
  const nick = s.nickname ? ` (${s.nickname})` : '';
  return `${fn} ${ln}`.trim() + nick || (s.staffId || s.id || '');
}

export default function EmployeeSchedulesTab({ clinicSettings }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const canManage = useHasPermission('user_schedule_management');

  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [schedules, setSchedules] = useState([]); // ALL employee schedules
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const today = useMemo(() => new Date(), []);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const [modal, setModal] = useState(null);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const list = await listStaff();
      // Phase BSA leak-fix (2026-05-04): branch soft-gate. Only show staff
      // with access to current branch (branchIds[] contains selectedBranchId).
      const filtered = filterStaffByBranch(list || [], selectedBranchId);
      setStaff(filtered);
      if (filtered.length === 0) {
        setSelectedStaffId('');
      } else if (!selectedStaffId || !filtered.some(s => String(s.staffId || s.id) === selectedStaffId)) {
        setSelectedStaffId(String(filtered[0].staffId || filtered[0].id));
      }
    } catch (e) {
      setError(e?.message || 'โหลดรายชื่อพนักงานล้มเหลว');
      setStaff([]);
    } finally {
      setStaffLoading(false);
    }
  }, [selectedStaffId, selectedBranchId]);

  useEffect(() => { loadStaff(); }, [selectedBranchId]);

  // Phase 13.2.8-bis (2026-04-26 user correction): calendar shows ALL
  // staff at once. Sidebar selection filters only the right-rail sections.
  const loadSchedules = useCallback(async () => {
    if (staff.length === 0) { setSchedules([]); return; }
    setScheduleLoading(true);
    try {
      // Phase BS V2 — branch-scoped fetch.
      const all = await listStaffSchedules({ branchId: selectedBranchId });
      const staffIdSet = new Set(staff.map((s) => String(s.staffId || s.id)));
      const filtered = all.filter((e) => staffIdSet.has(String(e.staffId)));
      setSchedules(filtered);
    } catch (e) {
      setError(e?.message || 'โหลดตารางล้มเหลว');
      setSchedules([]);
    } finally {
      setScheduleLoading(false);
    }
  }, [staff, selectedBranchId]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // V21-anti: never show numeric user_id; resolve to display name.
  const staffMap = useMemo(() => {
    const m = new Map();
    for (const s of staff) {
      const id = String(s.staffId || s.id);
      m.set(id, { name: staffDisplayName(s) });
    }
    return m;
  }, [staff]);

  const selectedStaff = useMemo(() => {
    if (!selectedStaffId) return null;
    const s = staff.find((x) => String(x.staffId || x.id) === String(selectedStaffId));
    if (!s) return null;
    return {
      id: selectedStaffId,
      name: staffDisplayName(s),
      firstname: s.firstname || s.firstName,
      subtitle: s.position || '',
    };
  }, [staff, selectedStaffId]);

  // Sidebar entries — ONLY the selected staff's records.
  const { recurringEntries, overrideEntries, leaveEntries } = useMemo(() => {
    const rec = [], ovr = [], lea = [];
    if (!selectedStaffId) return { recurringEntries: [], overrideEntries: [], leaveEntries: [] };
    for (const e of schedules) {
      if (String(e.staffId) !== String(selectedStaffId)) continue;
      if (e.type === 'recurring') rec.push(e);
      else if (e.type === 'leave' || e.type === 'sick') lea.push(e);
      else ovr.push(e);
    }
    rec.sort((a, b) => Number(a.dayOfWeek ?? 99) - Number(b.dayOfWeek ?? 99));
    ovr.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    lea.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return { recurringEntries: rec, overrideEntries: ovr, leaveEntries: lea };
  }, [schedules, selectedStaffId]);

  const openAdd = (kind) => setModal({ kind, entry: null });
  const openEdit = (entry) => {
    let kind = 'override';
    if (entry.type === 'recurring') kind = 'recurring';
    else if (entry.type === 'leave' || entry.type === 'sick') kind = 'leave';
    setModal({ kind, entry });
  };
  const closeModal = () => setModal(null);

  const handleSaveEntry = async (payload) => {
    setError('');
    await saveStaffSchedule(payload.id || payload.scheduleId, payload);
    await loadSchedules();
  };

  const handleDelete = async (entry) => {
    const id = entry.scheduleId || entry.id;
    if (!window.confirm(`ลบรายการนี้?`)) return;
    setBusyId(id);
    try {
      await deleteStaffSchedule(id);
      await loadSchedules();
    } catch (e) {
      setError(e?.message || 'ลบล้มเหลว');
    } finally {
      setBusyId(null);
    }
  };

  const handleClearAllOverrides = async () => {
    if (!window.confirm(`ลบงานรายวันทั้งหมด (${overrideEntries.length} รายการ)?`)) return;
    setError('');
    try {
      for (const e of overrideEntries) {
        await deleteStaffSchedule(e.scheduleId || e.id);
      }
      await loadSchedules();
    } catch (e) {
      setError(e?.message || 'ลบล้มเหลว');
    }
  };

  return (
    <div className="space-y-3" data-testid="employee-schedules-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-[var(--tx-heading)] flex items-center gap-2">
          <UsersIcon size={18} className="text-emerald-500" />
          ตารางพนักงาน
        </h2>
        <div className="flex items-center gap-2">
          <select value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            disabled={staffLoading || staff.length === 0}
            className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] disabled:opacity-50"
            data-testid="employee-schedules-staff-select">
            <option value="">— เลือกพนักงาน —</option>
            {staff.map((s) => {
              const id = s.staffId || s.id;
              return <option key={id} value={id}>{staffDisplayName(s)}</option>;
            })}
          </select>
        </div>
      </div>

      {error && (
        <div className="text-xs text-rose-400 px-3 py-2 rounded bg-rose-900/20 border border-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-3">
        <div className="flex-1 min-w-0">
          {scheduleLoading ? (
            <div className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] flex items-center justify-center min-h-[400px]">
              <Loader2 size={20} className="animate-spin text-[var(--tx-muted)]" />
            </div>
          ) : (
            <MonthCalendarGrid
              year={calYear}
              monthIdx={calMonth}
              schedules={schedules}
              selectedStaffId={selectedStaffId}
              staffMap={staffMap}
              onMonthChange={(y, m) => { setCalYear(y); setCalMonth(m); }}
            />
          )}
        </div>

        <ScheduleSidebarPanel
          selectedStaff={selectedStaff}
          recurringEntries={recurringEntries}
          overrideEntries={overrideEntries}
          leaveEntries={leaveEntries}
          loading={staffLoading}
          busyId={busyId}
          canManage={canManage}
          onAddRecurring={() => openAdd('recurring')}
          onEditRecurring={openEdit}
          onDeleteRecurring={handleDelete}
          onAddOverride={() => openAdd('override')}
          onEditOverride={openEdit}
          onDeleteOverride={handleDelete}
          onClearAllOverrides={handleClearAllOverrides}
          onAddLeave={() => openAdd('leave')}
          onEditLeave={openEdit}
          onDeleteLeave={handleDelete}
        />
      </div>

      <ScheduleEntryFormModal
        open={!!modal}
        kind={modal?.kind}
        staffId={selectedStaffId}
        staffName={selectedStaff?.name || ''}
        initialEntry={modal?.entry}
        onClose={closeModal}
        onSave={handleSaveEntry}
        branchId={selectedBranchId}
      />
    </div>
  );
}
