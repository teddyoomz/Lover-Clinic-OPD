#!/usr/bin/env node
// Rule R/Q — trigger the DEPLOYED manual whole-system backup endpoint + time it.
// Definitive: does the real prod function TIMEOUT (~300s/504), 500 (throw), or 200?
// Also reads the concurrency lock doc (a stale lock = prior run killed before finally → timeout signature).
// This is the exact production code path (Rule Q L2). May leave a partial folder if it times out
// (retention cleans it; noted for manual cleanup).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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
const PREFIX = `artifacts/${APP_ID}/public/data`;
const FIREBASE_WEB_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const PROD_URL = 'https://lover-clinic-app.vercel.app';

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }),
    storageBucket: `${APP_ID}.firebasestorage.app`,
  });
}

async function main() {
  const db = getFirestore();
  console.log('═══ Trigger deployed whole-system manual backup (timed) ═══\n');

  // 1. Read the concurrency lock doc state
  const lockSnap = await db.doc(`${PREFIX}/be_admin_audit/whole-system-backup-running`).get();
  if (lockSnap.exists) {
    const startedAt = lockSnap.data()?.startedAt?.toMillis?.() || 0;
    const ageMin = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log(`⚠ LOCK doc EXISTS: source=${lockSnap.data()?.source}, age=${ageMin}min`);
    console.log(`   (a stale lock not cleaned by finally{} = prior run was KILLED mid-flight = timeout signature)`);
    console.log(`   age > 60min → endpoint transaction will overwrite it.\n`);
  } else {
    console.log('✓ No lock doc (no run in progress / prior runs released or >60min cleaned)\n');
  }

  // 2. Mint admin idToken
  const customToken = await getAuth().createCustomToken(`diag-ws-backup-${Date.now()}`, { admin: true });
  const exRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  const idToken = (await exRes.json()).idToken;
  if (!idToken) throw new Error('token exchange failed');
  console.log('✓ admin idToken obtained\n');

  // 3. POST to deployed endpoint, timed, with 320s abort
  console.log('→ POST /api/admin/whole-system-backup-export {type:manual} ...');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 320000);
  const t0 = Date.now();
  let outcome;
  try {
    const res = await fetch(`${PROD_URL}/api/admin/whole-system-backup-export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ type: 'manual' }),
      signal: ctrl.signal,
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const text = await res.text();
    outcome = { status: res.status, dt, text: text.slice(0, 800) };
  } catch (e) {
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    outcome = { status: e.name === 'AbortError' ? 'CLIENT_TIMEOUT(320s)' : `FETCH_ERR(${e.name})`, dt, text: e.message };
  } finally {
    clearTimeout(timer);
  }

  console.log(`\n← HTTP ${outcome.status} after ${outcome.dt}s`);
  console.log(`  body: ${outcome.text}`);
  console.log('\n─── VERDICT ───');
  if (String(outcome.status).startsWith('CLIENT_TIMEOUT') || outcome.status === 504) {
    console.log('  ❌ TIMEOUT — function exceeded its duration. Confirms process-kill root cause.');
  } else if (outcome.status === 500) {
    console.log('  ⚠ 500 — function threw. Read the error above (NOT a timeout).');
  } else if (outcome.status === 200) {
    console.log(`  ✓ 200 — completed in ${outcome.dt}s. If close to 300s → marginal timeout boundary (still needs fix).`);
  } else if (outcome.status === 409) {
    console.log('  ⚠ 409 LOCK_BUSY — a run is in progress (or lock held). Re-check lock doc.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('\nFATAL:', e.message); process.exit(1); });
}
