#!/usr/bin/env node
// ─── V44 — Backfill — customer.courses[] product-name re-resolve ────────────
//
// Rule M two-phase migration. Restamps `product` field on customer.courses[i]
// entries that have product-name drift from be_courses master. Companion to
// V44 source-fix (TFP buy fetcher → beCourseToMasterShape).
//
// Drift fingerprints fixed:
//   - product === entry.name (course-name leak — V44 bug signature)
//   - product === '' or undefined (Firestore-stripped) AND master has main
//
// Resolution: re-stamp product = mainProductName (master) when the entry
// represents the main product context. Sub-product context entries are
// SKIPPED (ambiguous — N entries all named courseName can't be deterministically
// mapped to N specific subs without additional context). Admin can manually
// resolve via customer-page Edit if any sub-product entry needs restamping.
//
// Idempotent: re-run with --apply yields 0 writes.
// Forensic-trail: _v44ProductBackfilledAt + _v44ProductBackfilledFrom.
//
// Usage:
//   node scripts/v44-backfill-customer-courses-product-name.mjs           # DRY RUN
//   node scripts/v44-backfill-customer-courses-product-name.mjs --apply   # COMMIT

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
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* missing');
  const privateKey = rawKey.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore();
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

/**
 * Pure helper — decide whether a customer.courses[i] entry needs restamping
 * + compute the new product field. Exported for unit tests.
 */
export function planEntryRestamp(entry, masterDoc) {
  if (!entry || !masterDoc) return { needsRestamp: false };
  const product = String(entry.product || '').trim();
  const courseName = String(entry.name || '').trim();
  const mainName = String(masterDoc.mainProductName || '').trim();
  const mainId = String(masterDoc.mainProductId || '').trim();

  // Drift signature: product is empty OR product === courseName (V44 bug)
  const isDrift = !product || product === courseName;
  if (!isDrift) return { needsRestamp: false };

  // Only restamp if master has a mainProductName to put there (sub-product
  // context is ambiguous when N entries all carry courseName).
  if (!mainName) return { needsRestamp: false, reason: 'no-main-on-master' };

  return {
    needsRestamp: true,
    newProduct: mainName,
    newProductId: mainId,
    fromProduct: product,
    masterCourseId: masterDoc._docId || null,
  };
}

async function main() {
  const db = initFirestore();
  const data = dataPath(db);

  console.log(`[v44-backfill] mode = ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log('[v44-backfill] reading be_courses ...');
  const courseSnap = await data.collection('be_courses').get();
  const masterByName = new Map();
  for (const d of courseSnap.docs) {
    const c = d.data();
    if (!c?.courseName) continue;
    masterByName.set(String(c.courseName).trim(), { ...c, _docId: d.id });
  }
  console.log(`[v44-backfill]   ${courseSnap.size} be_courses (${masterByName.size} unique names)`);

  console.log('[v44-backfill] reading be_customers ...');
  const custSnap = await data.collection('be_customers').get();
  console.log(`[v44-backfill]   ${custSnap.size} customers\n`);

  const plans = [];
  let totalEntriesPlanned = 0;
  let customersAffected = 0;
  for (const cd of custSnap.docs) {
    const cust = cd.data();
    const courses = Array.isArray(cust?.courses) ? cust.courses : [];
    if (!courses.length) continue;
    const newCourses = [];
    let dirty = false;
    const perEntry = [];
    for (let i = 0; i < courses.length; i++) {
      const entry = courses[i];
      if (!entry || typeof entry !== 'object') {
        newCourses.push(entry);
        continue;
      }
      const masterDoc = masterByName.get(String(entry.name || '').trim()) || null;
      const plan = planEntryRestamp(entry, masterDoc);
      if (!plan.needsRestamp) {
        newCourses.push(entry);
        continue;
      }
      dirty = true;
      perEntry.push({ index: i, ...plan });
      totalEntriesPlanned += 1;
      newCourses.push({
        ...entry,
        product: plan.newProduct,
        productId: plan.newProductId || entry.productId || '',
        _v44ProductBackfilledAt: new Date().toISOString(),
        _v44ProductBackfilledFrom: plan.fromProduct,
      });
    }
    if (dirty) {
      customersAffected += 1;
      plans.push({ customerId: cd.id, newCourses, perEntry });
    }
  }

  console.log('[v44-backfill] === DRIFT ===');
  console.log(`  Customers scanned:     ${custSnap.size}`);
  console.log(`  Customers w/ drift:    ${customersAffected}`);
  console.log(`  Entries to restamp:    ${totalEntriesPlanned}`);
  if (plans.length > 0) {
    console.log('\n  --- sample (showing up to 5) ---');
    for (const p of plans.slice(0, 5)) {
      console.log(`    customer=${p.customerId}  entries=${p.perEntry.length}`);
      for (const e of p.perEntry.slice(0, 3)) {
        console.log(`      [${e.index}] "${e.fromProduct}" → "${e.newProduct}" (master=${e.masterCourseId})`);
      }
    }
  }

  if (!APPLY) {
    console.log('\n[v44-backfill] DRY RUN — no writes. Re-run with --apply to commit.');
    return;
  }

  if (plans.length === 0) {
    console.log('\n[v44-backfill] nothing to apply — exiting cleanly');
    return;
  }

  console.log(`\n[v44-backfill] APPLYING ${plans.length} customer updates ...`);
  let applied = 0;
  let batchOp = db.batch();
  let inBatch = 0;
  const customerIdsTouched = [];
  for (const p of plans) {
    const ref = data.collection('be_customers').doc(p.customerId);
    batchOp.update(ref, {
      courses: p.newCourses,
      _v44LastBackfillAt: FieldValue.serverTimestamp(),
    });
    customerIdsTouched.push(p.customerId);
    inBatch += 1;
    if (inBatch >= 400) {
      await batchOp.commit();
      applied += inBatch;
      console.log(`[v44-backfill]   committed ${applied}/${plans.length} ...`);
      batchOp = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) {
    await batchOp.commit();
    applied += inBatch;
  }
  console.log(`[v44-backfill]   committed ${applied}/${plans.length} TOTAL`);

  // Audit doc — Rule M canonical
  const auditId = `v44-backfill-customer-courses-product-name-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    type: 'v44-backfill-customer-courses-product-name',
    scanned: custSnap.size,
    customersAffected,
    totalEntriesRestamped: totalEntriesPlanned,
    customerIdsTouched: customerIdsTouched.slice(0, 200),
    customerIdsTouchedCount: customerIdsTouched.length,
    appliedAt: FieldValue.serverTimestamp(),
    invokedFrom: 'scripts/v44-backfill-customer-courses-product-name.mjs',
  });
  console.log(`[v44-backfill] audit doc: be_admin_audit/${auditId}`);
  console.log('[v44-backfill] DONE');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('[v44-backfill] FATAL:', err);
    process.exit(1);
  });
}
