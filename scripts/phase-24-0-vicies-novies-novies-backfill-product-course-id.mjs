#!/usr/bin/env node
// ─── Phase 24.0-vicies-novies-novies — backfill productId / courseId (V38) ─
//
// Bug surfaced 2026-05-07: user reports "ลบสินค้า/คอร์ส สาขาพระราม 3 ไม่ได้".
// Diag (scripts/diag-pram3-products-courses.mjs) revealed:
//
//   • นครราชสีมา product (works): docId="1020", data has productId="1020", NO `id` field
//   • พระราม 3 product (broken):  docId="PRODUCTS_<ts>_<hex>", data MISSING productId,
//                                  data HAS `id` field (overrode docId in spread)
//
// Root cause: baseline-migration scripts (`branch-merge-apply.mjs`,
// `customer-branch-baseline.js`) created cross-branch product/course copies
// with synthetic docIds but didn't re-stamp the canonical entityId field.
// When listProducts/listCourses spread the data, `data.id` overrode `doc.id`,
// and handleDelete's `p.productId || p.id` fallback resolved to the wrong
// path → silent no-op.
//
// Phase 24.0-vicies-novies-novies fixes both layers:
//   • Code (backendClient.js): swap spread order to `{ ...d.data(), id: d.id }`
//   • Data (THIS SCRIPT):       backfill productId/courseId = docId; clear stray data.id
//
// Two-phase: dry-run by default, --apply commits.
// Idempotent: re-run with --apply yields 0 writes (skip docs already correct).
// Audit doc: be_admin_audit/phase-24-0-vicies-novies-novies-backfill-<ts>-<rand>
// Forensic-trail: stamps `_<entityId>BackfilledAt` + `_<entityId>BackfilledFrom`.
//
// Run via:
//   vercel env pull .env.local.prod --environment=production    (already pulled this session)
//   node scripts/phase-24-0-vicies-novies-novies-backfill-product-course-id.mjs           (dry-run)
//   node scripts/phase-24-0-vicies-novies-novies-backfill-product-course-id.mjs --apply   (commit)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Load .env.local.prod or .env.local into process.env ─────────────────
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

// ─── Constants ─────────────────────────────────────────────────────────────
const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const AUDIT_COLLECTION = `${BASE_PATH}/be_admin_audit`;

const TARGETS = Object.freeze([
  {
    collection: 'be_products',
    entityIdField: 'productId',
    nameField: 'productName',
    forensicAtField: '_productIdBackfilledAt',
    forensicFromField: '_productIdBackfilledFrom',
  },
  {
    collection: 'be_courses',
    entityIdField: 'courseId',
    nameField: 'courseName',
    forensicAtField: '_courseIdBackfilledAt',
    forensicFromField: '_courseIdBackfilledFrom',
  },
]);

// ─── CLI args ──────────────────────────────────────────────────────────────
const apply = process.argv.includes('--apply');
const dryRun = !apply;

// ─── Pure helpers (exported for tests) ─────────────────────────────────────

/** Crypto-secure hex string for audit-doc suffix (Rule M). */
export function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

/**
 * Decide what backfill action a doc needs.
 *
 * Returns one of:
 *   • { action: 'skip',   reason: 'already-canonical' }    — entityId === docId
 *   • { action: 'skip',   reason: 'mismatch-entity-id' }   — entityId !== docId (NOT auto-touched; reported)
 *   • { action: 'backfill' }                               — entityId missing → stamp = docId
 *
 * Pure function — no I/O. Tested in phase-24-0-vicies-novies-novies-backfill.test.js.
 */
export function decideBackfillAction({ docId, data, entityIdField }) {
  if (!docId || typeof docId !== 'string') {
    return { action: 'skip', reason: 'invalid-docid' };
  }
  if (!data || typeof data !== 'object') {
    return { action: 'skip', reason: 'invalid-data' };
  }
  const stored = data[entityIdField];
  if (typeof stored === 'string' && stored.length > 0) {
    if (stored === docId) {
      return { action: 'skip', reason: 'already-canonical' };
    }
    // Has entityId but it doesn't match docId — POTENTIAL legacy ProClinic ref;
    // do NOT auto-overwrite (could be intentional cross-system FK). Report only.
    return { action: 'skip', reason: 'mismatch-entity-id', stored };
  }
  // Missing or empty entityId → backfill = docId.
  return { action: 'backfill' };
}

/**
 * Build the patch payload for a backfill. Stamps entityId + forensic fields.
 * Does NOT touch the stray `data.id` field (preserved as-is for audit).
 */
export function buildBackfillPatch({ docId, entityIdField, forensicAtField, forensicFromField, priorIdField }) {
  return {
    [entityIdField]: docId,
    [forensicAtField]: FieldValue.serverTimestamp(),
    [forensicFromField]: priorIdField === undefined ? null : priorIdField,
  };
}

// ─── Firebase admin init ───────────────────────────────────────────────────

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

// ─── Main ──────────────────────────────────────────────────────────────────

