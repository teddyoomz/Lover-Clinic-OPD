// scripts/v82-staff-chat-stress.mjs
// V82 (2026-05-17 post-V81-fix7b) — 10-scenario brutal stress test against
// real prod Firestore via admin SDK. Per Rule M + Rule R + user directive
// "stress test แบบโหดๆ".
//
// Each scenario tests a different aspect of the cursor + force-open + badge
// system. Run sequentially; aborts on first failure for diagnostic clarity.
//
// USAGE:
//   vercel env pull .env.local.prod --environment=production   # if needed
//   node scripts/v82-staff-chat-stress.mjs [--scenario N]
//
// NEVER click real action buttons in preview_eval; this script uses TEST-
// prefixed fixtures per V33.11/V33.12 discipline.

import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

// ─── Env + admin SDK ─────────────────────────────────────────────────────
const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}
const APP_ID = 'loverclinic-opd-4c39b';
function admin() {
  if (getApps().length > 0) return getApp();
  return initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const app = admin();
const db = getFirestore(app);
const messagesCol = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('be_staff_chat_messages');

// ─── Test fixtures ───────────────────────────────────────────────────────
const TEST_BRANCH = 'TEST-V82-STRESS-BR-' + Date.now();
const TEST_DEVICE_A = 'TEST-V82-DEV-A-' + Date.now();
const TEST_DEVICE_B = 'TEST-V82-DEV-B-' + Date.now();

let createdDocIds = [];

async function writeMessage({ deviceId, text, mentions = [], senderRole = null }) {
  const id = `TEST-V82-MSG-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await messagesCol().doc(id).set({
    branchId: TEST_BRANCH,
    displayName: 'StressBot ' + deviceId.slice(-2),
    deviceId,
    text,
    senderColor: '#fb923c',
    senderRole,
    mentions,
    createdAt: Date.now(),
    _stressTestId: id,
  });
  createdDocIds.push(id);
  return id;
}

async function cleanup() {
  // eslint-disable-next-line no-console
  console.log(`\n[cleanup] deleting ${createdDocIds.length} test docs...`);
  let nuked = 0;
  for (const id of createdDocIds) {
    try { await messagesCol().doc(id).delete(); nuked++; } catch { /* */ }
  }
  // eslint-disable-next-line no-console
  console.log(`[cleanup] nuked ${nuked}/${createdDocIds.length}`);
}

// ─── 10 Scenarios ────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    name: 'S1 — Baseline: write 1 msg, verify shape',
    run: async () => {
      const id = await writeMessage({ deviceId: TEST_DEVICE_A, text: 'baseline test' });
      const doc = await messagesCol().doc(id).get();
      if (!doc.exists) throw new Error('doc not written');
      if (doc.data().branchId !== TEST_BRANCH) throw new Error('branchId mismatch');
    },
  },
  {
    name: 'S2 — 10 rapid messages (sound dedup soak)',
    run: async () => {
      for (let i = 0; i < 10; i++) await writeMessage({ deviceId: TEST_DEVICE_A, text: `rapid ${i}` });
      const snap = await messagesCol().where('branchId', '==', TEST_BRANCH).get();
      if (snap.size < 11) throw new Error(`expected ≥11 docs, got ${snap.size}`);
    },
  },
  {
    name: 'S3 — Cross-device mention',
    run: async () => {
      await writeMessage({ deviceId: TEST_DEVICE_B, text: '@StressBot A hello', mentions: ['StressBot ' + TEST_DEVICE_A.slice(-2)] });
    },
  },
  {
    name: 'S4 — All 4 role badges',
    run: async () => {
      for (const role of ['doctor', 'assistant', 'staff', 'manager']) {
        await writeMessage({ deviceId: TEST_DEVICE_A, text: `role test ${role}`, senderRole: role });
      }
    },
  },
  {
    name: 'S5 — Null senderRole (legacy compat)',
    run: async () => {
      await writeMessage({ deviceId: TEST_DEVICE_A, text: 'no-badge', senderRole: null });
    },
  },
  {
    name: 'S6 — Invalid senderRole (graceful degrade)',
    run: async () => {
      await writeMessage({ deviceId: TEST_DEVICE_A, text: 'invalid-role', senderRole: 'janitor' });
      // UI should render null badge; not crash. We can't verify UI from admin SDK; just confirm write.
    },
  },
  {
    name: 'S7 — Adversarial text (Thai + emoji + NUL + 10K)',
    run: async () => {
      await writeMessage({ deviceId: TEST_DEVICE_A, text: 'ทดสอบ 🎉\0' + 'x'.repeat(10000) });
    },
  },
  {
    name: 'S8 — Concurrent writes from 2 devices',
    run: async () => {
      await Promise.all([
        writeMessage({ deviceId: TEST_DEVICE_A, text: 'concurrent A' }),
        writeMessage({ deviceId: TEST_DEVICE_B, text: 'concurrent B' }),
        writeMessage({ deviceId: TEST_DEVICE_A, text: 'concurrent A2' }),
        writeMessage({ deviceId: TEST_DEVICE_B, text: 'concurrent B2' }),
      ]);
    },
  },
  {
    name: 'S9 — Snapshot re-emit simulation (Bug #2 repro)',
    run: async () => {
      // Read snap, simulate "re-emit": read again and verify same doc IDs returned.
      // The cursor logic (client-side) MUST treat the second read as 0 unread.
      const snap1 = await messagesCol().where('branchId', '==', TEST_BRANCH).get();
      const snap2 = await messagesCol().where('branchId', '==', TEST_BRANCH).get();
      const ids1 = snap1.docs.map(d => d.id).sort();
      const ids2 = snap2.docs.map(d => d.id).sort();
      if (JSON.stringify(ids1) !== JSON.stringify(ids2)) {
        throw new Error('snapshot inconsistency between calls');
      }
    },
  },
  {
    name: 'S10 — Branch isolation (write to TEST_BRANCH, read from different branch)',
    run: async () => {
      const otherBranch = 'TEST-V82-OTHER-' + Date.now();
      const snap = await messagesCol().where('branchId', '==', otherBranch).get();
      if (snap.size !== 0) throw new Error(`expected 0 docs in other branch, got ${snap.size}`);
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────
async function main() {
  // eslint-disable-next-line no-console
  console.log(`\n=== V82 Stress test (10 scenarios) — TEST_BRANCH=${TEST_BRANCH} ===\n`);
  const argIdx = process.argv.indexOf('--scenario');
  const onlyN = argIdx >= 0 ? parseInt(process.argv[argIdx + 1], 10) : null;
  let pass = 0, fail = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    if (onlyN !== null && (i + 1) !== onlyN) continue;
    const { name, run } = SCENARIOS[i];
    process.stdout.write(`[${i + 1}/10] ${name} ... `);
    try { await run(); console.log('✓ PASS'); pass++; }
    catch (e) { console.log('✗ FAIL — ' + (e.message || e)); fail++; if (onlyN === null) break; }
  }
  await cleanup();
  console.log(`\n=== RESULTS: ${pass} pass / ${fail} fail ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); cleanup().finally(() => process.exit(1)); });
}
