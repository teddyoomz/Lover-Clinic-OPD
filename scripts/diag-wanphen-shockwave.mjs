#!/usr/bin/env node
// Rule R diagnostic — read-only investigation of วันเพ็ญ (LC-26000078)
// shockwave / course-deduction / auto-sale class-of-bug (2026-05-19 EOD+11 LATE+2).
//
// User-reported (verbatim):
//   "ล่าสุด นางวันเพ็ญ เดือนสิบสอง ตัดช็อคเวฟไปตั้งหลายรอบ ทำไมไม่เห็นตัดคอร์สเลย
//    ในหน้าการขายก็ไม่เจอรายการขาย มึงเป็นเหี้ยไร หลอกกูเหรอ ?"
//
// Investigate:
//   1. customer.courses[] — find shockwave entries; total vs remaining
//   2. be_treatments — recent entries; courseItems declared; linkedSaleId
//   3. be_sales — any sale records linked to recent treatments
//   4. cross-check: treatments declared course usage but customer.courses
//      remaining did not decrement?
//   5. silent-swallow evidence — treatments with no linkedSaleId despite
//      having `hasSale=true` + purchased items
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

const TARGET_CUSTOMER_ID = 'LC-26000078';
// Match Thai "ช็อค" / "ช๊อค" / "ช็อก" / English "shock" / "ESWT"
const SHOCKWAVE_RE = /(ช[็๊]อ[คก]|ช\s*อ\s*[คก]|shock\s*wave|shock|eswt)/i;

