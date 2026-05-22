// DIAG (Rule R) — find treatments that have charts[] populated. Then dump
// the chart entry shape to see what works in production.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.argv[1] !== fileURLToPath(import.meta.url)) { process.exit(1); }
const APP_ID = 'loverclinic-opd-4c39b';
const env = (await readFile('.env.local.prod', 'utf8'))
  .split('\n').filter(Boolean).reduce((acc, line) => {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/); if (m) acc[m[1]] = m[2]; return acc;
  }, {});
initializeApp({ credential: cert({
  projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
}) });
const db = getFirestore();
const base = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const snap = await base.collection('be_treatments').orderBy('createdAt', 'desc').limit(200).get();
console.log(`Scanning ${snap.size} most-recent treatments for charts[].length > 0...\n`);
let count = 0;
snap.forEach(d => {
  const data = d.data();
  const charts = data.detail?.charts || [];
  if (charts.length > 0 && count < 5) {
    count++;
    console.log(`\n=== ${d.id} (${data.createdAt}) — ${charts.length} chart(s) ===`);
    charts.forEach((c, i) => {
      console.log(`  charts[${i}]:`);
      for (const [k, v] of Object.entries(c)) {
        const t = v?.constructor?.name || typeof v;
        const display = typeof v === 'string' && v.length > 60 ? `String(len=${v.length})` : JSON.stringify(v)?.slice(0, 80);
        console.log(`    ${k} [${t}]: ${display}`);
      }
    });
  }
});
console.log(`\nFound ${count} treatments with charts in recent 200. ${snap.size === 200 ? '(scanned 200 most-recent)' : ''}`);
process.exit(0);
