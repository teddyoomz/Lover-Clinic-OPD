// ─── Update Deposit in ProClinic ──────────────────────────────────────────────
// 1. Find deposit entry (by saved depositProClinicId or search by HN)
// 2. GET deposit list page for CSRF + default form fields (same as create)
// 3. Try edit page variants to get current values
// 4. POST update with _method=PUT
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

    // Also get CSRF from deposit list page (always needed)
    const searchQuery = proClinicHN || '';
    const listUrl = searchQuery
      ? `${base}/admin/deposit?q=${encodeURIComponent(searchQuery)}`
      : `${base}/admin/deposit`;

    const listHtml = await session.fetchText(listUrl);
    const $list = cheerio.load(listHtml);
    const csrf = extractCSRF(listHtml);
    if (!csrf) throw new Error('ไม่พบ CSRF token');

    if (!depositId && (proClinicId || proClinicHN)) {
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

    // Step 2: Try to get the edit form — try multiple URL patterns
    let editHtml = null;
    let editCsrf = null;
    let formAction = null;
    const defaultFields = {};

    const editUrls = [
      `${base}/admin/deposit/${depositId}/edit`,
      `${base}/admin/deposit/${depositId}/deposit/edit`,
      `${base}/admin/deposit/${depositId}/deposit`,
    ];

    for (const url of editUrls) {
      try {
        const html = await session.fetchText(url);
        const token = extractCSRF(html);
        if (token) {
          editHtml = html;
          editCsrf = token;
          const $ = cheerio.load(html);
          const form = $('form').first();
          formAction = form.attr('action') || '';

          // Extract form fields from the edit page
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

          // If we found form fields, this is the right page
          if (Object.keys(defaultFields).length > 3) break;
        }
      } catch { /* try next URL */ }
    }

    // Fallback: use CSRF from list page and default fields from create modal
    const finalCsrf = editCsrf || csrf;

    if (Object.keys(defaultFields).length <= 3) {
      // No edit form found — extract defaults from the create modal on list page
      const modalSelector = $list('#createDepositModal').length
        ? '#createDepositModal input, #createDepositModal textarea, #createDepositModal select'
        : 'form input, form textarea, form select';

      $list(modalSelector).each((_, el) => {
        const name = $list(el).attr('name');
        if (!name || name === '_token') return;
        const tag = el.tagName.toLowerCase();
        if (tag === 'select') {
          defaultFields[name] = $list(el).find('option:selected').val() || '';
        } else if (tag === 'input' && $list(el).attr('type') === 'checkbox') {
          if ($list(el).is(':checked')) defaultFields[name] = $list(el).val() || '1';
        } else if (tag === 'input' && $list(el).attr('type') === 'radio') {
          if ($list(el).is(':checked')) defaultFields[name] = $list(el).val();
        } else {
          defaultFields[name] = $list(el).val() || '';
        }
      });
    }

    // Resolve form action URL
    if (formAction && !formAction.startsWith('http')) {
      formAction = formAction.startsWith('/') ? `${base}${formAction}` : `${base}/${formAction}`;
    }
    if (!formAction) formAction = `${base}/admin/deposit/${depositId}`;

    // Step 3: Build form data with overrides
    const params = new URLSearchParams();
    params.set('_token', finalCsrf);
    params.set('_method', 'PUT');

    // Set all defaults first
    for (const [key, val] of Object.entries(defaultFields)) {
      if (key !== '_token' && key !== '_method') {
        params.set(key, val);
      }
    }

    // Select existing customer
    params.set('customer_option', 'choose');
    if (proClinicId) params.set('customer_id', proClinicId);

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

    // Step 4: POST update — try PUT first, then PATCH
    const submitRes = await session.fetch(formAction, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': finalCsrf,
        'Referer': `${base}/admin/deposit`,
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

    // If PUT to /deposit/{id} returned 405/404, try DELETE old + CREATE new
    if (status === 404 || status === 405) {
      // Fallback: delete old deposit and create new one
      // Delete old
      const delRes = await session.fetch(`${base}/admin/deposit/${depositId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': finalCsrf,
        },
        body: `_method=DELETE&_token=${encodeURIComponent(finalCsrf)}`,
        redirect: 'manual',
      });

      if (delRes.status < 200 || delRes.status >= 400) {
        return res.status(200).json({
          success: false,
          error: `ไม่สามารถลบมัดจำเดิมได้ (status ${delRes.status}) — ลองลบมือจาก ProClinic`,
        });
      }

      // Re-fetch CSRF (delete may have invalidated it)
      const freshHtml = await session.fetchText(`${base}/admin/deposit`);
      const freshCsrf = extractCSRF(freshHtml);
      if (!freshCsrf) throw new Error('ไม่พบ CSRF token หลังลบมัดจำเดิม');

      // Create new deposit with updated data
      const createParams = new URLSearchParams();
      createParams.set('_token', freshCsrf);

      // Re-extract defaults from fresh page
      const $fresh = cheerio.load(freshHtml);
      const freshSelector = $fresh('#createDepositModal').length
        ? '#createDepositModal input, #createDepositModal textarea, #createDepositModal select'
        : 'form input, form textarea, form select';

      $fresh(freshSelector).each((_, el) => {
        const name = $fresh(el).attr('name');
        if (!name || name === '_token') return;
        const tag = el.tagName.toLowerCase();
        if (tag === 'select') {
          createParams.set(name, $fresh(el).find('option:selected').val() || '');
        } else if (tag === 'input' && $fresh(el).attr('type') === 'checkbox') {
          if ($fresh(el).is(':checked')) createParams.set(name, $fresh(el).val() || '1');
        } else if (tag === 'input' && $fresh(el).attr('type') === 'radio') {
          if ($fresh(el).is(':checked')) createParams.set(name, $fresh(el).val());
        } else {
          createParams.set(name, $fresh(el).val() || '');
        }
      });

      // Set deposit data
      createParams.set('customer_option', 'choose');
      if (proClinicId) createParams.set('customer_id', proClinicId);
      if (deposit.paymentChannel) createParams.set('payment_method', deposit.paymentChannel);
      if (deposit.paymentAmount != null) createParams.set('deposit', String(deposit.paymentAmount));
      if (deposit.depositDate) createParams.set('payment_date', deposit.depositDate);
      if (deposit.depositTime) createParams.set('payment_time', deposit.depositTime);
      if (deposit.refNo) createParams.set('ref_no', deposit.refNo);
      if (deposit.depositNote) createParams.set('deposit_note', deposit.depositNote);
      if (deposit.salesperson) {
        createParams.set('hasSeller1', '1');
        createParams.set('seller_1_id', deposit.salesperson);
        createParams.set('sale_percent_1', '100');
        createParams.set('sale_total_1', String(deposit.paymentAmount || '0'));
      }
      if (deposit.customerSource) createParams.set('customer_source', deposit.customerSource);
      if (deposit.sourceDetail) createParams.set('source_detail', deposit.sourceDetail);
      if (deposit.hasAppointment) {
        createParams.set('hasAppointment', '1');
        if (deposit.appointmentDate) createParams.set('appointment_date', deposit.appointmentDate);
        if (deposit.appointmentStartTime) createParams.set('appointment_start_time', deposit.appointmentStartTime);
        if (deposit.appointmentEndTime) createParams.set('appointment_end_time', deposit.appointmentEndTime);
        createParams.set('appointment_type', 'sales');
        createParams.set('appointment_option', 'once');
        if (deposit.consultant) createParams.set('advisor_id', deposit.consultant);
        if (deposit.doctor) createParams.set('doctor_id', deposit.doctor);
        if (deposit.assistant) createParams.set('doctor_assistant_id[]', deposit.assistant);
        if (deposit.room) createParams.set('examination_room_id', deposit.room);
        if (deposit.appointmentChannel) createParams.set('source', deposit.appointmentChannel);
        if (deposit.appointmentTo) createParams.set('appointment_to', deposit.appointmentTo);
        if (deposit.appointmentNote) createParams.set('appointment_note', deposit.appointmentNote);
      } else {
        createParams.set('hasAppointment', '0');
      }

      const createRes = await session.fetch(`${base}/admin/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': freshCsrf,
          'Referer': `${base}/admin/deposit`,
        },
        body: createParams.toString(),
        redirect: 'manual',
      });

      const createStatus = createRes.status;
      const createLocation = createRes.headers?.get?.('location') || '';

      if (createStatus >= 300 && createStatus < 400) {
        const newDepIdMatch = createLocation.match(/\/deposit\/(\d+)/);
        const newDepositId = newDepIdMatch ? newDepIdMatch[1] : null;
        return res.status(200).json({
          success: true,
          depositId: newDepositId || depositId,
          method: 'delete+create',
          redirectTo: createLocation,
        });
      }

      const createBody = await createRes.text();
      const createErrors = extractValidationErrors(createBody);
      return res.status(200).json({
        success: false,
        error: createErrors
          ? `สร้างมัดจำใหม่ไม่สำเร็จ: ${createErrors}`
          : `สร้างมัดจำใหม่ไม่สำเร็จ (status ${createStatus})`,
      });
    }

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
