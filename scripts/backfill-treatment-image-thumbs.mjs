// scripts/backfill-treatment-image-thumbs.mjs — Q3=B (2026-07-05, user-approved
// --apply): generate ~320px thumbnails for EXISTING treatment images so old
// image-heavy TFP pages get the same fast grid as new uploads.
//
// Rule M two-phase: dry-run by default (counts + size report); --apply commits.
// Idempotent: entries that already carry thumbUrl are skipped (re-run = 0).
// Scope: be_treatments.detail.{beforeImages,afterImages,otherImages} +
//        detail.labItems[].images — entries WITH storagePath and WITHOUT
//        thumbUrl. Legacy inline data: URLs (no storagePath) skip naturally
//        (they live in the doc — no network cost to display).
// Forensic: doc-level _thumbBackfilledAt ISO stamp on every patched doc.
// Audit: be_admin_audit/backfill-treatment-image-thumbs-{ts}-{hex}.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import sharp from 'sharp';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const APPLY = process.argv.includes('--apply');
const THUMB_MAX = 320;
const THUMB_QUALITY = 70;

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getStorage } = await import('firebase-admin/storage');

const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
const app = initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: key,
  }),
  storageBucket: `${APP_ID}.firebasestorage.app`,
});
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

const COL = `artifacts/${APP_ID}/public/data/be_treatments`;

const IMAGE_ARRAYS = ['beforeImages', 'afterImages', 'otherImages'];

function thumbPathFor(storagePath) {
  return `${storagePath}__thumb.jpg`;
}

async function makeAndUploadThumb(storagePath) {
  const [bytes] = await bucket.file(storagePath).download();
  const thumb = await sharp(bytes)
    .rotate() // honor EXIF orientation
    .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer();
  const tPath = thumbPathFor(storagePath);
  const token = randomBytes(16).toString('hex');
  await bucket.file(tPath).save(thumb, {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(tPath)}?alt=media&token=${token}`;
  return { thumbUrl: url, thumbStoragePath: tPath, bytesIn: bytes.length, bytesOut: thumb.length };
}

function collectCandidates(detail) {
  const out = []; // [{arrKey, labIdx|null, imgIdx, storagePath}]
  for (const k of IMAGE_ARRAYS) {
    (detail?.[k] || []).forEach((img, i) => {
      if (img?.storagePath && !img?.thumbUrl) out.push({ arrKey: k, labIdx: null, imgIdx: i, storagePath: img.storagePath });
    });
  }
  (detail?.labItems || []).forEach((lab, li) => {
    (lab?.images || []).forEach((img, i) => {
      if (img?.storagePath && !img?.thumbUrl) out.push({ arrKey: 'labItems', labIdx: li, imgIdx: i, storagePath: img.storagePath });
    });
  });
  return out;
}

async function main() {
  console.log(`=== backfill-treatment-image-thumbs — ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`);
  const snap = await db.collection(COL).get();
  console.log(`scanned be_treatments: ${snap.size} docs`);

  let docsWithWork = 0, entries = 0, patched = 0, failed = 0, bytesIn = 0, bytesOut = 0;
  const failures = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const detail = data?.detail || {};
    const candidates = collectCandidates(detail);
    if (candidates.length === 0) continue;
    docsWithWork += 1;
    entries += candidates.length;
    if (!APPLY) continue;

    // deep-copy the arrays we mutate (admin SDK returns plain objects)
    const newDetail = { ...detail };
    for (const k of IMAGE_ARRAYS) if (newDetail[k]) newDetail[k] = newDetail[k].map(x => ({ ...x }));
    if (newDetail.labItems) newDetail.labItems = newDetail.labItems.map(l => ({ ...l, images: (l.images || []).map(x => ({ ...x })) }));

    let docPatched = 0;
    for (const c of candidates) {
      try {
        const { thumbUrl, thumbStoragePath, bytesIn: bi, bytesOut: bo } = await makeAndUploadThumb(c.storagePath);
        bytesIn += bi; bytesOut += bo;
        const target = c.arrKey === 'labItems'
          ? newDetail.labItems[c.labIdx].images[c.imgIdx]
          : newDetail[c.arrKey][c.imgIdx];
        target.thumbUrl = thumbUrl;
        target.thumbStoragePath = thumbStoragePath;
        docPatched += 1;
      } catch (e) {
        failed += 1;
        failures.push({ doc: doc.id, path: c.storagePath, err: String(e?.message || e).slice(0, 120) });
      }
    }
    if (docPatched > 0) {
      await doc.ref.update({ detail: newDetail, _thumbBackfilledAt: new Date().toISOString() });
      patched += docPatched;
      console.log(`  patched ${doc.id}: ${docPatched}/${candidates.length} thumbs`);
    }
  }

  console.log(`\ndocs with work: ${docsWithWork} · entries needing thumbs: ${entries}`);
  if (APPLY) {
    console.log(`patched entries: ${patched} · failed: ${failed}`);
    console.log(`downloaded ${(bytesIn / 1048576).toFixed(1)} MB → thumbs ${(bytesOut / 1048576).toFixed(2)} MB`);
    if (failures.length) console.log('failures:', JSON.stringify(failures.slice(0, 10), null, 1));
    const auditId = `backfill-treatment-image-thumbs-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.doc(`artifacts/${APP_ID}/public/data/be_admin_audit/${auditId}`).set({
      op: 'backfill-treatment-image-thumbs',
      scanned: snap.size, docsWithWork, entries, patched, failed,
      thumbMaxDim: THUMB_MAX, thumbQuality: THUMB_QUALITY,
      appliedAt: new Date().toISOString(),
    });
    console.log(`audit doc: ${auditId}`);
  } else {
    console.log('(dry-run — รัน --apply เพื่อสร้าง thumb จริง)');
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
