#!/usr/bin/env node
// ─── V43 — Backfill — customer.courses[] skip-stock flag from be_courses ─────
//
// Rule M canonical migration script. Restamps every customer.courses[i] entry
// whose `skipStockDeduction` is stale relative to the current be_courses
// master. Sub-product-level flag wins; falls back to course-level.
//
// V43 root cause (see .agents/sessions/<v43>): customer.courses[i] is
// denormalized at buy time. Master-flag edits AFTER purchase don't
// propagate. Diag (scripts/v43-diag-customer-courses-skip-stock.mjs) found
// 3 prod entries on LC-26000006 with master.sub=true / customer.flag=false.
//
// Companion: src/lib/treatmentBuyHelpers.js exports `resolveCustomerCourseSkipFlag`
// + `overlayCustomerCoursesWithMaster`. This script's classifier mirrors
// `resolveCustomerCourseSkipFlag` so the migration + UI overlay + diag use
// the SAME resolution logic (V12 single-source contract).
//
// Usage:
//   1. vercel env pull .env.local.prod --environment=production   (already done)
//   2. node scripts/v43-backfill-customer-courses-skip-stock.mjs           # DRY RUN
//   3. node scripts/v43-backfill-customer-courses-skip-stock.mjs --apply   # COMMIT
//
// Rule M compliance:
//   - admin SDK (no client SDK)
//   - canonical path artifacts/{APP_ID}/public/data/...
//   - PEM key \n → \n unescape
//   - invocation guard so unit-test imports don't auto-run
//   - two-phase: --apply gate
//   - audit doc be_admin_audit/v43-backfill-customer-courses-skip-stock-<ts>-<rand>
//   - idempotent: re-run with --apply yields 0 writes
//   - forensic-trail fields: _v43BackfilledAt + _v43BackfilledFrom (per-entry stamp)
//   - crypto-secure random for audit doc id
//   - orphan customers (no master found) preserve frozen value (no regression)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');

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

/**
 * Pure helper — find sub-product match in be_courses master. Mirrors
 * src/lib/treatmentBuyHelpers.js:resolveCustomerCourseSkipFlag (intentional
 * duplication: the lib helper is browser-side; this is admin-SDK Node.js).
 * Single-source contract: BOTH must use the same matching logic.
 *
 * @param {object|null} masterDoc
 * @param {object} customerEntry
 * @returns {object|null}
 */
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

/**
 * Pure helper — compute the EFFECTIVE skip-stock flag for one
 * customer.courses[i] entry. Mirrors lib helper resolveCustomerCourseSkipFlag.
 *
 * @param {object} customerEntry
 * @param {object|null} masterDoc
 * @returns {boolean}
 */
export function resolveEffectiveFlag(customerEntry, masterDoc) {
  if (!masterDoc) return !!customerEntry?.skipStockDeduction;
  const matched = findMasterSubProduct(masterDoc, customerEntry);
  if (matched) return !!matched.skipStockDeduction;
  return !!masterDoc.skipStockDeduction;
}

/**
 * Plan one customer's backfill. Returns { needsUpdate, newCourses, perEntry }
 * where perEntry is per-index drift detail for the audit log.
 *
 * Pure — input not mutated. New courses array preserves all sibling fields.
 */
export function planCustomerBackfill(customerData, masterByName) {
  const courses = Array.isArray(customerData?.courses) ? customerData.courses : [];
  if (courses.length === 0) {
    return { needsUpdate: false, newCourses: courses, perEntry: [] };
  }
  const newCourses = [];
  const perEntry = [];
  let dirty = false;
  for (let i = 0; i < courses.length; i++) {
    const entry = courses[i];
    if (!entry || typeof entry !== 'object') {
      newCourses.push(entry);
      continue;
    }
    const masterDoc = masterByName.get(String(entry.name || '').trim()) || null;
    const effective = resolveEffectiveFlag(entry, masterDoc);
    const before = !!entry.skipStockDeduction;
    if (effective === before) {
      newCourses.push(entry);
      continue;
    }
    // Drift detected → restamp + forensic-trail fields.
    // V43 fix #1 (2026-05-08): FieldValue.serverTimestamp() is REJECTED by
    // Firestore Admin SDK inside arrays — "FieldValue.serverTimestamp()
    // cannot be used inside of an array". customer.courses is an array
    // field. Use ISO string for in-array timestamps; serverTimestamp()
    // remains valid at customer-doc top-level (_v43LastBackfillAt below).
    dirty = true;
    perEntry.push({
      index: i,
      courseName: entry.name || '',
      productName: entry.product || '',
      productId: entry.productId || '',
      before,
      after: effective,
      masterCourseId: masterDoc?._docId || null,
    });
    newCourses.push({
      ...entry,
      skipStockDeduction: effective,
      _v43BackfilledAt: new Date().toISOString(),
      _v43BackfilledFrom: before,
    });
  }
  return { needsUpdate: dirty, newCourses, perEntry };
}

