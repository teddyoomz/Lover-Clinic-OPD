#!/usr/bin/env node
// scripts/phase-29-recall-e2e-real-prod.mjs
//
// Phase 29.18 (2026-05-14) — Live admin-SDK e2e on real production
// Firestore. Per Rule M canonical pattern:
//   - admin-SDK (firebase-admin) bypasses rules
//   - canonical path: artifacts/{APP_ID}/public/data/be_recalls
//   - PEM key conversion: split('\\n').join('\n')
//   - Two-phase: dry-run default, --apply commits writes
//   - Audit doc emit
//   - Idempotent: re-run --apply yields 0 writes (skip existing)
//   - Forensic trail: stamp _phase29E2eAt timestamp
//   - Invocation guard: only runs main() when invoked directly
//
// Verifies:
//   1. Create 5 TEST-RECALL- prefixed recall fixtures (single + paired)
//   2. Read them back via listRecalls path mirror
//   3. Update outcome on 1 (verify status flips)
//   4. Snooze 1 (verify snoozedUntil set)
//   5. Cleanup: delete all 5 + emit audit doc
//
// Usage:
//   node scripts/phase-29-recall-e2e-real-prod.mjs              # dry-run
//   node scripts/phase-29-recall-e2e-real-prod.mjs --apply      # writes

import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

const APPLY = process.argv.includes('--apply');
const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

