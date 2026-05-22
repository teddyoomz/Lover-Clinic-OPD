// DIAG (Rule R) — reproduce the "Property detail contains an invalid nested
// entity" error the user gets after using a freshly-uploaded chart template.
// Reads recent be_chart_templates docs + recent be_treatments docs, prints
// shape diffs, then tries the FULL save flow against a TEST customer.
//
// READ-ONLY for templates + treatments; writes TEST-DIAG- doc on a TEST customer
// to validate the save path. Cleanup at end.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  console.error('Direct invocation only.');
  process.exit(1);
}

const env = (await readFile('.env.local.prod', 'utf8'))
  .split('\n').filter(Boolean).reduce((acc, line) => {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) acc[m[1]] = m[2];
    return acc;
  }, {});
const APP_ID = 'loverclinic-opd-4c39b';
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
initializeApp({ credential: cert({
  projectId: env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey,
}) });
const db = getFirestore();
const base = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

console.log('=== be_chart_templates docs ===');
const tplSnap = await base.collection('be_chart_templates').get();
console.log(`Found ${tplSnap.size} docs`);
let sampleUpload = null;
let sampleBuiltIn = null;
tplSnap.forEach(d => {
  const data = d.data();
  if (data.builtIn) {
    if (!sampleBuiltIn) sampleBuiltIn = { id: d.id, data };
  } else {
    if (!sampleUpload) sampleUpload = { id: d.id, data };
  }
});

console.log('\n--- Sample BUILT-IN ---');
if (sampleBuiltIn) {
  console.log('id:', sampleBuiltIn.id);
  for (const [k, v] of Object.entries(sampleBuiltIn.data)) {
    const t = v?.constructor?.name || typeof v;
    const display = (v && v._seconds !== undefined) ? `Timestamp(${v._seconds},${v._nanoseconds})`
                  : (typeof v === 'string' && v.length > 80) ? `String(len=${v.length}) ${v.slice(0, 60)}...`
                  : JSON.stringify(v);
    console.log(`  ${k} [${t}]: ${display}`);
  }
} else { console.log('(none)'); }

console.log('\n--- Sample USER-UPLOADED ---');
if (sampleUpload) {
  console.log('id:', sampleUpload.id);
  for (const [k, v] of Object.entries(sampleUpload.data)) {
    const t = v?.constructor?.name || typeof v;
    const display = (v && v._seconds !== undefined) ? `Timestamp(${v._seconds},${v._nanoseconds})`
                  : (typeof v === 'string' && v.length > 80) ? `String(len=${v.length}) ${v.slice(0, 60)}...`
                  : JSON.stringify(v);
    console.log(`  ${k} [${t}]: ${display}`);
  }
} else { console.log('(none — no user upload yet)'); }

// Now try a setDoc with a payload mimicking the save flow + a user-uploaded
// template's data. If error fires, we'll see the EXACT field path.

console.log('\n=== SIMULATING TFP SAVE WITH A NEWLY-UPLOADED-TEMPLATE ENTRY ===');
const tmpl = sampleUpload?.data || {
  id: 'sim-tmpl',
  name: 'sim',
  category: 'other',
  imageUrl: 'https://firebasestorage.googleapis.com/v0/b/example.firebasestorage.app/o/chart-templates%2Fsim.png?alt=media&token=xxx',
  storagePath: 'chart-templates/sim.png',
  builtIn: false,
  locked: false,
  _seedOrder: 9999,
  createdAt: Timestamp.fromMillis(Date.now()),
  createdAtMs: Date.now(),
  updatedAt: Timestamp.fromMillis(Date.now()),
};
console.log('\nSimulated tmpl from React snapshot:');
console.log('  has Timestamp instances?', tmpl.createdAt?.constructor?.name === 'Timestamp');

// ChartCanvas.handleSave passes:
const chartData = { dataUrl: 'data:image/png;base64,abcd', fabricJson: '{"objects":[]}', templateId: tmpl.id };

