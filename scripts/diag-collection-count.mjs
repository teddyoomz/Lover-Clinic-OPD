#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local.prod');
const content = readFileSync(envPath, 'utf8');
const env = {};
for (const line of content.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
}
const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }),
});
const db = getFirestore();
const APP_ID = 'loverclinic-opd-4c39b';
const BASE = `artifacts/${APP_ID}/public/data`;

async function countCol(name) {
  const t = Date.now();
  const snap = await db.collection(`${BASE}/${name}`).count().get();
  return { name, count: snap.data().count, ms: Date.now() - t };
}

const cols = ['be_customers', 'be_appointments', 'be_deposits', 'be_sales', 'be_memberships', 'be_staff_schedules', 'be_treatments', 'opd_sessions', 'be_recalls', 'be_customer_wallets'];
const results = await Promise.all(cols.map(countCol));
console.log('\n=== Collection counts (real prod) ===\n');
for (const r of results) {
  console.log(`  ${r.name.padEnd(25)} ${String(r.count).padStart(7)}  (${r.ms}ms)`);
}
console.log('');
