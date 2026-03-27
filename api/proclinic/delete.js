// POST /api/proclinic/delete — ลบลูกค้าออกจาก ProClinic
import { login, getPageWithCsrf, formatCookies, PROCLINIC_BASE, BROWSER_HEADERS } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { proClinicId } = req.body;
    if (!proClinicId) return res.status(400).json({ success: false, error: 'Missing proClinicId' });

    // 1) Login
    const cookies = await login();

    // 2) GET /admin/customer → CSRF token
    const { csrf, cookies: pageCookies } = await getPageWithCsrf(
      `${PROCLINIC_BASE}/admin/customer`, cookies
    );

    // 3) POST with _method=DELETE
    const deleteRes = await fetch(`${PROCLINIC_BASE}/admin/customer/${proClinicId}`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': formatCookies(pageCookies),
        'X-CSRF-TOKEN': csrf,
        'Referer': `${PROCLINIC_BASE}/admin/customer`,
      },
      body: new URLSearchParams({ _method: 'DELETE', _token: csrf }).toString(),
      redirect: 'manual',
    });

    if (deleteRes.ok || (deleteRes.status >= 300 && deleteRes.status < 400)) {
      return res.json({ success: true });
    }

    return res.status(deleteRes.status).json({
      success: false,
      error: `Server ตอบกลับ status ${deleteRes.status}`,
    });

  } catch (err) {
    console.error('ProClinic delete error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
