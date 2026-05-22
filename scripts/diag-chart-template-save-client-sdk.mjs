// DIAG (Rule R + Q L2) — reproduce "Property detail contains an invalid
// nested entity" via the REAL CLIENT SDK (matching the browser path),
// because admin-SDK accepts shapes that client-SDK rejects (V66).
//
// Flow: admin-SDK mints a custom token w/ {isClinicStaff:true} → client SDK
// signInWithCustomToken → fetch the REAL uploaded chart template doc →
// build TFP-mirror backendDetail with the leaked + cleaned + raw variants
// → setDoc via CLIENT SDK to TEST-DIAG-CHART-CLIENT-* → observe exact error.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

import { initializeApp as initClient } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, getDoc, getDocs, collection, query, limit, serverTimestamp } from 'firebase/firestore';

if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  console.error('Direct invocation only.');
  process.exit(1);
}

const APP_ID = 'loverclinic-opd-4c39b';
const env = (await readFile('.env.local.prod', 'utf8'))
  .split('\n').filter(Boolean).reduce((acc, line) => {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) acc[m[1]] = m[2];
    return acc;
  }, {});
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');

initAdmin({ credential: cert({
  projectId: APP_ID,
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey,
}) });
const adminDb = getAdminFirestore();

const firebaseConfig = {
  apiKey: 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20',
  authDomain: 'loverclinic-opd-4c39b.firebaseapp.com',
  projectId: APP_ID,
  storageBucket: 'loverclinic-opd-4c39b.firebasestorage.app',
  messagingSenderId: '653911776503',
  appId: '1:653911776503:web:9e23f723d3ed877962c7f2',
};
const clientApp = initClient(firebaseConfig);
const clientAuth = getAuth(clientApp);
const clientDb = getFirestore(clientApp);

console.log('==== mint custom token + sign in as clinic staff (client SDK) ====');
const token = await getAdminAuth().createCustomToken('TEST-PROBE-STAFF-UID', { isClinicStaff: true });
await signInWithCustomToken(clientAuth, token);
await clientAuth.currentUser.getIdToken(true);
console.log(`signed in uid=${clientAuth.currentUser.uid}`);

const PREFIX = `artifacts/${APP_ID}/public/data`;

console.log('\n==== fetch a real user-uploaded chart template (CLIENT SDK) ====');
const tplSnap = await getDocs(query(collection(clientDb, `${PREFIX}/be_chart_templates`), limit(50)));
let userUploaded = null;
let builtIn = null;
tplSnap.forEach(d => {
  const data = d.data();
  if (data.builtIn && !builtIn) builtIn = { id: d.id, data };
  if (!data.builtIn && !userUploaded) userUploaded = { id: d.id, data };
});
console.log(`builtIn: ${builtIn?.id || '(none)'}`);
console.log(`userUploaded: ${userUploaded?.id || '(none)'}`);
if (!userUploaded) { console.error('No user uploads in be_chart_templates — diag needs at least one.'); process.exit(1); }

const tmpl = userUploaded.data;
console.log('\nChart template field types:');
for (const [k, v] of Object.entries(tmpl)) {
  const ctor = v?.constructor?.name || typeof v;
  console.log(`  ${k} [${ctor}]`);
}

const CHART_PERSIST_CAP_BYTES = 700 * 1024;
function chartEntryForPersist(c) {
  const dataUrl = c?.dataUrl || '';
  let fabricJson = (typeof c?.fabricJson === 'string') ? c.fabricJson : null;
  if (fabricJson && (dataUrl.length + fabricJson.length) > CHART_PERSIST_CAP_BYTES) fabricJson = null;
  return { dataUrl, fabricJson, templateId: c?.templateId };
}
const clean = (obj) => JSON.parse(JSON.stringify(obj));

// Mirror ChartSection.handleSave entry shape — chartData from canvas + template:canvasTemplate
const chartData = { dataUrl: 'data:image/png;base64,abcd', fabricJson: '{}', templateId: tmpl.id };
const entry = { ...chartData, fabricJson: '{}', template: tmpl, savedAt: new Date().toISOString() };

const baseDetail = {
  treatmentDate: '2026-05-22',
  doctorId: 'd1', doctorName: 'Test',
  branchId: 'BR-TEST',
  symptoms: '', physicalExam: '', diagnosis: '',
  treatmentInfo: '', treatmentPlan: '', treatmentNote: '', additionalNote: '',
  vitals: { bmi: '' },
  healthInfo: { bloodType: '', congenitalDisease: '', drugAllergy: '', treatmentHistory: '' },
  beforeImages: [], afterImages: [], otherImages: [],
  treatmentItems: [], medications: [], consumables: [],
  labItems: [], doctorFees: [], dfEntries: [],
  treatmentFiles: [], purchasedItems: [],
  billing: { subtotal: 0, medDisc: 0, billDiscAmt: 0, netTotal: 0 },
  payment: { paymentStatus: '', channels: [], paymentDate: '', paymentTime: '', refNo: '', note: '', saleNote: '' },
  sellers: [], hasSale: false,
};

async function tryClientWrite(label, charts) {
  const testId = `TEST-DIAG-CHART-CLIENT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const ref = doc(clientDb, `${PREFIX}/be_treatments/${testId}`);
  const cleanedBase = clean(baseDetail);
  const detailRest = { ...cleanedBase, charts, createdBy: 'diag', createdAt: new Date().toISOString() };
  const payload = {
    treatmentId: testId,
    customerId: 'TEST-CUSTOMER',
    detail: detailRest,
    createdBy: 'diag',
    createdAt: new Date().toISOString(),
    completedAt: serverTimestamp(),
    completedBy: 'diag',
    branchId: 'BR-TEST',
  };
  try {
    await setDoc(ref, payload, { merge: true });
    console.log(`✅ [${label}] CLIENT-SDK SAVE SUCCEEDED.`);
    await deleteDoc(ref);
    return true;
  } catch (e) {
    console.error(`❌ [${label}] CLIENT-SDK SAVE FAILED:`);
    console.error(`   message: ${e.message}`);
    console.error(`   code: ${e.code || '(no code)'}`);
    if (e.stack) console.error(`   stack: ${e.stack.split('\n').slice(0, 3).join('\n')}`);
    try { await deleteDoc(ref); } catch {}
    return false;
  }
}

console.log('\n=== TEST A (CLIENT): detail.charts via chartEntryForPersist (production path) ===');
await tryClientWrite('A clean', [chartEntryForPersist(entry)]);

console.log('\n=== TEST B (CLIENT): detail.charts retains template:Firestore-doc (cleaned via JSON) ===');
await tryClientWrite('B cleaned-leak', [clean(entry)]);

console.log('\n=== TEST C (CLIENT): detail.charts retains template:Firestore-doc with RAW Timestamp instance (NO clean) ===');
await tryClientWrite('C raw-Timestamp-leak', [entry]);

console.log('\n=== TEST D (CLIENT): detail.charts entry with bare tmpl (no clean — raw Timestamp + extra fields) ===');
await tryClientWrite('D bare-tmpl-as-entry', [tmpl]);

console.log('\n=== DIAG done ===');
process.exit(0);
