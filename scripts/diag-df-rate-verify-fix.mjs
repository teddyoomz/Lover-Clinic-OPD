#!/usr/bin/env node
// DF rate fix VERIFY (READ-ONLY, Rule Q L2, AV200): import the REAL helpers
// (buildMasterIdByName + buildDefaultRows + getRateForStaffCourse) and run
// them against REAL prod be_courses / be_products / be_df_groups /
// be_df_staff_rates — the EXACT resolution chain TFP's DfEntryModal uses.
//
// Asserts:
//  1. PRE-FIX repro: a map built the old way (['name']) over real prod
//     courses is EMPTY → rate resolves 0 (the bug the user saw).
//  2. POST-FIX: course row "Shock Wave 12 ครั้ง + ติดตามอาการกับแพทย์ 2 ครั้ง"
//     (real customer LC-26000009's course) resolves the REAL entered rate
//     from group ผู้ช่วยแพทย์ (DFG-0526-b1399741) — value > 0, source 'group'.
//  3. Product chain: name "Shock wave" resolves to a be_products id via the
//     product map (course map misses it) — rate auto-fills once admin adds a
//     kind:'product' rate for it.
//
// Run: node --env-file=.env.local.prod scripts/diag-df-rate-verify-fix.mjs

import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildMasterIdByName, buildDefaultRows } from '../src/lib/dfEntryValidation.js';
import { getRateForStaffCourse } from '../src/lib/dfGroupValidation.js';

const APP_ID = 'loverclinic-opd-4c39b';
const NAKHON = 'BR-1777873556815-26df6480';
const GROUP_ASSIST = 'DFG-0526-b1399741'; // ผู้ช่วยแพทย์
const COURSE_NAME = 'Shock Wave 12 ครั้ง + ติดตามอาการกับแพทย์ 2 ครั้ง'; // LC-26000009's real course
const PRODUCT_NAME = 'Shock wave';

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
  const db = getFirestore();
  const base = `artifacts/${APP_ID}/public/data`;

  const [coursesSnap, productsSnap, groupsSnap, staffRatesSnap] = await Promise.all([
    db.collection(`${base}/be_courses`).where('branchId', '==', NAKHON).get(),
    db.collection(`${base}/be_products`).where('branchId', '==', NAKHON).get(),
    db.collection(`${base}/be_df_groups`).get(),
    db.collection(`${base}/be_df_staff_rates`).get(),
  ]);
  const courses = coursesSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  const products = productsSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  const groups = groupsSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  const staffRates = staffRatesSnap.docs.map(d => ({ ...d.data(), id: d.id }));
  console.log(`\n=== AV200 Rule Q L2 — real helpers vs real prod (นครราชสีมา: ${courses.length} courses, ${products.length} products, ${groups.length} groups) ===\n`);

  // 1. PRE-FIX repro — the old map shape over real prod data.
  const brokenMap = buildMasterIdByName(courses, ['name'], ['id']);
  check('1a. PRE-FIX map (legacy .name) over real prod courses is EMPTY (บั๊คเดิมมีจริง)', brokenMap.size === 0, `size=${brokenMap.size}`);
  const brokenCid = brokenMap.get(COURSE_NAME) || COURSE_NAME;
  const brokenRows = buildDefaultRows([{ courseId: brokenCid, courseName: COURSE_NAME }], 'staff-x', GROUP_ASSIST, groups, staffRates, getRateForStaffCourse);
  check('1b. PRE-FIX row resolves 0 (สิ่งที่ผู้ใช้เห็นใน screenshot)', brokenRows[0]?.value === 0 && brokenRows[0]?.source === null, `value=${brokenRows[0]?.value}`);

  // 2. POST-FIX — canonical-first map + the exact modal chain.
  const courseMap = buildMasterIdByName(courses, ['courseName', 'name'], ['id', 'courseId']);
  check('2a. POST-FIX course map non-empty', courseMap.size > 0, `size=${courseMap.size}`);
  const cid = courseMap.get(COURSE_NAME) || COURSE_NAME;
  check('2b. course name → master id (ไม่ใช่ pseudo-name)', cid !== COURSE_NAME, `cid=${cid}`);
  const rows = buildDefaultRows([{ courseId: cid, courseName: COURSE_NAME }], 'staff-x', GROUP_ASSIST, groups, staffRates, getRateForStaffCourse);
  check('2c. แถวคอร์ส resolve อัตราที่กรอกจริงจากกลุ่มผู้ช่วยแพทย์ (value > 0, source group)',
    rows[0]?.value > 0 && rows[0]?.source === 'group' && rows[0]?.enabled === true,
    `value=${rows[0]?.value} type=${rows[0]?.type} source=${rows[0]?.source}`);

  // 3. Product chain — "Shock wave" resolves via the product map.
  const productMap = buildMasterIdByName(products, ['productName', 'name'], ['id', 'productId']);
  const pcid = courseMap.get(PRODUCT_NAME) || productMap.get(PRODUCT_NAME) || PRODUCT_NAME;
  check('3a. product map non-empty', productMap.size > 0, `size=${productMap.size}`);
  check(`3b. "${PRODUCT_NAME}" → be_products id via chain (course-first, product fallback)`, pcid !== PRODUCT_NAME && productMap.get(PRODUCT_NAME) === pcid, `cid=${pcid}`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`} (read-only)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
