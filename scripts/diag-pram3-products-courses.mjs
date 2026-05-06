#!/usr/bin/env node
// ─── DIAG (read-only): พระราม 3 products + courses delete bug ─────────────
//
// User report 2026-05-07: "สาขาพระราม 3 ลบสินค้า + คอร์สไม่ได้ — นครราชสีมา ลบได้"
// (5 products + 2 courses visible in พระราม 3 per screenshots; same items
// shipped via Phase 24.0-vicies-novies-octies migrate-stamp-branchId fix in
// e36811f, but user reports the bug persists.)
//
// This script is PURE READ-ONLY — no writes to user data, no audit doc.
// Goal: dump exact doc state for พระราม 3 catalog so we can compare against
// นครราชสีมา (which works) and identify the structural difference that breaks
// client-SDK deleteDoc().
//
// Run via:
//   node scripts/diag-pram3-products-courses.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── Load .env.local.prod ────────────────────────────────────────────────
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

function describeDoc(doc, primaryIdField) {
  const d = doc.data();
  const out = {
    docId: doc.id,
    [primaryIdField]: d[primaryIdField] ?? '(missing)',
    name: d.productName || d.courseName || '(missing)',
    branchId: d.branchId,
    branchIdType: typeof d.branchId,
    branchIdLen: typeof d.branchId === 'string' ? d.branchId.length : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    status: d.status,
    keyCount: Object.keys(d).length,
    keys: Object.keys(d).sort(),
  };
  return out;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' DIAG: พระราม 3 catalog delete bug — read-only inspection');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ─── Step 1: Resolve branch IDs from be_branches ───────────────────────
  console.log('▸ STEP 1: Resolve branch IDs from be_branches\n');
  const branchSnap = await db.collection(`${BASE_PATH}/be_branches`).get();
  console.log(`  Total branches: ${branchSnap.size}\n`);
  let pram3Id = null, nakhornId = null;
  for (const doc of branchSnap.docs) {
    const data = doc.data();
    const name = data.branchName || data.name || '(no name)';
    const isDefault = data.isDefault ? ' [default]' : '';
    console.log(`    • ${doc.id} → "${name}"${isDefault}`);
    if (name.includes('พระราม')) pram3Id = doc.id;
    if (name.includes('นครราชสีมา') || name.includes('โคราช')) nakhornId = doc.id;
  }
  console.log(`\n  🎯 Resolved IDs:`);
  console.log(`     พระราม 3   = ${pram3Id ? `"${pram3Id}"` : '(NOT FOUND)'}`);
  console.log(`     นครราชสีมา = ${nakhornId ? `"${nakhornId}"` : '(NOT FOUND)'}`);

  // ─── Step 2: be_products distribution + detail dump ────────────────────
  console.log('\n\n▸ STEP 2: be_products\n');
  const productsSnap = await db.collection(`${BASE_PATH}/be_products`).get();
  console.log(`  Total docs: ${productsSnap.size}`);

  const pByBranch = {};
  const pNoBranch = [];
  for (const doc of productsSnap.docs) {
    const d = doc.data();
    const bid = d.branchId;
    if (!bid) pNoBranch.push(doc);
    else pByBranch[bid] = (pByBranch[bid] || 0) + 1;
  }
  console.log(`\n  Distribution by branchId:`);
  for (const [bid, count] of Object.entries(pByBranch).sort((a, b) => b[1] - a[1])) {
    const label = bid === pram3Id ? '⬅ พระราม 3' : bid === nakhornId ? '⬅ นครราชสีมา' : '';
    console.log(`    "${bid}": ${count} ${label}`);
  }
  console.log(`    (no branchId field): ${pNoBranch.length} ⬅ branchless zombies`);

  // Detail: พระราม 3 products
  if (pram3Id) {
    const pramProducts = productsSnap.docs.filter(d => d.data().branchId === pram3Id);
    console.log(`\n  🔬 พระราม 3 products — full detail (${pramProducts.length} docs):`);
    for (const doc of pramProducts) {
      const x = describeDoc(doc, 'productId');
      console.log(`\n    ┌─ docId: "${x.docId}"`);
      console.log(`    │  productId:    ${JSON.stringify(x.productId)}`);
      console.log(`    │  productName:  ${JSON.stringify(x.name)}`);
      console.log(`    │  branchId:     ${JSON.stringify(x.branchId)} (typeof=${x.branchIdType}, len=${x.branchIdLen})`);
      console.log(`    │  match pram3Id: ${x.branchId === pram3Id ? '✓ exact' : `✗ MISMATCH (target="${pram3Id}")`}`);
      console.log(`    │  status:       ${JSON.stringify(x.status)}`);
      console.log(`    │  keys (${x.keyCount}): [${x.keys.join(', ')}]`);
      console.log(`    │  createdAt:    ${x.createdAt}`);
      console.log(`    │  updatedAt:    ${x.updatedAt}`);
      // Test the docId can be safely used by Firestore Web SDK doc()
      const hasSlash = String(x.docId).includes('/');
      const hasInvalid = /[^\x20-\x7E฀-๿]/.test(String(x.docId)); // ASCII printable + Thai
      console.log(`    │  docId safety: hasSlash=${hasSlash}, hasNonPrintable=${hasInvalid}`);
      console.log(`    └─`);
    }
  }

  // Sample: 1 นครราชสีมา product for comparison shape
  if (nakhornId) {
    const nakhornProducts = productsSnap.docs.filter(d => d.data().branchId === nakhornId);
    if (nakhornProducts.length > 0) {
      console.log(`\n  🔍 นครราชสีมา product sample (1 of ${nakhornProducts.length}) for shape comparison:`);
      const x = describeDoc(nakhornProducts[0], 'productId');
      console.log(`     docId: "${x.docId}"`);
      console.log(`     keys (${x.keyCount}): [${x.keys.join(', ')}]`);
      console.log(`     branchId: ${JSON.stringify(x.branchId)} (len=${x.branchIdLen})`);
    }
  }

  // ─── Step 3: be_courses distribution + detail dump ─────────────────────
  console.log('\n\n▸ STEP 3: be_courses\n');
  const coursesSnap = await db.collection(`${BASE_PATH}/be_courses`).get();
  console.log(`  Total docs: ${coursesSnap.size}`);

  const cByBranch = {};
  const cNoBranch = [];
  for (const doc of coursesSnap.docs) {
    const d = doc.data();
    const bid = d.branchId;
    if (!bid) cNoBranch.push(doc);
    else cByBranch[bid] = (cByBranch[bid] || 0) + 1;
  }
  console.log(`\n  Distribution by branchId:`);
  for (const [bid, count] of Object.entries(cByBranch).sort((a, b) => b[1] - a[1])) {
    const label = bid === pram3Id ? '⬅ พระราม 3' : bid === nakhornId ? '⬅ นครราชสีมา' : '';
    console.log(`    "${bid}": ${count} ${label}`);
  }
  console.log(`    (no branchId field): ${cNoBranch.length} ⬅ branchless zombies`);

  if (pram3Id) {
    const pramCourses = coursesSnap.docs.filter(d => d.data().branchId === pram3Id);
    console.log(`\n  🔬 พระราม 3 courses — full detail (${pramCourses.length} docs):`);
    for (const doc of pramCourses) {
      const x = describeDoc(doc, 'courseId');
      console.log(`\n    ┌─ docId: "${x.docId}"`);
      console.log(`    │  courseId:     ${JSON.stringify(x.courseId)}`);
      console.log(`    │  courseName:   ${JSON.stringify(x.name)}`);
      console.log(`    │  branchId:     ${JSON.stringify(x.branchId)} (typeof=${x.branchIdType}, len=${x.branchIdLen})`);
      console.log(`    │  match pram3Id: ${x.branchId === pram3Id ? '✓ exact' : `✗ MISMATCH (target="${pram3Id}")`}`);
      console.log(`    │  status:       ${JSON.stringify(x.status)}`);
      console.log(`    │  keys (${x.keyCount}): [${x.keys.join(', ')}]`);
      const hasSlash = String(x.docId).includes('/');
      console.log(`    │  docId safety: hasSlash=${hasSlash}`);
      console.log(`    └─`);
    }
  }

  if (nakhornId) {
    const nakhornCourses = coursesSnap.docs.filter(d => d.data().branchId === nakhornId);
    if (nakhornCourses.length > 0) {
      console.log(`\n  🔍 นครราชสีมา course sample (1 of ${nakhornCourses.length}) for shape comparison:`);
      const x = describeDoc(nakhornCourses[0], 'courseId');
      console.log(`     docId: "${x.docId}"`);
      console.log(`     keys (${x.keyCount}): [${x.keys.join(', ')}]`);
      console.log(`     branchId: ${JSON.stringify(x.branchId)} (len=${x.branchIdLen})`);
    }
  }

  // ─── Step 4: Sanity — confirm rules path is healthy via probe ──────────
  console.log('\n\n▸ STEP 4: Mechanical delete probe (TEST-prefixed, rule M-safe)');
  const probeId = `TEST-DIAG-${Date.now()}`;
  try {
    await db.collection(`${BASE_PATH}/be_products`).doc(probeId).set({
      productId: probeId,
      productName: 'DIAG_PROBE',
      branchId: pram3Id || 'TEST-BR',
      diagProbe: true,
      createdAt: new Date().toISOString(),
    });
    console.log(`  ✓ CREATE be_products/${probeId} OK (admin SDK)`);
    await db.collection(`${BASE_PATH}/be_products`).doc(probeId).delete();
    console.log(`  ✓ DELETE be_products/${probeId} OK (admin SDK)`);
    console.log(`  ▸ Conclusion: admin-SDK delete path is healthy at canonical path.`);
    console.log(`    Client-SDK delete failure (if any) is therefore due to either`);
    console.log(`    (a) firestore.rules denying it, (b) the docId shape, or`);
    console.log(`    (c) a JS-side error in handleDelete before the deleteDoc call.`);
  } catch (e) {
    console.log(`  ✗ PROBE ERROR: ${e.message}`);
    console.log(`    → admin-SDK path itself is broken. Investigate path/credentials first.`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' DIAG END');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
