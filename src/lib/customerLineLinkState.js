// V33.4 — Customer LINE-link state machine helpers.
//
// State enum (computed from be_customers doc):
//   'unlinked' — no lineUserId
//   'active'   — lineUserId set + (lineLinkStatus missing OR === 'active')
//   'suspended' — lineUserId set + lineLinkStatus === 'suspended'
//
// Why missing/null = active: legacy customers (pre-V33.4) have no lineLinkStatus
// field. They should keep working as-is. Only explicit 'suspended' gates the bot.

export const LINK_STATES = Object.freeze({
  UNLINKED: 'unlinked',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
});

/**
 * Compute the link state for a customer doc.
 * Returns one of LINK_STATES values.
 */
export function getLineLinkState(customer) {
  if (!customer || typeof customer !== 'object') return LINK_STATES.UNLINKED;
  if (!customer.lineUserId) return LINK_STATES.UNLINKED;
  if (customer.lineLinkStatus === LINK_STATES.SUSPENDED) return LINK_STATES.SUSPENDED;
  return LINK_STATES.ACTIVE;
}

/**
 * UI badge config (label + color tokens) for a given state.
 */
export function formatLineLinkStatusBadge(state) {
  switch (state) {
    case LINK_STATES.ACTIVE:
      return { label: 'ผูกอยู่', color: '#06C755', bgColor: 'rgba(6,199,85,0.12)' };
    case LINK_STATES.SUSPENDED:
      return { label: 'ปิดชั่วคราว', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.12)' };
    case LINK_STATES.UNLINKED:
    default:
      return { label: 'ยังไม่ผูก', color: '#9ca3af', bgColor: 'rgba(156,163,175,0.12)' };
  }
}

/**
 * Mask a LINE userId for display (e.g. "U…ab12").
 * LINE userIds start with 'U' followed by 32 hex chars.
 */
export function maskLineUserId(lineUserId) {
  if (!lineUserId || typeof lineUserId !== 'string') return '';
  const s = lineUserId.trim();
  if (s.length <= 6) return s;
  return `${s.slice(0, 1)}…${s.slice(-4)}`;
}
