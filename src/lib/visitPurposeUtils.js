// ─── visitPurposeUtils — chip + free-text "อื่นๆ" join/parse helpers ──
//
// Phase 24.0-undecies (2026-05-06)
//
// Kiosk appointment modals (deposit-booking + no-deposit-booking) let admin
// pick visit purpose from a chip list. When "อื่นๆ" is chosen, a free-text
// input captures the detail. These helpers join the chips + detail into a
// single string for storage on `appointment.purpose` (read by the Finance
// "มัดจำสำหรับ" column) and parse it back for edit-mode hydration.
//
// Pure module — no React, no Firebase. Safe to import from tests.

/**
 * Join a chip array with a free-text detail.
 * "อื่นๆ" + detail "ผ่ามุก" → interpolated as "อื่นๆ: ผ่ามุก".
 *
 * @param {Array<string>|null|undefined} purposes
 * @param {string|null|undefined} otherDetail
 * @returns {string} comma-separated purpose string suitable for storage.
 *
 * Examples:
 *   build([], '')                          → ''
 *   build(['สมรรถภาพทางเพศ'], '')          → 'สมรรถภาพทางเพศ'
 *   build(['อื่นๆ'], 'ผ่ามุก')              → 'อื่นๆ: ผ่ามุก'
 *   build(['สมรรถภาพทางเพศ','อื่นๆ'], 'X') → 'สมรรถภาพทางเพศ, อื่นๆ: X'
 *   build(['อื่นๆ'], '   ')                → 'อื่นๆ'  (whitespace-only ignored)
 *   build(['อื่นๆ'], '')                   → 'อื่นๆ'  (no detail → bare label)
 */
export function buildVisitPurposeText(purposes, otherDetail) {
  const arr = Array.isArray(purposes) ? purposes.filter(Boolean) : [];
  const cleanOther = String(otherDetail || '').trim();
  return arr
    .map(p => (p === 'อื่นๆ' && cleanOther) ? `อื่นๆ: ${cleanOther}` : p)
    .join(', ');
}

/**
 * Inverse of buildVisitPurposeText. Two input shapes accepted:
 *  (a) Array of chip values (canonical kiosk-session shape — detail is in a
 *      sibling `visitPurposeOther` field on the parent doc).
 *  (b) Joined string (legacy shape; detail extracted from "อื่นๆ: <X>" if
 *      present).
 *
 * In shape (a), if the array has an entry like "อื่นๆ: X" (legacy mixed
 * shape from earlier migration), it's normalized to "อื่นๆ" + detail "X".
 *
 * @param {Array<string>|string|null|undefined} rawArrayOrString
 * @param {string|null|undefined} fallbackOther — used when the input is an
 *   array (shape a). Ignored when input has its own detail string.
 * @returns {{ purposes: string[], other: string }}
 */
export function parseVisitPurposeText(rawArrayOrString, fallbackOther = '') {
  if (Array.isArray(rawArrayOrString)) {
    let other = String(fallbackOther || '').trim();
    const purposes = rawArrayOrString.filter(Boolean).map(p => {
      const s = String(p);
      if (s.startsWith('อื่นๆ:')) {
        const detail = s.slice('อื่นๆ:'.length).trim();
        if (detail) other = detail;
        return 'อื่นๆ';
      }
      return s;
    });
    return { purposes, other };
  }
  const s = String(rawArrayOrString || '').trim();
  if (!s) return { purposes: [], other: String(fallbackOther || '').trim() };
  const parts = s.split(/,\s*/).map(p => p.trim()).filter(Boolean);
  let other = String(fallbackOther || '').trim();
  const purposes = parts.map(p => {
    if (p.startsWith('อื่นๆ:')) {
      const detail = p.slice('อื่นๆ:'.length).trim();
      if (detail) other = detail;
      return 'อื่นๆ';
    }
    return p;
  });
  return { purposes, other };
}

// Phase 24.0-undecies institutional-memory marker — keep at end-of-file.
// MARKER: phase-24-0-undecies-visit-purpose-other
