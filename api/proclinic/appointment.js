// ─── Appointment API ─────────────────────────────────────────────────────────
// Actions: create, update, delete
import { createSession, getSession, handleCors } from './_lib/session.js';
import { extractCSRF } from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';
import * as cheerio from 'cheerio';

// ─── Action: create ─────────────────────────────────────────────────────────

async function handleCreate(req, res) {
  const { appointment } = req.body || {};
  if (!appointment) {
    return res.status(400).json({ success: false, error: 'Missing appointment data' });
  }

  const session = await getSession(req.body);
  const base = session.origin;

  // GET /admin/appointment → extract CSRF
  const html = await session.fetchText(`${base}/admin/appointment`);
  const csrf = extractCSRF(html);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า appointment');

  // Build form data
  const params = new URLSearchParams();
  params.set('_token', csrf);
  params.set('type', '');
  params.set('current_doctor_id', '');
  params.set('appointment_type', appointment.appointmentType || 'sales');
  params.set('appointment_option', 'once');
  // Link to customer — ProClinic uses 'choose' (not 'existed')
  if (appointment.customerId) {
    params.set('customer_option', 'choose');
    params.set('customer_id', String(appointment.customerId));
  } else {
    params.set('customer_option', 'none');
  }

  // Required fields
  params.set('appointment_date', appointment.appointmentDate || '');
  params.set('appointment_start_time', appointment.appointmentStartTime || '');
  params.set('appointment_end_time', appointment.appointmentEndTime || '');

  // Build times (comma-separated start,end)
  if (appointment.appointmentStartTime && appointment.appointmentEndTime) {
    params.set('times', `${appointment.appointmentStartTime},${appointment.appointmentEndTime}`);
  } else {
    params.set('times', '');
  }

  // Optional fields
  if (appointment.advisor) params.set('advisor_id', appointment.advisor);
  if (appointment.doctor) params.set('doctor_id', appointment.doctor);
  if (appointment.assistant) params.set('doctor_assistant_id[]', appointment.assistant);
  if (appointment.room) params.set('examination_room_id', appointment.room);
  if (appointment.source) params.set('source', appointment.source);
  if (appointment.appointmentTo) params.set('appointment_to', appointment.appointmentTo);
  if (appointment.appointmentNote) params.set('appointment_note', appointment.appointmentNote);

  // Fields we explicitly skip
  params.set('appointment_location', '');
  params.set('expected_sales', '');
  params.set('preparation', '');
  params.set('customer_note', '');
  params.set('appointment_color', '');
  // line_notify: don't send = don't notify

  // POST /admin/appointment
  const submitRes = await session.fetch(`${base}/admin/appointment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
      'Referer': `${base}/admin/appointment`,
    },
    body: params.toString(),
    redirect: 'manual',
  });

  const status = submitRes.status;
  const location = submitRes.headers?.get?.('location') || '';
  console.log(`[appointment] create — status=${status}, location=${location}`);

  // Success: redirect (302/303) — but follow redirect to check if it's actually successful
  if (status >= 300 && status < 400) {
    // If redirect goes to /login, session expired
    if (location.includes('/login')) throw new Error('Session หมดอายุ — กรุณาลองใหม่');
    console.log(`[appointment] create — redirect OK to: ${location}`);
    // Find appointment ID from API: GET appointments for that date, match by time+doctor
    let appointmentProClinicId = null;
    try {
      const date = appointment.appointmentDate;
      const apiData = await session.fetchJSON(`${base}/admin/api/appointment?date=${date}`);
      const events = apiData.appointment || Object.values(apiData).filter(v => v && typeof v === 'object' && v.id);
      for (const event of events) {
        const p = event.extendedProps || {};
        const startTime = p.appointment_start_time || event.start?.substring(11, 16) || '';
        const endTime = p.appointment_end_time || event.end?.substring(11, 16) || '';
        if (startTime === appointment.appointmentStartTime && endTime === appointment.appointmentEndTime) {
          // Additional match: doctor if specified
          if (appointment.doctor) {
            if (String(p.doctor_id) === String(appointment.doctor)) {
              appointmentProClinicId = String(p.id || event.id);
              break;
            }
          } else {
            appointmentProClinicId = String(p.id || event.id);
            break;
          }
        }
      }
    } catch { /* best effort */ }

    return res.status(200).json({ success: true, appointmentProClinicId });
  }

  // Non-redirect: follow and inspect
  let bodyHtml = '';
  try { bodyHtml = await submitRes.text(); } catch {}

  // Status 200 might be a success page with a flash message
  if (status === 200 && (bodyHtml.includes('สำเร็จ') || bodyHtml.includes('success'))) {
    return res.status(200).json({ success: true, appointmentProClinicId: null });
  }

  const $ = cheerio.load(bodyHtml);
  const laravelMsg = $('.exception-message, .exception_message, h1').first().text().trim();
  const errorDetail = laravelMsg || bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 500);

  throw new Error(`สร้างนัดหมายไม่สำเร็จ (${status}): ${errorDetail || 'Unknown'}`);
}

// ─── Action: update ─────────────────────────────────────────────────────────

async function handleUpdate(req, res) {
  const { appointmentId, appointment } = req.body || {};
  if (!appointmentId || !appointment) {
    return res.status(400).json({ success: false, error: 'Missing appointmentId or appointment data' });
  }

  const session = await getSession(req.body);
  const base = session.origin;

  // 1. GET /admin/appointment for CSRF token
  const html = await session.fetchText(`${base}/admin/appointment`);
  const csrf = extractCSRF(html);
  if (!csrf) throw new Error('ไม่พบ CSRF token');

  // 2. GET existing appointment data from API to preserve customer_id etc.
  let existingData = {};
  if (appointment.appointmentDate) {
    try {
      const apiData = await session.fetchJSON(`${base}/admin/api/appointment?date=${appointment.appointmentDate}`);
      const events = Array.isArray(apiData) ? apiData : apiData.appointment || Object.values(apiData).filter(v => v && typeof v === 'object' && v.id);
      const match = events.find(ev => String((ev.extendedProps || {}).id || ev.id) === String(appointmentId));
      if (match) existingData = match.extendedProps || {};
    } catch {}
  }
  // If not found by new date, try original date from existing data
  if (!existingData.id) {
    try {
      // Scan today ± 365 days to find the appointment's original date
      const dates = [];
      const today = new Date();
      for (let i = -30; i < 365; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        dates.push(d.toISOString().substring(0, 10));
      }
      // Check in batches of 30
      outer: for (let i = 0; i < dates.length; i += 30) {
        const batch = dates.slice(i, i + 30);
        const results = await Promise.all(batch.map(async date => {
          try {
            const data = await session.fetchJSON(`${base}/admin/api/appointment?date=${date}`);
            const events = Array.isArray(data) ? data : data.appointment || Object.values(data).filter(v => v && typeof v === 'object' && v.id);
            return events.find(ev => String((ev.extendedProps || {}).id || ev.id) === String(appointmentId));
          } catch { return null; }
        }));
        const found = results.find(r => r);
        if (found) { existingData = found.extendedProps || {}; break outer; }
      }
    } catch {}
  }

  // 3. Build form — preserve existing fields, override with changes
  const params = new URLSearchParams();
  params.set('_token', csrf);
  params.set('_method', 'PUT');
  params.set('is_basic_flow', 'true');
  params.set('type', '');
  params.set('current_doctor_id', existingData.doctor_id || '');
  params.set('appointment_type', existingData.appointment_type || 'sales');
  params.set('appointment_option', 'once');

  // Do NOT send customer_option on update — ProClinic trial breaks with 'existed'
  // and 'none' removes the customer link. Omitting lets ProClinic keep existing customer.

  // Fields: use new values if provided, else keep existing
  params.set('appointment_date', appointment.appointmentDate || existingData.appointment_date || '');
  params.set('appointment_start_time', appointment.appointmentStartTime || existingData.appointment_start_time || '');
  params.set('appointment_end_time', appointment.appointmentEndTime || existingData.appointment_end_time || '');
  const st = appointment.appointmentStartTime || existingData.appointment_start_time || '';
  const et = appointment.appointmentEndTime || existingData.appointment_end_time || '';
  params.set('times', st && et ? `${st},${et}` : '');

  params.set('advisor_id', appointment.advisor || existingData.advisor_id || '');
  params.set('doctor_id', appointment.doctor || existingData.doctor_id || '');
  params.set('examination_room_id', appointment.room || existingData.examination_room_id || '');
  params.set('source', appointment.source || existingData.source || 'walk-in');
  params.set('appointment_to', appointment.appointmentTo || existingData.appointment_to || '');
  params.set('appointment_note', appointment.appointmentNote != null ? appointment.appointmentNote : (existingData.note || ''));

  params.set('appointment_location', '');
  params.set('expected_sales', '');
  params.set('preparation', '');
  params.set('customer_note', '');
  params.set('appointment_color', existingData.appointment_color || '');

  // Include appointment_id in body (ProClinic routes update via same URL as create)
  params.set('appointment_id', appointmentId);

  // 4. POST /admin/appointment (same URL as create, _method=PUT differentiates)
  const submitRes = await session.fetch(`${base}/admin/appointment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
      'Referer': `${base}/admin/appointment`,
    },
    body: params.toString(),
    redirect: 'manual',
  });

  const status = submitRes.status;
  const location = submitRes.headers?.get('location') || '';

  // 302 redirect = success (Laravel redirects after successful update)
  if (status >= 300 && status < 400) {
    return res.status(200).json({ success: true, _debug: { status, location } });
  }

  if (status === 200) {
    let bodyHtml = '';
    try { bodyHtml = await submitRes.text(); } catch {}
    if (bodyHtml.includes('สำเร็จ') || bodyHtml.includes('success')) {
      return res.status(200).json({ success: true });
    }
  }

  let bodyHtml = '';
  try { bodyHtml = await submitRes.text(); } catch {}
  const snippet = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 300);
  throw new Error(`แก้ไขนัดหมายไม่สำเร็จ (${status}): ${snippet}`);
}

