// POST /api/proclinic/create — Create new customer in ProClinic
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractCustomerId, extractHN, extractValidationErrors } from './_lib/scraper.js';
import { buildCreateFormData } from './_lib/fields.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { origin, email, password, patient } = req.body;
    if (!origin || !patient) {
      return res.status(400).json({ success: false, error: 'Missing origin or patient data' });
    }

    const session = await createSession(origin, email, password);

    // Step 1: GET create page for CSRF
    const createHtml = await session.fetchText(`${origin}/admin/customer/create`);
    const csrf = extractCSRF(createHtml);
    if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า create');

    // Step 2: Build form data and POST
    const formData = buildCreateFormData(patient, csrf);

    const submitRes = await session.fetch(`${origin}/admin/customer`, {
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
      throw new Error('สร้างลูกค้าไม่สำเร็จ — ไม่พบ ProClinic ID');
    }

    // Step 4: Extract HN from edit page
    let proClinicHN = null;
    try {
      const editHtml = await session.fetchText(`${origin}/admin/customer/${proClinicId}/edit`);
      proClinicHN = extractHN(editHtml);
    } catch (_) { /* non-fatal */ }

    return res.status(200).json({ success: true, proClinicId, proClinicHN });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
