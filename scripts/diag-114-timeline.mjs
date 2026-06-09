#!/usr/bin/env node
// Rule R READ-ONLY — full course-change + sale timeline for LC-26000114.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
const ts = (v) => (v && v.toDate ? v.toDate().toISOString() : v) || '';

async function main() {
  const db = initAdmin();
  const data = base(db);
  const cid = process.argv[2] || 'LC-26000114';

  const ch = await data.collection('be_course_changes').where('customerId', '==', cid).get();
  const rows = ch.docs.map(d => ({ id: d.id, x: d.data() })).sort((a, b) => String(ts(a.x.createdAt)).localeCompare(String(ts(b.x.createdAt))));
  console.log(`ALL ${rows.length} be_course_changes for ${cid} (time order):`);
  for (const r of rows) {
    console.log(`  ${ts(r.x.createdAt)}  kind=${r.x.kind}  from="${r.x.fromCourse?.name || ''}" prod="${r.x.fromCourse?.product || ''}"  to="${r.x.toCourse?.name || ''}"  qty="${r.x.qtyBefore || ''}"->"${r.x.qtyAfter || ''}" d=${r.x.qtyDelta ?? ''}  staff="${r.x.staffName || ''}" reason="${r.x.reason || ''}"`);
  }

  const sa = await data.collection('be_sales').where('customerId', '==', cid).get();
  const srows = sa.docs.map(d => ({ id: d.id, x: d.data() })).sort((a, b) => String(ts(a.x.createdAt)).localeCompare(String(ts(b.x.createdAt))));
  console.log(`\nALL ${srows.length} be_sales for ${cid} (time order):`);
  for (const s of srows) {
    const cs = (s.x.items && s.x.items.courses) || [];
    console.log(`  ${ts(s.x.createdAt)}  INV=${s.x.invoiceNumber || s.id} src="${s.x.source || ''}" note="${s.x.saleNote || ''}" courses=${JSON.stringify(cs.map(c => c?.name))}`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('DIAG ERROR:', e); process.exit(1); });
}
