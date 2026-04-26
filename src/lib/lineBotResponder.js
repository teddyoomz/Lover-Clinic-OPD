// ─── LINE Bot Responder — Phase 14.9 (LINE Q&A + customer linking) ──────
// V32-tris-ter (2026-04-26) — pure helpers for the LINE Official Account
// bot. Mirrors the ProClinic flow:
//   1. Customer scans QR on customer detail page → opens LINE chat with
//      bot → message "LINK-<token>" auto-pasted → customer sends → bot
//      consumes token + writes lineUserId onto be_customers/{cid}.
//   2. Customer types "คอร์ส" / "นัด" → bot looks up customer by
//      lineUserId → replies with active courses or upcoming appointments.
//
// All helpers are PURE — no Firestore, no fetch. The webhook handler
// (api/webhook/line.js) calls these to interpret incoming text + format
// outgoing replies. Pure separation lets us unit-test the bot logic
// without mocking the LINE API.
//
// Intent detection is keyword-based:
//   - "LINK-<base32>" prefix       → intent: 'link', payload.token = <base32>
//   - "คอร์ส" / "courses" / "เหลือ" → intent: 'courses'
//   - "นัด" / "appointment" / "วันนัด" → intent: 'appointments'
//   - default                      → intent: 'help'

const HELP_MESSAGE = [
  'ส่งข้อความเหล่านี้เพื่อดูข้อมูลของคุณ:',
  '• "คอร์ส" — ดูคอร์สที่ใช้ได้คงเหลือ',
  '• "นัด" — ดูรายการนัดหมายล่วงหน้า',
  '',
  'หรือพิมพ์คำถามอื่น พนักงานคลินิกจะตอบโดยเร็วที่สุด.',
].join('\n');

const LINK_SUCCESS_TEMPLATE = (name) => [
  `🎉 ผูกบัญชี LINE สำเร็จ${name ? ` คุณ${name}` : ''}`,
  '',
  'ตอนนี้คุณสามารถ:',
  '• พิมพ์ "คอร์ส" เพื่อดูคอร์สที่ใช้ได้คงเหลือ',
  '• พิมพ์ "นัด" เพื่อดูวันนัดหมาย',
].join('\n');

const LINK_FAIL_INVALID = 'ไม่พบรหัสผูกบัญชีนี้ในระบบ — โปรดให้คลินิกสร้าง QR ใหม่.';
const LINK_FAIL_EXPIRED = 'รหัสผูกบัญชีหมดอายุแล้ว — โปรดให้คลินิกสร้าง QR ใหม่.';
const LINK_FAIL_ALREADY_LINKED = 'บัญชี LINE นี้ผูกกับลูกค้ารายอื่นในระบบอยู่แล้ว.';

const NOT_LINKED_MESSAGE = [
  'บัญชี LINE นี้ยังไม่ได้ผูกกับลูกค้าในระบบ.',
  'หากต้องการผูก โปรดส่งเลขบัตรประชาชน (13 หลัก) หรือเลขพาสปอร์ต',
  'หรือสแกน QR ที่คลินิก.',
].join('\n');

// V32-tris-quater (2026-04-26) — same-reply anti-enumeration. We answer
// IDENTICALLY whether the ID matches a customer or not, so an attacker
// who DMs random IDs can't confirm which exist in our DB. Admin sees the
// real match in the LinkRequestsTab queue and decides to approve/reject.
const ID_REQUEST_RECEIVED = [
  '✅ ระบบได้รับคำขอแล้ว',
  '',
  'หากเลขที่ระบุตรงกับลูกค้าในระบบ',
  'เจ้าหน้าที่จะตรวจสอบและยืนยันการผูกบัญชีให้ภายใน 1-24 ชั่วโมง',
  '',
  'หากต้องการความช่วยเหลือ โปรดติดต่อคลินิกโดยตรง.',
].join('\n');

const ID_REQUEST_RATE_LIMITED = 'คำขอผูกบัญชีในช่วงนี้เกินจำนวนที่กำหนด — โปรดติดต่อคลินิกโดยตรง.';

const LINK_REQUEST_APPROVED = (name) => [
  `🎉 อนุมัติการผูกบัญชี LINE สำเร็จ${name ? ` คุณ${name}` : ''}`,
  '',
  'ตอนนี้คุณสามารถ:',
  '• พิมพ์ "คอร์ส" เพื่อดูคอร์สที่ใช้ได้คงเหลือ',
  '• พิมพ์ "นัด" เพื่อดูวันนัดหมาย',
].join('\n');

const LINK_REQUEST_REJECTED =
  'คำขอผูกบัญชีไม่ได้รับการอนุมัติ — โปรดติดต่อคลินิกเพื่อสอบถามรายละเอียด.';

