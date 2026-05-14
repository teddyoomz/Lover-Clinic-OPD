/**
 * Phase 29 (2026-05-14) — recall display + bucket resolvers.
 * Pure JS. Branch-blind. Bangkok-stable midday-UTC date parsing per V53 lesson.
 */

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function _parseISOMiddayUTC(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function _formatThaiShortDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const day = Number(m[3]);
  const monthIdx = Number(m[2]) - 1;
  return `${day} ${THAI_MONTHS_SHORT[monthIdx] || ''}`;
}

/**
 * Phase 29 — derive effective recall date (snoozedUntil overrides recallDate).
 * @param {object} r recall object
 * @returns {string|null} effective date 'YYYY-MM-DD' or null
 */
export function getEffectiveRecallDate(r) {
  if (!r) return null;
  return r.snoozedUntil || r.recallDate || null;
}

/**
 * Phase 29 — compute days from today (Bangkok TZ). Negative = past.
 * @param {string} targetISO 'YYYY-MM-DD'
 * @param {string} todayISO 'YYYY-MM-DD'
 * @returns {number|null} day delta or null on invalid input
 */
export function computeDaysFromToday(targetISO, todayISO) {
  const t = _parseISOMiddayUTC(targetISO);
  const today = _parseISOMiddayUTC(todayISO);
  if (t === null || today === null) return null;
  return Math.round((t - today) / 86400000);
}

/**
 * Phase 29 — Thai-friendly days-from-today label.
 * Exact-month multiples (30/60/90/...) within a year drop the tilde
 * (e.g. 90 → "90 วัน (3 เดือน)"); inexact months keep tilde (184 → "~6 เดือน").
 * @param {number} days
 * @returns {string} Thai label
 */
export function formatDaysFromTodayLabel(days) {
  if (days === 0) return 'วันนี้';
  if (days === 1) return 'พรุ่งนี้';
  if (days < 0) return `เกินกำหนด ${Math.abs(days)} วัน`;
  if (days <= 7) return `${days} วัน`;
  if (days < 30) return `${days} วัน (${Math.floor(days / 7)} สัปดาห์)`;
  if (days % 30 === 0 && days < 365) return `${days} วัน (${days / 30} เดือน)`;
  if (days < 365) return `${days} วัน (~${Math.round(days / 30)} เดือน)`;
  return `${Math.floor(days / 365)} ปี`;
}

/**
 * Phase 29 — group recalls into 5 time buckets (Bangkok TZ stable).
 * Overdue requires status !== 'done' && status !== 'closed-no-answer'.
 * snoozedUntil overrides recallDate when present.
 * @param {Array} recalls
 * @param {string} todayISO
 * @returns {{overdue:Array,today:Array,tomorrow:Array,thisWeek:Array,later:Array}}
 */
export function groupRecallsByTimeBucket(recalls, todayISO) {
  const empty = { overdue: [], today: [], tomorrow: [], thisWeek: [], later: [] };
  if (!Array.isArray(recalls) || recalls.length === 0) return empty;
  const buckets = { overdue: [], today: [], tomorrow: [], thisWeek: [], later: [] };
  const todayMs = _parseISOMiddayUTC(todayISO);
  if (todayMs === null) return empty;

  for (const r of recalls) {
    if (!r) continue;
    const effDate = getEffectiveRecallDate(r);
    const effMs = _parseISOMiddayUTC(effDate);
    if (effMs === null) continue;
    const days = Math.round((effMs - todayMs) / 86400000);
    if (days < 0 && r.status !== 'done' && r.status !== 'closed-no-answer') {
      buckets.overdue.push(r);
    } else if (days === 0) {
      buckets.today.push(r);
    } else if (days === 1) {
      buckets.tomorrow.push(r);
    } else if (days >= 2 && days <= 7) {
      buckets.thisWeek.push(r);
    } else if (days > 7) {
      buckets.later.push(r);
    } else {
      // days < 0 but status done/closed → historical, drop into later
      buckets.later.push(r);
    }
  }
  return buckets;
}

/**
 * Phase 29 — Thai status label per recall.
 * @param {object} r recall
 * @param {string=} todayISO for overdue computation
 * @returns {string} Thai status text
 */
