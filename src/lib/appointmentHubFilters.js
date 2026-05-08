// V64 — appointment hub per-tab filter helpers (pure JS).
// Q4=A: smart per-tab defaults + missed-inference + dropdown override.
// Bangkok TZ stable via midday-UTC parse pattern (V53 BS-12).

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
 */
export function applyTabFilter(appts, { tab, now = new Date(), statusOverride, search = '', typeFilter = '' } = {}) {
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
    return true;
  });
}
