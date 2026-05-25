// Rule Q L2 — real-prod e2e for the customer patient-link.
// Seeds a TEST-prefixed customer + FUTURE appointment in real prod Firestore,
// runs the EXACT resolve + map logic api/patient-view uses, asserts the shape
// (full-month Thai date + resolved branch NAME), then deletes. Verifies the DATA
// + resolution path on real prod (the serverless fn needs HTTP; this exercises
// the same admin-SDK reads + fmtThaiDate mapping against real Firestore).
//   node scripts/e2e-customer-patient-link.mjs --apply
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { fmtThaiDate } from '../src/lib/dateFormat.js';

const APP_ID = 'loverclinic-opd-4c39b';
for (const l of readFileSync('.env.local.prod', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
if (!getApps().length) initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
  }),
});
const db = getFirestore();
const dataCol = (c) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(c);
const bangkokToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

async function main() {
  const apply = process.argv.includes('--apply');
  const cid = `TEST-PLINK-${Date.now()}`;
  const aidFuture = `TEST-APPT-PLINK-F-${Date.now()}`;
  const aidPast = `TEST-APPT-PLINK-P-${Date.now()}`;
  const aidCancelled = `TEST-APPT-PLINK-C-${Date.now()}`;
  const token = crypto.randomBytes(16).toString('hex');

  // pick a real branch for name resolution
  const branches = await dataCol('be_branches').limit(1).get();
  const branchId = branches.empty ? 'BR-TEST' : branches.docs[0].id;
  const branchName = branches.empty ? '' : (branches.docs[0].data().name || '');
  const futureDate = new Date(Date.now() + 7 * 3600000 + 86400000 * 5).toISOString().slice(0, 10);
  const pastDate = new Date(Date.now() + 7 * 3600000 - 86400000 * 5).toISOString().slice(0, 10);

  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

  console.log('=== Rule Q L2 — customer patient-link (apply:', apply, ') ===');
  console.log('branch:', branchId, '→', branchName, '| future:', futureDate, '| past:', pastDate);

  if (apply) {
    await dataCol('be_customers').doc(cid).set({
      patientLinkToken: token, patientLinkEnabled: true,
      patientData: { prefix: 'นาย', firstName: 'ทดสอบ', lastName: 'ลิงก์', phone: '0800000000' },
      hn_no: 'TEST-HN-PLINK',
      courses: [
        { name: 'TEST Course Active', status: 'กำลังใช้งาน', qty: '9 / 12 ครั้ง' },
        { name: 'TEST Course Expired', status: 'หมดอายุ', expiryDate: '2026-01-01' },
      ],
    });
    await dataCol('be_appointments').doc(aidFuture).set({ customerId: cid, date: futureDate, startTime: '10:00', endTime: '10:30', doctorName: 'นพ. ทดสอบ', branchId, status: 'confirmed' });
    await dataCol('be_appointments').doc(aidPast).set({ customerId: cid, date: pastDate, startTime: '09:00', doctorName: 'นพ. ทดสอบ', branchId, status: 'confirmed' });
    await dataCol('be_appointments').doc(aidCancelled).set({ customerId: cid, date: futureDate, startTime: '15:00', doctorName: 'นพ. ทดสอบ', branchId, status: 'cancelled' });
    console.log('seeded TEST customer + 3 appts (future/past/cancelled)');
  }

  // ── resolve (mirror api/patient-view) ──
  const cs = await dataCol('be_customers').where('patientLinkToken', '==', token).limit(1).get();
  ok(!cs.empty, 'resolve be_customers by patientLinkToken');
  if (cs.empty) { console.log(`\nPASS ${pass} FAIL ${fail} (seed not applied? run with --apply)`); process.exit(fail ? 1 : 0); }
  const cust = cs.docs[0];
  ok(cust.data().patientLinkEnabled === true, 'patientLinkEnabled gate = true');

  const today = bangkokToday();
  const allCourses = cust.data().courses || [];
  const courses = allCourses.filter(c => !c.expiryDate || String(c.expiryDate) >= today);
  const expiredCourses = allCourses.filter(c => c.expiryDate && String(c.expiryDate) < today);
  ok(courses.length === 1 && expiredCourses.length === 1, `courses split active=${courses.length} expired=${expiredCourses.length}`);

  const aps = await dataCol('be_appointments').where('customerId', '==', cid).get();
  const fut = aps.docs.map(d => d.data())
    .filter(a => (a.date || '') >= today && a.status !== 'cancelled');
  ok(fut.length === 1, `future+active appointment count = ${fut.length} (past + cancelled excluded)`);

  const a = fut[0];
  const branchNm = a.branchId === branchId ? branchName : '';
  const start = a.startTime || a.time || '';
  const timeStr = start ? (a.endTime ? `${start} - ${a.endTime} น.` : `${start} น.`) : '';
  const dateStr = fmtThaiDate(a.date, { monthStyle: 'full', yearStyle: 'full' });
  console.log('  mapped appt →', { date: dateStr, time: timeStr, branch: branchNm });
  ok(/[ก-๛]{4,}\s\d{4}$/.test(dateStr), `FULL Thai month + พ.ศ.: "${dateStr}"`);
  ok(!/พ\.ค\.|มิ\.ย\./.test(dateStr), 'month NOT abbreviated');
  ok(timeStr.includes('10:00') && timeStr.includes('10:30'), `time range from startTime/endTime: "${timeStr}"`);
  ok(branchNm === branchName && branchNm !== '' && !/^BR-/.test(branchNm), `branch resolved to NAME: "${branchNm}"`);

  // ── disabled gate ──
  if (apply) {
    await dataCol('be_customers').doc(cid).update({ patientLinkEnabled: false });
    const cs2 = await dataCol('be_customers').where('patientLinkToken', '==', token).limit(1).get();
    ok(cs2.docs[0].data().patientLinkEnabled === false, 'disabled gate flips to false (endpoint → 404 DISABLED)');
  }

  // ── cleanup ──
  if (apply) {
    await dataCol('be_customers').doc(cid).delete();
    await dataCol('be_appointments').doc(aidFuture).delete();
    await dataCol('be_appointments').doc(aidPast).delete();
    await dataCol('be_appointments').doc(aidCancelled).delete();
    const orphan = await dataCol('be_appointments').where('customerId', '==', cid).get();
    ok(orphan.empty, `cleanup — zero orphan appointments (${orphan.size})`);
    const custGone = await dataCol('be_customers').doc(cid).get();
    ok(!custGone.exists, 'cleanup — TEST customer deleted');
  }

  console.log(`\nPASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
