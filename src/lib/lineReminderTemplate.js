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

export function resolveTokens({ cust, appt, branch, doctor, treatments, branchSettings, clinicName } = {}) {
  cust = cust || {};
  appt = appt || {};
  branch = branch || {};
  branchSettings = branchSettings || {};
  return {
    clinicName: clinicName || 'LoverClinic',
    customerName: cust.fullName || cust.name || '',
    customerDisplayName: cust.lineDisplayName || '',
    branchName: branch.branchName || branch.name || '',
    doctorName: (doctor && doctor.name) || 'แพทย์ผู้ดูแล',
    treatments: Array.isArray(treatments) && treatments.length
      ? treatments.map(t => t && (t.name || '')).filter(Boolean).join(', ') || '-'
      : '-',
    date: formatThaiDateBE(appt.appointmentDate),
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
  const bodyText = renderTemplate(template, tokens);

  const headerTitle = safe.reminderType === 'dayOf' ? '📅 นัดหมายวันนี้!' : '📅 แจ้งเตือนนัดหมาย';
  const altText = safe.reminderType === 'dayOf'
    ? `นัดหมายวันนี้ ${tokens.time}`
    : `แจ้งเตือนนัดหมาย ${tokens.date} ${tokens.time}`;

  // I4 (Task-2 polish): LINE Messaging API rejects `{type:'text', text:''}` with HTTP 400
  // (`messages[0].contents.body.contents[0].text: must not be empty`). Conditionally
  // include text nodes — drop the body text + separator when template is empty;
  // drop the trailing separator + policy text when cancellation policy is empty.
  const bodyContents = [
    ...(bodyText ? [
      { type: 'text', text: bodyText, wrap: true, size: 'md' },
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
