// ─── Update Deposit in ProClinic ──────────────────────────────────────────────
// Uses the #editDepositModal on /admin/deposit page:
//   POST /admin/deposit  { _method: PUT, deposit_id, old_deposit, customer_id,
//     payment_method, deposit, payment_date, payment_time, ref_no, note }
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractValidationErrors } from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { proClinicId, proClinicHN, depositProClinicId, deposit } = req.body || {};
    if (!deposit) {
      return res.status(400).json({ success: false, error: 'Missing deposit data' });
    }

    const session = await createSession();
    const base = session.origin;

    // Step 1: GET deposit list page — find deposit ID + CSRF + current deposit amount
    const searchQuery = proClinicHN || '';
    const listUrl = searchQuery
      ? `${base}/admin/deposit?q=${encodeURIComponent(searchQuery)}`
      : `${base}/admin/deposit`;

    const listHtml = await session.fetchText(listUrl);
    const $list = cheerio.load(listHtml);
    const csrf = extractCSRF(listHtml);
    if (!csrf) throw new Error('ไม่พบ CSRF token');

    // Find deposit ID and current deposit amount from the row
    let depositId = depositProClinicId || null;
    let oldDeposit = '';

    // Search rows for matching customer
    const findDepositInRows = () => {
      $list('a[href*="/admin/deposit/"]').each((_, el) => {
        if (depositId) return;
        const href = $list(el).attr('href') || '';
        const m = href.match(/\/admin\/deposit\/(\d+)/);
        if (!m) return;

        const row = $list(el).closest('tr');
        if (!row.length) return;
        const rowText = row.text();

        let matched = false;
        if (proClinicHN && rowText.includes(proClinicHN)) matched = true;
        if (proClinicId && row.find(`a[href*="/customer/${proClinicId}"]`).length) matched = true;

        if (matched) {
          depositId = m[1];
          // Extract current deposit amount from row text (e.g. "มัดจำ 5,500 บาท" or "5,500.00")
          const amountMatch = rowText.match(/(\d[\d,]*\.\d{2})/);
          if (amountMatch) oldDeposit = amountMatch[1].replace(/,/g, '');
        }
      });
    };

    if (!depositId) findDepositInRows();
    if (depositId && !oldDeposit) findDepositInRows(); // re-scan for amount if we had saved ID

    if (!depositId) {
      return res.status(200).json({
        success: false,
        error: 'ไม่พบรายการมัดจำใน ProClinic — ไม่สามารถแก้ไขได้',
      });
    }

    // If we still don't have oldDeposit, try getting it from detail page
    if (!oldDeposit) {
      try {
        const detailHtml = await session.fetchText(`${base}/admin/deposit/${depositId}/deposit`);
        const amountMatch = detailHtml.match(/(\d[\d,]*\.\d{2})/);
        if (amountMatch) oldDeposit = amountMatch[1].replace(/,/g, '');
      } catch { /* use deposit amount as fallback */ }
      if (!oldDeposit) oldDeposit = String(deposit.paymentAmount || '0');
    }

    // Step 2: POST to /admin/deposit with _method=PUT (editDepositModal form)
    const params = new URLSearchParams();
    params.set('_token', csrf);
    params.set('_method', 'PUT');
    params.set('deposit_id', depositId);
    params.set('old_deposit', oldDeposit);

    // Customer
    if (proClinicId) params.set('customer_id', proClinicId);

    // Payment fields
    params.set('payment_method', deposit.paymentChannel || '');
    params.set('deposit', String(deposit.paymentAmount || ''));
    params.set('payment_date', deposit.depositDate || '');
    params.set('payment_time', deposit.depositTime || '');
    params.set('ref_no', deposit.refNo || '');
    params.set('note', deposit.depositNote || '');

    const submitRes = await session.fetch(`${base}/admin/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': csrf,
        'Referer': `${base}/admin/deposit`,
      },
      body: params.toString(),
      redirect: 'manual',
    });

    const status = submitRes.status;
    const location = submitRes.headers?.get?.('location') || '';

    // Success: redirect (302/303)
    if (status >= 300 && status < 400) {
      return res.status(200).json({ success: true, depositId });
    }

    // Read response for errors
    const bodyHtml = await submitRes.text();
    const errors = extractValidationErrors(bodyHtml);
    if (errors) {
      return res.status(200).json({ success: false, error: `ProClinic validation: ${errors}` });
    }

    if (status === 200) {
      if (bodyHtml.includes('สำเร็จ') || bodyHtml.includes('success')) {
        return res.status(200).json({ success: true, depositId });
      }
    }

    const $err = cheerio.load(bodyHtml);
    const laravelMsg = $err('.exception-message, .exception_message, h1').first().text().trim();
    const errorDetail = laravelMsg || bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 300);

    return res.status(200).json({
      success: false,
      error: `ProClinic error (${status}): ${errorDetail || 'Unknown'}`,
    });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    return res.status(200).json(resp);
  }
}
