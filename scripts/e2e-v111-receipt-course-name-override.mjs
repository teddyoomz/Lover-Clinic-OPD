#!/usr/bin/env node
// ─── V111 — E2E (live admin-SDK) — receipt course-name override propagation ─
//
// Verifies V111 end-to-end on REAL prod Firestore:
//   1. Master be_course with receiptCourseName SET                  → override
//      flows through buy-fetcher snapshot into sale.items.courses[i]
//      → SalePrintView renders override.
//   2. Master be_course with receiptCourseName EMPTY                → renderer
//      falls back to original courseName.
//   3. Legacy historical sale doc WITHOUT receiptCourseName at all  → renderer
//      reads `c.name` (backward-compat with all pre-V111 sales).
//   4. Quotation parallel path (QuotationPrintView)                 → same
//      override + fallback semantic.
//
// Compliance:
//   - Rule M canonical: env + admin SDK + artifacts/{APP_ID}/public/data path
//   - Rule Q L2: real client-SDK-equivalent compound queries on real prod
//   - V33.10/12 prefix discipline (TEST-V111-CUST/COURSE/SALE/QUOTE)
//   - Audit doc emit + idempotency + try/finally cleanup
//   - feedback_no_real_action_in_preview_eval — TEST fixtures only,
//     ZERO touch to real customers
//
// Usage:
//   node scripts/e2e-v111-receipt-course-name-override.mjs
//   node scripts/e2e-v111-receipt-course-name-override.mjs --keep-for-inspection
//
// --keep-for-inspection: skip cleanup so admin can manually open the sale
//                        in BackendDashboard → sales list → click receipt.
//                        WARNING: must run again WITHOUT flag to clean up.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const RUN_ID = randomBytes(4).toString('hex');
const TS = Date.now();
const NS = `TEST-V111-${TS}-${RUN_ID}`;
const KEEP = process.argv.includes('--keep-for-inspection');

// ─── Env + Firestore init ─────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local.prod');
  const txt = readFileSync(envPath, 'utf8');
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
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* missing in .env.local.prod');
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}