// ChartSection.handleSave entry:
const entry = { ...chartData, fabricJson: '{}', template: tmpl, savedAt: new Date().toISOString() };
console.log('\nentry has template?', !!entry.template);
console.log('entry.template.createdAt is Timestamp?', entry.template?.createdAt?.constructor?.name === 'Timestamp');

// chartEntryForPersist (verbatim from src/lib/tabletChartTools.js)
const CHART_PERSIST_CAP_BYTES = 700 * 1024;
function chartEntryForPersist(c) {
  const dataUrl = c?.dataUrl || '';
  let fabricJson = (typeof c?.fabricJson === 'string') ? c.fabricJson : null;
  if (fabricJson && (dataUrl.length + fabricJson.length) > CHART_PERSIST_CAP_BYTES) fabricJson = null;
  return { dataUrl, fabricJson, templateId: c?.templateId };
}

// clean = JSON.parse(JSON.stringify(...))
const clean = (obj) => JSON.parse(JSON.stringify(obj));

const backendDetail = clean({
  treatmentDate: '2026-05-22',
  doctorId: 'd1', doctorName: 'Test',
  branchId: 'BR-PROBE',
  symptoms: 'cough', physicalExam: '',
  vitals: { bmi: '22' },
  healthInfo: { bloodType: '', congenitalDisease: '', drugAllergy: '', treatmentHistory: '' },
  beforeImages: [], afterImages: [], otherImages: [],
  charts: [entry].filter(c => c.dataUrl).map(chartEntryForPersist),
  treatmentItems: [], medications: [], consumables: [],
  labItems: [], doctorFees: [], dfEntries: [],
  treatmentFiles: [],
  purchasedItems: [],
  billing: { subtotal: 0, medDisc: 0, billDiscAmt: 0, netTotal: 0 },
  payment: { paymentStatus: '', channels: [], paymentDate: '', paymentTime: '', refNo: '', note: '', saleNote: '' },
  sellers: [],
  hasSale: false,
});

console.log('\nbackendDetail.charts after clean+map:');
console.log(JSON.stringify(backendDetail.charts, null, 2));

// Add v26StatusPatch (staff save mode)
const v26StatusPatch = {
  completedAt: FieldValue.serverTimestamp(),
  completedBy: 'test-uid',
};
const finalBackendDetail = { ...backendDetail, ...v26StatusPatch };

console.log('\nfinalBackendDetail field shapes:');
for (const [k, v] of Object.entries(finalBackendDetail)) {
  const t = v?.constructor?.name || typeof v;
  console.log(`  ${k} [${t}]`);
}

// Now try the actual setDoc to a TEST treatment doc
console.log('\n=== Attempting setDoc to TEST-DIAG-CHART treatment doc ===');
const testId = `TEST-DIAG-CHART-${Date.now()}`;
const treatmentDocRef = base.collection('be_treatments').doc(testId);

// Mimic createBackendTreatment shape
const { completedAt, completedBy, ...detailRest } = finalBackendDetail;
const topLevelPatch = {};
if (completedAt !== undefined) topLevelPatch.completedAt = completedAt;
if (completedBy !== undefined) topLevelPatch.completedBy = completedBy;
topLevelPatch.branchId = finalBackendDetail.branchId || '';

const payload = {
  treatmentId: testId,
  customerId: 'TEST-CUSTOMER',
  detail: { ...detailRest, createdBy: 'diag', createdAt: new Date().toISOString() },
  createdBy: 'diag',
  createdAt: new Date().toISOString(),
  ...topLevelPatch,
};

try {
  await treatmentDocRef.set(payload, { merge: true });
  console.log('✅ SAVE SUCCEEDED. The bug ISN\'T in this shape.');
  await treatmentDocRef.delete();
  console.log('Cleaned up TEST-DIAG-CHART doc.');
} catch (e) {
  console.error('❌ SAVE FAILED:', e.message);
  console.error('Stack:', e.stack);
}

process.exit(0);
