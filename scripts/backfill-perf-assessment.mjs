// ─── backfill-perf-assessment.mjs — Rule M two-phase data heal (AV194) ───────
// 2026-06-13. The AV194 code fix carries the kiosk perf/hormone assessment
// (symp_pe/adam_*/iief_*/mrs_*) through the projection going FORWARD. This
// heals EXISTING be_customers (currently 0/150 carry perf) by recovering the
// answers from their SURVIVING opd_session.
//
// SAFETY (avoid mis-attribution):
//   • STRONG identity match ONLY — (a) citizen-id/national-id digits equal,
//     OR (b) firstName AND lastName AND phone(digits) ALL equal.
//   • Backfill ONLY when the matched session has MEANINGFUL answers
//     (pickKioskAssessmentFields non-empty — i.e. the customer actually ticked
//     ADAM / chose IIEF/MRS; default false/'' sessions yield {} → skipped).
//   • Prefer the INTAKE session (formType not followup_*); tie → most recent.
//   • Ambiguous (≥2 matched sessions with DIFFERENT meaningful perf) → SKIP +
//     flag for manual review (never guess).
//   • Idempotent — skip customers that already carry any perf field OR a
//     prior _perfBackfilledAt stamp.
//
// Writes ONLY surgical dotted-path patientData.<field> (preserves siblings) +
// forensic root fields. Audit doc to be_admin_audit. Two-phase: dry-run by
// default; pass --apply to commit.
//
// Usage: node scripts/backfill-perf-assessment.mjs [--apply]

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const importLib = (rel) => import(pathToFileURL(path.resolve(process.cwd(), rel)).href);

const digits = (v) => String(v ?? '').replace(/\D/g, '');
const nameKey = (f, l) => `${String(f ?? '').trim()}|${String(l ?? '').trim()}`;
const phoneKey = (v) => { const d = digits(v); return d ? d.slice(-9) : ''; }; // last-9 (tolerate +66 / leading 0)
const sameValPerf = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Strong identity match between a be_customer and an opd_session.
function strongMatch(cust, sess) {
  const cpd = cust.patientData || {};
  const spd = sess.patientData || {};
  const cNid = digits(cust.citizen_id || cust.passport_id || cpd.nationalId || cpd.passport);
  const sNid = digits(spd.idCard || spd.nationalId || spd.passport);
  if (cNid && sNid && cNid === sNid) return 'national-id';
  const cName = nameKey(cpd.firstName || cust.firstname, cpd.lastName || cust.lastname);
  const sName = nameKey(spd.firstName, spd.lastName);
  const cPhone = phoneKey(cust.telephone_number || cpd.phone);
  const sPhone = phoneKey(spd.phone);
  if (cName !== '|' && cName === sName && cPhone && cPhone === sPhone) return 'name+phone';
  return null;
}

