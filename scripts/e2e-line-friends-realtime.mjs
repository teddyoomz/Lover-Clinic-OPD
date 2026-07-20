// Rule Q L2 — LINE Friend Picker realtime + bind e2e vs REAL prod Firestore.
//
// Modes:
//   node scripts/e2e-line-friends-realtime.mjs              (PRE-RULES mode —
//     before `firebase deploy --only firestore:rules`: client READ of
//     be_line_friends must be DENIED (default-deny still intact) and the
//     client-listener realtime proof runs at the ADMIN-SDK layer only)
//   node scripts/e2e-line-friends-realtime.mjs --full       (POST-DEPLOY mode —
//     client staff listener realtime proof (the EXACT picker query) + client
//     write DENIED + live HTTP endpoint list/bind via a minted admin token)
//
// Phases:
//   A  realtime — listener on where('branchId','==',TEST_BR) sees an admin
//      write arrive live (≤5s) + an unfollow merge arrive live.
//        pre-rules: admin-SDK listener (Firestore delivery proof)
//        --full:    CLIENT-SDK staff listener (the real picker path)
//   B  security — client write DENIED always; client read DENIED pre-rules /
//      ALLOWED post-deploy.
//   C  bind — REAL handleBind code (imported from api/admin/line-friends.js)
//      on TEST- customers: happy path (customer fields + byBranch map + audit
//      doc verified by read-back) + collision guard (2nd customer → Thai error,
//      zero writes).
//   D  follow-capture write path — decideFollowEventUpdate (REAL helper) +
//      real admin set on the TEST- doc: new-follow → unfollow → re-follow
//      converge correctly on real Firestore. (Full webhook HTTP path needs a
//      signed LINE event — covered by W1-W6 source-grep + user L1 post-deploy.)
//   E  cleanup — every TEST- fixture + audit doc deleted; zero-orphan verify.
//
// TEST- prefix discipline (V33.10). Read paths canonical (Rule M/R).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuthFn } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, collection as ccol, query as cquery, where as cwhere,
  onSnapshot, doc as cdoc, setDoc as csetDoc, getDocs,
} from 'firebase/firestore';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { decideFollowEventUpdate } from '../src/lib/lineFriendRoster.js';
import { handleBind } from '../api/admin/line-friends.js';

const FULL = process.argv.includes('--full');
const APP_ID = 'loverclinic-opd-4c39b';
const TEST_BR = 'TEST-BR-LINEFRIENDS';
const U1 = 'TEST-U-LF-REALTIME-1';
const CUST_A = 'TEST-LF-CUST-A';
const CUST_B = 'TEST-LF-CUST-B';
const BIND_U = 'TEST-U-LF-BIND-1';

const env = Object.fromEntries(readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));

