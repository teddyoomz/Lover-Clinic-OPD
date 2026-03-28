// POST /api/proclinic/create — Create new customer in ProClinic
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractCustomerId, extractHN, extractValidationErrors, extractFormFields, extractSelectOptions } from './_lib/scraper.js';
import { buildCreateFormData } from './_lib/fields.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { origin, email, password, patient } = req.body || {};
    if (!patient) {
      return res.status(400).json({ success: false, error: 'Missing patient data' });
    }

    const session = await createSession(origin, email, password);
    const base = session.origin;

    // Step 1: GET create page for CSRF
    const createHtml = await session.fetchText(`${base}/admin/customer/create`);
    const csrf = extractCSRF(createHtml);
    if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า create');

    // Step 2: Extract all default form fields + country options, then overlay patient data
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

    // Step 3: Check result
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

    // Step 4: Extract HN from edit page
    let proClinicHN = null;
    try {
      const editHtml = await session.fetchText(`${base}/admin/customer/${proClinicId}/edit`);
      proClinicHN = extractHN(editHtml);
    } catch (_) { /* non-fatal */ }

    return res.status(200).json({ success: true, proClinicId, proClinicHN });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    return res.status(200).json(resp);
  }
}