async function main() {
  const db = initFirestore();
  const data = dataPath(db);

  console.log(`[v43-backfill] mode = ${APPLY ? 'APPLY (writes will commit)' : 'DRY RUN (no writes)'}`);
  console.log('[v43-backfill] reading be_courses ...');
  const courseSnap = await data.collection('be_courses').get();
  const masterByName = new Map();
  for (const d of courseSnap.docs) {
    const c = d.data();
    if (!c?.courseName) continue;
    masterByName.set(String(c.courseName).trim(), { ...c, _docId: d.id });
  }
  console.log(`[v43-backfill]   ${courseSnap.size} be_courses (${masterByName.size} unique by courseName)`);

  console.log('[v43-backfill] reading be_customers ...');
  const custSnap = await data.collection('be_customers').get();
  console.log(`[v43-backfill]   ${custSnap.size} be_customers`);

  const driftSamples = [];
  let scanned = 0;
  let customersWithDrift = 0;
  let totalEntriesFixed = 0;
  let driftToTrue = 0;   // master.true → customer.true (V43 bug fix direction)
  let driftToFalse = 0;  // master.false → customer.false (rare reversal)

  // Iterate + plan
  const plans = [];
  for (const cd of custSnap.docs) {
    scanned += 1;
    const cust = cd.data();
    const plan = planCustomerBackfill(cust, masterByName);
    if (!plan.needsUpdate) continue;
    customersWithDrift += 1;
    totalEntriesFixed += plan.perEntry.length;
    for (const e of plan.perEntry) {
      if (e.after === true) driftToTrue += 1;
      else driftToFalse += 1;
    }
    if (driftSamples.length < 10) {
      driftSamples.push({
        customerId: cd.id,
        entryCount: plan.perEntry.length,
        first: plan.perEntry[0],
      });
    }
    plans.push({ customerId: cd.id, plan });
  }

  console.log('\n[v43-backfill] === DRIFT ===');
  console.log(`  Customers scanned:         ${scanned}`);
  console.log(`  Customers with drift:      ${customersWithDrift}`);
  console.log(`  Total entries to restamp:  ${totalEntriesFixed}`);
  console.log(`    direction: false→true:   ${driftToTrue}`);
  console.log(`    direction: true→false:   ${driftToFalse}`);
  if (driftSamples.length > 0) {
    console.log('\n  --- sample (showing up to 10) ---');
    for (const s of driftSamples) {
      console.log(`    customer=${s.customerId}  entries=${s.entryCount}`);
      console.log(`      first: [${s.first.index}] "${s.first.courseName}" / "${s.first.productName}"`);
      console.log(`             ${s.first.before} → ${s.first.after}  (masterId=${s.first.masterCourseId})`);
    }
  }

  if (!APPLY) {
    console.log('\n[v43-backfill] DRY RUN — no writes. Re-run with --apply to commit.');
    return;
  }

  // Apply phase
  console.log(`\n[v43-backfill] APPLYING ${plans.length} customer updates ...`);
  let applied = 0;
  let batchOp = db.batch();
  let inBatch = 0;
  const customerIdsTouched = [];
  for (const { customerId, plan } of plans) {
    const ref = data.collection('be_customers').doc(customerId);
    batchOp.update(ref, {
      courses: plan.newCourses,
      _v43LastBackfillAt: FieldValue.serverTimestamp(),
    });
    customerIdsTouched.push(customerId);
    inBatch += 1;
    if (inBatch >= 400) {
      await batchOp.commit();
      applied += inBatch;
      console.log(`[v43-backfill]   committed ${applied}/${plans.length} ...`);
      batchOp = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) {
    await batchOp.commit();
    applied += inBatch;
  }
  console.log(`[v43-backfill]   committed ${applied}/${plans.length} TOTAL`);

  // Audit doc — Rule M canonical
  const auditId = `v43-backfill-customer-courses-skip-stock-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    type: 'v43-backfill-customer-courses-skip-stock',
    scanned,
    customersWithDrift,
    totalEntriesFixed,
    driftToTrue,
    driftToFalse,
    customerIdsTouched: customerIdsTouched.slice(0, 200), // cap; full list not needed
    customerIdsTouchedCount: customerIdsTouched.length,
    appliedAt: FieldValue.serverTimestamp(),
    invokedFrom: 'scripts/v43-backfill-customer-courses-skip-stock.mjs',
  });
  console.log(`[v43-backfill] audit doc: be_admin_audit/${auditId}`);
  console.log('[v43-backfill] DONE');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[v43-backfill] FATAL:', err);
    process.exit(1);
  });
}
