// ─── Cancel Deposit + Delete Customer from ProClinic ─────────────────────────
// 1. Search deposit list for entry matching customer (by HN)
// 2. Cancel deposit via POST /admin/deposit/cancel  { deposit_id }
// 3. DELETE the customer via POST /admin/customer/{id}  { _method: DELETE }
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF } from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { proClinicId, proClinicHN } = req.body || {};
    if (!proClinicId) {
      return res.status(400).json({ success: false, error: 'Missing proClinicId' });
    }

    const session = await createSession();
    const base = session.origin;

    // Step 1: Find deposit entry on list page
    const searchQuery = proClinicHN || '';
    const listUrl = searchQuery
      ? `${base}/admin/deposit?q=${encodeURIComponent(searchQuery)}`
      : `${base}/admin/deposit`;

    const html = await session.fetchText(listUrl);
    const $ = cheerio.load(html);
    const csrf = extractCSRF(html);
    if (!csrf) throw new Error('ไม่พบ CSRF token');

    let depositId = null;

    // Find by HN or customer link in rows
    $('a[href*="/admin/deposit/"]').each((_, el) => {
      if (depositId) return;
      const href = $(el).attr('href') || '';
      const m = href.match(/\/admin\/deposit\/(\d+)/);
      if (!m) return;

      const row = $(el).closest('tr, .card, .deposit-row, div.row, div[class*="deposit"]');
      if (!row.length) return;
      const rowText = row.text();

      if (proClinicHN && rowText.includes(proClinicHN)) depositId = m[1];
      if (row.find(`a[href*="/customer/${proClinicId}"]`).length) depositId = m[1];
    });

    // Fallback: check detail pages
    if (!depositId) {
      const allDepositIds = new Set();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/admin\/deposit\/(\d+)/);
        if (m) allDepositIds.add(m[1]);
      });

      for (const id of [...allDepositIds].slice(0, 10)) {
        try {
          const detailHtml = await session.fetchText(`${base}/admin/deposit/${id}/deposit`);
          if (detailHtml.includes(`/customer/${proClinicId}`) ||
              (proClinicHN && detailHtml.includes(proClinicHN))) {
            depositId = id;
            break;
          }
        } catch { /* skip */ }
      }
    }

    const results = { depositDeleted: false, customerDeleted: false };

    // Step 2: Cancel deposit via POST /admin/deposit/cancel
    if (depositId) {
      const cancelRes = await session.fetch(`${base}/admin/deposit/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': csrf,
          'Referer': `${base}/admin/deposit`,
        },
        body: new URLSearchParams({
          _token: csrf,
          deposit_id: depositId,
          cancel_note: 'ยกเลิกการจองมัดจำ',
        }).toString(),
        redirect: 'manual',
      });

      if (cancelRes.status >= 200 && cancelRes.status < 400) {
        results.depositDeleted = true;
      }
      try { await cancelRes.text(); } catch {}
    }

    // Step 3: DELETE the customer
    const customerHtml = await session.fetchText(`${base}/admin/customer`);
    const customerCsrf = extractCSRF(customerHtml);

    if (customerCsrf) {
      const custDelRes = await session.fetch(`${base}/admin/customer/${proClinicId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': customerCsrf,
        },
        body: `_method=DELETE&_token=${encodeURIComponent(customerCsrf)}`,
        redirect: 'manual',
      });

      if (custDelRes.status >= 200 && custDelRes.status < 400) {
        results.customerDeleted = true;
      }
    }

    return res.status(200).json({
      success: results.depositDeleted || results.customerDeleted,
      ...results,
      depositId: depositId || null,
      message: !depositId
        ? 'ไม่พบรายการมัดจำใน ProClinic (อาจถูกลบไปแล้ว) — ลบลูกค้าเรียบร้อย'
        : results.depositDeleted && results.customerDeleted
          ? 'ยกเลิกมัดจำและลบลูกค้าสำเร็จ'
          : !results.depositDeleted
            ? 'ลบมัดจำไม่สำเร็จ — ลองลบมือจากหน้า ProClinic'
            : 'ลบมัดจำสำเร็จ แต่ลบลูกค้าไม่สำเร็จ',
    });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    return res.status(200).json(resp);
  }
}
