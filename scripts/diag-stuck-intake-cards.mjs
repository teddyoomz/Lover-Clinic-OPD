#!/usr/bin/env node
// Rule R diag (READ-ONLY) — size the AV198 class-of-bug: intake System cards
// stuck pending (no resolvable customerId) + whether a linked
// be_appointments.customerId (the booking-flow signal) WOULD resolve them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
  const db = getFirestore();

  const snap = await db.collection(`${BASE}/be_staff_chat_messages`).where('displayName', '==', 'ระบบ').get();
  const intake = snap.docs.filter(d => d.data().system?.kind === 'intake');
  console.log(`ระบบ cards=${snap.size}, intake=${intake.length}\n`);

  let alreadyHasCustomerId = 0, kioskResolves = 0, bookingFlowStuck = 0, stuckSessionGone = 0, trulyUnresolvable = 0;
  for (const d of intake) {
    const sys = d.data().system || {};
    const sid = sys.sessionId;
    if (sys.customerId) { alreadyHasCustomerId++; continue; }
    const sess = sid ? await db.doc(`${BASE}/opd_sessions/${sid}`).get() : null;
    const broker = sess && sess.exists ? sess.data().brokerProClinicId : null;
    const sessionGone = !sess || !sess.exists;
    let apptCid = null;
    if (sid) {
      const aq = await db.collection(`${BASE}/be_appointments`).where('linkedOpdSessionId', '==', sid).limit(1).get();
      apptCid = aq.empty ? null : (aq.docs[0].data().customerId || null);
    }
    if (broker) { kioskResolves++; }
    else if (apptCid) {
      bookingFlowStuck++; if (sessionGone) stuckSessionGone++;
      console.log(`  STUCK→FIXABLE  card=${d.id} name="${sys.nameSnapshot}" session=${sid} sessionGone=${sessionGone} apptCustomerId=${apptCid}`);
    } else {
      trulyUnresolvable++;
      console.log(`  UNRESOLVABLE   card=${d.id} name="${sys.nameSnapshot}" session=${sid} sessionGone=${sessionGone} broker=${broker} apptCid=${apptCid}`);
    }
  }
  console.log(`\nintake: alreadyResolved=${alreadyHasCustomerId} · kiosk-broker-resolves=${kioskResolves} · booking-flow-stuck(appt resolves)=${bookingFlowStuck} (session-deleted=${stuckSessionGone}) · trulyUnresolvable=${trulyUnresolvable}`);
  console.log('\nVERDICT: booking-flow-stuck = class-of-bug size; appt.customerId (via linkedOpdSessionId) is the universal fix signal; the appointment persists → the fix heals existing cards live (no data migration).');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
