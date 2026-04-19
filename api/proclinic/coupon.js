// ─── Coupon API (Phase 9 Marketing) ─────────────────────────────────────────
// Mirrors ProClinic /admin/coupon CRUD. Fields captured via
// opd.js forms /admin/coupon on 2026-04-19.
// Actions: create, update, delete

import { getSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractFormFields, extractValidationErrors } from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;

export function buildCouponFormData(data, csrf, defaults = {}) {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(defaults || {})) {
    if (v != null && v !== '') fd.set(k, String(v));
  }

  fd.set('_token', csrf);
  fd.set('coupon_name', String(data.coupon_name || ''));
  fd.set('coupon_code', String(data.coupon_code || ''));
  fd.set('discount', String(Number(data.discount) || 0));
  fd.set('discount_type', data.discount_type === 'baht' ? 'baht' : 'percent');
  fd.set('max_qty', String(Number(data.max_qty) || 0));
  if (data.is_limit_per_user) fd.set('is_limit_per_user', '1'); else fd.delete('is_limit_per_user');
  fd.set('start_date', String(data.start_date || ''));
  fd.set('end_date', String(data.end_date || ''));
  fd.set('description', String(data.description || ''));

  // branch_ids[] — append one entry per branch. Clear any default first.
  for (const k of Array.from(fd.keys())) {
    if (k === 'branch_id[]') fd.delete(k);
  }
  if (Array.isArray(data.branch_ids)) {
    for (const bid of data.branch_ids) fd.append('branch_id[]', String(bid));
  }

  return fd;
}

async function handleCreate(req, res) {
  const { data } = req.body || {};
  if (!data?.coupon_name) return res.status(400).json({ success: false, error: 'coupon_name required' });
  if (!data?.coupon_code) return res.status(400).json({ success: false, error: 'coupon_code required' });

  const session = await getSession(req.body);
  const base = session.origin;

  const createHtml = await session.fetchText(`${base}/admin/coupon`);
  const csrf = extractCSRF(createHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า coupon');

  const defaults = extractFormFields(createHtml);
  const formData = buildCouponFormData(data, csrf, defaults);

  const submitRes = await session.fetch(`${base}/admin/coupon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrf },
    body: formData.toString(),
    redirect: 'manual',
  });

  const status = submitRes.status;
  const location = submitRes.headers?.get?.('location') || '';
  let proClinicId = null;
  const locMatch = location.match(/\/admin\/coupon\/(\d+)/);
  if (locMatch) proClinicId = locMatch[1];

  if (!proClinicId && (status === 200 || status === 201)) {
    const bodyHtml = await submitRes.text();
    const errors = extractValidationErrors(bodyHtml);
    if (errors) throw new Error(errors);
    const bodyMatch = bodyHtml.match(/\/admin\/coupon\/(\d+)/);
    if (bodyMatch) proClinicId = bodyMatch[1];
  }

  if (!proClinicId) {
    let snippet = '';
    try { snippet = (await submitRes.text()).substring(0, 300); } catch {}
    throw new Error(`สร้างคูปองไม่สำเร็จ — status=${status}, location=${location || 'none'}, body=${snippet}`);
  }

  try {
    const docPath = `artifacts/${APP_ID}/public/data/pc_coupons/${proClinicId}`;
    const fields = {
      proClinicId: { stringValue: String(proClinicId) },
      data: { stringValue: JSON.stringify(data) },
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

async function handleUpdate(req, res) {
  const { proClinicId, data } = req.body || {};
  if (!proClinicId) return res.status(400).json({ success: false, error: 'proClinicId required' });
  if (!data) return res.status(400).json({ success: false, error: 'data required' });

  const session = await getSession(req.body);
  const base = session.origin;
  const editHtml = await session.fetchText(`${base}/admin/coupon/${proClinicId}/edit`);
  const isEditPage = editHtml.includes(`coupon/${proClinicId}`) && editHtml.includes('name="coupon_name"');
  if (!isEditPage) {
    const err = new Error(`Coupon ID ${proClinicId} ไม่พบใน ProClinic`);
    err.notFound = true;
    throw err;
  }

  const csrf = extractCSRF(editHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า coupon/edit');

  const existingFields = extractFormFields(editHtml);
  const formData = buildCouponFormData(data, csrf, existingFields);
  formData.set('_method', 'PUT');

  const updateRes = await session.fetch(`${base}/admin/coupon/${proClinicId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrf },
    body: formData.toString(),
    redirect: 'manual',
  });

  const status = updateRes.status;
  if (status >= 300 && status < 400) return res.status(200).json({ success: true });
  const bodyHtml = await updateRes.text();
  const errors = extractValidationErrors(bodyHtml);
  if (errors) throw new Error(errors);
  return res.status(200).json({ success: true });
}

async function handleDelete(req, res) {
  const { proClinicId } = req.body || {};
  if (!proClinicId) return res.status(400).json({ success: false, error: 'proClinicId required' });

  const session = await getSession(req.body);
  const base = session.origin;
  const listHtml = await session.fetchText(`${base}/admin/coupon`);
  const csrf = extractCSRF(listHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token');

  const deleteRes = await session.fetch(`${base}/admin/coupon/${proClinicId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrf },
    body: `_method=DELETE&_token=${encodeURIComponent(csrf)}`,
    redirect: 'manual',
  });
  if (deleteRes.status >= 200 && deleteRes.status < 400) return res.status(200).json({ success: true });
  throw new Error(`Server ตอบกลับ status ${deleteRes.status}`);
}

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
