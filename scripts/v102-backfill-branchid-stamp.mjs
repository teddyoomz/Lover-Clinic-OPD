#!/usr/bin/env node
// V102 Rule M backfill — retroactively stamp top-level branchId on
// be_sales + be_treatments docs that miss it.
//
// Strategy:
//   - be_sales:      branchId resolved from linkedTreatmentId → t.branchId
//                    OR detail.branchId fallback OR nakhonratchasima default
//   - be_treatments: branchId resolved from t.detail.branchId OR
//                    nakhonratchasima default (currently sole active branch)
//
// Two-phase: dry-run default; --apply commits.
// Idempotent: docs with branchId already set are skipped.
// Audit doc emitted to be_admin_audit on --apply.
//
// Per Rule M (.claude/rules/01-iron-clad.md).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
const NAKHON_FALLBACK_BRANCH = 'BR-1777873556815-26df6480';

async function main(applyMode = false) {
  const env = loadEnv();
  if (getApps().length === 0) {
    initializeApp({ credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
    }), ignoreUndefinedProperties: true });
  }
  const db = getFirestore();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  V102 Rule M backfill  ${applyMode ? '[--APPLY]' : '[DRY-RUN]'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const [tSnap, sSnap] = await Promise.all([
    db.collection(`${BASE}/be_treatments`).get(),
    db.collection(`${BASE}/be_sales`).get(),
  ]);
  const treatments = tSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  const sales = sSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));

  // ── PASS 1: be_treatments backfill ──
  console.log('━━━ be_treatments backfill ━━━');
  const treatmentOps = [];
  for (const t of treatments) {
    const hasField = t.branchId != null && String(t.branchId).trim();
    if (hasField) continue;
    const fromDetail = t.detail?.branchId && String(t.detail.branchId).trim();
    const resolved = fromDetail || NAKHON_FALLBACK_BRANCH;
    const source = fromDetail ? 'detail.branchId' : 'nakhonratchasima-fallback';
    treatmentOps.push({ id: t.id, ref: t.ref, resolved, source });
    console.log(`  ${t.id}  ← ${resolved}  (${source})`);
  }
  console.log(`  Total treatments to backfill: ${treatmentOps.length}\n`);

  // Index treatments by ID for sale linkage
  const treatmentIdx = new Map();
  for (const t of treatments) treatmentIdx.set(t.treatmentId || t.id, t);
  // Apply treatment patches to in-memory index too (so sale resolution sees them)
  for (const op of treatmentOps) {
    const t = treatmentIdx.get(op.id);
    if (t) t.branchId = op.resolved;
  }

  // ── PASS 2: be_sales backfill ──
  console.log('━━━ be_sales backfill ━━━');
  const saleOps = [];
  for (const s of sales) {
    const hasField = s.branchId != null && String(s.branchId).trim();
    if (hasField) continue;
    // Try linkedTreatmentId match
    const linkedTid = s.linkedTreatmentId || '';
    let resolved = null;
    let source = '';
    if (linkedTid) {
      const t = treatmentIdx.get(linkedTid);
      if (t?.branchId) { resolved = t.branchId; source = `treatment ${linkedTid}.branchId`; }
      else if (t?.detail?.branchId) { resolved = t.detail.branchId; source = `treatment ${linkedTid}.detail.branchId`; }
    }
    // Fallback: detail.branchId on sale
    if (!resolved && s.detail?.branchId) {
      resolved = s.detail.branchId;
      source = 'detail.branchId';
    }
    // Final fallback: nakhonratchasima
    if (!resolved) {
      resolved = NAKHON_FALLBACK_BRANCH;
      source = 'nakhonratchasima-fallback';
    }
    saleOps.push({ id: s.id, ref: s.ref, resolved, source, linkedTid });
    console.log(`  ${s.id}  ← ${resolved}  (${source}; linkedTid=${linkedTid || '(none)'})`);
  }
  console.log(`  Total sales to backfill: ${saleOps.length}\n`);

  // ── WRITE PHASE ──
  if (applyMode) {
    console.log('--- APPLY phase ---');
    for (const op of treatmentOps) {
      await op.ref.update({
        branchId: op.resolved,
        _v102BackfilledAt: FieldValue.serverTimestamp(),
        _v102BackfilledSource: op.source,
      });
    }
    console.log(`  Updated ${treatmentOps.length} treatments`);
    for (const op of saleOps) {
      await op.ref.update({
        branchId: op.resolved,
        _v102BackfilledAt: FieldValue.serverTimestamp(),
        _v102BackfilledSource: op.source,
        _v102LinkedTreatmentId: op.linkedTid || null,
      });
    }
    console.log(`  Updated ${saleOps.length} sales`);
  }

  // ── AUDIT DOC ──
  const auditId = `v102-backfill-branchid-stamp-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const auditDoc = {
    phase: 'V102',
    operation: 'backfill-branchid-stamp',
    appliedAt: applyMode ? FieldValue.serverTimestamp() : null,
    mode: applyMode ? 'apply' : 'dry-run',
    summary: {
      treatmentsScanned: treatments.length,
      treatmentsBackfilled: treatmentOps.length,
      salesScanned: sales.length,
      salesBackfilled: saleOps.length,
    },
    treatmentOps: treatmentOps.map(o => ({ id: o.id, resolved: o.resolved, source: o.source })),
    saleOps: saleOps.map(o => ({ id: o.id, resolved: o.resolved, source: o.source, linkedTid: o.linkedTid })),
  };

  console.log('\n━━━ Summary ━━━');
  console.log(JSON.stringify(auditDoc.summary, null, 2));
  if (applyMode) {
    await db.doc(`${BASE}/be_admin_audit/${auditId}`).set(auditDoc);
    console.log(`\n✓ Audit doc emitted: be_admin_audit/${auditId}`);
  } else {
    console.log(`\n[DRY-RUN] Re-run with --apply to commit.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  main(apply).catch(e => { console.error(e); process.exit(1); });
}
