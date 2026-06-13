// Rule R READ-ONLY — broaden: scan opd_sessions + be_customers, match needle
// against ANY string in the doc; dump perf-assessment fields + where the
// name/phone live. Usage: node scripts/diag-perf-assessment-fields2.mjs [needle]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const NEEDLE = (process.argv[2] || 'เนินพลกรัง').trim();

function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

const PERF_KEYS = ['symp_pe', ...Array.from({ length: 10 }, (_, i) => `adam_${i + 1}`), ...Array.from({ length: 5 }, (_, i) => `iief_${i + 1}`)];
const describe = (v) => `${JSON.stringify(v)} (${v === undefined ? 'undefined' : typeof v})`;

function deepHas(obj, needle, depth = 0) {
  if (depth > 4 || obj == null) return false;
  if (typeof obj === 'string') return obj.includes(needle);
  if (typeof obj !== 'object') return false;
  for (const v of Object.values(obj)) if (deepHas(v, needle, depth + 1)) return true;
  return false;
}

function dumpPerf(label, container) {
  let present = 0, truthy = 0;
  const lines = [];
  for (const k of PERF_KEYS) {
    const has = container && Object.prototype.hasOwnProperty.call(container, k);
    if (has) present++;
    if (container && container[k]) truthy++;
    lines.push(`     ${has ? (container[k] ? '✓' : '·') : '✗'} ${k.padEnd(9)} = ${describe(container?.[k])}${has ? '' : '   ← ABSENT'}`);
  }
  console.log(`  [${label}] perf fields: ${present}/${PERF_KEYS.length} present, ${truthy} truthy`);
  if (present > 0) lines.forEach((l) => console.log(l));
}

async function scan(data, col) {
  const snap = await data.collection(col).get();
  const out = [];
  for (const d of snap.docs) {
    const x = d.data();
    if (deepHas(x, NEEDLE)) out.push({ id: d.id, x });
  }
  console.log(`\n=== ${col}: scanned ${snap.size}, matched ${out.length} ===`);
  for (const m of out) {
    const x = m.x;
    const pd = x.patientData || {};
    const nm = `${pd.firstName || x.firstName || pd.firstname || x.firstname || ''} ${pd.lastName || x.lastName || pd.lastname || x.lastname || ''}`.trim() || pd.name || x.name || '?';
    console.log(`\n${col}/${m.id}  name="${nm}"  phone="${pd.phone || x.phone || ''}"  status=${x.status ?? '-'}  formType=${x.formType ?? '-'}`);
    console.log(`  visitReasons=${JSON.stringify(pd.visitReasons || x.visitReasons)}  hrtGoals=${JSON.stringify(pd.hrtGoals || x.hrtGoals)}`);
    console.log(`  top-level keys (${Object.keys(x).length}): ${Object.keys(x).sort().join(', ')}`);
    console.log(`  patientData keys (${Object.keys(pd).length}): ${Object.keys(pd).sort().join(', ')}`);
    dumpPerf('patientData', pd);
    dumpPerf('top-level', x); // perf fields stored at session top-level?
    // be_customers may store sessions/intake under a subkey
    for (const sk of ['intakeData', 'opdData', 'lastIntake', 'opd']) {
      if (x[sk] && typeof x[sk] === 'object') dumpPerf(`x.${sk}`, x[sk]);
    }
  }
  return out;
}

async function main() {
  const db = initAdmin();
  const data = base(db);
  console.log(`═══ diag2 perf-assessment — needle "${NEEDLE}" (READ-ONLY) ═══`);
  await scan(data, 'opd_sessions');
  await scan(data, 'be_customers');
  console.log(`\n═══ done ═══`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
