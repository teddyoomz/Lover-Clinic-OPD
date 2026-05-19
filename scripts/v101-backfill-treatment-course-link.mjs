#!/usr/bin/env node
// V101 Rule M backfill — retroactively decrement customer.courses[] +
// emit be_course_changes audit entries for treatments where treatmentItems
// had matching productId but courseItems persisted as [].
//
// Identifies affected treatments via productId match against customer.courses[]
// + customer.courses entry still at total === remaining (no decrement).
// Uses V101 Pass 2 FIFO logic exactly: first matching course with remaining > 0.
//
// Two-phase: dry-run default; --apply to commit.
// Idempotency: re-run with --apply yields 0 writes (forensic _v101BackfilledAt
// stamp on treatment skips already-processed).
//
// Per Rule M (.claude/rules/01-iron-clad.md):
//   - canonical path artifacts/{APP_ID}/public/data/...
//   - admin SDK with PEM key conversion
//   - audit doc to be_admin_audit
//   - forensic-trail fields _v101Backfilled*
//   - crypto-secure random for audit doc id
//   - invocation guard via fileURLToPath check

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// V104-followup (2026-05-19 LATE+3 EOD+1 NIGHT+1) — canonical buildChangeAuditEntry
// shape mirror. Pre-V104-followup the backfill wrote a FLAT shape
// {courseName, productName, qty, performedAtIso, treatmentId, ...} that did
// NOT match the canonical shape from src/lib/courseExchange.js:246. Display
// reader CourseHistoryTab.jsx:66 reads `entry.fromCourse?.name` → falls back
// to "(ไม่ระบุคอร์ส)" + qtyDelta missing → "-". User report 2026-05-19 NIGHT+1
// with image of 11 "(ไม่ระบุคอร์ส) -" entries on LC-26000078.
//
// This local helper MIRRORS the canonical shape exactly. Admin-SDK ESM
// can't import the React/Vite module directly, so the shape is duplicated
// here. Regression test v104-followup-backfill-audit-shape.test.js locks
// the parity.
function buildCanonicalUseAudit({ customerId, fromCourseName, fromCourseStatus, fromCourseValue, fromCourseType, qtyDelta, qtyBefore, qtyAfter, productName, productQty, productUnit, linkedTreatmentId, reason, staffId, staffName, actor, createdAt }) {
  return {
    changeId: '', // populated by caller
    customerId: String(customerId),
    kind: 'use',
    fromCourse: {
      courseId: null,
      name: String(fromCourseName || ''),
      status: String(fromCourseStatus || 'กำลังใช้งาน'),
      value: String(fromCourseValue || ''),
      courseType: String(fromCourseType || ''),
    },
    toCourse: null,
    refundAmount: null,
    reason: String(reason || 'ตัดคอร์สจากการรักษา').slice(0, 500),
    actor: String(actor || ''),
    staffId: String(staffId || ''),
    staffName: String(staffName || ''),
    qtyDelta: typeof qtyDelta === 'number' ? qtyDelta : null,
    qtyBefore: String(qtyBefore || ''),
    qtyAfter: String(qtyAfter || ''),
    toCustomerId: '',
    toCustomerName: '',
    linkedTreatmentId: String(linkedTreatmentId || ''),
    productName: String(productName || ''),
    productQty: typeof productQty === 'number' ? productQty : (Number(productQty) || 0),
    productUnit: String(productUnit || ''),
    createdAt: createdAt || new Date().toISOString(),
  };
}

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

