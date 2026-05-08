// V64 — orchestrator. Owns state (active tab, search, filters) + loaders.
// Mutations call BACK into AdminDashboard via props (no new mutation logic).
// Branch-scope: BSA Layer 2 routing via scopedDataLayer.js + reset on branch switch.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import {
  getAppointmentsByDateRange,
  getAllCustomers,
  getAllDeposits,
  getAllSales,
  getAllMemberships,
  getWalletsForCustomerIds,
  listStaffSchedules,
} from '../../lib/scopedDataLayer.js';
import {
  applyTabFilter,
  dateRangeForTab,
} from '../../lib/appointmentHubFilters.js';
import { buildCustomerSummaryMap } from '../../lib/appointmentHubAggregator.js';
import {
  buildPrintRows,
  buildPrintHeader,
  buildPrintHTMLTemplate,
} from '../../lib/appointmentHubPrintTemplate.js';
import { APPOINTMENT_TYPES } from '../../lib/appointmentTypes.js';
import AppointmentHubDoctorCards from './AppointmentHubDoctorCards.jsx';
import AppointmentHubTabBar from './AppointmentHubTabBar.jsx';
import AppointmentHubFilterBar from './AppointmentHubFilterBar.jsx';
import AppointmentHubRowCard from './AppointmentHubRowCard.jsx';
import AppointmentFormModal from '../backend/AppointmentFormModal.jsx';

