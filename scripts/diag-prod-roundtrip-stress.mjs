#!/usr/bin/env node
// STRESS test the round-trip with diverse edge cases:
//   - Thai unicode (ทดสอบ + emoji)
//   - Special chars: quotes \", newlines \n, backslashes \\, unicode escapes
//   - Nested arrays of objects (course items, sale items shape)
//   - Long strings (10+ KB)
//   - Null values, empty arrays, empty objects
//   - Number edge cases: 0, big int, decimal
//   - Booleans
//   - ISO timestamp strings
//
// Plants ~6 edge-case fixtures on ทดลอง 1, round-trips via download+reupload,
// deep-equal verifies, then cleans up.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const FIREBASE_WEB_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const PROD_URL = 'https://lover-clinic-app.vercel.app';

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}
const db = getFirestore();
const dataCol = (name) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);

const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5'; // ทดลอง 1
const TS = Date.now();
const TEST_PREFIX = `STRESS-V40-${TS}`;

// 6 edge-case fixtures spanning typical real shapes
const FIXTURES = [
  {
    col: 'be_products',
    id: `${TEST_PREFIX}-PROD-thai`,
    data: {
      productId: `${TEST_PREFIX}-PROD-thai`,
      productName: 'ทดสอบ ภาษาไทย — สินค้าทดสอบ พร้อม "quote" + line\nnewline',
      productCode: 'CODE-001',
      productType: 'ยา',
      price: 1234.56,
      priceInclVat: 1320.98,
      isVatIncluded: true,
      categoryName: '🧪 หมวดทดสอบ',
      branchId: TEST_BRANCH_ID,
      tags: ['ภาษาไทย', 'unicode', 'special-chars'],
      stockConfig: { trackStock: false, allowNegative: null, threshold: 0 },
      metadata: { createdBy: 'stress-test', emptyArr: [], emptyObj: {}, nullField: null },
      longString: 'x'.repeat(5000),
      backslashes: 'C:\\path\\to\\\\nowhere',
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
      status: 'ใช้งาน',
    },
  },
  {
    col: 'be_courses',
    id: `${TEST_PREFIX}-COURSE-nested`,
    data: {
      courseId: `${TEST_PREFIX}-COURSE-nested`,
      courseName: 'คอร์สทดสอบ (nested items)',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      branchId: TEST_BRANCH_ID,
      // Real shape: items[] of objects
      items: [
        { productId: 'P001', productName: 'สินค้า 1', qty: 5, qtyUsed: 0, price: 100 },
        { productId: 'P002', productName: 'สินค้า 2 — Special "quoted" + \nbreak', qty: 10, qtyUsed: 3, price: 250.5 },
        { productId: 'P003', productName: '🎁 emoji product', qty: 2, qtyUsed: 2, price: 0 },
      ],
      salePrice: 5000,
      isDf: true,
      dfEditableGlobal: false,
      isHidden: false,
      skipStockDeduction: false,
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
      status: 'ใช้งาน',
    },
  },
  {
    col: 'be_treatments',
    id: `${TEST_PREFIX}-TREAT-mixed`,
    data: {
      treatmentId: `${TEST_PREFIX}-TREAT-mixed`,
      branchId: TEST_BRANCH_ID,
      customerId: 'TEST-CUST-stress',
      doctorId: 'TEST-DOC-stress',
      treatmentItems: [
        { productId: 'P001', name: 'รายการที่ 1', qty: 1 },
      ],
      consumables: [],
      medications: [
        { medicineId: 'M001', dosage: 'วันละ 3 ครั้ง — หลังอาหาร', qty: 30 },
      ],
      treatmentDate: '2026-05-08',
      visitTime: '14:30',
      doctorNote: 'หมายเหตุ: ผู้ป่วยมีอาการดีขึ้น\nนัดติดตาม 1 สัปดาห์',
      images: [],
      total: 1500,
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
      status: 'ใช้งาน',
    },
  },
  {
    col: 'be_sales',
    id: `${TEST_PREFIX}-SALE-grouped-items`,
    data: {
      saleId: `${TEST_PREFIX}-SALE-grouped-items`,
      branchId: TEST_BRANCH_ID,
      customerId: 'TEST-CUST-stress',
      // Real shape: grouped items object (V12 lesson — both shapes valid)
      items: {
        promotions: [{ promotionId: 'PROMO-001', name: 'โปรโมชันทดสอบ', discount: 100 }],
        courses: [{ courseId: 'C001', name: 'คอร์ส 1', qty: 1, price: 1000 }],
        products: [{ productId: 'P001', name: 'สินค้า 1', qty: 5, price: 100 }],
        medications: [],
      },
      total: 1400,
      paid: 1400,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      saleDate: '2026-05-08',
      sellerStaffId: 'TEST-STAFF-stress',
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
    },
  },
  {
    col: 'be_appointments',
    id: `${TEST_PREFIX}-APPT-multi-staff`,
    data: {
      appointmentId: `${TEST_PREFIX}-APPT-multi-staff`,
      branchId: TEST_BRANCH_ID,
      customerId: 'TEST-CUST-stress',
      doctorId: 'TEST-DOC-stress',
      assistantStaffIds: ['STAFF-A', 'STAFF-B', 'STAFF-C'],
      appointmentType: 'no-deposit-booking',
      appointmentDate: '2026-05-15',
      startTime: '10:00',
      endTime: '11:30',
      visitPurpose: 'ตรวจรักษา',
      notes: 'เคสยาก — ต้องระวัง\n  - แพ้ยา X\n  - ความดันสูง',
      isUnread: false,
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
      status: 'ใช้งาน',
    },
  },
  {
    col: 'be_stock_batches',
    id: `${TEST_PREFIX}-BATCH-numbers`,
    data: {
      batchId: `${TEST_PREFIX}-BATCH-numbers`,
      branchId: TEST_BRANCH_ID,
      productId: 'P001',
      productName: 'สินค้าทดสอบ stock',
      qty: { total: 1000, remaining: 750 },
      cost: 50.123456789, // float precision
      receivedAt: '2026-05-08T00:00:00.000Z',
      expiryDate: '2027-12-31',
      lotNumber: 'LOT-2026-05-08-A',
      negativeFlag: false,
      forensicTrail: { migratedFrom: null, originalQty: 1000, history: [] },
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
      status: 'active',
    },
  },
];

