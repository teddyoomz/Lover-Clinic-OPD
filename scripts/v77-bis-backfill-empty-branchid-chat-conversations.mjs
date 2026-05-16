#!/usr/bin/env node
// V77-bis (2026-05-16 EOD+1) — Backfill chat_conversations docs with
// branchId:'' to นครราชสีมา. Caused by missing LOVER_DEFAULT_BRANCH_ID env
// in webhook runtime → resolver fall back to empty string → cross-branch leak.
// CODE FIX: webhook resolvers now hardcode-fallback (V77-bis). DATA FIX: this
// script restamps any existing empty-branchId docs (1 known at time of fix).
//
// Usage:
//   node scripts/v77-bis-backfill-empty-branchid-chat-conversations.mjs
//   node scripts/v77-bis-backfill-empty-branchid-chat-conversations.mjs --apply

import { fileURLToPath } from 'node:url';

export function decideBackfillAction({ data, defaultBranchId }) {
  const current = data?.branchId;
  if (current && typeof current === 'string' && current.length > 0) {
    if (current === defaultBranchId) return 'skip-already-stamped';
    return 'skip-mismatch';
  }
  return 'backfill-empty';
}

export function buildBackfillPatch({ defaultBranchId }) {
  if (!defaultBranchId) throw new Error('defaultBranchId required');
  return {
    branchId: String(defaultBranchId),
    branchIdSource: 'backfill-v77-bis-hardcoded-nakhonratchasima',
    _v77bisBackfilledFrom: '',
    _v77bisBackfillReason: 'webhook-empty-branchid-recovery',
  };
}

async function main() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { randomBytes } = await import('node:crypto');
  const { readFileSync, existsSync } = await import('node:fs');

  if (existsSync('.env.local.prod')) {
    for (const line of readFileSync('.env.local.prod', 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  }

  const APP_ID = 'loverclinic-opd-4c39b';
  const NAKHON_BR_ID = 'BR-1777873556815-26df6480';
  const APPLY = process.argv.includes('--apply');

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
      }),
    });
  }
  const db = getFirestore();

  console.log(`V77-bis chat_conversations empty-branchId backfill — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Default branchId: ${NAKHON_BR_ID}`);

  const col = db.collection(`artifacts/${APP_ID}/public/data/chat_conversations`);
  const snap = await col.get();
  const result = {
    scanned: 0,
    backfillEmpty: 0,
    skipAlreadyStamped: 0,
    skipMismatch: 0,
    written: 0,
    samples: [],
  };

  for (const docRef of snap.docs) {
    result.scanned++;
    const data = docRef.data();
    const action = decideBackfillAction({ data, defaultBranchId: NAKHON_BR_ID });
    if (action === 'backfill-empty') {
      result.backfillEmpty++;
      if (result.samples.length < 10)
        result.samples.push({
          id: docRef.id,
          currentBranchId: JSON.stringify(data.branchId),
          currentSource: data.branchIdSource,
        });
      if (APPLY) {
        await docRef.ref.update({
          ...buildBackfillPatch({ defaultBranchId: NAKHON_BR_ID }),
          _v77bisBackfilledAt: FieldValue.serverTimestamp(),
        });
        result.written++;
      }
    } else if (action === 'skip-already-stamped') result.skipAlreadyStamped++;
    else if (action === 'skip-mismatch') result.skipMismatch++;
  }

  if (APPLY) {
    const auditId = `v77-bis-chat-conv-empty-branchid-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db
      .collection(`artifacts/${APP_ID}/public/data/be_admin_audit`)
      .doc(auditId)
      .set({
        kind: 'v77-bis-chat-conv-empty-branchid-backfill',
        defaultBranchId: NAKHON_BR_ID,
        result,
        appliedAt: FieldValue.serverTimestamp(),
        callerScript: 'scripts/v77-bis-backfill-empty-branchid-chat-conversations.mjs',
      });
    console.log(`Audit doc: be_admin_audit/${auditId}`);
  }

  console.log('Result:', JSON.stringify(result, null, 2));
  console.log(APPLY ? `APPLIED ${result.written} writes` : 'DRY-RUN COMPLETE');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
