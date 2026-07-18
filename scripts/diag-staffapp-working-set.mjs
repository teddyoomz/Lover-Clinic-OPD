// Staff-app daily working-set size vs the 40MB default Firestore cache cap
// (READ-ONLY, Rule R). Sums raw JSON of every data collection; IndexedDB
// stores ~2-3x raw JSON (keys+indexes+leveldb overhead).
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}
const env = loadEnv();
if (getApps().length === 0) {
  initializeApp({ credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }), ignoreUndefinedProperties: true });
}
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';

const cols = await db.doc(BASE).listCollections();
let grand = 0;
const rows = [];
for (const c of cols) {
  const snap = await c.get();
  const bytes = snap.docs.reduce((s, d) => s + JSON.stringify(d.data()).length, 0);
  grand += bytes;
  rows.push({ name: c.id, docs: snap.size, kb: bytes / 1024 });
}
rows.sort((a, b) => b.kb - a.kb);
for (const r of rows.slice(0, 20)) {
  console.log(`${r.name.padEnd(30)} docs=${String(r.docs).padStart(5)}  ${r.kb.toFixed(0).padStart(7)} KB`);
}
console.log(`... (${rows.length} collections total)`);
console.log(`GRAND TOTAL raw JSON: ${(grand / 1024 / 1024).toFixed(1)} MB  → est. IndexedDB footprint ~${(grand * 2.5 / 1024 / 1024).toFixed(0)} MB vs 40 MB default cache cap`);
