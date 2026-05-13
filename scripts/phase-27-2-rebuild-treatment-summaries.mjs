// Phase 27.2-quater (2026-05-14) — rebuild be_customers.treatmentSummary for
// all customers so it includes the new per-stage lifecycle timestamps
// (vitalsignsRecordedAt / doctorRecordedAt / completedAt / editedAt /
// recordedAt / createdAt). After Phase 27.2 shipped the new fields, the
// summary is only rebuilt on subsequent TFP saves. Existing customers'
// summaries remain stale (no time stamps surface in CDV badges until rebuild).
//
// Rule M canonical pattern: dry-run by default, --apply commits writes,
// audit doc emitted to be_admin_audit, idempotent.
//
// Usage:
//   node --env-file=.env.local.prod scripts/phase-27-2-rebuild-treatment-summaries.mjs
//   node --env-file=.env.local.prod scripts/phase-27-2-rebuild-treatment-summaries.mjs --apply

import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const APPLY = process.argv.includes('--apply');

// Mirror of rebuildTreatmentSummary logic in src/lib/backendClient.js
// (kept inline so the script doesn't import client-side Firestore code).
function buildSummary(treatments) {
  return treatments.map((t) => ({
    id: t.treatmentId || t.id,
    date: t.detail?.treatmentDate || '',
    doctor: t.detail?.doctorName || '',
    assistants: (t.detail?.assistants || t.detail?.assistantIds || [])
      .map((a) => (typeof a === 'string' ? a : a?.name || '')),
    branch: t.detail?.branch || '',
    cc: t.detail?.symptoms || '',
    dx: t.detail?.diagnosis || '',
    createdBy: t.createdBy || 'cloned',
    status: t.status || null,
    editedBy: t.editedBy || null,
    editedByName: t.editedByName || '',
    editedByRole: t.editedByRole || '',
    // Phase 27.2 lifecycle timestamps
    vitalsignsRecordedAt: t.vitalsignsRecordedAt || null,
    vitalsignsRecordedBy: t.vitalsignsRecordedBy || null,
    doctorRecordedAt: t.doctorRecordedAt || null,
    doctorRecordedBy: t.doctorRecordedBy || null,
    completedAt: t.completedAt || null,
    completedBy: t.completedBy || null,
    recordedAt: t.recordedAt || null,
    editedAt: t.editedAt || null,
    createdAt: t.createdAt || null,
  }));
}

// Idempotency check: does the existing summary already include the new fields?
function isAlreadyRebuilt(existingSummary) {
  if (!Array.isArray(existingSummary) || existingSummary.length === 0) return true;
  const sample = existingSummary[0];
  // If ANY of the new fields exists as a key on the first entry, treat as already rebuilt
  return (
    'vitalsignsRecordedAt' in sample
    || 'doctorRecordedAt' in sample
    || 'completedAt' in sample
    || 'recordedAt' in sample
  );
}

async function main() {
  const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!key) {
    console.error('FIREBASE_ADMIN_PRIVATE_KEY missing. Run: node --env-file=.env.local.prod scripts/phase-27-2-rebuild-treatment-summaries.mjs');
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
  console.log('Phase 27.2-quater — rebuild treatment summaries');
  console.log(`Mode: ${APPLY ? '⚡ APPLY (writes enabled)' : '🔍 DRY-RUN (no writes)'}`);
  console.log('═══════════════════════════════════════════════════════');

  // Load all treatments first, grouped by customerId
  const treatmentSnap = await db.collection(`${PREFIX}/be_treatments`).get();
  const treatmentsByCustomer = new Map();
  treatmentSnap.forEach((d) => {
    const data = d.data();
    const cid = data.customerId;
    if (!cid) return;
    if (!treatmentsByCustomer.has(cid)) treatmentsByCustomer.set(cid, []);
    treatmentsByCustomer.get(cid).push(data);
  });
  console.log(`Loaded ${treatmentSnap.size} treatments across ${treatmentsByCustomer.size} customers`);

  // Iterate customers
  const customerSnap = await db.collection(`${PREFIX}/be_customers`).get();
  console.log(`Scanning ${customerSnap.size} customers...`);

  const stats = { scanned: 0, rebuild: 0, skipAlready: 0, skipNoTreatments: 0 };
  const writes = [];

  customerSnap.forEach((doc) => {
    stats.scanned += 1;
    const customerId = doc.id;
    const data = doc.data();
    const treatments = treatmentsByCustomer.get(customerId) || [];
    if (treatments.length === 0) {
      stats.skipNoTreatments += 1;
      return;
    }
    const existingSummary = data.treatmentSummary || [];
    if (isAlreadyRebuilt(existingSummary) && existingSummary.length === treatments.length) {
      stats.skipAlready += 1;
      return;
    }
    // Sort treatments by date descending (mirror getCustomerTreatments)
    treatments.sort((a, b) => {
      const dA = a.detail?.treatmentDate || '';
      const dB = b.detail?.treatmentDate || '';
      return dB.localeCompare(dA);
    });
    const newSummary = buildSummary(treatments);
    stats.rebuild += 1;
    writes.push({ ref: doc.ref, customerId, summary: newSummary });
  });

  console.log('');
  console.log('─── Stats ──────────────────────────────────────────────');
  console.log(`  Scanned:           ${stats.scanned}`);
  console.log(`  Will rebuild:      ${stats.rebuild}`);
  console.log(`  Skip (already):    ${stats.skipAlready}`);
  console.log(`  Skip (no treatments): ${stats.skipNoTreatments}`);
  console.log('────────────────────────────────────────────────────────');

  if (!APPLY) {
    console.log('');
    console.log(`DRY-RUN done. Pass --apply to commit ${writes.length} writes.`);
    return;
  }

  // Commit in batches of 200
  const BATCH = 200;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) {
      batch.update(w.ref, {
        treatmentSummary: w.summary,
        treatmentCount: w.summary.length,
      });
    }
    await batch.commit();
    console.log(`Committed batch ${Math.floor(i / BATCH) + 1} (${Math.min(i + BATCH, writes.length)}/${writes.length})`);
  }

  // Audit doc
  const auditId = `phase-27-2-rebuild-summaries-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${PREFIX}/be_admin_audit/${auditId}`).set({
    phase: 'Phase 27.2-quater rebuild treatment summaries',
    appliedAt: Timestamp.now(),
    scanned: stats.scanned,
    rebuilt: stats.rebuild,
    skipped: stats.skipAlready + stats.skipNoTreatments,
    skipBreakdown: {
      alreadyHasNewFields: stats.skipAlready,
      noTreatments: stats.skipNoTreatments,
    },
  });
  console.log('');
  console.log(`✅ Done. Audit doc: ${PREFIX}/be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
