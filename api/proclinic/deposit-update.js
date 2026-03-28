// ─── Update Deposit in ProClinic ──────────────────────────────────────────────
// 1. Find deposit entry on list page (by saved ID or search by HN)
// 2. Extract the edit link (pencil icon) from that row
// 3. GET the edit page → extract form fields + CSRF
// 4. POST the edit form with updated data
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

    // Step 1: GET deposit list page — find the deposit row and its edit link
    const searchQuery = proClinicHN || '';
    const listUrl = searchQuery
      ? `${base}/admin/deposit?q=${encodeURIComponent(searchQuery)}`
      : `${base}/admin/deposit`;

    const listHtml = await session.fetchText(listUrl);
    const $list = cheerio.load(listHtml);

    let depositId = depositProClinicId || null;
    let editHref = null;

    // Find the deposit row and extract edit link + deposit ID
    const findInRow = (row) => {
      // Look for edit link (pencil icon) — usually <a> with "edit" in href
      const editLink = row.find('a[href*="edit"]');
      if (editLink.length) {
        editHref = editLink.attr('href') || '';
      }
      // Also extract deposit ID from any deposit link in the row
      if (!depositId) {
        row.find('a[href]').each((_, a) => {
          const href = $list(a).attr('href') || '';
          const m = href.match(/\/admin\/deposit\/(\d+)/);
          if (m) depositId = m[1];
        });
      }
    };

    if (depositId) {
      // We have the ID — find the row containing a link to this deposit
      $list(`a[href*="/admin/deposit/${depositId}"]`).each((_, el) => {
        if (editHref) return;
        const row = $list(el).closest('tr, .card, .deposit-row, div.row, div[class*="deposit"]');
        if (row.length) findInRow(row);
      });
    }

    if (!editHref && (proClinicId || proClinicHN)) {
      // Search by HN or customer link
      $list('a[href*="/admin/deposit/"]').each((_, el) => {
        if (editHref) return;
        const href = $list(el).attr('href') || '';
        const m = href.match(/\/admin\/deposit\/(\d+)/);
        if (!m) return;

        const row = $list(el).closest('tr, .card, .deposit-row, div.row, div[class*="deposit"]');
        if (!row.length) return;
        const rowText = row.text();

        let matched = false;
        if (proClinicHN && rowText.includes(proClinicHN)) matched = true;
        if (proClinicId && row.find(`a[href*="/customer/${proClinicId}"]`).length) matched = true;

        if (matched) {
          depositId = m[1];
          findInRow(row);
        }
      });
    }

    // If no edit link found from row, construct possible edit URLs
    if (!editHref && depositId) {
      // Try common Laravel edit URL patterns
      const tryUrls = [
        `/admin/deposit/${depositId}/edit`,
        `/admin/deposit/${depositId}/deposit/edit`,
      ];
      for (const path of tryUrls) {
        try {
          const testRes = await session.fetch(`${base}${path}`, { redirect: 'manual' });
          if (testRes.status === 200) {
            editHref = path;
            break;
          }
          try { await testRes.text(); } catch {}
        } catch { /* try next */ }
      }
    }

    if (!depositId && !editHref) {
      return res.status(200).json({
        success: false,
        error: 'ไม่พบรายการมัดจำใน ProClinic — ไม่สามารถแก้ไขได้',
      });
    }

    // Step 2: GET the edit page
    let editUrl = editHref || '';
    if (editUrl && !editUrl.startsWith('http')) {
      editUrl = editUrl.startsWith('/') ? `${base}${editUrl}` : `${base}/${editUrl}`;
    }

    if (!editUrl) {
      return res.status(200).json({
        success: false,
        error: 'ไม่พบลิงก์แก้ไขมัดจำในหน้า ProClinic',
      });
    }

    const editPageHtml = await session.fetchText(editUrl);
    const $ = cheerio.load(editPageHtml);
    const csrf = extractCSRF(editPageHtml);
    if (!csrf) {
      return res.status(200).json({
        success: false,
        error: `ไม่พบ CSRF token ในหน้าแก้ไข (${editUrl})`,
      });
    }

    // Extract form action and current field values
    const form = $('form').first();
    let formAction = form.attr('action') || '';
    if (formAction && !formAction.startsWith('http')) {
      formAction = formAction.startsWith('/') ? `${base}${formAction}` : `${base}/${formAction}`;
    }
    if (!formAction) {
      return res.status(200).json({
        success: false,
        error: 'ไม่พบ form action ในหน้าแก้ไข',
      });
    }

    // Check if form has _method hidden field (PUT/PATCH)
    const formMethod = $('form input[name="_method"]').val() || 'PUT';

    // Extract all current form field values
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

    // Step 3: Build form data — start with current values, override with changes
    const params = new URLSearchParams();
    params.set('_token', csrf);
    params.set('_method', formMethod);

    for (const [key, val] of Object.entries(defaultFields)) {
      if (key !== '_token' && key !== '_method') {
        params.set(key, val);
      }
    }

    // Override with our deposit data
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
      debug: { editUrl, formAction, formMethod, fieldCount: Object.keys(defaultFields).length },
    });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    return res.status(200).json(resp);
  }
}
