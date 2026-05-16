#!/usr/bin/env node
// Rule M data op — V80 (2026-05-16 NIGHT+4).
//
// V76 backfill audit doc claimed 3,281 chat_history docs stamped → NAKHON.
// Diag NIGHT+4 found 3,295 total = 3,288 stamped + 7 MISSING (no branchId field).
// These 7 docs were resolved during the V76 deploy race window — written by
// handleResolve with `conv.branchId || selectedBranchId || ''` chain when both
// were empty (admin context not yet hydrated post-deploy, or webhook hadn't
// stamped conv yet).
//
// User-visible symptom: in พระราม 3 / ทดลอง 1 view, the ⏰ chat-history list
// showed these 7 NAKHON-era unstamped entries because ChatPanel filter
// `!item.branchId || item.branchId === selectedBranchId` fall-through INCLUDED
// missing-branchId docs in every branch view.
//
// Fix layer 1 (this script): backfill the 7 docs to NAKHON.
// Fix layer 2 (V80 code): NAKHON-gate the 3 reader fall-throughs +
//                          hardcoded NAKHON fallback in handleResolve writer.
// Fix layer 3 (V80 audit): AV61 invariant on fall-through filter shape.
//
// USAGE:
//   node scripts/v80-backfill-chat-history-missing-branchid.mjs           # dry-run
//   node scripts/v80-backfill-chat-history-missing-branchid.mjs --apply   # commit writes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;
const NAKHON_BR_ID = 'BR-1777873556815-26df6480';
const BACKFILL_REASON = 'pre-v76-deploy-race-window-pre-v80';

function loadEnv() {
  const envPath = path.resolve('.env.local.prod');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local.prod missing — run `vercel env pull .env.local.prod --environment=production` first');
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export function decideBackfillAction(data) {
  // Returns 'backfill' if branchId missing/empty/null. Returns 'skip-already-stamped'
  // otherwise.
  const bid = data?.branchId;
  if (bid === undefined || bid === null || bid === '') return 'backfill';
  return 'skip-already-stamped';
}

export function buildBackfillPatch() {
  return {
    branchId: NAKHON_BR_ID,
    branchIdSource: 'backfill-v80-pre-v76-deploy-race',
    _v80BackfilledAt: FieldValue.serverTimestamp(),
    _v80BackfillReason: BACKFILL_REASON,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID || APP_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!clientEmail || !privateKey) throw new Error('FIREBASE_ADMIN_* env vars missing');
  if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  const db = getFirestore();

  const col = db.collection(`${PREFIX}/chat_history`);
  const snap = await col.get();

  let scanned = 0, toBackfill = 0, alreadyStamped = 0;
  const targets = [];
  snap.forEach(d => {
    scanned++;
    const action = decideBackfillAction(d.data());
    if (action === 'backfill') { toBackfill++; targets.push({ id: d.id, data: d.data() }); }
    else alreadyStamped++;
  });

  console.log(`Scanned: ${scanned}`);
  console.log(`Already stamped: ${alreadyStamped}`);
  console.log(`To backfill: ${toBackfill}`);
  if (targets.length) {
    console.log('\nTarget docs:');
    for (const t of targets) {
      console.log(`  ${t.id}: ${t.data.displayName || '(no name)'} | ${(t.data.lastMessage || '').slice(0, 40)} | resolvedAt=${t.data.resolvedAt}`);
    }
  }

  if (!apply) {
    console.log('\nDry-run only — re-run with `--apply` to commit writes.');
    return;
  }

  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const patch = buildBackfillPatch();
  const auditId = `v80-chat-history-branch-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const writeBatch = db.batch();
  for (const t of targets) {
    writeBatch.set(col.doc(t.id), patch, { merge: true });
  }
  // Audit doc
  const auditRef = db.doc(`${PREFIX}/be_admin_audit/${auditId}`);
  writeBatch.set(auditRef, {
    op: 'v80-chat-history-branch-backfill',
    scanned, migrated: targets.length, skipped: alreadyStamped,
    branchIdAssigned: NAKHON_BR_ID,
    appliedAt: FieldValue.serverTimestamp(),
    rule: 'M',
    reason: BACKFILL_REASON,
    targetDocIds: targets.map(t => t.id),
  });
  await writeBatch.commit();
  console.log(`\nApplied: ${targets.length} docs backfilled. Audit: ${auditId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1); });
}
