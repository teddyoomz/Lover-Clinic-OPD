#!/usr/bin/env node
// scripts/v76-backfill-chat-history-branchid.mjs
// V76 (2026-05-16 EOD+1) Rule M canonical — stamps branchId on legacy
// chat_history docs (3,281 prod docs unstamped because V75 missed this
// SIBLING writer). Class-of-bug V12 multi-reader-sweep.
//
// Mirrors scripts/v75-backfill-chat-conversations-branchid.mjs structure
// (same Rule M canonical pattern: env load + admin SDK + dry-run + --apply +
// forensic-trail + audit doc + idempotent skip-already-stamped).
//
// Usage:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/v76-backfill-chat-history-branchid.mjs              # dry-run
//   node scripts/v76-backfill-chat-history-branchid.mjs --apply      # commit
//   node scripts/v76-backfill-chat-history-branchid.mjs --branch-id=BR-X  # explicit override

import { fileURLToPath } from 'node:url';

// ============================================================================
// PURE HELPERS (exported for tests; no firebase deps)
// ============================================================================

/**
 * Decide what to do with a chat_history doc.
 * Returns 'skip-already-stamped' | 'skip-mismatch' | 'backfill'.
 */
export function decideBackfillAction({ docId, data, defaultBranchId }) {
  const current = data?.branchId;
  if (current && typeof current === 'string' && current.length > 0) {
    if (current === defaultBranchId) return 'skip-already-stamped';
    return 'skip-mismatch';
  }
  return 'backfill';
}

/**
 * Pure helper: returns the static fields of the V76 backfill patch.
 * The caller's main() adds `_v76BranchBackfilledAt: FieldValue.serverTimestamp()`
 * at write time. branchIdSource records the backfill origin.
 */
export function buildBackfillPatch({ docId, defaultBranchId }) {
  if (!defaultBranchId) throw new Error('buildBackfillPatch: defaultBranchId required');
  return {
    branchId: String(defaultBranchId),
    branchIdSource: 'backfill-v76-sole-active',
    _v76BranchBackfilledFrom: null,
    _v76BackfillReason: 'sole-active-branch-snapshot-history',
  };
}

// ============================================================================
// MAIN (skipped on test imports via invocation guard)
// ============================================================================

async function main() {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { randomBytes } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');

  try {
    const envText = readFileSync('.env.local.prod', 'utf-8');
    for (const line of envText.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
      if (m) process.env[m[1]] = m[3];
    }
  } catch (e) {
    console.warn('Could not read .env.local.prod; relying on existing process.env:', e.message);
  }

  const APP_ID = process.env.LOVERCLINIC_APP_ID || process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
  const APPLY = process.argv.includes('--apply');
  const BRANCH_ID_OVERRIDE = (process.argv.find(a => a.startsWith('--branch-id=')) || '').split('=')[1] || '';

  console.log(`V76 chat_history branchId backfill — ${APPLY ? 'APPLY' : 'DRY-RUN'} mode`);

  const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
    });
  }
  const db = getFirestore();

  // Resolve default branchId — prefer override; else lookup นครราชสีมา
  let defaultBranchId = BRANCH_ID_OVERRIDE;
  if (!defaultBranchId) {
    const branchesSnap = await db
      .collection(`artifacts/${APP_ID}/public/data/be_branches`)
      .where('name', '==', 'นครราชสีมา')
      .get();
    if (branchesSnap.empty) {
      console.error('ERROR: no branch named "นครราชสีมา". Pass --branch-id=<id> to override.');
      process.exit(1);
    }
    if (branchesSnap.size > 1) {
      console.error('ERROR: multiple branches named "นครราชสีมา". Pass --branch-id=<id> to disambiguate.');
      process.exit(1);
    }
    defaultBranchId = branchesSnap.docs[0].id;
  }
  console.log(`Default branchId: ${defaultBranchId}`);

  // Scan chat_history (paginated)
  const histCol = db.collection(`artifacts/${APP_ID}/public/data/chat_history`);
  const result = {
    scanned: 0,
    backfill: 0,
    skipAlreadyStamped: 0,
    skipMismatch: 0,
    written: 0,
    samples: { backfill: [], skipMismatch: [] },
  };

  const pageSize = 500;
  let lastDoc = null;
  while (true) {
    let q = histCol.orderBy('__name__').limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const docRef of snap.docs) {
      result.scanned++;
      const action = decideBackfillAction({ docId: docRef.id, data: docRef.data(), defaultBranchId });
      if (action === 'backfill') {
        result.backfill++;
        if (result.samples.backfill.length < 10) result.samples.backfill.push(docRef.id);
        if (APPLY) {
          await docRef.ref.update({
            ...buildBackfillPatch({ docId: docRef.id, defaultBranchId }),
            _v76BranchBackfilledAt: FieldValue.serverTimestamp(),
          });
          result.written++;
        }
      } else if (action === 'skip-already-stamped') {
        result.skipAlreadyStamped++;
      } else if (action === 'skip-mismatch') {
        result.skipMismatch++;
        if (result.samples.skipMismatch.length < 10) {
          result.samples.skipMismatch.push({ id: docRef.id, branchId: docRef.data().branchId });
        }
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  if (APPLY) {
    const auditId = `v76-chat-history-branch-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db
      .collection(`artifacts/${APP_ID}/public/data/be_admin_audit`)
      .doc(auditId)
      .set({
        kind: 'v76-chat-history-branchid-backfill',
        defaultBranchId,
        result,
        appliedAt: FieldValue.serverTimestamp(),
        callerScript: 'scripts/v76-backfill-chat-history-branchid.mjs',
      });
    console.log(`Audit doc: be_admin_audit/${auditId}`);
  }

  console.log('Result:', JSON.stringify(result, null, 2));
  console.log(APPLY ? `APPLIED ${result.written} writes` : 'DRY-RUN COMPLETE (no writes)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