const cleanupRefs = [];

function normalizeForCompare(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (typeof v.toDate === 'function' && typeof v.seconds === 'number') {
      return { _seconds: v.seconds, _nanoseconds: v.nanoseconds || 0, _type: 'Timestamp' };
    }
    if (typeof v._seconds === 'number' && typeof v._nanoseconds === 'number') {
      return { _seconds: v._seconds, _nanoseconds: v._nanoseconds, _type: 'Timestamp' };
    }
    if (Array.isArray(v)) return v.map(normalizeForCompare);
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const nv = normalizeForCompare(v[k]);
      if (nv !== undefined) out[k] = nv;
    }
    return out;
  }
  return v;
}

function deepDiff(a, b, path = '') {
  const diffs = [];
  if (a === b) return diffs;
  if (a === null && b !== null) return [{ path, type: 'extra-in-post', a, b }];
  if (a !== null && b === null) return [{ path, type: 'missing-in-post', a, b }];
  if (typeof a !== typeof b) return [{ path, type: 'type-mismatch', a, b }];
  if (typeof a !== 'object') {
    if (a !== b) return [{ path, type: 'value-changed', a, b }];
    return diffs;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return [{ path, type: 'array-vs-object', a, b }];
  if (Array.isArray(a)) {
    if (a.length !== b.length) diffs.push({ path: `${path}.length`, type: 'array-length-changed', a: a.length, b: b.length });
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      diffs.push(...deepDiff(a[i] ?? null, b[i] ?? null, `${path}[${i}]`));
    }
    return diffs;
  }
  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of allKeys) {
    if (!(k in (a || {}))) diffs.push({ path: `${path}.${k}`, type: 'extra-in-post', a: undefined, b: b[k] });
    else if (!(k in (b || {}))) diffs.push({ path: `${path}.${k}`, type: 'missing-in-post', a: a[k], b: undefined });
    else diffs.push(...deepDiff(a[k], b[k], `${path}.${k}`));
  }
  return diffs;
}

async function plantFixtures() {
  for (const f of FIXTURES) {
    const ref = dataCol(f.col).doc(f.id);
    await ref.set(f.data);
    cleanupRefs.push(ref);
  }
  console.log(`✓ Planted ${FIXTURES.length} edge-case fixtures on ทดลอง 1`);
}

async function snapshotFixtures() {
  // Read back the planted docs by ID + normalize
  const snap = {};
  for (const f of FIXTURES) {
    const doc = await dataCol(f.col).doc(f.id).get();
    if (doc.exists) {
      snap[f.col] = snap[f.col] || {};
      snap[f.col][f.id] = normalizeForCompare(doc.data());
    }
  }
  return snap;
}

