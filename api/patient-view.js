// ─── /api/patient-view — PUBLIC token-gated patient data (anon, no login) ───
// Customer-level patient link: resolves a crypto token (be_customers OR legacy
// opd_session) server-side via admin SDK. be_customers/be_appointments/be_branches
// are clinic-staff-only (firestore.rules) → anon CANNOT read them client-side, so
// THIS endpoint is the secure data path. Returns the latestCourses-shaped payload
// that PatientDashboard already renders (reuse the existing patient view 100%).
// Field-minimized: name · courses · appointments(+branch). No sensitive PII.
// (hn stripped 2026-07-07 — the customer-link page no longer displays it.)
//
// AV (anon-safety): NEVER add sensitive PII identifiers (ID number etc.) to the
// response. be_* rules MUST stay isClinicStaff (no anon-read rule).
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fmtThaiDate } from '../src/lib/dateFormat.js';
import { computeUsableCourses, isAppointmentUpcoming } from '../src/lib/customerLinkPayloadCore.js';

const APP_ID = 'loverclinic-opd-4c39b';

let cachedDb = null;
function getDb() {
  if (cachedDb) return cachedDb;
  let app;
  if (getApps().length > 0) app = getApp();
  else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) throw new Error('firebase-admin not configured');
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
    });
  }
  cachedDb = getFirestore(app);
  return cachedDb;
}
const dataCol = (db, c) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(c);
const bangkokToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const token = String(req.query.token || '');
  if (!token || token.length < 16) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

  try {
    const db = getDb();

    // 1. Resolve token — be_customers first (new), then legacy opd_session.
    let customerData = null, customerId = null;
    const custSnap = await dataCol(db, 'be_customers').where('patientLinkToken', '==', token).limit(1).get();
    if (!custSnap.empty) {
      const doc = custSnap.docs[0];
      if (doc.data().patientLinkEnabled !== true) return res.status(404).json({ ok: false, error: 'DISABLED' });
      customerId = doc.id;
      customerData = doc.data();
    } else {
      const sessSnap = await dataCol(db, 'opd_sessions').where('patientLinkToken', '==', token).limit(1).get();
      if (sessSnap.empty) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const s = sessSnap.docs[0].data();
      if (s.patientLinkEnabled !== true) return res.status(404).json({ ok: false, error: 'DISABLED' });
      customerId = s.brokerProClinicId ? String(s.brokerProClinicId) : null;
      if (customerId) {
        const cdoc = await dataCol(db, 'be_customers').doc(customerId).get();
        customerData = cdoc.exists ? cdoc.data() : null;
      }
    }
    if (!customerData) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    const today = bangkokToday();

    // 2. Courses — show only USABLE remaining ("คอร์สคงเหลือ"); expired split out.
    //    Logic single-sourced in customerLinkPayloadCore (AV135) — also consumed by
    //    the auto-cleanup cron so "empty" is computed identically. (effective-status
    //    flips finite+depleted → ใช้หมดแล้ว; keeps buffet; excludes refunded/cancelled.
    //    Matches lineBotResponder.formatCoursesReply V33.8 + RemainingCourseTab.)
    const { remaining: courses, expired: expiredCourses } = computeUsableCourses(customerData.courses, today);

    // 3. Appointments — future-only + branch-name resolve + full-month Thai date.
    //    Real be_appointments field shape (verified via Rule R diag 2026-05-25):
    //    date(ISO) · startTime/endTime · doctorName · branchId · roomName? · status.
    const apptSnap = await dataCol(db, 'be_appointments').where('customerId', '==', String(customerId)).get();
    // Upcoming = future-or-today, NOT cancelled, NOT serviced/attended.
    // Single-sourced in customerLinkPayloadCore (AV135) — same predicate the cron uses.
    let appts = apptSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => isAppointmentUpcoming(a, today));
    appts.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));

    // perf link-patient LCP (2026-07-07): branch names were fetched one-by-one
    // inside the mapping loop (serial Firestore RTT per unique branch). Prefetch
    // ALL unique branchIds in parallel — output identical, ~1 RTT total.
    const branchCache = {};
    const uniqueBranchIds = [...new Set(appts.map((a) => a.branchId).filter(Boolean).map(String))];
    await Promise.all(uniqueBranchIds.map(async (bid) => {
      const b = await dataCol(db, 'be_branches').doc(bid).get();
      branchCache[bid] = b.exists ? (b.data().name || '') : '';
    }));
    const branchName = (bid) => (bid ? (branchCache[String(bid)] ?? '') : '');

    const appointments = appts.map((a) => {
      const start = a.startTime || a.time || '';
      const end = a.endTime || '';
      const timeStr = start ? (end ? `${start} - ${end} น.` : `${start} น.`) : '';
      return {
        date: a.date ? fmtThaiDate(a.date, { monthStyle: 'full', yearStyle: 'full' }) : '',
        time: timeStr,
        doctor: a.doctorName || '',
        branch: branchName(a.branchId),
        room: a.roomName || '',
        status: a.status || '',
      };
    });

    // 4. Patient identity (minimal — no national ID / sensitive PII).
    //    2026-07-07: hn STRIPPED from the payload too (customer-link header
    //    no longer displays it — field-minimization on this anon endpoint).
    const pd = customerData.patientData || {};
    const patientName = `${pd.prefix || ''} ${pd.firstName || pd.firstNameTh || ''} ${pd.lastName || pd.lastNameTh || ''}`.trim()
      || `${customerData.prefix || ''} ${customerData.firstname || ''} ${customerData.lastname || ''}`.trim();

    return res.status(200).json({
      ok: true,
      patientName,
      patientData: {
        prefix: pd.prefix || '',
        firstName: pd.firstName || pd.firstNameTh || '',
        lastName: pd.lastName || pd.lastNameTh || '',
        phone: pd.phone || customerData.phone || '',
      },
      courses,
      expiredCourses,
      appointments,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[patient-view]', e?.message || e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
