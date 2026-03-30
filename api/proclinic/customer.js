// ─── Customer API (consolidated) ─────────────────────────────────────────────
// Actions: create, update, delete, search
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractCustomerId, extractHN, extractValidationErrors, extractFormFields, extractSelectOptions, extractSearchResults, findBestMatch } from './_lib/scraper.js';
import { buildCreateFormData, buildUpdateFormData } from './_lib/fields.js';
import { verifyAuth } from './_lib/auth.js';

// ─── Shared helper ──────────────────────────────────────────────────────────

async function resolveCustomerId(session, base, proClinicId, proClinicHN, patient) {
  if (proClinicId) return proClinicId;

  if (proClinicHN) {
    const hnHtml = await session.fetchText(`${base}/admin/customer?q=${encodeURIComponent(proClinicHN)}`);
    const hnResults = extractSearchResults(hnHtml);
    if (hnResults.length > 0) return hnResults[0].id;
  }

  if (patient?.phone) {
    const phoneHtml = await session.fetchText(`${base}/admin/customer?q=${encodeURIComponent(patient.phone)}`);
    const phoneResults = extractSearchResults(phoneHtml);
    const match = findBestMatch(phoneResults, patient);
    if (match) return match.id;
  }

  const query = [patient?.firstName, patient?.lastName].filter(Boolean).join(' ');
  if (!query.trim()) throw new Error('ไม่มีข้อมูล HN / เบอร์ / ชื่อ สำหรับค้นหา ProClinic');

  const nameHtml = await session.fetchText(`${base}/admin/customer?q=${encodeURIComponent(query)}`);
  const nameResults = extractSearchResults(nameHtml);
  const match = findBestMatch(nameResults, patient);
  if (match) return match.id;

  const err = new Error(`ค้นหา HN:"${proClinicHN}" / ชื่อ:"${query}" ใน ProClinic ไม่พบ`);
  err.notFound = true;
  throw err;
}

// ─── Action: create ─────────────────────────────────────────────────────────

async function handleCreate(req, res) {
  const { patient } = req.body || {};
  if (!patient) {
    return res.status(400).json({ success: false, error: 'Missing patient data' });
  }

  const session = await createSession();
  const base = session.origin;

  // GET create page for CSRF
  const createHtml = await session.fetchText(`${base}/admin/customer/create`);
  const csrf = extractCSRF(createHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า create');

  // Extract all default form fields + country options, then overlay patient data
  const defaultFields = extractFormFields(createHtml);
  const countryOptions = extractSelectOptions(createHtml, 'country');
  const formData = buildCreateFormData(patient, csrf, defaultFields, countryOptions);

  const submitRes = await session.fetch(`${base}/admin/customer`, {
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
  if (status >= 300 && status < 400) {
    proClinicId = extractCustomerId(location);
  }

  if (!proClinicId && (status === 200 || status === 201)) {
    const bodyHtml = await submitRes.text();
    const errors = extractValidationErrors(bodyHtml);
    if (errors) throw new Error(errors);
    proClinicId = extractCustomerId(bodyHtml);
  }

  if (!proClinicId) {
    let bodySnippet = '';
    try { bodySnippet = (await submitRes.text()).substring(0, 300); } catch {}
    throw new Error(`สร้างลูกค้าไม่สำเร็จ — status=${status}, location=${location || 'none'}, body=${bodySnippet}`);
  }

  // Extract HN from edit page
  let proClinicHN = null;
  try {
    const editHtml = await session.fetchText(`${base}/admin/customer/${proClinicId}/edit`);
    proClinicHN = extractHN(editHtml);
  } catch (_) { /* non-fatal */ }

  return res.status(200).json({ success: true, proClinicId, proClinicHN });
}

// ─── Action: update ─────────────────────────────────────────────────────────

async function handleUpdate(req, res) {
  const { proClinicId, proClinicHN, patient } = req.body || {};
  if (!patient) {
    return res.status(400).json({ success: false, error: 'Missing patient data' });
  }

  const session = await createSession();
  const base = session.origin;
  const targetId = await resolveCustomerId(session, base, proClinicId, proClinicHN, patient);

  // GET edit page → CSRF + existing form fields
  const editHtml = await session.fetchText(`${base}/admin/customer/${targetId}/edit`);

  const isEditPage = editHtml.includes(`customer/${targetId}`) && editHtml.includes('name="firstname"');
  if (!isEditPage) {
    const err = new Error(`Customer ID ${targetId} ไม่พบใน ProClinic (อาจถูกลบไปแล้ว)`);
    err.notFound = true;
    throw err;
  }

  const csrf = extractCSRF(editHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า edit');

  const existingFields = extractFormFields(editHtml);
  const countryOptions = extractSelectOptions(editHtml, 'country');
  const formData = buildUpdateFormData(patient, existingFields, csrf, countryOptions);

  const updateRes = await session.fetch(`${base}/admin/customer/${targetId}`, {
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

  return res.status(200).json({ success: true });
}

// ─── Action: delete ─────────────────────────────────────────────────────────

async function handleDelete(req, res) {
  const { proClinicId, proClinicHN, patient } = req.body || {};

  const session = await createSession();
  const base = session.origin;

  // Resolve customer ID
  let targetId = proClinicId;
  if (!targetId) {
    if (proClinicHN) {
      const hnHtml = await session.fetchText(`${base}/admin/customer?q=${encodeURIComponent(proClinicHN)}`);
      const hnResults = extractSearchResults(hnHtml);
      if (hnResults.length > 0) targetId = hnResults[0].id;
    }
    if (!targetId && patient) {
      const query = [patient.firstName, patient.lastName].filter(Boolean).join(' ');
      if (query.trim()) {
        const nameHtml = await session.fetchText(`${base}/admin/customer?q=${encodeURIComponent(query)}`);
        const nameResults = extractSearchResults(nameHtml);
        const match = findBestMatch(nameResults, patient);
        if (match) targetId = match.id;
      }
    }
    if (!targetId) {
      const err = new Error('ไม่พบ customer ใน ProClinic (อาจถูกลบไปแล้ว)');
      err.notFound = true;
      throw err;
    }
  }

  // Verify customer still exists
  const editHtml = await session.fetchText(`${base}/admin/customer/${targetId}/edit`);
  const isEditPage = editHtml.includes(`customer/${targetId}`) && editHtml.includes('name="firstname"');
  if (!isEditPage) {
    const err = new Error(`Customer ID ${targetId} ไม่พบใน ProClinic (อาจถูกลบไปแล้ว)`);
    err.notFound = true;
    throw err;
  }

  // GET list page for CSRF
  const listHtml = await session.fetchText(`${base}/admin/customer`);
  const csrf = extractCSRF(listHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token');

  // DELETE via POST
  const deleteRes = await session.fetch(`${base}/admin/customer/${targetId}`, {
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

// ─── Action: search ─────────────────────────────────────────────────────────

async function handleSearch(req, res) {
  const { query } = req.body || {};
  if (!query) {
    return res.status(400).json({ success: false, error: 'Missing query' });
  }

  const session = await createSession();
  const base = session.origin;
  const html = await session.fetchText(`${base}/admin/customer?q=${encodeURIComponent(query)}`);
  const customers = extractSearchResults(html);

  return res.status(200).json({ success: true, customers });
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
    if (action === 'search') return await handleSearch(req, res);
    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    if (err.notFound) resp.notFound = true;
    return res.status(200).json(resp);
  }
}
