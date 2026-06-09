#!/usr/bin/env node
// Rule R READ-ONLY — verify SALE stock movements carry customerId (C3 assumption).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp as adminInit, cert, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
const APP_ID = 'loverclinic-opd-4c39b';
function loadEnvLocal() { const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8'); const out = {}; for (const line of txt.split(/\r?\n/)) { if (!line || line.startsWith('#')) continue; const eq = line.indexOf('='); if (eq < 0) continue; const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); out[k] = v; } return out; }
function initAdmin() { if (adminApps().length) return adminFirestore(); const env = loadEnvLocal(); adminInit({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n') }) }); return adminFirestore(); }
const base = (db) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
async function main() {
  const db = initAdmin(); const data = base(db);
  const snap = await data.collection('be_stock_movements').limit(600).get();
  const sale = snap.docs.map(d => ({ id: d.id, x: d.data() })).filter(m => m.x.linkedSaleId);
  const tx = snap.docs.map(d => ({ id: d.id, x: d.data() })).filter(m => m.x.linkedTreatmentId);
  const saleC = sale.filter(m => m.x.customerId);
  const txC = tx.filter(m => m.x.customerId);
  console.log(`scanned ${snap.size}: SALE movements=${sale.length} (with customerId=${saleC.length}); TREATMENT movements=${tx.length} (with customerId=${txC.length})`);
  for (const m of sale.slice(0, 3)) console.log(`  SALE [${m.id}] linkedSaleId=${m.x.linkedSaleId} customerId=${m.x.customerId ?? '(NONE)'}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch(e => { console.error('ERR', e.message); process.exit(1); });
