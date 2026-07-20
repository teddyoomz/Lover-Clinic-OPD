// V64 — appointment hub per-tab filter helpers (pure JS).
// Q4=A: smart per-tab defaults + missed-inference + dropdown override.
// Bangkok TZ stable via midday-UTC parse pattern (V53 BS-12).
//
// V64-fix9 (2026-05-09): + sortApptsByDateTimeAsc helper. Per user directive
// "ทำให้เรียงแบบลูกค้าที่จะต้องมาถึงก่อนอยู่บน": earliest queue first at top.
// Same comparator works for all 4 tabs — within วันนี้/พรุ่งนี้ all rows
// share `date` so startTime drives; across ล่วงหน้า/ย้อนหลัง 30 วัน, date
// primary + time tie-breaker.

/**
 * Sort an array of appointments by `date` then `startTime`, ascending.
 * Returns a NEW array; does not mutate input. Empty/missing fields treated
 * as empty string (sort to bottom).
 *
 * @param {Array<{date?:string, startTime?:string}>} appts
 * @returns {Array}
 */
export function sortApptsByDateTimeAsc(appts) {
  if (!Array.isArray(appts)) return [];
  return [...appts].sort((a, b) => {
    const ad = String(a?.date || '');
    const bd = String(b?.date || '');
    if (ad !== bd) return ad.localeCompare(bd);
    const at = String(a?.startTime || '');
    const bt = String(b?.startTime || '');
    return at.localeCompare(bt);
  });
}

/**
 * Sort an array of appointments by `date` then `startTime`, DESCENDING
 * (most-recent first). True mirror of sortApptsByDateTimeAsc.
 *
 * (2026-06-14) — used by the "ย้อนหลัง 30 วัน" (past) tab so yesterday is at the
 * TOP, descending into the past. User directive: "frontend หน้าย้อนหลัง 30 วัน
 * ให้สลับเอาเมื่อวานขึ้นก่อน แล้วเรียงลงไปหาอดีต". Upcoming tabs (today/tomorrow/
 * future/opd-pending) stay ASC ("soonest queue first"); only `past` is recency-first.
 * Returns a NEW array; does not mutate input. Empty/missing fields treated as
 * empty string → sort to the BOTTOM in DESC ('' < any real date/time).
 *
 * @param {Array<{date?:string, startTime?:string}>} appts
 * @returns {Array}
 */
export function sortApptsByDateTimeDesc(appts) {
  if (!Array.isArray(appts)) return [];
  return [...appts].sort((a, b) => {
    const ad = String(a?.date || '');
    const bd = String(b?.date || '');
    if (ad !== bd) return bd.localeCompare(ad);
    const at = String(a?.startTime || '');
    const bt = String(b?.startTime || '');
    return bt.localeCompare(at);
  });
}

// ─── Done-tab sort (2026-07-20) ──────────────────────────────────────────────
// User directive: "หน้าเสร็จแล้วใน tab วันนี้ เรียงตามคนที่เพิ่งกดรับบริการเรียบร้อย
// ... คนที่เพิ่งกดจะอยู่บนสุด ไม่ต้องเรียงตามเวลาแล้ว". Applies ONLY to the
// today tab's 'completed' sub-pill (AppointmentHubView) — every other tab/pill
// keeps the V64-fix9 / past-desc comparators.

/**
 * Timestamp-shape-safe → ms. serviceCompletedAt arrives as a Firestore
 * Timestamp ({toMillis}), a raw {seconds,nanoseconds} shape, an optimistic
 * client Date (HubView's optimistic stamp), an ISO string, or a number.
 * Anything unparseable → 0 (sorts to the bottom).
 */
export function svcCompletedMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch { return 0; } }
  if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  if (v instanceof Date) return v.getTime();
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Sort by serviceCompletedAt DESCENDING — most recently completed first.
 * Returns a NEW array; does not mutate input.
 */