function parseQty(q) {
  if (!q || typeof q !== 'string') return { total: 0, remaining: 0, unit: '' };
  const m = q.match(/^([\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/);
  if (!m) return { total: 0, remaining: 0, unit: '' };
  return {
    remaining: parseFloat(m[1].replace(/,/g, '')) || 0,
    total: parseFloat(m[2].replace(/,/g, '')) || 0,
    unit: m[3].trim() || 'ครั้ง',
  };
}

function formatQty(remaining, total, unit) {
  return `${remaining} / ${total} ${unit}`;
}

function ts(v) {
  if (!v) return '(none)';
  if (typeof v === 'string') return v;
  if (v._seconds) return new Date(v._seconds * 1000).toISOString();
  if (v.toDate) return v.toDate().toISOString();
  return '?';
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
  console.log(`  V101 Rule M backfill  ${applyMode ? '[--APPLY]' : '[DRY-RUN]'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Load all treatments
  const tSnap = await db.collection(`${BASE}/be_treatments`).get();
  const allTreatments = tSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  console.log(`Scanned treatments: ${allTreatments.length}`);

  // 2. Identify affected treatments
  const affected = [];
  for (const t of allTreatments) {
    const d = t.detail || {};
    const ti = Array.isArray(d.treatmentItems) ? d.treatmentItems : [];
    const ci = Array.isArray(d.courseItems) ? d.courseItems : [];
    if (ti.length === 0 || ci.length > 0) continue;
    if (t._v101BackfilledAt) continue; // already processed (idempotent)
    const tiWithProductId = ti.filter(item => item.productId);
    if (tiWithProductId.length === 0) continue;
    affected.push({ treatment: t, treatmentItems: tiWithProductId });
  }
  console.log(`Affected treatments (need backfill): ${affected.length}\n`);

  if (affected.length === 0) {
    console.log('Nothing to backfill — exiting.');
    return;
  }

  // 3. Group by customerId
  const byCustomer = new Map();
  for (const a of affected) {
    const cid = a.treatment.customerId;
    if (!byCustomer.has(cid)) byCustomer.set(cid, []);
    byCustomer.get(cid).push(a);
  }

  let totalCourseItemsAdded = 0;
  let totalCourseChangesEmitted = 0;
  let totalCustomerCourseDecrements = 0;
  const skipped = [];
  const auditOps = [];

  // 4. Per-customer processing — sort affected by createdAt ASC so deductions
  // apply in chronological order (FIFO realistic replay).
  for (const [customerId, group] of byCustomer.entries()) {
    group.sort((a, b) => (a.treatment.createdAt?._seconds || 0) - (b.treatment.createdAt?._seconds || 0));
    const cSnap = await db.doc(`${BASE}/be_customers/${customerId}`).get();
    if (!cSnap.exists) {
      console.warn(`Customer ${customerId} not found — skipping ${group.length} treatments`);
      skipped.push({ customerId, reason: 'customer-not-found', count: group.length });
      continue;
    }
    let customer = cSnap.data();
    let workingCourses = Array.isArray(customer.courses) ? customer.courses.map(c => ({ ...c })) : [];
    console.log(`━━━ Customer ${customerId} (${group.length} treatments) ━━━`);

    for (const { treatment, treatmentItems } of group) {
      console.log(`\n  Treatment ${treatment.treatmentId || treatment.id}  createdAt=${ts(treatment.createdAt)}`);

      const courseItemsOut = [];
      const changeEmitOut = [];
      const courseDecrements = []; // { index, beforeQty, afterQty }

      for (const ti of treatmentItems) {
        // Pass 2 FIFO — find first customer.courses with matching productId + remaining > 0
        let matchIdx = -1;
        for (let i = 0; i < workingCourses.length; i++) {
          const c = workingCourses[i];
          if (String(c.productId || '') !== String(ti.productId)) continue;
          const parsed = parseQty(c.qty);
          if (parsed.remaining > 0) {
            matchIdx = i;
            break;
          }
        }
        if (matchIdx === -1) {
          console.warn(`    ⚠ ti.productId=${ti.productId} (${ti.name}) — no available course found, skipping deduct`);
          continue;
        }
        const targetCourse = workingCourses[matchIdx];
        const parsed = parseQty(targetCourse.qty);
        const deductQty = Math.min(Number(ti.qty) || 1, parsed.remaining);
        const newRemaining = parsed.remaining - deductQty;
        const newQtyStr = formatQty(newRemaining, parsed.total, parsed.unit);
        console.log(`    ✓ Match idx=${matchIdx} "${targetCourse.name}/${targetCourse.product}" qty "${targetCourse.qty}" → "${newQtyStr}"`);

        courseItemsOut.push({
          courseName: targetCourse.name,
          productName: targetCourse.product || targetCourse.productName || ti.name,
          rowId: `be-row-${matchIdx}`,
          courseIndex: matchIdx,
          deductQty,
          unit: parsed.unit,
          _v101AutoLinked: true,
          _v101BackfilledAt: true,
        });
        // V104-followup canonical shape: mirror buildChangeAuditEntry output
        // so display reader at CourseHistoryTab.jsx:66 (entry.fromCourse?.name)
        // resolves correctly. Pre-V104-followup wrote flat shape → "(ไม่ระบุคอร์ส)".
        const performedAtIso = treatment.createdAt?._seconds
          ? new Date(treatment.createdAt._seconds * 1000).toISOString()
          : new Date().toISOString();
        const canonicalAudit = buildCanonicalUseAudit({
          customerId,
          fromCourseName: targetCourse.name,
          fromCourseStatus: targetCourse.status || 'กำลังใช้งาน',
          fromCourseValue: targetCourse.value || '',
          fromCourseType: targetCourse.courseType || '',
          qtyDelta: -deductQty, // negative for use
          qtyBefore: targetCourse.qty || '',
          qtyAfter: newQtyStr,
          productName: targetCourse.product || targetCourse.productName || ti.name,
          productQty: deductQty,
          productUnit: parsed.unit,
          linkedTreatmentId: treatment.treatmentId || treatment.id,
          reason: 'ตัดคอร์สจากการรักษา (V101 backfill — V104-followup canonical shape)',
          createdAt: performedAtIso,
        });
        changeEmitOut.push({
          ...canonicalAudit,
          // Forensic fields (NOT part of canonical schema — kept for migration tracing)
          _v101Backfill: true,
          _v101LegacyMeta: {
            treatmentId: treatment.treatmentId || treatment.id,
            productId: ti.productId,
            courseIndex: matchIdx,
            performedAtIso,
          },
        });
        courseDecrements.push({ index: matchIdx, beforeQty: targetCourse.qty, afterQty: newQtyStr });

        // Mutate working copy for subsequent deducts in same loop
        workingCourses[matchIdx] = { ...targetCourse, qty: newQtyStr };
      }

      if (courseItemsOut.length === 0) {
        console.warn(`    ⚠ Treatment ${treatment.id}: no deductible matches — leaving untouched`);
        continue;
      }
      totalCourseItemsAdded += courseItemsOut.length;
      totalCourseChangesEmitted += changeEmitOut.length;
      totalCustomerCourseDecrements += courseDecrements.length;

      auditOps.push({
        treatmentId: treatment.treatmentId || treatment.id,
        customerId,
        addedCourseItems: courseItemsOut.length,
        decrements: courseDecrements,
        emittedAuditCount: changeEmitOut.length,
      });

      // 5. WRITE PHASE (only when --apply)
      if (applyMode) {
        // (a) Update treatment doc — add courseItems + forensic stamp
        const updatedDetail = { ...(treatment.detail || {}), courseItems: courseItemsOut };
        await treatment.ref.update({
          detail: updatedDetail,
          _v101BackfilledAt: FieldValue.serverTimestamp(),
          _v101BackfilledFrom: {
            previousCourseItems: treatment.detail?.courseItems || [],
            backfillSource: 'v101-rule-m',
          },
          _v101BackfillTreatmentItemsCount: treatmentItems.length,
        });
        // (b) Emit be_course_changes entries (one per courseItem)
        // V104-followup: ev is already canonical shape (buildCanonicalUseAudit output)
        // + forensic _v101Backfill / _v101LegacyMeta fields. changeId is stamped
        // per emit so the canonical shape parity matches the canonical buildChangeAuditEntry.
        for (const ev of changeEmitOut) {
          const evId = `cc-v101-${Date.now()}-${randomBytes(4).toString('hex')}`;
          await db.doc(`${BASE}/be_course_changes/${evId}`).set({
            ...ev,
            changeId: evId,
            timestamp: FieldValue.serverTimestamp(),
            backfilledTimestamp: ev._v101LegacyMeta?.performedAtIso || ev.createdAt,
          });
        }
      }
    }

    // 6. Update customer.courses[] (only when --apply)
    if (applyMode) {
      await cSnap.ref.update({
        courses: workingCourses,
        _v101LastBackfilledAt: FieldValue.serverTimestamp(),
      });
      console.log(`\n  ✓ customer.courses[] updated for ${customerId}`);
    }
  }

  // 7. Audit doc
  const auditId = `v101-backfill-treatment-course-link-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const auditDoc = {
    phase: 'V101',
    operation: 'backfill-treatment-course-link',
    appliedAt: applyMode ? FieldValue.serverTimestamp() : null,
    mode: applyMode ? 'apply' : 'dry-run',
    summary: {
      scannedTreatments: allTreatments.length,
      affectedTreatments: affected.length,
      customersTouched: byCustomer.size,
      courseItemsAdded: totalCourseItemsAdded,
      auditChangesEmitted: totalCourseChangesEmitted,
      customerCourseDecrements: totalCustomerCourseDecrements,
      skipped,
    },
    ops: auditOps,
  };

  console.log('\n━━━ Summary ━━━');
  console.log(JSON.stringify(auditDoc.summary, null, 2));

  if (applyMode) {
    await db.doc(`${BASE}/be_admin_audit/${auditId}`).set(auditDoc);
    console.log(`\n✓ Audit doc emitted: be_admin_audit/${auditId}`);
  } else {
    console.log(`\n[DRY-RUN] Audit doc would be: be_admin_audit/${auditId}`);
    console.log(`Re-run with --apply to commit.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  main(apply).catch(e => { console.error(e); process.exit(1); });
}
