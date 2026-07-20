// ─── backfill-legacy-treatment-blobs.mjs (2026-07-21) — Rule M two-phase ────
// Moves LEGACY inline base64 blobs (data:image/* | data:application/pdf) still
// embedded in be_treatments docs → Firebase Storage, replacing each string with
// the SAME tokened download-URL shape the client's uploadTreatmentBlob produces
// (readers accept both data: and http URLs — src/lib/treatmentImageUpload.js:12).
//
// Why: 3 pre-2026-05-25 docs remain at 1021KB (100% of the 1MiB cap) / 889KB /
// 609KB — any edit+save of the 1021KB doc is REJECTED by Firestore. This
// permanently retires the last place the 1MB cap can fire.
//
//   node scripts/backfill-legacy-treatment-blobs.mjs           (dry-run)
//   node scripts/backfill-legacy-treatment-blobs.mjs --apply   (upload + write)
//
// Rule M: dry-run default · audit doc · idempotent (re-run → 0) · forensic
// stamps (_legacyBlobBackfilledAt/_legacyBlobBackfillCount) · crypto random.
// V81-fix1 SAFETY: doc data is mutated IN PLACE (string leaves swapped only) —
// never JSON round-tripped — so Timestamp instances survive the set() verbatim.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';
const APPLY = process.argv.includes('--apply');
const BLOB_RE = /^data:(image\/[a-z0-9.+-]+|application\/pdf);base64,/i;
const MIN_LEN = 1000; // ignore tiny data: strings (icons/placeholders)

function loadEnv() {
  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) return;
  const raw = readFileSync(new URL('../.env.local.prod', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function isFirestoreNative(v) {
  // Never descend into SDK class instances (Timestamp/GeoPoint/Buffer/Ref).
  return v instanceof Timestamp || Buffer.isBuffer(v) ||
    (v && typeof v === 'object' && typeof v.toMillis === 'function');
}

/** Collect every replaceable inline blob: {parent, key, jsonPath, mime, len}. */
function collectBlobs(node, jsonPath, out) {
  if (node == null || isFirestoreNative(node)) return out;
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (typeof v === 'string') {
        if (v.length >= MIN_LEN && BLOB_RE.test(v)) out.push({ parent: node, key: i, jsonPath: `${jsonPath}[${i}]`, mime: v.slice(5, v.indexOf(';')), len: v.length });
      } else collectBlobs(v, `${jsonPath}[${i}]`, out);
    });
    return out;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') {
        if (v.length >= MIN_LEN && BLOB_RE.test(v)) out.push({ parent: node, key: k, jsonPath: `${jsonPath}.${k}`, mime: v.slice(5, v.indexOf(';')), len: v.length });
      } else collectBlobs(v, `${jsonPath}.${k}`, out);
    }
  }
  return out;
}

function extFromMime(mime) {
  let ext = mime.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  if (ext === 'jpeg') ext = 'jpg';
  else if (ext.startsWith('svg')) ext = 'svg';
  return ext;
}

async function main() {
  loadEnv();
  if (!getApps().length) {
    const pk = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    initializeApp({
      credential: cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: pk }),
      storageBucket: BUCKET,
    });
  }
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const base = `artifacts/${APP_ID}/public/data`;

  const snap = await db.collection(`${base}/be_treatments`).get();
  const targets = [];
  for (const d of snap.docs) {
    const data = d.data();
    const blobs = collectBlobs(data, '$', []);
    if (blobs.length) targets.push({ id: d.id, ref: d.ref, data, blobs, kb: Math.round(JSON.stringify(data).length / 1024) });
  }
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — scanned ${snap.size} be_treatments · docs with inline blobs: ${targets.length}\n`);

  const audit = { scanned: snap.size, docsTouched: 0, blobsUploaded: 0, bytesMoved: 0, docs: [] };
  for (const t of targets) {
    const customerId = String(t.data.customerId || t.id).replace(/[^A-Za-z0-9_-]/g, '_');
    console.log(`— ${t.id} (${t.kb}KB, customer=${customerId}) · ${t.blobs.length} blob(s)`);
    const uploaded = [];
    for (const b of t.blobs) {
      const ext = extFromMime(b.mime);
      const token = randomBytes(16).toString('hex');
      const storagePath = `uploads/be_treatments/${customerId}/legacy-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
      console.log(`    ${b.jsonPath}  ${b.mime}  ${Math.round(b.len / 1024)}KB  →  ${storagePath}`);
      if (APPLY) {
        const buf = Buffer.from(String(b.parent[b.key]).split(',')[1], 'base64');
        await bucket.file(storagePath).save(buf, {
          contentType: b.mime,
          metadata: { metadata: { firebaseStorageDownloadTokens: token, legacyBackfillFrom: t.id } },
        });
        const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
        b.parent[b.key] = url;
        // Mirror client sibling conventions for the delete cascade:
        if (!Array.isArray(b.parent)) {
          if (b.key === 'dataUrl' && !b.parent.storagePath) b.parent.storagePath = storagePath;
          if (b.key === 'pdfBase64' && !b.parent.pdfStoragePath) b.parent.pdfStoragePath = storagePath;
        }
        uploaded.push({ jsonPath: b.jsonPath, storagePath, url, bytes: buf.length });
      }
      audit.blobsUploaded += 1;
      audit.bytesMoved += b.len;
    }
    if (APPLY) {
      t.data._legacyBlobBackfilledAt = FieldValue.serverTimestamp();
      t.data._legacyBlobBackfillCount = t.blobs.length;
      await t.ref.set(t.data); // in-place-mutated original — Timestamps preserved (V81-fix1)
      // Post-write verify: re-read → no inline left + size shrank + URLs serve 200
      const after = await t.ref.get();
      const remain = collectBlobs(after.data(), '$', []);
      const afterKb = Math.round(JSON.stringify(after.data()).length / 1024);
      let urlsOk = 0;
      for (const u of uploaded) {
        const resp = await fetch(u.url);
        if (resp.ok) { urlsOk += 1; await resp.arrayBuffer(); }
        else console.log(`    ✗ URL NOT OK (${resp.status}): ${u.url}`);
      }
      console.log(`    ✓ ${t.kb}KB → ${afterKb}KB · inline remaining=${remain.length} · URLs 200: ${urlsOk}/${uploaded.length}`);
      if (remain.length || urlsOk !== uploaded.length) throw new Error(`VERIFY FAILED on ${t.id}`);
    }
    audit.docsTouched += 1;
    audit.docs.push(t.id);
  }

  if (APPLY && targets.length) {
    const auditId = `legacy-treatment-blob-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.doc(`${base}/be_admin_audit/${auditId}`).set({ op: 'legacy-treatment-blob-backfill', ...audit, appliedAt: FieldValue.serverTimestamp() });
    console.log(`\naudit doc: be_admin_audit/${auditId}`);
  }
  console.log(`\n${APPLY ? 'DONE' : 'no writes (dry-run)'} — docs=${audit.docsTouched} blobs=${audit.blobsUploaded} moved=${Math.round(audit.bytesMoved / 1024)}KB`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
}
