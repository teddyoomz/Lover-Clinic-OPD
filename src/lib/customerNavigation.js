// Phase 15.7-septies (2026-04-29) — shared helper for opening a customer's
// detail page in a NEW BROWSER TAB (not in-page redirect).
//
// User report: "ทำให้การกดทั้งในหน้าตารางเลย หรือกด modal เปิดมาก่อน
// มันเป็นการเปิด Tab ของ Browser ใหม่ เป็นหน้าข้อมูลลูกค้าคนนั้น
// ไม่ใช่ redirection หน้าเดิมไป มันใช้ยาก".
//
// Mirrors the existing pattern at BackendDashboard.jsx:408-409 +
// DepositPanel.jsx:477 + MembershipPanel.jsx:288 — `?backend=1&customer={id}`
// is the deep-link URL that BackendDashboard's mount-effect resolves into
// `setViewingCustomer + setActiveTab('customers')` automatically.
//
// Pure module — no React imports, safe for tests + RTL+JSDOM.

/**
 * Build the deep-link URL that auto-loads the customer detail in a fresh
 * BackendDashboard mount. Uses `window.location.origin` if available,
 * falls back to a relative path for SSR / test contexts.
 *
 * @param {string} customerId — be_customers doc id (V33-aware: id-first,
 *        proClinicId fallback handled by callers)
 * @returns {string} URL like `https://host/?backend=1&customer=LC-26000001`
 */
export function buildCustomerDetailUrl(customerId) {
  const id = String(customerId || '').trim();
  if (!id) return '';
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : '';
  return `${origin}/?backend=1&customer=${encodeURIComponent(id)}`;
}

/**
 * Open the customer's detail page in a NEW BROWSER TAB. Returns true if a
 * tab was opened (the URL was non-empty + window is available), false
 * otherwise. Callers can use the boolean to surface a fallback toast when
 * the customer id is missing.
 *
 * @param {string} customerId
 * @returns {boolean}
 */
export function openCustomerInNewTab(customerId) {
  const url = buildCustomerDetailUrl(customerId);
  if (!url) return false;
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false;
  // _blank + noopener is the standard new-tab pattern. noopener prevents
  // the new tab from accessing window.opener (security defense-in-depth).
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
