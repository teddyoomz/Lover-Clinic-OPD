// ─── DoctorSchedulesTab — Phase 13.2.7 (ProClinic /admin/schedule/doctor parity) ──
// Calendar month grid (center) + per-doctor sidebar (right):
//   - Doctor selector dropdown (sources be_doctors)
//   - 3 sidebar sections (recurring weekly / per-date overrides / leave)
//   - Calendar shows merged effective entries per day
//
// Rule E: Firestore-only (no broker/proclinic write-back).
// Rule H: be_staff_schedules is OURS; ProClinic sync goes via MasterDataTab (Phase I).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Stethoscope, Loader2 } from 'lucide-react';
import {
  listDoctors,
  listStaffSchedules,
  saveStaffSchedule,
  deleteStaffSchedule,
} from '../../lib/scopedDataLayer.js';
import MonthCalendarGrid from './scheduling/MonthCalendarGrid.jsx';
import ScheduleSidebarPanel from './scheduling/ScheduleSidebarPanel.jsx';
import ScheduleEntryFormModal from './scheduling/ScheduleEntryFormModal.jsx';
import { useHasPermission } from '../../hooks/useTabAccess.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { filterDoctorsByBranch } from '../../lib/branchScopeUtils.js';

function doctorDisplayName(d) {
  if (!d) return '';
  const fn = d.firstname || d.firstName || d.name || '';
  const ln = d.lastname || d.lastName || '';
  const nick = d.nickname ? ` (${d.nickname})` : '';
  return `${fn} ${ln}`.trim() + nick || (d.doctorId || d.id || '');
}

