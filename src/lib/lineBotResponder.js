// ─── LINE Bot Responder — Phase 14.9 (LINE Q&A + customer linking) ──────
// V32-tris-ter (2026-04-26) → V33.4 redesign → V33.9 cleanup (2026-04-27).
// Pure helpers for the LINE Official Account bot.
//
// Customer linking flow (V33.4 admin-mediated, post-V33.9 cleanup):
//   1. Customer DMs OA with national-ID (13 digits) or passport — either
//      bare ("1234567890123") or with prefix ("ผูก 1234567890123").
//   2. Webhook validates ID format + rate-limits + creates a pending
//      be_link_requests entry. Same-reply anti-enumeration ack regardless
//      of match.
//   3. Admin reviews queue in LinkRequestsTab → approves → push success
//      reply to customer + write lineUserId on be_customers.
//
// Q&A flow:
//   - Customer types "คอร์ส" / "นัด" → bot looks up be_customers by
//     lineUserId → replies with active courses or upcoming appointments.
//
// V33.9 stripped the obsolete pre-V33.4 QR-token linking path:
//   - generateLinkToken() / consumeLinkToken() / intent='link' / LINK-<token>
//     regex / formatLinkSuccessReply / formatLinkFailureReply / LINK_SUCCESS
//     / LINK_FAIL_* messages / be_customer_link_tokens collection.
// All admin-mediated linking is preserved (V33.4 directive #2).
//
// All helpers are PURE — no Firestore, no fetch. The webhook handler
// (api/webhook/line.js) calls these to interpret incoming text + format
// outgoing replies.
//
// Intent detection is keyword-based:
//   - "1234567890123" / "ผูก 1234567890123" → intent: 'id-link-request'
//   - "คอร์ส" / "courses" / "เหลือ" → intent: 'courses'
//   - "นัด" / "appointment" / "วันนัด" → intent: 'appointments'
//   - whitelisted help keywords → intent: 'help'
//   - default                      → intent: 'unknown' (no reply)

// ─── V33.7 (2026-04-27) — i18n MESSAGES dictionary ──────────────────────
// All customer-facing strings are keyed by language. Default = 'th'.
// Foreign customers (customer_type === 'foreigner') auto-get 'en' unless
// the admin overrides via lineLanguage field on be_customers.
//
// V32-tris-quater (2026-04-26) anti-enumeration kept: ID_REQUEST_RECEIVED
// is the same-reply-regardless-of-match acknowledgement.