const firebaseConfig = {
  apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20',
  authDomain: 'loverclinic-opd-4c39b.firebaseapp.com',
  projectId: APP_ID,
  storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app',
  messagingSenderId: '653911776503',
  appId: '1:653911776503:web:9e23f723d3ed877962c7f2',
};

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms: ${label}`)), ms)),
]);

if (!adminApps().length) adminInit({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const adb = adminFirestore();
const P = `artifacts/${APP_ID}/public/data`;
const friendDocPath = (uid) => `${P}/be_line_friends/${TEST_BR}_${uid}`;

function waitForSnapshot(subscribe, predicate, label, ms = 8000) {
  return withTimeout(new Promise((resolve, reject) => {
    const unsub = subscribe((rows) => {
      if (predicate(rows)) { unsub(); resolve(rows); }
    }, (err) => { reject(err); });
  }), ms, label);
}

async function main() {
  console.log(`\n═══ LINE Friends L2 e2e (${FULL ? 'FULL post-deploy' : 'PRE-RULES'} mode) vs REAL prod ═══`);

  // ── Phase A — realtime delivery on the EXACT picker query ─────────────────
  console.log('\n[A] realtime — listener sees admin writes arrive live…');
  const nowIso = new Date().toISOString();

  if (FULL) {
    const staffToken = await adminAuthFn().createCustomToken('L2-LINEFRIENDS-STAFF', { isClinicStaff: true });
    const capp = initializeApp(firebaseConfig, 'lf-client');
    const cdb = initializeFirestore(capp, { experimentalAutoDetectLongPolling: true });
    const cauth = getAuth(capp);
    await withTimeout(signInWithCustomToken(cauth, staffToken), 15000, 'staff sign-in');
    console.log('    staff client signed in (isClinicStaff custom token)');
    const subscribe = (onRows, onErr) => onSnapshot(
      cquery(ccol(cdb, 'artifacts', APP_ID, 'public', 'data', 'be_line_friends'), cwhere('branchId', '==', TEST_BR)),
      (snap) => onRows(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      onErr,
    );
    const arrival = waitForSnapshot(subscribe, rows => rows.some(r => r.lineUserId === U1), 'CLIENT listener sees new friend');
    await new Promise(r => setTimeout(r, 800)); // listener registered first — the real "modal open ค้างไว้" scenario
    const { fields } = decideFollowEventUpdate({ eventType: 'follow', userId: U1, existing: null, profile: { displayName: 'TEST เรียลไทม์', pictureUrl: '' }, branchId: TEST_BR, branchIdSource: 'webhook-line', nowIso });
    const t0 = Date.now();
    await adb.doc(friendDocPath(U1)).set({ lineUserId: U1, ...fields }, { merge: true });
    const rows = await arrival;
    ok(true, `CLIENT staff listener saw the friend arrive LIVE in ${Date.now() - t0}ms (no refresh)`);
    ok(rows.find(r => r.lineUserId === U1)?.displayName === 'TEST เรียลไทม์', 'displayName correct on the live row');

    const unfollowArrival = waitForSnapshot(subscribe, rows2 => !!rows2.find(r => r.lineUserId === U1)?.unfollowedAt, 'CLIENT listener sees unfollow merge');
    const upd = decideFollowEventUpdate({ eventType: 'unfollow', userId: U1, existing: fields, profile: null, branchId: TEST_BR, branchIdSource: 'webhook-line', nowIso: new Date().toISOString() });
    await adb.doc(friendDocPath(U1)).set({ lineUserId: U1, ...upd.fields }, { merge: true });
    await unfollowArrival;
    ok(true, 'CLIENT listener saw the unfollow merge arrive LIVE');
  } else {
    // PRE-RULES: prove Firestore realtime delivery at the admin layer; the
    // client-permission path is deferred to --full (rules not deployed yet).
    const subscribe = (onRows, onErr) => adb.collection(`${P}/be_line_friends`).where('branchId', '==', TEST_BR)
      .onSnapshot((snap) => onRows(snap.docs.map(d => ({ ...d.data(), id: d.id }))), onErr);
    const arrival = waitForSnapshot(subscribe, rows => rows.some(r => r.lineUserId === U1), 'ADMIN listener sees new friend');
    await new Promise(r => setTimeout(r, 800));
    const { fields } = decideFollowEventUpdate({ eventType: 'follow', userId: U1, existing: null, profile: { displayName: 'TEST เรียลไทม์', pictureUrl: '' }, branchId: TEST_BR, branchIdSource: 'webhook-line', nowIso });
    const t0 = Date.now();
    await adb.doc(friendDocPath(U1)).set({ lineUserId: U1, ...fields }, { merge: true });
    await arrival;
    ok(true, `ADMIN-layer listener saw the friend arrive LIVE in ${Date.now() - t0}ms (client-path proof = --full post-deploy)`);
  }

  // ── Phase B — security ────────────────────────────────────────────────────
  console.log('\n[B] security — client write always DENIED; read per-mode…');
  {
    const bapp = initializeApp(firebaseConfig, 'lf-sec');
    const bdb = initializeFirestore(bapp, { experimentalAutoDetectLongPolling: true });
    const bauth = getAuth(bapp);
    const staffToken = await adminAuthFn().createCustomToken('L2-LINEFRIENDS-SEC', { isClinicStaff: true });
    await withTimeout(signInWithCustomToken(bauth, staffToken), 15000, 'sec staff sign-in');
    let writeDenied = false;
    try {
      await withTimeout(csetDoc(cdoc(bdb, 'artifacts', APP_ID, 'public', 'data', 'be_line_friends', `${TEST_BR}_FORGE`), { lineUserId: 'FORGE', branchId: TEST_BR }), 15000, 'client forge write');
    } catch (e) { writeDenied = /permission|denied|insufficient/i.test(String(e?.code || e?.message || e)); }
    ok(writeDenied, 'STAFF client write to be_line_friends → DENIED (write: if false)');

    let readOutcome = 'allowed';
    try {
      await withTimeout(getDocs(cquery(ccol(bdb, 'artifacts', APP_ID, 'public', 'data', 'be_line_friends'), cwhere('branchId', '==', TEST_BR))), 15000, 'client read');
    } catch (e) { readOutcome = /permission|denied|insufficient/i.test(String(e?.code || e?.message || e)) ? 'denied' : `error:${e?.message}`; }
    if (FULL) ok(readOutcome === 'allowed', `STAFF client read → ALLOWED post-deploy (got: ${readOutcome})`);
    else ok(readOutcome === 'denied', `STAFF client read → DENIED pre-rules (default-deny intact; got: ${readOutcome})`);
  }

  // ── Phase C — REAL handleBind on TEST- customers ──────────────────────────
  console.log('\n[C] bind — REAL handleBind code vs real prod…');
  await adb.doc(`${P}/be_customers/${CUST_A}`).set({ customerId: CUST_A, customerName: 'TEST ลูกค้าเอ (LF)', branchId: TEST_BR, createdAt: nowIso, isTestFixture: true });
  await adb.doc(`${P}/be_customers/${CUST_B}`).set({ customerId: CUST_B, customerName: 'TEST ลูกค้าบี (LF)', branchId: TEST_BR, createdAt: nowIso, isTestFixture: true });

  const bindRes = await handleBind({ db: adb, customerId: CUST_A, lineUserId: BIND_U, branchId: TEST_BR, displayName: 'TEST ไลน์เอ', callerUid: 'L2-e2e' });
  ok(bindRes.status === 'bound' && !!bindRes.auditId, `bind returned bound + auditId (${bindRes.auditId})`);
  const custA = (await adb.doc(`${P}/be_customers/${CUST_A}`).get()).data();
  ok(custA.lineUserId === BIND_U, 'customer.lineUserId written');
  ok(!!custA.lineLinkedAt, 'customer.lineLinkedAt stamped');
  ok(custA.lineDisplayName === 'TEST ไลน์เอ', 'customer.lineDisplayName written');
  ok(custA.lineUserId_byBranch?.[TEST_BR]?.lineUserId === BIND_U, 'lineUserId_byBranch map written (dotted-path)');
  ok(custA.lineUserId_byBranch?.[TEST_BR]?._lineStale === false, 'byBranch._lineStale=false');
  const auditSnap = await adb.doc(`${P}/be_admin_audit/${bindRes.auditId}`).get();
  ok(auditSnap.exists && auditSnap.data().action === 'line-friend-bind' && auditSnap.data().customerId === CUST_A, 'audit doc verified by read-back');

  let collisionMsg = '';
  try {
    await handleBind({ db: adb, customerId: CUST_B, lineUserId: BIND_U, branchId: TEST_BR, displayName: 'X', callerUid: 'L2-e2e' });
  } catch (e) { collisionMsg = String(e?.message || e); }
  ok(collisionMsg.includes('ถูกผูกกับลูกค้าอื่นแล้ว'), `collision guard threw Thai error ("${collisionMsg}")`);
  const custB = (await adb.doc(`${P}/be_customers/${CUST_B}`).get()).data();
  ok(!custB.lineUserId, 'collision → ZERO writes on the second customer');

  // ── Phase C2 (--full) — LIVE HTTP endpoint with a real admin idToken ──────
  if (FULL) {
    console.log('\n[C2] live HTTP endpoint (deployed) — list + auth…');
    const adminToken = await adminAuthFn().createCustomToken('L2-LINEFRIENDS-ADMIN', { admin: true });
    const capp2 = initializeApp(firebaseConfig, 'lf-http');
    const cauth2 = getAuth(capp2);
    const cred = await withTimeout(signInWithCustomToken(cauth2, adminToken), 15000, 'admin sign-in');
    const idToken = await cred.user.getIdToken();
    const res = await fetch('https://lover-clinic-app.vercel.app/api/admin/line-friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'list', branchId: TEST_BR }),
    });
    const body = await res.json().catch(() => null);
    ok(res.status === 200 && (body?.followersApi === 'unavailable' || body?.followersApi === 'ok'),
      `live endpoint list → 200 followersApi=${body?.followersApi} (TEST branch has no LINE token → unavailable expected)`);
    const anonRes = await fetch('https://lover-clinic-app.vercel.app/api/admin/line-friends', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', branchId: TEST_BR }),
    });
    ok(anonRes.status === 401 || anonRes.status === 403, `live endpoint without token → ${anonRes.status} (gate holds)`);
  }

  // ── Phase D — follow-capture write path on real Firestore ─────────────────
  console.log('\n[D] follow lifecycle on real Firestore (REAL decide helper)…');
  const U2 = 'TEST-U-LF-LIFECYCLE-1';
  const write = async (eventType, profile) => {
    const existingSnap = await adb.doc(friendDocPath(U2)).get();
    const { fields } = decideFollowEventUpdate({
      eventType, userId: U2, existing: existingSnap.exists ? existingSnap.data() : null,
      profile, branchId: TEST_BR, branchIdSource: 'webhook-line', nowIso: new Date().toISOString(),
    });
    await adb.doc(friendDocPath(U2)).set({ lineUserId: U2, ...fields }, { merge: true });
    return (await adb.doc(friendDocPath(U2)).get()).data();
  };
  const d1 = await write('follow', { displayName: 'TEST ไลฟ์ไซเคิล', pictureUrl: '' });
  ok(d1.followedAt && d1.unfollowedAt === null && d1.displayName === 'TEST ไลฟ์ไซเคิล', 'new follow doc correct on real Firestore');
  const d2 = await write('unfollow', null);
  ok(!!d2.unfollowedAt && d2.displayName === 'TEST ไลฟ์ไซเคิล', 'unfollow merge kept name (soft flag only)');
  const d3 = await write('follow', { displayName: 'TEST ชื่อใหม่', pictureUrl: '' });
  ok(d3.unfollowedAt === null && d3.displayName === 'TEST ชื่อใหม่', 're-follow cleared flag + refreshed name');

  // ── Phase E — cleanup + zero-orphan verify ────────────────────────────────
  console.log('\n[E] cleanup…');
  const deletions = [
    friendDocPath(U1), friendDocPath(U2),
    `${P}/be_customers/${CUST_A}`, `${P}/be_customers/${CUST_B}`,
    `${P}/be_admin_audit/${bindRes.auditId}`,
  ];
  for (const p of deletions) await adb.doc(p).delete();
  const orphanFriends = await adb.collection(`${P}/be_line_friends`).where('branchId', '==', TEST_BR).get();
  const orphanCust = await Promise.all([CUST_A, CUST_B].map(id => adb.doc(`${P}/be_customers/${id}`).get()));
  ok(orphanFriends.empty && orphanCust.every(s => !s.exists), 'zero TEST- orphans remain');

  console.log(`\n═══ RESULT: PASS ${pass} / FAIL ${fail} ═══`);
  if (!FULL) console.log('NOTE: client-listener + client-read-allowed + live-HTTP proofs require --full AFTER the rules deploy.');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
