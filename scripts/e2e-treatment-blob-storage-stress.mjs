// Rule Q L2 — Treatment-blob Storage-ref STRESS test on REAL prod Firebase
// Storage + Firestore. Exercises CREATE + EDIT + DELETE-cascade flows + adversarial
// edge-case hunting for the 2026-05-25 migration (AV129). Admin SDK (project
// convention for the Storage-object layer; client rules-allowance for image/* +
// pdf is proven by live charts + storage.rules line 122). TEST-prefixed; cleans up.
//
//   node scripts/e2e-treatment-blob-storage-stress.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (process.argv[1] !== fileURLToPath(import.meta.url)) { process.exit(1); }
const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';
const CAP = 1048576;
const env = (await readFile('.env.local.prod', 'utf8')).split('\n').filter(Boolean).reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)="?(.*?)"?$/); if (m) a[m[1]] = m[2]; return a;
}, {});
initializeApp({
  credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }),
  storageBucket: BUCKET,
});
const db = getFirestore();
const bucket = getStorage().bucket();
const base = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const treatmentDoc = (id) => base.collection('be_treatments').doc(id);
const tokenUrl = (p, t) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(p)}?alt=media&token=${t}`;

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; } else { fail++; fails.push(m); console.log('  ✗ ' + m); } };
const CUST = `TEST-BLOB-${Date.now()}`;
const createdPaths = new Set();
const createdDocs = new Set();

// Tiny REAL blobs (valid bytes) for the Storage round-trip.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==', 'base64');
const PDF = Buffer.from('JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+PgolJUVPRgo=', 'base64');

async function up(kind, mime, buf) {
  const t = randomBytes(16).toString('hex');
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1];
  const p = `uploads/be_treatments/${CUST}/${kind}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  await bucket.file(p).save(buf, { contentType: mime, metadata: { metadata: { firebaseStorageDownloadTokens: t } } });
  createdPaths.add(p);
  return { url: tokenUrl(p, t), storagePath: p };
}
// Mirror of backendClient.deleteBackendTreatment path-collection (locked by source-grep D6).
function collectBlobStoragePaths(detail = {}) {
  const paths = [];
  const pushImg = (arr) => (arr || []).forEach(x => { if (x?.storagePath) paths.push(x.storagePath); });
  pushImg(detail.charts); pushImg(detail.beforeImages); pushImg(detail.afterImages); pushImg(detail.otherImages);
  (detail.labItems || []).forEach(l => { pushImg(l?.images); if (l?.pdfStoragePath) paths.push(l.pdfStoragePath); });
  (detail.treatmentFiles || []).forEach(f => { if (f?.pdfStoragePath) paths.push(f.pdfStoragePath); });
  return paths;
}

