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
    default: throw new Error(`Unknown tab: ${tabKey}`);
  }
}

export function defaultStatusFilterForTab(tabKey) {
  switch (tabKey) {
    case 'today':
    case 'tomorrow': return { exclude: ['cancelled'] };
    case 'future':   return { exclude: ['done', 'cancelled'] };
    case 'past':     return { exclude: [] };
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
