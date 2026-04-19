// ─── Promotion API (Phase 9 Marketing) ──────────────────────────────────────
// Mirrors ProClinic /admin/promotion CRUD. 27 form fields captured via
// opd.js forms /admin/promotion on 2026-04-19. Unknown value encodings
// (promotion_type / status serialization, promotion_period combined string)
// are handled with best-effort mapping + `extractFormFields` fallback on
// update so existing ProClinic defaults are preserved for fields our UI
// doesn't touch yet (courses/products sub-items, cover_image multipart).
//
// Actions: create, update, delete, list
import { getSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractFormFields, extractValidationErrors } from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;

// ─── Field mapper ───────────────────────────────────────────────────────────

/**
 * Convert our Firestore shape → ProClinic form-encoded body.
 * Keeps every default field that came back from `extractFormFields` so we
 * don't accidentally wipe values ProClinic expects (Laravel form-level
 * validation will complain if e.g. _token is missing).
 *
 * Exported for unit-testing the field-mapping logic.
 */
export function buildPromotionFormData(data, csrf, defaults = {}) {
  const fd = new URLSearchParams();

  // Seed with all existing defaults so we don't drop fields we didn't touch.
  for (const [k, v] of Object.entries(defaults || {})) {
    if (v != null && v !== '') fd.set(k, String(v));
  }

  // Core CSRF
  fd.set('_token', csrf);

  // Basic identity
  fd.set('usage_type', data.usage_type === 'branch' ? 'branch' : 'clinic');
  fd.set('promotion_name', String(data.promotion_name || ''));
  fd.set('receipt_promotion_name', String(data.receipt_promotion_name || ''));
  fd.set('promotion_code', String(data.promotion_code || ''));
  fd.set('category_name', String(data.category_name || ''));
  fd.set('procedure_type_name', String(data.procedure_type_name || ''));

  // Pricing
  fd.set('deposit_price', String(Number(data.deposit_price) || 0));
  fd.set('sale_price', String(Number(data.sale_price) || 0));
  // Checkbox convention: only send "1" when true, otherwise omit so Laravel treats as false.
  if (data.is_vat_included) fd.set('is_vat_included', '1'); else fd.delete('is_vat_included');
  fd.set('sale_price_incl_vat', String(Number(data.sale_price_incl_vat) || 0));

  // Mode: "fixed" = ระบุคอร์สและจำนวน | "flexible" = เลือกคอร์สตามจริง
  // ProClinic encodes as string radio — actual POST value is inspected
  // from the live form if present, else fall back to our mapping.
  fd.set('promotion_type', data.promotion_type === 'flexible' ? 'flexible' : 'fixed');

  // Flexible-mode bounds (only meaningful when promotion_type === 'flexible')
  fd.set('min_course_chosen_count', String(Number(data.min_course_chosen_count) || 1));
  fd.set('max_course_chosen_count', String(Number(data.max_course_chosen_count) || 999));
  fd.set('min_course_chosen_qty', String(Number(data.min_course_chosen_qty) || 1));
  fd.set('max_course_chosen_qty', String(Number(data.max_course_chosen_qty) || 999));

  // Period: ProClinic's Flatpickr daterange uses "YYYY-MM-DD to YYYY-MM-DD"
  if (data.has_promotion_period && data.promotion_period_start && data.promotion_period_end) {
    fd.set('has_promotion_period', '1');
    fd.set('promotion_period', `${data.promotion_period_start} to ${data.promotion_period_end}`);
  } else {
    fd.delete('has_promotion_period');
    fd.delete('promotion_period');
  }

  // Display
  fd.set('description', String(data.description || ''));
  fd.set('status', data.status === 'suspended' ? 'suspended' : 'active');
  if (data.enable_line_oa_display) fd.set('enable_line_oa_display', '1'); else fd.delete('enable_line_oa_display');
  fd.set('is_price_line_display', data.is_price_line_display === false ? '0' : '1');
  fd.set('button_label', String(data.button_label || ''));

  // Sub-items: ProClinic modal uses `temp_course_id[]` + `temp_product_id[]`
  // multi-checkboxes (confirmed via opd.js click "เพิ่มข้อมูล" 2026-04-19).
  // Send array of IDs. Qty per item is OUR Firestore metadata, ProClinic
  // modal doesn't have a per-item qty field.
  for (const k of Array.from(fd.keys())) {
    if (k === 'temp_course_id[]' || k === 'temp_product_id[]') fd.delete(k);
  }
  if (Array.isArray(data.courses)) {
    for (const c of data.courses) {
      if (c?.id != null) fd.append('temp_course_id[]', String(c.id));
    }
  }
  if (Array.isArray(data.products)) {
    for (const p of data.products) {
      if (p?.id != null) fd.append('temp_product_id[]', String(p.id));
    }
  }

  // NOTE: cover_image is a multipart file upload in ProClinic — we store
  // our copy in Firebase Storage (via UI) and skip the ProClinic binary
  // push for v1. If cover_image field exists in defaults (existing upload),
  // the defaults merge above preserves it.

  return fd;
}

// ─── Action: create ─────────────────────────────────────────────────────────

