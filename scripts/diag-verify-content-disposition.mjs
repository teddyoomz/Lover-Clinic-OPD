#!/usr/bin/env node
// Quick verifier: confirm signed URL from production has
// Content-Disposition: attachment header (V40-prod-fix-4 verification).
// Cleans up the test backup at end.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]; if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const FIREBASE_WEB_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const PROD_URL = 'https://lover-clinic-app.vercel.app';
const BUCKET = `${APP_ID}.firebasestorage.app`;

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
    storageBucket: BUCKET,
  });
}

async function main() {
  console.log('═══ V40-prod-fix-4 verification ═══\n');
  const customToken = await getAuth().createCustomToken(`verify-fix-4-${Date.now()}`, { admin: true });
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  const { idToken } = await r.json();

  console.log('─── Test 1: small backup (T1 only) ───');
  const ex1 = await fetch(`${PROD_URL}/api/admin/branch-backup-export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ branchId: 'BR-1778136097138-98199ef5', tiers: ['T1'], isAutoPreFresh: false }), // ทดลอง 1
  });
  const j1 = await ex1.json();
  console.log(`  HTTP ${ex1.status}, size: ${j1.sizeBytes} bytes`);
  console.log(`  signedUrl includes response-content-disposition: ${j1.signedUrl.includes('response-content-disposition')}`);

  // HEAD the signed URL to inspect actual response headers from GCS
  const head = await fetch(j1.signedUrl, { method: 'HEAD' });
  console.log(`  GCS HEAD status: ${head.status}`);
  console.log(`  Content-Type: ${head.headers.get('content-type')}`);
  console.log(`  Content-Disposition: ${head.headers.get('content-disposition')}`);
  console.log(`  Content-Length: ${head.headers.get('content-length')}`);

  if (head.headers.get('content-disposition')?.toLowerCase().startsWith('attachment')) {
    console.log('  ✅ Content-Disposition: attachment header set — browser WILL download');
  } else {
    console.log('  ❌ Content-Disposition NOT set to attachment — browser would render inline');
  }

  // Cleanup
  const bucket = getStorage().bucket();
  await bucket.file(j1.storagePath).delete();
  console.log(`  🧹 Deleted ${j1.storagePath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
}