export function getRecallStatusLabel(r, todayISO) {
  if (!r) return '';
  if (r.snoozedUntil && r.status === 'pending') {
    return `เลื่อนไป ${_formatThaiShortDate(r.snoozedUntil)}`;
  }
  if (r.status === 'pending' && todayISO && r.recallDate) {
    const days = computeDaysFromToday(r.recallDate, todayISO);
    if (days !== null && days < 0) return `เกินกำหนด ${Math.abs(days)} วัน`;
  }
  if (r.status === 'pending') return 'รอโทร';
  if (r.status === 'done') return 'เสร็จแล้ว';
  if (r.status === 'no-answer') return `ติดต่อไม่ได้ครั้งที่ ${r.noAnswerCount || 1}`;
  if (r.status === 'closed-no-answer') return 'ปิด (ติดต่อไม่ได้)';
  return '';
}

/**
 * Phase 29 — Status color tokens (bg/border/text rgba strings).
 * @param {object} r recall
 * @returns {{bg:string,border:string,text:string}}
 */
/**
 * Phase 29.22 round-3 polish (2026-05-14) — theme-aware badge colors.
 * Previous palette used pastel text (#6ee7b7 etc.) that was invisible on
 * white in light mode. Now returns BOTH lightText + darkText; caller picks
 * via useTheme().resolvedTheme. bg/border stay theme-agnostic (rgba alpha
 * works on both backgrounds).
 *
 * User report: "ปุ่มสี badge มึงสีอ่อนไป สีมึงจะกลืนกับสีขาวอยู่แล้ว".
 *
 * Returns: { bg, border, lightText, darkText }
 *   Backward-compat: also returns `text` = darkText for legacy callers
 *   that don't pass a theme (will look correct in dark, faded in light).
 */
export function getRecallStatusColor(r) {
  if (!r) return { bg: 'transparent', border: 'transparent', text: 'inherit', lightText: 'inherit', darkText: 'inherit' };
  if (r.status === 'done') {
    return { bg: 'rgba(16,185,129,0.22)', border: 'rgba(16,185,129,0.60)', lightText: '#047857', darkText: '#6ee7b7', text: '#6ee7b7' };
  }
  if (r.status === 'no-answer') {
    return { bg: 'rgba(239,68,68,0.22)', border: 'rgba(239,68,68,0.60)', lightText: '#b91c1c', darkText: '#fca5a5', text: '#fca5a5' };
  }
  if (r.status === 'closed-no-answer') {
    return { bg: 'rgba(75,85,99,0.22)', border: 'rgba(75,85,99,0.60)', lightText: '#374151', darkText: '#d1d5db', text: '#9ca3af' };
  }
  if (r.snoozedUntil) {
    return { bg: 'rgba(99,102,241,0.22)', border: 'rgba(99,102,241,0.60)', lightText: '#4338ca', darkText: '#a5b4fc', text: '#a5b4fc' };
  }
  return { bg: 'rgba(245,158,11,0.22)', border: 'rgba(245,158,11,0.60)', lightText: '#b45309', darkText: '#fcd34d', text: '#fcd34d' };
}

/**
 * Phase 29.22 (2026-05-14) — outcome metadata for "done"/"closed-no-answer"
 * rows. Mirror the 5 RecallOutcomeModal options so completed recalls can
 * surface what the customer chose at-a-glance (per user request: "ตรง list
 * ที่ขึ้นว่า เสร็จแล้ว ให้แสดงเหตุผลที่ลูกค้าเลือกไว้ด้วย"). Used by every
 * surface that renders a RecallRow (BE list + FE pill + CDV card).
 *
 * @param {string} outcome enum: will-come | reschedule | not-interested | no-answer | closed-no-answer
 * @returns {{label:string,emoji:string,color:{bg:string,border:string,text:string}}|null}
 */