async function handleCreate(req, res) {
  const { data } = req.body || {};
  if (!data?.promotion_name) {
    return res.status(400).json({ success: false, error: 'promotion_name is required' });
  }
  if (!(Number(data.sale_price) >= 0)) {
    return res.status(400).json({ success: false, error: 'sale_price must be a non-negative number' });
  }

  const session = await getSession(req.body);
  const base = session.origin;

  // GET create page for CSRF + any pre-filled defaults
  const createHtml = await session.fetchText(`${base}/admin/promotion`);
  const csrf = extractCSRF(createHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า promotion');

  const defaults = extractFormFields(createHtml);
  const formData = buildPromotionFormData(data, csrf, defaults);

  const submitRes = await session.fetch(`${base}/admin/promotion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  const status = submitRes.status;
  const location = submitRes.headers?.get?.('location') || '';

  let proClinicId = null;

  // Case A: redirect to /admin/promotion/{id}/edit (rare — Laravel usually doesn't do this)
  const locMatch = location.match(/\/admin\/promotion\/(\d+)/);
  if (locMatch) proClinicId = locMatch[1];

  // Case B: body contains id (legacy fallback)
  if (!proClinicId && (status === 200 || status === 201)) {
    const bodyHtml = await submitRes.text();
    const errors = extractValidationErrors(bodyHtml);
    if (errors) throw new Error(errors);
    const bodyMatch = bodyHtml.match(/\/admin\/promotion\/(\d+)/);
    if (bodyMatch) proClinicId = bodyMatch[1];
  }

  // Case C: redirect to list page (most common — ProClinic's default). Fetch
  // list filtered by name, grab the newest matching id.
  if (!proClinicId && status >= 300 && status < 400 && /\/admin\/promotion\/?$/.test(location)) {
    try {
      const q = encodeURIComponent(data.promotion_name);
      const listHtml = await session.fetchText(`${base}/admin/promotion?q=${q}&order_by=`);
      // Scan for any /admin/promotion/{id} reference; pick the first one
      // (list usually sorted newest-first, so our freshly-created row is on top).
      const matches = [...listHtml.matchAll(/\/admin\/promotion\/(\d+)(?:\/edit)?/g)];
      if (matches.length > 0) proClinicId = matches[0][1];
    } catch (_) { /* keep proClinicId null, fall through to error */ }
  }

  if (!proClinicId) {
    let snippet = '';
    try { snippet = (await submitRes.text()).substring(0, 300); } catch {}
    throw new Error(`สร้างโปรโมชันไม่สำเร็จ — status=${status}, location=${location || 'none'}, body=${snippet}`);
  }

  // Backup to Firestore pc_promotions mirror (server REST, no Firebase auth —
  // relies on pc_* open-write rule per iron-clad B).
  try {
    const docPath = `artifacts/${APP_ID}/public/data/pc_promotions/${proClinicId}`;
    const fields = {
      proClinicId: { stringValue: String(proClinicId) },
      data: { stringValue: JSON.stringify(data) },
      createdAt: { stringValue: new Date().toISOString() },
      syncedAt: { stringValue: new Date().toISOString() },
    };
    const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
    fetch(`${FIRESTORE_BASE}/${docPath}?${mask}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }).catch(() => {});
  } catch (_) {}

  return res.status(200).json({ success: true, proClinicId });
}

// ─── Action: update ─────────────────────────────────────────────────────────

async function handleUpdate(req, res) {
  const { proClinicId, data } = req.body || {};
  if (!proClinicId) {
    return res.status(400).json({ success: false, error: 'proClinicId required for update' });
  }
  if (!data) {
    return res.status(400).json({ success: false, error: 'data required' });
  }

  const session = await getSession(req.body);
  const base = session.origin;

  // ProClinic has NO /admin/promotion/{id}/edit page — edit is a modal on the
  // list page (/admin/promotion). Same URL for create and update; update is
  // signalled by setting the `promotion_id` hidden field to the target id.
  const listHtml = await session.fetchText(`${base}/admin/promotion`);
  const csrf = extractCSRF(listHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า promotion');

  const defaults = extractFormFields(listHtml);
  const formData = buildPromotionFormData(data, csrf, defaults);
  formData.set('promotion_id', String(proClinicId));

  const updateRes = await session.fetch(`${base}/admin/promotion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  const status = updateRes.status;
  if (status >= 300 && status < 400) {
    return res.status(200).json({ success: true });
  }

  const bodyHtml = await updateRes.text();
  const errors = extractValidationErrors(bodyHtml);
  if (errors) throw new Error(errors);

  if (status === 200 || status === 201) return res.status(200).json({ success: true });
  throw new Error(`อัพเดทโปรโมชันไม่สำเร็จ — status=${status}`);
}

// ─── Action: delete ─────────────────────────────────────────────────────────

async function handleDelete(req, res) {
  const { proClinicId } = req.body || {};
  if (!proClinicId) {
    return res.status(400).json({ success: false, error: 'proClinicId required' });
  }

  const session = await getSession(req.body);
  const base = session.origin;

  // Get CSRF from list page (cheaper than edit page)
  const listHtml = await session.fetchText(`${base}/admin/promotion`);
  const csrf = extractCSRF(listHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token');

  const deleteRes = await session.fetch(`${base}/admin/promotion/${proClinicId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
    },
    body: `_method=DELETE&_token=${encodeURIComponent(csrf)}`,
    redirect: 'manual',
  });

  if (deleteRes.status >= 200 && deleteRes.status < 400) {
    return res.status(200).json({ success: true });
  }

  throw new Error(`Server ตอบกลับ status ${deleteRes.status}`);
}

// ─── Router ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { action } = req.body || {};
    if (action === 'create') return await handleCreate(req, res);
    if (action === 'update') return await handleUpdate(req, res);
    if (action === 'delete') return await handleDelete(req, res);
    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    if (err.notFound) resp.notFound = true;
    return res.status(200).json(resp);
  }
}
