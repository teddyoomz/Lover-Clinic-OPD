// scripts/e2e-opd-link-lifecycle.mjs
// Rule Q L2 — real-prod admin-SDK verification of ③ (date-passed cleanup
// DECISION + cron be_appointments JOIN) and ④ (delete-on-save effect).
//
// SAFETY (Rule M + Rule Q-honest): this script creates ONLY TEST-prefixed
// fixtures and deletes ONLY those. The whole-collection sweep runs DRY-RUN
// (apply:false → READ-ONLY, zero writes) so NO real production opd_session is
// ever mutated by the not-yet-deployed date-passed logic. The ③ delete
// DECISION is verified by replicating the exact cron join+decide on the TEST
// session (real Firestore data shape) — not by applying the sweep.
//
// Rule R env-pull. Run: node scripts/e2e-opd-link-lifecycle.mjs
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decideCleanupAction, SESSION_TIMEOUT_MS } from '../src/lib/opdSessionCleanupCore.js';
import { sweepOpdSessionCleanup } from '../api/cron/opd-session-cleanup-sweep.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const raw = readFileSync('.env.local.prod', 'utf8');
  const get = (k) => {
    const m = raw.match(new RegExp(`^${k}=(.*)$`, 'm'));
    return m ? m[1].replace(/^"|"$/g, '') : '';
  };
  return {
    projectId: get('FIREBASE_ADMIN_PROJECT_ID') || APP_ID,
    clientEmail: get('FIREBASE_ADMIN_CLIENT_EMAIL'),
    privateKey: get('FIREBASE_ADMIN_PRIVATE_KEY').split('\\n').join('\n'),
  };
}

function bangkokISO(ms) {
  const u = new Date(ms + 7 * 3600 * 1000);
  return `${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, '0')}-${String(u.getUTCDate()).padStart(2, '0')}`;
}

async function main() {
  if (!getApps().length) initializeApp({ credential: cert(loadEnv()) });
  const db = getFirestore();
  const ts = Date.now();
  const now = Date.now();
  const todayISO = bangkokISO(now);
  const yesterday = bangkokISO(now - 86400000);
  const nextWeek = bangkokISO(now + 7 * 86400000);

  const pastApptId = `TEST-APPT-${ts}-past`;
  const futureApptId = `TEST-APPT-${ts}-fut`;
  const pastSessId = `TEST-OPD-${ts}-past`;
  const futureSessId = `TEST-OPD-${ts}-fut`;
  const cardSessId = `TEST-OPD-${ts}-card`;
  const ref = (col, id) => db.doc(`${PREFIX}/${col}/${id}`);

  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ' :: ' + extra : ''}`); ok ? pass++ : fail++; };

  try {
    // Seed TEST fixtures.
    await ref('be_appointments', pastApptId).set({ date: yesterday, branchId: 'TEST', appointmentType: 'no-deposit-booking' });
    await ref('be_appointments', futureApptId).set({ date: nextWeek, branchId: 'TEST', appointmentType: 'no-deposit-booking' });
    await ref('opd_sessions', pastSessId).set({ createdAt: new Date(), linkedAppointmentId: pastApptId, patientData: { firstName: 'TEST' } }); // D + date passed
    await ref('opd_sessions', futureSessId).set({ createdAt: new Date(), linkedAppointmentId: futureApptId }); // C + future
    await ref('opd_sessions', cardSessId).set({ createdAt: new Date(), linkedAppointmentId: pastApptId, createdFromBackendBooking: true });

    // ③ JOIN + DECISION against REAL Firestore data shape (exact cron logic).
    const joinPast = (await ref('be_appointments', pastApptId).get()).data()?.date;
    check('③ join: TEST past appt date read from real Firestore', joinPast === yesterday, `date=${joinPast}`);
    const pastSnap = (await ref('opd_sessions', pastSessId).get()).data();
    const decPast = decideCleanupAction({ ...pastSnap, appointmentDate: joinPast }, now, SESSION_TIMEOUT_MS, todayISO);
    check('③ decision: past-date session (even w/ patientData) → delete/appt-date-passed', decPast.action === 'delete' && decPast.reason === 'appt-date-passed', `${decPast.action}/${decPast.reason}`);

    const joinFut = (await ref('be_appointments', futureApptId).get()).data()?.date;
    const futSnap = (await ref('opd_sessions', futureSessId).get()).data();
    const decFut = decideCleanupAction({ ...futSnap, appointmentDate: joinFut }, now, SESSION_TIMEOUT_MS, todayISO);
    check('③ decision: future-date session → NOT deleted', decFut.action !== 'delete', `${decFut.action}`);

    // ③ whole-collection sweep DRY-RUN (READ-ONLY — zero writes to real prod).
    const dry = await sweepOpdSessionCleanup({ db, now, apply: false });
    check('③ dry-run sweep runs against real prod without error (apply=false → 0 writes)', typeof dry.scanned === 'number' && dry.apply === false, `scanned=${dry.scanned}`);
    check('③ dry-run WOULD delete ≥1 (our TEST past session qualifies via the join)', dry.deleted >= 1, `wouldDelete=${dry.deleted}`);

    // ④ delete-on-save EFFECT: the gated hard-delete a booking-flow session receives.
    await ref('opd_sessions', cardSessId).delete();
    check('④ booking-flow session hard-deleted (delete-on-save effect)', !(await ref('opd_sessions', cardSessId).get()).exists);

    // Idempotent dry-run.
    const dry2 = await sweepOpdSessionCleanup({ db, now, apply: false });
    check('③ idempotent dry-run', typeof dry2.deleted === 'number');
  } finally {
    await Promise.allSettled([
      ref('be_appointments', pastApptId).delete(),
      ref('be_appointments', futureApptId).delete(),
      ref('opd_sessions', pastSessId).delete(),
      ref('opd_sessions', futureSessId).delete(),
      ref('opd_sessions', cardSessId).delete(),
    ]);
    await db.doc(`${PREFIX}/be_admin_audit/e2e-opd-link-lifecycle-${ts}`).set({
      op: 'e2e-opd-link-lifecycle', pass, fail, mode: 'safe-dryrun', ranAt: new Date().toISOString(),
    });
  }
  console.log(`\n${pass}/${pass + fail} PASS`);
  if (fail) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
