// ─── Submit Deposit to ProClinic ─────────────────────────────────────────────
// Two-step: expects customer already created (has proClinicId/HN)
// Fills deposit form on /admin/deposit with customer_option='choose' (existing customer)
// NOTE: Despite form having enctype="multipart/form-data", x-www-form-urlencoded works
// fine since there are no file uploads. Tested and confirmed 302 redirect on success.
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractValidationErrors } from './_lib/scraper.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { proClinicId, proClinicHN, deposit } = req.body || {};
    if (!proClinicId || !deposit) {
      return res.status(400).json({ success: false, error: 'Missing proClinicId or deposit data' });
    }

    const session = await createSession();
    const base = session.origin;

    // Step 1: GET /admin/deposit to extract CSRF + ALL default form fields
    const html = await session.fetchText(`${base}/admin/deposit`);
    const csrf = extractCSRF(html);
    if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า deposit');

    const $ = cheerio.load(html);

    // Extract all default form fields from the deposit modal
    const defaultFields = {};
    const formSelector = $('#createDepositModal').length
      ? '#createDepositModal input, #createDepositModal textarea, #createDepositModal select'
      : 'form input, form textarea, form select';

    $(formSelector).each((_, el) => {
      const name = $(el).attr('name');
      if (!name || name === '_token') return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') {
        defaultFields[name] = $(el).find('option:selected').val() || '';
      } else if (tag === 'input' && $(el).attr('type') === 'checkbox') {
        if ($(el).is(':checked')) defaultFields[name] = $(el).val() || '1';
      } else if (tag === 'input' && $(el).attr('type') === 'radio') {
        if ($(el).is(':checked')) defaultFields[name] = $(el).val();
      } else {
        defaultFields[name] = $(el).val() || '';
      }
    });

    // Step 2: Build URLSearchParams — start with defaults, override with deposit data
    const params = new URLSearchParams();
    params.set('_token', csrf);

    // Set all default fields first
    for (const [key, val] of Object.entries(defaultFields)) {
      if (key !== '_token' && key !== '_method') {
        params.set(key, val);
      }
    }

    // Select existing customer: 'choose' (ProClinic radio value)
    params.set('customer_option', 'choose');
    params.set('customer_id', proClinicId);

    // Payment info
    if (deposit.paymentChannel) params.set('payment_method', deposit.paymentChannel);
    if (deposit.paymentAmount != null) params.set('deposit', String(deposit.paymentAmount));
    if (deposit.depositDate) params.set('payment_date', deposit.depositDate);
    if (deposit.depositTime) params.set('payment_time', deposit.depositTime);
    if (deposit.refNo) params.set('ref_no', deposit.refNo);
    if (deposit.depositNote) params.set('deposit_note', deposit.depositNote);

    // Salesperson
    if (deposit.salesperson) {
      params.set('hasSeller1', '1');
      params.set('seller_1_id', deposit.salesperson);
      params.set('sale_percent_1', '100');
      params.set('sale_total_1', String(deposit.paymentAmount || '0'));
    }

    // Customer source
    if (deposit.customerSource) params.set('customer_source', deposit.customerSource);
    if (deposit.sourceDetail) params.set('source_detail', deposit.sourceDetail);

    // Appointment
    if (deposit.hasAppointment) {
      params.set('hasAppointment', '1');
      if (deposit.appointmentDate) params.set('appointment_date', deposit.appointmentDate);
      if (deposit.appointmentStartTime) params.set('appointment_start_time', deposit.appointmentStartTime);
      if (deposit.appointmentEndTime) params.set('appointment_end_time', deposit.appointmentEndTime);
      params.set('appointment_type', 'sales');
      params.set('appointment_option', 'once');

      if (deposit.consultant) params.set('advisor_id', deposit.consultant);
      if (deposit.doctor) params.set('doctor_id', deposit.doctor);
      if (deposit.assistant) params.set('doctor_assistant_id[]', deposit.assistant);
      if (deposit.room) params.set('examination_room_id', deposit.room);
      if (deposit.appointmentChannel) params.set('source', deposit.appointmentChannel);
      if (deposit.appointmentTo) params.set('appointment_to', deposit.appointmentTo);
      if (deposit.appointmentNote) params.set('appointment_note', deposit.appointmentNote);
    } else {
      params.set('hasAppointment', '0');
    }

    // Step 3: POST form
    const formAction = `${base}/admin/deposit`;
    const submitRes = await session.fetch(formAction, {
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
      // Try to extract deposit ID from redirect URL (e.g. /admin/deposit/123/deposit)
      let depIdMatch = location.match(/\/deposit\/(\d+)/);
      let depositProClinicId = depIdMatch ? depIdMatch[1] : null;

      // If redirect URL doesn't contain deposit ID, follow redirect and search by HN
      if (!depositProClinicId && proClinicHN) {
        try {
          const redirectUrl = location.startsWith('http') ? location : `${base}${location}`;
          const listHtml = await session.fetchText(redirectUrl);
          const $l = cheerio.load(listHtml);
          // Find deposit entry for this customer — first match is most recent
          $l('a[href*="/admin/deposit/"]').each((_, el) => {
            if (depositProClinicId) return;
            const href = $l(el).attr('href') || '';
            const m = href.match(/\/admin\/deposit\/(\d+)\/deposit/);
            if (!m) return;
            const row = $l(el).closest('tr, .card, .deposit-row, div.row, div[class*="deposit"]');
            if (!row.length) return;
            if (row.text().includes(proClinicHN)) {
              depositProClinicId = m[1];
            }
            const custLink = row.find(`a[href*="/customer/${proClinicId}"]`);
            if (custLink.length) {
              depositProClinicId = m[1];
            }
          });
        } catch { /* best effort */ }
      }

      return res.status(200).json({ success: true, redirectTo: location, depositProClinicId });
    }

    // Read response body for error checking
    const bodyHtml = await submitRes.text();

    // Check for validation errors
    const errors = extractValidationErrors(bodyHtml);
    if (errors) {
      return res.status(200).json({ success: false, error: `ProClinic validation: ${errors}` });
    }

    // Status 200 — check for success or failure
    if (status === 200) {
      if (bodyHtml.includes('สำเร็จ') || bodyHtml.includes('success')) {
        return res.status(200).json({ success: true });
      }
    }

    // Unexpected status
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
    return res.status(200).json(resp);
  }
}