export default function AppointmentHubView({
  // Action handlers passed from AdminDashboard (existing helpers)
  onConfirmAppt,
  onEditAppt,
  onCancelAppt,
  onCreateTreatmentForAppt,
  onEditTreatmentForAppt,
  onOpenLineForAppt,
  onAddWalkIn,
  branchName = '',
  doctors = [],
  assistants = [],
}) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [activeTab, setActiveTab] = useState('today');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [typeFilter, setTypeFilter] = useState('');

  const [appts, setAppts] = useState([]);
  const [summaryMap, setSummaryMap] = useState(new Map());
  const [allDeposits, setAllDeposits] = useState([]);  // V64-fix4: full deposits list for per-appt linkage
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  // V64-fix3 (Issue 1, 2026-05-09): edit-modal state — true full modal
  // (mirrors backend tab=appointment-all UX). Replaces V64-fix2's
  // calendar-mode redirect.
  const [editingAppt, setEditingAppt] = useState(null);
  // V64-fix3 (Issue 2): drop triggerReload — caused entire-list flash on
  // mutation. Optimistic local update + revert-on-error is enough; full
  // reconcile happens on next branch switch.
  const [reloadKey] = useState(0);

  // V64 — reset filters on branch switch (Phase 17.0 BS-9 reset-on-branch-switch pattern)
  useEffect(() => {
    setActiveTab('today');
    setSearch('');
    setStatusFilter('__all__');
    setTypeFilter('');
  }, [selectedBranchId]);

  // V64-fix2 (Issue 6): wide-range fetch [today-30 .. today+30] in ONE shot;
  // per-tab counts + filtering done client-side from the same dataset so all
  // 4 bubble counts populate immediately (no per-tab refetch). Bangkok TZ
  // stable via dateRangeForTab.
  const wideRange = useMemo(() => {
    const past = dateRangeForTab('past', new Date());
    const future = dateRangeForTab('future', new Date());
    return { from: past.from, to: future.to };
  }, []);
  // Active-tab range — used by handlePrint to label the printed PDF.
  const range = useMemo(() => dateRangeForTab(activeTab, new Date()), [activeTab]);

  // Single-load aggregation (Q3=C); driven by branchId + reloadKey only.
  // V64-fix4: factored loader into reusable function so silent-reload (post-modal-save)
  // can refetch WITHOUT setLoading(true) flash. Initial mount + branch switch
  // still call setLoading(true) for the first paint; subsequent silent refreshes
  // skip it.
  const loadAll = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [apptList, customers, deposits, sales, memberships, schedules] = await Promise.all([
        getAppointmentsByDateRange({ from: wideRange.from, to: wideRange.to, branchId: selectedBranchId }),
        getAllCustomers(),
        getAllDeposits({ branchId: selectedBranchId }),
        getAllSales({ branchId: selectedBranchId }),
        getAllMemberships(),
        listStaffSchedules({ branchId: selectedBranchId }),
      ]);
      const customerIds = [...new Set(apptList.map(a => String(a.customerId)).filter(Boolean))];
      const wallets = customerIds.length > 0 ? await getWalletsForCustomerIds(customerIds) : [];
      const map = buildCustomerSummaryMap({
        customers, deposits, sales, memberships, wallets, now: new Date(),
      });
      setAppts(apptList);
      setAllDeposits(deposits);
      setSummaryMap(map);
      setScheduleEntries(schedules);
      if (!silent) setLoading(false);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('AppointmentHubView load failed:', e);
      if (!silent) {
        setAppts([]);
        setLoading(false);
      }
    }
  }, [wideRange.from, wideRange.to, selectedBranchId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAll();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [loadAll, reloadKey]);

  // V64-fix4: per-appointment deposit lookup. Lets RowCard show
  // "💰 มัดจำ {amount} — เพื่อ {purpose}" chip when an appointment is
  // linked to a deposit (came from จองมัดจำ flow).
  const depositByApptId = useMemo(() => {
    const map = new Map();
    for (const d of allDeposits) {
      if (d?.linkedAppointmentId && d.status === 'active') {
        map.set(String(d.linkedAppointmentId), d);
      }
    }
    return map;
  }, [allDeposits]);

  // Per-tab filtered list (active tab)
  const filteredAppts = useMemo(() => {
    return applyTabFilter(appts, {
      tab: activeTab,
      now: new Date(),
      statusOverride: statusFilter,
      search,
      typeFilter,
    });
  }, [appts, activeTab, statusFilter, search, typeFilter]);

  // V64-fix2 (Issue 6): real bubble counts for ALL 4 tabs from same dataset.
  // Counts ignore search/type/status filters (default-status-per-tab only)
  // so admin always sees the "actionable rows per tab" number.
  const counts = useMemo(() => {
    const now = new Date();
    return {
      today:    applyTabFilter(appts, { tab: 'today',    now }).length,
      tomorrow: applyTabFilter(appts, { tab: 'tomorrow', now }).length,
      future:   applyTabFilter(appts, { tab: 'future',   now }).length,
      past:     applyTabFilter(appts, { tab: 'past',     now }).length,
    };
  }, [appts]);

  // V64-fix (2026-05-09 root-cause): Doctor + assistant shifts for today/tomorrow header (Q2=B+D)
  // Real be_staff_schedules schema (verified via preview_eval against prod):
  //   - field `type` (NOT `kind`): 'recurring' | 'override' | 'leave' | 'sick' | 'holiday'
  //   - field `date` (NOT `dateISO`) for non-recurring entries (YYYY-MM-DD)
  //   - field `dayOfWeek` (0=Sun..6=Sat) for recurring entries
  //   - NO `role` field — role is inferred from staffId (membership in doctors/assistants prop list)
  // Bangkok TZ stable: midday-UTC parse so day-of-week stays correct across the dateline.
  const { doctorShifts, assistantShifts } = useMemo(() => {
    if (activeTab !== 'today' && activeTab !== 'tomorrow') {
      return { doctorShifts: [], assistantShifts: [] };
    }
    const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowMs = Date.now() + (activeTab === 'tomorrow' ? 24 * 3600 * 1000 : 0);
    const bd = new Date(nowMs + BANGKOK_OFFSET_MS);
    const targetISO = `${bd.getUTCFullYear()}-${String(bd.getUTCMonth() + 1).padStart(2, '0')}-${String(bd.getUTCDate()).padStart(2, '0')}`;
    // dayOfWeek for the target Bangkok day (0=Sun..6=Sat)
    const [yy, mm, dd] = targetISO.split('-').map(Number);
    const dow = new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0)).getUTCDay();

    const doctorIdSet = new Set((doctors || []).map(p => String(p.id)));
    const assistantIdSet = new Set((assistants || []).map(p => String(p.id)));

    const filterShifts = (entries, idSet) => entries
      .filter(e => {
        if (!idSet.has(String(e.staffId))) return false;
        // Working entries only (skip leave/sick/holiday)
        if (e.type === 'recurring' && e.dayOfWeek === dow) return true;
        if (e.type === 'override' && e.date === targetISO) return true;
        return false;
      })
      .map(e => ({ staffId: e.staffId, startTime: e.startTime, endTime: e.endTime }));

    const enrich = (shifts, peopleList) => shifts.map(s => ({
      ...s,
      name: peopleList.find(p => String(p.id) === String(s.staffId))?.name || s.staffId,
    }));
    return {
      doctorShifts: enrich(filterShifts(scheduleEntries, doctorIdSet), doctors),
      assistantShifts: enrich(filterShifts(scheduleEntries, assistantIdSet), assistants),
    };
  }, [scheduleEntries, doctors, assistants, activeTab]);

  // V64 — print PDF (Q5=C). Direct html2canvas + jsPDF (V32 lock — never html2pdf).
  const handlePrint = useCallback(async () => {
    const rows = buildPrintRows({ appts: filteredAppts, summaryMap });
    const header = buildPrintHeader({ tab: activeTab, branchName, from: range.from, to: range.to, now: new Date() });
    const html = buildPrintHTMLTemplate({ header, rows });
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1100px';
    container.innerHTML = html;
    document.body.appendChild(container);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(container.firstElementChild, { scale: 2, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const imgRatio = canvas.height / canvas.width;
      const imgW = pageW;
      const imgH = imgW * imgRatio;
      pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
      const filename = `appointments-${selectedBranchId || 'all'}-${activeTab}-${range.from}.pdf`;
      pdf.save(filename);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Print failed:', e);
      window.alert('พิมพ์ตารางนัดหมายไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      if (container.parentNode) document.body.removeChild(container);
    }
  }, [filteredAppts, summaryMap, activeTab, branchName, range.from, range.to, selectedBranchId]);

  const dateLabel = activeTab === 'today' ? 'นี้' : (activeTab === 'tomorrow' ? 'พรุ่งนี้' : '');
  const typeOptions = APPOINTMENT_TYPES.map(t => ({ value: t.value, label: t.label }));

  // V64-fix3 (Issue 2, 2026-05-09): pure optimistic update — NO reload
  // (no flash). On error → revert. Status update only changes the row's
  // status field in local state; React re-renders just that row's chip +
  // button set. Reconcile happens on next branch switch / page reload.
  const handleConfirmOptimistic = useCallback(async (appt) => {
    const prevStatus = appt.status;
    setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'confirmed' } : a));
    try {
      await Promise.resolve(onConfirmAppt?.(appt));
    } catch {
      // Parent's onConfirmAppt swallows errors via toast; if it rejects, revert.
      setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: prevStatus } : a));
    }
  }, [onConfirmAppt]);

  const handleCancelOptimistic = useCallback(async (appt) => {
    const prevStatus = appt.status;
    setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'cancelled' } : a));
    try {
      await Promise.resolve(onCancelAppt?.(appt));
    } catch {
      setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: prevStatus } : a));
    }
  }, [onCancelAppt]);

  // V64-fix3 (Issue 1): open full modal in-place. Replaces calendar-mode
  // redirect from V64-fix2. AppointmentFormModal handles its own save flow
  // via createBackendAppointment / updateBackendAppointment.
  const handleEditOpenModal = useCallback((appt) => {
    setEditingAppt(appt);
  }, []);

  const handleModalSaved = useCallback(() => {
    // V64-fix4 (Issue 3): modal's onSaved is called with no args. We can't
    // optimistic-merge without the saved doc; instead silently refetch (no
    // setLoading flash) so the row reflects the new status/details
    // immediately + smoothly.
    setEditingAppt(null);
    loadAll({ silent: true });
  }, [loadAll]);

  const handleModalDelete = useCallback(async (appt) => {
    // Optimistic remove from local state; Firestore delete handled by modal.
    setAppts(prev => prev.filter(a => a.id !== appt.id));
    setEditingAppt(null);
    loadAll({ silent: true });  // reconcile after delete
  }, [loadAll]);

  return (
    <div data-testid="appt-hub-view">
      {/* V64-fix2 (Issue 7): doctor cards container reserves min-height
          so layout doesn't shift when switching between today/tomorrow
          (which show staff cards) and future/past (which don't). */}
      <div className="min-h-[120px]" data-testid="appt-hub-doctor-section">
        <AppointmentHubDoctorCards
          tab={activeTab}
          doctorShifts={doctorShifts}
          assistantShifts={assistantShifts}
          dateLabel={dateLabel}
        />
      </div>
      <AppointmentHubTabBar
        activeTab={activeTab}
        counts={counts}
        onTabChange={setActiveTab}
      />
      <AppointmentHubFilterBar
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        typeOptions={typeOptions}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onPrint={handlePrint}
        onAddWalkIn={onAddWalkIn}
        resultCount={filteredAppts.length}
      />
      {loading && (
        <div className="text-xs text-[var(--tx-muted)] italic mb-2">กำลังโหลด…</div>
      )}
      {!loading && filteredAppts.length === 0 && (
        <div className="text-xs text-[var(--tx-muted)] italic text-center py-6 border border-dashed border-[var(--bd)] rounded-lg" data-testid="appt-hub-empty">
          — ไม่มีรายการนัดหมาย —
        </div>
      )}
      {!loading && filteredAppts.map(a => (
        <AppointmentHubRowCard
          key={a.id}
          appt={a}
          summary={summaryMap.get(String(a.customerId))}
          apptDeposit={depositByApptId.get(String(a.id))}
          now={new Date()}
          onConfirm={handleConfirmOptimistic}
          onEdit={handleEditOpenModal}
          onCancel={handleCancelOptimistic}
          onCreateTreatment={onCreateTreatmentForAppt}
          onEditTreatment={onEditTreatmentForAppt}
          onOpenLine={onOpenLineForAppt}
        />
      ))}
      {/* V64-fix3 (Issue 1): full edit modal — same component used by
          backend tab=appointment-all + CustomerDetailView. */}
      {editingAppt && (
        <AppointmentFormModal
          mode="edit"
          appt={editingAppt}
          skipHolidayCheck={true}
          skipCollisionCheck={true}
          existingAppointments={appts}
          onSaved={handleModalSaved}
          onClose={() => setEditingAppt(null)}
          onDelete={handleModalDelete}
        />
      )}
    </div>
  );
}
