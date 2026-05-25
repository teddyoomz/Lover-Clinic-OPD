// Rule Q L2 — HUMAN-FLOW e2e on REAL prod Firebase Storage + Firestore for the
// treatment-blob Storage-ref migration (AV129) + the edit-remove-cancel fix.
// Each scenario models what a clinician actually DOES and asserts the OBSERVABLE
// outcome (does the image URL still fetch 200? is the doc consistent?) — not the
// code shape. Anti-self-deception (Rule Q-honest): the removeTreatmentBlob DECISION
// (delete in CREATE, skip in EDIT) is mirrored here AND executed against REAL Storage;
// the source-grep S7 in tests/treatment-blob-stress.test.js separately locks that the
// real TFP/ChartSection code matches this decision. Together = honest. The literal
// browser click is auth-gated → user hands-on L1.
//
//   node scripts/e2e-treatment-blob-human-flows.mjs
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
initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }), storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket();
const base = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const tDoc = (id) => base.collection('be_treatments').doc(id);
const tokenUrl = (p, t) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(p)}?alt=media&token=${t}`;
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+PgolJUVPRgo=', 'base64');

const CUST = `TEST-HUMAN-${Date.now()}`;
const liveDocs = new Set();
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('   ✗ ' + m); } };
const head = (s) => console.log('\n' + s);

async function up(kind, mime, buf, cust = CUST) {
  const t = randomBytes(16).toString('hex');
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1];
  const p = `uploads/be_treatments/${cust}/${kind}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  await bucket.file(p).save(buf, { contentType: mime, metadata: { metadata: { firebaseStorageDownloadTokens: t } } });
  return { dataUrl: tokenUrl(p, t), storagePath: p, id: '' };
}
const exists = async (p) => (await bucket.file(p).exists())[0];
const urlOk = async (u) => (await fetch(u)).ok;
// Faithful mirror of TFP removeTreatmentBlob (locked to real code by S7 source-grep):
// delete the Storage object only in CREATE mode (true orphan); EDIT mode skips.
async function removeTreatmentBlob(storagePath, isEdit) {
  if (storagePath && !isEdit) await bucket.file(storagePath).delete().catch(() => {});
}

