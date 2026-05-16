#!/usr/bin/env node
// V81 EMERGENCY — single-user password restore for loverclinic@loverclinic.com
// User-explicit-authorized 2026-05-17 EOD+1 ~03:15 BKK with provided password.
// Scope: ONE account only (owner). No other 352 staff accounts touched.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const APP_ID = 'loverclinic-opd-4c39b';
const TARGET_EMAIL = 'loverclinic@loverclinic.com';
const NEW_PASSWORD = 'Lover2024';

function loadEnv() {
  const env = {};
  for (const l of fs.readFileSync('.env.local.prod', 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  const auth = getAuth();

  console.log(`Looking up ${TARGET_EMAIL}...`);
  const u = await auth.getUserByEmail(TARGET_EMAIL);
  console.log(`  uid: ${u.uid}`);
  console.log(`  customClaims: ${JSON.stringify(u.customClaims || {})}`);
  console.log(`  disabled: ${u.disabled}`);
  console.log('');

  console.log('Setting password + revoking refresh tokens...');
  await auth.updateUser(u.uid, { password: NEW_PASSWORD });
  await auth.revokeRefreshTokens(u.uid);
  console.log('  ✓ Password set');
  console.log('  ✓ Refresh tokens revoked\n');

  console.log('✓ DONE. Login at https://lover-clinic-app.vercel.app/admin');
  console.log(`  Email:    ${TARGET_EMAIL}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
