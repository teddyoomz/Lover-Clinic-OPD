// ─── Customer API (consolidated) ─────────────────────────────────────────────
// Actions: create, update, delete, search
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractCustomerId, extractHN, extractValidationErrors, extractFormFields, extractSelectOptions, extractSearchResults, findBestMatch } from './_lib/scraper.js';
import { buildCreateFormData, buildUpdateFormData, reverseMapPatient } from './_lib/fields.js';
import { verifyAuth } from './_lib/auth.js';
import * as cheerio from 'cheerio';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;

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

  // Backup new customer to Firestore for standalone (async)
  try {
    const docPath = `artifacts/${APP_ID}/public/data/pc_customers/${proClinicId}`;
    const fields = {
      proClinicId: { stringValue: String(proClinicId) },
      proClinicHN: { stringValue: proClinicHN || '' },
      patient: { stringValue: JSON.stringify(patient) },
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

  // Verify customer + get CSRF in parallel
  const [editHtml, listHtml] = await Promise.all([
    session.fetchText(`${base}/admin/customer/${targetId}/edit`),
    session.fetchText(`${base}/admin/customer`),
  ]);
  const isEditPage = editHtml.includes(`customer/${targetId}`) && editHtml.includes('name="firstname"');
  if (!isEditPage) {
    const err = new Error(`Customer ID ${targetId} ไม่พบใน ProClinic (อาจถูกลบไปแล้ว)`);
    err.notFound = true;
    throw err;
  }
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

// ─── Action: fetchPatient (import from ProClinic) ──────────────────────────

async function handleFetchPatient(req, res) {
  const { proClinicId } = req.body || {};
  if (!proClinicId) {
    return res.status(400).json({ success: false, error: 'Missing proClinicId' });
  }

  const session = await createSession();
  const base = session.origin;
  const editHtml = await session.fetchText(`${base}/admin/customer/${proClinicId}/edit`);

  const isEditPage = editHtml.includes(`customer/${proClinicId}`) && editHtml.includes('name="firstname"');
  if (!isEditPage) {
    const err = new Error(`Customer ID ${proClinicId} ไม่พบใน ProClinic`);
    err.notFound = true;
    throw err;
  }

  const formFields = extractFormFields(editHtml);
  const proClinicHN = extractHN(editHtml);
  const patient = reverseMapPatient(formFields);

  // Backup customer to dedicated Firestore collection for standalone (async)
  try {
    const docPath = `artifacts/${APP_ID}/public/data/pc_customers/${proClinicId}`;
    const fields = {
      proClinicId: { stringValue: String(proClinicId) },
      proClinicHN: { stringValue: proClinicHN || '' },
      patient: { stringValue: JSON.stringify(patient) },
      syncedAt: { stringValue: new Date().toISOString() },
    };
    const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
    fetch(`${FIRESTORE_BASE}/${docPath}?${mask}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }).catch(() => {});
  } catch (_) {}

  return res.status(200).json({ success: true, patient, proClinicId, proClinicHN });
}

// ─── Action: search ─────────────────────────────────────────────────────────

async function handleSearch(req, res) {
  const { query, debug } = req.body || {};
  if (!query) {
    return res.status(400).json({ success: false, error: 'Missing query' });
  }

  const session = await createSession();
  const base = session.origin;
  const html = await session.fetchText(`${base}/admin/customer?q=${encodeURIComponent(query)}`);
  const customers = extractSearchResults(html);

  // If scraper couldn't get name/phone, fetch each customer's edit page in parallel (max 10)
  const needsDetail = customers.filter(c => !c.name).slice(0, 10);
  if (needsDetail.length > 0) {
    await Promise.all(needsDetail.map(async (c) => {
      try {
        const editHtml = await session.fetchText(`${base}/admin/customer/${c.id}/edit`);
        const $ = cheerio.load(editHtml);
        const firstName = $('input[name="first_name"]').val() || '';
        const lastName = $('input[name="last_name"]').val() || '';
        const prefix = $('select[name="prefix"] option:selected').text().trim() || '';
        const phone = $('input[name="phone"]').val() || '';
        const hnVal = $('input[name="hn_id"]').val() || '';
        if (firstName || lastName) c.name = [prefix, firstName, lastName].filter(Boolean).join(' ');
        if (phone && !c.phone) c.phone = phone;
        if (hnVal && !c.hn) c.hn = `HN${hnVal}`;
      } catch {}
    }));
  }

  if (debug) {
    return res.status(200).json({ success: true, customers, _htmlLen: html.length });
  }
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
    if (action === 'fetchPatient') return await handleFetchPatient(req, res);
    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    if (err.notFound) resp.notFound = true;
    return res.status(200).json(resp);
  }
}
