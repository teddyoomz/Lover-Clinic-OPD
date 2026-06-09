#!/usr/bin/env node
// ═══ Rule M two-phase data heal (dry-run default; --apply to commit) ═══
// FIX CONTEXT (2026-06-09): BackendDashboard onDeleteTreatment used a bare
// `cid = viewingCustomer.proClinicId` (undefined for all self-created LC-*
// customers post-V50) → on treatment delete the be_treatments doc was removed
// but rebuildTreatmentSummary(cid) ran against `undefined` → the customer's
// denormalized treatmentSummary kept PHANTOM entries for deleted treatments and
// treatmentCount stayed stale (badge showed 2 while the live list showed 1).
//
// This script HEALS the immediate stale state: for every customer whose
// denormalized treatmentSummary contains entries (ids) that no longer exist in
// be_treatments, PRUNE those phantoms and set treatmentCount = surviving length.
// The FIXED code self-heals on every future create/edit/delete; this fixes the
// data that drifted while the bug was live.
//
// SAFE BY DESIGN: only PRUNES phantom entries (deleted treatments) + recomputes
// count. It never reconstructs the summary shape (no field drift) and never
// touches be_treatments. Idempotent: a 2nd --apply run yields 0 writes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  const db = initAdmin();
  const data = base(db);
  console.log(`═══ Heal stale treatment counts — ${APPLY ? 'APPLY (writes)' : 'DRY-RUN (no writes)'} ═══\n`);

  const customers = await data.collection('be_customers').get();
  let scanned = 0, affected = 0, healedDocs = 0, missingFlagged = 0;
  const report = [];

  for (const cdoc of customers.docs) {
    scanned++;
    const x = cdoc.data() || {};
    const summary = Array.isArray(x.treatmentSummary) ? x.treatmentSummary : null;
    if (!summary) continue; // no denormalized summary → nothing to heal
    const cid = cdoc.id;

    // Real be_treatments docs for this customer.
    const tr = await data.collection('be_treatments').where('customerId', '==', cid).get();
    const actualIds = new Set(tr.docs.map(d => d.id));

    const phantoms = summary.filter(e => e && e.id && !actualIds.has(e.id));
    const summaryIds = new Set(summary.map(e => e && e.id).filter(Boolean));
    const missing = [...actualIds].filter(id => !summaryIds.has(id)); // be_treatments not in summary (should be ~0)

    const oldCount = x.treatmentCount;
    const newSummary = summary.filter(e => e && e.id && actualIds.has(e.id));
    const newCount = newSummary.length;

    const drift = phantoms.length > 0 || oldCount !== newCount || missing.length > 0;
    if (!drift) continue;
    affected++;
    if (missing.length > 0) missingFlagged++;
    report.push(`  ${cid}: count ${oldCount} → ${newCount}  phantoms=${phantoms.length} [${phantoms.map(p => p.id).join(', ')}]${missing.length ? `  ⚠ MISSING-from-summary=${missing.length} [${missing.join(', ')}]` : ''}`);

    if (APPLY) {
      // Prune phantoms + fix count. Forensic trail. (Missing-from-summary is
      // left for the now-fixed rebuild to add on the next op — not reconstructed
      // here to avoid summary-shape drift.)
      await cdoc.ref.update({
        treatmentSummary: newSummary,
        treatmentCount: newCount,
        _treatmentCountHealedAt: FieldValue.serverTimestamp(),
        _treatmentCountHealedFrom: oldCount,
        _treatmentCountHealedPhantomIds: phantoms.map(p => p.id),
      });
      healedDocs++;
    }
  }

  console.log(`Scanned: ${scanned} customers`);
  console.log(`Affected (drift): ${affected}`);
  if (report.length) { console.log(`\nDrift detail:`); report.forEach(r => console.log(r)); }
  if (missingFlagged) console.log(`\n⚠ ${missingFlagged} customer(s) had be_treatments MISSING from summary (rare; the fixed rebuild adds them on next op).`);

  if (APPLY && affected > 0) {
    const auditId = `heal-stale-treatment-count-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await data.collection('be_admin_audit').doc(auditId).set({
      op: 'heal-stale-treatment-count', scanned, affected, healedDocs, missingFlagged,
      appliedAt: FieldValue.serverTimestamp(), note: 'Prune phantom treatmentSummary entries + fix treatmentCount (BackendDashboard:497 bare-proClinicId fix, 2026-06-09).',
    });
    console.log(`\n✓ APPLIED — healed ${healedDocs} docs. Audit: ${auditId}`);
  } else if (!APPLY) {
    console.log(`\nDRY-RUN complete. Re-run with --apply to commit.`);
  } else {
    console.log(`\nNo drift — nothing to heal.`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('HEAL ERROR:', e); process.exit(1); });
}
