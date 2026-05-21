// scripts/set-storage-cors.mjs — Rule M infra op: set Firebase Storage bucket CORS.
//
// WHY: the Tablet Chart Editor is the first feature that browser-fetch()es a Storage
// download URL (downloadTransportImageAsDataUrl → fetch(firebasestorage URL) → canvas).
// Everything else in the app stored image bytes as data URLs in Firestore, so the
// bucket never needed CORS. With cors:null, the browser blocks the cross-origin fetch
// → iPad template blank + PC "รับรูปจากแท็บเล็ตไม่สำเร็จ".
//
// SECURITY: the access control is the per-object download TOKEN in the URL (?token=),
// NOT CORS. CORS only governs which browser ORIGINS may read a response they already
// have the token for. origin:['*'] for GET/HEAD is the standard config for token-gated
// public-download Storage — it grants NO access (no token = 403 regardless of CORS).
//
// Reads .env.local.prod (FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY).
// Usage:  node scripts/set-storage-cors.mjs           (dry-run — prints current + desired)
//         node scripts/set-storage-cors.mjs --apply   (sets it + re-reads to verify)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const APP_ID = 'loverclinic-opd-4c39b';
const BUCKET = 'loverclinic-opd-4c39b.firebasestorage.app';

const DESIRED_CORS = [{
  origin: ['*'],                       // token-gated; CORS grants no access (see header)
  method: ['GET', 'HEAD'],
  responseHeader: ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'],
  maxAgeSeconds: 3600,
}];

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

const env = loadEnv('.env.local.prod');
initializeApp({
  credential: cert({
    projectId: APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
  }),
  storageBucket: BUCKET,
});
const bucket = getStorage().bucket();
const apply = process.argv.includes('--apply');

async function main() {
  const [before] = await bucket.getMetadata();
  console.log('current cors:', JSON.stringify(before.cors || null));
  console.log('desired cors:', JSON.stringify(DESIRED_CORS));
  const already = JSON.stringify(before.cors || null) === JSON.stringify(DESIRED_CORS);
  if (already) { console.log('IDEMPOTENT: already set, no change.'); process.exit(0); }
  if (!apply) { console.log('DRY-RUN: pass --apply to set. No change made.'); process.exit(0); }
  await bucket.setCorsConfiguration(DESIRED_CORS);
  const [after] = await bucket.getMetadata();
  console.log('APPLIED. new cors:', JSON.stringify(after.cors || null));
  process.exit(0);
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
