// POST /api/proclinic/courses — Get courses, expired courses, appointments + appointment sync
import { createSession, handleCors } from './_lib/session.js';
import { extractCourses, extractPagination, extractAppointments, extractPatientName } from './_lib/scraper.js';
import { verifyAuth } from './_lib/auth.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;

// ─── Firestore helpers for appointment storage ───────────────────────────────

function mapAppointment(event) {
  const p = event.extendedProps || {};
  return {
    id: p.id || event.id,
    customerName: p.customer_name || '-',
    customerId: p.customer_id || null,
    hnId: p.hn_id || '-',
    fullCustomerName: p.full_customer_name || p.customer_name || '-',
    doctorName: p.doctor_name || '-',
    doctorId: p.doctor_id || null,
    assistants: p.assistants || '-',
    roomName: p.examination_room_name || '-',
    roomId: p.examination_room_id || null,
    date: p.appointment_date || event.start?.substring(0, 10) || '',
    startTime: p.appointment_start_time || event.start?.substring(11, 16) || '',
    endTime: p.appointment_end_time || event.end?.substring(11, 16) || '',
    source: p.source || null,
    note: p.note || null,
    customerNote: p.customer_note || null,
    appointmentTo: p.appointment_to || null,
    preparation: p.preparation || null,
    status: p.status || null,
    confirmed: p.confirmed || false,
    appointmentType: p.appointment_type || null,
    advisorId: p.advisor_id || null,
    expectedSales: p.expected_sales || null,
    appointmentColor: p.appointment_color || null,
    eventColor: p.eventColor || event.backgroundColor || null,
  };
}

function getAllDatesForMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${monthStr}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

async function saveAppointmentsToFirestore(monthStr, appointments) {
  const docPath = `artifacts/${APP_ID}/public/data/pc_appointments/${monthStr}`;
  const apptValues = appointments.map(a => ({
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(a).map(([k, v]) => {
          if (v === null || v === undefined) return [k, { nullValue: null }];
          if (typeof v === 'boolean') return [k, { booleanValue: v }];
          if (typeof v === 'number') return [k, { integerValue: String(v) }];
          return [k, { stringValue: String(v) }];
        })
      ),
    },
  }));
  await fetch(`${FIRESTORE_BASE}/${docPath}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        month: { stringValue: monthStr },
        appointments: { arrayValue: { values: apptValues.length ? apptValues : [] } },
        syncedAt: { stringValue: new Date().toISOString() },
        totalCount: { integerValue: String(appointments.length) },
      },
    }),
  });
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const { origin, email, password, proClinicId, action } = req.body || {};

    // ─── Sync appointments for a month ────────────────────────────────
    if (action === 'sync-appointments') {
      const { month } = req.body || {};
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ success: false, error: 'Invalid month format (YYYY-MM)' });
      }

      const session = await createSession(origin, email, password);
      const base = session.origin;
      const allDates = getAllDatesForMonth(month);

      // Fetch all days in parallel (single batch — all days at once)
      const allEvents = [];
      const seenIds = new Set();
      const results = await Promise.all(
        allDates.map(date =>
          session.fetchJSON(`${base}/admin/api/appointment?date=${date}`)
            .catch(() => ({ appointment: [] }))
        )
      );

      for (const data of results) {
        const events = data.appointment || Object.values(data).filter(v => v && typeof v === 'object' && v.id);
        for (const event of events) {
          const mapped = mapAppointment(event);
          // Filter: only appointments in the requested month + deduplicate
          if (mapped.date.startsWith(month) && !seenIds.has(mapped.id)) {
            seenIds.add(mapped.id);
            allEvents.push(mapped);
          }
        }
      }

      // Sort by date + time
      allEvents.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

      // Save to Firestore
      await saveAppointmentsToFirestore(month, allEvents);

      return res.status(200).json({
        success: true,
        month,
        totalCount: allEvents.length,
        appointments: allEvents,
      });
    }

    // ─── Fetch appointment counts per month ───────────────────────────
    if (action === 'fetch-appointment-months') {
      const { year } = req.body || {};
      const y = year || new Date().getFullYear();

      const session = await createSession(origin, email, password);
      const base = session.origin;

      // Fetch 12 months in parallel
      const monthPromises = [];
      for (let m = 1; m <= 12; m++) {
        const dateStr = `${y}-${String(m).padStart(2, '0')}-01`;
        monthPromises.push(
          session.fetchJSON(`${base}/admin/api/appointment-month?current_date=${dateStr}`)
            .then(data => {
              const items = Object.values(data);
              const total = items.reduce((sum, i) => sum + (i?.extendedProps?.appointment_count || 0), 0);
              return { month: `${y}-${String(m).padStart(2, '0')}`, count: total };
            })
            .catch(() => ({ month: `${y}-${String(m).padStart(2, '0')}`, count: 0 }))
        );
      }
      const months = await Promise.all(monthPromises);

      return res.status(200).json({ success: true, year: y, months });
    }

    if (!proClinicId) {
      return res.status(400).json({ success: false, error: 'Missing proClinicId' });
    }

    const session = await createSession(origin, email, password);
    const base = session.origin;
    const customerUrl = `${base}/admin/customer/${proClinicId}`;

    // Page 1
    const page1Html = await session.fetchText(customerUrl);

    const patientName = extractPatientName(page1Html);
    let allCourses = extractCourses(page1Html, '#course-tab');
    let allExpired = extractCourses(page1Html, '#expired-course-tab');
    const appointments = extractAppointments(page1Html);

    const coursePag = extractPagination(page1Html, '#course-tab');
    const expiredPag = extractPagination(page1Html, '#expired-course-tab');

    // Fetch ALL additional pages in parallel (courses + expired)
    const pagePromises = [];
    if (coursePag.param && coursePag.maxPage > 1) {
      for (let p = 2; p <= coursePag.maxPage; p++) {
        pagePromises.push(
          session.fetchText(`${customerUrl}?${coursePag.param}=${p}`)
            .then(html => ({ type: 'course', html }))
        );
      }
    }
    if (expiredPag.param && expiredPag.maxPage > 1) {
      for (let p = 2; p <= expiredPag.maxPage; p++) {
        pagePromises.push(
          session.fetchText(`${customerUrl}?${expiredPag.param}=${p}`)
            .then(html => ({ type: 'expired', html }))
        );
      }
    }
    if (pagePromises.length) {
      const pages = await Promise.all(pagePromises);
      for (const pg of pages) {
        if (pg.type === 'course') allCourses = [...allCourses, ...extractCourses(pg.html, '#course-tab')];
        else allExpired = [...allExpired, ...extractCourses(pg.html, '#expired-course-tab')];
      }
    }

    return res.status(200).json({
      success: true, patientName,
      courses: allCourses, expiredCourses: allExpired, appointments,
    });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    if (err.extensionNeeded) resp.extensionNeeded = true;
    return res.status(200).json(resp);
  }
}
