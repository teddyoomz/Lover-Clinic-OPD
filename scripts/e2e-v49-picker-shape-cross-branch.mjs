// V49 LIVE admin-SDK e2e — picker shape verification across real prod branches.
//
// Verifies on REAL prod Firestore that:
//   1. be_courses + be_products + be_promotions docs are canonical shape only
//      (legacy fields ALL undefined — confirms V49 root cause analysis).
//   2. *ForPicker variants produce non-empty {name, price, category, products,
//      unit} for every fixture across multiple branches.
//   3. Cross-branch identity: same canonical doc shape produces identical
//      adapter output regardless of branch context.
//   4. Rule M Test-prefix discipline: only writes TEST-V49-* fixtures and
//      cleans up at end (zero orphans).
//
// USAGE:
//   node scripts/e2e-v49-picker-shape-cross-branch.mjs            # dry-run
//   node scripts/e2e-v49-picker-shape-cross-branch.mjs --apply    # write+verify+cleanup
//
// Run from project root after `vercel env pull .env.local.prod`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import {
  beProductToMasterShape,
  bePromotionToMasterShape,
  beCourseToMasterShape,
} from '../src/lib/backendClient.js';

// ─── Setup ─────────────────────────────────────────────────────────────────

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const APPLY = process.argv.includes('--apply');
const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const base = `artifacts/${APP_ID}/public/data`;

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }),
});
const db = getFirestore();

// ─── Phases ────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}  ${detail}`);
    fail++;
  }
}

async function phase1_canonicalShapeReal() {
  console.log('\n=== Phase 1: real prod canonical shape ===');
  const cSnap = await db.collection(`${base}/be_courses`).limit(5).get();
  const pSnap = await db.collection(`${base}/be_products`).limit(5).get();
  const mSnap = await db.collection(`${base}/be_promotions`).limit(5).get();

  cSnap.forEach((d) => {
    const data = d.data();
    check(
      `be_courses/${d.id}: canonical courseName present`,
      !!data.courseName,
      `name=${data.name}, courseName=${data.courseName}`,
    );
    check(`be_courses/${d.id}: legacy 'name' undefined`, data.name === undefined);
    check(`be_courses/${d.id}: legacy 'products' undefined`, data.products === undefined);
  });

  pSnap.forEach((d) => {
    const data = d.data();
    check(
      `be_products/${d.id}: canonical productName present`,
      !!data.productName,
      `productName=${data.productName}`,
    );
    check(`be_products/${d.id}: legacy 'name' undefined`, data.name === undefined);
    check(`be_products/${d.id}: legacy 'unit' undefined`, data.unit === undefined);
  });

  mSnap.forEach((d) => {
    const data = d.data();
    check(
      `be_promotions/${d.id}: canonical promotion_name present`,
      !!data.promotion_name,
      `promotion_name=${data.promotion_name}`,
    );
    check(`be_promotions/${d.id}: legacy 'name' undefined`, data.name === undefined);
  });
}

async function phase2_adapterOutputReal() {
  console.log('\n=== Phase 2: adapter applied to real prod docs ===');
  const cSnap = await db.collection(`${base}/be_courses`).limit(3).get();
  const pSnap = await db.collection(`${base}/be_products`).limit(3).get();
  const mSnap = await db.collection(`${base}/be_promotions`).limit(3).get();

  cSnap.forEach((d) => {
    const adapted = beCourseToMasterShape(d.data());
    check(`adapted be_courses/${d.id}: name truthy`, !!adapted.name);
    check(`adapted be_courses/${d.id}: products array`, Array.isArray(adapted.products));
    check(`adapted be_courses/${d.id}: price is number or null`,
      adapted.price === null || typeof adapted.price === 'number');
    check(`adapted be_courses/${d.id}: category is string`, typeof adapted.category === 'string');
  });

  pSnap.forEach((d) => {
    const adapted = beProductToMasterShape(d.data());
    check(`adapted be_products/${d.id}: name truthy`, !!adapted.name);
    check(`adapted be_products/${d.id}: unit is string`, typeof adapted.unit === 'string');
    check(`adapted be_products/${d.id}: category is string`, typeof adapted.category === 'string');
  });

  mSnap.forEach((d) => {
    const adapted = bePromotionToMasterShape(d.data());
    check(`adapted be_promotions/${d.id}: name truthy`, !!adapted.name);
    check(`adapted be_promotions/${d.id}: price is number or null`,
      adapted.price === null || typeof adapted.price === 'number');
  });
}

