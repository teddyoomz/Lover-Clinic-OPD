// api/webhook/_lib/chatBranchDefaults.js
// V77-fix3 (2026-05-16 NIGHT — S-1 Rule of 3 extract).
//
// HARDCODED_NAKHON_BR_ID was duplicated in lineChatBranchResolver.js +
// fbChatBranchResolver.js — Rule C1 trigger at 2 sites; a future 3rd
// platform (Instagram, Twilio, etc.) would have made the drift unmanageable.
//
// PURPOSE: defense-in-depth fallback constant for the นครราชสีมา branch
// (sole-active pre-V75). When LOVER_DEFAULT_BRANCH_ID env is missing in
// Vercel runtime, webhook would have stamped branchId:'' causing client-side
// `!c.branchId` filter fall-through → cross-branch leak (V77-bis lesson).
//
// Same pattern as V40/V74 hardcoded canonical paths. Env-driven config is
// preferred for cloneability but vulnerable to admin-forgot-to-set;
// hardcoded constant guards against forgotten env.

export const HARDCODED_NAKHON_BR_ID = 'BR-1777873556815-26df6480';

/**
 * Resolve the last-resort fallback branchId for chat-conversation stamping.
 *
 * Precedence:
 *   1. explicit `fallbackBranchId` arg (caller passes; comes from env or test)
 *   2. HARDCODED_NAKHON_BR_ID (defense-in-depth)
 *
 * @param {string} fallbackBranchId
 * @returns {string} non-empty branchId
 */
export function resolveChatFallbackBranchId(fallbackBranchId) {
  return String(fallbackBranchId || HARDCODED_NAKHON_BR_ID);
}
