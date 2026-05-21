// scripts/staff-chat-retention-sweep.mjs — Rule M CLI mirror of the staff-chat
// retention cron. Dry-run by default; --apply deletes for real. Reuses
// sweepStaffChatRetention from the cron (Rule of 3 — single source of logic).
//   vercel env pull .env.local.prod --environment=production   # once
//   node scripts/staff-chat-retention-sweep.mjs                # dry-run (count only)
//   node scripts/staff-chat-retention-sweep.mjs --apply        # delete aged + orphans
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { sweepStaffChatRetention } from '../api/cron/staff-chat-retention-sweep.js';

const APP_ID = 'loverclinic-opd-4c39b';
const AUDIT_COL = `artifacts/${APP_ID}/public/data/be_admin_audit`;

function loadEnv(p) {
  const o = {};
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) o[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return o;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv('.env.local.prod');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
      }),
      storageBucket: `${APP_ID}.firebasestorage.app`,
    });
  }
  const db = getFirestore();
  const storage = getStorage().bucket();
  console.log(`[staff-chat-retention] ${apply ? 'APPLY (deleting)' : 'DRY-RUN (count only)'} ...`);
  const result = await sweepStaffChatRetention({ db, storage, now: Date.now(), apply });
  console.log(JSON.stringify(result, null, 2));
  if (apply) {
    const id = `staff-chat-retention-sweep-cli-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(AUDIT_COL).doc(id).set({ op: 'staff-chat-retention-sweep-cli', ...result, ranAt: new Date().toISOString() });
    console.log('audit:', id);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
