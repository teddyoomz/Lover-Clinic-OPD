#!/usr/bin/env node
// ─── V97 — Filler unit fix (2026-05-19, Rule M canonical) ─────────────────
//
// User directive 2026-05-19 (verbatim):
//   "ลบคอร์สคงเหลือ neuramis ที่หน่วยเป็นครั้งด้วย ทั้งในลูกค้าวันเพ็ญ
//    และในระบบสต็อคของสาขานครราชสีมา มันคือความผิดพลาด ของจริงมันหน่วยเป็น
//    CC และฝากดูฟิลเลอร์อื่นๆด้วย มีเป็นครั้งอีกไหม ถ้ามีให้ทำมาเป็น CC
//    แล้วมีแค่ฟิลเลอร์ที่หน่วยเป็น CC ในคอร์สนั้น ถ้าเจอฟิลเลอร์ยี่ห้ออื่น
//    มีเป็นครั้งอีกใน database คอร์สของเรา ให้แก้หน่วยเป็น Cc ด้วย"
//
// User confirmed scope via AskUserQuestion 2026-05-19:
//   1. วันเพ็ญ's Neuramis entry  → DELETE (ยอดหาย)
//   2. be_courses master 53 entries → UPDATE unit "" → "CC"
//
// Pre-flight diag (scripts/diag-filler-unit-audit.mjs +
// diag-filler-customer-courses.mjs) confirmed:
//   - be_products: 6 fillers, ALL already unit="CC" ✓ (no action needed)
//   - be_courses: 53 courseProducts entries with filler names but unit="" ⚠️
//   - be_customers: ONLY 1 instance with wrong unit (LC-26000078 วันเพ็ญ)
//
// USAGE:
//   node scripts/v97-filler-unit-fix.mjs            # dry-run (default)
//   node scripts/v97-filler-unit-fix.mjs --apply    # commit writes + audit doc
//
// Rule M discipline:
//   - admin-SDK + .env.local.prod
//   - canonical artifacts/{APP_ID}/public/data/* paths
//   - two-phase (dry-run default → --apply commits)
//   - per-target forensic trail
//   - audit doc emit on --apply
//   - idempotent (re-run --apply yields 0 writes after first run)

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

const APPLY = process.argv.includes('--apply');
const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;
const RUN_ID = randomBytes(4).toString('hex');

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();

// Filler brand regex — covers all known HA fillers in Thai market
const FILLER_RE = /\b(neuramis|restylane|juvederm|juvéderm|belotero|stylage|teosyal|princess|yvoire|croma|aliaxin|saypha|vivacy|profhilo|sculptra|radiesse|ellanse|aliaxin)\b/i;

// Target customer (วันเพ็ญ) — explicit per user directive
const TARGET_CUSTOMER_ID = 'LC-26000078';
const TARGET_FILLER_REGEX = /neuramis/i;

let phase1Stats = { scanned: 0, matched: 0, deleted: 0, skipped: 0 };
let phase2Stats = { coursesScanned: 0, coursesNeedingFix: 0, entriesFixed: 0, alreadyCorrect: 0 };
const phase1Detail = [];
const phase2Detail = [];

// ─── PHASE 1: Delete filler-ครั้ง entry from วันเพ็ญ's courses[] ──────────

async function phase1() {
  console.log('\n═══ PHASE 1: Delete filler-ครั้ง from วันเพ็ญ (LC-26000078) ═══');
  const cRef = db.doc(`${BASE}/be_customers/${TARGET_CUSTOMER_ID}`);
  const snap = await cRef.get();
  if (!snap.exists) {
    console.log('  ⚠️  Customer not found — skipping phase 1');
    return;
  }
  const data = snap.data();
  const courses = Array.isArray(data.courses) ? data.courses : [];
  phase1Stats.scanned = courses.length;

  // Find filler entries with wrong unit (ครั้ง or no-CC)
  const toRemove = [];
  const keep = [];
  for (const c of courses) {
    const name = c.name || c.courseName || '';
    const product = c.product || c.productName || '';
    const qty = c.qty || '';
    const isFiller = TARGET_FILLER_REGEX.test(name) || TARGET_FILLER_REGEX.test(product);
    const hasWrongUnit = /ครั้ง/.test(qty) && !/cc/i.test(qty);
    if (isFiller && hasWrongUnit) {
      toRemove.push(c);
      phase1Detail.push({
        customerId: TARGET_CUSTOMER_ID,
        courseName: name, product, qty, status: c.status, expiry: c.expiry,
        courseId: c.courseId,
      });
    } else {
      keep.push(c);
    }
  }
  phase1Stats.matched = toRemove.length;

  console.log(`  Customer: ${data.firstname || ''} ${data.lastname || ''}  (id=${TARGET_CUSTOMER_ID})`);
  console.log(`  Total courses[]: ${courses.length}`);
  console.log(`  Filler-ครั้ง to remove: ${toRemove.length}`);
  for (const r of toRemove) {
    console.log(`    × "${r.name || r.courseName}" / product="${r.product || r.productName}" qty="${r.qty}" status=${r.status}`);
  }

  if (toRemove.length === 0) {
    console.log('  ✓ Nothing to remove (idempotent — already cleaned)');
    return;
  }

  if (!APPLY) {
    console.log('  (DRY-RUN — no writes)');
    return;
  }

  // Apply: replace courses array with the kept entries + forensic stamp
  await cRef.update({
    courses: keep,
    _v97FillerUnitFixedAt: FieldValue.serverTimestamp(),
    _v97FillerUnitFixRemovedEntries: toRemove, // forensic — preserve what was removed
    _v97FillerUnitFixReason: 'wrong-unit-ครั้ง-replaced-by-master-fix-CC',
  });
  phase1Stats.deleted = toRemove.length;
  console.log(`  ✓ Removed ${toRemove.length} entries + forensic stamps written`);
}

