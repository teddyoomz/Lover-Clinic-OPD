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
  projectId: APP_ID,
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

// === TEST A: charts via chartEntryForPersist (CURRENT production path) ===
async function tryWrite(label, payload) {
  const testId = `TEST-DIAG-CHART-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ref = base.collection('be_treatments').doc(testId);
  try {
    await ref.set(payload, { merge: true });
    console.log(`✅ [${label}] SAVE SUCCEEDED.`);
    await ref.delete();
    return { ok: true };
  } catch (e) {
    console.error(`❌ [${label}] SAVE FAILED:`, e.message);
    // Don't await delete on failure; doc may not exist
    try { await ref.delete(); } catch {}
    return { ok: false, err: e };
  }
}

console.log('\n=== TEST A: detail.charts via chartEntryForPersist (clean) ===');
const { completedAt: cA, completedBy: cBA, ...detailRestA } = finalBackendDetail;
const payloadA = {
  treatmentId: 'A',
  customerId: 'TEST-CUSTOMER',
  detail: { ...detailRestA, createdBy: 'diag', createdAt: new Date().toISOString() },
  createdBy: 'diag', createdAt: new Date().toISOString(),
  completedAt: cA, completedBy: cBA, branchId: finalBackendDetail.branchId || '',
};
await tryWrite('A clean', payloadA);

// === TEST B: SIMULATE LEAK — retain template (with Timestamps) inside detail.charts[] ===
console.log('\n=== TEST B: detail.charts[] with template:Firestore-doc (LEAK simulation) ===');
const leakedChartEntry = clean({ dataUrl: 'data:image/png;base64,abcd', fabricJson: '{}', templateId: tmpl.id, template: tmpl, savedAt: new Date().toISOString() });
console.log('Leaked chart entry after clean():');
console.log(JSON.stringify(leakedChartEntry, null, 2).slice(0, 400));
const detailB = { ...detailRestA, charts: [leakedChartEntry], createdBy: 'diag', createdAt: new Date().toISOString() };
const payloadB = {
  treatmentId: 'B',
  customerId: 'TEST-CUSTOMER',
  detail: detailB,
  createdBy: 'diag', createdAt: new Date().toISOString(),
  completedAt: cA, completedBy: cBA, branchId: finalBackendDetail.branchId || '',
};
await tryWrite('B leak', payloadB);

// === TEST C: detail with raw (UN-cleaned) Timestamp instance inside charts[].template ===
console.log('\n=== TEST C: raw Timestamp leak (NO clean()) — confirms if Timestamp instance survives admin-SDK setDoc ===');
const rawEntry = { dataUrl: 'data:image/png;base64,abcd', fabricJson: '{}', templateId: tmpl.id, template: tmpl, savedAt: new Date().toISOString() };
const detailC = { ...detailRestA, charts: [rawEntry], createdBy: 'diag', createdAt: new Date().toISOString() };
const payloadC = {
  treatmentId: 'C',
  customerId: 'TEST-CUSTOMER',
  detail: detailC,
  createdBy: 'diag', createdAt: new Date().toISOString(),
  completedAt: cA, completedBy: cBA, branchId: finalBackendDetail.branchId || '',
};
await tryWrite('C raw Timestamp', payloadC);

// === TEST D: imageUrl-only template (mimic what a "+เพิ่ม" upload looks like AFTER chartEntryForPersist) ===
console.log('\n=== TEST D: hasSale=true + all sale-side fields populated (auto-sale path) ===');
const fullSaleDetail = clean({
  ...detailRestA,
  hasSale: true,
  charts: [chartEntryForPersist(entry)],
  treatmentItems: [{ id: 't1', productId: 'p1', name: 'item', qty: '1', unit: 'ครั้ง', price: 100, fillLater: false, skipStockDeduction: false }],
  medications: [{ name: 'med1', dosage: '1', qty: '1', unitPrice: 50, unit: 'เม็ด' }],
  consumables: [{ name: 'cons', qty: '1', unit: 'อัน' }],
  labItems: [],
  doctorFees: [],
  dfEntries: [],
  treatmentFiles: [],
  purchasedItems: [{ id: 'pp1', name: 'product', qty: '1', unitPrice: 100, unit: 'ชิ้น', itemType: 'product' }],
  billing: { subtotal: 100, medDisc: 0, billDiscAmt: 0, netTotal: 100 },
  payment: { paymentStatus: '2', channels: [{ enabled: true, method: 'cash', amount: 100 }], paymentDate: '2026-05-22', paymentTime: '10:00', refNo: '', note: '', saleNote: '' },
  sellers: [{ id: 's1', percent: 100, total: 100 }],
});
const payloadD = {
  treatmentId: 'D',
  customerId: 'TEST-CUSTOMER',
  detail: { ...fullSaleDetail, createdBy: 'diag', createdAt: new Date().toISOString() },
  createdBy: 'diag', createdAt: new Date().toISOString(),
  completedAt: cA, completedBy: cBA, branchId: finalBackendDetail.branchId || '',
};
await tryWrite('D full sale', payloadD);

console.log('\n=== DIAG done ===');
process.exit(0);
