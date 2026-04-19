// ─── Voucher API (Phase 9 Marketing) ────────────────────────────────────────
import { getSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractFormFields, extractValidationErrors } from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;

export function buildVoucherFormData(data, csrf, defaults = {}) {
  const fd = new URLSearchParams();
  for (const [k, v] of Object.entries(defaults || {})) {
    if (v != null && v !== '') fd.set(k, String(v));
  }

  fd.set('_token', csrf);
  fd.set('usage_type', data.usage_type === 'branch' ? 'branch' : 'clinic');
  fd.set('voucher_name', String(data.voucher_name || ''));
  fd.set('sale_price', String(Number(data.sale_price) || 0));
  fd.set('commission_percent', String(Number(data.commission_percent) || 0));
  fd.set('platform', String(data.platform || ''));
  fd.set('description', String(data.description || ''));
  fd.set('status', data.status === 'suspended' ? 'suspended' : 'active');

  if (data.has_period && data.period_start && data.period_end) {
    fd.set('has_period', '1');
    fd.set('period', `${data.period_start} to ${data.period_end}`);
  } else {
    fd.delete('has_period');
    fd.delete('period');
  }
  return fd;
}

async function handleCreate(req, res) {
  const { data } = req.body || {};
  if (!data?.voucher_name) return res.status(400).json({ success: false, error: 'voucher_name required' });
  if (!(Number(data.sale_price) >= 0)) return res.status(400).json({ success: false, error: 'sale_price >= 0' });

  const session = await getSession(req.body);
  const base = session.origin;

  const createHtml = await session.fetchText(`${base}/admin/voucher`);
  const csrf = extractCSRF(createHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า voucher');

  const defaults = extractFormFields(createHtml);
  const formData = buildVoucherFormData(data, csrf, defaults);

  const submitRes = await session.fetch(`${base}/admin/voucher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrf },
    body: formData.toString(),
    redirect: 'manual',
  });

  const status = submitRes.status;
  const location = submitRes.headers?.get?.('location') || '';
  let proClinicId = null;
  const locMatch = location.match(/\/admin\/voucher\/(\d+)/);
  if (locMatch) proClinicId = locMatch[1];

  if (!proClinicId && (status === 200 || status === 201)) {
    const bodyHtml = await submitRes.text();
    const errors = extractValidationErrors(bodyHtml);
    if (errors) throw new Error(errors);
    const bodyMatch = bodyHtml.match(/\/admin\/voucher\/(\d+)/);
    if (bodyMatch) proClinicId = bodyMatch[1];
  }

  // Redirect-to-list fallback
  if (!proClinicId && status >= 300 && status < 400 && /\/admin\/voucher\/?$/.test(location)) {
    try {
      const q = encodeURIComponent(data.voucher_name);
      const listHtml = await session.fetchText(`${base}/admin/voucher?q=${q}`);
      const matches = [...listHtml.matchAll(/\/admin\/voucher\/(\d+)(?:\/edit)?/g)];
      if (matches.length > 0) proClinicId = matches[0][1];
    } catch (_) {}
  }

  if (!proClinicId) {
    let snippet = '';
    try { snippet = (await submitRes.text()).substring(0, 300); } catch {}
    throw new Error(`สร้าง Voucher ไม่สำเร็จ — status=${status}, location=${location || 'none'}, body=${snippet}`);
  }

  try {
    const docPath = `artifacts/${APP_ID}/public/data/pc_vouchers/${proClinicId}`;
    const fields = {
      proClinicId: { stringValue: String(proClinicId) },
      data: { stringValue: JSON.stringify(data) },
      syncedAt: { stringValue: new Date().toISOString() },
    };
    const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
    fetch(`${FIRESTORE_BASE}/${docPath}?${mask}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
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
  const editHtml = await session.fetchText(`${base}/admin/voucher/${proClinicId}/edit`);
  const isEditPage = editHtml.includes(`voucher/${proClinicId}`) && editHtml.includes('name="voucher_name"');
  if (!isEditPage) {
    const err = new Error(`Voucher ID ${proClinicId} ไม่พบใน ProClinic`);
    err.notFound = true;
    throw err;
  }

  const csrf = extractCSRF(editHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า voucher/edit');

  const existingFields = extractFormFields(editHtml);
  const formData = buildVoucherFormData(data, csrf, existingFields);
  formData.set('_method', 'PUT');

  const updateRes = await session.fetch(`${base}/admin/voucher/${proClinicId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrf },
    body: formData.toString(), redirect: 'manual',
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
  const listHtml = await session.fetchText(`${base}/admin/voucher`);
  const csrf = extractCSRF(listHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token');

  const deleteRes = await session.fetch(`${base}/admin/voucher/${proClinicId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrf },
    body: `_method=DELETE&_token=${encodeURIComponent(csrf)}`, redirect: 'manual',
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
