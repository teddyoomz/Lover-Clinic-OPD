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

    // Step 1: GET /admin/deposit to extract CSRF + form defaults
    const html = await session.fetchText(`${base}/admin/deposit`);
    const $ = cheerio.load(html);
    const csrf = extractCSRF(html);
    if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า deposit');

    // Step 2: Build form data
    const params = new URLSearchParams();
    params.set('_token', csrf);

    // Select existing customer
    params.set('customer_option', '2'); // เลือกลูกค้าในระบบ
    params.set('customer_id', proClinicId);

    // Payment info
    if (deposit.paymentChannel) params.set('payment_method', deposit.paymentChannel);
    if (deposit.paymentAmount) params.set('deposit', deposit.paymentAmount);
    if (deposit.depositDate) params.set('payment_date', deposit.depositDate);
    if (deposit.depositTime) params.set('payment_time', deposit.depositTime);
    if (deposit.refNo) params.set('ref_no', deposit.refNo);
    if (deposit.depositNote) params.set('deposit_note', deposit.depositNote);

    // Salesperson
    if (deposit.salesperson) {
      params.set('hasSeller1', 'on');
      params.set('seller_1_id', deposit.salesperson);
      params.set('sale_percent_1', '100');
      params.set('sale_total_1', deposit.paymentAmount || '0');
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

    // Step 3: POST form
    const submitRes = await session.fetch(`${base}/admin/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': csrf,
      },
      body: params.toString(),
      redirect: 'manual',
    });

    const status = submitRes.status;

    // Success: redirect (302/303) away from deposit page
    if (status >= 300 && status < 400) {
      return res.status(200).json({ success: true });
    }

    // Check for validation errors in response body
    const bodyHtml = await submitRes.text();
    const errors = extractValidationErrors(bodyHtml);
    if (errors) throw new Error(`ProClinic validation: ${errors}`);

    // If 200 but no redirect, it might still be success (check page)
    if (status === 200) {
      // Check if it contains success indicators
      if (bodyHtml.includes('สำเร็จ') || bodyHtml.includes('success')) {
        return res.status(200).json({ success: true });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    return res.status(200).json(resp);
  }
}
