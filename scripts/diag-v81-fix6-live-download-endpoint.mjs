#!/usr/bin/env node
// Rule R diag — hit the LIVE deployed Download endpoint with admin token
// to capture the actual runtime error (not just the cryptic client message).

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const APP_ID = 'loverclinic-opd-4c39b';
const PROD_URL = 'https://lover-clinic-app.vercel.app';

function loadEnv() {
  for (const name of ['.env.local.prod', '.env.local', '.env']) {
    try {
      const txt = readFileSync(resolve(REPO_ROOT, name), 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (!m) continue;
        if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
      }
      return;
    } catch { /* try next */ }
  }
}

function initAdmin() {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
  });
}

async function main() {
  loadEnv();
  initAdmin();
  const auth = getAuth();

  // Find an admin user (one with admin custom claim)
  const owner = await auth.getUserByEmail('loverclinic@loverclinic.com');
  console.log(`Owner uid: ${owner.uid}`);
  console.log(`Owner claims: ${JSON.stringify(owner.customClaims || {})}`);

  // Mint a custom token + exchange to ID token via REST
  const customToken = await auth.createCustomToken(owner.uid, owner.customClaims || { admin: true });
  const apiKey = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20'; // public web API key (matches src/firebase.js)
  const exchangeRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const exchangeJson = await exchangeRes.json();
  if (!exchangeJson.idToken) {
    console.log('Token exchange failed:', exchangeJson);
    return;
  }
  console.log(`ID token obtained (length ${exchangeJson.idToken.length})`);

  // Hit the Download endpoint
  const backupRef = 'manual-20260517-0257'; // a real backup from earlier
  console.log(`\nHitting /api/admin/whole-system-backup-download with backupRef=${backupRef}`);
  const startMs = Date.now();
  const dlRes = await fetch(`${PROD_URL}/api/admin/whole-system-backup-download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${exchangeJson.idToken}` },
    body: JSON.stringify({ backupRef }),
  });
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\nResponse status: ${dlRes.status} ${dlRes.statusText} | ${elapsed}s`);
  console.log(`Content-Type: ${dlRes.headers.get('content-type')}`);
  const text = await dlRes.text();
  console.log(`Response body (first 400 chars):`);
  console.log(text.slice(0, 400));
  console.log(`\n(body length: ${text.length} chars)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
