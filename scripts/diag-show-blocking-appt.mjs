// Read-only diag: dump the full be_appointments doc that's blocking new bookings.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
function loadEnv() {
  const raw = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
  });
  const db = getFirestore();

  const apptsRef = db.collection(`artifacts/${APP_ID}/public/data/be_appointments`);

  console.log('=== All 12 be_appointments docs (full shape) ===\n');
  const snap = await apptsRef.get();
  for (const d of snap.docs) {
    console.log(`--- ${d.id} ---`);
    console.log(JSON.stringify(d.data(), null, 2));
    console.log();
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
