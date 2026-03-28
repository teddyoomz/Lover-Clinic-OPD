// POST /api/proclinic/update — Update existing customer in ProClinic
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractSearchResults, findBestMatch, extractFormFields, extractValidationErrors, extractSelectOptions } from './_lib/scraper.js';
import { buildUpdateFormData } from './_lib/fields.js';
import { verifyAuth } from './_lib/auth.js';

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

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { origin, email, password, proClinicId, proClinicHN, patient } = req.body || {};
    if (!patient) {
      return res.status(400).json({ success: false, error: 'Missing patient data' });
    }

    const session = await createSession(origin, email, password);
    const base = session.origin;
    const targetId = await resolveCustomerId(session, base, proClinicId, proClinicHN, patient);

    // GET edit page → CSRF + existing form fields
    const editHtml = await session.fetchText(`${base}/admin/customer/${targetId}/edit`);

    // ตรวจว่า customer ยังมีอยู่ — ถ้าถูกลบแล้ว จะไม่มี form edit หรือ CSRF
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

    // POST update
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
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    if (err.notFound) resp.notFound = true;
    return res.status(200).json(resp);
  }
}
