// V64 — orchestrator. Owns state (active tab, search, filters) + loaders.
// Mutations call BACK into AdminDashboard via props (no new mutation logic).
// Branch-scope: BSA Layer 2 routing via scopedDataLayer.js + reset on branch switch.

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import {
  getAppointmentsByDateRange,
  getAllCustomers,
  getAllDeposits,
  getAllSales,
  getAllMemberships,
  getWalletsForCustomerIds,
  listStaffSchedules,
  // 2026-05-27 — live cross-device trigger listeners (treatments/deposits/sales).
  // These are SIGNALS only — on fire the component bumps a tick → loadAll re-fetches.
  listenToTreatmentsByDateRange,
  listenToAllDeposits,
  listenToAllSales,
  // V71 (2026-05-15) — markAppointmentServiceCompleted is consumed by AdminDashboard
  // (parent) and passed back to HubView via the onMarkServiceComplete prop. NOT
  // imported here to avoid dead-import code smell.
} from '../../lib/scopedDataLayer.js';
import { useBranchAwareListener } from '../../hooks/useBranchAwareListener.js';
import { useDoctorMap } from '../../hooks/useDoctorMap.js';
import { thaiTodayISO } from '../../utils.js';
import {
  applyTabFilter,
  dateRangeForTab,
  sortApptsByDateTimeAsc,
  sortApptsByDateTimeDesc,   // ③ (2026-06-14) — ย้อนหลัง 30 วัน = newest first
  sortApptsConfirmedFirst,   // ① (2026-05-31)
} from '../../lib/appointmentHubFilters.js';
import { buildCustomerSummaryMap } from '../../lib/appointmentHubAggregator.js';
// B2 (2026-07-07 instant cold-start) — stale-while-revalidate one-shot orchestrator
// + the "กำลังซิงค์…" indicator shown while on-screen data is still the cache leg.
import { swrRun, _resultFromCache } from '../../lib/swrRead.js';
import SyncIndicator from '../SyncIndicator.jsx';
import {
  buildPrintRows,
  buildPrintHeader,
  buildPrintHTMLTemplate,
} from '../../lib/appointmentHubPrintTemplate.js';
import { APPOINTMENT_TYPES } from '../../lib/appointmentTypes.js';
import { deriveWorkingDoctorShiftsForDate } from '../../lib/staffScheduleValidation.js';
import { loadTreatmentsByDateRange } from '../../lib/reportsLoaders.js';
// V118 (2026-05-23) — Card-level OPD lifecycle state derivation + synth-session
// fallback for "ดูข้อมูล" on existing-customer cards with no linkedOpdSessionId.
// V121 (2026-05-23) — extended with isCardFlowUnread for per-sub-pill bubble counts.
// V124 (2026-05-24 EOD+1) — swapped to isAppointmentPendingOpdSave (broader
// predicate matching the row badge at AppointmentHubRowCard:172). V121's
// isCardFlowUnread was too narrow — missed all regular จองไม่มัดจำ/มัดจำ bookings.
import { resolveCardOpdState, synthesizeSessionFromCustomer, isAppointmentPendingOpdSave, isAppointmentOpdPending } from '../../lib/opdSessionState.js';
import AppointmentHubDoctorCards from './AppointmentHubDoctorCards.jsx';
import AppointmentHubTabBar from './AppointmentHubTabBar.jsx';
import AppointmentHubFilterBar from './AppointmentHubFilterBar.jsx';
import AppointmentHubRowCard from './AppointmentHubRowCard.jsx';
import AppointmentHubTodaySubPillBar from './AppointmentHubTodaySubPillBar.jsx';
import AppointmentFormModal from '../backend/AppointmentFormModal.jsx';
import DepositAwareCancelDialog from './DepositAwareCancelDialog.jsx';
import { subPillCountsForToday } from '../../lib/appointmentHubFilters.js';
// V71 (2026-05-15) — AppointmentLineBadge MIGRATED to AppointmentHubRowCard
// (inline next to status chip). HubView no longer renders the badge directly;
// the absolute-positioned top-right wrapper was REMOVED to close the V68→V71
// transient double-badge state. V68/AV47 audit assertion for HubView moved
// to RowCard (the new consumer surface).