// ─── PHASE 2: Update be_courses master — courseProducts[].unit "" → "CC" ──

async function phase2() {
  console.log('\n═══ PHASE 2: Update be_courses master — filler courseProducts unit "" → "CC" ═══');
  const coursesSnap = await db.collection(`${BASE}/be_courses`).get();
  phase2Stats.coursesScanned = coursesSnap.size;
  const updates = [];

  coursesSnap.forEach(doc => {
    const d = doc.data();
    const products = Array.isArray(d.courseProducts) ? d.courseProducts : null;
    if (!products) return;
    let dirty = false;
    const before = [];
    const newProducts = products.map((p, idx) => {
      const pName = p.productName || p.name || '';
      if (!FILLER_RE.test(pName)) return p;
      const currentUnit = String(p.unit || '').trim();
      if (currentUnit === 'CC') {
        phase2Stats.alreadyCorrect += 1;
        return p; // already correct
      }
      if (currentUnit === '' || currentUnit === 'ครั้ง') {
        before.push({ idx, productName: pName, legacyUnit: currentUnit });
        dirty = true;
        phase2Stats.entriesFixed += 1;
        return { ...p, unit: 'CC' };
      }
      return p;
    });
    if (dirty) {
      phase2Stats.coursesNeedingFix += 1;
      updates.push({
        id: doc.id,
        courseName: d.courseName || d.name || '',
        branchId: d.branchId,
        before,
        newProducts,
      });
      phase2Detail.push(...before.map(b => ({ courseId: doc.id, courseName: d.courseName, ...b })));
    }
  });

  console.log(`  be_courses scanned: ${coursesSnap.size}`);
  console.log(`  Courses needing fix: ${phase2Stats.coursesNeedingFix}`);
  console.log(`  courseProducts entries to update: ${phase2Stats.entriesFixed}`);
  console.log(`  Entries already correct (CC): ${phase2Stats.alreadyCorrect}`);

  if (updates.length === 0) {
    console.log('  ✓ Nothing to update (idempotent — already cleaned)');
    return;
  }

  if (!APPLY) {
    console.log('  (DRY-RUN — no writes; first 10 affected courses:)');
    updates.slice(0, 10).forEach(u => {
      console.log(`    • "${u.courseName}" (id=${u.id}, branch=${u.branchId}) — fix ${u.before.length} entries`);
      u.before.forEach(b => console.log(`        [${b.idx}] "${b.productName}"  legacyUnit="${b.legacyUnit}" → "CC"`));
    });
    if (updates.length > 10) console.log(`    ... and ${updates.length - 10} more`);
    return;
  }

  // Apply — chunk into writeBatches of 450 (Firestore limit 500)
  const CHUNK = 450;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = db.batch();
    const slice = updates.slice(i, i + CHUNK);
    for (const u of slice) {
      const ref = db.doc(`${BASE}/be_courses/${u.id}`);
      batch.update(ref, {
        courseProducts: u.newProducts,
        _v97FillerUnitFixedAt: FieldValue.serverTimestamp(),
        _v97FillerUnitLegacyEntries: u.before,
        _v97FillerUnitFixReason: 'filler-unit-blank-to-CC',
      });
    }
    await batch.commit();
    console.log(`  ✓ writeBatch ${Math.floor(i / CHUNK) + 1}: ${slice.length} courses committed`);
  }
}

// ─── Audit doc emit (Rule M) ───────────────────────────────────────────────

async function emitAuditDoc() {
  if (!APPLY) return;
  const auditId = `v97-filler-unit-fix-${Date.now()}-${RUN_ID}`;
  await db.doc(`${BASE}/be_admin_audit/${auditId}`).set({
    auditId,
    op: 'v97-filler-unit-fix',
    phase1: { ...phase1Stats, detail: phase1Detail },
    phase2: { ...phase2Stats, detail: phase2Detail.slice(0, 100) }, // cap forensic at 100
    appliedAt: FieldValue.serverTimestamp(),
    appliedBy: 'admin-sdk-script',
  });
  console.log(`\n  📝 audit doc: be_admin_audit/${auditId}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log(`V97 — Filler unit fix (APPLY=${APPLY})`);
  console.log(`Run ID: ${RUN_ID}\n`);
  try {
    await phase1();
    await phase2();
    await emitAuditDoc();
    console.log(`\n═══ RESULT ═══`);
    console.log(`Phase 1 (วันเพ็ญ): scanned=${phase1Stats.scanned}, matched=${phase1Stats.matched}, deleted=${phase1Stats.deleted}`);
    console.log(`Phase 2 (be_courses master): coursesScanned=${phase2Stats.coursesScanned}, coursesNeedingFix=${phase2Stats.coursesNeedingFix}, entriesFixed=${phase2Stats.entriesFixed}, alreadyCorrect=${phase2Stats.alreadyCorrect}`);
    if (!APPLY) console.log(`\n→ Re-run with --apply to commit writes.`);
    process.exit(0);
  } catch (e) {
    console.error('💥 UNCAUGHT:', e.message, e.stack);
    process.exit(1);
  }
})();