const MESSAGES = {
  th: {
    HELP: [
      'ส่งข้อความเหล่านี้เพื่อดูข้อมูลของคุณ:',
      '• "คอร์ส" — ดูคอร์สที่ใช้ได้คงเหลือ',
      '• "นัด" — ดูรายการนัดหมายล่วงหน้า',
      '',
      'หรือพิมพ์คำถามอื่น พนักงานคลินิกจะตอบโดยเร็วที่สุด.',
    ].join('\n'),
    // V33.9 — LINK_SUCCESS + LINK_FAIL_* removed (QR-token flow stripped;
    // admin-mediated approval uses LINK_REQUEST_APPROVED below).
    NOT_LINKED: [
      'บัญชี LINE นี้ยังไม่ได้ผูกกับลูกค้าในระบบ.',
      'หากต้องการผูก โปรดส่งเลขบัตรประชาชน (13 หลัก) หรือเลขพาสปอร์ต',
      'หรือสแกน QR ที่คลินิก.',
    ].join('\n'),
    ID_REQUEST_RECEIVED: [
      '✅ ระบบได้รับคำขอแล้ว',
      '',
      'หากเลขที่ระบุตรงกับลูกค้าในระบบ',
      'เจ้าหน้าที่จะตรวจสอบและยืนยันการผูกบัญชีให้ภายใน 1-24 ชั่วโมง',
      '',
      'หากต้องการความช่วยเหลือ โปรดติดต่อคลินิกโดยตรง.',
    ].join('\n'),
    ID_REQUEST_RATE_LIMITED: 'คำขอผูกบัญชีในช่วงนี้เกินจำนวนที่กำหนด — โปรดติดต่อคลินิกโดยตรง.',
    ID_REQUEST_INVALID: [
      'รูปแบบเลขที่ระบุไม่ถูกต้อง',
      '',
      'โปรดส่งข้อความรูปแบบ:',
      '  ผูก 1234567890123  (เลขบัตรประชาชน 13 หลัก)',
      '  ผูก AA1234567      (เลขพาสปอร์ต)',
    ].join('\n'),
    LINK_REQUEST_APPROVED: (name) => [
      `🎉 อนุมัติการผูกบัญชี LINE สำเร็จ${name ? ` คุณ${name}` : ''}`,
      '',
      'ตอนนี้คุณสามารถ:',
      '• พิมพ์ "คอร์ส" เพื่อดูคอร์สที่ใช้ได้คงเหลือ',
      '• พิมพ์ "นัด" เพื่อดูวันนัดหมาย',
    ].join('\n'),
    LINK_REQUEST_REJECTED: 'คำขอผูกบัญชีไม่ได้รับการอนุมัติ — โปรดติดต่อคลินิกเพื่อสอบถามรายละเอียด.',
    // Text reply scaffolding (formatCoursesReply / formatAppointmentsReply)
    COURSES_NO_DATA: 'ยังไม่มีคอร์สในระบบ',
    COURSES_NO_ACTIVE: 'ไม่พบคอร์สที่ยังใช้ได้\n(คอร์สทั้งหมดอาจใช้หมดแล้ว / ยกเลิก / คืนเงิน)',
    COURSES_HEADER: '📋 คอร์สที่ใช้ได้คงเหลือ:',
    COURSES_FOOTER: (n) => `... และอีก ${n} รายการ — ติดต่อคลินิกเพื่อรายละเอียด`,
    COURSES_REMAINING_LABEL: 'คงเหลือ',
    COURSES_EXPIRES_LABEL: 'หมดอายุ',
    APPT_NO_DATA: 'ไม่พบรายการนัดหมายในระบบ',
    APPT_NO_UPCOMING: 'ไม่พบรายการนัดหมายล่วงหน้า\n(หากต้องการนัดหมายใหม่ ติดต่อคลินิกได้เลย)',
    APPT_HEADER: '📅 นัดหมายล่วงหน้า:',
    APPT_TIME_PREFIX: 'เวลา',
    APPT_FOOTER: (n) => `... และอีก ${n} รายการ`,
    // Flex bubble strings
    FLEX_COURSES_TITLE: '📋 คอร์สคงเหลือ',
    FLEX_COURSES_COUNT: (n) => `${n} รายการ`,
    FLEX_COURSES_FOOTER: (n) => `และอีก ${n} รายการ — ติดต่อคลินิกเพื่อรายละเอียด`,
    FLEX_COURSES_EMPTY_TITLE: 'คอร์สคงเหลือ',
    FLEX_COURSES_EMPTY_NO_DATA: 'ยังไม่มีคอร์สในระบบ',
    FLEX_COURSES_EMPTY_NO_ACTIVE: 'ไม่พบคอร์สที่ยังใช้ได้\n(คอร์สทั้งหมดอาจใช้หมดแล้ว / ยกเลิก / คืนเงิน)',
    FLEX_APPT_TITLE: '📅 นัดหมายล่วงหน้า',
    FLEX_APPT_COUNT: (n) => `${n} นัด`,
    FLEX_APPT_FOOTER: (n) => `และอีก ${n} นัด — ติดต่อคลินิกเพื่อรายละเอียด`,
    FLEX_APPT_EMPTY_TITLE: 'นัดหมายของคุณ',
    FLEX_APPT_EMPTY_NO_DATA: 'ไม่พบรายการนัดหมายในระบบ',
    FLEX_APPT_EMPTY_NO_UPCOMING: 'ไม่พบรายการนัดหมายล่วงหน้า\n(หากต้องการนัดหมายใหม่ ติดต่อคลินิกได้เลย)',
  },
  en: {
    HELP: [
      'Send these messages to view your information:',
      '• "courses" — view your remaining courses',
      '• "appointments" — view your upcoming appointments',
      '',
      'Or type any other question — clinic staff will reply shortly.',
    ].join('\n'),
    // V33.9 — LINK_SUCCESS + LINK_FAIL_* removed (QR-token flow stripped).
    NOT_LINKED: [
      'This LINE account is not yet linked to a customer.',
      'To link, please send your national ID (13 digits) or passport number,',
      'or scan the QR at the clinic.',
    ].join('\n'),
    ID_REQUEST_RECEIVED: [
      '✅ Request received',
      '',
      'If the ID matches a customer in the system,',
      'staff will verify and confirm the link within 1–24 hours.',
      '',
      'For help, please contact the clinic directly.',
    ].join('\n'),
    ID_REQUEST_RATE_LIMITED: 'Too many link requests recently — please contact the clinic directly.',
    ID_REQUEST_INVALID: [
      'Invalid ID format',
      '',
      'Please send a message in this format:',
      '  link 1234567890123  (national ID, 13 digits)',
      '  link AA1234567      (passport number)',
    ].join('\n'),
    LINK_REQUEST_APPROVED: (name) => [
      `🎉 LINE account link approved${name ? `, ${name}` : ''}`,
      '',
      'You can now:',
      '• Type "courses" to see your remaining courses',
      '• Type "appointments" to see your upcoming appointments',
    ].join('\n'),
    LINK_REQUEST_REJECTED: 'Link request not approved — please contact the clinic for details.',
    COURSES_NO_DATA: 'No courses in the system yet',
    COURSES_NO_ACTIVE: 'No active courses found\n(All courses may be used, cancelled, or refunded)',
    COURSES_HEADER: '📋 Active Courses:',
    COURSES_FOOTER: (n) => `... and ${n} more — contact clinic for details`,
    COURSES_REMAINING_LABEL: 'Remaining',
    COURSES_EXPIRES_LABEL: 'Expires',
    APPT_NO_DATA: 'No appointments in the system',
    APPT_NO_UPCOMING: 'No upcoming appointments found\n(To book a new appointment, contact the clinic)',
    APPT_HEADER: '📅 Upcoming Appointments:',
    APPT_TIME_PREFIX: 'at',
    APPT_FOOTER: (n) => `... and ${n} more`,
    FLEX_COURSES_TITLE: '📋 Active Courses',
    FLEX_COURSES_COUNT: (n) => `${n} ${n === 1 ? 'item' : 'items'}`,
    FLEX_COURSES_FOOTER: (n) => `And ${n} more — contact clinic for details`,
    FLEX_COURSES_EMPTY_TITLE: 'Your Courses',
    FLEX_COURSES_EMPTY_NO_DATA: 'No courses in the system yet',
    FLEX_COURSES_EMPTY_NO_ACTIVE: 'No active courses found\n(All courses may be used, cancelled, or refunded)',
    FLEX_APPT_TITLE: '📅 Upcoming Appointments',
    FLEX_APPT_COUNT: (n) => `${n} ${n === 1 ? 'appt' : 'appts'}`,
    FLEX_APPT_FOOTER: (n) => `And ${n} more — contact clinic for details`,
    FLEX_APPT_EMPTY_TITLE: 'Your Appointments',
    FLEX_APPT_EMPTY_NO_DATA: 'No appointments in the system',
    FLEX_APPT_EMPTY_NO_UPCOMING: 'No upcoming appointments found\n(To book a new appointment, contact the clinic)',
  },
};

