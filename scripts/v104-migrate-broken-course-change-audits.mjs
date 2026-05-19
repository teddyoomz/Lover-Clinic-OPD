#!/usr/bin/env node
/**
 * V104-followup Rule M migration — repair existing GARBAGE be_course_changes
 * audit entries written by the PRE-V104-followup V101 backfill script.
 *
 * The pre-V104-followup `scripts/v101-backfill-treatment-course-link.mjs` wrote
 * a FLAT non-canonical shape:
 *   {customerId, treatmentId, courseName, productName, productId, courseIndex,
 *    kind:'use', qty, unit, performedAtIso, _v101Backfill:true, backfilledTimestamp}
 *
 * Display reader CourseHistoryTab.jsx:66 reads `entry.fromCourse?.name` →
 * falls back to "(ไม่ระบุคอร์ส)" and `entry.qtyDelta` → falls back to "-".
 *
 * Per diag-v104-followup-course-changes-shape.mjs (2026-05-19 NIGHT+1):
 *   - 11 garbage entries on LC-26000078 (วันเพ็ญ) all _v101Backfill:true
 *   - All have full data (courseName, productName, qty, unit, performedAtIso,
 *     treatmentId) just in wrong shape → migration is loss-free
 *
 * This script MIGRATES each garbage entry to canonical buildChangeAuditEntry
 * shape while preserving forensic trail under _v104MigratedFrom.
 *
 * Two-phase: dry-run by default; `--apply` commits writes.
 * Idempotent: skips entries already migrated (_v104Migrated:true flag).
 *
 * Rule M canonical pattern:
 *   - admin SDK + canonical path artifacts/{APP_ID}/public/data/...
 *   - PEM key conversion (.env.local.prod)
 *   - audit doc to be_admin_audit
 *   - forensic _v104MigratedAt + _v104MigratedFrom (legacy shape preserved)
 *   - crypto-secure random for audit doc id
 *   - invocation guard via fileURLToPath check
 */

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

// MIRRORS buildChangeAuditEntry exactly. See note in v101-backfill-treatment-course-link.mjs.
function buildCanonicalUseAuditFromLegacy(legacy) {
  return {
    changeId: legacy.changeId || legacy.id, // preserve doc id linkage
    customerId: String(legacy.customerId || ''),
    kind: 'use',
    fromCourse: {
      courseId: null,
      name: String(legacy.courseName || ''),
      status: 'กำลังใช้งาน', // unknown at migration time; safe default
      value: '',
      courseType: '',
    },
    toCourse: null,
    refundAmount: null,
    reason: 'ตัดคอร์สจากการรักษา (V101 backfill — V104-followup migrated)',
    actor: '',
    staffId: '',
    staffName: '',
    qtyDelta: typeof legacy.qty === 'number' ? -legacy.qty : (Number(legacy.qty) ? -Number(legacy.qty) : null),
    qtyBefore: '', // unknown at migration time
    qtyAfter: '', // unknown
    toCustomerId: '',
    toCustomerName: '',
    linkedTreatmentId: String(legacy.treatmentId || ''),
    productName: String(legacy.productName || ''),
    productQty: typeof legacy.qty === 'number' ? legacy.qty : (Number(legacy.qty) || 0),
    productUnit: String(legacy.unit || ''),
    createdAt: legacy.performedAtIso || legacy.backfilledTimestamp || new Date().toISOString(),
  };
}

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
  console.log(`  V104-followup migration  ${applyMode ? '[--APPLY]' : '[DRY-RUN]'}`);
  console.log('  Repair garbage be_course_changes audit entries from V101 backfill');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const snap = await db.collection(`${BASE}/be_course_changes`).get();
  console.log(`Scanned be_course_changes: ${snap.size}`);

  let canonical = 0;
  let alreadyMigrated = 0;
  let garbage = 0;
  const toMigrate = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const hasFromCourse = !!(d.fromCourse && typeof d.fromCourse === 'object' && d.fromCourse.name);
    if (d._v104Migrated) { alreadyMigrated++; continue; }
    if (hasFromCourse) { canonical++; continue; }
    garbage++;
    toMigrate.push({ id: doc.id, ref: doc.ref, legacy: d });
  }

  console.log(`  canonical (skip): ${canonical}`);
  console.log(`  already migrated (skip): ${alreadyMigrated}`);
  console.log(`  garbage to migrate: ${garbage}\n`);

  if (toMigrate.length === 0) {
    console.log('Nothing to migrate — exiting.');
    return;
  }

  for (const item of toMigrate) {
    const canonicalShape = buildCanonicalUseAuditFromLegacy({ ...item.legacy, id: item.id });
    console.log(`  ${item.id}:`);
    console.log(`    legacy: courseName="${item.legacy.courseName}" qty=${item.legacy.qty} unit="${item.legacy.unit}"`);
    console.log(`    → canonical: fromCourse.name="${canonicalShape.fromCourse.name}" qtyDelta=${canonicalShape.qtyDelta} productUnit="${canonicalShape.productUnit}"`);

    if (applyMode) {
      // Use `.set` (overwrite) so legacy top-level garbage fields (courseName,
      // qty, performedAtIso) are GONE from the doc — keeping them creates
      // shape ambiguity. Forensic trail goes into _v104MigratedFrom.
      const _v104MigratedFrom = {
        courseName: item.legacy.courseName || '',
        qty: typeof item.legacy.qty === 'number' ? item.legacy.qty : Number(item.legacy.qty) || null,
        unit: item.legacy.unit || '',
        treatmentId: item.legacy.treatmentId || '',
        productId: item.legacy.productId || '',
        courseIndex: typeof item.legacy.courseIndex === 'number' ? item.legacy.courseIndex : null,
        performedAtIso: item.legacy.performedAtIso || '',
        backfilledTimestamp: item.legacy.backfilledTimestamp || '',
      };
      await item.ref.set({
        ...canonicalShape,
        _v101Backfill: true, // preserve original V101 origin marker
        _v104Migrated: true,
        _v104MigratedAt: FieldValue.serverTimestamp(),
        _v104MigratedFrom,
        timestamp: item.legacy.timestamp || FieldValue.serverTimestamp(),
      });
    }
  }

  const auditId = `v104-followup-migrate-course-audits-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const auditDoc = {
    phase: 'V104-followup',
    operation: 'migrate-broken-course-change-audits',
    appliedAt: applyMode ? FieldValue.serverTimestamp() : null,
    mode: applyMode ? 'apply' : 'dry-run',
    summary: {
      scanned: snap.size,
      canonicalSkipped: canonical,
      alreadyMigratedSkipped: alreadyMigrated,
      migrated: garbage,
      affectedDocIds: toMigrate.map(t => t.id),
    },
  };

  console.log('\n━━━ Summary ━━━');
  console.log(JSON.stringify(auditDoc.summary, null, 2));

  if (applyMode) {
    await db.doc(`${BASE}/be_admin_audit/${auditId}`).set(auditDoc);
    console.log(`\n✓ Audit doc emitted: be_admin_audit/${auditId}`);
  } else {
    console.log(`\n[DRY-RUN] Audit doc would be: be_admin_audit/${auditId}`);
    console.log('Re-run with --apply to commit.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  main(apply).catch(e => { console.error(e); process.exit(1); });
}
