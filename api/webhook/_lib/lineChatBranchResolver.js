// api/webhook/_lib/lineChatBranchResolver.js
// V75 Item 3 — Resolve branchId for a LINE webhook event by reverse-lookup
// against be_line_configs/{branchId}. Falls back to นครราชสีมา branchId
// when no match (preserves existing flow through migration).
// AV57 invariant: every chat_conversations write in api/webhook/line.js
// MUST stamp branchId + branchIdSource resolved via this helper.
//
// V77-bis (2026-05-16 EOD+1) — HARDCODED last-resort fallback for
// นครราชสีมา. V77-fix3 (S-1, 2026-05-16 NIGHT): constant extracted to
// shared `chatBranchDefaults.js` (Rule C1 / Rule of 3 — was duplicated in
// fbChatBranchResolver.js).
import { HARDCODED_NAKHON_BR_ID } from './chatBranchDefaults.js';

/**
 * Resolve branchId + source label for a chat_conversations stamp.
 *
 * @param {object} payload — LINE webhook event payload (or any shape with `destination`)
 * @param {object} opts
 * @param {function} opts.getLineConfigByDestination — async (destination) → {branchId, channelId} | null
 * @param {string} opts.fallbackBranchId — branchId to stamp when no match (typically นครราชสีมา)
 * @param {function} [opts.onError] — invoked on caught errors (logging hook)
 * @returns {Promise<{branchId: string, branchIdSource: string}>}
 */
export async function resolveChatBranchIdFromLineEvent(payload, {
  getLineConfigByDestination,
  fallbackBranchId,
  onError = () => {},
} = {}) {
  const destination = payload?.destination || '';
  // V77-bis: explicit fallbackBranchId arg wins; else fall back to hardcoded
  // นครราชสีมา constant (NEVER empty string — guards against missing env).
  const fallback = String(fallbackBranchId || HARDCODED_NAKHON_BR_ID);
  const fallbackSource = fallbackBranchId
    ? 'webhook-line-fallback-nakhonratchasima'
    : 'webhook-line-fallback-hardcoded-nakhonratchasima';

  if (!destination || typeof getLineConfigByDestination !== 'function') {
    return { branchId: fallback, branchIdSource: fallbackSource };
  }
  try {
    const cfg = await getLineConfigByDestination(destination);
    if (cfg && cfg.branchId) {
      return { branchId: String(cfg.branchId), branchIdSource: 'webhook-line' };
    }
    return { branchId: fallback, branchIdSource: fallbackSource };
  } catch (e) {
    onError(e);
    return { branchId: fallback, branchIdSource: fallbackSource };
  }
}
