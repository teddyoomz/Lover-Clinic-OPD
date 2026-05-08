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
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // V64 — reset filters on branch switch (Phase 17.0 BS-9 reset-on-branch-switch pattern)
  useEffect(() => {
    setActiveTab('today');
    setSearch('');
    setStatusFilter('__all__');
    setTypeFilter('');
  }, [selectedBranchId]);

  // Compute date range from active tab
  const range = useMemo(() => dateRangeForTab(activeTab, new Date()), [activeTab]);

  // Single-load aggregation (Q3=C)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [apptList, customers, deposits, sales, memberships, schedules] = await Promise.all([
          getAppointmentsByDateRange({ from: range.from, to: range.to, branchId: selectedBranchId }),
          getAllCustomers(),
          getAllDeposits({ branchId: selectedBranchId }),
          getAllSales({ branchId: selectedBranchId }),
          getAllMemberships(),
          listStaffSchedules({ branchId: selectedBranchId }),
        ]);
        if (cancelled) return;
        const customerIds = [...new Set(apptList.map(a => String(a.customerId)).filter(Boolean))];
        const wallets = customerIds.length > 0 ? await getWalletsForCustomerIds(customerIds) : [];
        if (cancelled) return;
        const map = buildCustomerSummaryMap({
          customers, deposits, sales, memberships, wallets, now: new Date(),
        });
        setAppts(apptList);
        setSummaryMap(map);
        setScheduleEntries(schedules);
        setLoading(false);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('AppointmentHubView load failed:', e);
        if (!cancelled) {
          setAppts([]);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to, selectedBranchId]);

  // Per-tab filtered list
  const filteredAppts = useMemo(() => {
    return applyTabFilter(appts, {
      tab: activeTab,
      now: new Date(),
      statusOverride: statusFilter,
      search,
      typeFilter,
    });
  }, [appts, activeTab, statusFilter, search, typeFilter]);

  // V64 simple — count for active tab from filtered data; other tabs = 0 until visited
  const counts = useMemo(() => {
    const c = { today: 0, tomorrow: 0, future: 0, past: 0 };
    c[activeTab] = filteredAppts.length;
    return c;
  }, [activeTab, filteredAppts.length]);

  // Doctor + assistant shifts for today/tomorrow header (Q2=B+D)
  // Inline filter — does NOT depend on any external schedule helper that may
  // not exist; works with raw be_staff_schedules entries (kind/dayOfWeek/dateISO/role).
  const { doctorShifts, assistantShifts } = useMemo(() => {
    const targetISO = activeTab === 'today'
      ? new Date().toISOString().slice(0, 10)
      : (activeTab === 'tomorrow' ? new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10) : null);
    if (!targetISO) return { doctorShifts: [], assistantShifts: [] };
    // dayOfWeek: 0=Sun..6=Sat
    const dow = new Date(targetISO + 'T12:00:00Z').getUTCDay();
    const filterShifts = (entries, role) => entries
      .filter(e => {
        if (e.role !== role) return false;
        if (e.kind === 'recurring' && e.dayOfWeek === dow) return true;
        if (e.kind === 'override' && e.dateISO === targetISO) return true;
        return false;
      })
      .map(e => ({ staffId: e.staffId, startTime: e.startTime, endTime: e.endTime }));
    const docHrs = filterShifts(scheduleEntries, 'doctor');
    const asstHrs = filterShifts(scheduleEntries, 'assistant');
    const enrich = (shifts, peopleList) => shifts.map(s => ({
      ...s,
      name: peopleList.find(p => String(p.id) === String(s.staffId))?.name || s.staffId,
    }));
    return {
      doctorShifts: enrich(docHrs, doctors),
      assistantShifts: enrich(asstHrs, assistants),
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

  return (
    <div data-testid="appt-hub-view">
      <AppointmentHubDoctorCards
        tab={activeTab}
        doctorShifts={doctorShifts}
        assistantShifts={assistantShifts}
        dateLabel={dateLabel}
      />
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
          now={new Date()}
          onConfirm={onConfirmAppt}
          onEdit={onEditAppt}
          onCancel={onCancelAppt}
          onCreateTreatment={onCreateTreatmentForAppt}
          onEditTreatment={onEditTreatmentForAppt}
          onOpenLine={onOpenLineForAppt}
        />
      ))}
    </div>
  );
}
