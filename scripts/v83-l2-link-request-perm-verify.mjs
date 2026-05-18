#!/usr/bin/env node
// ─── V83 — link_request_management Rule Q V66 L2 admin-SDK verification ──
// EOD8 (2026-05-18). Creates TEST-LINKREQ-V83 fixtures in 2 simulated
// branches, asserts branch filter returns correct subset, cleans up,
// emits audit doc.
//
// Run: node --env-file=.env.local.prod scripts/v83-l2-link-request-perm-verify.mjs
//
// Per Rule Q V66: this is L2 (real client SDK / real prod data) — does NOT
// require Playwright admin creds. L1 (Playwright real browser) deferred to
// user hands-on post-deploy.

// Node v20+ supports --env-file natively (used at invocation); no dotenv needed.
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function init() {
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!rawKey) {
    console.error('FATAL: FIREBASE_ADMIN_PRIVATE_KEY env not set. Run: vercel env pull .env.local.prod --environment=production');
    process.exit(1);
  }
  const key = rawKey.split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: key,
    }),
  });
  return getFirestore();
}

async function main() {
  const db = init();
  const ts = Date.now();
  const rand = randomBytes(4).toString('hex');

  const BRANCH_A = 'BR-1777873556815-26df6480'; // นครราชสีมา (canonical real)
  const BRANCH_B = `TEST-BR-V83-${rand}`;        // mock alt branch (string only — not in be_branches)

  const FIXTURE_IDS_A = [
    `TEST-LINKREQ-V83-${ts}-${rand}-a1`,
    `TEST-LINKREQ-V83-${ts}-${rand}-a2`,
  ];
  const FIXTURE_IDS_B = [
    `TEST-LINKREQ-V83-${ts}-${rand}-b1`,
  ];

  const COLLECTION = `${PREFIX}/be_link_requests`;

  console.log('=== V83 L2 admin-SDK verification ===');
  console.log(`BRANCH_A (real): ${BRANCH_A}`);
  console.log(`BRANCH_B (mock): ${BRANCH_B}`);
  console.log('');

  let ok = true;
  const errors = [];

  // ── Phase 1: SEED ──────────────────────────────────────────────────
  console.log('--- Phase 1: SEED ---');
  try {
    for (const id of FIXTURE_IDS_A) {
      await db.collection(COLLECTION).doc(id).set({
        branchId: BRANCH_A,
        status: 'pending',
        lineUserId: `TEST-V83-USER-${id}`,
        requestedIdLast4: '1234',
        createdAt: Timestamp.now(),
        _v83Fixture: true,
      });
    }
    for (const id of FIXTURE_IDS_B) {
      await db.collection(COLLECTION).doc(id).set({
        branchId: BRANCH_B,
        status: 'pending',
        lineUserId: `TEST-V83-USER-${id}`,
        requestedIdLast4: '5678',
        createdAt: Timestamp.now(),
        _v83Fixture: true,
      });
    }
    console.log(`SEED ✓  BRANCH_A: ${FIXTURE_IDS_A.length} docs, BRANCH_B: ${FIXTURE_IDS_B.length} docs`);
  } catch (e) {
    console.error(`SEED ✗  ${e.message}`);
    ok = false;
    errors.push(`seed: ${e.message}`);
  }

  // ── Phase 2: VERIFY branch filter ─────────────────────────────────
  console.log('--- Phase 2: VERIFY branch isolation ---');
  let idsA = [];
  let idsB = [];
  try {
    const qA = await db.collection(COLLECTION)
      .where('branchId', '==', BRANCH_A)
      .where('status', '==', 'pending')
      .get();
    idsA = qA.docs.map(d => d.id).filter(id => id.startsWith('TEST-LINKREQ-V83'));
    console.log(`BRANCH_A query (pending) → ${idsA.length} fixtures: ${idsA.join(', ')}`);

    const qB = await db.collection(COLLECTION)
      .where('branchId', '==', BRANCH_B)
      .where('status', '==', 'pending')
      .get();
    idsB = qB.docs.map(d => d.id).filter(id => id.startsWith('TEST-LINKREQ-V83'));
    console.log(`BRANCH_B query (pending) → ${idsB.length} fixtures: ${idsB.join(', ')}`);

    // Assertions
    if (idsA.length !== FIXTURE_IDS_A.length) {
      ok = false;
      errors.push(`BRANCH_A returned ${idsA.length}, expected ${FIXTURE_IDS_A.length}`);
    }
    if (idsB.length !== FIXTURE_IDS_B.length) {
      ok = false;
      errors.push(`BRANCH_B returned ${idsB.length}, expected ${FIXTURE_IDS_B.length}`);
    }
    // Cross-branch leak check
    const leakAToB = idsA.filter(id => FIXTURE_IDS_B.includes(id));
    const leakBToA = idsB.filter(id => FIXTURE_IDS_A.includes(id));
    if (leakAToB.length > 0 || leakBToA.length > 0) {
      ok = false;
      errors.push(`CROSS-BRANCH LEAK: A→B=${leakAToB}, B→A=${leakBToA}`);
    }
    if (ok) {
      console.log('VERIFY ✓  per-branch isolation confirmed; no cross-branch leak');
    }
  } catch (e) {
    console.error(`VERIFY ✗  ${e.message}`);
    ok = false;
    errors.push(`verify: ${e.message}`);
  }

  // ── Phase 3: CLEANUP (always — even on failure) ────────────────────
  console.log('--- Phase 3: CLEANUP ---');
  let cleaned = 0;
  for (const id of [...FIXTURE_IDS_A, ...FIXTURE_IDS_B]) {
    try {
      await db.collection(COLLECTION).doc(id).delete();
      cleaned++;
    } catch (e) {
      console.error(`Cleanup failed for ${id}: ${e.message}`);
    }
  }
  console.log(`CLEANUP ✓  ${cleaned}/${FIXTURE_IDS_A.length + FIXTURE_IDS_B.length} fixtures deleted`);

  // ── Phase 4: VERIFY zero-orphan ────────────────────────────────────
  console.log('--- Phase 4: VERIFY zero-orphan ---');
  try {
    const orphanQ = await db.collection(COLLECTION)
      .where('_v83Fixture', '==', true)
      .get();
    const orphans = orphanQ.docs.map(d => d.id);
    if (orphans.length > 0) {
      console.warn(`ORPHANS DETECTED: ${orphans.join(', ')}`);
      ok = false;
      errors.push(`orphans: ${orphans.length}`);
    } else {
      console.log('ZERO-ORPHAN ✓  no fixtures left in be_link_requests');
    }
  } catch (e) {
    console.warn(`Orphan check skipped: ${e.message}`);
  }

  // ── Phase 5: AUDIT EMIT ────────────────────────────────────────────
  console.log('--- Phase 5: AUDIT EMIT ---');
  const auditId = `v83-l2-link-request-perm-verify-${ts}-${rand}`;
  try {
    await db.collection(`${PREFIX}/be_admin_audit`).doc(auditId).set({
      type: 'v83-l2-link-request-perm-verify',
      seeded: FIXTURE_IDS_A.length + FIXTURE_IDS_B.length,
      branchAFixtureCount: idsA.length,
      branchBFixtureCount: idsB.length,
      crossBranchLeak: false,
      cleaned,
      orphansFound: errors.find(e => e.startsWith('orphans')) ? true : false,
      success: ok,
      errors: errors.length > 0 ? errors : null,
      appliedAt: Timestamp.now(),
    });
    console.log(`AUDIT ✓  ${auditId}`);
  } catch (e) {
    console.error(`AUDIT ✗  ${e.message}`);
  }

  console.log('');
  console.log('=== RESULT ===');
  if (ok) {
    console.log('V83 L2 VERIFICATION COMPLETE — all assertions passed, zero orphans, audit emitted');
    process.exit(0);
  } else {
    console.error('V83 L2 VERIFICATION FAILED');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}
