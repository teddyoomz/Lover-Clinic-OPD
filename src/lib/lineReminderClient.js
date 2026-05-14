// ─── LINE Reminder Client — admin-SDK consumers (cron + debug endpoint) ─────
// Pure ESM. Helper module for Push API + customer lookup + appointments lister.
// Designed so the cron endpoint + retry endpoint + debug-fire endpoint can all
// reuse the same primitives.

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export async function pushLineMessage({ channelAccessToken, lineUserId, flexJson }) {
  if (!channelAccessToken) throw new Error('LINE_PUSH_NO_TOKEN');
  if (!lineUserId) throw new Error('LINE_PUSH_NO_USER_ID');
  if (!flexJson) throw new Error('LINE_PUSH_NO_PAYLOAD');
  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: lineUserId, messages: [flexJson] }),
  });
  let body = '';
  try { body = await res.text(); } catch { body = ''; }
  return { statusCode: res.status, body };
}

// Canonical customer lineUserId resolver — spec §3 Step 4 + §17 backward-compat.
// Used by reminder pipeline AND by UI auto-tick logic.
export function getCustomerLineUserIdAtBranch(customer, branchId) {
  if (!customer || !branchId) return null;
  const branchLink = customer.lineUserId_byBranch?.[branchId];
  if (branchLink && branchLink.lineUserId && branchLink._lineStale !== true) {
    return branchLink.lineUserId;
  }
  // Backward-compat: legacy customer.lineUserId is valid ONLY at
  // customer.branchId (where V32-tris-ter linkage was minted).
  if (
    customer.branchId === branchId
    && customer.lineUserId
    && customer._lineStale !== true
  ) {
    return customer.lineUserId;
  }
  return null;
}

export function computeBackoffMs(retryCount) {
  if (retryCount >= 3) return null;
  if (retryCount === 0) return 5 * 60 * 1000;
  if (retryCount === 1) return 30 * 60 * 1000;
  if (retryCount === 2) return 2 * 60 * 60 * 1000;
  return null;
}

export function getReminderLogKey(appointmentId, reminderType) {
  return `${appointmentId}_${reminderType}`;
}

// Helper to merge defaults with branch's lineReminder block.
// Used by cron + debug endpoint; reads cfg from getLineConfigForBranch.
export function getMergedReminderSettings(cfg, defaults) {
  const r = cfg?.lineReminder || {};
  const d = defaults || {};
  return {
    enabled: r.enabled === true,
    dayBeforeHour: typeof r.dayBeforeHour === 'number' ? r.dayBeforeHour : d.dayBeforeHour,
    dayOfHour: r.dayOfHour === null ? null : (typeof r.dayOfHour === 'number' ? r.dayOfHour : d.dayOfHour),
    quietHourStart: typeof r.quietHourStart === 'number' ? r.quietHourStart : d.quietHourStart,
    quietHourEnd: typeof r.quietHourEnd === 'number' ? r.quietHourEnd : d.quietHourEnd,
    templateDayBefore: r.templateDayBefore || d.templateDayBefore,
    templateDayOf: r.templateDayOf || d.templateDayOf,
    cancellationPolicyText: r.cancellationPolicyText || d.cancellationPolicyText,
  };
}

// Quiet-hour check supports wrap-around (e.g. 22→8).
export function isQuietHour(currentHour, quietHourStart, quietHourEnd) {
  if (quietHourStart === quietHourEnd) return false;
  if (quietHourStart < quietHourEnd) {
    return currentHour >= quietHourStart && currentHour < quietHourEnd;
  }
  // Wrap-around (e.g. 22-8): quiet if hour >= start OR hour < end
  return currentHour >= quietHourStart || currentHour < quietHourEnd;
}

// Helper to write the reminder log with consistent shape.
export function buildReminderLogDoc({
  appointmentId, customerId, branchId, customerLineUserId, reminderType,
  status, lineApiResult, retryCount, nextRetryAt, lastError, templateRendered,
}) {
  return {
    appointmentId,
    customerId,
    branchId,
    customerLineUserId: customerLineUserId || null,
    reminderType,
    status,
    attemptedAt: new Date().toISOString(),
    lineApiResult: lineApiResult || null,
    retryCount: retryCount ?? 0,
    nextRetryAt: nextRetryAt || null,
    lastError: lastError || null,
    templateRendered: templateRendered || '',
  };
}
