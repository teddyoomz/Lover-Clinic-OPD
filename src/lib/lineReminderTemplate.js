// ─── LINE Reminder Template — Flex Message builder + token resolver ─────────
// Pure ESM. No Firebase deps. Tested in isolation.

const FIRE_RED = '#DC2626';
const ACCENT_GREEN = '#16A34A';

// Bangkok Thai date format dd/mm/yyyy in พ.ศ. (BE = CE + 543).
function formatThaiDateBE(isoYyyyMmDd) {
  if (!isoYyyyMmDd || typeof isoYyyyMmDd !== 'string') return '';
  const [y, m, d] = isoYyyyMmDd.split('-');
  if (!y || !m || !d) return '';
  const be = String(Number(y) + 543).padStart(4, '0');
  return `${d}/${m}/${be}`;
}

// V69 (2026-05-15) — strip Thai title prefix from customer name so the
// rendered template reads "สวัสดีคุณ แพรพร พรแพร ค่ะ" instead of
// "สวัสดีคุณ นางสาว แพรพร พรแพร ค่ะ" (user feedback: title prefix
// duplicates the "คุณ" in the template). Strips นาย / นาง / นางสาว /
// เด็กชาย / เด็กหญิง / ไม่ระบุ from start of name + leading whitespace.
function stripCustomerNamePrefix(name) {
  if (!name || typeof name !== 'string') return '';
  // Alternation ordered LONGEST-FIRST so e.g. `นางสาว` matches before `นาง`
  // (regex alternation is greedy left-to-right, NOT longest-match — putting
  // `นาง` first would leave the trailing `สาว` in the output).
  return name.replace(/^(นางสาว|เด็กชาย|เด็กหญิง|ไม่ระบุ|นาย|นาง)\s*/, '').trim();
}

export function resolveTokens({ cust, appt, branch, doctor, treatments, branchSettings, clinicName } = {}) {
  cust = cust || {};
  appt = appt || {};
  branch = branch || {};
  branchSettings = branchSettings || {};
  // V67 (2026-05-15): customer/doctor fallback chain — real be_customers schema
  // uses ProClinic-legacy `firstname`/`lastname` (snake-case), and appt
  // already has denormalized `customerName`/`doctorName`. Mock-only `fullName`/
  // `name` field-name drift was the V66 root cause for LINE reminder pipeline.
  // V69 (2026-05-15): wrap with stripCustomerNamePrefix so the resolved name
  // never includes Thai title (นาย/นาง/นางสาว/...). User's template already
  // includes "คุณ"; the title prefix would duplicate it.
  const rawCustomerName = cust.fullName || cust.name || appt.customerName
    || `${cust.firstname || ''} ${cust.lastname || ''}`.trim()
    || cust.patientData?.firstNameTh || '';
  return {
    // V70 (2026-05-15): default "Lover Clinic" carries a SPACE — canonical
    // shape mirrors src/constants.js DEFAULT_CLINIC_SETTINGS. Pre-V70 fallback
    // 'LoverClinic' (no space) was V21-class drift from canonical default;
    // user reported header rendering "LoverClinic" jammed together.
    clinicName: clinicName || 'Lover Clinic',
    customerName: stripCustomerNamePrefix(rawCustomerName),
    customerDisplayName: cust.lineDisplayName || '',
    branchName: branch.branchName || branch.name || '',
    doctorName: (doctor && (doctor.name || doctor.fullName))
      || appt.doctorName || 'แพทย์ผู้ดูแล',
    // V71.B (2026-05-16): {{treatments}} token semantic is "what this appt is for".
    // Pre-V71.B resolver only looked at the `treatments` array (be_treatments fetched
    // for customer+date). For a REMINDER fired BEFORE the visit, no treatment record
    // exists yet → token resolved to '-' even when admin set "นัดมาเพื่อ" at booking.
    // User-reported: LINE reminder showed "บริการ: -" while appt.appointmentTo was
    // "botox". Fallback chain: real treatment names (post-treatment case, rare for
    // reminders) → appt.appointmentTo (admin's "นัดมาเพื่อ", the canonical reminder
    // intent) → '-'.
    treatments: (Array.isArray(treatments) && treatments.length
      ? treatments.map(t => t && (t.name || '')).filter(Boolean).join(', ')
      : '')
      || (typeof appt.appointmentTo === 'string' ? appt.appointmentTo.trim() : '')
      || '-',
    // V67 (2026-05-15): canonical Firestore field is `date` (NOT `appointmentDate`).
    // Mock-only `appointmentDate` was the V66 mock-shadow drift. Fallback chain
    // mirrors lineBotResponder.js defensive pattern.
    date: formatThaiDateBE(appt.date || appt.appointmentDate || ''),
    time: appt.startTime || '00:00',
    cancellationPolicyText: branchSettings.cancellationPolicyText || '',
    appointmentId: appt.id || '',
  };
}

