#!/usr/bin/env node
// ─── E2E: every migrate button × happy + adversarial × deep mapping ───────
//
// Per user directive 2026-05-07: "เทส e2e แบบครอบคลุมทุกกรณี แบบจับผิดตัวเอง
// สุดความสามารถ แบบเหมือนมนุษย์ใช้จริงด้วย แบบรัดกุมสุดๆ".
//
// For each of 19 migrate buttons in MasterDataTab:
//   1. Build TEST source fixture in master_data/{type}/items/TEST-DECIES-...
//   2. Invoke the actual mapper from src/lib/backendClient.js or
//      src/lib/phase9Mappers.js with branchId=TEST_PRAM3
//   3. Write the mapper output to be_{collection}/<TEST-id> via admin SDK
//      (mirrors what runMasterToBeMigration does in production)
//   4. Read be_{collection}/<TEST-id> back
//   5. Assert:
//      a) Doc exists
//      b) For branch-scoped: branchId === TEST_PRAM3
//      c) Canonical entityId field present + equals docId
//      d) Field-by-field shape matches expected (deep mapping check)
//   6. Cleanup TEST source + TEST target
//
// Plus DEEP mapping coverage for products/courses/promotions/coupons/vouchers
// + adversarial inputs (null, empty, snake↔camel, missing optional, Thai chars).
//
// Pure read+TEST-prefixed-write — no impact on production data.
//
// Run: node scripts/e2e-migrate-all-buttons.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  buildBePromotionFromMaster,
  buildBeCouponFromMaster,
  buildBeVoucherFromMaster,
} from '../src/lib/phase9Mappers.js';

import {
  mapMasterToProductGroup,
  mapMasterToProductUnit,
  mapMasterToMedicalInstrument,
  mapMasterToHoliday,
  mapMasterToBranch,
  mapMasterToPermissionGroup,
  mapMasterToDfGroup,
  mapMasterToDfStaffRates,
  mapMasterToWalletType,
  mapMasterToMembershipType,
  mapMasterToMedicineLabel,
  mapMasterToStaff,
  mapMasterToDoctor,
  mapMasterToProduct,
  mapMasterToCourse,
  mapMasterToBeStaffSchedule,
} from '../src/lib/backendClient.js';

// ─── Env load ──────────────────────────────────────────────────────────────
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const envText = readFileSync(envFile, 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const TEST_PRAM3 = 'TEST-BR-PRAM3-DECIES';
const TEST_PREFIX = 'TEST-DECIES';

if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!clientEmail || !privateKey) {
    console.error('Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY in env');
    process.exit(1);
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

// ─── Test runner state ─────────────────────────────────────────────────────
const results = [];
let totalAssertions = 0;
let passedAssertions = 0;
const cleanup = []; // {col, docId} pairs to delete at end

function assert(condition, message) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    return true;
  }
  console.log(`    ✗ FAIL: ${message}`);
  return false;
}

function deepEqualField(actual, expected, fieldPath) {
  // Tolerant equality: numbers compared as Number, strings as String, etc.
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (actual.length !== expected.length) return false;
    return expected.every((e, i) => deepEqualField(actual[i], e, `${fieldPath}[${i}]`));
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') return false;
    return Object.keys(expected).every((k) => deepEqualField(actual[k], expected[k], `${fieldPath}.${k}`));
  }
  return actual === expected;
}

// ─── Per-test helpers ──────────────────────────────────────────────────────

async function writeAndReadBack({ col, docId, doc }) {
  const ref = db.collection(`${BASE_PATH}/${col}`).doc(docId);
  await ref.set(doc, { merge: false });
  cleanup.push({ col, docId });
  const snap = await ref.get();
  return snap.exists ? { ...snap.data(), id: snap.id } : null;
}

function nowIso() { return new Date().toISOString(); }

// ─── 19 entity test cases ──────────────────────────────────────────────────

// Each test case defines: name, mapper, sourceFixture(s), targetCollection,
// expectedShape, branchScoped flag.