/**
 * V33.7 — Resolve language for a customer doc.
 * Priority: explicit `lineLanguage` → `customer_type === 'foreigner'` (case-
 * insensitive) → default 'th'. Null/undefined customer → 'th'.
 *
 * @param {object|null} customer
 * @returns {'th'|'en'}
 */
export function getLanguageForCustomer(customer) {
  const c = customer || {};
  const explicit = c.lineLanguage;
  if (explicit === 'th' || explicit === 'en') return explicit;
  const type = String(c.customer_type || '').trim().toLowerCase();
  if (type === 'foreigner') return 'en';
  return 'th';
}

/**
 * V33.7 — Defensive language guard. Coerce undefined / unknown / casing
 * variants to the safe default 'th'. Returns 'en' only on exact match.
 */
function normLang(lang) {
  return lang === 'en' ? 'en' : 'th';
}

/**
 * V33.7 — Format an ISO date as a long-form, locale-appropriate string:
 *   Thai (BE):    "อังคาร 28 เมษายน 2569"
 *   English (CE): "Tuesday 28 April 2026"
 *
 * Uses Intl.DateTimeFormat. For Thai, the `th-TH-u-ca-buddhist` locale
 * produces a verbose form ("วันอังคารที่ 28 เมษายน พ.ศ. 2569") that we
 * normalize to a clean weekday + day + month + BE-year shape.
 *
 * Returns '-' for empty / invalid inputs (mirrors formatThaiDate).
 *
 * @param {string} iso
 * @param {'th'|'en'} [language='th']
 * @returns {string}
 */
