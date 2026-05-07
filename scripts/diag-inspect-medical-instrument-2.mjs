#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envFile = '.env.local.prod';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: 'loverclinic-opd-4c39b',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const db = getFirestore();

(async () => {
  const doc = await db.collection('artifacts').doc('loverclinic-opd-4c39b').collection('public').doc('data').collection('be_medical_instruments').doc('2').get();
  console.log('exists:', doc.exists);
  const data = doc.data();
  console.log('keys:', Object.keys(data || {}));
  console.log('costPrice:', JSON.stringify(data?.costPrice), 'type:', typeof data?.costPrice);
  console.log('costPrice value:', data?.costPrice);
  console.log('---');
  console.log('full doc data:');
  console.log(JSON.stringify(data, null, 2));
  // Also test JSON round-trip on this specific value
  if (data?.costPrice !== undefined) {
    const round = JSON.parse(JSON.stringify({ x: data.costPrice }));
    console.log('round-trip costPrice:', round.x, '— same:', round.x === data.costPrice);
  } else {
    console.log('costPrice is undefined in live data — that\'s why it\'s missing in file (JSON drops undefined).');
  }
})();