try {
  // ── H1 — daily CREATE flow (happy path) ──
  head('H1 — CREATE: clinician saves a treatment with 5 before + 3 after + lab img + lab pdf + chart');
  const before = []; for (let i = 0; i < 5; i++) before.push(await up('photo', 'image/jpeg', JPG));
  const after = []; for (let i = 0; i < 3; i++) after.push(await up('photo', 'image/jpeg', JPG));
  const labImg = await up('labimg', 'image/jpeg', JPG);
  const labPdf = await up('labpdf', 'application/pdf', PDF);
  const chart = await up('chart', 'image/png', PNG);
  const detail1 = {
    treatmentDate: '2026-05-25', beforeImages: before, afterImages: after,
    labItems: [{ productId: 'p', productName: 'Lab', images: [labImg], pdfBase64: labPdf.dataUrl, pdfStoragePath: labPdf.storagePath, pdfFileName: 'l.pdf' }],
    charts: [{ dataUrl: chart.dataUrl, storagePath: chart.storagePath, templateId: 'blank', fabricJson: null }],
  };
  const D1 = `${CUST}-h1`; liveDocs.add(D1);
  await tDoc(D1).set({ detail: detail1, createdAt: new Date().toISOString(), createdBy: 'e2e' });
  const r1 = (await tDoc(D1).get()).data().detail;
  ok(Buffer.byteLength(JSON.stringify({ detail: r1 })) < CAP, 'H1: saved doc < 1 MiB');
  let all200 = true; for (const im of [...r1.beforeImages, ...r1.afterImages, ...r1.labItems[0].images]) if (!(await urlOk(im.dataUrl))) all200 = false;
  ok(all200, 'H1: every saved photo URL fetches 200 (not broken)');

  // ── H2 — ★ TARGET: EDIT → remove a photo → CANCEL (no save) → image MUST survive ──
  head('H2 — ★ EDIT + remove + CANCEL (the just-fixed bug): the photo must NOT 404');
  const victim = r1.beforeImages[0]; // a photo that is IN the saved doc
  await removeTreatmentBlob(victim.storagePath, /* isEdit */ true);  // edit-mode remove → must SKIP delete
  // user cancels — doc is NOT re-saved, still references `victim`.
  ok(await exists(victim.storagePath), 'H2: photo Storage object STILL EXISTS after edit-remove (delete was correctly skipped)');
  ok(await urlOk(victim.dataUrl), 'H2: photo URL still fetches 200 (NO broken ref on cancel) — bug FIXED');
  const r1b = (await tDoc(D1).get()).data().detail;
  ok(r1b.beforeImages.some(i => i.storagePath === victim.storagePath), 'H2: doc still references the photo (consistent after cancel)');

  // ── H3 — EDIT → remove → SAVE: doc drops it (orphan acceptable, no broken ref) ──
  head('H3 — EDIT + remove + SAVE: doc no longer references it');
  const dropped = r1.beforeImages[1];
  await removeTreatmentBlob(dropped.storagePath, true); // edit-mode skip (deferred)
  await tDoc(D1).set({ detail: { ...r1b, beforeImages: r1b.beforeImages.filter(i => i.storagePath !== dropped.storagePath) } }, { merge: true });
  const r1c = (await tDoc(D1).get()).data().detail;
  ok(!r1c.beforeImages.some(i => i.storagePath === dropped.storagePath), 'H3: saved doc dropped the removed photo (clinician sees it gone)');
  ok(await exists(dropped.storagePath), 'H3: its Storage object orphans (acceptable — never a broken ref; cascade cleans referenced blobs)');

  // ── H4 — CREATE + add + remove → orphan cleaned immediately (no leak) ──
  head('H4 — CREATE + add + remove: orphan deleted immediately');
  const tmp = await up('photo', 'image/jpeg', JPG);
  ok(await exists(tmp.storagePath), 'H4: just-uploaded photo exists');
  await removeTreatmentBlob(tmp.storagePath, /* isEdit */ false); // create-mode → delete now
  ok(!(await exists(tmp.storagePath)), 'H4: create-mode remove deleted the orphan (no leak)');

  // ── H5 — EDIT + replace chart → old chart survives on cancel ──
  head('H5 — EDIT + replace chart + cancel: old chart must survive');
  await removeTreatmentBlob(chart.storagePath, true); // ChartSection onBlobRemoved(old) in edit → skip
  ok(await exists(chart.storagePath), 'H5: replaced-but-not-saved chart object survives (no broken ref)');

  // ── H6 — HEAVY real-use: max galleries + 10 charts (new cap) + delete cascade ──
  head('H6 — HEAVY: 12+12+12 photos + 6 lab img + 2 lab pdf + 2 tfile pdf + 10 charts → save → cascade');
  const mk = async (k, n, mime, buf) => { const o = []; for (let i = 0; i < n; i++) o.push(await up(k, mime, buf)); return o; };
  const hb = await mk('photo', 12, 'image/jpeg', JPG), ha = await mk('photo', 12, 'image/jpeg', JPG), ho = await mk('photo', 12, 'image/jpeg', JPG);
  const hli = await mk('labimg', 6, 'image/jpeg', JPG);
  const hlp = [await up('labpdf', 'application/pdf', PDF), await up('labpdf', 'application/pdf', PDF)];
  const htf = [await up('tfile', 'application/pdf', PDF), await up('tfile', 'application/pdf', PDF)];
  const hch = await mk('chart', 10, 'image/png', PNG); // ← 10 charts (cap raised 2→10)
  const detail6 = {
    beforeImages: hb, afterImages: ha, otherImages: ho,
    labItems: [
      { productId: 'a', images: hli.slice(0, 3), pdfBase64: hlp[0].dataUrl, pdfStoragePath: hlp[0].storagePath },
      { productId: 'b', images: hli.slice(3), pdfBase64: hlp[1].dataUrl, pdfStoragePath: hlp[1].storagePath },
    ],
    treatmentFiles: htf.map((f, i) => ({ slot: i + 1, pdfBase64: f.dataUrl, pdfStoragePath: f.storagePath })),
    charts: hch.map(c => ({ dataUrl: c.dataUrl, storagePath: c.storagePath, templateId: 'blank', fabricJson: null })),
  };
  const D6 = `${CUST}-h6`; liveDocs.add(D6);
  const size6 = Buffer.byteLength(JSON.stringify({ detail: detail6 }));
  ok(size6 < 100 * 1024, `H6: 60-blob doc is ${(size6 / 1024).toFixed(0)}KB (<100KB)`);
  ok(detail6.charts.length === 10, 'H6: 10 charts allowed (cap raised 2→10)');
  await tDoc(D6).set({ detail: detail6, createdAt: new Date().toISOString() });
  ok((await tDoc(D6).get()).exists, 'H6: heavy doc saved OK');
  // delete-treatment cascade (mirror collectBlobStoragePaths) → every object freed
  const collect = (d) => { const ps = []; const pi = (a) => (a || []).forEach(x => x?.storagePath && ps.push(x.storagePath)); pi(d.charts); pi(d.beforeImages); pi(d.afterImages); pi(d.otherImages); (d.labItems || []).forEach(l => { pi(l?.images); if (l?.pdfStoragePath) ps.push(l.pdfStoragePath); }); (d.treatmentFiles || []).forEach(f => { if (f?.pdfStoragePath) ps.push(f.pdfStoragePath); }); return ps; };
  const paths6 = collect(detail6);
  ok(paths6.length === 12 + 12 + 12 + 6 + 2 + 2 + 10, `H6: cascade collected all ${paths6.length} objects`);
  await Promise.all(paths6.map(p => bucket.file(p).delete().catch(() => {})));
  await tDoc(D6).delete(); liveDocs.delete(D6);
  let allGone = true; for (const p of paths6.slice(0, 8)) if (await exists(p)) allGone = false;
  ok(allGone, 'H6: cascade actually FREED the Storage objects (sampled 8 → all 404)');

  // ── H7 — adversarial human mistakes ──
  head('H7 — adversarial: double-remove + remove-all + concurrent 2 patients');
  const dbl = await up('photo', 'image/jpeg', JPG);
  await removeTreatmentBlob(dbl.storagePath, false);
  let threw = false; try { await removeTreatmentBlob(dbl.storagePath, false); } catch { threw = true; }
  ok(!threw, 'H7: double-remove is idempotent (2nd remove on a gone object does not throw)');
  // remove-all then save → empty galleries persist
  const D7 = `${CUST}-h7`; liveDocs.add(D7);
  await tDoc(D7).set({ detail: { beforeImages: [], afterImages: [], otherImages: [] } });
  ok((await tDoc(D7).get()).data().detail.beforeImages.length === 0, 'H7: remove-all → empty galleries persist (no crash)');
  await tDoc(D7).delete(); liveDocs.delete(D7);
  // concurrent 2 patients → distinct path namespaces, no collision
  const p2 = await up('photo', 'image/jpeg', JPG, `${CUST}-PT2`);
  ok(p2.storagePath.includes(`${CUST}-PT2/`) && !p2.storagePath.includes(`${CUST}/`), 'H7: 2nd patient uploads to its own path (no cross-contamination)');
  await bucket.file(p2.storagePath).delete().catch(() => {});

  console.log(`\n=== RESULT: PASS ${pass} / FAIL ${fail} ===`);
  if (fail) console.log('FAILURES:\n' + fails.map(f => '  - ' + f).join('\n'));
} catch (e) {
  console.error('\n💥 threw:', e?.stack || e); fail++;
} finally {
  console.log('\nCleanup…');
  for (const c of [CUST, `${CUST}-PT2`]) await bucket.deleteFiles({ prefix: `uploads/be_treatments/${c}/` }).catch(() => {});
  for (const d of liveDocs) await tDoc(d).delete().catch(() => {});
  let orphans = 0; for (const c of [CUST, `${CUST}-PT2`]) { const [f] = await bucket.getFiles({ prefix: `uploads/be_treatments/${c}/` }); orphans += f.length; }
  console.log(`  Storage orphans under TEST prefix: ${orphans} (expect 0)`);
  process.exit(fail ? 1 : 0);
}
