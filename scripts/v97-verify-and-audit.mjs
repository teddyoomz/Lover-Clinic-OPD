#!/usr/bin/env node
// V97 verify + emit corrected audit doc (the previous run wrote data
// successfully but the audit emit hit V14 undefined-leaf rejection).
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}
const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const FILLER_RE = /\b(neuramis|restylane|juvederm|juvéderm|belotero|stylage|teosyal|princess|yvoire|croma|aliaxin|saypha|vivacy|profhilo|sculptra|radiesse|ellanse)\b/i;
const TARGET_CUSTOMER_ID = 'LC-26000078';

function clean(x) { return JSON.parse(JSON.stringify(x, (k, v) => v === undefined ? null : v)); }

async function main() {
  console.log('═══ V97 verify ═══\n');

  // 1. Verify วันเพ็ญ phase 1
  const cSnap = await db.doc(`${BASE}/be_customers/${TARGET_CUSTOMER_ID}`).get();
  const cdata = cSnap.data();
  const courses = Array.isArray(cdata.courses) ? cdata.courses : [];
  const remainingFillerWrong = courses.filter(c => {
    const name = `${c.name || c.courseName || ''} ${c.product || c.productName || ''}`;
    return /neuramis/i.test(name) && /ครั้ง/.test(c.qty || '') && !/cc/i.test(c.qty || '');
  });
  console.log(`Phase 1 — วันเพ็ญ courses[] total: ${courses.length}`);
  console.log(`  Remaining filler-ครั้ง entries: ${remainingFillerWrong.length}  (expected: 0)`);
  console.log(`  Forensic _v97FillerUnitFixedAt present: ${cdata._v97FillerUnitFixedAt ? 'YES' : 'NO'}`);
  const removed = Array.isArray(cdata._v97FillerUnitFixRemovedEntries) ? cdata._v97FillerUnitFixRemovedEntries : [];
  console.log(`  _v97FillerUnitFixRemovedEntries length: ${removed.length}  (expected: 1)`);
  if (removed.length > 0) {
    console.log(`    × removed: "${removed[0].name || removed[0].courseName}" / qty="${removed[0].qty}"`);
  }

  // 2. Verify be_courses phase 2
  const coursesSnap = await db.collection(`${BASE}/be_courses`).get();
  let fillerCoursesScanned = 0;
  let fillerUnitsByValue = { CC: 0, '(empty)': 0, ครั้ง: 0, other: 0 };
  let withForensicStamp = 0;
  coursesSnap.forEach(doc => {
    const d = doc.data();
    const products = Array.isArray(d.courseProducts) ? d.courseProducts : [];
    let hasFiller = false;
    products.forEach(p => {
      const pName = p.productName || p.name || '';
      if (!FILLER_RE.test(pName)) return;
      hasFiller = true;
      const u = String(p.unit || '').trim();
      if (u === 'CC') fillerUnitsByValue.CC += 1;
      else if (u === '') fillerUnitsByValue['(empty)'] += 1;
      else if (u === 'ครั้ง') fillerUnitsByValue.ครั้ง += 1;
      else fillerUnitsByValue.other += 1;
    });
    if (hasFiller) {
      fillerCoursesScanned += 1;
      if (d._v97FillerUnitFixedAt) withForensicStamp += 1;
    }
  });
  console.log(`\nPhase 2 — be_courses with fillers: ${fillerCoursesScanned}`);
  console.log(`  filler courseProducts[] units now:`);
  Object.entries(fillerUnitsByValue).forEach(([u, n]) => console.log(`    unit="${u}":  ${n}`));
  console.log(`  Courses with _v97FillerUnitFixedAt forensic: ${withForensicStamp}  (expected: 53)`);

  // 3. Emit corrected audit doc (with clean() + ignoreUndefinedProperties)
  const auditId = `v97-filler-unit-fix-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${BASE}/be_admin_audit/${auditId}`).set(clean({
    auditId,
    op: 'v97-filler-unit-fix-verify',
    phase1: {
      customerId: TARGET_CUSTOMER_ID,
      coursesBefore: courses.length + removed.length,
      coursesAfter: courses.length,
      removed: removed.length,
      removedEntries: removed,
      remainingFillerCrang: remainingFillerWrong.length,
      forensicStampPresent: !!cdata._v97FillerUnitFixedAt,
    },
    phase2: {
      fillerCoursesScanned,
      fillerUnitsByValue,
      withForensicStamp,
      idempotencyExpected: fillerUnitsByValue['(empty)'] === 0 && fillerUnitsByValue.ครั้ง === 0,
    },
    appliedAt: FieldValue.serverTimestamp(),
    appliedBy: 'admin-sdk-script-v97-verify',
  }));
  console.log(`\n📝 audit doc: be_admin_audit/${auditId}`);

  const ok = remainingFillerWrong.length === 0
    && fillerUnitsByValue['(empty)'] === 0
    && fillerUnitsByValue.ครั้ง === 0
    && fillerUnitsByValue.CC === 53
    && withForensicStamp === 53
    && removed.length === 1;
  console.log(`\n═══ RESULT: ${ok ? '✅ ALL GREEN' : '⚠️  PARTIAL'} ═══`);
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error('💥', e); process.exit(1); });