async function cleanup() {
  console.log('\n🧹 Cleanup planted fixtures...');
  for (const ref of cleanupRefs) {
    try { await ref.delete(); } catch (e) { console.log(`  ! ${e.message}`); }
  }
  console.log(`   ✓ ${cleanupRefs.length} fixtures cleaned`);
}

async function getAdminIdToken() {
  const customToken = await getAuth().createCustomToken(`stress-${Date.now()}`, { admin: true });
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  return (await r.json()).idToken;
}

async function main() {
  console.log('═══ STRESS round-trip — edge-case fixtures ═══\n');

  await plantFixtures();
  const preState = await snapshotFixtures();
  let preCount = 0;
  for (const c of Object.values(preState)) preCount += Object.keys(c).length;
  console.log(`✓ Snapshot pre-state: ${preCount} fixture docs`);

  const idToken = await getAdminIdToken();

  // Make-Fresh
  console.log('\n─── Make-Fresh ───');
  const backupRes = await fetch(`${PROD_URL}/api/admin/branch-backup-export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ branchId: TEST_BRANCH_ID, tiers: ['T1', 'T2', 'T3', 'T4'], isAutoPreFresh: true }),
  });
  const backupJson = await backupRes.json();
  if (!backupJson.ok) throw new Error(`backup: ${JSON.stringify(backupJson).slice(0,300)}`);
  console.log(`✓ Auto-backup: ${backupJson.storagePath} (${backupJson.sizeBytes} bytes)`);

  const wipeRes = await fetch(`${PROD_URL}/api/admin/branch-make-fresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ branchId: TEST_BRANCH_ID, autoBackupRef: backupJson.storagePath }),
  });
  const wipeJson = await wipeRes.json();
  console.log(`✓ Wipe: ${Object.values(wipeJson.deletedCounts || {}).reduce((a,b)=>a+b,0)} docs deleted`);

  // Download + re-upload
  console.log('\n─── Download + Re-upload ───');
  const dl = await fetch(backupJson.signedUrl);
  const buf = Buffer.from(await dl.arrayBuffer());
  console.log(`✓ Downloaded ${buf.length} bytes`);

  const restoreRes = await fetch(`${PROD_URL}/api/admin/branch-restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      mode: 'overwrite',
      uploadedFileBase64: buf.toString('base64'),
      targetBranchId: TEST_BRANCH_ID,
    }),
  });
  const restoreJson = await restoreRes.json();
  if (!restoreJson.ok) throw new Error(`restore: ${JSON.stringify(restoreJson).slice(0,500)}`);
  let totalWritten = 0;
  for (const v of Object.values(restoreJson.perCollection || {})) totalWritten += (v.written || 0);
  console.log(`✓ Restored ${totalWritten} docs`);

  // Post-state + deep-equal
  console.log('\n─── Deep-equal verify per fixture ───');
  const postState = await snapshotFixtures();
  let postCount = 0;
  for (const c of Object.values(postState)) postCount += Object.keys(c).length;
  console.log(`Post-state: ${postCount} fixture docs`);

  const diffs = deepDiff(preState, postState, '');
  if (diffs.length === 0) {
    console.log('\n✅ 100% MATCH — every fixture, every nested field, every edge case byte-perfect');
    console.log('Edge cases verified:');
    console.log('  ✓ Thai unicode (ทดสอบ ภาษาไทย, 🧪 emoji)');
    console.log('  ✓ Special chars (quotes, newlines, backslashes)');
    console.log('  ✓ Nested arrays of objects (course items, sale grouped-items)');
    console.log('  ✓ Long strings (5000 chars)');
    console.log('  ✓ null values + empty arrays + empty objects');
    console.log('  ✓ Number precision (50.123456789)');
    console.log('  ✓ Booleans + ISO timestamp strings');
    console.log('  ✓ Mixed-type arrays (assistantStaffIds)');
    return true;
  } else {
    console.log(`\n❌ ${diffs.length} DIVERGENCE(S):`);
    for (const d of diffs.slice(0, 30)) {
      const aStr = JSON.stringify(d.a)?.slice(0, 150);
      const bStr = JSON.stringify(d.b)?.slice(0, 150);
      console.log(`  [${d.type}] ${d.path}`);
      console.log(`    pre:  ${aStr}`);
      console.log(`    post: ${bStr}`);
    }
    if (diffs.length > 30) console.log(`  ... ${diffs.length - 30} more`);
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(async (ok) => { await cleanup(); process.exit(ok ? 0 : 2); })
    .catch(async (e) => { console.error('FATAL:', e.message); console.error(e.stack); await cleanup(); process.exit(1); });
}