// ─── Action: delete ─────────────────────────────────────────────────────────

async function handleDelete(req, res) {
  const { appointmentId } = req.body || {};
  if (!appointmentId) {
    return res.status(400).json({ success: false, error: 'Missing appointmentId' });
  }

  const session = await getSession(req.body);
  const base = session.origin;

  // GET /admin/appointment → extract CSRF
  const html = await session.fetchText(`${base}/admin/appointment`);
  const csrf = extractCSRF(html);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า appointment');

  // POST /admin/appointment/{id} with _method=delete
  const deleteRes = await session.fetch(`${base}/admin/appointment/${appointmentId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
      'Referer': `${base}/admin/appointment`,
    },
    body: new URLSearchParams({
      _token: csrf,
      _method: 'delete',
    }).toString(),
    redirect: 'manual',
  });

  if (deleteRes.status >= 200 && deleteRes.status < 400) {
    return res.status(200).json({ success: true });
  }

  throw new Error(`ลบนัดหมายไม่สำเร็จ (status ${deleteRes.status})`);
}

// ─── Action: listByCustomer — Get all appointments for a specific customer ──

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;

function mapAppointment(event) {
  const p = event.extendedProps || {};
  return {
    id: String(p.id || event.id || ''),
    customerName: p.customer_name || '-',
    customerId: p.customer_id ? String(p.customer_id) : null,
    hnId: p.hn_id || '-',
    doctorName: p.doctor_name || '-',
    doctorId: p.doctor_id ? String(p.doctor_id) : null,
    advisorId: p.advisor_id ? String(p.advisor_id) : null,
    assistants: p.assistants || '-',
    roomName: p.examination_room_name || '-',
    roomId: p.examination_room_id ? String(p.examination_room_id) : null,
    source: p.source || null,
    date: p.appointment_date || event.start?.substring(0, 10) || '',
    startTime: p.appointment_start_time || event.start?.substring(11, 16) || '',
    endTime: p.appointment_end_time || event.end?.substring(11, 16) || '',
    note: p.note || null,
    appointmentTo: p.appointment_to || null,
    status: p.status || null,
    confirmed: p.confirmed || false,
  };
}

async function handleListByCustomer(req, res) {
  const { customerId } = req.body || {};
  if (!customerId) return res.status(400).json({ success: false, error: 'Missing customerId' });

  const session = await getSession(req.body);
  const base = session.origin;

  // Fetch customer page to get appointment modal + customer name
  const html = await session.fetchText(`${base}/admin/customer/${customerId}`);
  if (html.length < 1000 || html.includes('/login')) throw new Error('Session expired');

  // Extract customer name
  const $ = cheerio.load(html);
  const customerName = $('h5.card-title, .customer-name, .card-header h5').first().text().trim()
    || $('title').text().replace(/ProClinic.*/, '').trim() || '';

  // Extract basic appointments from modal (date, time, doctor, branch, room, notes)
  const { extractAppointments: extractAppts } = await import('./_lib/scraper.js');
  const basicAppts = extractAppts(html);

  // Strategy: Use FullCalendar range query (start/end) to fetch all appointments
  // in one request per month, then filter by customer_id — much faster than day-by-day
  const today = new Date();
  const cidStr = String(customerId);
  const appointments = [];

  // Fetch 12 months ahead, one request per month (FullCalendar JSON feed style)
  const monthFetches = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + m + 1, 1);
    const startStr = start.toISOString().substring(0, 10);
    const endStr = end.toISOString().substring(0, 10);
    monthFetches.push({ startStr, endStr });
  }

  // Batch 4 months at a time (4 parallel requests)
  for (let i = 0; i < monthFetches.length; i += 4) {
    const batch = monthFetches.slice(i, i + 4);
    const results = await Promise.all(batch.map(async ({ startStr, endStr }) => {
      try {
        // Try FullCalendar range params first
        const data = await session.fetchJSON(`${base}/admin/api/appointment?start=${startStr}&end=${endStr}`);
        const events = Array.isArray(data) ? data : data.appointment || Object.values(data).filter(v => v && typeof v === 'object' && v.id);
        return events.filter(ev => {
          const p = ev.extendedProps || {};
          return String(p.customer_id) === cidStr;
        }).map(mapAppointment);
      } catch { return []; }
    }));
    results.forEach(arr => appointments.push(...arr));
  }

  // Fallback: if range query returned nothing but modal shows appointments,
  // try day-by-day for known modal dates only
  if (appointments.length === 0 && basicAppts.length > 0) {
    const thaiMonthMap = { 'ม.ค.': '01', 'ก.พ.': '02', 'มี.ค.': '03', 'เม.ย.': '04', 'พ.ค.': '05', 'มิ.ย.': '06', 'ก.ค.': '07', 'ส.ค.': '08', 'ก.ย.': '09', 'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12' };
    const parseDate = (s) => {
      const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (iso) return iso[0];
      const thai = s.match(/(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})/);
      if (thai) { const y = parseInt(thai[3]) > 2500 ? parseInt(thai[3]) - 543 : parseInt(thai[3]); return `${y}-${thaiMonthMap[thai[2]]}-${String(parseInt(thai[1])).padStart(2,'0')}`; }
      const sl = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (sl) { const y = parseInt(sl[3]) > 2500 ? parseInt(sl[3]) - 543 : parseInt(sl[3]); return `${y}-${sl[2].padStart(2,'0')}-${sl[1].padStart(2,'0')}`; }
      return null;
    };
    const modalDates = [...new Set(basicAppts.map(a => parseDate(a.date)).filter(Boolean))];
    const fallbackResults = await Promise.all(modalDates.map(async date => {
      try {
        const data = await session.fetchJSON(`${base}/admin/api/appointment?date=${date}`);
        const events = Array.isArray(data) ? data : data.appointment || Object.values(data).filter(v => v && typeof v === 'object' && v.id);
        return events.filter(ev => String((ev.extendedProps || {}).customer_id) === cidStr).map(mapAppointment);
      } catch { return []; }
    }));
    fallbackResults.forEach(arr => appointments.push(...arr));
  }

  // Deduplicate by appointment ID
  const seen = new Set();
  const unique = appointments.filter(a => {
    if (!a.id || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  }).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));

  // Backup to Firestore (async, non-blocking)
  const docPath = `artifacts/${APP_ID}/public/data/pc_customer_appointments/${customerId}`;
  const fields = {
    customerId: { stringValue: cidStr },
    customerName: { stringValue: customerName },
    appointments: { stringValue: JSON.stringify(unique) },
    syncedAt: { stringValue: new Date().toISOString() },
  };
  const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${f}`).join('&');
  fetch(`${FIRESTORE_BASE}/${docPath}?${mask}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  }).catch(() => {});

  return res.status(200).json({ success: true, customerName, appointments: unique });
}

// ─── Router ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { action } = req.body || {};
    if (action === 'create') return await handleCreate(req, res);
    if (action === 'update') return await handleUpdate(req, res);
    if (action === 'delete') return await handleDelete(req, res);
    if (action === 'listByCustomer') return await handleListByCustomer(req, res);
    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    return res.status(200).json(resp);
  }
}
