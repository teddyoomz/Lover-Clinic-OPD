// Rule R diag (READ-ONLY) — do real be_products carry productType/status values
// NOT in the strict <select> option lists? If so the edit modal shows the wrong
// option (V145-class) + validateProduct blocks save until the field is re-picked.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));
const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const app = initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) });
  return getFirestore(app);
}
const col = (db, n) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(n);

const TYPE_OPTS = ['ยา', 'สินค้าหน้าร้าน', 'สินค้าสิ้นเปลือง', 'บริการ'];
const STATUS_OPTS = ['ใช้งาน', 'พักใช้งาน'];

async function main() {
  const db = getAdmin();
  const snap = await col(db, 'be_products').get();
  const types = new Map(), statuses = new Map();
  let offType = 0, offStatus = 0;
  const offTypeSamples = [], offStatusSamples = [];
  for (const doc of snap.docs) {
    const x = doc.data();
    const t = x.productType == null ? '(missing)' : String(x.productType);
    types.set(t, (types.get(t) || 0) + 1);
    const s = x.status == null ? '(missing)' : String(x.status);
    statuses.set(s, (statuses.get(s) || 0) + 1);
    if (!TYPE_OPTS.includes(x.productType)) { offType++; if (offTypeSamples.length < 10) offTypeSamples.push(`${doc.id} "${x.productName}" type=${JSON.stringify(x.productType)} branch=${x.branchId}`); }
    if (x.status != null && !STATUS_OPTS.includes(x.status)) { offStatus++; if (offStatusSamples.length < 10) offStatusSamples.push(`${doc.id} "${x.productName}" status=${JSON.stringify(x.status)}`); }
  }
  console.log(`be_products: ${snap.size}\n`);
  console.log('productType distribution:');
  for (const [k, v] of [...types].sort((a, b) => b[1] - a[1])) console.log(`  ${TYPE_OPTS.includes(k) ? '✓' : '⚠ OFF-LIST'} ${JSON.stringify(k)}: ${v}`);
  console.log(`\n⚠ off-list productType docs (modal shows wrong option + save blocked): ${offType}`);
  offTypeSamples.forEach(s => console.log('   ' + s));
  console.log('\nstatus distribution:');
  for (const [k, v] of [...statuses].sort((a, b) => b[1] - a[1])) console.log(`  ${k === '(missing)' || STATUS_OPTS.includes(k) ? '✓' : '⚠ OFF-LIST'} ${JSON.stringify(k)}: ${v}`);
  console.log(`\n⚠ off-list status docs (non-null): ${offStatus}`);
  offStatusSamples.forEach(s => console.log('   ' + s));
  console.log('\n✓ diag complete (read-only)');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
