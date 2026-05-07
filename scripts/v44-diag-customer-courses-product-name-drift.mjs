#!/usr/bin/env node
// ─── V44 — Diag — customer.courses[] product-name drift ─────────────────────
//
// Read-only diagnostic per Rule M. User reported (post V43 deploy):
//   "ซื้อคอร์ส แล้วในช่องคอร์สของลูกค้าเด้งชื่อคอร์สมาแทนชื่อสินค้า"
// Image evidence: customer.courses[] entries with product=courseName
// instead of product=mainProductName / sub-product-name.
//
// Hypothesis (Phase 1 root cause): TFP buy fetcher (TreatmentFormPage.jsx
// line ~1566) bypasses canonical beCourseToMasterShape — does inline
// `products: c.courseProducts || c.products || []`. Issues:
//   1. courseProducts uses field `productName`, not `name` → buildPurchasedCourseEntry
//      reads p.name → undefined → falls back to item.name (course name)
//   2. Main product (mainProductId/mainProductName) is at top-level of
//      be_courses doc, NOT in courseProducts[] — gets dropped entirely
//
// Drift fingerprints:
//   - product === '' OR product === undefined
//   - product === entry.name (courseName) — bug repro
//   - productId === '' AND product === courseName — strong bug indicator
//
// Reports counts per category + sample customers + per-branch drift.
//
// Usage:
//   node scripts/v44-diag-customer-courses-product-name-drift.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';

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
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* missing');
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

/**
 * Classify ONE customer.courses[i] entry's product-name drift.
 * Pure helper — also exported for tests.
 */
export function classifyProductNameDrift(entry, masterCourse) {
  if (!entry || !entry.name) return 'invalid-entry';
  const courseName = String(entry.name || '').trim();
  const product = String(entry.product || '').trim();
  const productId = String(entry.productId || '').trim();

  if (!product) return 'product-empty';                      // worst case: empty product
  if (product === courseName) return 'product-eq-courseName'; // V44 bug fingerprint
  if (!productId) return 'product-set-no-productId';          // missing productId but product looks ok

  // Has product + productId. Cross-check against master if available.
  if (masterCourse) {
    const mainName = String(masterCourse.mainProductName || '').trim();
    const mainId = String(masterCourse.mainProductId || '').trim();
    const subProducts = Array.isArray(masterCourse.courseProducts) ? masterCourse.courseProducts : [];
    const mainMatches = mainId && productId === mainId;
    const mainNameMatches = mainName && product === mainName;
    if (mainMatches || mainNameMatches) return 'in-sync-main';
    const subMatch = subProducts.find(sp =>
      (sp.productId && productId === String(sp.productId).trim()) ||
      (sp.productName && product === String(sp.productName).trim())
    );
    if (subMatch) return 'in-sync-sub';
    // Has product/productId but doesn't match master main or any sub
    return 'product-mismatch-master';
  }
  return 'in-sync-no-master';
}

async function main() {
  const db = initFirestore();
  const data = dataPath(db);

  console.log('[v44-diag] reading be_courses ...');
  const courseSnap = await data.collection('be_courses').get();
  const masterByName = new Map();
  for (const d of courseSnap.docs) {
    const c = d.data();
    if (!c?.courseName) continue;
    masterByName.set(String(c.courseName).trim(), { ...c, _docId: d.id });
  }
  console.log(`[v44-diag]   ${courseSnap.size} be_courses (${masterByName.size} unique names)`);

  console.log('[v44-diag] reading be_customers ...');
  const custSnap = await data.collection('be_customers').get();
  console.log(`[v44-diag]   ${custSnap.size} customers\n`);

  const counts = {
    'invalid-entry': 0,
    'product-empty': 0,
    'product-eq-courseName': 0,
    'product-set-no-productId': 0,
    'product-mismatch-master': 0,
    'in-sync-main': 0,
    'in-sync-sub': 0,
    'in-sync-no-master': 0,
  };
  const samples = {
    'product-empty': [],
    'product-eq-courseName': [],
    'product-mismatch-master': [],
  };
  let totalEntries = 0;
  let customersAffected = 0;

  for (const cd of custSnap.docs) {
    const cust = cd.data();
    const courses = Array.isArray(cust?.courses) ? cust.courses : [];
    if (!courses.length) continue;
    let affected = false;
    for (let i = 0; i < courses.length; i++) {
      const entry = courses[i];
      if (!entry || !entry.name) continue;
      totalEntries += 1;
      const masterDoc = masterByName.get(String(entry.name || '').trim());
      const cls = classifyProductNameDrift(entry, masterDoc);
      counts[cls] = (counts[cls] || 0) + 1;
      const isBug = cls === 'product-empty' ||
                    cls === 'product-eq-courseName' ||
                    cls === 'product-mismatch-master';
      if (isBug) {
        affected = true;
        if (samples[cls] && samples[cls].length < 8) {
          samples[cls].push({
            customerId: cd.id,
            customerName: cust?.patientData?.firstName
              ? `${cust.patientData.firstName} ${cust.patientData.lastName || ''}`.trim()
              : '',
            courseIndex: i,
            entryName: entry.name || '',
            entryProduct: entry.product || '',
            entryProductId: entry.productId || '',
            entrySource: entry.source || '',
            entryParent: entry.parentName || '',
            entryAssignedAt: entry.assignedAt || '',
            masterMainName: masterDoc?.mainProductName || '',
            masterMainId: masterDoc?.mainProductId || '',
            masterSubCount: Array.isArray(masterDoc?.courseProducts) ? masterDoc.courseProducts.length : 0,
            masterId: masterDoc?._docId || null,
          });
        }
      }
    }
    if (affected) customersAffected += 1;
  }

  console.log('[v44-diag] === REPORT ===');
  console.log(`  Customers scanned:                   ${custSnap.size}`);
  console.log(`  Customers with bug-state entries:    ${customersAffected}`);
  console.log(`  Total customer.courses[] entries:    ${totalEntries}`);
  console.log('');
  console.log(`  ✅ in-sync (main product):           ${counts['in-sync-main']}`);
  console.log(`  ✅ in-sync (sub product):            ${counts['in-sync-sub']}`);
  console.log(`  ✅ in-sync (no master / orphan):     ${counts['in-sync-no-master']}`);
  console.log('');
  console.log(`  ⚠ product-empty:                     ${counts['product-empty']}`);
  console.log(`  ⚠ product-eq-courseName (V44 bug):   ${counts['product-eq-courseName']}`);
  console.log(`  ⚠ product-set-no-productId:          ${counts['product-set-no-productId']}`);
  console.log(`  ⚠ product-mismatch-master:           ${counts['product-mismatch-master']}`);

  for (const [key, list] of Object.entries(samples)) {
    if (list.length === 0) continue;
    console.log(`\n  --- ${key} (showing ${list.length}) ---`);
    for (const s of list) {
      console.log(`    customer=${s.customerId} (${s.customerName})`);
      console.log(`      [${s.courseIndex}] name="${s.entryName}"`);
      console.log(`              product="${s.entryProduct}"  productId="${s.entryProductId}"`);
      console.log(`              source=${s.entrySource}  parent=${s.entryParent || '-'}  assignedAt=${s.entryAssignedAt || '-'}`);
      console.log(`              master.main="${s.masterMainName}" (id=${s.masterMainId})  subCount=${s.masterSubCount}  masterDocId=${s.masterId}`);
    }
  }
  console.log('\n[v44-diag] DONE');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[v44-diag] FATAL:', err);
    process.exit(1);
  });
}
