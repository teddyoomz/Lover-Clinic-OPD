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
    if (k === 'action') out.action = v;
    else if (k === 'appt') out.appt = v;
    else if (k === 'br') out.br = v;
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
  const tokens = resolveTokens(input);
  const template = input.reminderType === 'dayOf'
    ? (input.branchSettings.templateDayOf || '')
    : (input.branchSettings.templateDayBefore || '');
  const bodyText = renderTemplate(template, tokens);

  const headerTitle = input.reminderType === 'dayOf' ? '📅 นัดหมายวันนี้!' : '📅 แจ้งเตือนนัดหมาย';
  const altText = input.reminderType === 'dayOf'
    ? `นัดหมายวันนี้ ${tokens.time}`
    : `แจ้งเตือนนัดหมาย ${tokens.date} ${tokens.time}`;

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
        contents: [
          { type: 'text', text: bodyText, wrap: true, size: 'md' },
          { type: 'separator' },
          ...buildDetailRows(tokens),
          { type: 'separator' },
          { type: 'text', text: tokens.cancellationPolicyText, size: 'xs', color: '#999999', wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          flexButton('primary', ACCENT_GREEN, '✓ ยืนยัน', `action=confirm&appt=${tokens.appointmentId}&br=${input.branch?.branchId || ''}`),
          flexButton('secondary', null, 'เลื่อน', `action=reschedule&appt=${tokens.appointmentId}&br=${input.branch?.branchId || ''}`),
          flexButton('secondary', null, 'ติดต่อ', `action=contact&appt=${tokens.appointmentId}&br=${input.branch?.branchId || ''}`),
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
  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: '#999999', size: 'sm', flex: 2 },
      { type: 'text', text: String(value), weight: 'bold', flex: 5, wrap: true },
    ],
  };
}

function flexButton(style, color, label, data) {
  const action = { type: 'postback', label, data, displayText: label };
  const btn = { type: 'button', style, height: 'sm', action };
  if (color) btn.color = color;
  return btn;
}