/**
 * Parse the customer's incoming message and return an intent.
 *
 * V32-tris-quater (2026-04-26) — added 'id-link-request' intent for
 * customers who DM the OA without a clinic-issued QR. They submit their
 * Thai national ID (13 digits) or passport (alphanumeric 6-12 chars).
 * Bot creates a pending request → admin verifies + approves manually.
 *
 * @param {string} text — raw message body
 * @returns {{ intent: 'link'|'id-link-request'|'courses'|'appointments'|'help',
 *             payload?: { token?: string, idType?: 'national-id'|'passport',
 *                         idValue?: string } }}
 */
export function interpretCustomerMessage(text) {
  const raw = String(text || '').trim();
  if (!raw) return { intent: 'help' };

  // LINK-<token> — case-insensitive prefix match. Token is base32-ish
  // (alphanumeric, 8-32 chars). Tolerant of trailing whitespace + wrapping
  // quotes / brackets / Thai punctuation around the token.
  const linkMatch = raw.match(/LINK-([A-Za-z0-9_-]{6,64})/i);
  if (linkMatch) {
    return { intent: 'link', payload: { token: linkMatch[1] } };
  }

  // National ID / passport link request. Customer MUST prefix with
  // "ผูก" / "ผูกบัญชี" / "link" — anti-false-positive guard so bot
  // doesn't treat a random 13-digit number (phone, HN, etc.) as a link
  // request. User directive 2026-04-26: "ให้พิมพ์ ผูก [เลขบัตร]".
  //
  // Pattern matches: "ผูก 1234567890123" / "ผูกบัญชี AA1234567" /
  //                  "link 1234567890123" with flexible spacing.
  // We strip separators inside the ID so customers can paste
  // "1-2345-67890-12-3" copied from their ID card.
  const idPrefixMatch = raw.match(/^\s*(?:ผูก(?:บัญชี)?|link)\s+(.+)$/i);
  if (idPrefixMatch) {
    const candidate = idPrefixMatch[1].replace(/[\s\-.()]/g, '');
    // Thai national ID — exactly 13 digits.
    if (/^\d{13}$/.test(candidate)) {
      return { intent: 'id-link-request', payload: { idType: 'national-id', idValue: candidate } };
    }
    // Passport — alphanumeric 6-12 chars, must have at least 1 letter.
    if (/^[A-Za-z][A-Za-z0-9]{5,11}$/.test(candidate) && /\d/.test(candidate)) {
      return { intent: 'id-link-request', payload: { idType: 'passport', idValue: candidate.toUpperCase() } };
    }
    // Customer typed "ผูก ..." but the ID didn't match — still route
    // to id-link-request so the bot can reply with format hint instead
    // of falling through to the generic help message.
    return { intent: 'id-link-request', payload: { idType: 'invalid', idValue: '' } };
  }

  const lower = raw.toLowerCase();
  if (/(คอร์ส|courses?|เหลือ|remaining)/i.test(lower)) {
    return { intent: 'courses' };
  }
  if (/(นัด|appointment|appt|วันนัด)/i.test(lower)) {
    return { intent: 'appointments' };
  }
  return { intent: 'help' };
}

/**
 * Format a list of active courses for LINE display. Filters courses to
 * those still usable (status === 'กำลังใช้งาน'); skips refunded /
 * cancelled / consumed.
 *
 * @param {Array} courses — customer.courses[]
 * @returns {string}
 */
export function formatCoursesReply(courses) {
  if (!Array.isArray(courses) || courses.length === 0) {
    return 'ยังไม่มีคอร์สในระบบ';
  }
  const active = courses.filter((c) => {
    const status = String(c?.status || '').trim();
    return status === 'กำลังใช้งาน' || status === '' || status === 'active';
  });
  if (active.length === 0) {
    return 'ไม่พบคอร์สที่ยังใช้ได้\n(คอร์สทั้งหมดอาจใช้หมดแล้ว / ยกเลิก / คืนเงิน)';
  }
  const lines = ['📋 คอร์สที่ใช้ได้คงเหลือ:', ''];
  active.slice(0, 20).forEach((c, i) => {
    const name = c.name || c.product || '(ไม่ระบุ)';
    const qty = c.qty || c.remaining || '';
    const expiry = c.expiry ? ` หมดอายุ ${formatThaiDate(c.expiry)}` : '';
    lines.push(`${i + 1}. ${name}${qty ? ` — ${qty}` : ''}${expiry}`);
  });
  if (active.length > 20) {
    lines.push('');
    lines.push(`... และอีก ${active.length - 20} รายการ — ติดต่อคลินิกเพื่อรายละเอียด`);
  }
  return lines.join('\n');
}

/**
 * Format upcoming appointments for LINE display. Only future / today's
 * appointments where status is not 'cancelled' / 'completed'.
 *
 * @param {Array} appointments — be_appointments docs
 * @param {string} [todayISO] — defaults to today
 * @returns {string}
 */
