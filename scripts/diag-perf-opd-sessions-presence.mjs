// Rule R READ-ONLY — confirm the WRITE path: do opd_sessions that did a
// perf assessment actually carry adam_/iief_/symp_pe on patientData? And do
// any be_customers carry them? Proves where the data lives vs. where it drops.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const PERF = ['symp_pe', ...Array.from({ length: 10 }, (_, i) => `adam_${i + 1}`), ...Array.from({ length: 5 }, (_, i) => `iief_${i + 1}`)];
const perfPresent = (o) => PERF.filter((k) => o && Object.prototype.hasOwnProperty.call(o, k));

async function main() {
  const db = initAdmin();
  const data = base(db);
  console.log('═══ perf-field presence by collection (READ-ONLY) ═══\n');

  for (const col of ['opd_sessions', 'be_customers']) {
    const snap = await data.collection(col).get();
    let withPerf = 0;
    const examples = [];
    for (const d of snap.docs) {
      const x = d.data();
      const pd = x.patientData || {};
      const inPd = perfPresent(pd);
      const inTop = perfPresent(x);
      if (inPd.length || inTop.length) {
        withPerf++;
        if (examples.length < 3) {
          const nm = `${pd.firstName || x.firstname || ''} ${pd.lastName || x.lastname || ''}`.trim();
          examples.push(`    ${col}/${d.id}  "${nm}"  patientData:${inPd.length} top:${inTop.length}  reasons=${JSON.stringify(pd.visitReasons || x.visit_reasons)}`);
        }
      }
    }
    console.log(`${col}: ${snap.size} docs; ${withPerf} carry ≥1 perf field`);
    examples.forEach((e) => console.log(e));
    console.log('');
  }
  console.log('═══ done ═══');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