async function main() {
  const db = initAdmin();
  const data = base(db);
  const { pickKioskAssessmentFields } = await importLib('src/lib/kioskAssessmentFields.js');
  console.log(`═══ backfill perf-assessment — ${APPLY ? 'APPLY (will write)' : 'DRY-RUN (no writes)'} ═══\n`);

  // Index opd_sessions that carry MEANINGFUL perf answers.
  const sessSnap = await data.collection('opd_sessions').get();
  const perfSessions = [];
  for (const d of sessSnap.docs) {
    const s = d.data();
    const perf = pickKioskAssessmentFields(s.patientData || {});
    if (Object.keys(perf).length > 0) perfSessions.push({ id: d.id, s, perf });
  }
  console.log(`opd_sessions: ${sessSnap.size} total; ${perfSessions.length} carry MEANINGFUL perf answers\n`);

  const custSnap = await data.collection('be_customers').get();
  const plans = [];
  const skips = { alreadyHasPerf: 0, noMatch: 0, ambiguous: 0 };
  const ambiguousList = [];

  for (const cd of custSnap.docs) {
    const cust = cd.data();
    const cpd = cust.patientData || {};
    // Idempotent: already carries perf OR a prior backfill stamp → skip.
    if (Object.keys(pickKioskAssessmentFields(cpd)).length > 0 || cust._perfBackfilledAt) { skips.alreadyHasPerf++; continue; }

    const matches = perfSessions.filter((ps) => strongMatch(cust, ps.s));
    if (matches.length === 0) { skips.noMatch++; continue; }

    // Prefer intake (non-followup) sessions; tie → most recent submittedAt.
    const score = (ps) => {
      const ft = String(ps.s.formType || ps.s.sessionType || 'intake');
      const isIntake = !ft.startsWith('followup');
      const ts = ps.s.submittedAt?.toMillis?.() || ps.s.updatedAt?.toMillis?.() || 0;
      return { isIntake, ts };
    };
    matches.sort((a, b) => { const sa = score(a), sb = score(b); if (sa.isIntake !== sb.isIntake) return sa.isIntake ? -1 : 1; return sb.ts - sa.ts; });
    const pick = matches[0];

    // Ambiguity guard: ≥2 matched sessions whose meaningful perf DIFFERS → skip.
    const distinct = new Set(matches.map((m) => JSON.stringify(m.perf)));
    if (distinct.size > 1) {
      // tolerate when the top pick is a clear INTAKE and the others are followups
      const intakeMatches = matches.filter((m) => score(m).isIntake);
      const intakeDistinct = new Set(intakeMatches.map((m) => JSON.stringify(m.perf)));
      if (intakeMatches.length !== 1 && intakeDistinct.size !== 1) {
        skips.ambiguous++;
        ambiguousList.push({ id: cd.id, name: nameKey(cpd.firstName, cpd.lastName), sessions: matches.map((m) => m.id) });
        continue;
      }
    }

    plans.push({
      id: cd.id,
      name: `${cpd.firstName || cust.firstname || ''} ${cpd.lastName || cust.lastname || ''}`.trim(),
      basis: strongMatch(cust, pick.s),
      fromSession: pick.id,
      perf: pick.perf,
    });
  }

  console.log(`be_customers: ${custSnap.size} total\n`);
  console.log(`PLAN — ${plans.length} customer(s) to backfill:`);
  for (const p of plans) {
    console.log(`  ⤷ ${p.id} "${p.name}"  match=${p.basis}  ← opd_sessions/${p.fromSession}`);
    console.log(`      perf: ${JSON.stringify(p.perf)}`);
  }
  console.log(`\nSKIPPED — alreadyHasPerf/stamped: ${skips.alreadyHasPerf}, no-match: ${skips.noMatch}, ambiguous(manual): ${skips.ambiguous}`);
  for (const a of ambiguousList) console.log(`  ⚠ ambiguous ${a.id} "${a.name}" — sessions ${a.sessions.join(', ')} (manual review)`);

  if (!APPLY || plans.length === 0) {
    console.log(`\n═══ ${APPLY ? 'APPLY' : 'DRY-RUN'} summary: ${plans.length} would change ═══`);
    return;
  }

  // Apply — surgical dotted-path patientData.<field> + forensic + audit. Chunk by 400.
  let written = 0;
  for (let i = 0; i < plans.length; i += 400) {
    const chunk = plans.slice(i, i + 400);
    const batch = db.batch();
    for (const p of chunk) {
      const patch = {};
      for (const [k, v] of Object.entries(p.perf)) patch[`patientData.${k}`] = v;
      patch._perfBackfilledAt = FieldValue.serverTimestamp();
      patch._perfBackfilledFromSession = p.fromSession;
      patch._perfBackfilledFields = Object.keys(p.perf);
      batch.update(data.collection('be_customers').doc(p.id), patch);
      written++;
    }
    await batch.commit();
  }
  const auditId = `backfill-perf-assessment-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await data.collection('be_admin_audit').doc(auditId).set({
    op: 'backfill-perf-assessment',
    scanned: { customers: custSnap.size, perfSessions: perfSessions.length },
    backfilled: plans.map((p) => ({ id: p.id, fromSession: p.fromSession, basis: p.basis, fields: Object.keys(p.perf) })),
    backfilledCount: written,
    skipped: skips,
    ambiguous: ambiguousList,
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`\n✓ APPLIED — ${written} customer(s) backfilled. audit: be_admin_audit/${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