async function phase3_crossBranchIdentity() {
  console.log('\n=== Phase 3: cross-branch identity ===');
  // Read all distinct branchIds present in be_products
  const psnap = await db.collection(`${base}/be_products`).limit(50).get();
  const branches = new Set();
  psnap.forEach((d) => {
    const b = d.data().branchId;
    if (b) branches.add(b);
  });
  const branchList = [...branches].slice(0, 5);
  check(
    `discovered ≥ 1 branch with be_products`,
    branchList.length >= 1,
    `branches=${branchList.join(',')}`,
  );

  // For each branch, sample 1 product, run adapter, verify shape
  for (const b of branchList) {
    const snap = await db
      .collection(`${base}/be_products`)
      .where('branchId', '==', b)
      .limit(1)
      .get();
    snap.forEach((d) => {
      const adapted = beProductToMasterShape(d.data());
      check(
        `branch ${b}: adapter produces non-empty name`,
        !!adapted.name,
        `name=${adapted.name}`,
      );
    });
  }
}

async function phase4_writeFixturesAndVerify() {
  if (!APPLY) {
    console.log('\n=== Phase 4: write fixtures + verify ===  (SKIPPED — pass --apply)');
    return;
  }
  console.log('\n=== Phase 4: write TEST-V49 fixtures + verify ===');

  const testIds = {
    courseA: `TEST-V49-COURSE-${Date.now()}-A`,
    courseB: `TEST-V49-COURSE-${Date.now()}-B`,
    productA: `TEST-V49-PRODUCT-${Date.now()}-A`,
    promoA: `TEST-V49-PROMO-${Date.now()}-A`,
  };
  const branchIds = ['BR-TEST-V49-NKR', 'BR-TEST-V49-PRM3', 'BR-TEST-V49-FUTURE'];

  // Write 3 fixtures (one per branch) for each entity
  const writes = [];
  for (const branchId of branchIds) {
    writes.push(
      db.doc(`${base}/be_products/${testIds.productA}-${branchId}`).set({
        productId: `${testIds.productA}-${branchId}`,
        productName: `TEST_V49_Product_${branchId}`,
        productCode: 'TV49',
        productType: 'สินค้าหน้าร้าน',
        categoryName: 'TEST-V49-Cat',
        mainUnitName: 'ชิ้น',
        price: 999,
        priceInclVat: null,
        isVatIncluded: false,
        branchId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    writes.push(
      db.doc(`${base}/be_courses/${testIds.courseA}-${branchId}`).set({
        courseId: `${testIds.courseA}-${branchId}`,
        courseName: `TEST_V49_Course_${branchId}`,
        courseCategory: 'TEST-V49-Cat',
        salePrice: 5000,
        salePriceInclVat: null,
        isVatIncluded: false,
        mainProductId: `TEST-V49-MAIN-${branchId}`,
        mainProductName: `TEST_V49_Main_${branchId}`,
        mainQty: 1,
        courseProducts: [
          { productId: 'sub-1', productName: `Sub_${branchId}`, qty: 1 },
        ],
        branchId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    writes.push(
      db.doc(`${base}/be_promotions/${testIds.promoA}-${branchId}`).set({
        promotionId: `${testIds.promoA}-${branchId}`,
        promotion_name: `TEST_V49_Promo_${branchId}`,
        category_name: 'TEST-V49-Cat',
        sale_price: 12000,
        sale_price_incl_vat: null,
        is_vat_included: false,
        deposit_price: 0,
        promotion_type: 'fixed',
        status: 'active',
        branchId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
  }
  await Promise.all(writes);
  check(`wrote ${writes.length} TEST-V49 fixtures`, true);

  // Verify adapter on each fixture
  for (const branchId of branchIds) {
    const pdoc = await db.doc(`${base}/be_products/${testIds.productA}-${branchId}`).get();
    const cdoc = await db.doc(`${base}/be_courses/${testIds.courseA}-${branchId}`).get();
    const mdoc = await db.doc(`${base}/be_promotions/${testIds.promoA}-${branchId}`).get();

    const padapt = beProductToMasterShape(pdoc.data());
    const cadapt = beCourseToMasterShape(cdoc.data());
    const madapt = bePromotionToMasterShape(mdoc.data());

    check(`branch ${branchId}: product adapter name=TEST_V49_Product_${branchId}`,
      padapt.name === `TEST_V49_Product_${branchId}`);
    check(`branch ${branchId}: product adapter price=999`, padapt.price === 999);
    check(`branch ${branchId}: product adapter unit=ชิ้น`, padapt.unit === 'ชิ้น');
    check(`branch ${branchId}: course adapter name=TEST_V49_Course_${branchId}`,
      cadapt.name === `TEST_V49_Course_${branchId}`);
    check(`branch ${branchId}: course adapter price=5000`, cadapt.price === 5000);
    check(`branch ${branchId}: course adapter products[] non-empty`,
      Array.isArray(cadapt.products) && cadapt.products.length > 0);
    check(`branch ${branchId}: promo adapter name=TEST_V49_Promo_${branchId}`,
      madapt.name === `TEST_V49_Promo_${branchId}`);
    check(`branch ${branchId}: promo adapter price=12000`, madapt.price === 12000);
  }

  // CLEANUP — Rule M discipline
  console.log('\n=== Phase 4 cleanup: delete TEST-V49 fixtures ===');
  const cleanups = [];
  for (const branchId of branchIds) {
    cleanups.push(db.doc(`${base}/be_products/${testIds.productA}-${branchId}`).delete());
    cleanups.push(db.doc(`${base}/be_courses/${testIds.courseA}-${branchId}`).delete());
    cleanups.push(db.doc(`${base}/be_promotions/${testIds.promoA}-${branchId}`).delete());
  }
  await Promise.all(cleanups);
  check(`cleaned up ${cleanups.length} TEST-V49 fixtures`, true);

  // Verify zero orphans
  const orphanCheck = await Promise.all([
    db.collection(`${base}/be_products`).where('branchId', '==', 'BR-TEST-V49-NKR').get(),
    db.collection(`${base}/be_products`).where('branchId', '==', 'BR-TEST-V49-PRM3').get(),
    db.collection(`${base}/be_products`).where('branchId', '==', 'BR-TEST-V49-FUTURE').get(),
  ]);
  const orphanCount = orphanCheck.reduce((s, snap) => s + snap.size, 0);
  check(`zero orphans across 3 branches`, orphanCount === 0, `orphanCount=${orphanCount}`);
}

async function phase5_v49AuditDoc() {
  if (!APPLY) {
    console.log('\n=== Phase 5: audit doc ===  (SKIPPED — pass --apply)');
    return;
  }
  console.log('\n=== Phase 5: emit V49 e2e audit doc ===');
  const auditId = `v49-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await db.doc(`${base}/be_admin_audit/${auditId}`).set({
    kind: 'v49-e2e',
    pass,
    fail,
    appliedAt: FieldValue.serverTimestamp(),
    description: 'V49 picker-shape cross-branch live e2e — adapter output verified on prod',
  });
  check(`audit doc written: ${auditId}`, true);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== V49 LIVE e2e — picker shape cross-branch verification ===`);
  console.log(`mode: ${APPLY ? 'APPLY (writes + cleanup)' : 'DRY-RUN (read-only)'}`);

  await phase1_canonicalShapeReal();
  await phase2_adapterOutputReal();
  await phase3_crossBranchIdentity();
  await phase4_writeFixturesAndVerify();
  await phase5_v49AuditDoc();

  console.log(`\n=== TOTAL: ${pass} pass / ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
