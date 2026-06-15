// e2e-ed-followup-v2.mjs — Rule Q L2 (REAL prod, admin SDK, TEST-prefixed).
// Verifies the ED follow-up v2 behaviors on real Firestore:
//   R3 — supersedePendingFollowups: the EXACT single-field query
//        where('linkedCustomerId','==',cid) + the shouldSupersedeSession filter
//        deletes ONLY the matching pending follow-up session + its linked pending
//        round; completed / other-branch / other-customer survive.
//   R1 — confirmInfo round-trips on the opd_session doc (anon-readable snapshot).
//   submit→materialize — a customer submit with NO assessmentDate materializes a
//        round dated today (R4 "วันนี้" path).
//
// Single-field equality query (linkedCustomerId) is admin/client-SDK equivalent
// (no composite index) → admin SDK is a faithful L2 here. The pure
// shouldSupersedeSession predicate is unit-tested (ed-confirm-and-date-helpers);
// this script re-implements the same filter to exercise it on REAL prod data.
// READ-ONLY against existing data; writes ONLY TEST-prefixed docs (Rule M).
// Usage: node scripts/e2e-ed-followup-v2.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, FieldValue } from 'firebase-admin/firestore';
import { deriveRounds } from '../src/lib/assessmentRoundsCore.js';
import { formatRoundDate } from '../src/lib/edScoreDisplay.js';
import materialize from '../functions/assessmentMaterialize.js';
const { buildAssessmentRoundPatch } = materialize;

const APP_ID = 'loverclinic-opd-4c39b';
const TODAY = '2026-06-16';

