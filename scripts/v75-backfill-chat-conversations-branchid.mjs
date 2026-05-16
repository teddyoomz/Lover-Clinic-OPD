// scripts/v75-backfill-chat-conversations-branchid.mjs
// V75 Item 3 Rule M backfill — stamps branchId on legacy chat_conversations.
// Mirrors V74 + Phase 18.0 + Phase 19.0 Rule M canonical pattern.
//
// Usage:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/v75-backfill-chat-conversations-branchid.mjs              # dry-run
//   node scripts/v75-backfill-chat-conversations-branchid.mjs --apply      # commit writes
//   node scripts/v75-backfill-chat-conversations-branchid.mjs --branch-id=BR-X  # explicit override
//
// Default branchId: looked up via be_branches where name === 'นครราชสีมา';
// abort if zero/multi match unless --branch-id overrides.

import { fileURLToPath } from 'node:url';

// ============================================================================
// PURE HELPERS (exported for tests; no firebase deps)
// ============================================================================

/**
 * Decide what to do with a chat_conversations doc.
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
 * Pure helper: returns the static fields of the backfill patch.
 * The caller's main() adds `_v75BranchBackfilledAt: FieldValue.serverTimestamp()`
 * at write time (firebase-admin sentinel) so this helper stays test-friendly
 * and dependency-free.
 */
export function buildBackfillPatch({ docId, defaultBranchId }) {
  if (!defaultBranchId) throw new Error('buildBackfillPatch: defaultBranchId required');
  return {
    branchId: String(defaultBranchId),
    branchIdSource: 'backfill-v75-sole-active',
    _v75BranchBackfilledFrom: null,
    _v75BackfillReason: 'sole-active-branch-snapshot',
    // _v75BranchBackfilledAt: added by main() with serverTimestamp() sentinel
  };
}

// ============================================================================
// MAIN (skipped on test imports via invocation guard)
// ============================================================================

async function main() {
  // Late import — only when running as CLI (test imports the pure helpers above)
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { randomBytes } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');

  // Parse .env.local.prod manually (mirror existing scripts' pattern — no dotenv dep)
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

  console.log(`V75 chat_conversations branchId backfill — ${APPLY ? 'APPLY' : 'DRY-RUN'} mode`);

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

  // Resolve default branchId
  let defaultBranchId = BRANCH_ID_OVERRIDE;
  if (!defaultBranchId) {
    const branchesSnap = await db
      .collection(`artifacts/${APP_ID}/public/data/be_branches`)
      .where('name', '==', 'นครราชสีมา')
      .limit(2)
      .get();
    if (branchesSnap.empty) {
      console.error('ERROR: no branch named "นครราชสีมา" found. Pass --branch-id=<id> to override.');
      process.exit(1);
    }
    if (branchesSnap.size > 1) {
      console.error('ERROR: multiple branches named "นครราชสีมา". Pass --branch-id=<id> to disambiguate.');
      process.exit(1);
    }
    defaultBranchId = branchesSnap.docs[0].id;
  }
  console.log(`Default branchId: ${defaultBranchId}`);

  // Scan chat_conversations (paginated)
  const chatCol = db.collection(`artifacts/${APP_ID}/public/data/chat_conversations`);
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
    let q = chatCol.orderBy('__name__').limit(pageSize);
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
            _v75BranchBackfilledAt: FieldValue.serverTimestamp(),
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

  // Audit doc
  if (APPLY) {
    const auditId = `v75-chat-conversation-branch-backfill-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db
      .collection(`artifacts/${APP_ID}/public/data/be_admin_audit`)
      .doc(auditId)
      .set({
        kind: 'v75-chat-branchid-backfill',
        defaultBranchId,
        result,
        appliedAt: FieldValue.serverTimestamp(),
        callerScript: 'scripts/v75-backfill-chat-conversations-branchid.mjs',
      });
    console.log(`Audit doc: be_admin_audit/${auditId}`);
  }

  console.log('Result:', JSON.stringify(result, null, 2));
  console.log(APPLY ? `APPLIED ${result.written} writes` : 'DRY-RUN COMPLETE (no writes)');
}

// Invocation guard: only run main() when executed as CLI (not when imported for tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
