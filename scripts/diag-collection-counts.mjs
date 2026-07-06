// diag-collection-counts.mjs — Rule R READ-ONLY: aggregate-count the collections
// behind perf punchlist P3 items (justify/reject query-narrowing risk by SIZE).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}
const APP_ID = 'loverclinic-opd-4c39b';

async function main() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  const app = initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: key }) });
  const db = getFirestore(app);
  const cols = ['opd_sessions', 'be_treatments', 'be_appointments', 'be_stock_movements',
    'chat_conversations', 'chat_history', 'clinic_schedules', 'be_recalls', 'admin_presence',
    'be_customers', 'be_sales', 'be_deposits', 'be_memberships'];
  for (const c of cols) {
    const snap = await db.collection(`artifacts/${APP_ID}/public/data/${c}`).count().get();
    console.log(c.padEnd(22), snap.data().count);
  }
  // opd_sessions archived split (P3 #22 risk assessment)
  const arch = await db.collection(`artifacts/${APP_ID}/public/data/opd_sessions`).where('isArchived', '==', true).count().get();
  console.log('opd_sessions archived=true', arch.data().count);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
