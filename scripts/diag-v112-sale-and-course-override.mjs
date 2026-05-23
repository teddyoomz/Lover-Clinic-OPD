#!/usr/bin/env node
// Rule R diag (READ-ONLY) — V112 root-cause investigation
//
// Inspects:
//   1. INV-20260520-0010 sale doc — the user-reported receipt with empty
//      customerName + missing receiptCourseName override
//   2. The course master(s) referenced by that sale's items.courses[]
//   3. Count of all be_sales with empty customerName AND populated customerId
//      (Bug 1 historical artifact scope)
//   4. Count of all be_sales whose items.courses[].id resolves to a
//      be_courses doc with receiptCourseName set AND sale's snapshot is
//      empty/different (Bug 2 backfill candidate scope)
//
// Rule R: READ-ONLY. No mutations. Safe to run any time.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const TARGET_SALE_ID = process.argv[2] || 'INV-20260520-0010';

function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function initFirestore() {
  if (getApps().length > 0) return getFirestore();
  const env = loadEnvLocal();
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }) });
  return getFirestore();
}

function dataRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

async function main() {
  const db = initFirestore();
  const root = dataRef(db);

  console.log(`\n══════ V112 DIAG — ${TARGET_SALE_ID} + bulk scope ══════\n`);

  // ─── 1. Target sale doc inspection ────────────────────────────────────
  console.log('── 1. Target sale doc ──');
  const saleSnap = await root.collection('be_sales').doc(TARGET_SALE_ID).get();
  if (!saleSnap.exists) {
    console.log(`  ✗ ${TARGET_SALE_ID} NOT FOUND`);
  } else {
    const s = saleSnap.data();
    console.log(`  saleId             : ${s.saleId}`);
    console.log(`  branchId           : ${s.branchId || '(empty)'}`);
    console.log(`  customerId         : ${s.customerId || '(empty)'}`);
    console.log(`  customerName       : ${JSON.stringify(s.customerName)}`);
    console.log(`  customerHN         : ${JSON.stringify(s.customerHN)}`);
    console.log(`  saleDate           : ${s.saleDate}`);
    console.log(`  createdAt          : ${s.createdAt}`);
    console.log(`  updatedAt          : ${s.updatedAt}`);
    console.log(`  items.courses[]    :`);
    for (const c of (s.items?.courses || [])) {
      console.log(`    - id=${c.id} name=${JSON.stringify(c.name)}`);
      console.log(`        receiptCourseName=${JSON.stringify(c.receiptCourseName)}  (V111: undefined for pre-V111 sales)`);
      console.log(`        qty=${c.qty} unitPrice=${c.unitPrice}`);
    }

    // ─── 2. Look up the customer doc if customerId present ──────────────
    if (s.customerId) {
      console.log('\n── 2. Linked customer doc ──');
      const custSnap = await root.collection('be_customers').doc(s.customerId).get();
      if (!custSnap.exists) {
        console.log(`  ✗ be_customers/${s.customerId} NOT FOUND`);
      } else {
        const c = custSnap.data();
        console.log(`  customerId         : ${c.customerId || s.customerId}`);
        console.log(`  firstname          : ${JSON.stringify(c.firstname)}`);
        console.log(`  lastname           : ${JSON.stringify(c.lastname)}`);
        console.log(`  patientData.firstNameTh : ${JSON.stringify(c.patientData?.firstNameTh)}`);
        console.log(`  patientData.lastNameTh  : ${JSON.stringify(c.patientData?.lastNameTh)}`);
        console.log(`  patientData.hn          : ${JSON.stringify(c.patientData?.hn)}`);
        console.log(`  nickname           : ${JSON.stringify(c.nickname)}`);
      }
    } else {
      console.log('\n  ⚠ sale has NO customerId — cannot resolve name from be_customers');
    }

    // ─── 3. Look up referenced course master(s) ─────────────────────────
    console.log('\n── 3. Referenced course master(s) ──');
    for (const c of (s.items?.courses || [])) {
      if (!c.id) {
        console.log(`  ⚠ course line missing id — name=${JSON.stringify(c.name)}`);
        continue;
      }
      const cSnap = await root.collection('be_courses').doc(String(c.id)).get();
      if (!cSnap.exists) {
        console.log(`  ✗ be_courses/${c.id} NOT FOUND (line carries snapshot name only)`);
      } else {
        const cm = cSnap.data();
        console.log(`  be_courses/${c.id}:`);
        console.log(`    courseName         : ${JSON.stringify(cm.courseName)}`);
        console.log(`    receiptCourseName  : ${JSON.stringify(cm.receiptCourseName)}  ${cm.receiptCourseName ? '← OVERRIDE SET' : '(empty)'}`);
        console.log(`    salePrice          : ${cm.salePrice}`);
        const willBackfill = cm.receiptCourseName
          && String(cm.receiptCourseName).trim() !== ''
          && c.receiptCourseName !== cm.receiptCourseName;
        console.log(`    V112 backfill needed: ${willBackfill}`);
      }
    }
  }

  // ─── 4. Bug 1 scope: count of empty-customerName sales ────────────────
  console.log('\n── 4. Bug 1 scope: sales with empty customerName ──');
  const salesAll = await root.collection('be_sales').get();
  let totalSales = 0;
  let emptyName = 0;
  let emptyNameWithCustId = 0;
  let emptyNameNoCustId = 0;
  for (const doc of salesAll.docs) {
    totalSales++;
    const s = doc.data();
    const nameEmpty = !s.customerName || String(s.customerName).trim() === '';
    if (nameEmpty) {
      emptyName++;
      if (s.customerId) emptyNameWithCustId++;
      else emptyNameNoCustId++;
    }
  }
  console.log(`  total be_sales            : ${totalSales}`);
  console.log(`  empty customerName        : ${emptyName}`);
  console.log(`    with customerId (resolvable)   : ${emptyNameWithCustId}  ← V112-A backfill candidates`);
  console.log(`    NO customerId (unresolvable)   : ${emptyNameNoCustId}`);

  // ─── 5. Bug 2 scope: count of sales needing receiptCourseName backfill
  console.log('\n── 5. Bug 2 scope: course-line backfill candidates ──');
  // Build course master map first to avoid N+1 reads per line
  const coursesAll = await root.collection('be_courses').get();
  const courseMaster = new Map();
  for (const cd of coursesAll.docs) {
    const cm = cd.data();
    const id = cd.id;
    courseMaster.set(id, cm);
    // Also alias by courseId field if different
    if (cm.courseId && String(cm.courseId) !== id) courseMaster.set(String(cm.courseId), cm);
  }
  console.log(`  be_courses total          : ${coursesAll.size}`);
  let coursesWithOverride = 0;
  for (const cm of courseMaster.values()) {
    if (cm.receiptCourseName && String(cm.receiptCourseName).trim() !== '') {
      coursesWithOverride++;
    }
  }
  console.log(`    with receiptCourseName  : ${coursesWithOverride}`);

  let salesNeedingCourseStamp = 0;
  let courseLinesNeedingStamp = 0;
  let salesAlreadyCorrect = 0;
  const sampleAffected = [];
  for (const doc of salesAll.docs) {
    const s = doc.data();
    const lines = s.items?.courses || [];
    let touched = false;
    for (const cl of lines) {
      const cm = courseMaster.get(String(cl.id));
      if (!cm) continue;
      const masterOverride = String(cm.receiptCourseName || '').trim();
      if (!masterOverride) continue;
      const lineCurrent = String(cl.receiptCourseName || '').trim();
      if (lineCurrent === masterOverride) continue;
      touched = true;
      courseLinesNeedingStamp++;
      if (sampleAffected.length < 5) {
        sampleAffected.push({
          saleId: doc.id,
          courseId: cl.id,
          currentSnapshot: lineCurrent || '(empty/missing)',
          masterOverride,
        });
      }
    }
    if (touched) salesNeedingCourseStamp++;
    else if (lines.length > 0) salesAlreadyCorrect++;
  }
  console.log(`  sales needing course-stamp: ${salesNeedingCourseStamp}  ← V112-B backfill candidates`);
  console.log(`  course-lines to stamp     : ${courseLinesNeedingStamp}`);
  console.log(`  sales already correct     : ${salesAlreadyCorrect}`);

  if (sampleAffected.length) {
    console.log('\n  Sample affected (first 5):');
    for (const a of sampleAffected) {
      console.log(`    ${a.saleId} course ${a.courseId}: "${a.currentSnapshot}" → "${a.masterOverride}"`);
    }
  }

  // ─── 6. Quotation backfill scope ──────────────────────────────────────
  console.log('\n── 6. Bug 2 quotation scope ──');
  const quotesAll = await root.collection('be_quotations').get();
  let quotesNeedingStamp = 0;
  let quoteLinesNeedingStamp = 0;
  for (const doc of quotesAll.docs) {
    const q = doc.data();
    const lines = q.courses || [];
    let touched = false;
    for (const ql of lines) {
      const cm = courseMaster.get(String(ql.courseId || ql.id));
      if (!cm) continue;
      const masterOverride = String(cm.receiptCourseName || '').trim();
      if (!masterOverride) continue;
      const lineCurrent = String(ql.receiptCourseName || '').trim();
      if (lineCurrent === masterOverride) continue;
      touched = true;
      quoteLinesNeedingStamp++;
    }
    if (touched) quotesNeedingStamp++;
  }
  console.log(`  be_quotations total       : ${quotesAll.size}`);
  console.log(`  quotes needing course-stamp: ${quotesNeedingStamp}`);
  console.log(`  quote-lines to stamp      : ${quoteLinesNeedingStamp}`);

  console.log('\n══════ END DIAG ══════\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