export function formatAppointmentsReply(appointments, todayISO = '') {
  if (!Array.isArray(appointments) || appointments.length === 0) {
    return 'ไม่พบรายการนัดหมายในระบบ';
  }
  const today = todayISO || new Date().toISOString().slice(0, 10);
  const upcoming = appointments
    .filter((a) => {
      const s = String(a?.status || '').toLowerCase();
      if (s === 'cancelled' || s === 'completed' || s === 'no-show') return false;
      const date = String(a?.appointmentDate || a?.date || '').slice(0, 10);
      return date >= today;
    })
    .sort((a, b) => {
      const da = String(a?.appointmentDate || a?.date || '');
      const db = String(b?.appointmentDate || b?.date || '');
      return da.localeCompare(db);
    });

  if (upcoming.length === 0) {
    return 'ไม่พบรายการนัดหมายล่วงหน้า\n(หากต้องการนัดหมายใหม่ ติดต่อคลินิกได้เลย)';
  }
  const lines = ['📅 นัดหมายล่วงหน้า:', ''];
  upcoming.slice(0, 10).forEach((a, i) => {
    const date = String(a.appointmentDate || a.date || '').slice(0, 10);
    const time = a.appointmentTime || a.time || '';
    const note = a.note || a.title || a.treatment || '';
    lines.push(`${i + 1}. ${formatThaiDate(date)}${time ? ` เวลา ${time}` : ''}${note ? ` — ${note}` : ''}`);
  });
  if (upcoming.length > 10) {
    lines.push('');
    lines.push(`... และอีก ${upcoming.length - 10} รายการ`);
  }
  return lines.join('\n');
}

export function formatHelpReply() {
  return HELP_MESSAGE;
}

export function formatLinkSuccessReply(customerName = '') {
  return LINK_SUCCESS_TEMPLATE(String(customerName || '').trim());
}

export function formatLinkFailureReply(reason) {
  switch (reason) {
    case 'expired': return LINK_FAIL_EXPIRED;
    case 'already-linked': return LINK_FAIL_ALREADY_LINKED;
    case 'invalid':
    default: return LINK_FAIL_INVALID;
  }
}

export function formatNotLinkedReply() {
  return NOT_LINKED_MESSAGE;
}

/**
 * Same-reply anti-enumeration acknowledgement for id-link-request.
 * Returns the same message whether the ID matched a customer or not,
 * so an attacker DMing random IDs can't confirm which exist in our DB.
 */
export function formatIdRequestAck() {
  return ID_REQUEST_RECEIVED;
}

/**
 * Returned when the customer's lineUserId hit the rate-limit threshold
 * (default 5 attempts per 24h). Same-message-tone-as-ack so even the
 * rate-limit signal doesn't leak whether IDs are valid.
 */
export function formatIdRequestRateLimitedReply() {
  return ID_REQUEST_RATE_LIMITED;
}

/**
 * Format hint when customer typed "ผูก" but the ID didn't match the
 * national-id (13 digits) or passport (alphanumeric 6-12) pattern.
 */
export function formatIdRequestInvalidFormat() {
  return [
    'รูปแบบเลขที่ระบุไม่ถูกต้อง',
    '',
    'โปรดส่งข้อความรูปแบบ:',
    '  ผูก 1234567890123  (เลขบัตรประชาชน 13 หลัก)',
    '  ผูก AA1234567      (เลขพาสปอร์ต)',
  ].join('\n');
}

/**
 * Bot reply pushed to the customer's LINE after admin APPROVES their
 * link request via LinkRequestsTab.
 */
export function formatLinkRequestApprovedReply(customerName = '') {
  return LINK_REQUEST_APPROVED(String(customerName || '').trim());
}

/**
 * Bot reply pushed to the customer's LINE after admin REJECTS the
 * link request.
 */
export function formatLinkRequestRejectedReply() {
  return LINK_REQUEST_REJECTED;
}

/**
 * Format an ISO date (YYYY-MM-DD) as Thai dd/mm/yyyy พ.ศ.
 * Empty / invalid inputs return '-'.
 */
export function formatThaiDate(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '-';
  const [y, m, d] = s.split('-');
  const be = (Number(y) + 543).toString();
  return `${d}/${m}/${be}`;
}

/**
 * Generate a one-time link token. Crypto-random base32-like (alphanumeric
 * + dash). 24 chars → 24*5 = 120 bits of entropy.
 *
 * Pure: depends only on `getRandomValues` (Web Crypto). Caller persists
 * the returned token to be_customer_link_tokens/{token}.
 */
export function generateLinkToken() {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Web Crypto unavailable — link token generation requires getRandomValues');
  }
  const bytes = new Uint8Array(15);
  globalThis.crypto.getRandomValues(bytes);
  // base32-ish encode (A-Z + 2-7) per RFC4648; 15 bytes → 24 chars exactly.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}
