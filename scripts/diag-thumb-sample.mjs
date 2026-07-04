// diag-thumb-sample.mjs — Rule R read-only: pull sample backfilled thumbUrls +
// HTTP-verify they actually serve (the 543-thumb backfill URL-shape check).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}
const APP_ID = 'loverclinic-opd-4c39b';

async function main() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  const app = initializeApp({
    credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: key }),
  });
  const db = getFirestore(app);
  const snap = await db.collection(`artifacts/${APP_ID}/public/data/be_treatments`)
    .orderBy('_thumbBackfilledAt', 'desc').limit(5).get();
  const samples = [];
  for (const d of snap.docs) {
    const det = d.data().detail || {};
    for (const k of ['beforeImages', 'afterImages', 'otherImages']) {
      for (const x of det[k] || []) if (x.thumbUrl && samples.length < 5) samples.push({ doc: d.id, url: x.thumbUrl });
    }
    (det.labItems || []).forEach(l => (l.images || []).forEach(x => { if (x.thumbUrl && samples.length < 5) samples.push({ doc: d.id, url: x.thumbUrl }); }));
  }
  console.log(`samples: ${samples.length}`);
  for (const s of samples) {
    const res = await fetch(s.url, { method: 'GET' });
    const buf = res.ok ? await res.arrayBuffer() : null;
    console.log(`${res.status} ${res.headers.get('content-type')} ${buf ? (buf.byteLength / 1024).toFixed(1) + 'KB' : ''} — ${s.doc}`);
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
