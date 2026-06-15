// e2e-ed-assessment.mjs — Rule Q L2 (REAL prod, admin SDK, TEST-prefixed).
// Verifies the be_assessments round-trip + materialize durability on real
// Firestore: write pending round → read back → apply CF materialize patch →
// read back → scores derive correctly (via the REAL display helpers) →
// deriveRounds ranks it round 2 → delete → renumber. Cleanup + audit doc.
//
// READ-ONLY against existing data; writes ONLY TEST-prefixed docs (Rule M).
// Usage: node scripts/e2e-ed-assessment.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';
import { deriveRounds, nextRoundNumber, latestRounds } from '../src/lib/assessmentRoundsCore.js';
import { scoreForType } from '../src/lib/edScoreDisplay.js';
import materialize from '../functions/assessmentMaterialize.js';
const { buildAssessmentRoundPatch } = materialize;

const APP_ID = 'loverclinic-opd-4c39b';
function loadEnv() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const o = {}; for (const l of txt.split(/\r?\n/)) { if (!l || l.startsWith('#')) continue; const i = l.indexOf('='); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ''); } return o; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const e = loadEnv(); adminInit({ credential: cert({ projectId: e.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: e.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (e.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const col = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('be_assessments');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };

async function main() {
  const db = initAdmin();
  const c = col(db);
  const custId = `TEST-ED-${Date.now()}`;
  const roundId = `TEST-ASMT-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const intakePerf = { adam_1: true, adam_2: true, adam_3: true, adam_6: true, assessmentDate: '2026-05-20' };
  console.log(`═══ e2e-ed-assessment — REAL prod, customer ${custId} ═══`);

  try {
    // 1. write a PENDING round (what EDFollowupModal does)
    await c.doc(roundId).set({
      customerId: custId, types: ['adam', 'iief'], status: 'pending', scores: {}, rawAnswers: {},
      assessmentDate: '', linkedSessionId: 'TEST-FW-ED', expiresAt: Date.now() + 86400000,
      createdBy: 'e2e', createdAt: FieldValue.serverTimestamp(),
    });
    let snap = (await c.doc(roundId).get()).data();
    ok(snap && snap.status === 'pending', 'pending round written + read back');

    // 2. deriveRounds: pending is NOT a round yet
    const beForFill = [{ ...snap, id: roundId }];
    ok(deriveRounds(intakePerf, beForFill).length === 1, 'pending excluded — only intake counts');
    ok(nextRoundNumber(intakePerf, beForFill) === 2, 'next round = 2 (pending does not bump)');

    // 3. customer fills → CF materialize patch → write merge
    const session = { formType: 'followup_ed', linkedAssessmentRoundId: roundId,
      patientData: { adam_1: true, adam_3: true, adam_6: true, iief_1: '4', iief_2: '4', iief_3: '4', iief_4: '4', iief_5: '3', assessmentDate: '2026-06-14' } };
    const patch = buildAssessmentRoundPatch(session, '2026-06-15');
    await c.doc(roundId).set(patch, { merge: true });
    snap = (await c.doc(roundId).get()).data();
    ok(snap.status === 'completed', 'materialize → status completed (read back from prod)');
    ok(snap.assessmentDate === '2026-06-14', 'assessmentDate snapshotted');
    ok(snap.rawAnswers && snap.rawAnswers.iief_5 === '3', 'rawAnswers snapshotted (durable — survives session delete)');

    // 4. deriveRounds against the REAL prod doc → round 2 with correct derived scores
    const completed = [{ ...snap, id: roundId }];
    const rounds = deriveRounds(intakePerf, completed);
    ok(rounds.length === 2 && rounds[1].round === 2, 'completed round ranks as round 2');
    ok(scoreForType('adam', rounds[1].raw).value === 3, 'ADAM derives 3/10 from prod rawAnswers');
    ok(scoreForType('iief', rounds[1].raw).value === 19, 'IIEF derives 19/25 from prod rawAnswers');
    ok(latestRounds(intakePerf, completed, 2).map((r) => r.round).join() === '2,1', 'latest-2 newest-first');

    // 5. delete → renumber
    await c.doc(roundId).delete();
    ok(!(await c.doc(roundId).get()).exists, 'round deleted from prod');
    ok(nextRoundNumber(intakePerf, []) === 2, 'after delete: next reverts to 2 (no skip)');

    // 6. audit doc
    const auditId = `e2e-ed-assessment-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('be_admin_audit').doc(auditId)
      .set({ op: 'e2e-ed-assessment', customer: custId, roundId, pass, fail, ranAt: FieldValue.serverTimestamp() });
    console.log(`  audit: be_admin_audit/${auditId}`);
  } catch (e) { fail++; console.error('  ✗ THREW:', e); }

  console.log(`\n═══ PASS ${pass} · FAIL ${fail} ═══`);
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
