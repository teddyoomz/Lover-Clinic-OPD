#!/usr/bin/env node
// COMPREHENSIVE class-of-bug magnitude audit:
// scan ALL be_treatments + match treatmentItems[].productId against
// ALL be_customers[].courses[].productId — count silent-skip instances.
//
// Definition of "silent-skip treatment":
//   - treatment.detail.treatmentItems has at least 1 entry with productId
//   - treatment.detail.courseItems is EMPTY (no decrement attempted)
//   - customer.courses[] has a matching entry by productId where
//     parseQty(qty).total > 0 (i.e. customer DID have a course for that product)
//
// READ-ONLY (Rule R standing auth).

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

const parseQty = (q) => {
  if (!q || typeof q !== 'string') return { total: 0, remaining: 0 };
  const m = q.match(/^([\d.,]+)\s*\/\s*([\d.,]+)/);
  if (!m) return { total: 0, remaining: 0 };
  return {
    remaining: parseFloat(m[1].replace(/,/g, '')) || 0,
    total: parseFloat(m[2].replace(/,/g, '')) || 0,
  };
};

const ts = (v) => {
  if (!v) return '(none)';
  if (typeof v === 'string') return v;
  if (v._seconds) return new Date(v._seconds * 1000).toISOString();
  if (v.toDate) return v.toDate().toISOString();
  return '?';
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SYSTEM-WIDE class-of-bug magnitude audit (Rule R, read-only)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Load ALL customers
  const cSnap = await db.collection(`${BASE}/be_customers`).get();
  const allCustomers = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Total customers: ${allCustomers.length}`);

  // 2. Load ALL treatments
  const tSnap = await db.collection(`${BASE}/be_treatments`).get();
  const allTreatments = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Total treatments: ${allTreatments.length}\n`);

  // 3. For each treatment, classify
  const buckets = {
    totalTreatments: 0,
    noTreatmentItems: 0,
    treatmentItemsButNoProductId: 0,
    courseItemsPopulated: 0,
    courseItemsEmpty_noProductIdMatch: 0,
    courseItemsEmpty_butCustomerHadCourse: 0,    // ← THE BUG class
    customerNotFound: 0,
  };
  const bugSamples = []; // top suspicious cases

  for (const t of allTreatments) {
    buckets.totalTreatments++;
    const d = t.detail || {};
    const ti = Array.isArray(d.treatmentItems) ? d.treatmentItems : [];
    const ci = Array.isArray(d.courseItems) ? d.courseItems : [];
    const pi = Array.isArray(d.purchasedItems) ? d.purchasedItems : [];

    if (ti.length === 0) {
      buckets.noTreatmentItems++;
      continue;
    }
    if (ci.length > 0) {
      buckets.courseItemsPopulated++;
      continue;
    }
    // ti.length > 0 AND ci.length === 0 — POTENTIAL bug
    const tiWithProductId = ti.filter(item => item.productId);
    if (tiWithProductId.length === 0) {
      buckets.treatmentItemsButNoProductId++;
      continue;
    }
    // Has productId — was the customer ever in possession of a course with that productId?
    const customerId = t.customerId;
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) {
      buckets.customerNotFound++;
      continue;
    }
    const courses = Array.isArray(customer.courses) ? customer.courses : [];
    // Find ALL course entries that share productId with any tiWithProductId
    const productIdSet = new Set(tiWithProductId.map(x => String(x.productId)));
    const matchingCourses = courses.filter(c => productIdSet.has(String(c.productId || '')));
    if (matchingCourses.length === 0) {
      buckets.courseItemsEmpty_noProductIdMatch++;
      continue;
    }
    // BUG CONFIRMED: treatment used product X (via treatmentItems), customer had course
    // for product X (course.productId matches), but courseItems = [] → no decrement happened
    buckets.courseItemsEmpty_butCustomerHadCourse++;
    if (bugSamples.length < 25) {
      bugSamples.push({
        treatmentId: t.treatmentId || t.id,
        customerId,
        customerHN: customer.proClinicHN || customer.hn || customer.id,
        customerName: `${customer.patientData?.firstNameTh || ''} ${customer.patientData?.lastNameTh || ''}`.trim() || '(no name)',
        createdAt: ts(t.createdAt),
        treatmentItemsCount: ti.length,
        productIdsUsed: [...productIdSet].slice(0, 5),
        matchingCoursesCount: matchingCourses.length,
        matchingCourseSample: matchingCourses.slice(0, 3).map(c => ({
          name: c.name || c.courseName,
          product: c.product || c.productName,
          qty: c.qty,
          parsed: parseQty(c.qty),
          linkedSaleId: c.linkedSaleId || '',
        })),
        hasSale: d.hasSale,
        linkedSaleId: t.linkedSaleId || '',
      });
    }
  }

  console.log('━━━ Magnitude buckets ━━━\n');
  console.log(`Total treatments scanned:                                        ${buckets.totalTreatments}`);
  console.log(`No treatmentItems (admin OPD-only):                              ${buckets.noTreatmentItems}`);
  console.log(`treatmentItems present + courseItems POPULATED (healthy):        ${buckets.courseItemsPopulated}`);
  console.log(`treatmentItems present without productId (legacy/manual):        ${buckets.treatmentItemsButNoProductId}`);
  console.log(`treatmentItems(productId) + courseItems EMPTY + NO course match: ${buckets.courseItemsEmpty_noProductIdMatch}`);
  console.log(`treatmentItems(productId) + courseItems EMPTY + CUSTOMER HAD COURSE: ${buckets.courseItemsEmpty_butCustomerHadCourse}  ← BUG CLASS`);
  console.log(`Customer doc not found:                                          ${buckets.customerNotFound}\n`);

  const totalAuditable = buckets.totalTreatments - buckets.noTreatmentItems - buckets.treatmentItemsButNoProductId;
  const bugPct = totalAuditable > 0 ? (100 * buckets.courseItemsEmpty_butCustomerHadCourse / totalAuditable).toFixed(1) : '0';
  console.log(`BUG RATE: ${buckets.courseItemsEmpty_butCustomerHadCourse} / ${totalAuditable} auditable = ${bugPct}%\n`);

  console.log('━━━ Top suspicious cases (up to 25) ━━━\n');
  bugSamples.forEach((b, i) => {
    console.log(`[${i}] ${b.treatmentId}  customer=${b.customerId} (${b.customerName}, HN ${b.customerHN})`);
    console.log(`    createdAt=${b.createdAt}  treatmentItems=${b.treatmentItemsCount}  hasSale=${b.hasSale}  linkedSaleId=${b.linkedSaleId || '(none)'}`);
    console.log(`    productIds in treatmentItems: ${b.productIdsUsed.join(', ')}`);
    console.log(`    customer had ${b.matchingCoursesCount} course entry/entries for these productIds:`);
    b.matchingCourseSample.forEach(s => {
      console.log(`       • "${s.name}"/${s.product}  qty="${s.qty}" total=${s.parsed.total} remaining=${s.parsed.remaining} linkedSaleId="${s.linkedSaleId}"`);
    });
    console.log();
  });

  // 4. be_course_changes audit-log ratio
  console.log('━━━ be_course_changes audit-log analysis ━━━\n');
  const ccSnap = await db.collection(`${BASE}/be_course_changes`).get();
  const allChanges = ccSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Total be_course_changes entries: ${allChanges.length}`);
  const useEntries = allChanges.filter(c => c.kind === 'use');
  console.log(`  of which kind='use' (treatment deduction events): ${useEntries.length}`);

  // Treatments which SHOULD have emitted 'use' (treatmentItems with productId)
  const treatmentsExpectingUse = allTreatments.filter(t => {
    const d = t.detail || {};
    const ti = Array.isArray(d.treatmentItems) ? d.treatmentItems : [];
    return ti.some(item => item.productId);
  });
  console.log(`Treatments with treatmentItems(productId) (should have emit 'use'): ${treatmentsExpectingUse.length}`);
  const ratioPct = treatmentsExpectingUse.length > 0
    ? (100 * useEntries.length / treatmentsExpectingUse.length).toFixed(1)
    : '0';
  console.log(`Audit emit coverage: ${useEntries.length} / ${treatmentsExpectingUse.length} = ${ratioPct}%`);
  console.log();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  AUDIT COMPLETE  (Rule R, read-only, zero writes)`);
  console.log(`  BUG CLASS COUNT: ${buckets.courseItemsEmpty_butCustomerHadCourse} treatments`);
  console.log(`  AUDIT EMIT COVERAGE: ${ratioPct}%`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
