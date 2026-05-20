// scripts/e2e-tablet-chart-editor.mjs
// Rule Q V66 — L2 verification (REAL client SDK, NOT firebase-admin) of the tablet
// chart editor relay against REAL prod Firestore + Storage. Two simulated clients
// (PC + tablet) drive the exact compound query / Storage round-trip the UI uses.
//
// PREREQUISITES (this is a POST-DEPLOY gate — do NOT expect it to pass before deploy):
//   1. firestore.indexes deployed AND BUILT (the be_chart_edit_sessions composite
//      index on branchId+tabletDeviceId+status takes 2–30 min to build after deploy).
//   2. A staff test account: export E2E_STAFF_EMAIL + E2E_STAFF_PASSWORD
//      (any clinic-staff Firebase account — the editor needs no special permission).
//   3. firestore.rules + storage.rules deployed (be_chart_* + uploads/ staff-only).
// Run:  E2E_STAFF_EMAIL=... E2E_STAFF_PASSWORD=... node scripts/e2e-tablet-chart-editor.mjs
//
// Uses TEST- prefixed deviceIds + sessionIds (V20) and cleans up every fixture.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { getStorage, ref as sRef, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20',
  authDomain: 'loverclinic-opd-4c39b.firebaseapp.com',
  projectId: 'loverclinic-opd-4c39b',
  storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app',
  messagingSenderId: '653911776503',
  appId: '1:653911776503:web:9e23f723d3ed877962c7f2',
};
const APP_ID = 'loverclinic-opd-4c39b';
const P = `artifacts/${APP_ID}/public/data`;
const TS = Date.now();
const BRANCH = `TEST-BR-${TS}`;
const TABLET = `TEST-T-${TS}`;
const SESSION = `TEST-CES-${TS}`;
const TEMPLATE_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const RESULT_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const log = (ok, msg) => console.log(`${ok ? 'PASS' : 'FAIL'} · ${msg}`);
let fails = 0;
const assert = (cond, msg) => { if (!cond) fails++; log(!!cond, msg); };

async function main() {
  const email = process.env.E2E_STAFF_EMAIL, password = process.env.E2E_STAFF_PASSWORD;
  if (!email || !password) { console.error('Set E2E_STAFF_EMAIL + E2E_STAFF_PASSWORD'); process.exit(2); }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  await signInWithEmailAndPassword(auth, email, password);
  console.log(`signed in as ${email}`);

  const presenceRef = doc(db, `${P}/be_chart_tablet_presence`, TABLET);
  const sessionRef = doc(db, `${P}/be_chart_edit_sessions`, SESSION);
  const tplPath = `uploads/chart-edit-sessions/${SESSION}/template.png`;
  const resPath = `uploads/chart-edit-sessions/${SESSION}/result.png`;

  try {
    // 1. tablet stands by (idle, fresh)
    await setDoc(presenceRef, { deviceId: TABLET, deviceName: 'E2E iPad', branchId: BRANCH, status: 'idle', lastHeartbeatAt: Date.now() });

    // 2. PC creates the session + uploads the template (transport via Storage)
    await setDoc(sessionRef, {
      sessionId: SESSION, branchId: BRANCH, pcDeviceId: 'E2E-PC', tabletDeviceId: TABLET,
      status: 'requested', cancelledBy: null, template: { id: 'tpl', name: 'face', category: 'head' },
      patientLabel: 'E2E คุณทดสอบ', templateImageUrl: null, resultImageUrl: null,
      pcHeartbeatAt: Date.now(), tabletHeartbeatAt: null, createdAt: Date.now(), updatedAt: Date.now(),
    });
    await setDoc(presenceRef, { status: 'busy' }, { merge: true });
    await uploadString(sRef(storage, tplPath), TEMPLATE_DATA, 'data_url');
    const tplUrl = await getDownloadURL(sRef(storage, tplPath));
    await updateDoc(sessionRef, { templateImageUrl: tplUrl });

    // 3. tablet finds its 'requested' session via the EXACT compound query (composite index)
    const q = query(collection(db, `${P}/be_chart_edit_sessions`),
      where('branchId', '==', BRANCH), where('tabletDeviceId', '==', TABLET), where('status', '==', 'requested'));
    const found = await getDocs(q);
    assert(found.size === 1 && found.docs[0].id === SESSION, 'compound query (instant-pop) finds the requested session [needs built index]');

    // 4. tablet opens (active), downloads template, draws, uploads result, saves
    await updateDoc(sessionRef, { status: 'active', tabletHeartbeatAt: Date.now() });
    const tplBack = await (await fetch(tplUrl)).text();
    assert(tplBack.length > 0, 'tablet downloads the template from Storage');
    await uploadString(sRef(storage, resPath), RESULT_DATA, 'data_url');
    const resUrl = await getDownloadURL(sRef(storage, resPath));
    await updateDoc(sessionRef, { status: 'saved', resultImageUrl: resUrl });

    // 5. PC reads 'saved' + downloads the result → bytes round-trip
    const savedSnap = await getDoc(sessionRef);
    assert(savedSnap.data().status === 'saved', 'PC sees status saved');
    const resBack = await (await fetch(savedSnap.data().resultImageUrl)).blob();
    assert(resBack.size > 0, 'PC downloads the drawn result from Storage (round-trip)');

    // 6. TABLET_BUSY: presence is busy → a 2nd PC must NOT treat it as ready
    const presSnap = await getDoc(presenceRef);
    assert(presSnap.data().status === 'busy', '2-PC guard: tablet presence is busy during the session');
  } finally {
    // 7. cleanup — zero orphans
    await deleteDoc(sessionRef).catch(() => {});
    await deleteDoc(presenceRef).catch(() => {});
    await deleteObject(sRef(storage, tplPath)).catch(() => {});
    await deleteObject(sRef(storage, resPath)).catch(() => {});
    const leftSession = await getDoc(sessionRef);
    const leftPres = await getDoc(presenceRef);
    assert(!leftSession.exists() && !leftPres.exists(), 'cleanup: zero orphan docs');
  }

  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error('e2e error:', e.message); process.exit(1); });
