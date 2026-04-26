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
 * @returns {{ intent: 'link'|'id-link-request'|'courses'|'appointments'|'help'|'unknown',
 *             payload?: { token?: string, idType?: 'national-id'|'passport',
 *                         idValue?: string, wasBarePrefix?: boolean } }}
 */
// V33.4 (D9) — EXACT-match standalone keyword whitelists. Substring match
// caused false triggers ("อยากดูคอร์ส" → bot replied with course list).
// Customer's message must EQUAL one of these (after trim + lowercase).
export const COURSES_TRIGGERS = Object.freeze([
  'คอร์ส', 'คอร์สเหลือ', 'คอร์สที่เหลือ', 'คอร์สคงเหลือ',
  'course', 'courses', 'เหลือ', 'remaining',
]);
export const APPOINTMENTS_TRIGGERS = Object.freeze([
  'นัด', 'นัดหมาย', 'วันนัด', 'นัดของฉัน', 'นัดของผม', 'นัดของหนู',
  'appointment', 'appointments', 'appt', 'appts',
]);
export const HELP_TRIGGERS = Object.freeze([
  'help', 'menu', 'เมนู', 'ช่วยเหลือ', 'วิธีใช้', '?', '??',
]);

export function interpretCustomerMessage(text) {
  const raw = String(text || '').trim();
  if (!raw) return { intent: 'help' };

  // LINK-<token> — case-insensitive prefix match. Token is base32-ish
  // (alphanumeric, 8-32 chars). Tolerant of trailing whitespace + wrapping
  // quotes / brackets / Thai punctuation around the token.
  // V33.5 cleanup target — token-based linking deprecated by V33.4 directive
  // #2; webhook still consumes legacy tokens during grace period.
  const linkMatch = raw.match(/LINK-([A-Za-z0-9_-]{6,64})/i);
  if (linkMatch) {
    return { intent: 'link', payload: { token: linkMatch[1] } };
  }

  // National ID / passport link request — TWO accepted formats:
  //
  // (a) Legacy "ผูก <id>" prefix (V32-tris-quater):
  //     "ผูก 1234567890123" / "ผูกบัญชี AA1234567" / "link 1234567890123"
  //     wasBarePrefix=false → on no-match, bot replies with format hint
  //     and admin queue gets an "invalid" entry (pre-existing behaviour).
  //
  // (b) BARE id (V33.4 directive #3):
  //     Just "1234567890123" or just "AA1234567" as a single message
  //     bubble — no other text. Customer convenience: no need to remember
  //     the "ผูก" keyword.
  //     wasBarePrefix=true → on no-match, webhook DROPS to Q&A help
  //     instead of creating an invalid admin queue entry. Per user choice
  //     ("Ignore เงียบ"); minor info leak accepted vs. less queue spam.

  const idPrefixMatch = raw.match(/^\s*(?:ผูก(?:บัญชี)?|link)\s+(.+)$/i);
  if (idPrefixMatch) {
    const candidate = idPrefixMatch[1].replace(/[\s\-.()]/g, '');
    if (/^\d{13}$/.test(candidate)) {
      return { intent: 'id-link-request', payload: { idType: 'national-id', idValue: candidate, wasBarePrefix: false } };
    }
    if (/^[A-Za-z][A-Za-z0-9]{5,11}$/.test(candidate) && /\d/.test(candidate)) {
      return { intent: 'id-link-request', payload: { idType: 'passport', idValue: candidate.toUpperCase(), wasBarePrefix: false } };
    }
    return { intent: 'id-link-request', payload: { idType: 'invalid', idValue: '', wasBarePrefix: false } };
  }

  // V33.4 directive #3 — BARE id detection. The whole message body
  // (after trim) must be JUST a 13-digit number OR JUST a passport
  // pattern. Anything mixed (text + 13-digits) does NOT trigger.
  if (/^\d{13}$/.test(raw)) {
    return { intent: 'id-link-request', payload: { idType: 'national-id', idValue: raw, wasBarePrefix: true } };
  }
  if (/^[A-Za-z][A-Za-z0-9]{5,11}$/.test(raw) && /\d/.test(raw)) {
    return { intent: 'id-link-request', payload: { idType: 'passport', idValue: raw.toUpperCase(), wasBarePrefix: true } };
  }

  // V33.4 (D9) — EXACT-match keyword whitelist. The message body (trimmed
  // + lowercased) must EQUAL one of the trigger phrases. Substring match
  // caused false triggers like "อยากดูคอร์สหน่อย" → bot replied; that's
  // gone now. Anything not matching falls to 'unknown' (no bot reply).
  const norm = raw.toLowerCase();
  if (COURSES_TRIGGERS.includes(norm)) return { intent: 'courses' };
  if (APPOINTMENTS_TRIGGERS.includes(norm)) return { intent: 'appointments' };
  if (HELP_TRIGGERS.includes(norm)) return { intent: 'help' };
  return { intent: 'unknown' };
}

