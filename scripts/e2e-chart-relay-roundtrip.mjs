// scripts/e2e-chart-relay-roundtrip.mjs
// Rule Q V66 — REAL-PROD round-trip of the FULL chart-relay lifecycle (the user's real-use asks):
//   (A) fresh PC image upload → relay session → tablet result (PNG + fabricJson) → PC download →
//       PERSIST into the patient's OPD record (be_treatments.detail.charts[]) → re-read it back.
//   (B) RE-EDIT a saved chart: parse the persisted fabricJson → "edit" (add an object) → re-persist
//       → re-read (object-level re-edit is only possible if fabricJson survives the round-trip).
//   (C) STRESS + EDGE: large fabricJson (60 objects), special-char text (emoji/Thai/RTL/newline/2k),
//       concurrent sessions (two tablets, no cross-contamination), rapid re-save (last-write-wins).
//
// SCOPE (honest, Rule Q V66): this drives REAL prod Firestore + Storage via the admin SDK to verify
// the DATA contracts (transport + persist shape + re-read + re-editability of the json). The admin
// SDK BYPASSES storage.rules, so it does NOT prove the CLIENT result.json upload (application/json)
// is allowed — that is the known storage.rules deploy-gate (Probe-Deploy-Probe #13) and is verified
// separately by the real-browser/client-SDK relay (tests/e2e/tablet-chart-more-tools-relay.spec.js).
// The result.PNG path (image/png) IS allowed by the live rules, so the PNG persist round-trip here
// is genuine for both admin and client. The PERSIST SHAPE mirrors TreatmentFormPage.jsx:2399
// (detail.charts = [{ dataUrl, fabricJson, templateId }]) + backendClient setDoc(treatmentDoc).
//
// Reads .env.local.prod (Rule M/R). Run:  node scripts/e2e-chart-relay-roundtrip.mjs
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';
const DATA = `artifacts/${APP_ID}/public/data`;
const STAMP = Date.now();
// a 2x2 red PNG (distinct, non-blank) — stands in for the flattened chart export
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF8AGmEEA0/2sX0AAAAASUVORK5CYII=';

