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

// ─── Phase 24.0-duodecies (2026-05-06) — edit-mode deep-link ─────────────
//
// User report on PatientDashboard OPD banner: "ให้เพิ่มปุ่ม แก้ไขข้อมูล
// ลูกค้า และปุ่ม ดูข้อมูลลูกค้า เข้าไปด้วย ... แก้ไขข้อมูลลูกค้า = เปิด tab
// หน้าแก้ไขข้อมูลลูกค้าคนนั้นใน backend".
//
// `?backend=1&customer=ID&mode=edit` — BackendDashboard's deep-link useEffect
// resolves this to `setEditingCustomer(c)` (V33.3 full-page Edit Customer
// takeover) instead of `setViewingCustomer(c)`. The view URL (no mode) keeps
// existing semantics. Both share the same `getCustomer(id)` resolver, so id
// can be either be_customers doc id or proClinicId.

/**
 * Build the deep-link URL that auto-opens the customer in EDIT mode (V33.3
 * full-page takeover) on a fresh BackendDashboard mount.
 *
 * @param {string} customerId
 * @returns {string} URL like `https://host/?backend=1&customer=LC-26000001&mode=edit`
 */
export function buildCustomerEditUrl(customerId) {
  const id = String(customerId || '').trim();
  if (!id) return '';
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : '';
  return `${origin}/?backend=1&customer=${encodeURIComponent(id)}&mode=edit`;
}

/**
 * Open the customer's edit page in a NEW BROWSER TAB. Mirror of
 * openCustomerInNewTab but for edit mode.
 *
 * @param {string} customerId
 * @returns {boolean}
 */
export function openCustomerEditInNewTab(customerId) {
  const url = buildCustomerEditUrl(customerId);
  if (!url) return false;
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

// ─── (2026-07-04 spec ③④) — treatment edit deep-link ────────────────────
//
// `?backend=1&customer=ID&treatment=BT-...` — BackendDashboard's deep-link
// useEffect resolves this to `setTreatmentFormMode({mode:'edit', ...})` so a
// staff-chat card button ("เปิดบันทึกการรักษา") opens the EXACT TFP the
// vitals/doctor save came from, in a new tab, ready for the doctor to
// continue. Shares the same getCustomer(id) resolver as the view/edit links.

/**
 * Build the deep-link URL that auto-opens a SPECIFIC treatment (TFP edit
 * mode) on a fresh BackendDashboard mount.
 *
 * @param {string} customerId
 * @param {string} treatmentId  BT-... doc id in be_treatments
 * @returns {string} '' when either id is missing
 */
export function buildTreatmentEditUrl(customerId, treatmentId) {
  const cid = String(customerId || '').trim();
  const tid = String(treatmentId || '').trim();
  if (!cid || !tid) return '';
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : '';
  return `${origin}/?backend=1&customer=${encodeURIComponent(cid)}&treatment=${encodeURIComponent(tid)}`;
}
