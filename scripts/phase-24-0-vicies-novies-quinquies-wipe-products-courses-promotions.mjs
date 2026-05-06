#!/usr/bin/env node
// ─── Phase 24.0-vicies-novies-quinquies — wipe be_products + be_courses + be_promotions ──
//
// Phase 24.0-vicies-novies-quinquies (2026-05-07)
//
// User directive (verbatim): "งั้นตอนนี้ ต้องการแค่ ลบ ยา บริการ สินค้า
// คอร์ส โปรโมชั่น ลูกค้าอย่างเพิ่งลบ แล้วจะนำเข้าจาก proclinic อีกที" +
// follow-up "คูปอง voucher ด้วย".
//
// Scope (5 collections):
//   - be_products   (covers all productType: 'ยา' / 'บริการ' / 'สินค้า')
//   - be_courses
//   - be_promotions
//   - be_coupons
//   - be_vouchers
//
// PRESERVED (NOT touched):
//   - be_customers    ← user explicitly said "ลูกค้าอย่างเพิ่งลบ"
//   - be_doctors / be_staff / be_branches / etc. (the rest of master-data)
//   - be_appointments / be_sales / be_treatments / be_deposits (transactional)
//   - be_stock_*      (stock data — references be_products.productId; will
//                      orphan after this wipe + re-migrate; admin must
//                      manually verify stock after products are re-imported)
//
// Cascading orphan refs accepted (user agreed). After this wipe + re-migrate
// from ProClinic prod via UI sync buttons:
//   - be_sales.items[].productId / courseId       → orphan if prod IDs differ
//   - be_treatments.treatmentItems / consumables  → orphan
//   - be_stock_batches.productId                  → orphan
//   - be_promotions usage in sales                → none (be_promotions is
//                                                    application-side; sales
//                                                    don't store promotionId)
//
// Two-phase: dry-run by default, --apply commits. Audit doc per Rule M.
//
// Run via:
//   node scripts/phase-24-0-vicies-novies-quinquies-wipe-products-courses-promotions.mjs           (dry-run)
//   node scripts/phase-24-0-vicies-novies-quinquies-wipe-products-courses-promotions.mjs --apply  (commit)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Load env ──────────────────────────────────────────────────────────────
function parseEnvFile(text) {
  const out = {};
  const re = /^([A-Z0-9_]+)=(?:"((?:\\.|[^"\\])*)"|'([^']*)'|(.*))$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    let val;
    if (m[2] !== undefined) val = m[2].replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    else if (m[3] !== undefined) val = m[3];
    else val = (m[4] || '').trim();
    out[m[1]] = val;
  }
  return out;
}
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const parsed = parseEnvFile(readFileSync(envFile, 'utf-8'));
  for (const [k, v] of Object.entries(parsed)) process.env[k] = v;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const AUDIT_COLLECTION = `${BASE_PATH}/be_admin_audit`;

const TARGET_COLLECTIONS = Object.freeze([
  'be_products',
  'be_courses',
  'be_promotions',
  'be_coupons',
  'be_vouchers',
]);

const apply = process.argv.includes('--apply');
const dryRun = !apply;

// ─── Helpers ───────────────────────────────────────────────────────────────
export function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

function initFirebase() {
  if (getApps().length > 0) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!privateKey || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
    console.error('[wipe-pcp] FATAL — missing FIREBASE_ADMIN_* env vars');
    process.exit(1);
  }
  initializeApp({
    credential: cert({
      type: 'service_account',
      project_id: APP_ID,
      private_key: privateKey,
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    }),
  });
}

async function collectDocPaths(db, collectionPath) {
  const paths = [];
  const colRef = db.collection(collectionPath);
  const snap = await colRef.get();
  for (const doc of snap.docs) {
    paths.push(doc.ref.path);
    // Defense-in-depth: scan subcollections too (some be_* docs have
    // child collections like be_products/{id}/labels — we don't expect
    // any here but if they exist, wipe them with the parent).
    const subCols = await doc.ref.listCollections();
    for (const sub of subCols) {
      const subPaths = await collectDocPaths(db, `${collectionPath}/${doc.id}/${sub.id}`);
      paths.push(...subPaths);
    }
  }
  return paths;
}

async function deletePaths(db, paths) {
  const BATCH_SIZE = 400;
  let deleted = 0;
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const slice = paths.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const p of slice) batch.delete(db.doc(p));
    await batch.commit();
    deleted += slice.length;
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[wipe-pcp] committed batch ${batchNum} (${deleted}/${paths.length})`);
  }
  return deleted;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[wipe-pcp] mode = ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`[wipe-pcp] target collections: ${TARGET_COLLECTIONS.join(', ')}`);
  initFirebase();
  const db = getFirestore();

  const tally = {};
  const allPaths = [];

  for (const col of TARGET_COLLECTIONS) {
    const colPath = `${BASE_PATH}/${col}`;
    process.stdout.write(`[wipe-pcp] scanning ${col}... `);
    const paths = await collectDocPaths(db, colPath);
    tally[col] = paths.length;
    allPaths.push(...paths);
    console.log(`${paths.length} docs`);
  }

  const total = allPaths.length;
  console.log(`[wipe-pcp] total docs to wipe: ${total}`);
  console.log('[wipe-pcp] tally-by-collection:', tally);

  if (dryRun) {
    console.log('[wipe-pcp] DRY-RUN — no writes. Re-run with --apply to commit.');
    process.exit(0);
  }

  // APPLY
  if (total === 0) {
    console.log('[wipe-pcp] APPLY — 0 docs to delete (idempotent re-run).');
    const auditId = `phase-24-0-vicies-novies-quinquies-wipe-pcp-${Date.now()}-${randHex()}`;
    await db.collection(AUDIT_COLLECTION).doc(auditId).set({
      phase: '24.0-vicies-novies-quinquies',
      op: 'wipe-products-courses-promotions',
      scanned: 0,
      deleted: 0,
      tallyByCollection: {},
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(`[wipe-pcp] APPLY done (0 deleted). Audit: ${AUDIT_COLLECTION}/${auditId}`);
    process.exit(0);
  }

  // Sort longest-first so subcollection items delete before parent
  const sortedPaths = [...allPaths].sort((a, b) => b.length - a.length);

  const deleted = await deletePaths(db, sortedPaths);

  const auditId = `phase-24-0-vicies-novies-quinquies-wipe-pcp-${Date.now()}-${randHex()}`;
  await db.collection(AUDIT_COLLECTION).doc(auditId).set({
    phase: '24.0-vicies-novies-quinquies',
    op: 'wipe-products-courses-promotions',
    scanned: total,
    deleted,
    tallyByCollection: tally,
    targetCollections: [...TARGET_COLLECTIONS],
    appliedAt: FieldValue.serverTimestamp(),
  });

  console.log(`[wipe-pcp] APPLY done — ${deleted} deleted. Audit: ${AUDIT_COLLECTION}/${auditId}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[wipe-pcp] FATAL', err);
    process.exit(1);
  });
}
