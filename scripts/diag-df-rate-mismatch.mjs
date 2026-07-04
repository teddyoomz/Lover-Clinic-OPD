#!/usr/bin/env node
// DF rate mismatch DIAG (READ-ONLY, Rule R): why do rates entered in
// DfGroupsTab show 0 / "ไม่มีอัตราในกลุ่มนี้" in TFP's DfEntryModal?
//
// Checks:
//  1. be_courses field shape — does `name` exist or only `courseName`?
//     (TFP masterCourseIdByName reads mc.name — V49-class suspect)
//  2. be_df_groups — id/groupId/branchId + rates[].courseId samples
//  3. be_df_staff_rates — staffId/branchId + rates[].courseId samples
//  4. "Shock" courses in be_courses + "Shock" products in be_products
//  5. customers whose courses[] mention Shock — their courseId values
//
// Run: node --env-file=.env.local.prod scripts/diag-df-rate-mismatch.mjs

import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

async function main() {
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
  const db = getFirestore();
  const base = `artifacts/${APP_ID}/public/data`;

  const [coursesSnap, groupsSnap, staffRatesSnap, productsSnap, branchesSnap, staffSnap, doctorsSnap] = await Promise.all([
    db.collection(`${base}/be_courses`).get(),
    db.collection(`${base}/be_df_groups`).get(),
    db.collection(`${base}/be_df_staff_rates`).get(),
    db.collection(`${base}/be_products`).get(),
    db.collection(`${base}/be_branches`).get(),
    db.collection(`${base}/be_staff`).get(),
    db.collection(`${base}/be_doctors`).get(),
  ]);
  const courses = coursesSnap.docs.map(d => ({ __docId: d.id, ...d.data() }));
  const groups = groupsSnap.docs.map(d => ({ __docId: d.id, ...d.data() }));
  const staffRates = staffRatesSnap.docs.map(d => ({ __docId: d.id, ...d.data() }));
  const products = productsSnap.docs.map(d => ({ __docId: d.id, ...d.data() }));
  const branchName = new Map(branchesSnap.docs.map(d => [d.id, d.data().name]));
  const personName = new Map([
    ...staffSnap.docs.map(d => [String(d.id), d.data().name]),
    ...doctorsSnap.docs.map(d => [String(d.id), d.data().name]),
  ]);
  const bn = (bid) => branchName.get(bid) || bid || '(no branchId)';

  // ── 1. be_courses field shape ──
  const withName = courses.filter(c => typeof c.name === 'string' && c.name.trim()).length;
  const withCourseName = courses.filter(c => typeof c.courseName === 'string' && c.courseName.trim()).length;
  console.log(`\n=== 1. be_courses shape (${courses.length} docs) ===`);
  console.log(`  has .name       : ${withName}`);
  console.log(`  has .courseName : ${withCourseName}`);
  const sample = courses[0];
  if (sample) console.log(`  sample keys: ${Object.keys(sample).slice(0, 20).join(', ')}`);

  // ── 2. be_df_groups ──
  console.log(`\n=== 2. be_df_groups (${groups.length} docs) ===`);
  for (const g of groups) {
    const rates = Array.isArray(g.rates) ? g.rates : [];
    console.log(`  • docId=${g.__docId} id=${g.id ?? '-'} groupId=${g.groupId ?? '-'} name="${g.name}" branch=${bn(g.branchId)} status=${g.status ?? '-'} rates=${rates.length}`);
    for (const r of rates.slice(0, 6)) {
      console.log(`      rate courseId=${r.courseId} "${r.courseName || ''}" ${r.value} ${r.type}`);
    }
    if (rates.length > 6) console.log(`      … +${rates.length - 6} more`);
  }

  // ── 3. be_df_staff_rates ──
  console.log(`\n=== 3. be_df_staff_rates (${staffRates.length} docs) ===`);
  for (const s of staffRates) {
    const rates = Array.isArray(s.rates) ? s.rates : [];
    console.log(`  • docId=${s.__docId} staffId=${s.staffId} "${s.staffName || personName.get(String(s.staffId)) || ''}" branch=${bn(s.branchId)} rates=${rates.length}`);
    for (const r of rates.slice(0, 6)) {
      console.log(`      rate courseId=${r.courseId} "${r.courseName || ''}" ${r.value} ${r.type}`);
    }
  }

  // ── 4. Shock courses + products ──
  const shockRe = /shock|ช็อค|ช๊อค/i;
  const shockCourses = courses.filter(c => shockRe.test(String(c.courseName || c.name || '')));
  console.log(`\n=== 4a. "Shock" in be_courses (${shockCourses.length}) ===`);
  for (const c of shockCourses) {
    console.log(`  • docId=${c.__docId} courseId=${c.courseId ?? '-'} name="${c.courseName || c.name}" price=${c.salePrice ?? c.price ?? '-'} type=${c.courseType ?? '-'} branch=${bn(c.branchId)} hidden=${c.isHidden ?? '-'} status=${c.status ?? '-'}`);
  }
  const shockProducts = products.filter(p => shockRe.test(String(p.productName || p.name || '')));
  console.log(`\n=== 4b. "Shock" in be_products (${shockProducts.length}) ===`);
  for (const p of shockProducts) {
    console.log(`  • docId=${p.__docId} productId=${p.productId ?? '-'} name="${p.productName || p.name}" branch=${bn(p.branchId)}`);
  }

  // ── 5. customers with Shock in courses[] ──
  const custSnap = await db.collection(`${base}/be_customers`).get();
  console.log(`\n=== 5. customers with "Shock" in courses[] ===`);
  let shown = 0;
  for (const d of custSnap.docs) {
    const c = d.data();
    const hits = (c.courses || []).filter(cc => shockRe.test(String(cc.name || cc.courseName || '')));
    if (hits.length === 0) continue;
    shown++;
    if (shown > 5) { console.log('  … more customers omitted'); break; }
    console.log(`  • ${d.id} "${(c.firstname || '') + ' ' + (c.lastname || '')}" HN=${c.customerHN ?? '-'}`);
    for (const cc of hits.slice(0, 4)) {
      console.log(`      course courseId=${cc.courseId ?? '-'} name="${cc.name || cc.courseName}" qty=${cc.qty ?? '-'} product="${cc.product ?? ''}"`);
    }
  }
  if (shown === 0) console.log('  (none found)');

  console.log('\nDone (read-only).');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