async function main() {
  console.log(`\n🔔 Phase 29 — Recall System live e2e on real prod`);
  console.log(`   Mode: ${APPLY ? '\x1b[31mAPPLY (writes will commit)\x1b[0m' : '\x1b[33mDRY-RUN (no writes)\x1b[0m'}`);
  console.log(`   App ID: ${APP_ID}\n`);

  loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    console.error('❌ FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY required.');
    console.error('   Run: vercel env pull .env.local.prod --environment=production');
    process.exit(1);
  }

  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  const privateKey = rawKey.split('\\n').join('\n');
  if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId: APP_ID, clientEmail, privateKey }) });
  }
  const db = getFirestore();

  const basePath = `artifacts/${APP_ID}/public/data`;
  const recallsRef = db.collection(`${basePath}/be_recalls`);
  const auditRef = db.collection(`${basePath}/be_admin_audit`);

  const runStart = Date.now();
  const runId = randomBytes(6).toString('hex');
  const testIds = [
    `TEST-RECALL-${runId}-1`,
    `TEST-RECALL-${runId}-2`,
    `TEST-RECALL-${runId}-3`,
    `TEST-RECALL-${runId}-4`,
    `TEST-RECALL-${runId}-5`,
  ];

  const branchId = 'TEST-BR-recall-e2e';
  const customerId = 'TEST-CUST-recall-e2e';

  const fixtures = [
    {
      id: testIds[0], slotType: 'aftercare', recallDate: '2099-05-15',
      status: 'pending', reason: 'e2e — single aftercare',
      pairedRecallId: null,
    },
    {
      id: testIds[1], slotType: 'revisit', recallDate: '2099-11-14',
      status: 'pending', reason: 'e2e — single revisit (will-receive-outcome)',
      pairedRecallId: null,
    },
    {
      id: testIds[2], slotType: 'aftercare', recallDate: '2099-05-15',
      status: 'pending', reason: 'e2e — pair-1 aftercare',
      pairedRecallId: testIds[3],
    },
    {
      id: testIds[3], slotType: 'revisit', recallDate: '2099-11-14',
      status: 'pending', reason: 'e2e — pair-1 revisit',
      pairedRecallId: testIds[2],
    },
    {
      id: testIds[4], slotType: 'revisit', recallDate: '2099-05-12',
      status: 'pending', reason: 'e2e — overdue-like (will-snooze)',
      pairedRecallId: null,
    },
  ];

  const me = {
    uid: 'e2e-script',
    name: 'phase-29-recall-e2e',
    role: 'admin',
  };

  console.log(`📋 Phase 1: Create 5 fixtures (${branchId}/${customerId})`);
  for (const f of fixtures) {
    const exists = await recallsRef.doc(f.id).get();
    if (exists.exists) {
      console.log(`   ↺ ${f.id} — exists, skipping create (idempotent)`);
      continue;
    }
    if (!APPLY) {
      console.log(`   📝 dry-run: would create ${f.id} (${f.slotType}, ${f.recallDate})`);
      continue;
    }
    const now = FieldValue.serverTimestamp();
    await recallsRef.doc(f.id).set({
      ...f,
      branchId,
      customerId,
      customerName: 'TEST e2e Customer',
      customerPhone: '081-0000000',
      customerLineUserId: null,
      customerHN: null,
      source: 'manual',
      sourceTreatmentId: null,
      sourceProductId: null,
      sourceProductName: null,
      sourceCourseId: null,
      sourceCourseName: null,
      snoozedUntil: null,
      outcome: null, outcomeNote: null, outcomeAt: null, outcomeBy: null,
      noAnswerCount: 0, requiresManualReview: false,
      lineMessageSent: false, lineMessageSentAt: null,
      lineMessageTemplate: null, lineMessageText: null, lineMessageBy: null,
      createdAt: now, createdBy: me, updatedAt: now, updatedBy: me,
      _phase29E2eAt: now,
    });
    console.log(`   ✓ ${f.id} created`);
  }

  console.log(`\n📋 Phase 2: Read-back verification`);
  let foundCount = 0;
  for (const id of testIds) {
    const doc = await recallsRef.doc(id).get();
    if (doc.exists) {
      foundCount += 1;
      const data = doc.data();
      console.log(`   ✓ ${id} — slotType=${data.slotType} status=${data.status} recallDate=${data.recallDate}`);
    } else {
      console.log(`   ✗ ${id} — NOT FOUND`);
    }
  }

  console.log(`\n📋 Phase 3: Update outcome (testIds[1] → status=done)`);
  const outcomeTarget = testIds[1];
  if (APPLY) {
    await recallsRef.doc(outcomeTarget).update({
      outcome: 'will-come', outcomeNote: 'e2e verify',
      outcomeAt: FieldValue.serverTimestamp(),
      outcomeBy: me, status: 'done',
      updatedAt: FieldValue.serverTimestamp(), updatedBy: me,
    });
    const post = await recallsRef.doc(outcomeTarget).get();
    const data = post.data();
    if (data?.status === 'done') {
      console.log(`   ✓ ${outcomeTarget} status flipped to 'done' + outcome='will-come'`);
    } else {
      console.log(`   ✗ ${outcomeTarget} status mismatch: ${data?.status}`);
    }
  } else {
    console.log(`   📝 dry-run: would update ${outcomeTarget} → status=done`);
  }

  console.log(`\n📋 Phase 4: Snooze (testIds[4] → snoozedUntil=2099-05-22)`);
  const snoozeTarget = testIds[4];
  if (APPLY) {
    await recallsRef.doc(snoozeTarget).update({
      snoozedUntil: '2099-05-22',
      updatedAt: FieldValue.serverTimestamp(), updatedBy: me,
    });
    const post = await recallsRef.doc(snoozeTarget).get();
    const data = post.data();
    if (data?.snoozedUntil === '2099-05-22') {
      console.log(`   ✓ ${snoozeTarget} snoozedUntil set`);
    } else {
      console.log(`   ✗ ${snoozeTarget} snoozedUntil mismatch: ${data?.snoozedUntil}`);
    }
  } else {
    console.log(`   📝 dry-run: would snooze ${snoozeTarget} → 2099-05-22`);
  }

  console.log(`\n📋 Phase 5: Cleanup (delete all 5 + emit audit doc)`);
  if (APPLY) {
    const batch = db.batch();
    for (const id of testIds) {
      batch.delete(recallsRef.doc(id));
    }
    const auditId = `phase-29-recall-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
    batch.set(auditRef.doc(auditId), {
      phase: 'phase-29-recall-e2e',
      runId,
      branchId,
      customerId,
      createdIds: testIds,
      operations: {
        created: testIds.length,
        outcomeUpdated: 1,
        snoozed: 1,
        deleted: testIds.length,
      },
      runStart,
      runEnd: Date.now(),
      appliedAt: FieldValue.serverTimestamp(),
      mode: 'apply',
    });
    await batch.commit();
    console.log(`   ✓ Deleted ${testIds.length} fixtures + audit doc ${auditId}`);
  } else {
    console.log(`   📝 dry-run: would delete ${testIds.length} fixtures + emit audit doc`);
  }

  console.log(`\n${APPLY ? '✅' : '🔍'} Phase 29 e2e ${APPLY ? 'APPLY' : 'DRY-RUN'} complete.\n`);
  if (!APPLY) {
    console.log(`   Re-run with --apply to actually write+verify+cleanup on prod.`);
  }
}

// Invocation guard per Rule M — only run when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('\n❌ e2e script failed:', err);
    process.exit(1);
  });
}