function loadEnv() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const o = {}; for (const l of txt.split(/\r?\n/)) { if (!l || l.startsWith('#')) continue; const i = l.indexOf('='); if (i < 0) continue; o[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ''); } return o; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const e = loadEnv(); adminInit({ credential: cert({ projectId: e.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: e.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (e.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const data = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const opdCol = (db) => data(db).collection('opd_sessions');
const asmtCol = (db) => data(db).collection('be_assessments');

// Mirror of src/lib/backendClient.js shouldSupersedeSession (unit-tested there).
const shouldSupersede = (s, cid, branch) => !!s
  && String(s.linkedCustomerId || '') === String(cid || '')
  && String(s.branchId || '') === String(branch || '')
  && String(s.formType || '').startsWith('followup')
  && s.status !== 'completed';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };

async function main() {
  const db = initAdmin();
  const r = randomBytes(4).toString('hex');
  const cid = `TEST-EDFWV2-${r}`;
  const other = `TEST-EDFWV2-OTHER-${r}`;
  const BR_A = 'TEST-BR-A', BR_B = 'TEST-BR-B';
  const made = { sessions: [], rounds: [] };
  const mkRound = async (id, customerId, status) => { await asmtCol(db).doc(id).set({ customerId, types: ['adam'], status, scores: {}, rawAnswers: status === 'completed' ? { adam_1: true } : {}, assessmentDate: '', createdAt: FieldValue.serverTimestamp() }); made.rounds.push(id); return id; };
  const mkSession = async (id, customerId, branchId, status, roundId, confirmInfo) => { await opdCol(db).doc(id).set({ status, formType: 'followup_assessment', types: ['adam'], branchId, linkedCustomerId: customerId, linkedAssessmentRoundId: roundId || '', patientData: status === 'completed' ? { adam_1: true } : null, confirmInfo: confirmInfo || null, createdAt: FieldValue.serverTimestamp(), isPermanent: false }); made.sessions.push(id); return id; };

  console.log(`═══ e2e-ed-followup-v2 — REAL prod, cid ${cid} ═══`);
  try {
    // ─── Phase A — R3 supersede selectivity ───
    const rPending = await mkRound(`TEST-ASMT-${r}-1`, cid, 'pending');
    const sPending = await mkSession(`FW-ED-TEST-${r}-1`, cid, BR_A, 'pending', rPending);
    const sCompleted = await mkSession(`FW-ED-TEST-${r}-done`, cid, BR_A, 'completed', '');
    const rOB = await mkRound(`TEST-ASMT-${r}-ob`, cid, 'pending');
    const sOB = await mkSession(`FW-ED-TEST-${r}-ob`, cid, BR_B, 'pending', rOB);    // other BRANCH
    const rOC = await mkRound(`TEST-ASMT-${r}-oc`, other, 'pending');
    const sOC = await mkSession(`FW-ED-TEST-${r}-oc`, other, BR_A, 'pending', rOC);  // other CUSTOMER

    // run the supersede mirror for (cid, BR_A) — EXACT single-field query
    const snap = await opdCol(db).where('linkedCustomerId', '==', cid).get();
    let superseded = 0;
    for (const d of snap.docs) {
      const s = d.data();
      if (!shouldSupersede(s, cid, BR_A)) continue;
      if (s.linkedAssessmentRoundId) await asmtCol(db).doc(s.linkedAssessmentRoundId).delete();
      await d.ref.delete(); superseded += 1;
    }
    ok(superseded === 1, `supersede deleted exactly 1 (got ${superseded})`);
    ok(!(await opdCol(db).doc(sPending).get()).exists, 'matching pending session DELETED');
    ok(!(await asmtCol(db).doc(rPending).get()).exists, 'its linked pending round DELETED');
    ok((await opdCol(db).doc(sCompleted).get()).exists, 'completed session SURVIVES (already materialized)');
    ok((await opdCol(db).doc(sOB).get()).exists, 'other-branch pending session SURVIVES');
    ok((await asmtCol(db).doc(rOB).get()).exists, 'other-branch round SURVIVES');
    ok((await opdCol(db).doc(sOC).get()).exists, 'other-customer session SURVIVES (not even in query)');

    // ─── Phase B — R1 confirmInfo round-trip ───
    const sCI = await mkSession(`FW-ED-TEST-${r}-ci`, cid, BR_A, 'pending', '', { name: 'นาย ทดสอบ ระบบ', age: '49', phoneMasked: '087-•••-7289' });
    const ci = (await opdCol(db).doc(sCI).get()).data().confirmInfo;
    ok(ci && ci.name === 'นาย ทดสอบ ระบบ' && ci.phoneMasked === '087-•••-7289' && ci.age === '49', 'confirmInfo snapshot round-trips on the session doc');

    // ─── Phase C — submit (no assessmentDate) → materialize → round dated TODAY ───
    const rFill = await mkRound(`TEST-ASMT-${r}-fill`, cid, 'pending');
    await opdCol(db).doc(sCI).update({ status: 'completed', patientData: { adam_1: true, adam_2: true, adam_3: true } });
    const filledSession = (await opdCol(db).doc(sCI).get()).data();
    const patch = buildAssessmentRoundPatch(filledSession, TODAY);
    ok(patch && patch.status === 'completed' && patch.assessmentDate === TODAY, 'materialize → completed + assessmentDate=TODAY (submit had none)');
    await asmtCol(db).doc(rFill).set(patch, { merge: true });
    const filledRound = (await asmtCol(db).doc(rFill).get()).data();
    const rounds = deriveRounds({ adam_1: true, assessmentDate: '2026-05-20' }, [{ ...filledRound, id: rFill }]);
    ok(rounds.length === 2 && rounds[1].round === 2, 'materialized round ranks as round 2');
    ok(formatRoundDate(rounds[1].assessmentDate, TODAY).isToday === true, 'R4: round dated TODAY → "วันนี้" badge fires');
    ok(formatRoundDate(rounds[0].assessmentDate, TODAY).text === '20/05/2569', 'R4: intake round shows admission date 20/05/2569');

    // ─── audit ───
    const auditId = `e2e-ed-followup-v2-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await data(db).collection('be_admin_audit').doc(auditId).set({ op: 'e2e-ed-followup-v2', cid, pass, fail, ranAt: FieldValue.serverTimestamp() });
    console.log(`  audit: be_admin_audit/${auditId}`);
  } catch (e) { fail++; console.error('  ✗ THREW:', e); }

  // ─── cleanup + zero-orphan check ───
  for (const id of made.sessions) { try { await opdCol(db).doc(id).delete(); } catch {} }
  for (const id of made.rounds) { try { await asmtCol(db).doc(id).delete(); } catch {} }
  const orphanS = await opdCol(db).where('linkedCustomerId', 'in', [cid, other]).get();
  const orphanR1 = await asmtCol(db).where('customerId', '==', cid).get();
  const orphanR2 = await asmtCol(db).where('customerId', '==', other).get();
  ok(orphanS.empty && orphanR1.empty && orphanR2.empty, `cleanup: zero TEST orphans (sessions ${orphanS.size}, rounds ${orphanR1.size + orphanR2.size})`);

  console.log(`\n═══ PASS ${pass} · FAIL ${fail} ═══`);
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
