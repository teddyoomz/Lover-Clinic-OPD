#!/usr/bin/env node
// Rule R diag (READ-ONLY) — dump be_course_changes for a customer with ALL fields
// to find the treatment-ref field name + whether deduction (kind=use) entries exist.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const env = readFileSync('.env.local.prod', 'utf8').split('\n').reduce((a, l) => {
  const m = l.match(/^([^#=]+)=(.*)$/); if (m) a[m[1].trim()] = m[2].trim().replace(/^"|"$/g, ''); return a;
}, {});
if (getApps().length === 0) initializeApp({ credential: cert({
  projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
  clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
}), ignoreUndefinedProperties: true });
const db = getFirestore();
const BASE = 'artifacts/loverclinic-opd-4c39b/public/data';
const CID = process.argv[2] || 'LC-26000115';
const ts = (v) => { try { return v?.toDate ? v.toDate().toISOString() : v; } catch { return String(v); } };
async function main() {
  const snap = await db.collection(`${BASE}/be_course_changes`).where('customerId', '==', CID).get();
  console.log(`be_course_changes for ${CID}: ${snap.size}\n`);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => String(ts(a.createdAt)).localeCompare(String(ts(b.createdAt))));
  for (const r of rows) {
    console.log(`id=${r.id}`);
    console.log(JSON.stringify({ ...r, createdAt: ts(r.createdAt) }, null, 1));
    console.log('---');
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
