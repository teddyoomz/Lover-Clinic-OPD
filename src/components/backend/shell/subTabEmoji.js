// Backend Menu D — emoji map for sub-tab picker mini-orbs.
// Keyed on NAV_SECTIONS item.id. Extracted to its own file (Rule C1 Rule of 3)
// so adding/editing emoji doesn't touch the picker component itself.

export const SUB_TAB_EMOJI = {
  // appointments-section (7)
  'appointment-all':          '📋',
  'appointment-no-deposit':   '📆',
  'appointment-deposit':      '💵',
  'appointment-treatment-in': '🩺',
  'appointment-follow-up':    '🔔',
  'appointment-walk-in':      '👣',
  'recall':                   '📞',
  // customers (1) — picker skipped via items.length === 1 gate, emoji included for safety
  'customers':                '👥',
  // sales (5)
  'sales':                    '🧾',
  'quotations':               '📄',
  'online-sales':             '🌐',
  'insurance-claims':         '🛡️',
  'vendor-sales':             '🤝',
  // stock (2)
  'stock':                    '📦',
  'central-stock':            '🏬',
  // finance (1) — picker skipped, emoji included for safety
  'finance':                  '💰',
  // marketing (3)
  'promotions':               '🏷️',
  'coupons':                  '🎟️',
  'vouchers':                 '🎁',
  // reports (17)
  'reports':                  '🏠',
  'reports-sale':             '🧾',
  'reports-customer':         '👥',
  'reports-appointment':      '📅',
  'reports-stock':            '📦',
  'reports-rfm':              '✨',
  'reports-revenue':          '📈',
  'reports-appt-analysis':    '⚡',
  'reports-daily-revenue':    '📊',
  'reports-staff-sales':      '👤',
  'reports-pnl':              '💹',
  'expense-report':           '💸',
  'clinic-report':            '🏥',
  'reports-payment':          '💳',
  'reports-df-payout':        '🩺',
  'reports-remaining-course': '⏳',
  'smart-audience':           '🎯',
  // master (21)
  'product-groups':           '📂',
  'product-units':            '⚖️',
  'medical-instruments':      '🔧',
  'holidays':                 '📆',
  'branches':                 '🏢',
  'exam-rooms':               '🚪',
  'permission-groups':        '🛡️',
  'staff':                    '👤',
  'staff-schedules':          '🗓️',
  'doctor-schedules':         '👨‍⚕️',
  'doctors':                  '🩺',
  'products':                 '💊',
  'courses':                  '💼',
  'finance-master':           '🏦',
  'df-groups':                '💯',
  'document-templates':       '📃',
  'line-settings':            '💚',
  'fb-settings':              '📘',
  'link-requests':            '🔗',
  'system-settings':          '⚙️',
  'scheduled-tasks':          '⏱️',
  'branch-backup':            '💾',
  'backup-manager':           '🗄️',
};

export const SUB_TAB_EMOJI_FALLBACK = '✨';

export function getSubTabEmoji(itemId) {
  return SUB_TAB_EMOJI[itemId] || SUB_TAB_EMOJI_FALLBACK;
}
