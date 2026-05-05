#!/usr/bin/env node
// ─── Phase 20.0 hotfix — Re-stamp branchId on opd_sessions/chat_conversations
// ─── from OLD นครราชสีมา id → CURRENT id ────────────────────────────────────
//
// Bug: phase-20-0-migrate-opd-sessions-to-branch.mjs and
// phase-20-0-migrate-chat-conversations-to-branch.mjs hardcoded
// DEFAULT_BRANCH_ID = 'BR-1777095572005-ae97f911' (old session-handoff value)
// but the live be_branches collection uses different ids:
//   - BR-1777873556815-26df6480 = นครราชสีมา (CURRENT)
//   - BR-1777885958735-38afbdeb = พระราม 3
//
// Result: 75 opd_sessions + 12 chat_conversations got an unknown branchId
// → BranchSelector filters them out on EVERY branch.
//
// This script re-stamps OLD_ID → NEW_ID for both collections.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const txt = readFileSync(envFile, 'utf-8');
  // Multi-line PEM tolerant: track open quote states.
  const lines = txt.split('\n');
  let cur = null, val = '';
  for (const ln of lines) {
    if (ln.startsWith('#') || (cur === null && !ln.trim())) continue;
    const m = ln.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && cur === null) {
      cur = m[1]; val = m[2];
      // Multi-line if value starts with " but doesn't end with "
      if (val.startsWith('"') && !val.endsWith('"')) continue;
      let v = val;
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      process.env[cur] = v;
      cur = null; val = '';
    } else if (cur) {
      val += '\n' + ln;
      if (val.endsWith('"')) {
        let v = val;
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        process.env[cur] = v;
        cur = null; val = '';
      }
    }
  }
  if (cur) {
    let v = val;
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[cur] = v;
  }
}

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const AUDIT_COLLECTION = `${BASE_PATH}/be_admin_audit`;

const OLD_ID = 'BR-1777095572005-ae97f911'; // wrong stamped value
const NEW_ID = 'BR-1777873556815-26df6480'; // current นครราชสีมา in be_branches

const apply = process.argv.includes('--apply');
const dryRun = !apply;

function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

function initFirebase() {
  if (getApps().length > 0) return;
  const pk = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      type: 'service_account',
      project_id: 'loverclinic-opd-4c39b',
      private_key_id: 'k',
      private_key: pk,
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      client_id: 'c',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
  });
}

async function fixCollection(db, collectionName) {
  const colPath = `${BASE_PATH}/${collectionName}`;
  console.log(`[fix-branch-id] scanning ${colPath}…`);
  const snap = await db.collection(colPath).get();
  const dist = {};
  const toFix = [];
  for (const d of snap.docs) {
    const b = d.data().branchId || '(none)';
    dist[b] = (dist[b] || 0) + 1;
    if (b === OLD_ID) toFix.push(d.id);
  }
  console.log(`[fix-branch-id] ${collectionName} dist:`, dist);
  console.log(`[fix-branch-id] ${collectionName} to-fix: ${toFix.length}`);
  if (dryRun || toFix.length === 0) return { scanned: snap.size, toFix: toFix.length, fixed: 0 };
  const BATCH = 400;
  let fixed = 0;
  for (let i = 0; i < toFix.length; i += BATCH) {
    const slice = toFix.slice(i, i + BATCH);
    const batch = db.batch();
    for (const id of slice) {
      batch.update(db.collection(colPath).doc(id), {
        branchId: NEW_ID,
        branchIdHotfixAt: FieldValue.serverTimestamp(),
        branchIdHotfixOldValue: OLD_ID,
      });
    }
    await batch.commit();
    fixed += slice.length;
    console.log(`[fix-branch-id] ${collectionName} batch ${Math.floor(i / BATCH) + 1} (${fixed}/${toFix.length})`);
  }
  return { scanned: snap.size, toFix: toFix.length, fixed };
}

async function main() {
  console.log(`[fix-branch-id] mode = ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`[fix-branch-id] OLD_ID = ${OLD_ID} → NEW_ID = ${NEW_ID}`);
  initFirebase();
  const db = getFirestore();
  const opd = await fixCollection(db, 'opd_sessions');
  const chat = await fixCollection(db, 'chat_conversations');
  const appts = await fixCollection(db, 'be_appointments');

  if (!apply) {
    console.log('[fix-branch-id] DRY-RUN — no writes.');
    process.exit(0);
  }

  const auditId = `phase-20-0-fix-branch-id-mismatch-${Date.now()}-${randHex()}`;
  await db.collection(AUDIT_COLLECTION).doc(auditId).set({
    phase: '20.0-fix-branch-id-mismatch',
    op: 'fix-branch-id-from-stale-default',
    oldId: OLD_ID,
    newId: NEW_ID,
    opd_sessions: opd,
    chat_conversations: chat,
    be_appointments: appts,
    appliedAt: FieldValue.serverTimestamp(),
  });
  console.log(`[fix-branch-id] APPLY done. Audit: ${AUDIT_COLLECTION}/${auditId}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error('[fix-branch-id] FATAL', err); process.exit(1); });
}
