// POST /api/proclinic/delete — Delete customer from ProClinic
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractSearchResults, findBestMatch } from './_lib/scraper.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { origin, email, password, proClinicId, proClinicHN, patient } = req.body || {};
    const session = await createSession(origin, email, password);

    // Resolve customer ID
    let targetId = proClinicId;
    if (!targetId) {
      if (proClinicHN) {
        const hnHtml = await session.fetchText(`${origin}/admin/customer?q=${encodeURIComponent(proClinicHN)}`);
        const hnResults = extractSearchResults(hnHtml);
        if (hnResults.length > 0) targetId = hnResults[0].id;
      }
      if (!targetId && patient) {
        const query = [patient.firstName, patient.lastName].filter(Boolean).join(' ');
        if (query.trim()) {
          const nameHtml = await session.fetchText(`${origin}/admin/customer?q=${encodeURIComponent(query)}`);
          const nameResults = extractSearchResults(nameHtml);
          const match = findBestMatch(nameResults, patient);
          if (match) targetId = match.id;
        }
      }
      if (!targetId) throw new Error('ไม่พบ customer ใน ProClinic');
    }

    // GET list page for CSRF
    const listHtml = await session.fetchText(`${origin}/admin/customer`);
    const csrf = extractCSRF(listHtml);
    if (!csrf) throw new Error('ไม่พบ CSRF token');

    // DELETE via POST
    const deleteRes = await session.fetch(`${origin}/admin/customer/${targetId}`, {
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
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    return res.status(200).json(resp);
  }
}
