// POST /api/proclinic/courses — Get courses, expired courses, appointments
import { createSession, handleCors } from './_lib/session.js';
import { extractCourses, extractPagination, extractAppointments, extractPatientName } from './_lib/scraper.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { origin, email, password, proClinicId } = req.body || {};
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

    // Additional course pages
    if (coursePag.param && coursePag.maxPage > 1) {
      for (let p = 2; p <= coursePag.maxPage; p++) {
        const pageHtml = await session.fetchText(`${customerUrl}?${coursePag.param}=${p}`);
        allCourses = [...allCourses, ...extractCourses(pageHtml, '#course-tab')];
      }
    }

    // Additional expired course pages
    if (expiredPag.param && expiredPag.maxPage > 1) {
      for (let p = 2; p <= expiredPag.maxPage; p++) {
        const pageHtml = await session.fetchText(`${customerUrl}?${expiredPag.param}=${p}`);
        allExpired = [...allExpired, ...extractCourses(pageHtml, '#expired-course-tab')];
      }
    }

    return res.status(200).json({
      success: true, patientName,
      courses: allCourses, expiredCourses: allExpired, appointments,
    });
  } catch (err) {
    const resp = { success: false, error: err.message };
    if (err.sessionExpired) resp.sessionExpired = true;
    return res.status(200).json(resp);
  }
}
