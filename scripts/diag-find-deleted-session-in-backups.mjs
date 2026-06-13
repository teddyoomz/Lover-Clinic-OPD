// Rule R READ-ONLY — search whole-system backups for a deleted opd_session.
// ภูดิท's session is gone from live opd_sessions; if a 03:00 backup captured it
// while it existed, the REAL per-item perf answers (adam_*/iief_*) survive in
// backups/whole-system/{name}/opd_sessions.json. Usage:
//   node scripts/diag-find-deleted-session-in-backups.mjs "เนินพลกรัง"
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getStorage as adminStorage } from 'firebase-admin/storage';

const APP_ID = 'loverclinic-opd-4c39b';
const NEEDLE = (process.argv[2] || 'เนินพลกรัง').trim();
const BUCKET = `${APP_ID}.firebasestorage.app`;

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (!adminApps().length) { const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }), storageBucket: BUCKET }); } return { db: adminFirestore(), bucket: adminStorage().bucket(BUCKET) }; }
const PERF = ['symp_pe', ...Array.from({ length: 10 }, (_, i) => `adam_${i + 1}`), ...Array.from({ length: 5 }, (_, i) => `iief_${i + 1}`), ...Array.from({ length: 11 }, (_, i) => `mrs_${i + 1}`)];

async function main() {
  const { bucket } = initAdmin();
  console.log(`═══ search whole-system backups for "${NEEDLE}" (READ-ONLY) ═══\n`);
  const [files] = await bucket.getFiles({ prefix: 'backups/whole-system/' });
  // group by folder
  const folders = new Map();
  for (const f of files) {
    const m = f.name.match(/^backups\/whole-system\/([^/]+)\//);
    if (!m) continue;
    if (!folders.has(m[1])) folders.set(m[1], []);
    folders.get(m[1]).push(f);
  }
  const folderNames = [...folders.keys()].sort().reverse(); // newest name first
  console.log(`backup folders (${folderNames.length}): ${folderNames.join(', ')}\n`);

  for (const folder of folderNames) {
    const sessFile = folders.get(folder).find((f) => /\/opd_sessions\.json$/.test(f.name));
    if (!sessFile) { console.log(`  ${folder}: (no opd_sessions.json)`); continue; }
    let docs;
    try {
      const [buf] = await sessFile.download();
      const parsed = JSON.parse(buf.toString('utf8'));
      docs = Array.isArray(parsed) ? parsed : (parsed.docs || parsed.documents || Object.values(parsed));
    } catch (e) { console.log(`  ${folder}: parse error ${e.message}`); continue; }
    let hit = null;
    for (const d of docs) {
      const data = d.data || d.fields || d; // tolerate wrapper shapes
      const pd = data.patientData || {};
      const blob = JSON.stringify(pd) + JSON.stringify(data);
      if (blob.includes(NEEDLE)) { hit = { id: d.id || d.__id__ || '?', pd, data }; break; }
    }
    if (hit) {
      console.log(`  ✓ ${folder}: FOUND opd_sessions/${hit.id}`);
      const perf = {};
      for (const k of PERF) if (hit.pd[k] !== undefined) perf[k] = hit.pd[k];
      const truthy = Object.fromEntries(Object.entries(perf).filter(([, v]) => v === true || (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v))));
      console.log(`      ALL perf keys: ${JSON.stringify(perf)}`);
      console.log(`      MEANINGFUL: ${JSON.stringify(truthy)}`);
      console.log(`      reasons=${JSON.stringify(hit.pd.visitReasons)} formType=${hit.data.formType ?? '-'}`);
    } else {
      console.log(`  · ${folder}: ${docs.length} sessions, no match`);
    }
  }
  console.log(`\n═══ done ═══`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
