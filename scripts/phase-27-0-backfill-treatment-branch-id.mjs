// Phase 27.0 (2026-05-14) — backfill detail.branchId on existing be_treatments
// using customer.branchId as heuristic. Rule M canonical pattern.
//
// Two-phase: dry-run by default; --apply commits writes.
// Idempotent: re-run with --apply yields 0 writes (skip-already-set).
//
// Usage:
//   node scripts/phase-27-0-backfill-treatment-branch-id.mjs         (dry-run)
//   node scripts/phase-27-0-backfill-treatment-branch-id.mjs --apply (commit)
//
// Heuristic: customer.branchId = the patient's home branch (stamped at customer
// creation, immutable thereafter per V50 Phase 3 verification). Treatments created
// before branchId was added to detail will be tagged to this branch. Mis-tags can
// be corrected via EditAttributionModal (Task 6) after admin reviews.
//
// Forensic trail fields per Rule M:
//   detail._branchIdBackfilledAt: serverTimestamp()
//   detail._branchIdBackfilledFrom: 'customer.branchId'
//   detail._branchIdBackfilledLegacyValue: <prior value or null>

import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const APPLY = process.argv.includes('--apply');

// ─── Pure helpers (exported for unit tests) ──────────────────────────────────

/**
 * Decide what action to take for a single treatment doc.
 * @param {object} treatment - Firestore doc data (must have .detail)
 * @param {object|null} customer - customer doc data (must have .branchId)
 * @returns {'skip-already-set'|'skip-no-heuristic'|'backfill'}
 */
export function decideBackfillAction(treatment, customer) {
  const existingBranchId = treatment?.detail?.branchId;
  // Any non-empty branchId means already tagged — skip
  if (existingBranchId && String(existingBranchId).trim()) return 'skip-already-set';
  // No customer doc or customer has no branchId — cannot infer
  const customerBranchId = customer?.branchId;
  if (customerBranchId && String(customerBranchId).trim()) return 'backfill';
  return 'skip-no-heuristic';
}

/**
 * Build the Firestore update patch (dotted-path notation preserves siblings).
 * @param {object} opts
 * @param {string} opts.newBranchId
 * @param {string} [opts.newBranchName]
 * @param {*} [opts.prevBranchId]
 * @param {function} [opts.serverTimestamp] - FieldValue.serverTimestamp or test sentinel
 */
export function buildBackfillPatch({ newBranchId, newBranchName, prevBranchId, serverTimestamp }) {
  const ts = typeof serverTimestamp === 'function'
    ? serverTimestamp()
    : (serverTimestamp ?? 'SERVER_TIMESTAMP_SENTINEL');
  return {
    'detail.branchId': newBranchId,
    'detail.branchName': newBranchName || '',
    'detail._branchIdBackfilledAt': ts,
    'detail._branchIdBackfilledFrom': 'customer.branchId',
    'detail._branchIdBackfilledLegacyValue': prevBranchId === undefined ? null : prevBranchId,
  };
}

// ─── Main migration ───────────────────────────────────────────────────────────

