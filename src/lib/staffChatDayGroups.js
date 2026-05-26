// src/lib/staffChatDayGroups.js
// PURE (no firebase / no utils import — fully unit-testable) — group staff-chat
// messages by Bangkok-local calendar day + a human divider label.
//
// createdAt is DUAL-SHAPE (V82 lesson): Firestore Timestamp ({toMillis}/{seconds})
// OR number(ms) OR ISO string → normalize to ms before bucketing.
// Bangkok = GMT+7 fixed (no DST) — shift then read UTC parts so the day bucket is
// machine-TZ-stable (V53 lesson). Older days display the full Thai BE date (per
// the approved 2026-05-26 spec preview). Thai month names inlined (THAI_MONTHS in
// utils.js is an array of {value,label} objects, not strings — inlining keeps this
// helper pure + avoids the shape mismatch).

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export function toMs(createdAt) {
  if (createdAt == null) return null;
  if (typeof createdAt === 'number' && Number.isFinite(createdAt)) return createdAt;
  if (typeof createdAt.toMillis === 'function') { try { return createdAt.toMillis(); } catch { return null; } }
  if (typeof createdAt.seconds === 'number') return createdAt.seconds * 1000;
  const p = Date.parse(createdAt);
  return Number.isFinite(p) ? p : null;
}

// Bangkok-local day key 'YYYY-MM-DD' (machine-TZ-stable — shift to GMT+7, read UTC parts).
export function bangkokDayKey(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  const d = new Date(ms + BKK_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Relative for today/yesterday; else full Thai BE date with weekday.
export function dayDividerLabel(ms, nowMs = Date.now()) {
  const key = bangkokDayKey(ms);
  if (!key) return '';
  if (key === bangkokDayKey(nowMs)) return 'วันนี้';
  if (key === bangkokDayKey(nowMs - 86400000)) return 'เมื่อวาน';
  const d = new Date(ms + BKK_OFFSET_MS);
  return `${THAI_WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${THAI_MONTHS_FULL[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

// messages assumed chronological ASC (the list reverses the DESC query before render).
// Returns [{ dayKey, label, items: [msg] }]. Unknown-timestamp msgs bucket under
// '__unknown__' with an empty label (no divider rendered for them).
export function groupMessagesByDay(messages, nowMs = Date.now()) {
  const arr = Array.isArray(messages) ? messages : [];
  const groups = [];
  let cur = null;
  for (const m of arr) {
    const ms = toMs(m && m.createdAt);
    const key = bangkokDayKey(ms) || '__unknown__';
    if (!cur || cur.dayKey !== key) {
      cur = { dayKey: key, label: ms != null ? dayDividerLabel(ms, nowMs) : '', items: [] };
      groups.push(cur);
    }
    cur.items.push(m);
  }
  return groups;
}
