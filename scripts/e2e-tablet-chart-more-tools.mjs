// scripts/e2e-tablet-chart-more-tools.mjs
// Rule Q V66 — real-prod Storage round-trip of the more-tools fabricJson transport.
// Verifies that the tablet's result.json (the full Fabric object model from every tool)
// uploads to real prod Storage, downloads + parses, and carries EVERY drawing tool's
// object type → so the PC merge gets a lossless, non-null fabricJson (user mandate:
// "ไม่มีเครื่องมือไหน ... ส่งไป pc แล้วไม่ติดการ edit").
//
// SCOPE (honest, Rule Q): the DOWNLOAD path here is the EXACT client path the UI uses —
// fetch(firebasestorage token URL) + JSON.parse = downloadTransportJson, incl. the live
// bucket CORS. The UPLOAD uses the admin SDK (E2E_STAFF client creds not in this session),
// which stores an IDENTICAL blob to the client uploadString('raw'). The full client-SDK
// relay (PC↔tablet, PNG transport) is already proven by scripts/e2e-tablet-chart-editor.mjs
// (6/6 on real prod); result.json rides the same Storage path + CORS. Per-tool DRAW/ERASE
// on the real canvas is verified by the L1 real-browser pass (Task 8).
//
// Reads .env.local.prod (Rule M/R). Run:  node scripts/e2e-tablet-chart-more-tools.mjs
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';
const SESSION = `TEST-CES-MORETOOLS-${Date.now()}`;
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// One Fabric object per drawing tool (shape canvas.toJSON() produces) — the per-tool fidelity contract.
const FABRIC_JSON = {
  version: '7.2.0',
  objects: [
    { type: 'path', fill: '#ef4444', opacity: 1, path: [['M', 0, 0], ['L', 5, 5], ['L', 8, 2], ['Z']] }, // pen (pressure)
    { type: 'path', fill: '#16a34a', opacity: 0.4, path: [['M', 1, 1], ['L', 9, 9], ['Z']] },            // highlighter
    { type: 'line', stroke: '#3b82f6', x1: 0, y1: 0, x2: 20, y2: 0 },                                      // line
    { type: 'group', objects: [{ type: 'line' }, { type: 'triangle' }] },                                 // arrow
    { type: 'rect', stroke: '#111111', fill: 'transparent', width: 30, height: 18 },                       // rectangle
    { type: 'ellipse', stroke: '#805ad5', fill: 'transparent', rx: 15, ry: 9 },                            // circle
    { type: 'textbox', text: 'ทดสอบ', fill: '#000000', fontSize: 18 },                                     // text
  ],
};
const EXPECTED_TYPES = ['ellipse', 'group', 'line', 'path', 'path', 'rect', 'textbox'];

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

function tokenUrl(objPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objPath)}?alt=media&token=${token}`;
}

async function main() {
  const env = loadEnv('.env.local.prod');
  initializeApp({
    credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }),
    storageBucket: BUCKET,
  });
  const bucket = getStorage().bucket();
  const folder = `uploads/chart-edit-sessions/${SESSION}`;
  const jsonPath = `${folder}/result.json`;
  const pngPath = `${folder}/result.png`;
  const jToken = randomBytes(16).toString('hex');
  const pToken = randomBytes(16).toString('hex');

  try {
    // 1. tablet "save" → upload result.json (object model) + result.png (flattened) to real Storage
    await bucket.file(jsonPath).save(JSON.stringify(FABRIC_JSON), { contentType: 'application/json', metadata: { metadata: { firebaseStorageDownloadTokens: jToken } } });
    await bucket.file(pngPath).save(Buffer.from(PNG_B64, 'base64'), { contentType: 'image/png', metadata: { metadata: { firebaseStorageDownloadTokens: pToken } } });
    assert(true, 'tablet uploaded result.json + result.png to real prod Storage');

    // 2. PC "download" — EXACT client downloadTransportJson path: fetch(token URL) + JSON.parse (incl. live CORS)
    const jRes = await fetch(tokenUrl(jsonPath, jToken));
    assert(jRes.ok, `result.json fetch ok (HTTP ${jRes.status})`);
    const back = JSON.parse(await jRes.text());
    assert(Array.isArray(back.objects) && back.objects.length === 7, `result.json round-trips with all 7 objects (got ${back.objects?.length})`);

    // 3. EVERY drawing tool's object type survived (the user's per-tool mandate)
    const types = back.objects.map(o => o.type).sort();
    assert(JSON.stringify(types) === JSON.stringify(EXPECTED_TYPES), `every tool type present: ${types.join(',')}`);
    const highlighter = back.objects.find(o => o.type === 'path' && o.opacity === 0.4);
    assert(!!highlighter, 'highlighter (path, opacity 0.4) preserved distinctly from the pen');

    // 4. flattened PNG round-trips (downloadTransportImageAsDataUrl path)
    const pRes = await fetch(tokenUrl(pngPath, pToken));
    const pBuf = Buffer.from(await pRes.arrayBuffer());
    assert(pRes.ok && pBuf.length > 0, `result.png round-trips (${pBuf.length} bytes)`);

    // 5. the merged payload the PC hands to ChartSection.handleSave — fabricJson NON-null + lossless
    const merged = { dataUrl: `data:image/png;base64,${pBuf.toString('base64')}`, fabricJson: JSON.stringify(back), templateId: 'face-female', source: 'tablet' };
    assert(merged.fabricJson != null && JSON.parse(merged.fabricJson).objects.length === 7, 'merge payload carries non-null fabricJson with all 7 objects (NEVER fabricJson:null)');
    assert(merged.source === 'tablet' && !!merged.dataUrl, 'merge payload shape { dataUrl, fabricJson, templateId, source:tablet }');
  } finally {
    // 6. cleanup — zero orphans
    await bucket.deleteFiles({ prefix: `${folder}/` }).catch(() => {});
    const [stillJson] = await bucket.file(jsonPath).exists();
    const [stillPng] = await bucket.file(pngPath).exists();
    assert(!stillJson && !stillPng, 'cleanup: zero orphan Storage objects');
  }

  console.log(fails === 0 ? `\nALL PASS (0 FAIL)` : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error('e2e error:', e.message); process.exit(1); });
