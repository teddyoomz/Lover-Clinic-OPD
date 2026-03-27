// POST /api/proclinic/update — อัปเดตข้อมูลลูกค้าใน ProClinic
import { login, getPageWithCsrf, formatCookies, buildPatientForm, PROCLINIC_BASE, BROWSER_HEADERS } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { patient, proClinicId } = req.body;
    if (!patient) return res.status(400).json({ success: false, error: 'Missing patient data' });
    if (!proClinicId) return res.status(400).json({ success: false, error: 'Missing proClinicId' });

    // 1) Login
    const cookies = await login();

    // 2) GET /admin/customer/{id}/edit → CSRF
    const editUrl = `${PROCLINIC_BASE}/admin/customer/${proClinicId}/edit`;
    const { csrf, cookies: pageCookies } = await getPageWithCsrf(editUrl, cookies);

    // 3) POST with _method=PUT
    const submitRes = await fetch(`${PROCLINIC_BASE}/admin/customer/${proClinicId}`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': formatCookies(pageCookies),
        'Referer': editUrl,
      },
      body: buildPatientForm(csrf, patient, { _method: 'PUT' }),
      redirect: 'manual',
    });

    const location = submitRes.headers.get('location') || '';

    // If redirected away from edit page → success
    const stillOnEdit = location.includes(`/customer/${proClinicId}/edit`) || submitRes.status === 200;
    if (stillOnEdit && submitRes.status === 200) {
      const html = await submitRes.text();
      const errMatch = html.match(/invalid-feedback[^>]*>([^<]+)/)
        || html.match(/alert-danger[^>]*>([^<]+)/);
      return res.status(422).json({
        success: false,
        error: errMatch ? errMatch[1].trim() : 'ProClinic ไม่ยอมรับการแก้ไข',
      });
    }

    return res.json({ success: true });

  } catch (err) {
    console.error('ProClinic update error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
