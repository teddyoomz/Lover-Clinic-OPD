#!/usr/bin/env node
// Diagnostic: hit deployed /api/admin/branch-backup-export with a real admin
// idToken and capture the full JSON response (including the `detail` field
// the UI hides). Prints raw e.message from the production catch block.
//
// Why: V41/V40 user reports EXPORT_FAILED on Vercel. UI displays only
// json.error ('EXPORT_FAILED') but discards json.detail (e.message).
// We need the actual error to identify root cause.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}

async function main() {
  // 1. Mint a custom token for diag uid with admin:true claim
  const diagUid = `diag-V41-${Date.now()}`;
  const customToken = await getAuth().createCustomToken(diagUid, { admin: true });
  console.log(`✓ Custom token minted for ${diagUid} (admin claim)`);

  // 2. Exchange custom token → idToken via Identity Toolkit
  const exchangeRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const exchangeData = await exchangeRes.json();
  if (!exchangeRes.ok || !exchangeData.idToken) {
    console.error('✗ Token exchange FAILED:', exchangeData);
    process.exit(1);
  }
  const idToken = exchangeData.idToken;
  console.log(`✓ idToken obtained (length ${idToken.length})`);

  // 3. Test 1: hit /api/admin/branch-backup-export (the failing endpoint user reports)
  console.log('\n═══ TEST 1: /api/admin/branch-backup-export ═══');
  const branchId = 'BR-1777873556815-26df6480'; // นครราชสีมา (real prod branch)
  const exportRes = await fetch(`${PROD_URL}/api/admin/branch-backup-export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ branchId, tiers: ['T1'], collections: null, isAutoPreFresh: false }),
  });
  console.log(`HTTP ${exportRes.status}`);
  const exportText = await exportRes.text();
  let exportJson;
  try { exportJson = JSON.parse(exportText); } catch { exportJson = { _raw: exportText.slice(0, 500) }; }
  console.log('Response:', JSON.stringify(exportJson, null, 2));

  // 4. Test 2: hit the simpler /api/admin/users to verify auth works
  console.log('\n═══ TEST 2: /api/admin/users (auth-sanity probe) ═══');
  const usersRes = await fetch(`${PROD_URL}/api/admin/users?action=list`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  console.log(`HTTP ${usersRes.status}`);
  const usersText = await usersRes.text();
  let usersJson;
  try { usersJson = JSON.parse(usersText); } catch { usersJson = { _raw: usersText.slice(0, 200) }; }
  // Just print first 2 users + count, to confirm auth + Firestore both work
  if (usersJson.users) {
    console.log(`✓ Auth + Firestore reach OK — ${usersJson.users.length} users returned`);
  } else {
    console.log('Response:', JSON.stringify(usersJson, null, 2));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
}
