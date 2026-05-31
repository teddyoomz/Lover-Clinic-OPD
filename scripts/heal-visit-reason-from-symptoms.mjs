#!/usr/bin/env node
// V141 Rule M heal (two-phase) — restore be_customers.patientData.visitReasons
// from the folded `symptoms` string for customers created BEFORE the V141 fix.
//
// Pre-V141 the kiosk→customer conversion folded visitReasons (array) into
// `symptoms` (a ", "-joined string) and dropped the array → intake view showed
// blank "สาเหตุที่มาพบแพทย์". This restores the array by splitting `symptoms` and
// keeping ONLY parts that are canonical visit-reason values (so admin-created
// customers whose `symptoms` is free clinical text are NOT corrupted).
//
// visitReasonOther / hrt* were never stored separately pre-V141 → not recoverable
// here (forward fix preserves them going forward). The main reported display
// (the visit-reason bullets) is restored.
//
// Dry-run by default. `--apply` to commit. Idempotent (skips rows that already
// have visitReasons). Forensic stamps + audit doc.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { VISIT_REASON_VALUES } from '../src/lib/visitReasonOptions.js';

const APPLY = process.argv.includes('--apply');
const VALID = new Set(VISIT_REASON_VALUES);
const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a;
}, {});
if (getApps().length === 0) initializeApp({ credential: cert({
  projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
}), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';

// Decide whether a customer's symptoms is recoverable to visitReasons.
// Returns the array iff EVERY split part is a canonical visit-reason value.
export function recoverVisitReasons(pd) {
  const hasVR = Array.isArray(pd?.visitReasons) && pd.visitReasons.length > 0;
  if (hasVR) return null;                                   // already has it → skip
  const sym = typeof pd?.symptoms === 'string' ? pd.symptoms.trim() : '';
  if (!sym) return null;                                    // nothing to recover
  const parts = sym.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (!parts.every((p) => VALID.has(p))) return null;       // free-text symptoms → do NOT corrupt
  return parts;
}

async function main() {
  console.log(`=== V141 heal visitReasons from symptoms (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);
  const snap = await db.collection(`${BASE}/be_customers`).get();
  const targets = [];
  for (const doc of snap.docs) {
    const pd = doc.data().patientData || {};
    const reasons = recoverVisitReasons(pd);
    if (reasons) targets.push({ id: doc.id, reasons, symptoms: pd.symptoms });
  }
  console.log(`Scanned ${snap.size} be_customers. Recoverable (symptoms = valid visit-reason values, visitReasons empty): ${targets.length}\n`);
  for (const t of targets.slice(0, 25)) console.log(`  ${t.id.padEnd(14)} → visitReasons = [${t.reasons.join(', ')}]`);
  if (targets.length > 25) console.log(`  … +${targets.length - 25} more`);

  if (!APPLY) { console.log(`\n[DRY-RUN] Would set patientData.visitReasons on ${targets.length} customer(s). Re-run with --apply.`); return; }

  let healed = 0;
  for (const t of targets) {
    await db.doc(`${BASE}/be_customers/${t.id}`).update({
      'patientData.visitReasons': t.reasons,
      'patientData._v141VisitReasonsBackfilledAt': FieldValue.serverTimestamp(),
      'patientData._v141VisitReasonsBackfilledFrom': 'symptoms',
    });
    healed++;
  }
  const auditId = `v141-heal-visit-reasons-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.doc(`${BASE}/be_admin_audit/${auditId}`).set({
    phase: 'V141', op: 'heal-visit-reasons-from-symptoms', scanned: snap.size, healed,
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`\n[APPLY] Healed ${healed} customer(s). Audit: ${auditId}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
