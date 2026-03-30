// ─── Appointment API ─────────────────────────────────────────────────────────
// Actions: create, update, delete
import { createSession, handleCors } from './_lib/session.js';
import { extractCSRF } from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';
import * as cheerio from 'cheerio';

// ─── Action: create ─────────────────────────────────────────────────────────

async function handleCreate(req, res) {
  const { appointment } = req.body || {};
  if (!appointment) {
    return res.status(400).json({ success: false, error: 'Missing appointment data' });
  }

  const session = await createSession();
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
  params.set('appointment_type', 'sales');
  params.set('appointment_option', 'once');
  params.set('customer_option', 'none');

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

  // Success: redirect (302/303)
  if (status >= 300 && status < 400) {
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

  // Check for errors
  let bodyHtml = '';
  try { bodyHtml = await submitRes.text(); } catch {}
  const $ = cheerio.load(bodyHtml);
  const laravelMsg = $('.exception-message, .exception_message, h1').first().text().trim();
  const errorDetail = laravelMsg || bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 300);

  throw new Error(`สร้างนัดหมายไม่สำเร็จ (${status}): ${errorDetail || 'Unknown'}`);
}

// ─── Action: update ─────────────────────────────────────────────────────────

async function handleUpdate(req, res) {
  const { appointmentId, appointment } = req.body || {};
  if (!appointmentId || !appointment) {
    return res.status(400).json({ success: false, error: 'Missing appointmentId or appointment data' });
  }

  const session = await createSession();
  const base = session.origin;

  // GET /admin/appointment → extract CSRF
  const html = await session.fetchText(`${base}/admin/appointment`);
  const csrf = extractCSRF(html);
  if (!csrf) throw new Error('ไม่พบ CSRF token ในหน้า appointment');

  // Build form data with _method=PUT
  const params = new URLSearchParams();
  params.set('_token', csrf);
  params.set('_method', 'PUT');
  params.set('appointment_id', appointmentId);
  params.set('is_basic_flow', 'true');
  params.set('type', '');
  params.set('current_doctor_id', '');
  params.set('appointment_type', 'sales');
  params.set('appointment_option', 'once');
  params.set('customer_option', 'none');

  // Fields
  params.set('appointment_date', appointment.appointmentDate || '');
  params.set('appointment_start_time', appointment.appointmentStartTime || '');
  params.set('appointment_end_time', appointment.appointmentEndTime || '');

  if (appointment.appointmentStartTime && appointment.appointmentEndTime) {
    params.set('times', `${appointment.appointmentStartTime},${appointment.appointmentEndTime}`);
  } else {
    params.set('times', '');
  }

  if (appointment.advisor) params.set('advisor_id', appointment.advisor);
  if (appointment.doctor) params.set('doctor_id', appointment.doctor);
  if (appointment.assistant) params.set('doctor_assistant_id[]', appointment.assistant);
  if (appointment.room) params.set('examination_room_id', appointment.room);
  if (appointment.source) params.set('source', appointment.source);
  if (appointment.appointmentTo) params.set('appointment_to', appointment.appointmentTo);
  if (appointment.appointmentNote) params.set('appointment_note', appointment.appointmentNote);

  params.set('appointment_location', '');
  params.set('expected_sales', '');
  params.set('preparation', '');
  params.set('customer_note', '');
  params.set('appointment_color', '');

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
  if (status >= 300 && status < 400) {
    return res.status(200).json({ success: true });
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
  throw new Error(`แก้ไขนัดหมายไม่สำเร็จ (${status})`);
}

// ─── Action: delete ─────────────────────────────────────────────────────────

async function handleDelete(req, res) {
  const { appointmentId } = req.body || {};
  if (!appointmentId) {
    return res.status(400).json({ success: false, error: 'Missing appointmentId' });
  }

  const session = await createSession();
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
    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    return res.status(200).json(resp);
  }
}
