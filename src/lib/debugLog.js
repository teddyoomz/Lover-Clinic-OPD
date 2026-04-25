// ─── Debug logger — Phase 14.7.H follow-up J (2026-04-26) ────────────────
//
// Lightweight structured logger for "best effort" code paths that historically
// swallowed errors silently. Closes the observability gap noted in
// SESSION_HANDOFF as "ProClinic API silent-catch logging — 35+ intentional
// `/* best effort */` blocks; debug observability gap".
//
// CONTRACT:
//   debugLog(category, message, error?)
//
// SEMANTICS:
//   - CLIENT production bundle (Vite build, import.meta.env.PROD === true):
//     no-op. Zero user-facing console noise.
//   - CLIENT dev (npm run dev): console.warn with structured prefix so
//     developers can grep + see what failed during exploration.
//   - SERVER/serverless (Node, Vercel functions, no import.meta.env):
//     ALWAYS log. Vercel captures stdout for diagnostics — these logs are
//     the difference between a one-line bug report and a black box.
//
// STYLE GUIDE:
//   - category: short hyphenated tag for grep-ability ("proclinic-customer",
//     "stock-deduct", "treatment-write", etc). Group by code-region, not
//     by error type.
//   - message: present-tense, what was BEING attempted (not what failed).
//     E.g. "create customer FB save → master_data update" — reads as
//     "this is what we tried; it failed".
//   - error: pass the caught Error (or any value). Helper coerces safely.
//
// ANTI-PATTERN: don't replace EVERY catch with debugLog. Reserve for paths
// where a future bug report would benefit from knowing this fired. JSON.parse
// fallbacks + cosmetic best-effort writes are noise.

// Vite injects `import.meta.env.PROD === true` at client production build
// time. Stripped at build for tree-shaking. Node serverless has
// `import.meta.env` undefined → falls through to logging.
const isClientProd = !!(typeof import.meta !== 'undefined' && import.meta?.env?.PROD);

/**
 * Log a non-fatal best-effort failure with category + message + error.
 *
 * @param {string} category — short tag for grep-ability (e.g. "proclinic-customer")
 * @param {string} message — what was being attempted, present tense
 * @param {Error|unknown} [error] — the caught value (Error preferred)
 */
export function debugLog(category, message, error) {
  if (isClientProd) return;
  let detail = '';
  if (error?.message) {
    detail = ` — ${error.message}`;
  } else if (error != null) {
    const s = String(error);
    detail = s ? ` — ${s.slice(0, 200)}` : '';
  }
  // console.warn (not console.error) — these are non-fatal swallows. Using
  // .warn keeps the production-error budget clean for actual bugs.
  console.warn(`[debug:${category}] ${message}${detail}`);
}
