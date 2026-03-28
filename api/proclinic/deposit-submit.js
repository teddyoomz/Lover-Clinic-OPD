// ─── Submit Deposit to ProClinic ─────────────────────────────────────────────
// Two-step: expects customer already created (has proClinicId/HN)
// Fills deposit form on /admin/deposit with customer_option=2 (existing customer)
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractFormFields, extractValidationErrors } from './_lib/scraper.js';
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

    // Extract the form action URL and all default fields from the deposit modal
    const $ = cheerio.load(html);

    // Find the form inside the deposit modal
    const modalForm = $('#createDepositModal form');
    let formAction = modalForm.attr('action') || '';
    // If relative URL, make it absolute
    if (formAction && !formAction.startsWith('http')) {
      formAction = formAction.startsWith('/') ? `${base}${formAction}` : `${base}/${formAction}`;
    }
    // Fallback: POST to /admin/deposit
    if (!formAction) formAction = `${base}/admin/deposit`;

    const formMethod = (modalForm.attr('method') || 'POST').toUpperCase();

    const defaultFields = {};
    const formSelector = modalForm.length
      ? '#createDepositModal form input, #createDepositModal form textarea, #createDepositModal form select'
      : 'form input, form textarea, form select';

    $(formSelector).each((_, el) => {
      const name = $(el).attr('name');
      if (!name || name === '_token') return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'select') {
        defaultFields[name] = $(el).find('option:selected').val() || '';
      } else if (tag === 'input' && $(el).attr('type') === 'checkbox') {
        // Don't include unchecked checkboxes by default
      } else if (tag === 'input' && $(el).attr('type') === 'radio') {
        if ($(el).is(':checked')) defaultFields[name] = $(el).val();
      } else {
        defaultFields[name] = $(el).val() || '';
      }
    });

    // Step 2: Build form data — start with defaults, override with our data
    const params = new URLSearchParams();
    params.set('_token', csrf);

    // Set all default fields first
    for (const [key, val] of Object.entries(defaultFields)) {
      if (key !== '_token' && key !== '_method') {
        params.set(key, val);
      }
    }

    // Select existing customer (override customer_option)
    params.set('customer_option', '2'); // เลือกลูกค้าในระบบ
    params.set('customer_id', proClinicId);

    // Clear new-customer fields (not needed when customer_option=2)
    params.set('firstname', '');
    params.set('lastname', '');
    params.set('nickname', '');
    params.set('telephone_number', '');

    // Payment info
    if (deposit.paymentChannel) params.set('payment_method', deposit.paymentChannel);
    if (deposit.paymentAmount != null) params.set('deposit', String(deposit.paymentAmount));
    if (deposit.depositDate) params.set('payment_date', deposit.depositDate);
    if (deposit.depositTime) params.set('payment_time', deposit.depositTime);
    if (deposit.refNo) params.set('ref_no', deposit.refNo);
    if (deposit.depositNote) params.set('deposit_note', deposit.depositNote);

    // Salesperson
    if (deposit.salesperson) {
      params.set('hasSeller1', 'on');
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
      params.set('appointment_type', '1'); // single appointment
      params.set('appointment_option', '1'); // single occurrence

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

    // Step 3: POST form to the extracted action URL
    console.log(`[deposit] POST to ${formAction} with ${[...params.keys()].length} params, defaultFields=${Object.keys(defaultFields).length}`);
    const submitRes = await session.fetch(formAction, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': csrf,
      },
      body: params.toString(),
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

    // Status 200 without redirect — likely an error or the form re-rendered
    if (status === 200) {
      // Check for success indicators
      if (bodyHtml.includes('สำเร็จ') || bodyHtml.includes('success')) {
        return res.status(200).json({ success: true });
      }
      // Form re-rendered = submission failed silently
      if (bodyHtml.includes('createDepositModal') || bodyHtml.includes('customer_option')) {
        return res.status(200).json({
          success: false,
          error: 'ฟอร์มถูกแสดงซ้ำ — อาจมีข้อมูลไม่ครบหรือไม่ถูกต้อง',
          debug: {
            status,
            formAction,
            fieldsCount: Object.keys(defaultFields).length,
            sentParams: [...params.keys()].length,
            defaultFieldNames: Object.keys(defaultFields),
          },
        });
      }
    }

    // Unexpected status
    return res.status(200).json({
      success: false,
      error: `Unexpected response: status=${status}`,
      debug: { status, location, formAction, bodySnippet: bodyHtml.substring(0, 500) },
    });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    return res.status(200).json(resp);
  }
}
