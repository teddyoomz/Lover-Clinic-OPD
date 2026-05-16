// src/lib/chatBranchDefaults.js
// V79 (2026-05-16 NIGHT — chat tab per-branch 100% isolation).
//
// Client-side mirror of api/webhook/_lib/chatBranchDefaults.js.
// The server-side helper is admin-SDK / Node-only; this client-side
// module exposes the same canonical NAKHON branchId for browser code
// (ChatPanel filter-pill gate, lineEnabled/fbEnabled legacy fallback).
//
// MUST STAY IN SYNC with api/webhook/_lib/chatBranchDefaults.js. The
// constant only ever changes if the prod นครราชสีมา branch is rotated
// — at which point both files update together.

export const HARDCODED_NAKHON_BR_ID = 'BR-1777873556815-26df6480';

/**
 * Whether the given branchId is the legacy single-tenant นครราชสีมา branch.
 * Used by ChatPanel to gate legacy `clinic_settings/chat_config` fallback
 * to ONLY this branch — other branches must have per-branch be_line_configs
 * / be_fb_configs docs to enable pills (strict per-branch isolation per
 * user demand "ของใครของมันจริงๆแบบ 100%").
 *
 * @param {string} branchId
 * @returns {boolean}
 */
export function isLegacyNakhonBranch(branchId) {
  return String(branchId || '') === HARDCODED_NAKHON_BR_ID;
}
