// ─── Deposit API (consolidated) ──────────────────────────────────────────────
// Actions: submit, update, cancel, options
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF, extractValidationErrors } from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';
import * as cheerio from 'cheerio';

// ─── Shared helpers ─────────────────────────────────────────────────────────

function extractAllSelectOptions($, selectName) {
  const options = [];
  $(`select[name="${selectName}"] option`).each((_, opt) => {
    const val = $(opt).val();
    const text = $(opt).text().trim();
    if (val) options.push({ value: val, label: text });
  });
  return options;
}

// ─── Action: options ────────────────────────────────────────────────────────

async function handleOptions(req, res) {
  const session = await createSession();
  const base = session.origin;

  const html = await session.fetchText(`${base}/admin/deposit`);
  const $ = cheerio.load(html);

  // Extract payment methods from script tag
  let paymentMethods = [];
  $('script').each((_, s) => {
    const text = $(s).html() || '';
    const m = text.match(/paymentMethods\s*=\s*(\[.*?\])/);
    if (m) {
      try { paymentMethods = JSON.parse(m[1]); } catch {}
    }
  });

  const options = {
    paymentMethods: paymentMethods.map(v => ({ value: v, label: v })),
    sellers: extractAllSelectOptions($, 'seller_1_id'),
    advisors: extractAllSelectOptions($, 'advisor_id'),
    doctors: extractAllSelectOptions($, 'doctor_id'),
    assistants: extractAllSelectOptions($, 'doctor_assistant_id[]'),
    rooms: extractAllSelectOptions($, 'examination_room_id'),
    appointmentChannels: extractAllSelectOptions($, 'source'),
    appointmentStartTimes: extractAllSelectOptions($, 'appointment_start_time'),
    appointmentEndTimes: extractAllSelectOptions($, 'appointment_end_time'),
    customerSources: extractAllSelectOptions($, 'customer_source'),
  };

  return res.status(200).json({ success: true, options });
}

// ─── Action: submit ─────────────────────────────────────────────────────────

async function handleSubmit(req, res) {
  const { proClinicId, proClinicHN, deposit } = req.body || {};
  if (!proClinicId || !deposit) {
    return res.status(400).json({ success: false, error: 'Missing proClinicId or deposit data' });
  }

  const session = await createSession();
  const base = session.origin;

  // GET /admin/deposit to extract CSRF + ALL default form fields
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

  // Build URLSearchParams
  const params = new URLSearchParams();
  params.set('_token', csrf);

  for (const [key, val] of Object.entries(defaultFields)) {
    if (key !== '_token' && key !== '_method') {
      params.set(key, val);
    }
  }

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

  // POST form
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
    let depIdMatch = location.match(/\/deposit\/(\d+)/);
    let depositProClinicId = depIdMatch ? depIdMatch[1] : null;

    if (!depositProClinicId && proClinicHN) {
      try {
        const redirectUrl = location.startsWith('http') ? location : `${base}${location}`;
        const listHtml = await session.fetchText(redirectUrl);
        const $l = cheerio.load(listHtml);
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

  const bodyHtml = await submitRes.text();
  const errors = extractValidationErrors(bodyHtml);
  if (errors) {
    return res.status(200).json({ success: false, error: `ProClinic validation: ${errors}` });
  }

  if (status === 200) {
    if (bodyHtml.includes('สำเร็จ') || bodyHtml.includes('success')) {
      return res.status(200).json({ success: true });
    }
  }

  const $err = cheerio.load(bodyHtml);
  const laravelMsg = $err('.exception-message, .exception_message, h1').first().text().trim();
  const errorDetail = laravelMsg || bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 300);

  return res.status(200).json({
    success: false,
    error: `ProClinic error (${status}): ${errorDetail || 'Unknown'}`,
  });
}

// ─── Action: update ─────────────────────────────────────────────────────────

async function handleUpdate(req, res) {
  const { proClinicId, proClinicHN, depositProClinicId, deposit } = req.body || {};
  if (!deposit) {
    return res.status(400).json({ success: false, error: 'Missing deposit data' });
  }

  const session = await createSession();
  const base = session.origin;

  // GET deposit list page — find deposit ID + CSRF + current deposit amount
  const searchQuery = proClinicHN || '';
  const listUrl = searchQuery
    ? `${base}/admin/deposit?q=${encodeURIComponent(searchQuery)}`
    : `${base}/admin/deposit`;

  const listHtml = await session.fetchText(listUrl);
  const $list = cheerio.load(listHtml);
  const csrf = extractCSRF(listHtml);
  if (!csrf) throw new Error('ไม่พบ CSRF token');

  let depositId = depositProClinicId || null;
  let oldDeposit = '';

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
        const amountMatch = rowText.match(/(\d[\d,]*\.\d{2})/);
        if (amountMatch) oldDeposit = amountMatch[1].replace(/,/g, '');
      }
    });
  };

  if (!depositId) findDepositInRows();
  if (depositId && !oldDeposit) findDepositInRows();

  if (!depositId) {
    return res.status(200).json({
      success: false,
      error: 'ไม่พบรายการมัดจำใน ProClinic — ไม่สามารถแก้ไขได้',
    });
  }

  if (!oldDeposit) {
    try {
      const detailHtml = await session.fetchText(`${base}/admin/deposit/${depositId}/deposit`);
      const amountMatch = detailHtml.match(/(\d[\d,]*\.\d{2})/);
      if (amountMatch) oldDeposit = amountMatch[1].replace(/,/g, '');
    } catch { /* use deposit amount as fallback */ }
    if (!oldDeposit) oldDeposit = String(deposit.paymentAmount || '0');
  }

  // POST with _method=PUT
  const params = new URLSearchParams();
  params.set('_token', csrf);
  params.set('_method', 'PUT');
  params.set('deposit_id', depositId);
  params.set('old_deposit', oldDeposit);
  if (proClinicId) params.set('customer_id', proClinicId);
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
  if (status >= 300 && status < 400) {
    return res.status(200).json({ success: true, depositId });
  }

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
}