const log = (ok, msg) => console.log(`${ok ? 'PASS' : 'FAIL'} · ${msg}`);
let fails = 0;
const assert = (cond, msg) => { if (!cond) fails++; log(!!cond, msg); };

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}
const tokenUrl = (p, t) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(p)}?alt=media&token=${t}`;

// a fabric v7 canvas.toJSON()-shaped object: a locked template Image (index 0) + tool objects.
// Mirrors what TabletChartCanvas.exportFabricJson() produces (type = PascalCase class name).
function makeFabricJson({ textValue = 'ทดสอบ', extraPaths = 0 } = {}) {
  const objects = [
    { type: 'Image', src: 'data:image/png;base64,TEMPLATE', left: 0, top: 0, scaleX: 1, scaleY: 1, selectable: false }, // template
    { type: 'Path', fill: '#ef4444', opacity: 1, path: [['M', 1, 1], ['L', 5, 5], ['Z']] },   // pen
    { type: 'Path', fill: '#16a34a', opacity: 0.4, path: [['M', 2, 2], ['L', 8, 8], ['Z']] }, // highlighter
    { type: 'Line', stroke: '#3b82f6', x1: 0, y1: 0, x2: 20, y2: 0 },                          // line
    { type: 'Group', objects: [{ type: 'Line' }, { type: 'Triangle' }] },                      // arrow
    { type: 'Rect', stroke: '#111', fill: 'transparent', width: 30, height: 18 },              // rect
    { type: 'Ellipse', stroke: '#805ad5', fill: 'transparent', rx: 15, ry: 9 },                // circle
    { type: 'Textbox', text: textValue, fill: '#000', fontSize: 18 },                          // text
  ];
  for (let i = 0; i < extraPaths; i++) objects.push({ type: 'Path', fill: '#000', path: [['M', i, i], ['L', i + 3, i + 3], ['Z']] });
  return { version: '7.2.0', objects, background: '' };
}

async function main() {
  const env = loadEnv('.env.local.prod');
  initializeApp({
    credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }),
    storageBucket: BUCKET,
  });
  const bucket = getStorage().bucket();
  const db = getFirestore();
  const created = { sessions: [], treatments: [], folders: [] };

  // upload helpers (real Storage)
  const upPng = async (folder, kind, b64) => { const t = randomBytes(16).toString('hex'); const p = `${folder}/${kind}.png`; await bucket.file(p).save(Buffer.from(b64, 'base64'), { contentType: 'image/png', metadata: { metadata: { firebaseStorageDownloadTokens: t } } }); return tokenUrl(p, t); };
  const upJson = async (folder, kind, obj) => { const t = randomBytes(16).toString('hex'); const p = `${folder}/${kind}.json`; await bucket.file(p).save(JSON.stringify(obj), { contentType: 'application/json', metadata: { metadata: { firebaseStorageDownloadTokens: t } } }); return tokenUrl(p, t); };

  // one full relay → persist round trip; returns { treatmentId, sessionId, persistedCharts }
  async function relayAndPersist({ sessionId, customerId, treatmentId, textValue = 'ทดสอบ', extraPaths = 0 }) {
    const folder = `uploads/chart-edit-sessions/${sessionId}`;
    created.folders.push(folder); created.sessions.push(sessionId); created.treatments.push(treatmentId);
    // (1) PC uploads a FRESH template image (ChartTemplateSelector upload → uploadTransportImage('template'))
    const templateImageUrl = await upPng(folder, 'template', PNG_B64);
    // (2) session doc requested→active→ (3) tablet save: result.png + result.json + status saved
    const fabricJson = makeFabricJson({ textValue, extraPaths });
    const resultImageUrl = await upPng(folder, 'result', PNG_B64);
    const resultFabricJsonUrl = await upJson(folder, 'result', fabricJson);
    await db.doc(`${DATA}/be_chart_edit_sessions/${sessionId}`).set({
      sessionId, branchId: 'TEST-BR', status: 'saved', template: { id: 'face-male', name: 'face' },
      patientLabel: 'TEST', templateImageUrl, resultImageUrl, resultFabricJsonUrl, createdAt: STAMP, updatedAt: Date.now(),
    });
    // (4) PC download — EXACT client path (fetch token URL + parse), incl. live CORS
    const pngBuf = Buffer.from(await (await fetch(resultImageUrl)).arrayBuffer());
    const jsonBack = JSON.parse(await (await fetch(resultFabricJsonUrl)).text());
    const onSaved = { dataUrl: `data:image/png;base64,${pngBuf.toString('base64')}`, fabricJson: JSON.stringify(jsonBack), templateId: 'face-male', source: 'tablet' };
    // (5) PERSIST → be_treatments.detail.charts[] (mirror TFP:2399 + backendClient setDoc(treatmentDoc, {merge:true}))
    const chartEntry = { dataUrl: onSaved.dataUrl, fabricJson: onSaved.fabricJson, templateId: onSaved.templateId };
    await db.doc(`${DATA}/be_treatments/${treatmentId}`).set({
      treatmentId, customerId: String(customerId),
      detail: { charts: [chartEntry], createdBy: 'backend', createdAt: Date.now() }, createdAt: Date.now(),
    }, { merge: true });
    return { sessionId, treatmentId, templateImageUrl, resultImageUrl, resultFabricJsonUrl };
  }

  try {
    // ───────────────────────── ROUND-TRIP A: fresh image → relay → save → persist → re-read ─────────────────────────
    const A = await relayAndPersist({ sessionId: `TEST-CES-RT-A-${STAMP}`, customerId: `TEST-CUST-A-${STAMP}`, treatmentId: `TEST-BT-A-${STAMP}` });
    assert(!!A.templateImageUrl && !!A.resultImageUrl && !!A.resultFabricJsonUrl, 'A: fresh template + result PNG + result json all uploaded to real prod Storage');

    // re-read the persisted treatment doc (does the chart actually live in the OPD patient record?)
    const reread = (await db.doc(`${DATA}/be_treatments/${A.treatmentId}`).get()).data();
    const charts = reread?.detail?.charts || [];
    assert(charts.length === 1, `A: chart persisted to be_treatments.detail.charts[] (got ${charts.length})`);
    assert(typeof charts[0]?.dataUrl === 'string' && charts[0].dataUrl.startsWith('data:image/png'), 'A: persisted chart carries the flattened PNG dataUrl');
    assert(typeof charts[0]?.fabricJson === 'string', 'A: persisted chart carries the lossless fabricJson string');
    const parsed = JSON.parse(charts[0].fabricJson);
    assert(Array.isArray(parsed.objects) && parsed.objects.length === 8, `A: persisted fabricJson has all 8 objects (template + 7 tools) (got ${parsed.objects?.length})`);
    const typesA = parsed.objects.map(o => o.type).sort().join(',');
    assert(typesA === 'Ellipse,Group,Image,Line,Path,Path,Rect,Textbox', `A: every object type survived to the OPD record: ${typesA}`);

    // ───────────────────────── ROUND-TRIP B: RE-EDIT a saved chart (object-level) ─────────────────────────
    // load the persisted fabricJson (what ChartCanvas SHOULD loadFromJSON), "edit" (add a stroke), re-persist, re-read.
    const editable = JSON.parse(charts[0].fabricJson);
    assert(editable.objects.find(o => o.type === 'Image'), 'B: re-edit source has the template Image object (re-hydratable, not a flat raster)');
    editable.objects.push({ type: 'Path', fill: '#dc2626', path: [['M', 9, 9], ['L', 12, 12], ['Z']] }); // a new stroke added on re-edit
    const reEdited = { dataUrl: `data:image/png;base64,${PNG_B64}`, fabricJson: JSON.stringify(editable), templateId: 'face-male' };
    await db.doc(`${DATA}/be_treatments/${A.treatmentId}`).set({ detail: { charts: [reEdited] } }, { merge: true });
    const rereadB = (await db.doc(`${DATA}/be_treatments/${A.treatmentId}`).get()).data();
    const editedObjs = JSON.parse(rereadB.detail.charts[0].fabricJson).objects;
    assert(editedObjs.length === 9, `B: re-edit persisted (+1 stroke → 9 objects) (got ${editedObjs.length})`);

    // ───────────────────────── STRESS C1: large fabricJson (60 extra objects) ─────────────────────────
    const C1 = await relayAndPersist({ sessionId: `TEST-CES-RT-C1-${STAMP}`, customerId: `TEST-CUST-C1-${STAMP}`, treatmentId: `TEST-BT-C1-${STAMP}`, extraPaths: 60 });
    const c1 = (await db.doc(`${DATA}/be_treatments/${C1.treatmentId}`).get()).data();
    const c1objs = JSON.parse(c1.detail.charts[0].fabricJson).objects.length;
    assert(c1objs === 68, `C1: large fabricJson (8 + 60 = 68 objects) round-trips + persists intact (got ${c1objs})`);
    const c1bytes = Buffer.byteLength(c1.detail.charts[0].fabricJson + c1.detail.charts[0].dataUrl);
    assert(c1bytes < 1024 * 1024, `C1: persisted chart entry < 1MB Firestore doc-field guard (${(c1bytes / 1024).toFixed(1)} KB)`);

    // ───────────────────────── STRESS C2: special-char text (emoji/Thai/RTL/newline/2k) byte-identical ─────────────────────────
    const NASTY = 'ทดสอบ\n😀🔥 العربية ​ำ end ' + 'x'.repeat(2000);
    const C2 = await relayAndPersist({ sessionId: `TEST-CES-RT-C2-${STAMP}`, customerId: `TEST-CUST-C2-${STAMP}`, treatmentId: `TEST-BT-C2-${STAMP}`, textValue: NASTY });
    const c2 = (await db.doc(`${DATA}/be_treatments/${C2.treatmentId}`).get()).data();
    const c2text = JSON.parse(c2.detail.charts[0].fabricJson).objects.find(o => o.type === 'Textbox')?.text;
    assert(c2text === NASTY, `C2: special-char Textbox text byte-identical after Storage + Firestore round-trip (len ${c2text?.length} vs ${NASTY.length})`);

    // ───────────────────────── STRESS C3: concurrent sessions (two tablets, no cross-contamination) ─────────────────────────
    const [D1, D2] = await Promise.all([
      relayAndPersist({ sessionId: `TEST-CES-RT-D1-${STAMP}`, customerId: `TEST-CUST-D1-${STAMP}`, treatmentId: `TEST-BT-D1-${STAMP}`, textValue: 'PATIENT-ONE' }),
      relayAndPersist({ sessionId: `TEST-CES-RT-D2-${STAMP}`, customerId: `TEST-CUST-D2-${STAMP}`, treatmentId: `TEST-BT-D2-${STAMP}`, textValue: 'PATIENT-TWO' }),
    ]);
    const d1 = (await db.doc(`${DATA}/be_treatments/${D1.treatmentId}`).get()).data();
    const d2 = (await db.doc(`${DATA}/be_treatments/${D2.treatmentId}`).get()).data();
    const d1text = JSON.parse(d1.detail.charts[0].fabricJson).objects.find(o => o.type === 'Textbox')?.text;
    const d2text = JSON.parse(d2.detail.charts[0].fabricJson).objects.find(o => o.type === 'Textbox')?.text;
    assert(d1text === 'PATIENT-ONE' && d2text === 'PATIENT-TWO', `C3: concurrent sessions persist to distinct patients, no cross-contamination (${d1text} / ${d2text})`);

    // ───────────────────────── STRESS C4: rapid re-save (last-write-wins, no corruption) ─────────────────────────
    const rsSession = `TEST-CES-RT-C4-${STAMP}`; const rsFolder = `uploads/chart-edit-sessions/${rsSession}`;
    created.folders.push(rsFolder); created.sessions.push(rsSession);
    let lastUrl = null;
    for (let i = 0; i < 3; i++) lastUrl = await upJson(rsFolder, 'result', makeFabricJson({ textValue: `SAVE-${i}` }));
    const finalText = JSON.parse(await (await fetch(lastUrl)).text()).objects.find(o => o.type === 'Textbox')?.text;
    assert(finalText === 'SAVE-2', `C4: rapid re-save → last write wins, json not corrupted (${finalText})`);
  } finally {
    // cleanup — zero orphans
    for (const f of created.folders) await bucket.deleteFiles({ prefix: `${f}/` }).catch(() => {});
    for (const s of created.sessions) await db.doc(`${DATA}/be_chart_edit_sessions/${s}`).delete().catch(() => {});
    for (const t of created.treatments) await db.doc(`${DATA}/be_treatments/${t}`).delete().catch(() => {});
    let orphan = 0;
    for (const f of created.folders) { const [files] = await bucket.getFiles({ prefix: `${f}/` }); orphan += files.length; }
    assert(orphan === 0, `cleanup: zero orphan Storage objects (${orphan})`);
  }

  console.log(fails === 0 ? `\nALL PASS (0 FAIL)` : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error('e2e error:', e.message, e.stack); process.exit(1); });