async function main() {
  // PEM key conversion per Rule M (literal \n → actual newline)
  const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!key) {
    console.error('FIREBASE_ADMIN_PRIVATE_KEY missing — run: vercel env pull .env.local.prod --environment=production');
    process.exit(1);
  }

  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: key,
    }),
  });
  const db = getFirestore();

  console.log('═══════════════════════════════════════════════════════');
  console.log(`Phase 27.0 — backfill treatment.detail.branchId`);
  console.log(`Mode: ${APPLY ? '⚡ APPLY (writes enabled)' : '🔍 DRY-RUN (read-only)'}`);
  console.log('═══════════════════════════════════════════════════════');

  // 1. Load customer → branchId lookup map
  console.log('Loading customers...');
  const customerSnap = await db.collection(`${PREFIX}/be_customers`).get();
  const customerBranchMap = new Map();
  customerSnap.forEach((d) => {
    const data = d.data();
    customerBranchMap.set(d.id, { branchId: data.branchId || '' });
  });
  console.log(`  → ${customerBranchMap.size} customers loaded`);

  // 2. Load branch → name lookup map (for denormalized branchName)
  console.log('Loading branches...');
  const branchSnap = await db.collection(`${PREFIX}/be_branches`).get();
  const branchNameMap = new Map();
  branchSnap.forEach((d) => branchNameMap.set(d.id, d.data().name || ''));
  console.log(`  → ${branchNameMap.size} branches loaded`);

  // 3. Scan be_treatments
  console.log('Scanning be_treatments...');
  const treatmentSnap = await db.collection(`${PREFIX}/be_treatments`).get();
  console.log(`  → ${treatmentSnap.size} treatment docs to evaluate`);

  const stats = {
    scanned: 0,
    backfill: 0,
    skipAlreadySet: 0,
    skipNoHeuristic: 0,
  };
  const writes = [];

  treatmentSnap.forEach((doc) => {
    stats.scanned += 1;
    const data = doc.data();
    const customerId = data.customerId;
    const customer = customerBranchMap.get(customerId) || null;
    const action = decideBackfillAction(data, customer);

    if (action === 'skip-already-set') {
      stats.skipAlreadySet += 1;
    } else if (action === 'skip-no-heuristic') {
      stats.skipNoHeuristic += 1;
      if (stats.skipNoHeuristic <= 5) {
        console.log(`  [skip-no-heuristic] treatmentId=${doc.id} customerId=${customerId}`);
      }
    } else if (action === 'backfill') {
      stats.backfill += 1;
      const newBranchId = customer.branchId;
      const newBranchName = branchNameMap.get(newBranchId) || '';
      const patch = buildBackfillPatch({
        newBranchId,
        newBranchName,
        prevBranchId: data?.detail?.branchId,
      });
      writes.push({ ref: doc.ref, patch, docId: doc.id });
      if (writes.length <= 5) {
        console.log(`  [backfill] treatmentId=${doc.id} → branchId=${newBranchId} (${newBranchName})`);
      }
    }
  });

  console.log('');
  console.log('─── Stats ──────────────────────────────────────────────');
  console.log(`  Scanned:           ${stats.scanned}`);
  console.log(`  Will backfill:     ${stats.backfill}`);
  console.log(`  Skip (already):    ${stats.skipAlreadySet}`);
  console.log(`  Skip (no cust):    ${stats.skipNoHeuristic}`);
  console.log('────────────────────────────────────────────────────────');

  if (!APPLY) {
    console.log('');
    console.log(`DRY-RUN complete. Pass --apply to commit ${stats.backfill} write(s).`);
    return;
  }

  if (writes.length === 0) {
    console.log('Nothing to write — idempotent run complete (0 writes).');
    return;
  }

  // Commit in batches of 200 (Firestore limit is 500, use 200 for safety)
  const BATCH_SIZE = 200;
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const { ref, patch } of writes.slice(i, i + BATCH_SIZE)) {
      batch.update(ref, patch);
    }
    await batch.commit();
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const committed = Math.min(i + BATCH_SIZE, writes.length);
    console.log(`  Committed batch ${batchNum} (${committed}/${writes.length})`);
  }

  // Emit audit doc per Rule M
  const auditId = `phase-27-0-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    phase: 'Phase 27.0 backfill treatment detail.branchId',
    appliedAt: Timestamp.now(),
    scanned: stats.scanned,
    backfilled: stats.backfill,
    skipped: stats.skipAlreadySet + stats.skipNoHeuristic,
    skipBreakdown: {
      alreadySet: stats.skipAlreadySet,
      noHeuristic: stats.skipNoHeuristic,
    },
    heuristic: 'customer.branchId',
  });
  console.log('');
  console.log(`✅ Done. Audit doc: ${PREFIX}/be_admin_audit/${auditId}`);
}

// Invocation guard (per Rule M — prevents auto-run on unit-test import)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
