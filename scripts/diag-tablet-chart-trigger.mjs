// scripts/diag-tablet-chart-trigger.mjs — Rule R diag: drive the PC side of the
// tablet chart editor relay so a real browser tablet can be exercised end-to-end.
// Usage:
//   node scripts/diag-tablet-chart-trigger.mjs create <tabletDeviceId> <branchId>   → prints SESSION id
//   node scripts/diag-tablet-chart-trigger.mjs verify <sessionId>
//   node scripts/diag-tablet-chart-trigger.mjs cleanup <sessionId> <tabletDeviceId>
// Auth via E2E_STAFF_EMAIL + E2E_STAFF_PASSWORD (client SDK — exact UI path).
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { getStorage, ref as sRef, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

const cfg = { apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20', authDomain: 'loverclinic-opd-4c39b.firebaseapp.com', projectId: 'loverclinic-opd-4c39b', storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app', messagingSenderId: '653911776503', appId: '1:653911776503:web:9e23f723d3ed877962c7f2' };
const APP_ID = 'loverclinic-opd-4c39b';
const P = `artifacts/${APP_ID}/public/data`;
const TPL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const [, , action, a1, a2] = process.argv;
const app = initializeApp(cfg);
const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);

async function main() {
  await signInWithEmailAndPassword(auth, process.env.E2E_STAFF_EMAIL, process.env.E2E_STAFF_PASSWORD);
  if (action === 'create') {
    const tablet = a1, branchId = a2;
    const sessionId = `TEST-CES-${Date.now()}`;
    const presRef = doc(db, `${P}/be_chart_tablet_presence`, tablet);
    const sesRef = doc(db, `${P}/be_chart_edit_sessions`, sessionId);
    await runTransaction(db, async (tx) => {
      const pres = await tx.get(presRef);
      if (!pres.exists()) throw new Error('tablet presence not found — is the tablet standing by?');
      tx.set(presRef, { status: 'busy', updatedAt: new Date().toISOString() }, { merge: true });
      tx.set(sesRef, {
        sessionId, branchId, pcDeviceId: 'DIAG-PC', tabletDeviceId: tablet, status: 'requested', cancelledBy: null,
        template: { id: 'ใบหน้าผู้หญิง', name: 'ใบหน้าผู้หญิง', category: 'head' }, patientLabel: 'คุณ มะลิ (HN 0042)',
        templateImageUrl: null, resultImageUrl: null, pcHeartbeatAt: Date.now(), tabletHeartbeatAt: null,
        createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + 3600000,
      });
    });
    const url = await uploadString(sRef(storage, `uploads/chart-edit-sessions/${sessionId}/template.png`), TPL, 'data_url').then(() => getDownloadURL(sRef(storage, `uploads/chart-edit-sessions/${sessionId}/template.png`)));
    await updateDoc(sesRef, { templateImageUrl: url });
    console.log('SESSION=' + sessionId);
  } else if (action === 'verify') {
    const snap = await getDoc(doc(db, `${P}/be_chart_edit_sessions`, a1));
    const d = snap.data() || {};
    console.log(JSON.stringify({ exists: snap.exists(), status: d.status, cancelledBy: d.cancelledBy, hasResult: !!d.resultImageUrl, tabletHeartbeatAt: d.tabletHeartbeatAt }));
  } else if (action === 'presence') {
    const snap = await getDoc(doc(db, `${P}/be_chart_tablet_presence`, a1));
    const d = snap.data() || {};
    const lhb = typeof d.lastHeartbeatAt === 'number' ? d.lastHeartbeatAt : 0;
    console.log(JSON.stringify({ exists: snap.exists(), status: d.status, ageMs: Date.now() - lhb }));
  } else if (action === 'cleanup') {
    await deleteDoc(doc(db, `${P}/be_chart_edit_sessions`, a1)).catch(() => {});
    if (a2) await setDoc(doc(db, `${P}/be_chart_tablet_presence`, a2), { status: 'idle', updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
    for (const k of ['template', 'result']) await deleteObject(sRef(storage, `uploads/chart-edit-sessions/${a1}/${k}.png`)).catch(() => {});
    console.log('cleaned ' + a1);
  }
  process.exit(0);
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
