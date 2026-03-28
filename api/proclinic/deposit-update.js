// ─── Update Deposit in ProClinic ──────────────────────────────────────────────
// 1. Find deposit entry (by saved depositProClinicId or search by HN)
// 2. GET edit form at /admin/deposit/{id}/edit
// 3. Extract defaults + CSRF, override with new deposit data
// 4. POST the edit form
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractValidationErrors } from './_lib/scraper.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { proClinicId, proClinicHN, depositProClinicId, deposit } = req.body || {};
    if (!deposit) {
      return res.status(400).json({ success: false, error: 'Missing deposit data' });
    }

    const session = await createSession();
    const base = session.origin;

    // Step 1: Find the deposit ID
    let depositId = depositProClinicId || null;

    if (!depositId && (proClinicId || proClinicHN)) {
      // Search deposit list page for entry matching this customer
      const searchQuery = proClinicHN || '';
      const listUrl = searchQuery
        ? `${base}/admin/deposit?q=${encodeURIComponent(searchQuery)}`
        : `${base}/admin/deposit`;

      const listHtml = await session.fetchText(listUrl);
      const $list = cheerio.load(listHtml);

      // Strategy 1: Find by row containing HN or customer link
      $list('a[href*="/admin/deposit/"]').each((_, el) => {
        if (depositId) return;
        const href = $list(el).attr('href') || '';
        const m = href.match(/\/admin\/deposit\/(\d+)\/deposit/);
        if (!m) return;

        const row = $list(el).closest('tr, .card, .deposit-row, div.row, div[class*="deposit"]');
        if (!row.length) return;
        const rowText = row.text();

        if (proClinicHN && rowText.includes(proClinicHN)) {
          depositId = m[1];
        }
        const customerLink = row.find(`a[href*="/customer/${proClinicId}"]`);
        if (customerLink.length) {
          depositId = m[1];
        }
      });

      // Strategy 2: Check detail pages
      if (!depositId) {
        const allDepositIds = new Set();
        $list('a[href]').each((_, el) => {
          const href = $list(el).attr('href') || '';
          const m = href.match(/\/admin\/deposit\/(\d+)\/deposit/);
          if (m) allDepositIds.add(m[1]);
        });

        const idsToCheck = [...allDepositIds].slice(0, 10);
        for (const id of idsToCheck) {
          try {
            const detailHtml = await session.fetchText(`${base}/admin/deposit/${id}/deposit`);
            if ((proClinicId && detailHtml.includes(`/customer/${proClinicId}`)) ||
                (proClinicHN && detailHtml.includes(proClinicHN))) {
              depositId = id;
              break;
            }
          } catch { /* skip */ }
        }
      }
    }

    if (!depositId) {
      return res.status(200).json({
        success: false,
        error: 'ไม่พบรายการมัดจำใน ProClinic — ไม่สามารถแก้ไขได้',
      });
    }

    // Step 2: GET the edit form
    const editUrl = `${base}/admin/deposit/${depositId}/edit`;
    const editHtml = await session.fetchText(editUrl);
    const $ = cheerio.load(editHtml);
    const csrf = extractCSRF(editHtml);
    if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้าแก้ไข deposit');

    // Extract edit form action and defaults
    const form = $('form').first();
    let formAction = form.attr('action') || '';
    if (formAction && !formAction.startsWith('http')) {
      formAction = formAction.startsWith('/') ? `${base}${formAction}` : `${base}/${formAction}`;
    }
    if (!formAction) formAction = `${base}/admin/deposit/${depositId}`;

    // Extract all default form field values
    const defaultFields = {};
    $('form input, form textarea, form select').each((_, el) => {
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

    // Step 3: Build form data with overrides
    const params = new URLSearchParams();
    params.set('_token', csrf);

    // Set _method=PUT for Laravel resource update
    params.set('_method', 'PUT');

    // Set all defaults first
    for (const [key, val] of Object.entries(defaultFields)) {
      if (key !== '_token' && key !== '_method') {
        params.set(key, val);
      }
    }

    // Override with deposit data
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

    // Step 4: POST the edit form
    const submitRes = await session.fetch(formAction, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': csrf,
        'Referer': editUrl,
      },
      body: params.toString(),
      redirect: 'manual',
    });

    const status = submitRes.status;
    const location = submitRes.headers?.get?.('location') || '';

    // Success: redirect (302/303)
    if (status >= 300 && status < 400) {
      return res.status(200).json({ success: true, depositId, redirectTo: location });
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
    return res.status(200).json(resp);
  }
}