async function processCollection(target) {
  const { collection, entityIdField, nameField, forensicAtField, forensicFromField } = target;
  console.log(`\n▸ ${collection} (entityIdField=${entityIdField})`);
  const snap = await db.collection(`${BASE_PATH}/${collection}`).get();
  console.log(`  Total docs: ${snap.size}`);

  const counts = {
    scanned: snap.size,
    backfill: 0,
    skipAlreadyCanonical: 0,
    skipMismatch: 0,
    skipInvalid: 0,
  };
  const backfillTargets = []; // {docId, name, priorIdField}
  const mismatchTargets = []; // {docId, name, stored}

  for (const doc of snap.docs) {
    const data = doc.data();
    const decision = decideBackfillAction({ docId: doc.id, data, entityIdField });
    if (decision.action === 'backfill') {
      counts.backfill++;
      backfillTargets.push({
        docId: doc.id,
        name: data[nameField] || '(unnamed)',
        priorIdField: data.id, // preserve the stray `id` data-field value for forensics
      });
    } else if (decision.reason === 'already-canonical') {
      counts.skipAlreadyCanonical++;
    } else if (decision.reason === 'mismatch-entity-id') {
      counts.skipMismatch++;
      mismatchTargets.push({ docId: doc.id, name: data[nameField] || '(unnamed)', stored: decision.stored });
    } else {
      counts.skipInvalid++;
    }
  }

  console.log(`  ▸ scanned:               ${counts.scanned}`);
  console.log(`  ▸ skip already-canonical: ${counts.skipAlreadyCanonical}`);
  console.log(`  ▸ skip mismatch (manual): ${counts.skipMismatch}${mismatchTargets.length ? ' ⚠' : ''}`);
  console.log(`  ▸ skip invalid:           ${counts.skipInvalid}`);
  console.log(`  ▸ to-backfill:            ${counts.backfill}`);

  if (mismatchTargets.length > 0) {
    console.log(`\n  ⚠ Mismatch list (${entityIdField} present but != docId — NOT auto-touched):`);
    for (const t of mismatchTargets.slice(0, 20)) {
      console.log(`     • docId="${t.docId}" name="${t.name}" stored=${JSON.stringify(t.stored)}`);
    }
    if (mismatchTargets.length > 20) console.log(`     ...and ${mismatchTargets.length - 20} more`);
  }

  if (backfillTargets.length > 0 && backfillTargets.length <= 20) {
    console.log(`\n  Backfill targets (full list, ≤20):`);
    for (const t of backfillTargets) {
      console.log(`     • docId="${t.docId}" name="${t.name}" priorDataId=${JSON.stringify(t.priorIdField)}`);
    }
  } else if (backfillTargets.length > 20) {
    console.log(`\n  Backfill targets sample (5 of ${backfillTargets.length}):`);
    for (const t of backfillTargets.slice(0, 5)) {
      console.log(`     • docId="${t.docId}" name="${t.name}" priorDataId=${JSON.stringify(t.priorIdField)}`);
    }
  }

  if (apply && backfillTargets.length > 0) {
    console.log(`\n  ➡ Applying backfill (${backfillTargets.length} writes)...`);
    // Firestore batch limit = 500 writes per batch
    let written = 0;
    for (let i = 0; i < backfillTargets.length; i += 400) {
      const slice = backfillTargets.slice(i, i + 400);
      const batch = db.batch();
      for (const t of slice) {
        const ref = db.collection(`${BASE_PATH}/${collection}`).doc(t.docId);
        const patch = buildBackfillPatch({
          docId: t.docId,
          entityIdField,
          forensicAtField,
          forensicFromField,
          priorIdField: t.priorIdField,
        });
        batch.update(ref, patch);
      }
      await batch.commit();
      written += slice.length;
      console.log(`     batch ${Math.floor(i / 400) + 1}: ${slice.length} updated (cumulative ${written}/${backfillTargets.length})`);
    }
    console.log(`  ✓ ${collection} backfill committed: ${written} docs.`);
  }

  return { ...counts, mismatchTargets, backfillTargets };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Phase 24.0-vicies-novies-novies — backfill productId/courseId');
  console.log(' V38: handleDelete silent no-op via spread-order override');
  console.log(`  Mode: ${apply ? '🔥 APPLY' : '🔍 DRY-RUN'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  const results = {};
  for (const target of TARGETS) {
    results[target.collection] = await processCollection(target);
  }

  // Audit doc — only on apply
  if (apply) {
    const auditId = `phase-24-0-vicies-novies-novies-backfill-${Date.now()}-${randHex()}`;
    const auditRef = db.collection(AUDIT_COLLECTION).doc(auditId);
    await auditRef.set({
      phase: 'phase-24-0-vicies-novies-novies',
      op: 'backfill-product-course-id',
      v38: true,
      results: Object.fromEntries(
        Object.entries(results).map(([col, r]) => [
          col,
          {
            scanned: r.scanned,
            backfilled: r.backfill,
            skippedAlreadyCanonical: r.skipAlreadyCanonical,
            skippedMismatch: r.skipMismatch,
            skippedInvalid: r.skipInvalid,
            mismatchSample: r.mismatchTargets.slice(0, 10).map(t => ({ docId: t.docId, name: t.name, stored: t.stored })),
          },
        ])
      ),
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(`\n📝 Audit doc: ${AUDIT_COLLECTION}/${auditId}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` Done — ${apply ? 'APPLIED' : 'DRY-RUN ONLY'} (re-run with --apply to commit)`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
