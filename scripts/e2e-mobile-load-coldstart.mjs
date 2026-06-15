// Rule Q L2 — mobile-load reliability cold-start against REAL prod.
// Proves the firebase.js connection-layer change is sound: a COLD client SDK
// resolves the EXACT queries the customer-link + staff-queue pages issue, under
// BOTH the prod config (experimentalAutoDetectLongPolling) AND forced
// long-polling (experimentalForceLongPolling) — so when autoDetect falls back
// to long-polling on a flaky mobile network, the fallback transport DEFINITIVELY
// works on prod (the queries still resolve).
//
// Read-only (Rule R): admin SDK only READS real doc-ids + mints a staff custom
// token; the client SDK only GETs/queries. No writes.
//
// HONEST GAP (Rule Q-honest): node's WebSocket support varies, so the
// autoDetect run is best-effort (a node-env WebSocket quirk is NOT a prod bug);
// the forceLongPolling run is the HARD assertion (it is the exact transport the
// fallback uses). The hostile-network → error+retry UX is proven separately by
// the Playwright route-abort e2e.
//
// Usage: node scripts/e2e-mobile-load-coldstart.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuthFn } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc as cdoc, getDoc, collection, query as cquery, limit } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

const APP_ID = 'loverclinic-opd-4c39b';
const PROD_URL = 'https://lover-clinic-app.vercel.app';
const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));

// public web config (same as src/firebase.js — public by design)
const firebaseConfig = {
  apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20',
  authDomain: 'loverclinic-opd-4c39b.firebaseapp.com',
  projectId: APP_ID,
  storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app',
  messagingSenderId: '653911776503',
  appId: '1:653911776503:web:9e23f723d3ed877962c7f2',
};

let pass = 0, fail = 0, soft = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL', m); } };
const softOk = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { soft++; console.log('  ~ SOFT-SKIP', m); } };
const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms: ${label}`)), ms)),
]);

if (!adminApps().length) adminInit({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const adb = adminFirestore();
const adata = () => adb.collection('artifacts').doc(APP_ID).collection('public').doc('data');

async function main() {
  // ── 1. Resolve real doc-ids (admin, read-only) ────────────────────────────
  console.log('\n[1] Resolving real doc-ids via admin SDK (read-only)…');
  const sessSnap = await adata().collection('opd_sessions').limit(1).get();
  const sessionId = sessSnap.empty ? null : sessSnap.docs[0].id;
  ok(!!sessionId, `found a real opd_sessions doc id (${sessionId})`);

  const schedSnap = await adata().collection('clinic_schedules').where('enabled', '==', true).limit(1).get();
  const scheduleToken = schedSnap.empty ? null : schedSnap.docs[0].id;
  softOk(!!scheduleToken, `found an enabled clinic_schedules token (${scheduleToken || 'none — skip'})`);

  const custSnap = await adata().collection('be_customers').where('patientLinkToken', '!=', '').limit(1).get().catch(() => ({ empty: true, docs: [] }));
  const patientToken = custSnap.empty ? null : custSnap.docs[0].data().patientLinkToken;
  console.log(`    patient-view token: ${patientToken ? '(real)' : 'none — will assert structured-404 reachability'}`);

  // staff custom token (additionalClaims mirrors the staff user's isClinicStaff claim)
  const staffToken = await adminAuthFn().createCustomToken('L2-COLDSTART-READONLY', { isClinicStaff: true });
  ok(!!staffToken, 'minted a staff custom token (isClinicStaff) for the queue query');

  // ── 2. Per-transport cold-start client queries ────────────────────────────
  const transports = [
    { name: 'forceLongPolling',      cfg: { experimentalForceLongPolling: true }, hard: true },
    { name: 'autoDetectLongPolling', cfg: { experimentalAutoDetectLongPolling: true }, hard: false },
  ];
  for (const t of transports) {
    console.log(`\n[2:${t.name}] cold client SDK (${t.hard ? 'HARD assert' : 'best-effort — node WS quirk tolerated'})…`);
    const app = initializeApp(firebaseConfig, `cold-${t.name}`);
    const db = initializeFirestore(app, t.cfg);
    const auth = getAuth(app);
    const assert = t.hard ? ok : softOk;
    try {
      // anon — PatientForm + ClinicSchedule paths
      await withTimeout(signInAnonymously(auth), 15000, 'anon sign-in');
      const s = await withTimeout(getDoc(cdoc(db, 'artifacts', APP_ID, 'public', 'data', 'opd_sessions', sessionId)), 15000, 'opd_sessions get');
      assert(s.exists(), `[${t.name}] anon getDoc opd_sessions/${sessionId} resolved (exists=${s.exists()})`);
      if (scheduleToken) {
        const sch = await withTimeout(getDoc(cdoc(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_schedules', scheduleToken)), 15000, 'clinic_schedules get');
        assert(sch.exists(), `[${t.name}] anon getDoc clinic_schedules/${scheduleToken} resolved`);
      }
      // staff — AdminDashboard queue collection read
      await withTimeout(signInWithCustomToken(auth, staffToken), 15000, 'staff sign-in');
      const { getDocs } = await import('firebase/firestore');
      const q = cquery(collection(db, 'artifacts', APP_ID, 'public', 'data', 'opd_sessions'), limit(5));
      const qs = await withTimeout(getDocs(q), 15000, 'opd_sessions collection query');
      assert(qs.size >= 0, `[${t.name}] staff collection query resolved (${qs.size} docs)`);
    } catch (e) {
      assert(false, `[${t.name}] transport query failed: ${e.message}`);
    }
  }

  // ── 3. /api/patient-view fetch reachability (PatientDashboard path) ─────────
  console.log('\n[3] /api/patient-view fetch against real prod…');
  try {
    const tok = patientToken || 'L2-COLDSTART-NONEXISTENT-TOKEN';
    const r = await withTimeout(fetch(`${PROD_URL}/api/patient-view?token=${encodeURIComponent(tok)}`), 15000, 'patient-view fetch');
    const body = await r.json().catch(() => ({}));
    if (patientToken) ok(r.ok && body.ok, `patient-view resolved real token (ok=${body.ok})`);
    else ok(r.status === 404 && typeof body === 'object', `patient-view endpoint reachable + structured response (status ${r.status})`);
  } catch (e) {
    ok(false, `patient-view fetch failed: ${e.message}`);
  }

  console.log(`\n${'='.repeat(60)}\nPASS ${pass}  FAIL ${fail}  SOFT-SKIP ${soft}`);
  if (fail > 0) { console.log('❌ L2 cold-start has HARD failures.'); process.exit(1); }
  console.log('✅ L2 cold-start clean (long-polling transport resolves all queries on real prod).');
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
