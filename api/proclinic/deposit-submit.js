// ─── Submit Deposit to ProClinic ─────────────────────────────────────────────
// Two-step: expects customer already created (has proClinicId/HN)
// Fills deposit form on /admin/deposit with customer_option='choose' (existing customer)
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractValidationErrors } from './_lib/scraper.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { proClinicId, deposit } = req.body || {};
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

    // Extract form action URL from the modal
    const modalForm = $('#createDepositModal form');
    let formAction = modalForm.attr('action') || '';
    if (formAction && !formAction.startsWith('http')) {
      formAction = formAction.startsWith('/') ? `${base}${formAction}` : `${base}/${formAction}`;
    }
    if (!formAction) formAction = `${base}/admin/deposit`;

    // Extract all default form fields from the modal
    // ProClinic form has ~61 fields — we must send ALL of them
    const defaultFields = {};
    const checkedCheckboxes = new Set();
    const formSelector = modalForm.length
      ? '#createDepositModal input, #createDepositModal textarea, #createDepositModal select'
      : 'form input, form textarea, form select';

    $(formSelector).each((_, el) => {
      const name = $(el).attr('name');
      if (!name || name === '_token') return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') {
        defaultFields[name] = $(el).find('option:selected').val() || '';
      } else if (tag === 'input' && $(el).attr('type') === 'checkbox') {
        if ($(el).is(':checked')) {
          defaultFields[name] = $(el).val() || '1';
          checkedCheckboxes.add(name);
        }
      } else if (tag === 'input' && $(el).attr('type') === 'radio') {
        if ($(el).is(':checked')) defaultFields[name] = $(el).val();
      } else {
        defaultFields[name] = $(el).val() || '';
      }
    });

    // Step 2: Build multipart/form-data (ProClinic form uses enctype="multipart/form-data")
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    let body = '';

    function addField(name, value) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
      body += `${value}\r\n`;
    }

    // CSRF token
    addField('_token', csrf);

    // Set all default fields first
    for (const [key, val] of Object.entries(defaultFields)) {
      if (key !== '_token' && key !== '_method') {
        addField(key, val);
      }
    }

    // ─── Override with our deposit data ─────────────────────────────────

    // Select existing customer: 'choose' (not '2'!)
    addField('customer_option', 'choose');
    addField('customer_id', proClinicId);

    // Payment info
    if (deposit.paymentChannel) addField('payment_method', deposit.paymentChannel);
    if (deposit.paymentAmount != null) addField('deposit', String(deposit.paymentAmount));
    if (deposit.depositDate) addField('payment_date', deposit.depositDate);
    if (deposit.depositTime) addField('payment_time', deposit.depositTime);
    if (deposit.refNo) addField('ref_no', deposit.refNo);
    if (deposit.depositNote) addField('deposit_note', deposit.depositNote);

    // Salesperson
    if (deposit.salesperson) {
      addField('hasSeller1', '1');
      addField('seller_1_id', deposit.salesperson);
      addField('sale_percent_1', '100');
      addField('sale_total_1', String(deposit.paymentAmount || '0'));
    }

    // Customer source
    if (deposit.customerSource) addField('customer_source', deposit.customerSource);
    if (deposit.sourceDetail) addField('source_detail', deposit.sourceDetail);

    // Appointment
    if (deposit.hasAppointment) {
      addField('hasAppointment', '1');
      if (deposit.appointmentDate) addField('appointment_date', deposit.appointmentDate);
      if (deposit.appointmentStartTime) addField('appointment_start_time', deposit.appointmentStartTime);
      if (deposit.appointmentEndTime) addField('appointment_end_time', deposit.appointmentEndTime);
      addField('appointment_type', 'sales'); // sales appointment
      addField('appointment_option', 'once'); // single occurrence

      if (deposit.consultant) addField('advisor_id', deposit.consultant);
      if (deposit.doctor) addField('doctor_id', deposit.doctor);
      if (deposit.assistant) addField('doctor_assistant_id[]', deposit.assistant);
      if (deposit.room) addField('examination_room_id', deposit.room);
      if (deposit.appointmentChannel) addField('source', deposit.appointmentChannel);
      if (deposit.appointmentTo) addField('appointment_to', deposit.appointmentTo);
      if (deposit.appointmentNote) addField('appointment_note', deposit.appointmentNote);
    } else {
      addField('hasAppointment', '0');
    }

    // Close boundary
    body += `--${boundary}--\r\n`;

    // Step 3: POST form with multipart/form-data
    console.log(`[deposit] POST to ${formAction}, proClinicId=${proClinicId}, defaultFields=${Object.keys(defaultFields).length}`);
    const submitRes = await session.fetch(formAction, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-CSRF-TOKEN': csrf,
        'Accept': 'text/html, application/xhtml+xml, */*',
        'Referer': `${base}/admin/deposit`,
      },
      body,
      redirect: 'manual',
    });

    const status = submitRes.status;
    const location = submitRes.headers?.get?.('location') || '';

    // Success: redirect (302/303) — ProClinic redirects after successful form submission
    if (status >= 300 && status < 400) {
      return res.status(200).json({ success: true, redirectTo: location });
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
      if (bodyHtml.includes('createDepositModal') || bodyHtml.includes('customer_option')) {
        return res.status(200).json({
          success: false,
          error: 'ฟอร์มถูกแสดงซ้ำ — อาจมีข้อมูลไม่ครบหรือไม่ถูกต้อง',
        });
      }
    }

    // Unexpected status — extract error details
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