export function getRecallOutcomeMeta(outcome) {
  // Phase 29.22 round-3 — theme-aware text (lightText + darkText). Caller
  // picks via useTheme().resolvedTheme. bg/border stay theme-agnostic.
  switch (outcome) {
    case 'will-come':
      return {
        label: 'จะมาตามนัด',
        emoji: '✓',
        color: { bg: 'rgba(16,185,129,0.22)', border: 'rgba(16,185,129,0.60)', lightText: '#047857', darkText: '#6ee7b7', text: '#6ee7b7' },
      };
    case 'reschedule':
      return {
        label: 'ขอเลื่อน',
        emoji: '⏰',
        color: { bg: 'rgba(245,158,11,0.22)', border: 'rgba(245,158,11,0.60)', lightText: '#b45309', darkText: '#fcd34d', text: '#fcd34d' },
      };
    case 'not-interested':
      return {
        label: 'ไม่สนใจ / ไม่ต้องการ',
        emoji: '💭',
        color: { bg: 'rgba(99,102,241,0.22)', border: 'rgba(99,102,241,0.60)', lightText: '#4338ca', darkText: '#a5b4fc', text: '#a5b4fc' },
      };
    case 'no-answer':
      return {
        label: 'ติดต่อไม่ได้',
        emoji: '📵',
        color: { bg: 'rgba(239,68,68,0.22)', border: 'rgba(239,68,68,0.60)', lightText: '#b91c1c', darkText: '#fca5a5', text: '#fca5a5' },
      };
    case 'closed-no-answer':
      return {
        label: 'ปิดการติดตาม',
        emoji: '🗂️',
        color: { bg: 'rgba(107,114,128,0.22)', border: 'rgba(107,114,128,0.55)', lightText: '#374151', darkText: '#d1d5db', text: '#9ca3af' },
      };
    default:
      return null;
  }
}

/**
 * Phase 29 — pair badge data (icon + reason + date + status suffix).
 * @param {object} paired paired recall
 * @param {string=} todayISO for overdue suffix
 * @returns {{icon:string,reason:string,date:string,statusSuffix:string}|null}
 */
export function formatPairBadge(paired, todayISO) {
  if (!paired) return null;
  const icon = paired.slotType === 'aftercare' ? '🩹' : '📅';
  const date = _formatThaiShortDate(paired.recallDate);
  let statusSuffix;
  if (paired.status === 'done') {
    statusSuffix = 'เสร็จแล้ว';
  } else if (paired.status === 'no-answer') {
    statusSuffix = `ติดต่อไม่ได้ครั้งที่ ${paired.noAnswerCount || 1}`;
  } else if (paired.snoozedUntil) {
    statusSuffix = `เลื่อนไป ${_formatThaiShortDate(paired.snoozedUntil)}`;
  } else if (todayISO) {
    const days = computeDaysFromToday(paired.recallDate, todayISO);
    if (days !== null && days < 0) {
      statusSuffix = `เกินกำหนด ${Math.abs(days)} วัน`;
    } else {
      statusSuffix = 'รอ Recall';
    }
  } else {
    statusSuffix = 'รอ Recall';
  }
  return { icon, reason: paired.reason || '', date, statusSuffix };
}

/**
 * Phase 29 — should the outcome trigger auto-snooze?
 * @param {string} outcome
 * @returns {boolean}
 */
export function shouldShowAutoSnooze(outcome) {
  return outcome === 'no-answer';
}

/**
 * Phase 29 — compute snooze-until date (now + N days).
 * @param {string} fromISO 'YYYY-MM-DD'
 * @param {number=} days default 3
 * @returns {string|null}
 */
export function computeAutoSnoozeUntil(fromISO, days = 3) {
  const fromMs = _parseISOMiddayUTC(fromISO);
  if (fromMs === null) return null;
  const future = new Date(fromMs + days * 86400000);
  const y = future.getUTCFullYear();
  const mo = String(future.getUTCMonth() + 1).padStart(2, '0');
  const d = String(future.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * Phase 29 — should the noAnswerCount escalate to requiresManualReview?
 * @param {number} noAnswerCount
 * @param {number=} threshold default 3
 * @returns {boolean}
 */
export function shouldFlagManualReview(noAnswerCount, threshold = 3) {
  return (noAnswerCount || 0) >= threshold;
}

/**
 * Phase 29 — overdue check (uses effective date = snoozedUntil || recallDate).
 * @param {object} r recall
 * @param {string} todayISO
 * @returns {boolean}
 */
export function isOverdue(r, todayISO) {
  if (!r || r.status === 'done' || r.status === 'closed-no-answer') return false;
  const effDate = getEffectiveRecallDate(r);
  const days = computeDaysFromToday(effDate, todayISO);
  return days !== null && days < 0;
}