export function formatLongDate(iso, language = 'th') {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '-';
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return '-';
  const lang = normLang(language);
  if (lang === 'en') {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(date);
  }
  // Thai Buddhist calendar — normalize verbose locale output.
  const raw = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    timeZone: 'UTC',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
  return raw
    .replace(/^วัน/, '')
    .replace(/ที่\s*/, ' ')
    .replace(/พ\.ศ\.\s*/, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse the customer's incoming message and return an intent.
 *
 * V32-tris-quater (2026-04-26) — added 'id-link-request' intent for
 * customers who DM the OA without a clinic-issued QR. They submit their
 * Thai national ID (13 digits) or passport (alphanumeric 6-12 chars).
 * Bot creates a pending request → admin verifies + approves manually.
 *
 * @param {string} text — raw message body
 * @returns {{ intent: 'id-link-request'|'courses'|'appointments'|'help'|'unknown',
 *             payload?: { idType?: 'national-id'|'passport',
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

  // V33.9 — LINK-<token> regex + 'link' intent REMOVED. Pre-V33.4 QR-token
  // path replaced by V33.4 admin-mediated id-link-request flow. Customer
  // messages containing "LINK-XXXX" now fall through to 'unknown' intent
  // (no bot reply, message still stored in chat for admin visibility).

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

export function formatCoursesReply(courses, language = 'th') {
  const lang = normLang(language);
  const M = MESSAGES[lang];
  if (!Array.isArray(courses) || courses.length === 0) {
    return M.COURSES_NO_DATA;
  }
  // V33.8 — filter on TWO conditions:
  //   1. status is "active" (or unset / English equivalent)
  //   2. NOT consumed (parsed remaining > 0; buffet "เหมาตามจริง" and
  //      unparseable strings keep through)
  // ProClinic doesn't auto-flip status when qty hits 0/X → numeric guard
  // is required on top of status filter.
  const active = courses.filter((c) => {
    const status = String(c?.status || '').trim();
    const statusOk = status === 'กำลังใช้งาน' || status === '' || status === 'active';
    if (!statusOk) return false;
    if (isCourseConsumed(c)) return false;
    return true;
  });
  if (active.length === 0) {
    return M.COURSES_NO_ACTIVE;
  }
  const lines = [M.COURSES_HEADER, ''];
  active.slice(0, 20).forEach((c, i) => {
    const name = c.name || c.product || (lang === 'en' ? '(unspecified)' : '(ไม่ระบุ)');
    const qty = c.qty || c.remaining || '';
    // V33.5 — skip expiry chip when value is an empty placeholder ("-" etc.)
    // V33.7 — also skip when formatThaiDate returns '-' for malformed inputs
    // ("6/2027", "none", etc.) — fixes the "หมดอายุ -" leak in mobile
    // screenshot post-V33.6 deploy.
    const expiryFormatted = formatThaiDate(c.expiry);
    const expiry = isMeaningfulValue(c.expiry) && isMeaningfulValue(expiryFormatted)
      ? ` ${M.COURSES_EXPIRES_LABEL} ${expiryFormatted}`
      : '';
    lines.push(`${i + 1}. ${name}${isMeaningfulValue(qty) ? ` — ${qty}` : ''}${expiry}`);
  });
  if (active.length > 20) {
    lines.push('');
    lines.push(M.COURSES_FOOTER(active.length - 20));
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
export function formatAppointmentsReply(appointments, todayISO = '', language = 'th') {
  const lang = normLang(language);
  const M = MESSAGES[lang];
  if (!Array.isArray(appointments) || appointments.length === 0) {
    return M.APPT_NO_DATA;
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
    return M.APPT_NO_UPCOMING;
  }
  const lines = [M.APPT_HEADER, ''];
  upcoming.slice(0, 10).forEach((a, i) => {
    const date = String(a.appointmentDate || a.date || '').slice(0, 10);
    const start = a.startTime || a.appointmentTime || a.time || '';
    const end = a.endTime || '';
    const time = start && end ? `${start}-${end}` : start;
    const provider = String(a.doctorName || a.staffName || a.advisorName || '').trim();
    const note = a.note || a.title || a.treatment || '';
    // V33.7 — full weekday + month via formatLongDate (locale-aware)
    lines.push(`${i + 1}. ${formatLongDate(date, lang)}${time ? ` ${M.APPT_TIME_PREFIX} ${time}` : ''}`);
    if (provider) lines.push(`   👨‍⚕️ ${provider}`);
    if (note) lines.push(`   📝 ${note}`);
  });
  if (upcoming.length > 10) {
    lines.push('');
    lines.push(M.APPT_FOOTER(upcoming.length - 10));
  }
  return lines.join('\n');
}

export function formatHelpReply(language = 'th') {
  return MESSAGES[normLang(language)].HELP;
}

// V33.9 — formatLinkSuccessReply + formatLinkFailureReply REMOVED.
// Pre-V33.4 QR-token flow stripped; admin-mediated success uses
// formatLinkRequestApprovedReply below.

export function formatNotLinkedReply(language = 'th') {
  return MESSAGES[normLang(language)].NOT_LINKED;
}

/**
 * Same-reply anti-enumeration acknowledgement for id-link-request.
 * Returns the same message whether the ID matched a customer or not,
 * so an attacker DMing random IDs can't confirm which exist in our DB.
 */
export function formatIdRequestAck(language = 'th') {
  return MESSAGES[normLang(language)].ID_REQUEST_RECEIVED;
}

/**
 * Returned when the customer's lineUserId hit the rate-limit threshold
 * (default 5 attempts per 24h). Same-message-tone-as-ack so even the
 * rate-limit signal doesn't leak whether IDs are valid.
 */
export function formatIdRequestRateLimitedReply(language = 'th') {
  return MESSAGES[normLang(language)].ID_REQUEST_RATE_LIMITED;
}

/**
 * Format hint when customer typed "ผูก" but the ID didn't match the
 * national-id (13 digits) or passport (alphanumeric 6-12) pattern.
 */
export function formatIdRequestInvalidFormat(language = 'th') {
  return MESSAGES[normLang(language)].ID_REQUEST_INVALID;
}

/**
 * Bot reply pushed to the customer's LINE after admin APPROVES their
 * link request via LinkRequestsTab.
 */
export function formatLinkRequestApprovedReply(customerName = '', language = 'th') {
  return MESSAGES[normLang(language)].LINK_REQUEST_APPROVED(String(customerName || '').trim());
}

/**
 * Bot reply pushed to the customer's LINE after admin REJECTS the
 * link request.
 */
export function formatLinkRequestRejectedReply(language = 'th') {
  return MESSAGES[normLang(language)].LINK_REQUEST_REJECTED;
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

// V33.9 — generateLinkToken REMOVED. Pre-V33.4 QR-token mint helper had
// no remaining callers after admin-mediated flow shipped (V33.4 directive
// #2). Eliminated alongside api/admin/customer-link.js + customerLinkClient.js.

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
 * V33.8 — Parse the leading "remaining" count from a qty string.
 * Returns the numeric remaining or null if not parseable.
 *
 * Patterns handled:
 *   "0/3 amp."        → 0
 *   "0 / 3 amp."      → 0
 *   "100 / 100 U"     → 100
 *   "0.5 / 1 U"       → 0.5
 *   "5"               → 5  (single number)
 *   "เหมาตามจริง"      → null  (buffet — no count)
 *   "" / null / undef → null
 *
 * @param {string|number} qty
 * @returns {number|null}
 */
export function parseRemainingCount(qty) {
  if (typeof qty === 'number' && Number.isFinite(qty)) return qty;
  const s = String(qty || '').trim();
  if (!s) return null;
  // Buffet courses ("เหมาตามจริง", "buffet") have no count → not consumed
  if (/เหมา|buffet|unlimited/i.test(s)) return null;
  // Pattern 1: leading number followed by "/" or whitespace
  const m = s.match(/^\s*(\d+(?:\.\d+)?)(?:\s*\/|\s+)/);
  if (m) return Number(m[1]);
  // Pattern 2: just a single number
  const m2 = s.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (m2) return Number(m2[1]);
  return null;
}

/**
 * V33.8 — Determine whether a course is fully consumed (remaining = 0).
 * Such courses should NOT appear in bot replies — user directive
 * 2026-04-27 ("0 มันแปลว่าคอร์สนั้นหมดแล้ว ไม่ควรนับเป็นรายการคอร์ส
 * เหลือด้วยซ้ำ"). ProClinic doesn't auto-flip status to "ใช้หมดแล้ว"
 * when qty hits 0/X, so this is a numeric guard layered on top of
 * status filter.
 *
 * @param {object} course — customer.courses[] entry
 * @returns {boolean} true iff parsed remaining is exactly 0
 */
export function isCourseConsumed(course) {
  const c = course || {};
  // Prefer qty (display string with both remaining + total),
  // fall back to remaining (just the count).
  const primary = parseRemainingCount(c.qty);
  if (primary !== null) return primary <= 0;
  const secondary = parseRemainingCount(c.remaining);
  if (secondary !== null) return secondary <= 0;
  return false; // unparseable → keep visible (defensive)
}

/**
 * V33.6 — Build the inline meta line shown beneath each course name in
 * the Flex bubble. Replaces the V33.5 horizontal 3-column table whose
 * narrow `flex: 2` / `wrap: false` cells truncated mobile data ("0 / 3
 * a..." instead of "0 / 3 ครั้ง", "เหมาตา..." instead of "เหมาตามจริง").
 *
 * Always renders "คงเหลือ X" — falls back through qty → remaining → '-'.
 * Conditionally appends " · หมดอายุ Y" iff `isMeaningfulValue(c.expiry)`
 * (smart-display preserved from V33.5 directive).
 *
 * @param {object} course — single customer.courses[] entry
 * @returns {string}
 */
export function buildCourseMetaLine(course, language = 'th') {
  const lang = normLang(language);
  const M = MESSAGES[lang];
  const c = course || {};
  const qty = isMeaningfulValue(c.qty)
    ? String(c.qty)
    : (isMeaningfulValue(c.remaining) ? String(c.remaining) : '-');
  let line = `${M.COURSES_REMAINING_LABEL} ${qty}`;
  // V33.7 — also smart-hide when formatThaiDate('-' / non-ISO) returns '-'.
  // Fixes the post-V33.6 leak where stored expiry like "6/2027" or "none"
  // passed isMeaningfulValue(input) but rendered as "หมดอายุ -".
  const expiryFormatted = formatThaiDate(c.expiry);
  if (isMeaningfulValue(c.expiry) && isMeaningfulValue(expiryFormatted)) {
    line += ` · ${M.COURSES_EXPIRES_LABEL} ${expiryFormatted}`;
  }
  return line;
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
  const lang = normLang(opts.language);
  const M = MESSAGES[lang];

  const altText = formatCoursesReply(courses, lang);

  if (!Array.isArray(courses) || courses.length === 0) {
    return buildEmptyStateFlex(M.FLEX_COURSES_EMPTY_TITLE, M.FLEX_COURSES_EMPTY_NO_DATA, { accentColor, clinicName });
  }
  // V33.8 — same dual filter as formatCoursesReply (status + non-consumed).
  // Header count "N รายการ" reflects displayable courses, NOT raw input length.
  const active = courses.filter((c) => {
    const status = String(c?.status || '').trim();
    const statusOk = status === 'กำลังใช้งาน' || status === '' || status === 'active';
    if (!statusOk) return false;
    if (isCourseConsumed(c)) return false;
    return true;
  });
  if (active.length === 0) {
    return buildEmptyStateFlex(
      M.FLEX_COURSES_EMPTY_TITLE,
      M.FLEX_COURSES_EMPTY_NO_ACTIVE,
      { accentColor, clinicName },
    );
  }

  const visible = active.slice(0, maxRows);
  const remaining = active.length - visible.length;

  // V33.6 — Vertical-stacked data rows. Each course = name (full width
  // bold) + meta line ("คงเหลือ X · หมดอายุ Y", inline gray). Eliminates
  // truncation as a bug class — V33.5 horizontal 3-column table truncated
  // mobile data because flex:2 + wrap:false cells couldn't fit "0 / 3
  // ครั้ง" / "เหมาตามจริง". Column-header row dropped because data is
  // now self-labeled inline.
  // V33.7 — meta line + fallback name translate via language.
  const fallbackName = lang === 'en' ? '(unspecified)' : '(ไม่ระบุ)';
  const courseRows = visible.map((c, i) => {
    const name = truncateText(c.name || c.product || fallbackName, 200);
    const metaLine = buildCourseMetaLine(c, lang);
    return {
      type: 'box', layout: 'vertical', spacing: 'xs',
      paddingTop: i === 0 ? 'none' : 'md',
      paddingBottom: 'md',
      borderColor: '#EEEEEE',
      borderWidth: i === 0 ? 'none' : '1px',
      contents: [
        { type: 'text', text: name, size: 'sm', color: '#222222', weight: 'bold', wrap: true },
        { type: 'text', text: metaLine, size: 'xs', color: '#666666', wrap: true, margin: 'xs' },
      ],
    };
  });

  const bodyContents = [...courseRows];
  if (remaining > 0) {
    bodyContents.push({
      type: 'box', layout: 'vertical', paddingTop: 'md',
      contents: [
        { type: 'text', text: M.FLEX_COURSES_FOOTER(remaining), size: 'xs', color: '#888888', align: 'center', wrap: true },
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
              { type: 'text', text: M.FLEX_COURSES_TITLE, color: '#FFFFFF', weight: 'bold', size: 'lg', flex: 5 },
              { type: 'text', text: M.FLEX_COURSES_COUNT(active.length), color: '#FFFFFF', size: 'sm', align: 'end', flex: 2, gravity: 'center' },
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
  const lang = normLang(opts.language);
  const M = MESSAGES[lang];

  const altText = formatAppointmentsReply(appointments, todayISO, lang);

  if (!Array.isArray(appointments) || appointments.length === 0) {
    return buildEmptyStateFlex(M.FLEX_APPT_EMPTY_TITLE, M.FLEX_APPT_EMPTY_NO_DATA, { accentColor, clinicName });
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
      M.FLEX_APPT_EMPTY_TITLE,
      M.FLEX_APPT_EMPTY_NO_UPCOMING,
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

    // V33.6 — Date + time as TWO separate stacked sub-rows. V33.5 had
    // them in one horizontal box where time(flex:2, wrap:false) truncated
    // "10:00–10:30" → "10:00–10..." on mobile. Stacked = full string
    // ALWAYS visible regardless of mobile width or font scale.
    // V33.7 — date now uses formatLongDate (full weekday + month) per
    // user directive; date string is locale-aware.
    const innerRows = [
      {
        type: 'box', layout: 'horizontal', spacing: 'sm',
        contents: [
          { type: 'text', text: '📅', size: 'sm', flex: 0 },
          { type: 'text', text: formatLongDate(date, lang), size: 'sm', weight: 'bold', color: '#222222', flex: 1, wrap: true },
        ],
      },
    ];
    if (time) {
      innerRows.push({
        type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
        contents: [
          { type: 'text', text: '🕐', size: 'sm', flex: 0 },
          { type: 'text', text: time, size: 'sm', color: '#444444', flex: 1, wrap: true },
        ],
      });
    }
    if (isMeaningfulValue(provider)) {
      innerRows.push({
        type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
        contents: [
          { type: 'text', text: '👨‍⚕️', size: 'sm', flex: 0 },
          // V33.6 — provider color #222 not accentColor. Rule 04 (Thai
          // culture): red on names of people = death omen. Red preserved
          // on header band only — accent on STRUCTURE, not on names.
          { type: 'text', text: truncateText(provider, 100), size: 'sm', color: '#222222', flex: 1, wrap: true },
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
        { type: 'text', text: M.FLEX_APPT_FOOTER(remaining), size: 'xs', color: '#888888', align: 'center', wrap: true },
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
              { type: 'text', text: M.FLEX_APPT_TITLE, color: '#FFFFFF', weight: 'bold', size: 'lg', flex: 5 },
              { type: 'text', text: M.FLEX_APPT_COUNT(upcoming.length), color: '#FFFFFF', size: 'sm', align: 'end', flex: 2, gravity: 'center' },
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