export function renderTemplate(template, tokens) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = tokens[key];
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

// V70 (2026-05-15) — Render a `{{var}}` template as a LINE Flex span array,
// bolding every resolved variable while leaving static text plain. LINE Flex
// `text` elements accept `contents: [span]` for inline formatting; each span
// supports `weight: 'bold'`. User-reported (V70): customerName / date / time /
// branchName / doctorName / treatments inside templateDayBefore + templateDayOf
// MUST be bold (the detail rows below the body text are already bold; only the
// top body text wasn't). Empty resolved values + empty static segments are
// skipped — LINE rejects empty `{type:'span', text:''}` (same I4 lesson as the
// parent text node).
export function renderTemplateAsSpans(template, tokens) {
  if (typeof template !== 'string' || !template) return [];
  const spans = [];
  const regex = /\{\{(\w+)\}\}/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(template)) !== null) {
    const placeholder = match[0];
    const key = match[1];
    const start = match.index;
    // Static segment before this placeholder.
    if (start > lastIndex) {
      const staticText = template.slice(lastIndex, start);
      if (staticText) spans.push({ type: 'span', text: staticText });
    }
    // Variable segment — bold.
    const v = tokens?.[key];
    const resolved = v === null || v === undefined ? '' : String(v);
    if (resolved) spans.push({ type: 'span', text: resolved, weight: 'bold' });
    lastIndex = start + placeholder.length;
  }
  // Trailing static segment.
  if (lastIndex < template.length) {
    const tail = template.slice(lastIndex);
    if (tail) spans.push({ type: 'span', text: tail });
  }
  return spans;
}

export function parsePostbackData(rawData) {
  const out = { action: null, appt: null, br: null };
  if (!rawData || typeof rawData !== 'string') return out;
  for (const pair of rawData.split('&')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const k = pair.slice(0, idx);
    const v = pair.slice(idx + 1);
    // I2 (V66 / Task-2 polish): values are URL-encoded on emit by buildReminderFlex;
    // decode on parse so appointmentId with `=`/`&`/special chars round-trips cleanly.
    try {
      if (k === 'action') out.action = decodeURIComponent(v);
      else if (k === 'appt') out.appt = decodeURIComponent(v);
      else if (k === 'br') out.br = decodeURIComponent(v);
    } catch {
      // Malformed encoding — keep raw value as fallback so the postback isn't entirely lost.
      if (k === 'action') out.action = v;
      else if (k === 'appt') out.appt = v;
      else if (k === 'br') out.br = v;
    }
  }
  return out;
}

export function getDefaultFlexShape() {
  return {
    type: 'flex',
    altText: '',
    contents: { type: 'bubble', header: {}, body: {}, footer: {} },
  };
}

