// ─── Cancel Deposit + Delete Customer from ProClinic ─────────────────────────
// 1. Search deposit list for entry matching customer (by HN)
// 2. DELETE the deposit entry
// 3. DELETE the customer
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF } from './_lib/scraper.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { proClinicId, proClinicHN } = req.body || {};
    if (!proClinicId) {
      return res.status(400).json({ success: false, error: 'Missing proClinicId' });
    }

    const session = await createSession();
    const base = session.origin;

    // Step 1: Find deposit entry for this customer on the deposit list page
    // Search by HN if available, otherwise scan the full list
    const searchQuery = proClinicHN || '';
    const listUrl = searchQuery
      ? `${base}/admin/deposit?q=${encodeURIComponent(searchQuery)}`
      : `${base}/admin/deposit`;

    const html = await session.fetchText(listUrl);
    const $ = cheerio.load(html);
    const csrf = extractCSRF(html);
    if (!csrf) throw new Error('ไม่พบ CSRF token');

    // Find deposit ID by looking for rows that contain the customer's HN or link to the customer
    let depositId = null;

    // Strategy 1: Look for links to /admin/deposit/{id}/deposit near customer info
    // Each deposit row has customer info (HN) and action links with deposit ID
    $('a[href*="/admin/deposit/"]').each((_, el) => {
      if (depositId) return; // already found
      const href = $(el).attr('href') || '';
      const m = href.match(/\/admin\/deposit\/(\d+)\/deposit/);
      if (!m) return;

      // Check if this row contains the customer's HN or proClinicId
      const row = $(el).closest('tr, .card, .deposit-row, div.row, div[class*="deposit"]');
      if (!row.length) return;
      const rowText = row.text();

      // Match by HN
      if (proClinicHN && rowText.includes(proClinicHN)) {
        depositId = m[1];
      }
      // Match by customer link /admin/customer/{proClinicId}
      const customerLink = row.find(`a[href*="/customer/${proClinicId}"]`);
      if (customerLink.length) {
        depositId = m[1];
      }
    });

    // Strategy 2: If not found by row, check each deposit detail page
    if (!depositId) {
      // Collect all deposit IDs from the page
      const allDepositIds = new Set();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/admin\/deposit\/(\d+)\/deposit/);
        if (m) allDepositIds.add(m[1]);
      });

      // Check up to 10 most recent deposits for matching customer
      const idsToCheck = [...allDepositIds].slice(0, 10);
      for (const id of idsToCheck) {
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

    // Step 2: DELETE the deposit entry (if found)
    if (depositId) {
      const delRes = await session.fetch(`${base}/admin/deposit/${depositId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': csrf,
        },
        body: `_method=DELETE&_token=${encodeURIComponent(csrf)}`,
        redirect: 'manual',
      });

      if (delRes.status >= 200 && delRes.status < 400) {
        results.depositDeleted = true;
      } else {
        // Try alternative: POST to /admin/deposit/{id}/cancel
        const cancelRes = await session.fetch(`${base}/admin/deposit/${depositId}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-TOKEN': csrf,
          },
          body: `_token=${encodeURIComponent(csrf)}`,
          redirect: 'manual',
        });
        if (cancelRes.status >= 200 && cancelRes.status < 400) {
          results.depositDeleted = true;
        }
      }
    }

    // Step 3: DELETE the customer
    // Re-fetch CSRF from customer page (deposit delete may have invalidated it)
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
    return res.status(200).json(resp);
  }
}
