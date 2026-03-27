// POST /api/proclinic/create — สร้างลูกค้าใหม่ใน ProClinic
import { login, getPageWithCsrf, formatCookies, buildPatientForm, PROCLINIC_BASE, BROWSER_HEADERS } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { patient } = req.body;
    if (!patient) return res.status(400).json({ success: false, error: 'Missing patient data' });

    // 1) Login
    const cookies = await login();

    // 2) GET /admin/customer/create → CSRF
    const createUrl = `${PROCLINIC_BASE}/admin/customer/create`;
    const { csrf, cookies: pageCookies } = await getPageWithCsrf(createUrl, cookies);

    // 3) POST form
    const submitRes = await fetch(`${PROCLINIC_BASE}/admin/customer`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': formatCookies(pageCookies),
        'Referer': createUrl,
      },
      body: buildPatientForm(csrf, patient),
      redirect: 'manual',
    });

    const location = submitRes.headers.get('location') || '';

    // 4) Extract customer ID from redirect URL (/admin/customer/12345)
    const idMatch = location.match(/\/admin\/customer\/(\d+)/);
    if (idMatch) {
      return res.json({ success: true, proClinicId: idMatch[1] });
    }

    // Still on create page → form validation error
    if (location.includes('/customer/create') || submitRes.status === 200) {
      const html = await submitRes.text();
      const errMatch = html.match(/invalid-feedback[^>]*>([^<]+)/)
        || html.match(/alert-danger[^>]*>([^<]+)/);
      return res.status(422).json({
        success: false,
        error: errMatch ? errMatch[1].trim() : 'ProClinic ไม่ยอมรับข้อมูล',
      });
    }

    // Redirected somewhere else — probably success but no ID in URL
    return res.json({ success: true, proClinicId: null });

  } catch (err) {
    console.error('ProClinic create error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