export function buildReminderFlex(input) {
  // I1 (Task-2 polish): defensive defaults — never throw on missing top-level keys.
  // Cron path (Task 4) passes opportunistically-built inputs; missing branchSettings
  // must NOT crash the Push call.
  const safe = input || {};
  const branchSettings = safe.branchSettings || {};
  const tokens = resolveTokens(safe);

  // I3 (V14 lesson — fail loud, don't ship malformed postback): empty appointmentId
  // would produce `action=confirm&appt=&br=...` on the wire — LINE accepts it,
  // but the postback handler can't route it. Throw rather than silently corrupt.
  if (!tokens.appointmentId) {
    throw new Error('LINE_REMINDER_FLEX_NO_APPT_ID');
  }

  const template = safe.reminderType === 'dayOf'
    ? (branchSettings.templateDayOf || '')
    : (branchSettings.templateDayBefore || '');
  // V70 (2026-05-15) — bold body variables. Body text node now uses
  // `contents:[span]` so each {{var}} placeholder renders as a span with
  // `weight:'bold'`. Detail rows below were already bold; this closes the
  // V21-class drift where only the bottom table was bold and the top body
  // text wasn't.
  const bodySpans = renderTemplateAsSpans(template, tokens);

  const headerTitle = safe.reminderType === 'dayOf' ? '📅 นัดหมายวันนี้!' : '📅 แจ้งเตือนนัดหมาย';
  const altText = safe.reminderType === 'dayOf'
    ? `นัดหมายวันนี้ ${tokens.time}`
    : `แจ้งเตือนนัดหมาย ${tokens.date} ${tokens.time}`;

  // I4 (Task-2 polish): LINE Messaging API rejects `{type:'text', text:''}` with HTTP 400
  // (`messages[0].contents.body.contents[0].text: must not be empty`). Conditionally
  // include text nodes — drop the body text + separator when template is empty;
  // drop the trailing separator + policy text when cancellation policy is empty.
  // V70 mirror: when bodySpans is empty (empty template OR all-variables-empty),
  // skip the body text node + separator entirely.
  const bodyContents = [
    ...(bodySpans.length > 0 ? [
      { type: 'text', contents: bodySpans, wrap: true, size: 'md' },
      { type: 'separator' },
    ] : []),
    ...buildDetailRows(tokens),
    ...(tokens.cancellationPolicyText ? [
      { type: 'separator' },
      { type: 'text', text: tokens.cancellationPolicyText, size: 'xs', color: '#999999', wrap: true },
    ] : []),
  ];

  // I2 (Task-2 polish): URL-encode appointmentId + branchId on emit so postback wire
  // survives reserved chars (`=`, `&`). parsePostbackData decodes on receipt.
  const apptParam = encodeURIComponent(tokens.appointmentId);
  const brParam = encodeURIComponent(safe.branch?.branchId || '');

  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: FIRE_RED,
        paddingAll: 'md',
        contents: [
          { type: 'text', text: `🏥 ${tokens.clinicName}`, weight: 'bold', color: '#FFFFFF', size: 'lg' },
          { type: 'text', text: headerTitle, color: '#FFFFFF', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          flexButton('primary', ACCENT_GREEN, '✓ ยืนยัน', `action=confirm&appt=${apptParam}&br=${brParam}`),
          flexButton('secondary', null, 'เลื่อน', `action=reschedule&appt=${apptParam}&br=${brParam}`),
          flexButton('secondary', null, 'ติดต่อ', `action=contact&appt=${apptParam}&br=${brParam}`),
        ],
      },
    },
  };
}

function buildDetailRows(tokens) {
  return [
    detailRow('📍 สาขา', tokens.branchName),
    detailRow('👨‍⚕️ แพทย์', tokens.doctorName),
    detailRow('💊 บริการ', tokens.treatments),
    detailRow('📅 วันที่', tokens.date),
    detailRow('🕐 เวลา', tokens.time),
  ];
}

function detailRow(label, value) {
  // I5 (Task-2 polish): `String(undefined)` returns the literal 'undefined' which
  // would render visibly in the LINE bubble. Coalesce to '' before stringifying.
  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#999999', size: 'sm', flex: 2 },
      { type: 'text', text: String(value ?? ''), weight: 'bold', flex: 5, wrap: true },
    ],
  };
}

function flexButton(style, color, label, data) {
  const action = { type: 'postback', label, data, displayText: label };
  const btn = { type: 'button', style, height: 'sm', action };
  if (color) btn.color = color;
  return btn;
}