const TESTS = [
  // ─── Catalog (post-octies, post-V39 — should all stamp branchId) ──────────
  {
    name: 'products (สินค้า) — happy path',
    mapper: (src, id, now, prev, branchId) => mapMasterToProduct(src, id, now, prev, branchId),
    targetCol: 'be_products',
    canonicalIdField: 'productId',
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path — full ProClinic shape',
        src: {
          productName: 'TEST-Allergan 100 U',
          productCode: 'TEST-ALG100',
          productType: 'ยา',
          serviceType: '',
          categoryName: 'Botox',
          mainUnitName: 'U',
          price: 100,
          priceInclVat: 107,
          isVatIncluded: true,
          isClaimDrugDiscount: false,
          isTakeawayProduct: false,
          alertDayBeforeExpire: 30,
          status: 'ใช้งาน',
        },
        expectedShape: {
          productId: '__DOCID__',
          productName: 'TEST-Allergan 100 U',
          productCode: 'TEST-ALG100',
          productType: 'ยา',
          categoryName: 'Botox',
          mainUnitName: 'U',
          price: 100,
          priceInclVat: 107,
          isVatIncluded: true,
          alertDayBeforeExpire: 30,
          status: 'ใช้งาน',
          branchId: '__TEST_PRAM3__',
        },
      },
      {
        label: 'adversarial — productType "ยากลับบ้าน" should normalize to "ยา"',
        src: { productName: 'TEST-yakap', productType: 'ยากลับบ้าน', price: 50 },
        expectedShape: { productType: 'ยา', productName: 'TEST-yakap', price: 50, branchId: '__TEST_PRAM3__' },
      },
      {
        label: 'adversarial — snake_case fallback (price as string)',
        src: { product_name: 'TEST-snake', sale_price: '99.50' },
        expectedShape: { productName: 'TEST-snake', price: 99.5, branchId: '__TEST_PRAM3__' },
      },
      {
        label: 'adversarial — missing branchId in src + arg empty → empty stamp',
        src: { productName: 'TEST-no-branch' },
        argBranchId: '',
        expectedShape: { productName: 'TEST-no-branch', branchId: '' },
        skipBranchScopedAssertion: true,
      },
      {
        label: 'adversarial — productType invalid → fallback ยา',
        src: { productName: 'TEST-invalid-type', productType: 'XYZ' },
        expectedShape: { productType: 'ยา', branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  {
    name: 'courses (คอร์ส) — happy path + adversarial',
    mapper: mapMasterToCourse,
    targetCol: 'be_courses',
    canonicalIdField: 'courseId',
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path — basic course',
        src: {
          courseName: 'TEST-Allergan เหมาทั่วหน้า',
          courseCode: 'TEST-ALG',
          courseType: 'นับครั้ง',
          courseCategory: 'Botox',
          salePrice: 19900,
          status: 'ใช้งาน',
        },
        expectedShape: {
          courseId: '__DOCID__',
          courseName: 'TEST-Allergan เหมาทั่วหน้า',
          courseType: 'นับครั้ง',
          courseCategory: 'Botox',
          salePrice: 19900,
          status: 'ใช้งาน',
          branchId: '__TEST_PRAM3__',
        },
      },
      {
        label: 'adversarial — buffet course with daysBeforeExpire (period as number)',
        src: {
          courseName: 'TEST-buffet',
          courseType: 'buffet',
          daysBeforeExpire: 90,
          period: 3, // schema expects numeric (numOrNull); strings get rejected
          salePrice: 0,
        },
        expectedShape: { courseType: 'buffet', daysBeforeExpire: 90, period: 3, branchId: '__TEST_PRAM3__' },
      },
      {
        label: 'adversarial — period as non-numeric string → dropped to null (schema contract)',
        src: { courseName: 'TEST-period-string', period: '3 เดือน' },
        expectedShape: { courseName: 'TEST-period-string', period: null, branchId: '__TEST_PRAM3__' },
      },
      {
        label: 'adversarial — Thai chars + null fields',
        src: { courseName: 'TEST-วิตามินผิวใส 5 ครั้ง', salePrice: null, courseProducts: null },
        expectedShape: { courseName: 'TEST-วิตามินผิวใส 5 ครั้ง', branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  {
    name: 'promotions (โปรโมชัน) — V39 fix verification',
    mapper: buildBePromotionFromMaster,
    targetCol: 'be_promotions',
    canonicalIdField: 'promotionId',
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path — promotion with courses + products',
        src: {
          name: 'TEST-Promotion 1',
          price: 5000,
          category: 'Botox',
          isVatIncluded: 1,
          courses: [{ id: 'c1', name: 'C1', qty: 1, price: 1000, products: [] }],
          products: [{ id: 'p1', name: 'P1', qty: 1, price: 100, unit: 'U' }],
        },
        expectedShape: {
          promotionId: '__DOCID__',
          promotion_name: 'TEST-Promotion 1',
          sale_price: 5000,
          category_name: 'Botox',
          is_vat_included: true,
          status: 'active',
          branchId: '__TEST_PRAM3__',
        },
      },
      {
        label: 'adversarial — empty courses + products',
        src: { name: 'TEST-Promo-empty', price: 100 },
        expectedShape: { promotion_name: 'TEST-Promo-empty', sale_price: 100, courses: [], products: [], branchId: '__TEST_PRAM3__' },
      },
      {
        label: 'adversarial — missing name should return null (skip)',
        src: { price: 100 },
        expectMapperNull: true,
      },
    ],
  },
  {
    name: 'coupons (คูปอง) — V39 fix verification',
    mapper: buildBeCouponFromMaster,
    targetCol: 'be_coupons',
    canonicalIdField: 'couponId',
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-Cpn', coupon_code: 'TEST10', discount: 10, discount_type: 'percent' },
        expectedShape: { coupon_name: 'TEST-Cpn', coupon_code: 'TEST10', discount: 10, discount_type: 'percent', branchId: '__TEST_PRAM3__' },
      },
      {
        label: 'adversarial — discount_type "baht" preserved',
        src: { coupon_name: 'TEST-Cpn-Baht', coupon_code: 'TESTBAHT', discount: 50, discount_type: 'baht' },
        expectedShape: { discount_type: 'baht', discount: 50, branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  {
    name: 'vouchers (Voucher) — V39 fix verification',
    mapper: buildBeVoucherFromMaster,
    targetCol: 'be_vouchers',
    canonicalIdField: 'voucherId',
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-Vch', price: 500, commission_percent: 10, platform: 'Lazada' },
        expectedShape: { voucher_name: 'TEST-Vch', sale_price: 500, commission_percent: 10, platform: 'Lazada', status: 'active', branchId: '__TEST_PRAM3__' },
      },
      {
        label: 'adversarial — status="suspended" preserved',
        src: { voucher_name: 'TEST-Vch-suspended', price: 100, status: 'suspended' },
        expectedShape: { status: 'suspended', branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  // ─── Master-data catalog ─────────────────────────────────────────────────
  {
    name: 'product_groups (กลุ่มสินค้า)',
    mapper: mapMasterToProductGroup,
    targetCol: 'be_product_groups',
    canonicalIdField: null, // doesn't have canonical id in mapper output (uses docId)
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-group', productType: 'ยา', status: 'ใช้งาน' },
        expectedShape: { name: 'TEST-group', branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  {
    name: 'product_units (หน่วยสินค้า)',
    mapper: mapMasterToProductUnit,
    targetCol: 'be_product_unit_groups',
    canonicalIdField: null,
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-unit', units: [{ name: 'U', amount: 1 }] },
        expectedShape: { branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  {
    name: 'medical_instruments (เครื่องหัตถการ)',
    mapper: mapMasterToMedicalInstrument,
    targetCol: 'be_medical_instruments',
    canonicalIdField: null,
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-instrument', category: 'laser' },
        expectedShape: { branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  {
    name: 'holidays (วันหยุด)',
    mapper: mapMasterToHoliday,
    targetCol: 'be_holidays',
    canonicalIdField: null,
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path — specific date',
        src: { name: 'TEST-holiday', type: 'specific', dates: ['2026-05-07'] },
        expectedShape: { branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  {
    name: 'df_groups (กลุ่มค่ามือ)',
    mapper: mapMasterToDfGroup,
    targetCol: 'be_df_groups',
    canonicalIdField: null,
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-df-group', status: 'ใช้งาน' },
        expectedShape: { branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  {
    name: 'df_staff_rates (ค่ามือต่อแพทย์/ผู้ช่วย) — V39 fix',
    mapper: mapMasterToDfStaffRates,
    targetCol: 'be_df_staff_rates',
    canonicalIdField: null,
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path',
        src: { staffName: 'TEST-Doc', rates: [{ courseId: 'c1', courseName: 'C1', value: 500, type: 'baht' }] },
        expectedShape: { staffName: 'TEST-Doc', branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  {
    name: 'staff_schedules (ตารางหมอ + พนักงาน)',
    mapper: (src, id, now, prev, branchId) => {
      // staff_schedules uses a different mapper signature: (src, match, now)
      // src must include branchId for the migrate filter; pass match shim
      const match = { id: 'TEST-staff-1', name: 'TEST Staff', type: 'doctor' };
      return mapMasterToBeStaffSchedule({ ...src, proClinicId: id, branchId }, match, now);
    },
    targetCol: 'be_staff_schedules',
    canonicalIdField: 'scheduleId',
    branchScoped: true,
    fixtures: [
      {
        label: 'happy path — recurring',
        src: { proClinicStaffId: 'TEST-staff-1', proClinicStaffName: 'TEST Staff', type: 'recurring', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
        expectedShape: { staffName: 'TEST Staff', type: 'recurring', dayOfWeek: 1, branchId: '__TEST_PRAM3__' },
      },
    ],
  },
  // ─── Universal collections ────────────────────────────────────────────────
  {
    name: 'branches (สาขา) — universal',
    mapper: mapMasterToBranch,
    targetCol: 'be_branches',
    canonicalIdField: null,
    branchScoped: false,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-branch' },
        expectedShape: { /* no branchId expected */ },
      },
    ],
  },
  {
    name: 'permission_groups (สิทธิ์การใช้งาน) — universal',
    mapper: mapMasterToPermissionGroup,
    targetCol: 'be_permission_groups',
    canonicalIdField: null,
    branchScoped: false,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-perm-group' },
        expectedShape: {},
      },
    ],
  },
  {
    name: 'wallet_types (กระเป๋าเงิน) — universal',
    mapper: mapMasterToWalletType,
    targetCol: 'be_wallet_types',
    canonicalIdField: null,
    branchScoped: false,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-wallet' },
        expectedShape: { name: 'TEST-wallet' },
      },
    ],
  },
  {
    name: 'membership_types (บัตรสมาชิก) — universal',
    mapper: mapMasterToMembershipType,
    targetCol: 'be_membership_types',
    canonicalIdField: null,
    branchScoped: false,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-mship', credit: 1000, price: 999 },
        expectedShape: { name: 'TEST-mship', credit: 1000, price: 999 },
      },
    ],
  },
  {
    name: 'medicine_labels (Preset ฉลากยา) — universal',
    mapper: mapMasterToMedicineLabel,
    targetCol: 'be_medicine_labels',
    canonicalIdField: null,
    branchScoped: false,
    fixtures: [
      {
        label: 'happy path',
        src: { name: 'TEST-label', type: 'oral' },
        expectedShape: { name: 'TEST-label' },
      },
    ],
  },
  {
    name: 'staff (พนักงาน) — universal',
    mapper: mapMasterToStaff,
    targetCol: 'be_staff',
    canonicalIdField: null,
    branchScoped: false,
    fixtures: [
      {
        label: 'happy path',
        src: { firstname: 'TEST', lastname: 'Staff' },
        expectedShape: {},
      },
    ],
  },
  {
    name: 'doctors (แพทย์/ผู้ช่วย) — universal',
    mapper: mapMasterToDoctor,
    targetCol: 'be_doctors',
    canonicalIdField: null,
    branchScoped: false,
    fixtures: [
      {
        label: 'happy path',
        src: { firstname: 'TEST', lastname: 'Doc' },
        expectedShape: {},
      },
    ],
  },
];

// ─── Run + assert ──────────────────────────────────────────────────────────

async function runTest(test) {
  console.log(`\n▸ ${test.name}`);
  let testPasses = 0;
  let testFails = 0;
  for (const fixture of test.fixtures) {
    const docId = `${TEST_PREFIX}-${test.targetCol}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const branchIdArg = fixture.argBranchId !== undefined ? fixture.argBranchId : TEST_PRAM3;

    let mapperOutput;
    try {
      mapperOutput = test.mapper(fixture.src, docId, nowIso(), null, branchIdArg);
    } catch (err) {
      console.log(`  ✗ ${fixture.label}: mapper threw — ${err.message}`);
      testFails++;
      continue;
    }

    if (fixture.expectMapperNull) {
      if (mapperOutput === null) {
        console.log(`  ✓ ${fixture.label}: mapper returned null as expected`);
        passedAssertions++;
        totalAssertions++;
        testPasses++;
      } else {
        console.log(`  ✗ ${fixture.label}: expected null, got: ${JSON.stringify(mapperOutput).slice(0, 80)}`);
        totalAssertions++;
        testFails++;
      }
      continue;
    }

    if (!mapperOutput) {
      console.log(`  ✗ ${fixture.label}: mapper returned null/undefined`);
      totalAssertions++;
      testFails++;
      continue;
    }

    // Write to be_* via admin SDK + read back
    const stored = await writeAndReadBack({ col: test.targetCol, docId, doc: mapperOutput });

    if (!stored) {
      console.log(`  ✗ ${fixture.label}: doc not found after write`);
      totalAssertions++;
      testFails++;
      continue;
    }

    let fixturePasses = 0;
    let fixtureFails = 0;

    // Branch-scoped assertion
    if (test.branchScoped && !fixture.skipBranchScopedAssertion) {
      const ok = assert(stored.branchId === TEST_PRAM3, `${fixture.label} :: branchId expected '${TEST_PRAM3}' but got '${stored.branchId}'`);
      if (ok) fixturePasses++; else fixtureFails++;
    }

    // Canonical id field
    if (test.canonicalIdField) {
      const ok = assert(stored[test.canonicalIdField] === docId, `${fixture.label} :: ${test.canonicalIdField} expected '${docId}' but got '${stored[test.canonicalIdField]}'`);
      if (ok) fixturePasses++; else fixtureFails++;
    }

    // Deep field-by-field assertion
    if (fixture.expectedShape) {
      for (const [key, expected] of Object.entries(fixture.expectedShape)) {
        let resolvedExpected = expected;
        if (resolvedExpected === '__DOCID__') resolvedExpected = docId;
        if (resolvedExpected === '__TEST_PRAM3__') resolvedExpected = TEST_PRAM3;
        const ok = assert(deepEqualField(stored[key], resolvedExpected, key), `${fixture.label} :: ${key} expected ${JSON.stringify(resolvedExpected)} but got ${JSON.stringify(stored[key])}`);
        if (ok) fixturePasses++; else fixtureFails++;
      }
    }

    if (fixtureFails === 0) {
      console.log(`  ✓ ${fixture.label} (${fixturePasses} assertions)`);
      testPasses++;
    } else {
      console.log(`  ✗ ${fixture.label} (${fixturePasses} pass / ${fixtureFails} fail)`);
      testFails++;
    }
  }

  results.push({ name: test.name, passes: testPasses, fails: testFails });
  return { passes: testPasses, fails: testFails };
}

async function cleanupTestDocs() {
  console.log(`\n🧹 Cleanup: ${cleanup.length} TEST docs`);
  for (let i = 0; i < cleanup.length; i += 400) {
    const slice = cleanup.slice(i, i + 400);
    const batch = db.batch();
    for (const { col, docId } of slice) {
      batch.delete(db.collection(`${BASE_PATH}/${col}`).doc(docId));
    }
    await batch.commit();
  }
  console.log(`   ✓ ${cleanup.length} TEST docs deleted`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' E2E: every migrate button × happy + adversarial × deep mapping');
  console.log(`  Target test branch: ${TEST_PRAM3}`);
  console.log(`  TEST prefix:        ${TEST_PREFIX}`);
  console.log('═══════════════════════════════════════════════════════════════');

  for (const test of TESTS) {
    await runTest(test);
  }

  await cleanupTestDocs();

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  let totalPass = 0;
  let totalFail = 0;
  for (const r of results) {
    const status = r.fails === 0 ? '✓' : '✗';
    console.log(`  ${status} ${r.name.padEnd(60)}  ${r.passes} pass / ${r.fails} fail`);
    totalPass += r.passes;
    totalFail += r.fails;
  }
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  Fixtures: ${totalPass} pass / ${totalFail} fail`);
  console.log(`  Assertions: ${passedAssertions} / ${totalAssertions} (${((passedAssertions / totalAssertions) * 100).toFixed(1)}%)`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(totalFail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('FATAL:', e); cleanupTestDocs().finally(() => process.exit(2)); });
}
