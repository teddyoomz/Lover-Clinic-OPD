#!/usr/bin/env node
// Rule M cleanup — delete 2 legacy junk be_df_staff_rates docs (2026-07-04).
//
// Targets (user-authorized "ลบทิ้ง", AV200 session): docIds 3841 (หมอมายด์)
// + 3842 (วรรณาวงษ์) — ProClinic-era imports with 174 all-zero rates keyed by
// numeric legacy courseIds and NO branchId (so branch-scoped listDfStaffRates
// never loads them — inert junk). SAFETY: each doc must match the full junk
// signature (no branchId + every rate value 0) or it is SKIPPED, not deleted.
//
// Two-phase: dry-run by default; commits only with --apply. Idempotent:
// re-run --apply = 0 deletes. Audit doc to be_admin_audit with the full
// before-state snapshot (forensic trail for a delete).
//
// Run: node --env-file=.env.local.prod scripts/cleanup-junk-df-staff-rates.mjs [--apply]

import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const TARGET_DOC_IDS = ['3841', '3842'];
const APPLY = process.argv.includes('--apply');

function isJunkSignature(data) {
  const rates = Array.isArray(data.rates) ? data.rates : [];
  const noBranch = !(typeof data.branchId === 'string' && data.branchId.trim());
  const allZero = rates.every((r) => (Number(r?.value) || 0) === 0);
  return noBranch && allZero;
}

async function main() {
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
  const db = getFirestore();
  const base = `artifacts/${APP_ID}/public/data`;

  console.log(`\n=== cleanup-junk-df-staff-rates — ${APPLY ? 'APPLY' : 'DRY-RUN'} ===\n`);
  const toDelete = [];
  const skipped = [];
  for (const id of TARGET_DOC_IDS) {
    const ref = db.doc(`${base}/be_df_staff_rates/${id}`);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  • ${id}: already gone (idempotent skip)`); continue; }
    const data = snap.data();
    const rates = Array.isArray(data.rates) ? data.rates : [];
    if (!isJunkSignature(data)) {
      skipped.push(id);
      console.log(`  • ${id}: SIGNATURE MISMATCH (branchId or non-zero rate present) — REFUSING to delete`);
      continue;
    }
    console.log(`  • ${id}: "${data.staffName || ''}" rates=${rates.length} (all zero, no branchId) → DELETE`);
    toDelete.push({ ref, id, data });
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN: would delete ${toDelete.length}, skip ${skipped.length}. Re-run with --apply.\n`);
    return;
  }

  for (const t of toDelete) await t.ref.delete();

  if (toDelete.length > 0) {
    const auditId = `cleanup-junk-df-staff-rates-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.doc(`${base}/be_admin_audit/${auditId}`).set({
      op: 'cleanup-junk-df-staff-rates',
      reason: 'ProClinic-era all-zero legacy staff-rate docs, no branchId (inert under branch-scoped loads). User-authorized 2026-07-04 (AV200 session).',
      scanned: TARGET_DOC_IDS.length,
      deleted: toDelete.map((t) => t.id),
      skippedMismatch: skipped,
      beforeState: Object.fromEntries(toDelete.map((t) => [t.id, {
        staffId: t.data.staffId ?? null,
        staffName: t.data.staffName ?? null,
        ratesCount: Array.isArray(t.data.rates) ? t.data.rates.length : 0,
        sampleRates: (t.data.rates || []).slice(0, 3),
      }])),
      appliedAt: FieldValue.serverTimestamp(),
    });
    console.log(`\nAPPLIED: deleted ${toDelete.length} doc(s). Audit: be_admin_audit/${auditId}\n`);
  } else {
    console.log('\nAPPLIED: nothing to delete (idempotent).\n');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