const ts = (v) => {
  if (!v) return '(none)';
  if (typeof v === 'string') return v;
  if (v.toDate) return v.toDate().toISOString();
  if (v._seconds) return new Date(v._seconds * 1000).toISOString();
  return JSON.stringify(v);
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Rule R DIAG — วันเพ็ญ (LC-26000078) shockwave course + sale audit');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // 1. CUSTOMER DOC
  const cSnap = await db.doc(`${BASE}/be_customers/${TARGET_CUSTOMER_ID}`).get();
  if (!cSnap.exists) {
    console.error('FATAL: customer doc does not exist:', TARGET_CUSTOMER_ID);
    process.exit(1);
  }
  const cdata = cSnap.data();
  console.log('Customer found:');
  console.log('  HN:', cdata.proClinicHN || cdata.hn || '(none)');
  console.log('  name:', `${cdata.patientData?.firstNameTh || ''} ${cdata.patientData?.lastNameTh || ''}`.trim());
  console.log('  branchId:', cdata.branchId || '(none)');
  console.log();

  // 2. CUSTOMER.COURSES — find shockwave entries
  const courses = Array.isArray(cdata.courses) ? cdata.courses : [];
  console.log(`Customer.courses[]: total ${courses.length} entries\n`);

  const shockwaveCourses = courses
    .map((c, i) => ({ ...c, _index: i }))
    .filter(c => {
      const name = `${c.name || c.courseName || ''} ${c.product || c.productName || ''}`;
      return SHOCKWAVE_RE.test(name);
    });
  console.log(`Shockwave matches: ${shockwaveCourses.length}\n`);
  if (shockwaveCourses.length === 0) {
    console.log('  ⚠ NO shockwave entries found in customer.courses[]');
    console.log('  This means either:');
    console.log('   - shockwave was never purchased/assigned, OR');
    console.log('   - assignCourseToCustomer never fired (auto-sale silent-swallow),');
    console.log('   - course name uses a different spelling we did not match.\n');
    // Dump all course names so user can confirm spelling
    console.log('All course names on customer:');
    courses.forEach((c, i) => {
      console.log(`  [${i}] name="${c.name || c.courseName || ''}" product="${c.product || c.productName || ''}" qty="${c.qty || ''}"`);
    });
    console.log();
  } else {
    shockwaveCourses.forEach(c => {
      console.log(`  [idx=${c._index}] name="${c.name || c.courseName}" product="${c.product || c.productName}"`);
      console.log(`      qty="${c.qty}" courseType="${c.courseType || 'regular'}" expireAt="${ts(c.expireAt)}"`);
      console.log(`      linkedSaleId="${c.linkedSaleId || '(none)'}" linkedTreatmentId="${c.linkedTreatmentId || '(none)'}"`);
      console.log(`      _addedAt="${ts(c._addedAt || c.assignedAt)}"`);
    });
    console.log();
  }

  // 3. BE_TREATMENTS — recent for this customer
  const tSnap = await db.collection(`${BASE}/be_treatments`)
    .where('customerId', '==', TARGET_CUSTOMER_ID)
    .get();
  const allTreatments = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  // sort by createdAt desc
  allTreatments.sort((a, b) => {
    const ta = a.createdAt?._seconds || a.createdAt?.toMillis?.() / 1000 || 0;
    const tb = b.createdAt?._seconds || b.createdAt?.toMillis?.() / 1000 || 0;
    return tb - ta;
  });
  console.log(`be_treatments total for customer: ${allTreatments.length}\n`);

  // Filter treatments that mention shockwave anywhere in detail
  const shockwaveTreatments = allTreatments.filter(t => {
    const d = t.detail || {};
    const ti = Array.isArray(d.treatmentItems) ? d.treatmentItems : [];
    const ci = Array.isArray(d.courseItems) ? d.courseItems : [];
    const pi = Array.isArray(d.purchasedItems) ? d.purchasedItems : [];
    const hay = [
      ...ti.map(x => `${x.name || ''} ${x.productName || ''}`),
      ...ci.map(x => `${x.courseName || ''} ${x.productName || ''}`),
      ...pi.map(x => `${x.name || ''}`),
      d.symptoms || '', d.diagnosis || '', d.treatmentPlan || '',
    ].join(' ');
    return SHOCKWAVE_RE.test(hay);
  });
  console.log(`Treatments mentioning shockwave: ${shockwaveTreatments.length}\n`);

  // 4. Recent treatments dump (last 15) — all, not just shockwave
  console.log('━━━ Recent 15 treatments (sorted by createdAt desc) ━━━');
  const recentN = Math.min(allTreatments.length, 15);
  for (let i = 0; i < recentN; i++) {
    const t = allTreatments[i];
    const d = t.detail || {};
    const ti = Array.isArray(d.treatmentItems) ? d.treatmentItems : [];
    const ci = Array.isArray(d.courseItems) ? d.courseItems : [];
    const pi = Array.isArray(d.purchasedItems) ? d.purchasedItems : [];
    const hayJoined = [
      ...ti.map(x => `ti:"${x.name || ''}"`),
      ...ci.map(x => `ci:"${x.courseName || ''}/${x.productName || ''}" rowId:${x.rowId || ''}`),
      ...pi.map(x => `pi:"${x.name || ''}" type:${x.itemType || 'product'}`),
    ];
    const hasShockwave = SHOCKWAVE_RE.test(hayJoined.join(' '));
    const marker = hasShockwave ? '🔥' : '  ';
    console.log(`\n${marker} [${i}] BT ${t.treatmentId || t.id}`);
    console.log(`    createdAt: ${ts(t.createdAt)}`);
    console.log(`    treatmentDate: ${d.treatmentDate || '(none)'}`);
    console.log(`    status (top-level): ${t.status || '(no status field — completed staff save)'}`);
    console.log(`    branchId: ${t.branchId || d.branchId || '(none)'}`);
    console.log(`    hasSale (detail): ${d.hasSale === true ? 'TRUE' : d.hasSale === false ? 'FALSE' : '(unset)'}`);
    console.log(`    linkedSaleId (top): ${t.linkedSaleId || '(none)'}`);
    console.log(`    detail.linkedSaleId: ${d.linkedSaleId || '(none)'}`);
    if (ti.length > 0) console.log(`    treatmentItems[${ti.length}]: ${ti.map(x => `"${x.name || ''}" q=${x.qty || 0} u="${x.unit || ''}"`).slice(0, 5).join(', ')}`);
    if (ci.length > 0) console.log(`    courseItems[${ci.length}]: ${ci.map(x => `"${x.courseName || ''}/${x.productName || ''}" idx=${x.courseIndex} row=${x.rowId} q=${x.deductQty}`).slice(0, 5).join(', ')}`);
    if (pi.length > 0) console.log(`    purchasedItems[${pi.length}]: ${pi.map(x => `"${x.name || ''}"(${x.itemType || 'product'})`).slice(0, 5).join(', ')}`);
  }
  console.log();

  // 5. BE_SALES — recent for this customer
  const sSnap = await db.collection(`${BASE}/be_sales`)
    .where('customerId', '==', TARGET_CUSTOMER_ID)
    .get();
  const allSales = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allSales.sort((a, b) => {
    const ta = a.createdAt?._seconds || 0;
    const tb = b.createdAt?._seconds || 0;
    return tb - ta;
  });
  console.log(`be_sales total for customer: ${allSales.length}\n`);
  console.log('━━━ Recent 10 sales ━━━');
  const recentSN = Math.min(allSales.length, 10);
  for (let i = 0; i < recentSN; i++) {
    const s = allSales[i];
    console.log(`  [${i}] ${s.saleId || s.id} saleDate=${s.saleDate || '(none)'} netTotal=${s.billing?.netTotal || s.netTotal || 0} linkedTreatmentId="${s.linkedTreatmentId || '(none)'}" source="${s.source || '(none)'}"`);
  }
  console.log();

  // 6. CROSS-CHECK — treatments with hasSale=true that DO NOT have a linkedSaleId
  console.log('━━━ Cross-check: hasSale=true but no linkedSaleId ━━━');
  const orphanTreatments = allTreatments.filter(t => {
    const d = t.detail || {};
    return d.hasSale === true && !(t.linkedSaleId || d.linkedSaleId);
  });
  console.log(`Found ${orphanTreatments.length} orphan treatments (hasSale=true, no linkedSaleId)\n`);
  orphanTreatments.slice(0, 10).forEach((t, i) => {
    const d = t.detail || {};
    console.log(`  [${i}] BT ${t.treatmentId || t.id} createdAt=${ts(t.createdAt)} purchasedItems=${(d.purchasedItems || []).length}`);
  });
  console.log();

  // 7. CROSS-CHECK — treatments with courseItems but no audit trail of decrement
  // For each treatment with courseItems, check if the live customer.courses[] entry's
  // remaining is LOWER than what it would be if courseItems were NOT applied.
  // This is heuristic — best-effort.
  console.log('━━━ Cross-check: courseItems declared but customer.courses might not have decremented ━━━');
  const treatmentsWithCourseItems = allTreatments.filter(t => {
    const d = t.detail || {};
    return Array.isArray(d.courseItems) && d.courseItems.length > 0;
  });
  console.log(`Found ${treatmentsWithCourseItems.length} treatments with declared courseItems\n`);

  // For shockwave-relevant declared usages, count total declared deductions
  let declaredShockwaveDeducts = 0;
  treatmentsWithCourseItems.forEach(t => {
    const d = t.detail || {};
    (d.courseItems || []).forEach(ci => {
      const name = `${ci.courseName || ''} ${ci.productName || ''}`;
      if (SHOCKWAVE_RE.test(name)) {
        declaredShockwaveDeducts += Number(ci.deductQty || 1);
      }
    });
  });
  console.log(`Total declared shockwave deductions across ALL treatments: ${declaredShockwaveDeducts}\n`);

  // Sum customer.courses[].qty for shockwave entries
  // qty is typically "N ครั้ง คงเหลือ M ครั้ง" — parse N and M
  const parseQty = (q) => {
    if (!q || typeof q !== 'string') return { total: 0, remaining: 0 };
    const numbers = (q.match(/\d+/g) || []).map(Number);
    return { total: numbers[0] || 0, remaining: numbers[1] !== undefined ? numbers[1] : (numbers[0] || 0) };
  };
  let totalShockwaveTotal = 0;
  let totalShockwaveRemaining = 0;
  shockwaveCourses.forEach(c => {
    const { total, remaining } = parseQty(c.qty);
    totalShockwaveTotal += total;
    totalShockwaveRemaining += remaining;
  });
  console.log(`customer.courses[] shockwave aggregate: total=${totalShockwaveTotal}, remaining=${totalShockwaveRemaining}`);
  console.log(`Expected remaining if all declared deducts applied: ${totalShockwaveTotal - declaredShockwaveDeducts}`);
  if (totalShockwaveRemaining > totalShockwaveTotal - declaredShockwaveDeducts) {
    console.log(`⚠ DRIFT: remaining ${totalShockwaveRemaining} is HIGHER than expected ${totalShockwaveTotal - declaredShockwaveDeducts}`);
    console.log(`   This is the bug — declared deductions did not all decrement customer.courses[]`);
  } else if (totalShockwaveRemaining === totalShockwaveTotal - declaredShockwaveDeducts) {
    console.log(`✓ remaining matches expected — course deductions DID apply correctly`);
  } else {
    console.log(`? remaining ${totalShockwaveRemaining} is LOWER than expected ${totalShockwaveTotal - declaredShockwaveDeducts} — possibly older deductions not in our 15-treatment window`);
  }
  console.log();

  // 8. CHECK be_course_changes audit log — should have entries for declared deductions
  console.log('━━━ be_course_changes audit trail (last 20 for this customer) ━━━');
  try {
    const ccSnap = await db.collection(`${BASE}/be_course_changes`)
      .where('customerId', '==', TARGET_CUSTOMER_ID)
      .limit(50)
      .get();
    const changes = ccSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    changes.sort((a, b) => (b.timestamp?._seconds || 0) - (a.timestamp?._seconds || 0));
    const shockwaveChanges = changes.filter(c => SHOCKWAVE_RE.test(`${c.courseName || ''} ${c.productName || ''}`));
    console.log(`Total be_course_changes for customer: ${changes.length}`);
    console.log(`Shockwave-related: ${shockwaveChanges.length}\n`);
    shockwaveChanges.slice(0, 20).forEach((c, i) => {
      console.log(`  [${i}] kind=${c.kind} treatmentId=${c.treatmentId || '(none)'} courseName="${c.courseName || ''}" productName="${c.productName || ''}" qty=${c.qty} ts=${ts(c.timestamp)}`);
    });
  } catch (e) {
    console.log(`  (be_course_changes query failed: ${e.message})`);
  }
  console.log();

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  DIAG COMPLETE — read-only, no writes performed.');
  console.log('═══════════════════════════════════════════════════════════════════');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