export default function DoctorSchedulesTab({ clinicSettings }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const canManage = useHasPermission('doctor_schedule_management');

  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [schedules, setSchedules] = useState([]); // ALL doctor schedules (calendar)
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Calendar nav state
  const today = useMemo(() => new Date(), []);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Modal state
  const [modal, setModal] = useState(null); // { kind, entry } | null

  // Load doctors — re-runs on branch switch (Phase BSA leak-fix 2026-05-04)
  const loadDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    try {
      const list = await listDoctors();
      // ProClinic doctor positions: 'แพทย์' + 'ผู้ช่วยแพทย์' — both have schedules
      // Phase BSA leak-fix: branch soft-gate. Only show doctors with access
      // to current branch (branchIds[] contains selectedBranchId).
      const filtered = filterDoctorsByBranch(list || [], selectedBranchId);
      setDoctors(filtered);
      // Default-select first doctor in filtered list (or clear if none)
      if (filtered.length === 0) {
        setSelectedDoctorId('');
      } else if (!selectedDoctorId || !filtered.some(d => String(d.doctorId || d.id) === selectedDoctorId)) {
        setSelectedDoctorId(String(filtered[0].doctorId || filtered[0].id));
      }
    } catch (e) {
      setError(e?.message || 'โหลดรายชื่อแพทย์ล้มเหลว');
      setDoctors([]);
    } finally {
      setDoctorsLoading(false);
    }
  }, [selectedDoctorId, selectedBranchId]);

  useEffect(() => { loadDoctors(); }, [selectedBranchId]);

  // Phase 13.2.7-bis (2026-04-26 user correction):
  // ProClinic /admin/schedule/doctor calendar shows ALL doctors at once
  // (multi-staff per cell, color-coded). Sidebar selection only filters
  // the right-rail "งานประจำสัปดาห์/รายวัน/วันลา" sections.
  // Therefore: load ALL schedules + filter to staffIds∈be_doctors.
  const loadSchedules = useCallback(async () => {
    if (doctors.length === 0) { setSchedules([]); return; }
    setScheduleLoading(true);
    try {
      // Phase BS V2 — branch-scoped fetch.
      const all = await listStaffSchedules({ branchId: selectedBranchId });
      const doctorIdSet = new Set(doctors.map((d) => String(d.doctorId || d.id)));
      const filtered = all.filter((e) => doctorIdSet.has(String(e.staffId)));
      setSchedules(filtered);
    } catch (e) {
      setError(e?.message || 'โหลดตารางล้มเหลว');
      setSchedules([]);
    } finally {
      setScheduleLoading(false);
    }
  }, [doctors, selectedBranchId]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // staffMap for calendar chip labels (V21-anti: never show numeric user_id).
  const staffMap = useMemo(() => {
    const m = new Map();
    for (const d of doctors) {
      const id = String(d.doctorId || d.id);
      m.set(id, { name: doctorDisplayName(d) });
    }
    return m;
  }, [doctors]);

  // Pick selected doctor object for the sidebar
  const selectedDoctor = useMemo(() => {
    if (!selectedDoctorId) return null;
    const d = doctors.find((x) => String(x.doctorId || x.id) === String(selectedDoctorId));
    if (!d) return null;
    return {
      id: selectedDoctorId,
      name: doctorDisplayName(d),
      firstname: d.firstname || d.firstName,
      subtitle: d.position || '',
    };
  }, [doctors, selectedDoctorId]);

  // Sidebar sections show ONLY the selected doctor's entries — calendar
  // shows everyone, sidebar focuses on one (matches ProClinic).
  const { recurringEntries, overrideEntries, leaveEntries } = useMemo(() => {
    const rec = [], ovr = [], lea = [];
    if (!selectedDoctorId) return { recurringEntries: [], overrideEntries: [], leaveEntries: [] };
    for (const e of schedules) {
      if (String(e.staffId) !== String(selectedDoctorId)) continue;
      if (e.type === 'recurring') rec.push(e);
      else if (e.type === 'leave' || e.type === 'sick') lea.push(e);
      else ovr.push(e);
    }
    rec.sort((a, b) => Number(a.dayOfWeek ?? 99) - Number(b.dayOfWeek ?? 99));
    ovr.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    lea.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return { recurringEntries: rec, overrideEntries: ovr, leaveEntries: lea };
  }, [schedules, selectedDoctorId]);

  // Modal handlers
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
    <div className="space-y-3" data-testid="doctor-schedules-tab">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-[var(--tx-heading)] flex items-center gap-2">
          <Stethoscope size={18} className="text-emerald-500" />
          ตารางแพทย์
        </h2>
        <div className="flex items-center gap-2">
          {/* Filter dropdown — note: ProClinic shows this in the sidebar header, but
              we surface it as the top-bar control for desktop UX. */}
          <select value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            disabled={doctorsLoading || doctors.length === 0}
            className="px-3 py-2 rounded-lg text-sm bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-primary)] disabled:opacity-50"
            data-testid="doctor-schedules-doctor-select">
            <option value="">— เลือกแพทย์ —</option>
            {doctors.map((d) => {
              const id = d.doctorId || d.id;
              return <option key={id} value={id}>{doctorDisplayName(d)}</option>;
            })}
          </select>
        </div>
      </div>

      {error && (
        <div className="text-xs text-rose-400 px-3 py-2 rounded bg-rose-900/20 border border-rose-800">
          {error}
        </div>
      )}

      {/* Main layout: calendar (flex-1) + sidebar (288px) */}
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
              selectedStaffId={selectedDoctorId}
              staffMap={staffMap}
              onMonthChange={(y, m) => { setCalYear(y); setCalMonth(m); }}
            />
          )}
        </div>

        <ScheduleSidebarPanel
          selectedStaff={selectedDoctor}
          recurringEntries={recurringEntries}
          overrideEntries={overrideEntries}
          leaveEntries={leaveEntries}
          loading={doctorsLoading}
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
        staffId={selectedDoctorId}
        staffName={selectedDoctor?.name || ''}
        initialEntry={modal?.entry}
        onClose={closeModal}
        onSave={handleSaveEntry}
        branchId={selectedBranchId}
      />
    </div>
  );
}