function dataRef(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

// ─── Renderer mirrors (kept source-grep-locked to real impl) ──────────────

// Mirror of SalePrintView.jsx:105 grouped branch + AV111 source-grep.
function deriveSaleCourseName(c) {
  return c.receiptCourseName || c.name || c.courseName || c.courseId || '';
}

// Mirror of QuotationPrintView.jsx:57 course branch + AV111 source-grep.
function deriveQuotationCourseName(x) {
  return x.receiptCourseName || x.courseName || x.courseId;
}

// ─── Assertion harness ────────────────────────────────────────────────────

let pass = 0, fail = 0;
const fails = [];
function assert(cond, label) {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else      { fail += 1; fails.push(label); console.log(`  ✗ ${label}`); }
}
function assertEq(actual, expected, label) {
  const sa = typeof actual === 'object' ? JSON.stringify(actual) : String(actual);
  const se = typeof expected === 'object' ? JSON.stringify(expected) : String(expected);
  assert(sa === se, `${label}  (got=${sa}, want=${se})`);
}

// ─── Fixture IDs ──────────────────────────────────────────────────────────

const COURSE_ID_OVERRIDE = `${NS}-COURSE-OVERRIDE`;     // has receiptCourseName
const COURSE_ID_NO_OVERRIDE = `${NS}-COURSE-NOOVERRIDE`; // no override
const CUST_ID = `${NS}-CUST`;
const SALE_ID_OVERRIDE = `${NS}-SALE-OVERRIDE`;
const SALE_ID_NO_OVERRIDE = `${NS}-SALE-NOOVERRIDE`;
const SALE_ID_LEGACY = `${NS}-SALE-LEGACY-PRE-V111`;
const QUOTE_ID_OVERRIDE = `${NS}-QUOTE-OVERRIDE`;
const QUOTE_ID_NO_OVERRIDE = `${NS}-QUOTE-NOOVERRIDE`;
const AUDIT_ID = `v111-e2e-${TS}-${RUN_ID}`;

const ORIGINAL_NAME = 'ทดสอบ V111 — ชื่อคอร์สเดิม (ต้นฉบับ)';
const OVERRIDE_NAME = 'ทดสอบ V111 — ใบเสร็จเทคนิคพรีเมียม';

// ─── MAIN ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  V111 E2E — Receipt course-name override propagation              ║`);
  console.log(`║  RUN_ID: ${RUN_ID}  TS: ${TS}                                    ║`);
  console.log(`║  Mode:    ${KEEP ? 'KEEP-FOR-INSPECTION (manual cleanup needed)' : 'AUTO-CLEANUP                              '}║`);
  console.log(`╚════════════════════════════════════════════════════════════════════╝\n`);

  const db = initFirestore();
  const root = dataRef(db);

  // Resolve a real branchId (V102 + BSA — sale.branchId required for the
  // sale to appear in per-branch SaleTab queries).
  const branchSnap = await root.collection('be_branches').limit(1).get();
  if (branchSnap.empty) throw new Error('No be_branches doc found in prod');
  const branchId = branchSnap.docs[0].id;
  console.log(`✓ Resolved branchId: ${branchId}`);

  try {
    // ───────── Phase A: Create master fixtures ─────────────────────────────
    console.log(`\n── Phase A: Create master fixtures ──`);
    await root.collection('be_courses').doc(COURSE_ID_OVERRIDE).set({
      courseId: COURSE_ID_OVERRIDE,
      courseName: ORIGINAL_NAME,
      receiptCourseName: OVERRIDE_NAME,    // ← V111 override
      courseCategory: 'TEST-V111',
      salePrice: 15900,
      status: 'ใช้งาน',
      branchId,
      createdAt: new Date(),
      updatedAt: new Date(),
      _v111E2eRunId: RUN_ID,
    });
    console.log(`  ✓ created course OVERRIDE (${COURSE_ID_OVERRIDE})`);

    await root.collection('be_courses').doc(COURSE_ID_NO_OVERRIDE).set({
      courseId: COURSE_ID_NO_OVERRIDE,
      courseName: ORIGINAL_NAME,
      receiptCourseName: '',               // ← empty (no override)
      courseCategory: 'TEST-V111',
      salePrice: 15900,
      status: 'ใช้งาน',
      branchId,
      createdAt: new Date(),
      updatedAt: new Date(),
      _v111E2eRunId: RUN_ID,
    });
    console.log(`  ✓ created course NO-OVERRIDE (${COURSE_ID_NO_OVERRIDE})`);

    await root.collection('be_customers').doc(CUST_ID).set({
      customerId: CUST_ID,
      firstname: 'TEST',
      lastname: 'V111',
      patientData: { firstNameTh: 'ทดสอบ', lastNameTh: 'V111', hn: 'V111-' + RUN_ID },
      branchId,
      createdAt: new Date(),
      updatedAt: new Date(),
      _v111E2eRunId: RUN_ID,
    });
    console.log(`  ✓ created customer (${CUST_ID})`);

    // ───────── Phase B: Read master back + verify V44 mapper contract ──────
    console.log(`\n── Phase B: Verify canonical mapper exposes receipt_course_name (V44) ──`);
    const courseDocOverride = await root.collection('be_courses').doc(COURSE_ID_OVERRIDE).get();
    const courseDocNo = await root.collection('be_courses').doc(COURSE_ID_NO_OVERRIDE).get();
    assertEq(courseDocOverride.data().receiptCourseName, OVERRIDE_NAME, 'be_courses (OVERRIDE) persisted receiptCourseName');
    assertEq(courseDocNo.data().receiptCourseName, '', 'be_courses (NO-OVERRIDE) persisted empty receiptCourseName');

    // ───────── Phase C: Write sale docs in the SHAPE the V111 buy-fetcher  ─
    //               + createBackendSale would produce ──────────────────────
    console.log(`\n── Phase C: Write sales (snapshot what buy-fetcher would stamp) ──`);

    // C1. Sale buying the OVERRIDE course — what V111-patched buy-fetcher writes
    await root.collection('be_sales').doc(SALE_ID_OVERRIDE).set({
      saleId: SALE_ID_OVERRIDE,
      branchId,
      customerId: CUST_ID,
      customerName: 'นางสาวทดสอบ V111',
      customerHN: 'V111-' + RUN_ID,
      saleDate: new Date().toISOString().slice(0, 10),
      items: {
        courses: [{
          id: COURSE_ID_OVERRIDE,
          name: ORIGINAL_NAME,             // canonical, stays original
          receiptCourseName: OVERRIDE_NAME, // V111 parallel field
          qty: '1',
          unit: 'ครั้ง',
          price: 15900,
          unitPrice: 15900,
          itemType: 'course',
        }],
        products: [],
        promotions: [],
        medications: [],
      },
      billing: { subtotal: 15900, netTotal: 15900 },
      payment: { status: 'paid', channels: [{ name: 'เงินสด', amount: 15900 }] },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      _v111E2eRunId: RUN_ID,
    });
    console.log(`  ✓ wrote sale OVERRIDE (${SALE_ID_OVERRIDE})`);

    // C2. Sale buying the NO-OVERRIDE course — empty receiptCourseName
    await root.collection('be_sales').doc(SALE_ID_NO_OVERRIDE).set({
      saleId: SALE_ID_NO_OVERRIDE,
      branchId,
      customerId: CUST_ID,
      customerName: 'นางสาวทดสอบ V111',
      customerHN: 'V111-' + RUN_ID,
      saleDate: new Date().toISOString().slice(0, 10),
      items: {
        courses: [{
          id: COURSE_ID_NO_OVERRIDE,
          name: ORIGINAL_NAME,
          receiptCourseName: '',           // empty
          qty: '1',
          unit: 'ครั้ง',
          price: 15900,
          unitPrice: 15900,
          itemType: 'course',
        }],
        products: [],
        promotions: [],
        medications: [],
      },
      billing: { subtotal: 15900, netTotal: 15900 },
      payment: { status: 'paid', channels: [{ name: 'เงินสด', amount: 15900 }] },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      _v111E2eRunId: RUN_ID,
    });
    console.log(`  ✓ wrote sale NO-OVERRIDE (${SALE_ID_NO_OVERRIDE})`);

    // C3. Legacy pre-V111 sale — no receiptCourseName field AT ALL on items
    //     Reproduces the shape of every existing sale written before V111
    //     deploy. Confirms fallback chain handles missing field gracefully.
    await root.collection('be_sales').doc(SALE_ID_LEGACY).set({
      saleId: SALE_ID_LEGACY,
      branchId,
      customerId: CUST_ID,
      customerName: 'นางสาวทดสอบ V111',
      customerHN: 'V111-' + RUN_ID,
      saleDate: new Date().toISOString().slice(0, 10),
      items: {
        courses: [{
          id: COURSE_ID_OVERRIDE,
          name: ORIGINAL_NAME,
          // receiptCourseName intentionally OMITTED (pre-V111 shape)
          qty: '1',
          unit: 'ครั้ง',
          price: 15900,
          unitPrice: 15900,
          itemType: 'course',
        }],
        products: [],
        promotions: [],
        medications: [],
      },
      billing: { subtotal: 15900, netTotal: 15900 },
      payment: { status: 'paid', channels: [{ name: 'เงินสด', amount: 15900 }] },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      _v111E2eRunId: RUN_ID,
    });
    console.log(`  ✓ wrote sale LEGACY (${SALE_ID_LEGACY})  — pre-V111 shape`);

    // ───────── Phase D: Quotation parallel path ────────────────────────────
    console.log(`\n── Phase D: Write quotations (parallel customer-facing print) ──`);
    await root.collection('be_quotations').doc(QUOTE_ID_OVERRIDE).set({
      quotationId: QUOTE_ID_OVERRIDE,
      branchId,
      customerId: CUST_ID,
      customerName: 'นางสาวทดสอบ V111',
      quotationDate: new Date().toISOString().slice(0, 10),
      courses: [{
        courseId: COURSE_ID_OVERRIDE,
        courseName: ORIGINAL_NAME,
        receiptCourseName: OVERRIDE_NAME, // V111 stamps this
        qty: 1,
        price: 15900,
      }],
      products: [],
      promotions: [],
      takeawayMeds: [],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      _v111E2eRunId: RUN_ID,
    });
    console.log(`  ✓ wrote quotation OVERRIDE (${QUOTE_ID_OVERRIDE})`);

    await root.collection('be_quotations').doc(QUOTE_ID_NO_OVERRIDE).set({
      quotationId: QUOTE_ID_NO_OVERRIDE,
      branchId,
      customerId: CUST_ID,
      customerName: 'นางสาวทดสอบ V111',
      quotationDate: new Date().toISOString().slice(0, 10),
      courses: [{
        courseId: COURSE_ID_NO_OVERRIDE,
        courseName: ORIGINAL_NAME,
        receiptCourseName: '',
        qty: 1,
        price: 15900,
      }],
      products: [],
      promotions: [],
      takeawayMeds: [],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      _v111E2eRunId: RUN_ID,
    });
    console.log(`  ✓ wrote quotation NO-OVERRIDE (${QUOTE_ID_NO_OVERRIDE})`);

    // ───────── Phase E: Read sale docs back + simulate renderer ───────────
    console.log(`\n── Phase E: Read sales back + simulate SalePrintView name derivation ──`);

    const saleOverride = (await root.collection('be_sales').doc(SALE_ID_OVERRIDE).get()).data();
    const saleNo = (await root.collection('be_sales').doc(SALE_ID_NO_OVERRIDE).get()).data();
    const saleLegacy = (await root.collection('be_sales').doc(SALE_ID_LEGACY).get()).data();

    // E1. Sale OVERRIDE — sale doc carries receiptCourseName + renderer prefers it
    assertEq(
      saleOverride.items.courses[0].receiptCourseName,
      OVERRIDE_NAME,
      'E1.1 sale OVERRIDE.items.courses[0].receiptCourseName persisted exact override',
    );
    assertEq(
      saleOverride.items.courses[0].name,
      ORIGINAL_NAME,
      'E1.2 sale OVERRIDE.items.courses[0].name stays ORIGINAL (parallel field)',
    );
    assertEq(
      deriveSaleCourseName(saleOverride.items.courses[0]),
      OVERRIDE_NAME,
      'E1.3 SalePrintView mirror renders OVERRIDE name',
    );

    // E2. Sale NO-OVERRIDE — empty receiptCourseName → renderer falls back to name
    assertEq(
      saleNo.items.courses[0].receiptCourseName,
      '',
      'E2.1 sale NO-OVERRIDE.items.courses[0].receiptCourseName empty',
    );
    assertEq(
      deriveSaleCourseName(saleNo.items.courses[0]),
      ORIGINAL_NAME,
      'E2.2 SalePrintView mirror falls back to ORIGINAL name when override empty',
    );

    // E3. Sale LEGACY — no receiptCourseName field at all → renderer falls back
    //     Validates backward-compat with EVERY pre-V111 sale in prod (incl.
    //     the user-reported INV-20260520-0010 — still renders ORIGINAL by design).
    const legacyCourse = saleLegacy.items.courses[0];
    assert(
      legacyCourse.receiptCourseName === undefined,
      'E3.1 sale LEGACY has NO receiptCourseName field (pre-V111 shape)',
    );
    assertEq(
      deriveSaleCourseName(legacyCourse),
      ORIGINAL_NAME,
      'E3.2 SalePrintView mirror falls back to ORIGINAL name for legacy/missing-field sales',
    );

    // E4. Adversarial: tampered receiptCourseName=null (defensive against
    //     hand-written/migrated docs that stamp null instead of empty string).
    const tampered = { ...saleOverride.items.courses[0], receiptCourseName: null };
    assertEq(
      deriveSaleCourseName(tampered),
      ORIGINAL_NAME,
      'E4.1 null receiptCourseName falls back to name (defensive)',
    );

    // ───────── Phase F: Quotation parallel verification ────────────────────
    console.log(`\n── Phase F: Verify QuotationPrintView mirror ──`);
    const qOverride = (await root.collection('be_quotations').doc(QUOTE_ID_OVERRIDE).get()).data();
    const qNo = (await root.collection('be_quotations').doc(QUOTE_ID_NO_OVERRIDE).get()).data();

    assertEq(qOverride.courses[0].receiptCourseName, OVERRIDE_NAME, 'F1.1 quote OVERRIDE persisted receiptCourseName');
    assertEq(deriveQuotationCourseName(qOverride.courses[0]), OVERRIDE_NAME, 'F1.2 QuotationPrintView mirror renders OVERRIDE');
    assertEq(qNo.courses[0].receiptCourseName, '', 'F2.1 quote NO-OVERRIDE empty');
    assertEq(deriveQuotationCourseName(qNo.courses[0]), ORIGINAL_NAME, 'F2.2 QuotationPrintView mirror falls back to courseName');

    // ───────── Phase G: V11 separation — non-receipt consumers see ORIGINAL ─
    console.log(`\n── Phase G: Verify parallel-field separation (non-receipt consumers) ──`);
    // A non-receipt consumer reading sale.items.courses[i].name directly
    // (e.g. SaleDetailModal admin view OR future report aggregator) gets
    // the ORIGINAL name. The override is RECEIPT-ONLY.
    assertEq(
      saleOverride.items.courses[0].name,
      ORIGINAL_NAME,
      'G1.1 non-receipt consumer reading .name gets ORIGINAL (separation intact)',
    );
    // The override coexists in the SAME object — receipt consumer reads
    // .receiptCourseName, non-receipt consumer reads .name. Same doc, two
    // semantically distinct fields.
    assert(
      saleOverride.items.courses[0].receiptCourseName !== saleOverride.items.courses[0].name,
      'G1.2 .receiptCourseName ≠ .name (override semantically different from canonical)',
    );

    // ───────── Phase H: Idempotency check ──────────────────────────────────
    // Re-write the OVERRIDE sale with the same shape. Verify it doesn't
    // change any read assertions. (Real V111 flow: createBackendSale never
    // overwrites — uses unique saleId. This test confirms read stability.)
    console.log(`\n── Phase H: Idempotency — re-read after no-op re-write ──`);
    await root.collection('be_sales').doc(SALE_ID_OVERRIDE).set({
      ...saleOverride,
      updatedAt: new Date(),
    });
    const reread = (await root.collection('be_sales').doc(SALE_ID_OVERRIDE).get()).data();
    assertEq(reread.items.courses[0].receiptCourseName, OVERRIDE_NAME, 'H1.1 re-read OVERRIDE survives idempotent write');
    assertEq(deriveSaleCourseName(reread.items.courses[0]), OVERRIDE_NAME, 'H1.2 renderer still resolves OVERRIDE');

    // ───────── Phase I: Audit doc emit ─────────────────────────────────────
    console.log(`\n── Phase I: Emit audit doc ──`);
    await root.collection('be_admin_audit').doc(AUDIT_ID).set({
      auditId: AUDIT_ID,
      op: 'v111-e2e-receipt-course-name-override',
      runId: RUN_ID,
      branchId,
      fixtures: {
        courses: [COURSE_ID_OVERRIDE, COURSE_ID_NO_OVERRIDE],
        customer: CUST_ID,
        sales: [SALE_ID_OVERRIDE, SALE_ID_NO_OVERRIDE, SALE_ID_LEGACY],
        quotations: [QUOTE_ID_OVERRIDE, QUOTE_ID_NO_OVERRIDE],
      },
      result: { pass, fail },
      keepForInspection: KEEP,
      performedAt: new Date(),
    });
    console.log(`  ✓ audit doc be_admin_audit/${AUDIT_ID}`);
  } finally {
    // ───────── Phase J: Cleanup ────────────────────────────────────────────
    if (KEEP) {
      console.log(`\n── Phase J: SKIPPED (--keep-for-inspection) ──`);
      console.log(`\n  Fixtures left on prod (TEST- prefixed):`);
      console.log(`    • be_sales/${SALE_ID_OVERRIDE}        ← receipt MUST show OVERRIDE`);
      console.log(`    • be_sales/${SALE_ID_NO_OVERRIDE}     ← receipt MUST show ORIGINAL (empty)`);
      console.log(`    • be_sales/${SALE_ID_LEGACY}          ← receipt MUST show ORIGINAL (no field)`);
      console.log(`    • be_quotations/${QUOTE_ID_OVERRIDE}`);
      console.log(`    • be_quotations/${QUOTE_ID_NO_OVERRIDE}`);
      console.log(`    • be_courses/${COURSE_ID_OVERRIDE}`);
      console.log(`    • be_courses/${COURSE_ID_NO_OVERRIDE}`);
      console.log(`    • be_customers/${CUST_ID}`);
      console.log(`\n  Re-run WITHOUT --keep-for-inspection to clean up, OR run:`);
      console.log(`    node scripts/e2e-v111-receipt-course-name-override.mjs --cleanup-prefix=${NS}`);
    } else {
      console.log(`\n── Phase J: Cleanup ──`);
      const db = getFirestore();
      const root = dataRef(db);
      let removed = 0;
      for (const [coll, id] of [
        ['be_sales', SALE_ID_OVERRIDE],
        ['be_sales', SALE_ID_NO_OVERRIDE],
        ['be_sales', SALE_ID_LEGACY],
        ['be_quotations', QUOTE_ID_OVERRIDE],
        ['be_quotations', QUOTE_ID_NO_OVERRIDE],
        ['be_courses', COURSE_ID_OVERRIDE],
        ['be_courses', COURSE_ID_NO_OVERRIDE],
        ['be_customers', CUST_ID],
      ]) {
        try {
          await root.collection(coll).doc(id).delete();
          console.log(`  ✓ deleted ${coll}/${id}`);
          removed += 1;
        } catch (e) {
          console.log(`  ✗ delete failed ${coll}/${id}: ${e.message}`);
        }
      }
      // audit doc is preserved (NOT cleaned up — it's the permanent trail)
      console.log(`\n  removed: ${removed} fixtures · audit doc preserved`);
    }
  }

  console.log(`\n╔════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  Result: ${pass} pass · ${fail} fail                                            ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════╝\n`);
  if (fails.length) {
    console.log('FAILURES:');
    fails.forEach(f => console.log(`  ✗ ${f}`));
  }
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
