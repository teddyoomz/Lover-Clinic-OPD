#!/usr/bin/env node
// ─── V43 — Diag — customer.courses[] vs be_courses skip-stock flag drift ─────
//
// Read-only diagnostic per Rule M (admin-SDK + pull env). Confirms the V43
// hypothesis: `customer.courses[i].skipStockDeduction` is denormalized at buy
// time + frozen against later master edits.
//
// Reports for every customer.courses[i] entry:
//   - master be_courses lookup status (found / missing / orphan)
//   - master master.skipStockDeduction (top-level)
//   - master courseProducts[k].skipStockDeduction (if sub-product matches)
//   - customer entry's c.skipStockDeduction
//   - drift category:
//       'master-true-customer-false' (THE V43 bug — flag added to master
//                                     after customer purchase)
//       'master-false-customer-true' (rare; flag REMOVED from master)
//       'master-missing'             (course no longer in master)
//       'in-sync'                    (master and customer agree)
//
// Usage:
//   1. vercel env pull .env.local.prod --environment=production   (already done)
//   2. node scripts/v43-diag-customer-courses-skip-stock.mjs
//
// Rule M compliance:
//   - admin SDK (no client SDK)
//   - canonical path artifacts/{APP_ID}/public/data/...
//   - PEM key \n → \n unescape
//   - invocation guard so unit-test imports don't auto-run
//   - read-only (no --apply flag, no audit doc)

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
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* missing in .env.local.prod');
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

/** Pure helper — drift classification. Exported for unit tests. */
export function classifyDrift(masterDoc, masterSubProduct, customerEntry) {
  if (!masterDoc) return 'master-missing';
  // Resolve effective master flag for THIS customer entry's sub-product:
  //   sub-product flag wins; falls back to course-level flag.
  const subFlag = masterSubProduct?.skipStockDeduction;
  const topFlag = !!masterDoc.skipStockDeduction;
  const effectiveMaster = (subFlag != null) ? !!subFlag : topFlag;
  const customerFlag = !!customerEntry?.skipStockDeduction;
  if (effectiveMaster === customerFlag) return 'in-sync';
  if (effectiveMaster && !customerFlag) return 'master-true-customer-false';
  return 'master-false-customer-true';
}

/** Best-effort sub-product match by productId then by productName. */
export function findMasterSubProduct(masterDoc, customerEntry) {
  if (!masterDoc || !Array.isArray(masterDoc.courseProducts)) return null;
  const cId = customerEntry?.productId ? String(customerEntry.productId).trim() : '';
  const cName = customerEntry?.product ? String(customerEntry.product).trim() : '';
  if (cId) {
    const byId = masterDoc.courseProducts.find(p => String(p?.productId || '').trim() === cId);
    if (byId) return byId;
  }
  if (cName) {
    const byName = masterDoc.courseProducts.find(p =>
      String(p?.productName || p?.name || '').trim() === cName
    );
    if (byName) return byName;
  }
  return null;
}

async function main() {
  const db = initFirestore();
  const data = dataPath(db);

  console.log('[v43-diag] reading be_courses ...');
  const courseSnap = await data.collection('be_courses').get();
  const masterByName = new Map();
  for (const d of courseSnap.docs) {
    const c = d.data();
    if (!c?.courseName) continue;
    masterByName.set(String(c.courseName).trim(), { ...c, _docId: d.id });
  }
  console.log(`[v43-diag]   ${courseSnap.size} be_courses (${masterByName.size} unique by courseName)`);

  console.log('[v43-diag] reading be_customers ...');
  const custSnap = await data.collection('be_customers').get();
  console.log(`[v43-diag]   ${custSnap.size} be_customers`);

  const counts = {
    'in-sync': 0,
    'master-true-customer-false': 0,
    'master-false-customer-true': 0,
    'master-missing': 0,
    'no-courses': 0,
    'totalEntries': 0,
    'customersWithDrift': 0,
  };
  const samples = {
    'master-true-customer-false': [],
    'master-false-customer-true': [],
    'master-missing': [],
  };

  for (const cd of custSnap.docs) {
    const cust = cd.data();
    const courses = Array.isArray(cust?.courses) ? cust.courses : [];
    if (courses.length === 0) {
      counts['no-courses'] += 1;
      continue;
    }
    let driftThisCust = false;
    for (let i = 0; i < courses.length; i++) {
      const entry = courses[i];
      if (!entry || !entry.name) continue;
      counts.totalEntries += 1;
      const masterDoc = masterByName.get(String(entry.name).trim());
      const sub = findMasterSubProduct(masterDoc, entry);
      const cls = classifyDrift(masterDoc, sub, entry);
      counts[cls] = (counts[cls] || 0) + 1;
      if (cls !== 'in-sync') driftThisCust = true;
      if (cls !== 'in-sync' && samples[cls] && samples[cls].length < 10) {
        samples[cls].push({
          customerId: cd.id,
          customerName: cust?.patientData?.firstName
            ? `${cust.patientData.firstName} ${cust.patientData.lastName || ''}`.trim()
            : '',
          courseIndex: i,
          courseName: entry.name,
          productInEntry: entry.product || '',
          productIdInEntry: entry.productId || '',
          customerEntryFlag: !!entry.skipStockDeduction,
          masterTopFlag: masterDoc ? !!masterDoc.skipStockDeduction : null,
          masterSubFlag: sub ? !!sub.skipStockDeduction : null,
          masterSubMatched: !!sub,
          masterCourseId: masterDoc?._docId || null,
          source: entry.source || '',
          parentName: entry.parentName || '',
        });
      }
    }
    if (driftThisCust) counts.customersWithDrift += 1;
  }

  console.log('\n[v43-diag] === REPORT ===');
  console.log(`  Customers scanned:                  ${custSnap.size}`);
  console.log(`  Customers with no courses:          ${counts['no-courses']}`);
  console.log(`  Customers with drift:               ${counts.customersWithDrift}`);
  console.log(`  Total customer.courses[] entries:   ${counts.totalEntries}`);
  console.log(`  In-sync:                            ${counts['in-sync']}`);
  console.log(`  ⚠ master-true-customer-false (V43 bug): ${counts['master-true-customer-false']}`);
  console.log(`  ⚠ master-false-customer-true:           ${counts['master-false-customer-true']}`);
  console.log(`  ⚠ master-missing (orphan):              ${counts['master-missing']}`);
  console.log('');
  for (const [key, list] of Object.entries(samples)) {
    if (list.length === 0) continue;
    console.log(`\n  --- ${key} sample (showing ${list.length}) ---`);
    for (const s of list) {
      console.log(`    customer=${s.customerId} (${s.customerName})`);
      console.log(`      [${s.courseIndex}] courseName="${s.courseName}" product="${s.productInEntry}" pid=${s.productIdInEntry}`);
      console.log(`      master.top=${s.masterTopFlag} master.sub=${s.masterSubFlag} (matched=${s.masterSubMatched}) | customer.flag=${s.customerEntryFlag}`);
      console.log(`      source=${s.source} parent=${s.parentName} masterId=${s.masterCourseId}`);
    }
  }
  console.log('\n[v43-diag] DONE');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[v43-diag] FATAL:', err);
    process.exit(1);
  });
}