export function sortApptsByServiceCompletedDesc(appts) {
  if (!Array.isArray(appts)) return [];
  return [...appts].sort((a, b) => svcCompletedMs(b?.serviceCompletedAt) - svcCompletedMs(a?.serviceCompletedAt));
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokYearMonthDay(d) {
  const ms = d.getTime() + BANGKOK_OFFSET_MS;
  const u = new Date(ms);
  const y = u.getUTCFullYear();
  const m = String(u.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(u.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDaysISO(isoYMD, delta) {
  // midday-UTC parse so day-of-week + adds stay stable
  const [y, m, d] = isoYMD.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d + delta, 12, 0, 0);
  return bangkokYearMonthDay(new Date(t - BANGKOK_OFFSET_MS));
}

export function dateRangeForTab(tabKey, now = new Date()) {
  const today = bangkokYearMonthDay(now);
  switch (tabKey) {
    case 'today':    return { from: today, to: today };
    case 'tomorrow': { const t = addDaysISO(today, 1); return { from: t, to: t }; }
    case 'future':   return { from: addDaysISO(today, 1), to: addDaysISO(today, 30) };
    case 'past':     return { from: addDaysISO(today, -30), to: addDaysISO(today, -1) };
    // ② (2026-05-26) — today + future within the hub's loaded ±30d window
    // (R3: not capped beyond that window; from=today INCLUDES today, unlike
    // 'future' which starts tomorrow). Past excluded by from=today.
    case 'opd-pending': return { from: today, to: addDaysISO(today, 30) };
    default: throw new Error(`Unknown tab: ${tabKey}`);
  }
}

export function defaultStatusFilterForTab(tabKey) {
  switch (tabKey) {
    case 'today':
    case 'tomorrow': return { exclude: ['cancelled'] };
    case 'future':   return { exclude: ['done', 'cancelled'] };
    case 'past':     return { exclude: [] };
    case 'opd-pending': return { exclude: ['cancelled'] }; // ② (2026-05-26)
    default: return { exclude: [] };
  }
}

export function isMissedAppointment(appt, now = new Date()) {
  if (!appt || appt.status !== 'confirmed') return false;
  const today = bangkokYearMonthDay(now);
  return typeof appt.date === 'string' && appt.date < today;
}

export function matchesSearchText(appt, searchRaw) {
  const search = String(searchRaw || '').trim().toLowerCase();
  if (!search) return true;
  const haystack = [
    appt?.customerName,
    appt?.customerHN,
    appt?.customerPhone,
    appt?.doctorName,
    appt?.assistantName,
  ].filter(Boolean).map(String).join(' ').toLowerCase();
  return haystack.includes(search);
}

/**
 * Apply combined tab + status + search + type filter.
 * @param {Array} appts
 * @param {Object} opts
 * @param {string} opts.tab — 'today' | 'tomorrow' | 'future' | 'past'
 * @param {Date}   opts.now
 * @param {string} [opts.statusOverride] — if set, overrides the default exclude list. '__all__' = no status filter.
 * @param {string} [opts.search]
 * @param {string} [opts.typeFilter] — appointmentType exact match; falsy = no filter
 * @param {string} [opts.todaySubPill] — V71 (2026-05-15): 'waiting'|'completed' sub-pill for today tab ONLY; ignored on other tabs.
 */
export function applyTabFilter(appts, { tab, now = new Date(), statusOverride, search = '', typeFilter = '', todaySubPill } = {}) {
  const range = dateRangeForTab(tab, now);
  const defaultStatus = defaultStatusFilterForTab(tab);
  return (appts || []).filter(a => {
    if (typeof a?.date !== 'string') return false;
    if (a.date < range.from || a.date > range.to) return false;
    if (statusOverride && statusOverride !== '__all__') {
      if (a.status !== statusOverride) return false;
    } else if (defaultStatus.exclude.includes(a.status)) {
      return false;
    }
    if (typeFilter && a.appointmentType !== typeFilter) return false;
    if (!matchesSearchText(a, search)) return false;
    // V71 (2026-05-15) — today sub-pill split. No-op for non-today tabs OR when todaySubPill is null/undefined.
    if (tab === 'today' && (todaySubPill === 'waiting' || todaySubPill === 'completed')) {
      const isCompleted = !!a.serviceCompletedAt;
      if (todaySubPill === 'completed' && !isCompleted) return false;
      if (todaySubPill === 'waiting' && isCompleted) return false;
    }
    return true;
  });
}

// V71 (2026-05-15) — count helper for the today inline sub-pill bar.
// Returns {waiting, completed} from the same appts array the view already holds.
// Uses applyTabFilter's `today` tab logic so today-detection stays single-source-of-truth.
export function subPillCountsForToday(appts, now = new Date()) {
  const todayList = applyTabFilter(appts, { tab: 'today', now });
  let waiting = 0;
  let completed = 0;
  for (const a of todayList) {
    if (a && a.serviceCompletedAt) completed++;
    else waiting++;
  }
  return { waiting, completed };
}

// ① (2026-05-31) — confirmed-active appts to the TOP of the "today" list, then
// the rest; each partition keeps the existing date+time ascending order. Pure;
// does not mutate input. "confirmed-active" = status==='confirmed' AND not yet
// service-completed (served rows leave the waiting queue / become 'done').
export function sortApptsConfirmedFirst(appts) {
  const list = Array.isArray(appts) ? appts : [];
  const isConfirmedActive = (a) => !!a && a.status === 'confirmed' && !a.serviceCompletedAt;
  return [
    ...sortApptsByDateTimeAsc(list.filter(isConfirmedActive)),
    ...sortApptsByDateTimeAsc(list.filter((a) => !isConfirmedActive(a))),
  ];
}
