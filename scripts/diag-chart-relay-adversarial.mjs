// scripts/diag-chart-relay-adversarial.mjs
// Rule Q V66 + Rule R/S — REAL client-SDK adversarial probe of the tablet chart relay.
//
// ANTI-CHEAT (the whole point): rules + index + persisted-data shape are verified via the REAL
// CLIENT SDK (@firebase/*), NOT the admin SDK — because admin BYPASSES storage.rules + composite
// indexes (that exact blind spot was the §followup-2 bug + V66). Admin SDK is used ONLY to:
//   (a) mint a clinic-staff custom token → client signInWithCustomToken (Rule Q L2 — minting a
//       token is NOT bypassing rules; the client then runs FULLY under the rules),
//   (b) READ be_treatments DATA SHAPE (T1 — read-only diagnosis, Rule R),
//   (c) clean up TEST- fixtures reliably.
// Everything that asserts a RULE / INDEX outcome runs through the client SDK. TEST-prefixed only;
// no real patient data is written or mutated.
//
// Reads .env.local.prod (Rule R). Run:  node scripts/diag-chart-relay-adversarial.mjs
import { readFileSync } from 'node:fs';
import { initializeApp as adminInit, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { getStorage, ref as sRef, uploadString } from 'firebase/storage';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';
const P = `artifacts/${APP_ID}/public/data`;
const STAMP = Date.now();
const cfg = { apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20', authDomain: 'loverclinic-opd-4c39b.firebaseapp.com', projectId: APP_ID, storageBucket: BUCKET, messagingSenderId: '653911776503', appId: '1:653911776503:web:9e23f723d3ed877962c7f2' };

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

let fails = 0; const bugs = [];
// classify a client-SDK outcome: 'allow' (succeeded) | 'deny' (permission) | 'index' | 'error'
async function probe(label, expected, fn) {
  let outcome = 'allow', detail = '';
  try { await fn(); }
  catch (e) {
    const msg = `${e.code || ''} ${e.message || ''}`.trim();
    if (/permission-denied|storage\/unauthorized|unauthorized|insufficient permissions|403/i.test(msg)) outcome = 'deny';
    else if (/failed-precondition|requires an index|index/i.test(msg)) outcome = 'index';
    else { outcome = 'error'; detail = msg; }
  }
  const ok = outcome === expected;
  if (!ok) { fails++; bugs.push(`${label}: expected ${expected}, got ${outcome}${detail ? ' — ' + detail : ''}`); }
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${label} → ${outcome}${detail ? ' (' + detail.slice(0, 90) + ')' : ''}`);
  return outcome;
}

async function main() {
  const env = loadEnv('.env.local.prod');
  adminInit({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }), storageBucket: BUCKET });
  const adb = getAdminDb();
  const abucket = getAdminStorage().bucket();

  const app = initializeApp(cfg);
  const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);

  const sessA = `TEST-CES-PROBE-A-${STAMP}`;     // branch A test session
  const folderA = `uploads/chart-edit-sessions/${sessA}`;
  const cleanupBlobs = [];      // storage paths created by SUCCESSFUL client uploads
  const cleanupDocs = [];       // firestore doc paths created by client

  // a small data URLs for upload probes
  const PNG_DATAURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const HTML_DATAURL = 'data:text/html;base64,' + Buffer.from('<h1>x</h1>').toString('base64');

  console.log('\n==== T1 · template-src on REAL persisted data (admin READ-ONLY, Rule R) ====');
  {
    const snap = await adb.collection(`${P}/be_treatments`).limit(1000).get();
    let chartsTotal = 0, withJson = 0, srcData = 0, srcHttp = 0, srcPath = 0, srcNone = 0, overCap = 0;
    const httpExamples = [];
    for (const d of snap.docs) {
      const charts = d.data()?.detail?.charts;
      if (!Array.isArray(charts)) continue;
      for (const c of charts) {
        chartsTotal++;
        if (typeof c?.fabricJson === 'string' && c.fabricJson) {
          withJson++;
          const combined = (c.dataUrl?.length || 0) + c.fabricJson.length;
          if (combined > 700 * 1024) overCap++;
          try {
            const j = JSON.parse(c.fabricJson);
            const img = (j.objects || []).find(o => (o.type === 'Image' || o.type === 'image'));
            const src = img?.src || '';
            if (!img) srcNone++;
            else if (src.startsWith('data:')) srcData++;
            else if (/^https?:/i.test(src)) { srcHttp++; if (httpExamples.length < 3) httpExamples.push(src.slice(0, 100)); }
            else srcPath++;
          } catch { /* malformed persisted json — counted under withJson but not classifiable */ }
        }
      }
    }
    console.log(`treatments scanned=${snap.size} | charts=${chartsTotal} | withFabricJson=${withJson}`);
    console.log(`  template img src → data:=${srcData}  https:=${srcHttp}  relPath=${srcPath}  noImageObj=${srcNone}`);
    console.log(`  persisted fabricJson with (dataUrl+json) > 700KB cap = ${overCap} (should be 0 — guard drops oversized at persist)`);
    if (srcHttp > 0) { fails++; bugs.push(`T1: ${srcHttp} persisted charts carry an HTTP template src → re-edit 404s if it was a transient session blob. e.g. ${httpExamples.join(' ; ')}`); }
    if (withJson === 0) console.log('  NOTE: 0 persisted charts have fabricJson yet (feature new) → T1 real-data inconclusive; rely on the browser/real-fabric serialize check (separate) for src=data: proof.');
  }

  console.log('\n==== T4(anon) · firestore.rules deny unauthenticated (REAL client SDK, NOT signed in) ====');
  await probe('anon getDoc be_chart_edit_sessions', 'deny', () => getDoc(doc(db, `${P}/be_chart_edit_sessions`, sessA)));
  await probe('anon setDoc be_chart_edit_sessions', 'deny', () => setDoc(doc(db, `${P}/be_chart_edit_sessions`, sessA), { hack: true }));
  await probe('anon getDoc be_chart_tablet_presence', 'deny', () => getDoc(doc(db, `${P}/be_chart_tablet_presence`, 'TEST-DEV-PROBE')));
  await probe('anon setDoc be_chart_tablet_presence', 'deny', () => setDoc(doc(db, `${P}/be_chart_tablet_presence`, 'TEST-DEV-PROBE'), { hack: true }));

  console.log('\n==== T3(anon) · storage.rules deny unauthenticated upload (REAL client SDK) ====');
  await probe('anon upload image to chart-edit-sessions', 'deny', () => uploadString(sRef(storage, `${folderA}/anon-probe.png`), PNG_DATAURL, 'data_url'));

  // ── sign in as clinic staff via admin-minted custom token (Rule Q L2) ──
  console.log('\n==== sign in (client SDK) via admin custom token {isClinicStaff:true} ====');
  const token = await getAdminAuth().createCustomToken('TEST-PROBE-STAFF-UID', { isClinicStaff: true });
  await signInWithCustomToken(auth, token);
  await auth.currentUser.getIdToken(true);
  const claims = (await auth.currentUser.getIdTokenResult()).claims;
  console.log(`  signed in uid=${auth.currentUser.uid} isClinicStaff=${claims.isClinicStaff === true}`);
  if (claims.isClinicStaff !== true) { fails++; bugs.push('custom-token claim isClinicStaff did not propagate — staff probes invalid'); }

  console.log('\n==== T2 · composite-index / instant-pop query via REAL client SDK ====');
  // the EXACT app query: 3 equality filters, NO orderBy → must NOT throw failed-precondition
  await probe('exact instant-pop query (branchId,tabletDeviceId,status ==)', 'allow', async () => {
    const q = query(collection(db, `${P}/be_chart_edit_sessions`),
      where('branchId', '==', 'TEST-BR-PROBE-A'), where('tabletDeviceId', '==', 'TEST-DEV-PROBE'), where('status', '==', 'requested'));
    const s = await getDocs(q); console.log(`    (returned ${s.size} docs — empty expected; key point: no index error)`);
  });
  // a variant WITH orderBy (the app does NOT use this) — documents whether THAT would need a built index
  await probe('variant query + orderBy(createdAt) [app does NOT use — informational]', 'allow', async () => {
    const q = query(collection(db, `${P}/be_chart_edit_sessions`),
      where('branchId', '==', 'TEST-BR-PROBE-A'), where('tabletDeviceId', '==', 'TEST-DEV-PROBE'), where('status', '==', 'requested'), orderBy('createdAt', 'desc'));
    const s = await getDocs(q); console.log(`    (orderBy variant returned ${s.size} — if this said 'index', the composite IS load-bearing for an ordered variant)`);
  });

  console.log('\n==== T3(staff) · storage.rules content-type + size gating via REAL client SDK ====');
  await probe('staff upload image/png', 'allow', async () => { await uploadString(sRef(storage, `${folderA}/result.png`), PNG_DATAURL, 'data_url'); cleanupBlobs.push(`${folderA}/result.png`); });
  await probe('staff upload application/json (the §followup-2 fix)', 'allow', async () => { await uploadString(sRef(storage, `${folderA}/result.json`), JSON.stringify({ objects: [], canvasWidth: 600, canvasHeight: 800 }), 'raw', { contentType: 'application/json' }); cleanupBlobs.push(`${folderA}/result.json`); });
  await probe('staff upload text/html (wrong content-type → must deny)', 'deny', () => uploadString(sRef(storage, `${folderA}/evil.html`), HTML_DATAURL, 'data_url'));
  await probe('staff upload >10MB (oversize → must deny)', 'deny', () => uploadString(sRef(storage, `${folderA}/huge.png`), 'x'.repeat(11 * 1024 * 1024), 'raw', { contentType: 'image/png' }));

  console.log('\n==== T4(staff) · firestore.rules allow staff + branch-scope-at-query-time ====');
  await probe('staff setDoc TEST session (branch A)', 'allow', async () => {
    await setDoc(doc(db, `${P}/be_chart_edit_sessions`, sessA), { sessionId: sessA, branchId: 'TEST-BR-PROBE-A', tabletDeviceId: 'TEST-DEV-PROBE', status: 'requested', createdAt: STAMP, _probe: true });
    cleanupDocs.push(`${P}/be_chart_edit_sessions/${sessA}`);
  });
  await probe('staff getDoc TEST session', 'allow', () => getDoc(doc(db, `${P}/be_chart_edit_sessions`, sessA)));
  // branch-scope: scoped to A → finds it; scoped to a DIFFERENT branch → does NOT
  let scopedA = -1, scopedOther = -1;
  await probe('scoped query branchId==A returns the doc', 'allow', async () => {
    const s = await getDocs(query(collection(db, `${P}/be_chart_edit_sessions`), where('branchId', '==', 'TEST-BR-PROBE-A'), where('tabletDeviceId', '==', 'TEST-DEV-PROBE'), where('status', '==', 'requested')));
    scopedA = s.size; if (s.size < 1) { fails++; bugs.push('scoped-A query did not return the staff-written doc'); }
  });
  await probe('scoped query branchId==OTHER excludes the doc', 'allow', async () => {
    const s = await getDocs(query(collection(db, `${P}/be_chart_edit_sessions`), where('branchId', '==', 'TEST-BR-PROBE-OTHER'), where('tabletDeviceId', '==', 'TEST-DEV-PROBE'), where('status', '==', 'requested')));
    scopedOther = s.size; if (s.docs.some(d => d.id === sessA)) { fails++; bugs.push('branch isolation FAIL: OTHER-branch scoped query returned branch-A doc'); }
  });
  console.log(`    scoped(A)=${scopedA} doc(s); scoped(OTHER excludes A)=${scopedOther === 0 ? 'isolated' : scopedOther + ' (includes others, but NOT our A doc → ok)'}`);
  console.log('    (rules do NOT enforce branch — they rely on the UI always passing branchId; listenToRequestedSessionForTablet returns ()=>{} when branchId is missing → no unscoped path in the app.)');

  // ── cleanup (admin — reliable) ──
  console.log('\n==== cleanup TEST fixtures (admin) ====');
  await signOut(auth).catch(() => {});
  let orphans = 0;
  for (const p of cleanupDocs) { await adb.doc(p).delete().catch(() => {}); }
  for (const p of cleanupBlobs) { await abucket.file(p).delete().catch(() => {}); }
  // sweep the whole probe folder for anything left
  const [files] = await abucket.getFiles({ prefix: folderA }).catch(() => [[]]);
  for (const f of files) { orphans++; await f.delete().catch(() => {}); }
  const left = await adb.doc(`${P}/be_chart_edit_sessions/${sessA}`).get();
  console.log(`  docs deleted=${cleanupDocs.length} blobs deleted=${cleanupBlobs.length} extra-orphans-swept=${orphans} sessionDocStillExists=${left.exists}`);
  if (left.exists) { fails++; bugs.push('cleanup left the TEST session doc'); }

  console.log('\n==================== SUMMARY ====================');
  if (bugs.length) { console.log(`BUGS / UNEXPECTED (${bugs.length}):`); bugs.forEach(b => console.log('  ✗ ' + b)); }
  else console.log('No unexpected outcomes — every probe matched its expected allow/deny/empty result.');
  console.log(`FAILS=${fails}`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