export default function AppointmentHubView({
  // V64-fix7 (2026-05-09): caller-provided counter that bumps after any
  // treatment-related mutation (TFP onSaved + CustomerDetailView delete).
  // View includes in loadAll deps so missed-badge + button-set update
  // real-time after admin creates/edits/deletes a treatment.
  treatmentDataVersion = 0,
  // V64-fix9 (2026-05-09): caller-provided counter bumping every time
  // AdminDashboard's listenToAppointmentsByMonth listener fires (any
  // be_appointments change in current month — create/edit/cancel). View
  // silently re-fetches wide range so all 4 tab bubble counts + active
  // list update real-time without F5. Mirror of treatmentDataVersion.
  appointmentDataVersion = 0,
  // Action handlers passed from AdminDashboard (existing helpers)
  onConfirmAppt,
  onEditAppt,
  onCancelAppt,
  onCreateTreatmentForAppt,
  onEditTreatmentForAppt,
  onOpenLineForAppt,
  onMarkServiceComplete,                     // V71 NEW
  onUnmarkServiceComplete,                   // V71.A NEW — symmetric un-mark
  branchName = '',
  doctors = [],
  // V118 (2026-05-23) — Card-level OPD lifecycle handlers, plumbed from
  // AdminDashboard. Each card derives its state via resolveLinkedSession +
  // resolveCardOpdState; handlers dispatch the relevant side-effect.
  resolveLinkedSession,        // (appt) => session | null
  onSendOrViewOpdLink,         // (appt) => Promise<void> — provision + open SendCustomerLinkModal
  onSaveOpdFromCard,           // (appt) => Promise<void> — wraps handleOpdClick(session)
  setViewingSession,           // (session) => void — opens ประวัติผู้ป่วย OPD modal
  opdLinkBusyByApptId = {},
  opdSaveBusyByApptId = {},
}) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  // 2026-06-04 — live doctor lookup so renaming a doctor in tab=doctors propagates
  // to existing appointment cards at render (was the frozen appt.doctorName snapshot).
  const doctorMap = useDoctorMap();
  const [activeTab, setActiveTab] = useState('today');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [typeFilter, setTypeFilter] = useState('');
  // V71 (2026-05-15) — today sub-pill state. Resets to 'waiting' on tab change.
  const [todaySubPill, setTodaySubPill] = useState('waiting');

  const [appts, setAppts] = useState([]);
  // B2 — apptsRef mirrors appts SYNCHRONOUSLY inside applyCore so stage-2
  // (loadEnrichment → wallets by customerId) always reads the freshest list
  // without a state-race (same sync-ref lesson as useResilientLoad settledRef).
  const apptsRef = useRef([]);
  const [summaryMap, setSummaryMap] = useState(new Map());
  const [allDeposits, setAllDeposits] = useState([]);  // V64-fix4: full deposits list for per-appt linkage
  // V118 (2026-05-23) — full customer list saved as state so the per-row
  // "ดูข้อมูล" handler can synthesize a session shape from customer.patientData
  // for State A cards without a linkedOpdSessionId.
  const [allCustomersState, setAllCustomersState] = useState([]);
  const [allTreatments, setAllTreatments] = useState([]);  // V64-fix6: per-customer-date treatment lookup for auto-confirm + edit-button
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  // B2 (2026-07-07) — syncing: on-screen core data is the SWR cache leg (server
  // not yet confirmed) → SyncIndicator. summaryLoading: stage-2 enrichment
  // (finance chips) not yet applied → RowCard skeleton chips.
  const [syncing, setSyncing] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  // V64-fix3 (Issue 1, 2026-05-09): edit-modal state — true full modal
  // (mirrors backend tab=appointment-all UX). Replaces V64-fix2's
  // calendar-mode redirect.
  const [editingAppt, setEditingAppt] = useState(null);
  // V64-fix3 (Issue 2): drop triggerReload — caused entire-list flash on
  // mutation. Optimistic local update + revert-on-error is enough; full
  // reconcile happens on next branch switch.
  const [reloadKey] = useState(0);

  // 2026-05-27 — live cross-device: any trigger-listener fire bumps this tick;
  // an effect re-runs loadAll({silent}). skip-first avoids the mount double-load.
  const [liveRefreshTick, setLiveRefreshTick] = useState(0);
  const liveFirstFire = useRef({ tx: true, dep: true, sale: true });
  const [todayKey, setTodayKey] = useState(() => thaiTodayISO());
  // ① (2026-05-26) — "เพิ่มนัดหมาย" opens the SAME AppointmentFormModal this
  // view already renders for edit (below), in create mode (all 5 types).
  const [creatingAppt, setCreatingAppt] = useState(false);
  // (2026-05-26) deposit-aware cancel — { appt, depositId } when an appt with a
  // linked deposit is being cancelled; null otherwise. See DepositAwareCancelDialog.
  const [cancelDialog, setCancelDialog] = useState(null);

  // V64 — reset filters on branch switch (Phase 17.0 BS-9 reset-on-branch-switch pattern)
  useEffect(() => {
    setActiveTab('today');
    setSearch('');
    setStatusFilter('__all__');
    setTypeFilter('');
  }, [selectedBranchId]);

  // V71 (2026-05-15) — reset sub-pill to waiting whenever activeTab changes
  // (including branch-switch which also resets activeTab to 'today').
  useEffect(() => {
    setTodaySubPill('waiting');
  }, [activeTab]);

  // V64-fix2 (Issue 6): wide-range fetch [today-30 .. today+30] in ONE shot;
  // per-tab counts + filtering done client-side from the same dataset so all
  // 4 bubble counts populate immediately (no per-tab refetch). Bangkok TZ
  // stable via dateRangeForTab.
  const wideRange = useMemo(() => {
    const past = dateRangeForTab('past', new Date());
    const future = dateRangeForTab('future', new Date());
    return { from: past.from, to: future.to };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);   // 2026-05-27 — recompute the fetch window on day-rollover (resilience C)
  // Active-tab range — used by handlePrint to label the printed PDF.
  const range = useMemo(() => dateRangeForTab(activeTab, new Date()), [activeTab]);

  // Single-load aggregation (Q3=C); driven by branchId + reloadKey only.
  // V64-fix4: factored loader into reusable function so silent-reload (post-modal-save)
  // can refetch WITHOUT setLoading(true) flash. Initial mount + branch switch
  // still call setLoading(true) for the first paint; subsequent silent refreshes
  // skip it.
  // B2 (2026-07-07 instant cold-start, spec Q2=A) — loadAll split into TWO stages:
  //   Stage 1 loadCore       = appointments + schedules → the LIST + counts +
  //                            doctor header paint FIRST (SWR: cache leg paints
  //                            ~instantly, server leg corrects).
  //   Stage 2 loadEnrichment = customers/deposits/sales/memberships/treatments +
  //                            wallets → buildCustomerSummaryMap (finance chips).
  //                            NON-BLOCKING — chips show skeletons until it lands.
  // Silent reloads (change-signal / modal-save) skip the cache leg entirely
  // (data already on screen; server-only refresh, no loading flash) — the
  // pre-B2 silent semantics are preserved.
  const loadCore = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const fetchCore = (source) => Promise.all([
      getAppointmentsByDateRange({ from: wideRange.from, to: wideRange.to, branchId: selectedBranchId, source }),
      listStaffSchedules({ branchId: selectedBranchId, source }),
    ]);
    const applyCore = ([apptList, schedules], { fromCache }) => {
      apptsRef.current = apptList;               // sync BEFORE React commits (stage-2 reads it)
      setAppts(apptList);
      setScheduleEntries(schedules);
      setLoading(false);
      // B1-fix honesty: swrRun's server leg already reads the data-layer
      // __fromCache tag (a network-down getDocs silently serves cache) — the
      // fromCache param here is the REAL SDK metadata, so the indicator never
      // clears while cache data is on screen.
      setSyncing(fromCache);
    };
    if (silent) { const r = await fetchCore(undefined); applyCore(r, { fromCache: _resultFromCache(r) }); return; }
    await swrRun({
      cacheLoad: async () => { const r = await fetchCore('cache'); return { hasData: r[0].length > 0, data: r }; },
      serverLoad: () => fetchCore(undefined),
      apply: applyCore,
    });
  }, [wideRange.from, wideRange.to, selectedBranchId]);

  const loadEnrichment = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setSummaryLoading(true);
    const fetchEnrich = async (source) => {
      const [customers, deposits, sales, memberships, treatments] = await Promise.all([
        getAllCustomers({ source }),
        getAllDeposits({ branchId: selectedBranchId, source }),
        getAllSales({ branchId: selectedBranchId, source }),
        getAllMemberships({ source }),
        // V64-fix6 evolved (2026-05-09): load ALL branches' treatments
        // (allBranches:true) so auto-confirm is branch-blind. Reasons:
        //   1. Legacy treatments may lack branchId field → strict filter
        //      excludes them → false-negative missed-badge.
        //   2. Clinic semantic — if customer has a treatment on date X
        //      ANYWHERE, the appointment for them on date X is auto-confirmed
        //      (they came in real life regardless of which branch recorded it).
        // Lookup is keyed by customerId|date; cross-branch overlap is correct.
        loadTreatmentsByDateRange({ from: wideRange.from, to: wideRange.to, allBranches: true, source }),
      ]);
      const customerIds = [...new Set(apptsRef.current.map(a => String(a.customerId)).filter(Boolean))];
      const wallets = customerIds.length > 0 ? await getWalletsForCustomerIds(customerIds, { source }) : [];
      return { customers, deposits, sales, memberships, treatments, wallets };
    };
    const applyEnrich = (d) => {
      setSummaryMap(buildCustomerSummaryMap({
        customers: d.customers, deposits: d.deposits, sales: d.sales,
        memberships: d.memberships, wallets: d.wallets, now: new Date(),
      }));
      setAllDeposits(d.deposits);
      setAllTreatments(d.treatments);
      setAllCustomersState(d.customers);  // V118 — keep for synth-session fallback
      setSummaryLoading(false);
    };
    if (silent) { applyEnrich(await fetchEnrich(undefined)); return; }
    await swrRun({
      cacheLoad: async () => { const r = await fetchEnrich('cache'); return { hasData: r.customers.length > 0, data: r }; },
      serverLoad: () => fetchEnrich(undefined),
      apply: applyEnrich,
    });
  }, [wideRange.from, wideRange.to, selectedBranchId]);

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    try {
      await loadCore({ silent });
      // Stage 2 chains AFTER core but is NOT awaited by callers' paint path.
      // Its failure must never take down the already-painted list — chips fall
      // back to the no-summary rendering (pre-B2 behavior for a missing entry).
      loadEnrichment({ silent }).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('AppointmentHubView enrichment load failed:', e?.message);
        setSummaryLoading(false);
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('AppointmentHubView load failed:', e);
      if (!silent) {
        setAppts([]);
        apptsRef.current = [];
        setLoading(false);
      }
    }
  }, [loadCore, loadEnrichment]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAll();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [loadAll, reloadKey]);

  // perf P3.23 (2026-07-06) — coalesce change-signal bursts. A single TFP save
  // fires the treatment + sale (+appointment) listeners within ~1s; each
  // previously triggered its OWN loadAll = 7 whole-dataset fetches ×3 per save.
  // One trailing 800ms debounce = one refetch per burst. Manual reconcile sites
  // (onSaved / delete) stay DIRECT loadAll — user-facing immediacy unchanged.
  const silentReloadTimer = useRef(null);
  const scheduleSilentReload = useCallback(() => {
    if (silentReloadTimer.current) clearTimeout(silentReloadTimer.current);
    silentReloadTimer.current = setTimeout(() => {
      silentReloadTimer.current = null;
      loadAll({ silent: true });
    }, 800);
  }, [loadAll]);
  // Cancel any pending debounced reload when loadAll identity changes (branch
  // switch → its own fresh initial load covers it; prevents a stale-closure
  // fetch of the previous branch) AND on unmount.
  useEffect(() => () => {
    if (silentReloadTimer.current) { clearTimeout(silentReloadTimer.current); silentReloadTimer.current = null; }
  }, [loadAll]);

  // V64-fix7: silent reload when treatmentDataVersion bumps (post-TFP save
  // or treatment delete elsewhere). Skip first render (version=0 = baseline).
  const treatmentDataVersionPrev = useRef(treatmentDataVersion);
  useEffect(() => {
    if (treatmentDataVersion === treatmentDataVersionPrev.current) return;
    treatmentDataVersionPrev.current = treatmentDataVersion;
    scheduleSilentReload();
  }, [treatmentDataVersion, scheduleSilentReload]);

  // V64-fix9 (2026-05-09): silent reload when appointmentDataVersion bumps
  // (post-be_appointments mutation upstream — kiosk create / edit / cancel).
  // Mirror of V64-fix7 pattern. Skip first render (version=0 = baseline).
  const appointmentDataVersionPrev = useRef(appointmentDataVersion);
  useEffect(() => {
    if (appointmentDataVersion === appointmentDataVersionPrev.current) return;
    appointmentDataVersionPrev.current = appointmentDataVersion;
    scheduleSilentReload();  // perf P3.23 — coalesced
  }, [appointmentDataVersion, scheduleSilentReload]);

  // ─── 2026-05-27 — LIVE CROSS-DEVICE ──────────────────────────────────────
  // Any trigger listener fire (treatments / deposits / sales) bumps
  // liveRefreshTick → loadAll({silent}) re-fetches everything → cards + OPD
  // stepper update with NO manual refresh (doctor↔admin see each other live).
  // Mirrors the appointmentDataVersion pattern above. Appointments are already
  // live via AdminDashboard listenToAppointmentsByMonth → appointmentDataVersion.
  const liveRefreshTickPrev = useRef(0);
  useEffect(() => {
    if (liveRefreshTick === liveRefreshTickPrev.current) return;
    liveRefreshTickPrev.current = liveRefreshTick;
    scheduleSilentReload();  // perf P3.23 — coalesced
  }, [liveRefreshTick, scheduleSilentReload]);

  const bumpLive = useCallback((key) => {
    if (liveFirstFire.current[key]) { liveFirstFire.current[key] = false; return; } // skip mount fire
    setLiveRefreshTick((t) => t + 1);
  }, []);
  const onTxLive = useCallback(() => bumpLive('tx'), [bumpLive]);
  const onDepLive = useCallback(() => bumpLive('dep'), [bumpLive]);
  const onSaleLive = useCallback(() => bumpLive('sale'), [bumpLive]);

  // Treatments trigger — allBranches:true (mirror loadAll; V64-fix6 cross-branch
  // auto-confirm). allBranches = not branch-scoped → direct useEffect.
  // audit-branch-scope: listener-direct — allBranches treatments trigger (BS-13 sanctioned exception)
  useEffect(() => {
    const unsub = listenToTreatmentsByDateRange(
      { from: wideRange.from, to: wideRange.to, allBranches: true },
      onTxLive,
      () => {},
    );
    return () => { try { unsub?.(); } catch { /* defensive */ } };
  }, [wideRange.from, wideRange.to, onTxLive]);

  // Deposits trigger — branch-scoped: where('branchId','==') is a SINGLE-field
  // query (auto-indexed) → useBranchAwareListener (auto branchId inject +
  // re-subscribe on branch switch).
  useBranchAwareListener(listenToAllDeposits, {}, onDepLive);

  // Sales trigger — allBranches (V66-safe). A branch-scoped sales listener would
  // be where('saleDate','>=') + where('branchId','==') = COMPOSITE index that
  // does NOT exist in firestore.indexes.json (listenToAllSales had zero prior
  // callers) → would throw FAILED_PRECONDITION in the real client. allBranches =
  // where('saleDate','>=') only = single-field (auto-indexed). As a trigger this
  // is correct: any sale change → bump → loadAll branch-filters authoritatively.
  // audit-branch-scope: listener-direct — allBranches sales trigger (index-safe)
  useEffect(() => {
    const unsub = listenToAllSales({ allBranches: true }, onSaleLive, () => {});
    return () => { try { unsub?.(); } catch { /* defensive */ } };
  }, [onSaleLive]);

  // Resilience (req C) — long-open tab: on resume, roll the day window across
  // midnight + force a refresh. App.jsx V17 already resyncs onSnapshot listeners
  // on visibility/online; this complements it for the date-window + a guaranteed
  // loadAll the moment a backgrounded tab returns. (Not via bumpLive — resume
  // SHOULD refresh, so it bypasses skip-first.)
  useEffect(() => {
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const t = thaiTodayISO();
      setTodayKey((prev) => (prev !== t ? t : prev));
      setLiveRefreshTick((x) => x + 1);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, []);

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

  // V118 (2026-05-23) — customer id → customer doc Map for synth-session
  // fallback when admin clicks 🟢 ดูข้อมูล on a State A card (existing
  // customer with no linkedOpdSessionId). synthesizeSessionFromCustomer
  // builds a __synthetic session shape that the existing ประวัติผู้ป่วย OPD
  // modal renders identically (gated against destructive ops by __synthetic).
  const customersById = useMemo(() => {
    const m = new Map();
    for (const c of allCustomersState || []) {
      if (c?.id) m.set(String(c.id), c);
    }
    return m;
  }, [allCustomersState]);

  // V64-fix6: per-customer-date treatment lookup. Lets RowCard auto-confirm
  // a past appt when ≥1 treatment exists for that customer+date+branch
  // (already loaded in same wide-range window so branch is implicit).
  // Each value is an array sorted by createdAt DESC — index 0 = latest
  // treatment for that day, used for "แก้ไขบันทึกการรักษา" button target.
  const treatmentsByCustomerDate = useMemo(() => {
    const map = new Map();
    for (const t of allTreatments) {
      const cid = String(t?.customerId || '');
      const date = t?.detail?.treatmentDate || '';
      if (!cid || !date) continue;
      const key = `${cid}|${date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    }
    return map;
  }, [allTreatments]);

  // appointment-loop R10 (2026-06-03) — loaded treatments keyed by id, so the
  // row card can VALIDATE a persistent appt.linkedTreatmentId against the
  // treatment it points at. appt.linkedTreatmentId is a denormalized FK only
  // invalidated at treatment-DELETE (R6); a CUSTOMER-CHANGE on the appointment
  // (or a stale restore) leaves it pointing at a DIFFERENT customer's treatment →
  // the gate would brick the new customer's appt forever. The card invalidates a
  // loaded link whose customerId ≠ the appt's current customerId.
  const treatmentsById = useMemo(() => {
    const map = new Map();
    for (const t of allTreatments) {
      const id = String(t?.treatmentId || t?.id || '');
      if (id) map.set(id, t);
    }
    return map;
  }, [allTreatments]);

  // Per-tab filtered list (active tab)
  // V64-fix9 (2026-05-09): sort by date+startTime ASC via sortApptsByDateTimeAsc
  // — earliest queue first at top. User: "เรียงแบบลูกค้าที่จะต้องมาถึงก่อนอยู่บน".
  // ③ (2026-06-14): the past tab inverts to DESC (newest first) — see sort below.
  const filteredAppts = useMemo(() => {
    const filtered = applyTabFilter(appts, {
      tab: activeTab,
      now: new Date(),
      statusOverride: statusFilter,
      search,
      typeFilter,
      todaySubPill,                            // V71 NEW
    });
    // ② (2026-05-26) — opd-pending also requires OPD state B/C/D (needs the
    // linkedSession join, same as cardFlowSubPillCounts). Other tabs unchanged.
    const scoped = activeTab === 'opd-pending'
      ? filtered.filter(a => isAppointmentOpdPending({ appt: a, linkedSession: resolveLinkedSession ? resolveLinkedSession(a) : null }))
      : filtered;
    // ① (2026-05-31) — today tab surfaces confirmed-active rows first (then time).
    // ③ (2026-06-14) — the "ย้อนหลัง 30 วัน" (past) tab is recency-first: yesterday
    // at the top, descending into the past (DESC). Upcoming tabs (tomorrow/future/
    // opd-pending) keep "soonest queue first" (ASC). The print PDF inherits this
    // order (buildPrintRows maps filteredAppts without re-sorting).
    return activeTab === 'today'
      ? sortApptsConfirmedFirst(scoped)
      : activeTab === 'past'
        ? sortApptsByDateTimeDesc(scoped)
        : sortApptsByDateTimeAsc(scoped);
  }, [appts, activeTab, statusFilter, search, typeFilter, todaySubPill, resolveLinkedSession]);

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

  // V121 (2026-05-23) — per-sub-pill pending-OPD-save counts. Joins each appt
  // to its linkedSession via the existing resolveLinkedSession (prop from
  // AdminDashboard) + buckets by date range. Mirrors `counts` shape so the
  // TabBar can render purple bubbles next to existing count badges.
  // V124 (2026-05-24 EOD+1) — broadened predicate: `isCardFlowUnread` (V118
  // markers required) → `isAppointmentPendingOpdSave` (state-D match w/ the
  // visible "📥 ลูกค้ากรอกแล้ว · รอบันทึก" badge at AppointmentHubRowCard:172).
  const cardFlowSubPillCounts = useMemo(() => {
    const now = new Date();
    const buckets = { today: 0, tomorrow: 0, future: 0, past: 0, 'opd-pending': 0 };
    for (const a of appts) {
      if (!a?.linkedOpdSessionId) continue;
      const linkedSession = resolveLinkedSession ? resolveLinkedSession(a) : null;
      if (!linkedSession) continue; // state C — not loaded or no patientData yet
      if (!isAppointmentPendingOpdSave({ appt: a, linkedSession })) continue;
      // Determine which date-range sub-pill this appt belongs to (mutually
      // exclusive — break on first).
      for (const tab of ['today', 'tomorrow', 'future', 'past']) {
        const inTab = applyTabFilter([a], { tab, now }).length > 0;
        if (inTab) { buckets[tab]++; break; }
      }
      // ② (2026-05-26 EOD+7) — opd-pending is a CROSS-CUTTING state tab (not a
      // date-range bucket) so it overlaps the date tabs → count SEPARATELY,
      // outside the break loop. Same 📥 state-D appts, gated by the opd-pending
      // tab's own date-range membership (mirror opdPendingCount). Gives the
      // "รอ/ยังไม่ลง OPD" tab purple-bubble parity with the other tabs.
      if (applyTabFilter([a], { tab: 'opd-pending', now }).length > 0) {
        buckets['opd-pending']++;
      }
    }
    return buckets;
  }, [appts, resolveLinkedSession]);

  // ② (2026-05-26) — count for the opd-pending pill. Ignores search/type
  // (like the other tab counts) — date-range + state only.
  const opdPendingCount = useMemo(() => {
    const now = new Date();
    const inRange = applyTabFilter(appts, { tab: 'opd-pending', now });
    let n = 0;
    for (const a of inRange) {
      const ls = resolveLinkedSession ? resolveLinkedSession(a) : null;
      if (isAppointmentOpdPending({ appt: a, linkedSession: ls })) n++;
    }
    return n;
  }, [appts, resolveLinkedSession]);

  // V71 (2026-05-15) — sub-pill counts derived from same appts array.
  const todaySubCounts = useMemo(() => subPillCountsForToday(appts, new Date()), [appts]);

  // V164-fix (2026-06-29) — doctor-only shifts for the today/tomorrow header.
  // Uses the SINGLE canonical reader deriveWorkingDoctorShiftsForDate
  // (mergeSchedulesForDate override-wins + WORKING_TIME_TYPES) — the SAME source
  // TodaysDoctorsPanel uses — so this header can't drift again.
  //   Was: an inline filter matching per-date entries by literal `type==='override'`.
  //   Real be_staff_schedules per-date shifts have type 'work'/'halfday' (there is NO
  //   'override' type) → doctors on a per-date shift today were silently DROPPED
  //   (showed "ไม่มีแพทย์เข้า" while a doctor WAS in). Class-of-bug: a reader that
  //   reimplemented schedule-effective-on-date and drifted from the canonical helper.
  // Bangkok TZ stable: midday-UTC date string so the day stays correct across the dateline.
  const { doctorShifts } = useMemo(() => {
    if (activeTab !== 'today' && activeTab !== 'tomorrow') {
      return { doctorShifts: [] };
    }
    const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowMs = Date.now() + (activeTab === 'tomorrow' ? 24 * 3600 * 1000 : 0);
    const bd = new Date(nowMs + BANGKOK_OFFSET_MS);
    const targetISO = `${bd.getUTCFullYear()}-${String(bd.getUTCMonth() + 1).padStart(2, '0')}-${String(bd.getUTCDate()).padStart(2, '0')}`;
    const doctorIds = (doctors || []).map(p => String(p.id));
    const shifts = deriveWorkingDoctorShiftsForDate({ scheduleEntries, doctorIds, targetISO });
    const enrich = (list) => list.map(s => ({
      ...s,
      name: (doctors || []).find(p => String(p.id) === String(s.staffId))?.name || s.staffId,
    }));
    return { doctorShifts: enrich(shifts) };
  }, [scheduleEntries, doctors, activeTab]);

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
    // V64-fix5 (2026-05-09): confirm BEFORE optimistic update so the row
    // doesn't visibly flash status='cancelled' then revert when user clicks
    // 'No' on the confirm dialog. Pre-fix flow had confirm AFTER setAppts:
    // status flipped to 'ยกเลิก' instantly → confirm dialog blocked → user
    // says no → revert flips back to prev status → 1-2 frame jitter visible.
    // (2026-05-26) deposit-linked → open the deposit-aware dialog instead of
    // the plain confirm; NO optimistic flip until the user picks a choice
    // (handled by handleCancelChoice). The dialog asks ลบมัดจำด้วย / เก็บมัดจำ.
    const depId = appt.linkedDepositId || appt.spawnedFromDepositId || '';
    if (depId) { setCancelDialog({ appt, depositId: depId }); return; }
    // Issue-3 (2026-05-26) — cancel = HARD DELETE from be_appointments now, so
    // the confirm says so honestly (was 'ยกเลิกนัดนี้?').
    if (!window.confirm('ยกเลิกและลบนัดนี้ออกจากระบบ?')) return;
    const prevStatus = appt.status;
    setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'cancelled' } : a));
    try {
      await Promise.resolve(onCancelAppt?.(appt));
    } catch {
      setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: prevStatus } : a));
    }
  }, [onCancelAppt]);

  // (2026-05-26) deposit-aware cancel choice from DepositAwareCancelDialog.
  // 'both' → onCancelAppt(appt,{deleteDeposit:true}) → deleteDepositBookingPair
  // (hard, both gone). 'this-only' → cancel appt only (deposit preserved).
  const handleCancelChoice = useCallback(async (choice) => {
    const dlg = cancelDialog;
    setCancelDialog(null);
    if (!dlg || choice === 'cancel') return;
    const { appt } = dlg;
    const prevStatus = appt.status;
    setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'cancelled' } : a));
    try {
      await Promise.resolve(onCancelAppt?.(appt, { deleteDeposit: choice === 'both' }));
    } catch {
      setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: prevStatus } : a));
    }
  }, [cancelDialog, onCancelAppt]);

  // V71 (2026-05-15) — optimistic local-state update wrapper. Parent
  // (AdminDashboard) owns the Firestore write via the onMarkServiceComplete
  // prop. Mirror of V64-fix3 handleConfirmOptimistic pattern.
  const handleMarkServiceCompleteOptimistic = useCallback(async (appt) => {
    const prevValue = appt.serviceCompletedAt;
    const optimisticStamp = new Date();
    setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, serviceCompletedAt: optimisticStamp } : a));
    try {
      await Promise.resolve(onMarkServiceComplete?.(appt));
    } catch {
      setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, serviceCompletedAt: prevValue } : a));
    }
  }, [onMarkServiceComplete]);

  // V71.A (2026-05-15) — symmetric optimistic un-mark wrapper. Mirrors mark
  // pattern: capture prev → null locally → call parent → revert on error.
  const handleUnmarkServiceCompleteOptimistic = useCallback(async (appt) => {
    const prevValue = appt.serviceCompletedAt;
    setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, serviceCompletedAt: null } : a));
    try {
      await Promise.resolve(onUnmarkServiceComplete?.(appt));
    } catch {
      setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, serviceCompletedAt: prevValue } : a));
    }
  }, [onUnmarkServiceComplete]);

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
      {/* V64-fix13 (2026-05-09): doctor-cards badge moved from TabBar.rightContent
          to FilterBar.doctorBadge — sits beside "รายการนัดหมาย" heading with
          reserved min-height so layout stays stable across tab switches.
          User: "ขอย้าย หมอมายด์ ลงมา 1 row มาอยู่ row รายการนัดหมาย เว้น
          นิดหน่อยพอสวยงาม + Reserve พื้นที่ไว้ ไม่ให้ UI เลื่อนขึ้นๆลงๆ". */}
      <AppointmentHubTabBar
        activeTab={activeTab}
        counts={{ ...counts, 'opd-pending': opdPendingCount }}
        onTabChange={setActiveTab}
        cardFlowCounts={cardFlowSubPillCounts}  /* V121 (2026-05-23) NEW */
      />
      {/* V71 (2026-05-15) — today sub-pill bar. Renders only on today tab. */}
      {activeTab === 'today' && (
        <AppointmentHubTodaySubPillBar
          activeSubPill={todaySubPill}
          waitingCount={todaySubCounts.waiting}
          completedCount={todaySubCounts.completed}
          onSubPillChange={setTodaySubPill}
        />
      )}
      <AppointmentHubFilterBar
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        typeOptions={typeOptions}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onPrint={handlePrint}
        onAddAppointment={() => setCreatingAppt(true)}
        resultCount={filteredAppts.length}
        doctorBadge={
          <AppointmentHubDoctorCards
            tab={activeTab}
            doctorShifts={doctorShifts}
          />
        }
      />
      {/* B2 (2026-07-07) — SWR sync indicator: on-screen data is the cache leg;
          disappears when the server snapshot confirms. Renders only while
          syncing so steady-state layout is byte-identical to pre-B2. */}
      {!loading && syncing && (
        <div className="flex justify-end pr-1 -mt-1">
          <SyncIndicator show />
        </div>
      )}
      {/* V64-fix11 (2026-05-09): loading + empty states upgraded with editorial weight. */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-[var(--tx-muted)]">
          <span className="inline-block w-3 h-3 border-2 border-orange-700/40 border-t-orange-500 rounded-full animate-spin" aria-hidden="true" />
          <span className="italic">กำลังโหลด…</span>
        </div>
      )}
      {!loading && filteredAppts.length === 0 && (
        <div
          className="text-center py-10 border border-dashed border-[var(--bd)] rounded-xl bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-surface)]"
          data-testid="appt-hub-empty"
        >
          <div className="text-3xl mb-2 opacity-40" aria-hidden="true">🗓️</div>
          <div className="text-sm font-bold text-[var(--tx-heading)]">ไม่มีรายการนัดหมาย</div>
          <div className="text-xs text-[var(--tx-muted)] italic mt-1">ลองเปลี่ยน tab หรือ ปรับตัวกรอง</div>
        </div>
      )}
      {/* V71 (2026-05-15) — absolute-positioned LINE badge wrapper REMOVED.
          LINE badge now renders INLINE inside AppointmentHubRowCard (next to
          status chip) — closes the V68→V71 transient double-badge state. */}
      {!loading && filteredAppts.map(a => {
        // V118 (2026-05-23) — derive card-level OPD lifecycle per row.
        // Hidden entirely on the ยกเลิก sub-tab (cancelled appts have no
        // follow-through). State resolved via AV118 helpers.
        // V125 (2026-05-24 EOD+1) — also hide when the individual row's
        // status === 'cancelled' (defense-in-depth). past sub-pill admits
        // cancelled appts (defaultStatusFilterForTab('past').exclude=[]),
        // so the per-row check is the only thing stopping the "📥 ลูกค้า
        // กรอกแล้ว · รอบันทึก" badge + the action row from rendering on a
        // cancelled appt that's <30d old. Mirror of the V125 predicate
        // status check in opdSessionState.js isAppointmentPendingOpdSave.
        const hideOpdLifecycle = activeTab === 'cancelled' || a?.status === 'cancelled';
        const linkedSession = hideOpdLifecycle ? null : (resolveLinkedSession ? resolveLinkedSession(a) : null);
        const opdState = hideOpdLifecycle ? 'B' : resolveCardOpdState({ appt: a, linkedSession });
        const onViewOpdHandler = () => {
          // Path 1: real linked session → open the existing OPD modal directly
          if (linkedSession) {
            setViewingSession?.(linkedSession);
            return;
          }
          // Path 2: existing customer, no linked session → synthesize from
          // be_customers.patientData so the modal still renders the data
          if (a.customerId) {
            const customer = customersById.get(String(a.customerId));
            if (customer) {
              const synth = synthesizeSessionFromCustomer(customer, a);
              if (synth) {
                setViewingSession?.(synth);
                return;
              }
            }
          }
          // Path 3: no data anywhere — silent (the disabled wait pill carries this case)
        };
        const opdLifecycle = hideOpdLifecycle
          ? { hidden: true, state: 'B' }
          : {
              hidden: false,
              state: opdState,
              onSendLink: () => onSendOrViewOpdLink?.(a),
              onViewLink: () => onSendOrViewOpdLink?.(a),
              onSaveOpd:  () => onSaveOpdFromCard?.(a),
              onViewOpd:  onViewOpdHandler,
              sendLinkBusy: !!opdLinkBusyByApptId[a.id],
              saveOpdBusy:  !!opdSaveBusyByApptId[a.id],
            };
        return (
          <AppointmentHubRowCard
            key={a.id}
            appt={a}
            doctorMap={doctorMap}
            summary={summaryMap.get(String(a.customerId))}
            summaryLoading={summaryLoading}                                 /* B2 — stage-2 chips pending */
            apptDeposit={depositByApptId.get(String(a.id))}
            apptDateTreatments={treatmentsByCustomerDate.get(`${a.customerId}|${a.date}`) || []}
            linkedTreatment={a.linkedTreatmentId ? treatmentsById.get(String(a.linkedTreatmentId)) : null}  /* R10 — FK validation */
            isTodayTab={activeTab === 'today'}                             /* V71 NEW */
            now={new Date()}
            onConfirm={handleConfirmOptimistic}
            onEdit={handleEditOpenModal}
            onCancel={handleCancelOptimistic}
            onCreateTreatment={onCreateTreatmentForAppt}
            onEditTreatment={onEditTreatmentForAppt}
            onOpenLine={onOpenLineForAppt}
            onMarkServiceComplete={handleMarkServiceCompleteOptimistic}    /* V71 NEW */
            onUnmarkServiceComplete={handleUnmarkServiceCompleteOptimistic} /* V71.A NEW */
            opdLifecycle={opdLifecycle}                                     /* V118 NEW */
          />
        );
      })}
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
      {/* ① (2026-05-26) — all-types create. SAME component as the edit modal
          above + the ปฏิทิน openCreate path. lockedAppointmentType=null → the
          radio shows all 5 types (incl. Walk-in). Collision/holiday checks ON
          (defaults) for parity with the calendar's create. */}
      {creatingAppt && (
        <AppointmentFormModal
          mode="create"
          lockedAppointmentType={null}
          initialDate={dateRangeForTab('today', new Date()).from}
          existingAppointments={appts}
          onSaved={() => { setCreatingAppt(false); loadAll({ silent: true }); }}
          onClose={() => setCreatingAppt(false)}
        />
      )}
      {/* (2026-05-26) deposit-aware cancel — opens when an appt with a linked
          deposit is cancelled; choice routes to onCancelAppt(appt,{deleteDeposit}). */}
      {cancelDialog && (
        <DepositAwareCancelDialog
          open
          orientation="appt"
          depositId={cancelDialog.depositId}
          subtitle={`คุณ ${cancelDialog.appt.customerName || '-'} · ${cancelDialog.appt.date || ''} ${cancelDialog.appt.startTime || ''}`.trim()}
          onChoice={handleCancelChoice}
          onClose={() => setCancelDialog(null)}
        />
      )}
    </div>
  );
}
