#!/usr/bin/env node
// ─── Rule M — AV209 follow-up: backfill per-row courseId on be_customers.courses[] ──
//
// WHY: resolveCourseRowIndex (AV209) resolves strongest via courseId, but the
// standard assignCourseToCustomer branch never stamped one — ~1384 legacy rows
// are identity-less. The irreducible tail: a legacy row spliced while a
// same-name+product twin remains → identity search resolves to the twin
// (wrong purchase). Stamping a unique per-row courseId closes it: byId is
// exact, twins individually addressable. Writer now stamps `crs-` on new
// rows (backendClient.js, same date); this script heals existing data.
//
// SAFETY:
//   - Per-doc TRANSACTION (Rule T — clinic may be mutating courses concurrently;
//     tx.get→mutate→tx.update serializes against live OCC writers).
//   - Rows with ANY truthy courseId are SKIPPED (pick-/exchange-/crs- preserved;
//     idempotent — re-run with --apply yields 0 writes).
//   - Namespace `crsbf-` — distinct from purchased-/promo-/pick-/exchange-/
//     be-course-/legacy-/idx- sentinels used by rowId contracts + grouping.
//   - Doc-level forensic `_av209CourseIdBackfilledAt` + `_av209CourseIdBackfilledCount`.
//   - Audit doc to be_admin_audit (crypto-random id).
//
// Run: node scripts/av209-backfill-course-row-courseid.mjs [--apply]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = v;
  }
}

// Pure decision helper (exported for tests): stamp only when courseId is
// missing/empty. NEVER overwrite an existing id (pick-/exchange-/crs- rows).
export function decideRowBackfill(row) {
  if (!row || typeof row !== 'object') return 'skip-not-object';
  if (row.courseId !== undefined && row.courseId !== null && String(row.courseId) !== '') return 'skip-has-id';
  return 'stamp';
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  loadEnvLocal();

  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { randomBytes } = await import('node:crypto');

  const APP_ID = 'loverclinic-opd-4c39b';
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const custCol = db.collection(`artifacts/${APP_ID}/public/data/be_customers`);

  const snap = await custCol.get();
  let scannedDocs = 0; let scannedRows = 0; let stampedRows = 0; let skippedHasId = 0;
  let docsTouched = 0; let docsSkipped = 0;
  const perDocPlan = []; // { id, stampCount }

  for (const d of snap.docs) {
    scannedDocs += 1;
    const courses = Array.isArray(d.data().courses) ? d.data().courses : [];
    scannedRows += courses.length;
    let stampCount = 0;
    for (const row of courses) {
      const decision = decideRowBackfill(row);
      if (decision === 'stamp') stampCount += 1;
      else if (decision === 'skip-has-id') skippedHasId += 1;
    }
    if (stampCount === 0) { docsSkipped += 1; continue; }
    perDocPlan.push({ id: d.id, stampCount });
    stampedRows += stampCount;
  }

  console.log(`── AV209 courseId backfill (${APPLY ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`docs scanned ${scannedDocs} · rows scanned ${scannedRows}`);
  console.log(`rows to stamp ${stampedRows} · rows already-have-id ${skippedHasId} · docs untouched ${docsSkipped}`);
  console.log(`docs to touch ${perDocPlan.length}`);
  for (const p of perDocPlan.slice(0, 15)) console.log(`  ${p.id}: +${p.stampCount}`);
  if (perDocPlan.length > 15) console.log(`  ... (+${perDocPlan.length - 15} more docs)`);

  if (!APPLY) { console.log('\nDRY-RUN only. Re-run with --apply to stamp.'); return; }

  let appliedRows = 0;
  for (const p of perDocPlan) {
    const ref = custCol.doc(p.id);
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return;
      const courses = Array.isArray(fresh.data().courses) ? fresh.data().courses : [];
      let touched = 0;
      const next = courses.map((row, i) => {
        if (decideRowBackfill(row) !== 'stamp') return row;
        touched += 1;
        return { ...row, courseId: `crsbf-${Date.now()}-${i}-${randomBytes(4).toString('hex')}` };
      });
      if (touched === 0) return;
      tx.update(ref, {
        courses: next,
        _av209CourseIdBackfilledAt: FieldValue.serverTimestamp(),
        _av209CourseIdBackfilledCount: touched,
      });
      appliedRows += touched;
    });
    docsTouched += 1;
  }

  const auditId = `av209-courseid-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await db.collection(`artifacts/${APP_ID}/public/data/be_admin_audit`).doc(auditId).set({
    op: 'av209-courseid-backfill',
    scanned: scannedRows,
    scannedDocs,
    stamped: appliedRows,
    docsTouched,
    skippedHasId,
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`\nAPPLIED: ${appliedRows} rows across ${docsTouched} docs · audit ${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