// ─── Action: cancel ─────────────────────────────────────────────────────────

async function handleCancel(req, res) {
  const { proClinicId, proClinicHN } = req.body || {};
  if (!proClinicId) {
    return res.status(400).json({ success: false, error: 'Missing proClinicId' });
  }

  const session = await createSession();
  const base = session.origin;

  // Find deposit entry on list page
  const searchQuery = proClinicHN || '';
  const listUrl = searchQuery
    ? `${base}/admin/deposit?q=${encodeURIComponent(searchQuery)}`
    : `${base}/admin/deposit`;

  const html = await session.fetchText(listUrl);
  const $ = cheerio.load(html);
  const csrf = extractCSRF(html);
  if (!csrf) throw new Error('ไม่พบ CSRF token');

  let depositId = null;

  $('a[href*="/admin/deposit/"]').each((_, el) => {
    if (depositId) return;
    const href = $(el).attr('href') || '';
    const m = href.match(/\/admin\/deposit\/(\d+)/);
    if (!m) return;

    const row = $(el).closest('tr, .card, .deposit-row, div.row, div[class*="deposit"]');
    if (!row.length) return;
    const rowText = row.text();

    if (proClinicHN && rowText.includes(proClinicHN)) depositId = m[1];
    if (row.find(`a[href*="/customer/${proClinicId}"]`).length) depositId = m[1];
  });

  // Fallback: check detail pages
  if (!depositId) {
    const allDepositIds = new Set();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/admin\/deposit\/(\d+)/);
      if (m) allDepositIds.add(m[1]);
    });

    for (const id of [...allDepositIds].slice(0, 10)) {
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

  // Cancel deposit
  if (depositId) {
    const cancelRes = await session.fetch(`${base}/admin/deposit/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': csrf,
        'Referer': `${base}/admin/deposit`,
      },
      body: new URLSearchParams({
        _token: csrf,
        deposit_id: depositId,
        cancel_note: 'ยกเลิกการจองมัดจำ',
      }).toString(),
      redirect: 'manual',
    });

    if (cancelRes.status >= 200 && cancelRes.status < 400) {
      results.depositDeleted = true;
    }
    try { await cancelRes.text(); } catch {}
  }

  // DELETE the customer
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
}

// ─── Router ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { action } = req.body || {};
    if (action === 'options') return await handleOptions(req, res);
    if (action === 'submit') return await handleSubmit(req, res);
    if (action === 'update') return await handleUpdate(req, res);
    if (action === 'cancel') return await handleCancel(req, res);
    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    return res.status(200).json(resp);
  }
}
