// ─── TEMPORARY DEBUG: Deposit Form Analysis ─────────────────────────────────
// Shows exactly what the deposit form expects vs what we send
// DELETE THIS FILE after debugging is complete
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF } from './_lib/scraper.js';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { proClinicId, deposit, testSubmit } = req.body || {};
    const session = await createSession();
    const base = session.origin;

    // Step 1: GET /admin/deposit
    const html = await session.fetchText(`${base}/admin/deposit`);
    const $ = cheerio.load(html);
    const csrf = extractCSRF(html);

    // Find the modal form
    const modalForm = $('#createDepositModal form');
    const formAction = modalForm.attr('action') || 'NOT FOUND';
    const formMethod = modalForm.attr('method') || 'NOT FOUND';
    const formEnctype = modalForm.attr('enctype') || 'NOT FOUND';

    // Extract ALL fields from the modal
    const fields = [];
    const selector = modalForm.length
      ? '#createDepositModal input, #createDepositModal textarea, #createDepositModal select'
      : 'form input, form textarea, form select';

    $(selector).each((_, el) => {
      const name = $(el).attr('name');
      if (!name) return;
      const tag = el.tagName.toLowerCase();
      const type = $(el).attr('type') || tag;
      const val = $(el).val() || '';
      const required = $(el).attr('required') !== undefined;
      const checked = $(el).is(':checked');
      fields.push({ name, type, value: String(val).substring(0, 50), required, checked });
    });

    const result = {
      success: true,
      modalFound: modalForm.length > 0,
      formAction,
      formMethod,
      formEnctype,
      csrfFound: !!csrf,
      totalFields: fields.length,
      fields,
    };

    // If testSubmit flag is set and we have proClinicId, do a test POST
    if (testSubmit && proClinicId) {
      const params = new URLSearchParams();
      params.set('_token', csrf);

      // Set ALL defaults first
      for (const f of fields) {
        if (f.name === '_token') continue;
        if (f.type === 'checkbox' && !f.checked) continue;
        if (f.type === 'radio' && !f.checked) continue;
        params.set(f.name, f.value);
      }

      // Override with our deposit data
      params.set('customer_option', '2');
      params.set('customer_id', proClinicId);
      params.set('firstname', '');
      params.set('lastname', '');
      params.set('nickname', '');
      params.set('telephone_number', '');

      if (deposit) {
        if (deposit.paymentChannel) params.set('payment_method', deposit.paymentChannel);
        if (deposit.paymentAmount != null) params.set('deposit', String(deposit.paymentAmount));
        if (deposit.depositDate) params.set('payment_date', deposit.depositDate);
        if (deposit.depositTime) params.set('payment_time', deposit.depositTime);
        if (deposit.salesperson) {
          params.set('hasSeller1', 'on');
          params.set('seller_1_id', deposit.salesperson);
          params.set('sale_percent_1', '100');
          params.set('sale_total_1', String(deposit.paymentAmount || '0'));
        }
        params.set('hasAppointment', deposit.hasAppointment ? '1' : '0');
      }

      // Determine POST URL
      let postUrl = formAction;
      if (postUrl && !postUrl.startsWith('http')) {
        postUrl = postUrl.startsWith('/') ? `${base}${postUrl}` : `${base}/${postUrl}`;
      }
      if (!postUrl || postUrl === 'NOT FOUND') postUrl = `${base}/admin/deposit`;

      const sentKeys = [...params.keys()];

      const submitRes = await session.fetch(postUrl, {
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
      const bodyText = await submitRes.text();

      // Try to extract error details from response
      const $resp = cheerio.load(bodyText);
      const exceptionMsg = $resp('.exception-message, .exception_message').text().trim();
      const exceptionClass = $resp('.exception_title, .exception-class').text().trim();
      const h1Text = $resp('h1').first().text().trim();
      const traceFirst = $resp('.trace-details, .trace-code, pre').first().text().trim().substring(0, 300);

      // Extract validation errors
      const validationErrors = [];
      $resp('.invalid-feedback, .alert-danger li, .text-danger').each((_, el) => {
        const t = $resp(el).text().trim();
        if (t) validationErrors.push(t.substring(0, 100));
      });

      result.testSubmit = {
        postUrl,
        sentParamCount: sentKeys.length,
        sentKeys,
        responseStatus: status,
        responseLocation: location,
        exceptionClass,
        exceptionMsg,
        h1Text,
        traceFirst,
        validationErrors,
        bodySnippet: bodyText.substring(0, 2000),
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