/**
 * Format a list of active courses for LINE display. Filters courses to
 * those still usable (status === 'กำลังใช้งาน'); skips refunded /
 * cancelled / consumed.
 *
 * @param {Array} courses — customer.courses[]
 * @returns {string}
 */
// V33.5 — smart "is-meaningful" guard. The screenshot showed every course
// with "หมดอายุ -" because `c.expiry === '-'` is truthy, so the old
// ternary `c.expiry ? ... : ''` always rendered the empty placeholder.
// Treat null / undefined / '' / '-' / 'ไม่มี' / 'ไม่ระบุ' as missing.
export function isMeaningfulValue(v) {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (s === '-' || s === '—' || s === 'ไม่มี' || s === 'ไม่ระบุ' || s === 'N/A') return false;
  return true;
}

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
    // V33.5 — skip expiry chip when value is an empty placeholder ("-" etc.)
    const expiry = isMeaningfulValue(c.expiry) ? ` หมดอายุ ${formatThaiDate(c.expiry)}` : '';
    lines.push(`${i + 1}. ${name}${isMeaningfulValue(qty) ? ` — ${qty}` : ''}${expiry}`);
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
    // V33.5 — show start-end time if both present (HH:MM-HH:MM); else just startTime/time
    const start = a.startTime || a.appointmentTime || a.time || '';
    const end = a.endTime || '';
    const time = start && end ? `${start}-${end}` : start;
    // V33.5 (directive #2) — include doctor / staff name. doctorName is
    // denormalized on every be_appointments doc per AppointmentFormModal save.
    const provider = String(a.doctorName || a.staffName || a.advisorName || '').trim();
    const note = a.note || a.title || a.treatment || '';
    lines.push(`${i + 1}. ${formatThaiDate(date)}${time ? ` เวลา ${time}` : ''}`);
    if (provider) lines.push(`   👨‍⚕️ ${provider}`);
    if (note) lines.push(`   📝 ${note}`);
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

// ─── V33.5 — LINE Flex Message builders ─────────────────────────────────
//
// Replaces ugly multi-line text replies with structured Flex Bubbles.
// LINE Messaging API spec: https://developers.line.biz/en/reference/messaging-api/#flex-message
//
// Design (per V33.5 user decisions):
//   - U1: Single Bubble with table-style rows (not Carousel)
//   - U2: Clinic accent color (#dc2626 red default; overridable via opts.accentColor)
//   - U3: NO action buttons in v1 (no customer portal yet)
//   - U4: Hide inactive courses (active-only filter preserved from text formatter)
//
// Each builder returns: { type: 'flex', altText, contents: bubble }
// altText = the existing plain-text formatter output (graceful fallback for
// LINE clients < 8.11 that can't render Flex).

const DEFAULT_ACCENT = '#dc2626';
const DEFAULT_CLINIC_NAME = 'Lover Clinic';
const COURSES_FLEX_MAX_ROWS = 25;
const APPOINTMENTS_FLEX_MAX_ITEMS = 10;