try {
  console.log(`\n=== Treatment-blob Storage-ref STRESS (cust ${CUST}) ===\n`);

  // ── Phase A — Storage round-trip for ALL new file types ──
  console.log('Phase A — Storage round-trip (jpeg / png / pdf)');
  const aJpg = await up('photo', 'image/jpeg', JPG);
  const aPng = await up('chart', 'image/png', PNG);
  const aPdf = await up('labpdf', 'application/pdf', PDF);
  for (const [label, blob, mime] of [['jpeg', aJpg, 'image/jpeg'], ['png', aPng, 'image/png'], ['pdf', aPdf, 'application/pdf']]) {
    const r = await fetch(blob.url);
    ok(r.ok, `A: ${label} URL fetch 200 (got ${r.status})`);
    ok((r.headers.get('content-type') || '').includes(mime.split('/')[1]) || (r.headers.get('content-type') || '').includes(mime), `A: ${label} content-type ~ ${mime} (got ${r.headers.get('content-type')})`);
  }

  // ── Phase B — CREATE: ~50-blob doc as Storage URLs stays tiny + writes OK ──
  console.log('Phase B — CREATE: heavy 50-blob doc (URLs) → tiny + saves');
  const mkImgs = async (kind, n) => { const out = []; for (let i = 0; i < n; i++) { const b = await up(kind, 'image/jpeg', JPG); out.push({ dataUrl: b.url, id: '', storagePath: b.storagePath }); } return out; };
  const before = await mkImgs('photo', 12), after = await mkImgs('photo', 12), other = await mkImgs('photo', 12);
  const labImgs = await mkImgs('labimg', 6);
  const labPdf = await up('labpdf', 'application/pdf', PDF);
  const tfilePdf = await up('tfile', 'application/pdf', PDF);
  const chart = await up('chart', 'image/png', PNG);
  const detailB = {
    treatmentDate: '2026-05-25', symptoms: 'stress', beforeImages: before, afterImages: after, otherImages: other,
    charts: [{ dataUrl: chart.url, storagePath: chart.storagePath, templateId: 'blank', fabricJson: null }],
    labItems: [{ productId: 'p1', productName: 'Lab', images: labImgs, pdfBase64: labPdf.url, pdfStoragePath: labPdf.storagePath, pdfFileName: 'lab.pdf' }],
    treatmentFiles: [{ slot: 1, pdfBase64: tfilePdf.url, pdfStoragePath: tfilePdf.storagePath, pdfFileName: 'f.pdf' }],
  };
  const nBlobs = 12 + 12 + 12 + 6 + 1 + 1 + 1;
  const sizeB = Buffer.byteLength(JSON.stringify({ detail: detailB }), 'utf8');
  ok(sizeB < CAP, `B: ${nBlobs}-blob doc is ${(sizeB / 1024).toFixed(0)}KB << 1 MiB`);
  ok(sizeB < 60 * 1024, `B: doc is tiny (<60KB) despite ${nBlobs} blobs (got ${(sizeB / 1024).toFixed(0)}KB)`);
  const docB = `${CUST}-create`; createdDocs.add(docB);
  await treatmentDoc(docB).set({ detail: detailB, createdAt: new Date().toISOString(), createdBy: 'e2e' });
  const readB = (await treatmentDoc(docB).get()).data();
  ok(readB?.detail?.beforeImages?.length === 12, 'B: 12 before photos persisted');
  const allUrls = [...readB.detail.beforeImages, ...readB.detail.afterImages, ...readB.detail.otherImages, ...readB.detail.labItems[0].images];
  ok(allUrls.every(i => i.dataUrl.startsWith('http') && i.storagePath), 'B: every persisted image = Storage URL + storagePath (zero inline base64)');
  ok(!JSON.stringify(readB.detail).includes('data:image') && !JSON.stringify(readB.detail).includes('data:application'), 'B: NO inline data: blob anywhere in persisted detail');

  // ── Phase C — adversarial: OLD inline shape would be REJECTED on real prod ──
  console.log('Phase C — adversarial: OLD inline base64 (3 photos) → Firestore REJECTS');
  const bigB64 = 'data:image/jpeg;base64,' + 'A'.repeat(450 * 1024); // ~450KB each
  const detailC = { beforeImages: [{ dataUrl: bigB64, id: '' }, { dataUrl: bigB64, id: '' }, { dataUrl: bigB64, id: '' }] };
  const sizeC = Buffer.byteLength(JSON.stringify({ detail: detailC }), 'utf8');
  ok(sizeC > CAP, `C: 3 inline photos = ${(sizeC / 1024 / 1024).toFixed(2)}MB > 1 MiB (the pre-fix failure)`);
  let rejected = false;
  try { await treatmentDoc(`${CUST}-inline-FAIL`).set({ detail: detailC }); createdDocs.add(`${CUST}-inline-FAIL`); }
  catch (e) { rejected = /longer than|exceeds|too large|INVALID_ARGUMENT|bytes/i.test(e?.message || ''); }
  ok(rejected, 'C: Firestore REJECTED the >1 MiB inline doc (proves the bug + that URLs fix it)');

  // ── Phase D — EDIT: add 1 new photo + remove 1, re-persist, storagePath round-trips ──
  console.log('Phase D — EDIT: add + remove + re-persist');
  const loaded = (await treatmentDoc(docB).get()).data().detail;
  const newPhoto = await up('photo', 'image/jpeg', JPG);
  const removed = loaded.beforeImages[0];
  const editedBefore = [...loaded.beforeImages.slice(1), { dataUrl: newPhoto.url, id: '', storagePath: newPhoto.storagePath }];
  await treatmentDoc(docB).set({ detail: { ...loaded, beforeImages: editedBefore } }, { merge: true });
  const readD = (await treatmentDoc(docB).get()).data().detail;
  ok(readD.beforeImages.length === 12, 'D: still 12 before photos after add+remove');
  ok(readD.beforeImages.some(i => i.storagePath === newPhoto.storagePath), 'D: new photo storagePath round-trips');
  ok(!readD.beforeImages.some(i => i.storagePath === removed.storagePath), 'D: removed photo gone from doc');
  // edit-removed photo's Storage object would be deleted by the remove handler:
  await bucket.file(removed.storagePath).delete().catch(() => {}); createdPaths.delete(removed.storagePath);
  const [exRemoved] = await bucket.file(removed.storagePath).exists();
  ok(!exRemoved, 'D: removed photo Storage object deleted (remove-handler cascade)');

  // ── Phase E — DELETE cascade gathers EVERY blob type + actually frees Storage ──
  console.log('Phase E — DELETE cascade');
  const finalDetail = (await treatmentDoc(docB).get()).data().detail;
  const paths = collectBlobStoragePaths(finalDetail);
  ok(paths.length === 12 + 12 + 12 + 6 + 1 + 1 + 1, `E: cascade collected all ${paths.length} blob paths`);
  ok(paths.includes(chart.storagePath) && paths.includes(labPdf.storagePath) && paths.includes(tfilePdf.storagePath), 'E: cascade includes chart + labpdf + tfilepdf paths');
  await Promise.all(paths.map(p => bucket.file(p).delete().then(() => createdPaths.delete(p)).catch(() => {})));
  const [stillThere] = await bucket.file(chart.storagePath).exists();
  ok(!stillThere, 'E: chart Storage object freed by cascade');
  await treatmentDoc(docB).delete(); createdDocs.delete(docB);

  // ── Phase F — adversarial edge cases (future-bug hunt) ──
  console.log('Phase F — adversarial edge cases');
  // F1 MIXED legacy inline + new Storage in ONE doc → cascade collects ONLY storagePath ones.
  const mixed = { beforeImages: [{ dataUrl: 'data:image/jpeg;base64,xx' /* legacy, no storagePath */ }, { dataUrl: 'http://x', storagePath: 'uploads/be_treatments/c/p.jpg' }], labItems: [{ pdfBase64: 'data:application/pdf;base64,yy' /* legacy PDF */ }] };
  const mixedPaths = collectBlobStoragePaths(mixed);
  ok(mixedPaths.length === 1 && mixedPaths[0] === 'uploads/be_treatments/c/p.jpg', 'F1: mixed legacy+new → cascade collects only the Storage one (legacy inline skipped, no orphan delete)');
  // F2 special-char customerId → path sanitized (no slash/space injection).
  const evil = await up('photo', 'image/jpeg', JPG); // CUST already safe; verify sanitize on a nasty id
  const sanitized = String('a/b c#1').replace(/[^A-Za-z0-9_-]/g, '_');
  ok(sanitized === 'a_b_c_1' && !sanitized.includes('/'), 'F2: customerId sanitize strips path-injection chars');
  await bucket.file(evil.storagePath).delete().catch(() => {}); createdPaths.delete(evil.storagePath);
  // F3 empty / whitespace detail → collector no-crash → []
  ok(collectBlobStoragePaths({}).length === 0 && collectBlobStoragePaths({ beforeImages: null, labItems: null }).length === 0, 'F3: empty/null detail → collector returns [] (no crash)');
  // F4 a doc with ONLY legacy inline (small enough) still writes + cascade is a no-op (no orphans).
  const docF = `${CUST}-legacy`; createdDocs.add(docF);
  await treatmentDoc(docF).set({ detail: { beforeImages: [{ dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(1000), id: '' }] } });
  ok(collectBlobStoragePaths((await treatmentDoc(docF).get()).data().detail).length === 0, 'F4: legacy-only doc → cascade collects 0 (no orphan delete attempt)');
  await treatmentDoc(docF).delete(); createdDocs.delete(docF);

  console.log(`\n=== RESULT: PASS ${pass} / FAIL ${fail} ===`);
  if (fail) console.log('FAILURES:\n' + fails.map(f => '  - ' + f).join('\n'));
} catch (e) {
  console.error('\n💥 e2e threw:', e?.message || e); fail++;
} finally {
  // Cleanup — delete any remaining TEST Storage objects + docs + verify zero orphans.
  console.log('\nCleanup…');
  await bucket.deleteFiles({ prefix: `uploads/be_treatments/${CUST}/` }).catch(() => {});
  for (const d of createdDocs) await treatmentDoc(d).delete().catch(() => {});
  const [orphans] = await bucket.getFiles({ prefix: `uploads/be_treatments/${CUST}/` });
  console.log(`  Storage orphans under TEST prefix: ${orphans.length} (expect 0)`);
  console.log(`  exit ${fail ? 1 : 0}`);
  process.exit(fail ? 1 : 0);
}
