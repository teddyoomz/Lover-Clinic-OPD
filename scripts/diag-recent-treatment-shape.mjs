// DIAG (Rule R) — inspect the SHAPE of recent be_treatments docs to look for
// anything that could trigger "Property detail contains an invalid nested
// entity". Reads top 5 most-recent treatments + dumps detail field types.
//
// READ-ONLY.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  console.error('Direct invocation only.');
  process.exit(1);
}

const APP_ID = 'loverclinic-opd-4c39b';
const env = (await readFile('.env.local.prod', 'utf8'))
  .split('\n').filter(Boolean).reduce((acc, line) => {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) acc[m[1]] = m[2];
    return acc;
  }, {});
initializeApp({ credential: cert({
  projectId: APP_ID,
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
}) });
const db = getFirestore();
const base = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const snap = await base.collection('be_treatments').orderBy('createdAt', 'desc').limit(5).get();
console.log(`Found ${snap.size} recent treatments\n`);
snap.forEach(d => {
  const data = d.data();
  console.log(`\n=== ${d.id} (createdAt: ${data.createdAt}) ===`);
  console.log(`top-level keys: ${Object.keys(data).join(', ')}`);
  const detail = data.detail || {};
  console.log(`\ndetail keys: ${Object.keys(detail).join(', ')}`);
  // Inspect chart entries specifically
  if (Array.isArray(detail.charts)) {
    console.log(`\ndetail.charts.length = ${detail.charts.length}`);
    detail.charts.forEach((c, i) => {
      console.log(`  charts[${i}] keys: ${Object.keys(c).join(', ')}`);
      for (const [k, v] of Object.entries(c)) {
        const t = v?.constructor?.name || typeof v;
        const display = typeof v === 'string' && v.length > 60 ? `String(len=${v.length})` : JSON.stringify(v)?.slice(0, 80);
        console.log(`    ${k} [${t}]: ${display}`);
      }
    });
  }
  // Specifically look for Timestamp / class instances anywhere nested
  function findClassInstances(obj, path = 'detail') {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      const p = `${path}.${k}`;
      if (v === null || v === undefined) continue;
      const ctor = v.constructor?.name;
      if (ctor && ctor !== 'Object' && ctor !== 'Array') {
        console.log(`  ⚠ NESTED ${ctor} at ${p}: ${String(v).slice(0, 80)}`);
      } else if (Array.isArray(v)) {
        v.forEach((item, i) => findClassInstances(item, `${p}[${i}]`));
      } else if (typeof v === 'object') {
        findClassInstances(v, p);
      }
    }
  }
  findClassInstances(detail);
});
process.exit(0);