// Truncate Thai/English text safely (counts code units; good enough for display).
function truncateText(text, maxLen) {
  const s = String(text || '');
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/**
 * Build a single Flex bubble for the empty / no-data case.
 * Used by both courses + appointments when their respective lists are empty.
 */
export function buildEmptyStateFlex(title, message, opts = {}) {
  const accentColor = opts.accentColor || DEFAULT_ACCENT;
  const clinicName = opts.clinicName || DEFAULT_CLINIC_NAME;
  const altText = `${title}\n\n${message}`;
  return {
    type: 'flex',
    altText: truncateText(altText, 400),
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', paddingAll: 'md',
        backgroundColor: accentColor,
        contents: [
          { type: 'text', text: clinicName, color: '#FFFFFF', weight: 'bold', size: 'sm' },
          { type: 'text', text: title, color: '#FFFFFF', weight: 'bold', size: 'md', margin: 'xs' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: 'lg', spacing: 'sm',
        contents: [
          { type: 'text', text: message, wrap: true, size: 'sm', color: '#666666' },
        ],
      },
    },
  };
}

/**
 * Build a Flex bubble showing the customer's active courses in a table.
 * Mirrors the filter logic of `formatCoursesReply` for consistency.
 *
 * Layout per row (3 columns):
 *   [Name (60% flex) | Qty (20% flex, mono) | Expiry (20% flex, BE)]
 *
 * Empty fields hidden per V33.5 user directive — NO "หมดอายุ -" placeholders.
 */
export function buildCoursesFlex(courses, opts = {}) {
  const accentColor = opts.accentColor || DEFAULT_ACCENT;
  const clinicName = opts.clinicName || DEFAULT_CLINIC_NAME;
  const maxRows = Number.isFinite(opts.maxRows) ? opts.maxRows : COURSES_FLEX_MAX_ROWS;

  const altText = formatCoursesReply(courses);

  if (!Array.isArray(courses) || courses.length === 0) {
    return buildEmptyStateFlex('คอร์สคงเหลือ', 'ยังไม่มีคอร์สในระบบ', { accentColor, clinicName });
  }
  const active = courses.filter((c) => {
    const status = String(c?.status || '').trim();
    return status === 'กำลังใช้งาน' || status === '' || status === 'active';
  });
  if (active.length === 0) {
    return buildEmptyStateFlex(
      'คอร์สคงเหลือ',
      'ไม่พบคอร์สที่ยังใช้ได้\n(คอร์สทั้งหมดอาจใช้หมดแล้ว / ยกเลิก / คืนเงิน)',
      { accentColor, clinicName },
    );
  }

  const visible = active.slice(0, maxRows);
  const remaining = active.length - visible.length;

  // Header row of the table
  const headerRow = {
    type: 'box', layout: 'horizontal', spacing: 'sm', paddingBottom: 'sm',
    contents: [
      { type: 'text', text: 'คอร์ส', size: 'xs', color: '#888888', weight: 'bold', flex: 5, wrap: false },
      { type: 'text', text: 'คงเหลือ', size: 'xs', color: '#888888', weight: 'bold', flex: 2, align: 'end', wrap: false },
      { type: 'text', text: 'หมดอายุ', size: 'xs', color: '#888888', weight: 'bold', flex: 2, align: 'end', wrap: false },
    ],
  };

  // Data rows
  const courseRows = visible.map((c, i) => {
    const name = truncateText(c.name || c.product || '(ไม่ระบุ)', 50);
    const qty = isMeaningfulValue(c.qty)
      ? String(c.qty)
      : (isMeaningfulValue(c.remaining) ? String(c.remaining) : '-');
    const expiryDisplay = isMeaningfulValue(c.expiry) ? formatThaiDate(c.expiry) : '';
    return {
      type: 'box', layout: 'horizontal', spacing: 'sm', paddingTop: 'sm', paddingBottom: 'sm',
      borderColor: '#EEEEEE',
      borderWidth: i === 0 ? 'none' : '1px',
      contents: [
        { type: 'text', text: name, size: 'sm', color: '#333333', flex: 5, wrap: true },
        { type: 'text', text: qty, size: 'sm', color: '#222222', flex: 2, align: 'end', weight: 'bold' },
        { type: 'text', text: expiryDisplay || '—', size: 'xs', color: expiryDisplay ? '#555555' : '#CCCCCC', flex: 2, align: 'end' },
      ],
    };
  });

  const bodyContents = [headerRow, ...courseRows];
  if (remaining > 0) {
    bodyContents.push({
      type: 'box', layout: 'vertical', paddingTop: 'md',
      contents: [
        { type: 'text', text: `และอีก ${remaining} รายการ — ติดต่อคลินิกเพื่อรายละเอียด`, size: 'xs', color: '#888888', align: 'center', wrap: true },
      ],
    });
  }

  return {
    type: 'flex',
    altText: truncateText(altText, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', paddingAll: 'md',
        backgroundColor: accentColor,
        contents: [
          { type: 'text', text: clinicName, color: '#FFFFFF', weight: 'bold', size: 'sm' },
          {
            type: 'box', layout: 'horizontal', margin: 'xs',
            contents: [
              { type: 'text', text: '📋 คอร์สคงเหลือ', color: '#FFFFFF', weight: 'bold', size: 'lg', flex: 5 },
              { type: 'text', text: `${active.length} รายการ`, color: '#FFFFFF', size: 'sm', align: 'end', flex: 2, gravity: 'center' },
            ],
          },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: 'md', spacing: 'none',
        contents: bodyContents,
      },
    },
  };
}

/**
 * Build a Flex bubble showing upcoming appointments.
 * Mirrors the filter logic of `formatAppointmentsReply`.
 *
 * Each appointment = bordered box with:
 *   - Top: 📅 date (Thai BE) + 🕐 time (HH:MM-HH:MM 24h)
 *   - Middle: 👨‍⚕️ doctorName (or staffName fallback; OMITTED if both empty)
 *   - Bottom: 📝 note / treatment (OMITTED if empty)
 */
export function buildAppointmentsFlex(appointments, opts = {}) {
  const accentColor = opts.accentColor || DEFAULT_ACCENT;
  const clinicName = opts.clinicName || DEFAULT_CLINIC_NAME;
  const maxItems = Number.isFinite(opts.maxItems) ? opts.maxItems : APPOINTMENTS_FLEX_MAX_ITEMS;
  const todayISO = opts.todayISO || new Date().toISOString().slice(0, 10);

  const altText = formatAppointmentsReply(appointments, todayISO);

  if (!Array.isArray(appointments) || appointments.length === 0) {
    return buildEmptyStateFlex('นัดหมายของคุณ', 'ไม่พบรายการนัดหมายในระบบ', { accentColor, clinicName });
  }
  const upcoming = appointments
    .filter((a) => {
      const s = String(a?.status || '').toLowerCase();
      if (s === 'cancelled' || s === 'completed' || s === 'no-show') return false;
      const date = String(a?.appointmentDate || a?.date || '').slice(0, 10);
      return date >= todayISO;
    })
    .sort((a, b) => {
      const da = String(a?.appointmentDate || a?.date || '');
      const db = String(b?.appointmentDate || b?.date || '');
      return da.localeCompare(db);
    });

  if (upcoming.length === 0) {
    return buildEmptyStateFlex(
      'นัดหมายของคุณ',
      'ไม่พบรายการนัดหมายล่วงหน้า\n(หากต้องการนัดหมายใหม่ ติดต่อคลินิกได้เลย)',
      { accentColor, clinicName },
    );
  }

  const visible = upcoming.slice(0, maxItems);
  const remaining = upcoming.length - visible.length;

  const apptBoxes = visible.map((a, i) => {
    const date = String(a.appointmentDate || a.date || '').slice(0, 10);
    const start = a.startTime || a.appointmentTime || a.time || '';
    const end = a.endTime || '';
    const time = start && end ? `${start}–${end}` : start;
    const provider = String(a.doctorName || a.staffName || a.advisorName || '').trim();
    const note = String(a.note || a.title || a.treatment || '').trim();

    const innerRows = [
      // Date + time row
      {
        type: 'box', layout: 'horizontal', spacing: 'sm',
        contents: [
          { type: 'text', text: '📅', size: 'sm', flex: 0 },
          { type: 'text', text: formatThaiDate(date), size: 'sm', weight: 'bold', color: '#222222', flex: 4, wrap: false },
          ...(time ? [
            { type: 'text', text: '🕐', size: 'sm', flex: 0 },
            { type: 'text', text: time, size: 'sm', color: '#444444', flex: 2, align: 'end', wrap: false },
          ] : []),
        ],
      },
    ];
    if (isMeaningfulValue(provider)) {
      innerRows.push({
        type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
        contents: [
          { type: 'text', text: '👨‍⚕️', size: 'sm', flex: 0 },
          { type: 'text', text: truncateText(provider, 60), size: 'sm', color: accentColor, flex: 1, wrap: true },
        ],
      });
    }
    if (isMeaningfulValue(note)) {
      innerRows.push({
        type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
        contents: [
          { type: 'text', text: '📝', size: 'sm', flex: 0 },
          { type: 'text', text: truncateText(note, 80), size: 'xs', color: '#666666', flex: 1, wrap: true },
        ],
      });
    }

    return {
      type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: 'md',
      borderColor: '#EEEEEE', cornerRadius: 'md',
      borderWidth: '1px',
      margin: i === 0 ? 'none' : 'md',
      contents: innerRows,
    };
  });

  if (remaining > 0) {
    apptBoxes.push({
      type: 'box', layout: 'vertical', paddingTop: 'md',
      contents: [
        { type: 'text', text: `และอีก ${remaining} นัด — ติดต่อคลินิกเพื่อรายละเอียด`, size: 'xs', color: '#888888', align: 'center', wrap: true },
      ],
    });
  }

  return {
    type: 'flex',
    altText: truncateText(altText, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box', layout: 'vertical', paddingAll: 'md',
        backgroundColor: accentColor,
        contents: [
          { type: 'text', text: clinicName, color: '#FFFFFF', weight: 'bold', size: 'sm' },
          {
            type: 'box', layout: 'horizontal', margin: 'xs',
            contents: [
              { type: 'text', text: '📅 นัดหมายล่วงหน้า', color: '#FFFFFF', weight: 'bold', size: 'lg', flex: 5 },
              { type: 'text', text: `${upcoming.length} นัด`, color: '#FFFFFF', size: 'sm', align: 'end', flex: 2, gravity: 'center' },
            ],
          },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: 'md', spacing: 'sm',
        contents: apptBoxes,
      },
    },
  };
}
