// api/webhook/_lib/fbChatBranchResolver.js
// V75 Item 3 — Resolve branchId for FB webhook event by Page ID lookup
// against be_fb_configs. Falls back to นครราชสีมา for unmatched pages
// (legacy clinic_settings/chat_config era).
// AV57 invariant: every chat_conversations write in api/webhook/facebook.js
// MUST stamp branchId + branchIdSource resolved via this helper.

/**
 * Resolve branchId + source label for a chat_conversations stamp.
 *
 * @param {object} payload — FB webhook payload (or any shape with entry[0].id)
 * @param {object} opts
 * @param {function} opts.getFbConfigByPageId — async (pageId) → {branchId, pageId, ...} | null
 * @param {string} opts.fallbackBranchId — branchId to stamp when no match (typically นครราชสีมา)
 * @param {function} [opts.onError] — invoked on caught errors (logging hook)
 * @returns {Promise<{branchId: string, branchIdSource: string}>}
 */
export async function resolveChatBranchIdFromFbEvent(payload, {
  getFbConfigByPageId,
  fallbackBranchId,
  onError = () => {},
} = {}) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const pageId = entries[0]?.id || '';
  const fallback = String(fallbackBranchId || '');
  const fallbackSource = fallback
    ? 'webhook-fb-fallback-legacy'
    : 'webhook-fb-fallback-empty';

  if (!pageId || typeof getFbConfigByPageId !== 'function') {
    return { branchId: fallback, branchIdSource: fallbackSource };
  }
  try {
    const cfg = await getFbConfigByPageId(String(pageId));
    if (cfg && cfg.branchId) {
      return { branchId: String(cfg.branchId), branchIdSource: 'webhook-fb' };
    }
    return { branchId: fallback, branchIdSource: fallbackSource };
  } catch (e) {
    onError(e);
    return { branchId: fallback, branchIdSource: fallbackSource };
  }
}
