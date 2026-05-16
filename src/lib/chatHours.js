// src/lib/chatHours.js
// V77-fix3 (2026-05-16 NIGHT — S-2 Rule of 3 extract + P2-8 TZ fix).
//
// CHAT-HOURS HELPERS — V51 per-branch chat-hours canonical reader.
//
// History:
//   - V51 (2026-05-04) introduced per-branch chat hours schema:
//     cs.chatHoursAlwaysOn / cs.chatHoursMonFri.{open,close} /
//     cs.chatHoursSatSun.{open,close}.
//   - V77-ter (2026-05-16) fixed AdminDashboard.isChatActive reading the
//     pre-V51 cs.chatOpenTime/CloseTime fields (undefined → fell to default
//     10:00-19:00 → chime gated off when user configured 11:15-20:45).
//   - V77-quater (2026-05-16) — same class-of-bug at SIBLING reader
//     ChatPanel.isWithinChatHours (off-hours offHours-tag stamp). Cross-file
//     grep at V77-ter would have caught both in one pass (Rule P Step 3
//     deferred = same-class re-surfaces × 2). 69 prod chat_history docs
//     wrongly stamped offHours=true had to be Rule M backfilled.
//   - V77-fix3 (S-2, 2026-05-16 NIGHT): both consumers extracted to THIS
//     module to prevent a 3rd drift. Future per-branch chat-hours schema
//     changes only update HERE.
//
// PUBLIC API:
//   - resolveChatHoursForDate(date, settings) → { alwaysOn, open, close }
//   - isWithinChatHours(timestamp, settings) → boolean
//   - isChatHoursActiveNow(settings) → boolean
//
// V51 canonical field precedence + pre-V51 fallback chain:
//   alwaysOn ← cs.chatHoursAlwaysOn (boolean, V51) ?? cs.chatAlwaysOn (legacy)
//   monFri.open ← cs.chatHoursMonFri.open (V51) ?? cs.chatOpenTime (legacy) ?? '10:00'
//   monFri.close ← cs.chatHoursMonFri.close (V51) ?? cs.chatCloseTime (legacy) ?? '19:00'
//   satSun.open ← cs.chatHoursSatSun.open (V51) ?? cs.chatOpenTimeWeekend (legacy)
//                                              ?? cs.chatOpenTime (legacy) ?? '10:00'
//   satSun.close ← cs.chatHoursSatSun.close (V51) ?? cs.chatCloseTimeWeekend (legacy)
//                                              ?? cs.chatCloseTime (legacy) ?? '19:00'

// V77-fix3 (P2-8): use Intl.DateTimeFormat for Bangkok-TZ field extraction
// rather than `new Date(d.toLocaleString('en-US', {timeZone: 'Asia/Bangkok'}))`
// pattern which (a) double-parses through a string + Date, (b) relies on the
// en-US locale's parseable output format which can drift across Node/Chrome
// versions, and (c) drops sub-second precision. Intl gives stable
// year/month/day/hour/minute fields directly.
const BANGKOK_TZ_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  weekday: 'short',
});

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function bangkokFields(date) {
  // Returns { day: 0-6, hour: 0-23, minute: 0-59 } in Asia/Bangkok TZ.
  const parts = BANGKOK_TZ_FORMAT.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    day: DAY_INDEX[map.weekday] ?? 0,
    hour: Number(map.hour) % 24, // some Node builds emit '24' for midnight
    minute: Number(map.minute),
  };
}

/**
 * Resolve effective chat-open window for a given Date+settings.
 *
 * @param {Date|number|string} timestamp — any Date-coercible value
 * @param {object} settings — merged clinicSettings (per-branch + clinic-wide)
 * @returns {{ alwaysOn: boolean, open: string, close: string }}
 *   open/close in 'HH:MM' 24-hour format.
 */
export function resolveChatHoursForDate(timestamp, settings) {
  const s = settings || {};
  const alwaysOn = (typeof s.chatHoursAlwaysOn === 'boolean')
    ? s.chatHoursAlwaysOn
    : !!s.chatAlwaysOn;
  if (alwaysOn) return { alwaysOn: true, open: '00:00', close: '24:00' };
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const { day } = bangkokFields(d);
  const isWeekend = day === 0 || day === 6;
  const monFri = s.chatHoursMonFri || {};
  const satSun = s.chatHoursSatSun || {};
  const open = isWeekend
    ? (satSun.open || s.chatOpenTimeWeekend || s.chatOpenTime || '10:00')
    : (monFri.open || s.chatOpenTime || '10:00');
  const close = isWeekend
    ? (satSun.close || s.chatCloseTimeWeekend || s.chatCloseTime || '19:00')
    : (monFri.close || s.chatCloseTime || '19:00');
  return { alwaysOn: false, open: String(open), close: String(close) };
}

/**
 * Whether `timestamp` falls within the chat-open window per `settings`.
 *
 * Replaces:
 *   - ChatPanel.isWithinChatHours (V77-quater)
 *   - AdminDashboard.isChatActive (V77-ter — wraps via isChatHoursActiveNow)
 *
 * @param {Date|number|string} timestamp
 * @param {object} settings
 * @returns {boolean}
 */
export function isWithinChatHours(timestamp, settings) {
  if (!settings) return true; // V77-quater pre-existing contract: missing settings = open
  const { alwaysOn, open, close } = resolveChatHoursForDate(timestamp, settings);
  if (alwaysOn) return true;
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const { hour, minute } = bangkokFields(d);
  const nowMin = hour * 60 + minute;
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  return nowMin >= openMin && nowMin < closeMin;
}

/**
 * Whether RIGHT NOW falls within chat-open window. Used by AdminDashboard
 * to gate the continuous chime + chat-tab blink state.
 *
 * @param {object} settings
 * @returns {boolean}
 */
export function isChatHoursActiveNow(settings) {
  return isWithinChatHours(new Date(), settings);
}
