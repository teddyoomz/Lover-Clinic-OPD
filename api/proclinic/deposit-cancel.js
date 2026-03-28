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

    // Find deposit row + delete button by looking for rows matching customer's HN
    let depositId = null;
    let deleteUrl = null; // The actual delete URL from the ✕ button

    // Strategy 1: Find matching row and extract delete link/data-url
    $('a[href*="/admin/deposit/"]').each((_, el) => {
      if (depositId && deleteUrl) return;
      const href = $(el).attr('href') || '';
      const m = href.match(/\/admin\/deposit\/(\d+)/);
      if (!m) return;

      const row = $(el).closest('tr, .card, .deposit-row, div.row, div[class*="deposit"]');
      if (!row.length) return;
      const rowText = row.text();

      let matched = false;
      if (proClinicHN && rowText.includes(proClinicHN)) matched = true;
      if (row.find(`a[href*="/customer/${proClinicId}"]`).length) matched = true;

      if (matched) {
        depositId = m[1];
        // Find delete button: look for data-url, or link/form with "delete"/"destroy"
        const delBtn = row.find('[data-url*="deposit"]');
        if (delBtn.length) deleteUrl = delBtn.attr('data-url');
        // Also check for delete link (✕ icon)
        if (!deleteUrl) {
          row.find('a[href*="delete"], a[href*="destroy"], form[action*="deposit"] input[name="_method"][value="DELETE"]').each((_, d) => {
            if (!deleteUrl) {
              const parent = $(d).closest('form');
              if (parent.length) deleteUrl = parent.attr('action');
              else deleteUrl = $(d).attr('href');
            }
          });
        }
      }
    });

    // Strategy 2: Check detail pages if not found
    if (!depositId) {
      const allDepositIds = new Set();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/admin\/deposit\/(\d+)/);
        if (m) allDepositIds.add(m[1]);
      });

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
      // Try multiple delete URL patterns
      const deleteUrls = [
        deleteUrl, // from the actual delete button
        `${base}/admin/deposit/${depositId}/deposit`,
        `${base}/admin/deposit/${depositId}`,
      ].filter(Boolean).map(u => u.startsWith('http') ? u : `${base}${u}`);

      for (const url of [...new Set(deleteUrls)]) {
        const delRes = await session.fetch(url, {
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
          break;
        }
        try { await delRes.text(); } catch {}
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
