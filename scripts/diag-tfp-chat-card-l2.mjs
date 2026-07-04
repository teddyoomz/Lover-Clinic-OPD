// scripts/diag-tfp-chat-card-l2.mjs — TFP staff-chat cards (2026-07-04, spec
// ③④ / probe #18) Rule Q L2 verify. REAL CLIENT SDK + the REAL buildTfpChatCard
// (no fixture divergence — V66/V109 lesson).
//
// Dual-mode (the rules ship with the feature commit but deploy later — V18):
//   PRE-deploy : staff tfp-card create → PERMISSION_DENIED = expected (gate shut)
//   POST-deploy: staff tfp-card create → SUCCESS; forge intake kind → DENIED
//                ALWAYS; duplicate re-create → DENIED (update:false idempotency);
//                cleanup via admin SDK (rules block client-deleting system cards).
// The script auto-detects which mode from the first write's outcome and
// verdicts accordingly. Uses the ทดลอง 1 TEST branch so nothing lands in a
// real branch chat.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { buildTfpChatCard } from '../src/lib/tfpStaffChatNotify.js';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5'; // ทดลอง 1

const app = initializeApp({ apiKey: FIREBASE_API_KEY, authDomain: `${APP_ID}.firebaseapp.com`, projectId: APP_ID });
const auth = getAuth(app);
const db = getFirestore(app);

const PASS = (m) => console.log(`  ✓ ${m}`);
const FAIL = (m) => { console.log(`  ✗ FAIL: ${m}`); process.exitCode = 1; };
const INFO = (m) => console.log(`  · ${m}`);

const COL = `artifacts/${APP_ID}/public/data/be_staff_chat_messages`;

const write = async (card) => setDoc(doc(db, COL, card.id), { ...card, createdAt: serverTimestamp() });
const isDenied = (e) => (e && (e.code === 'permission-denied' || /permission/i.test(e.message || '')));

async function adminCleanup(ids) {
  try {
    const { initializeApp: adminInit, cert } = await import('firebase-admin/app');
    const { getFirestore: adminFs } = await import('firebase-admin/firestore');
    const key = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
    if (!key) { INFO('no admin creds in env — TEST cards left for the retention sweep'); return; }
    const adminApp = adminInit({
      credential: cert({
        projectId: APP_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: key,
      }),
    }, `cleanup-${Date.now()}`);
    const adb = adminFs(adminApp);
    for (const id of ids) await adb.doc(`${COL}/${id}`).delete();
    PASS(`admin cleanup: ${ids.length} TEST card(s) deleted (zero orphans)`);
  } catch (e) {
    INFO(`admin cleanup skipped (${e.message}) — TEST cards reaped by the 30d retention sweep`);
  }
}

async function main() {
  console.log('=== TFP staff-chat cards Rule Q L2 (probe #18) — real client SDK, real prod ===');
  await signInWithEmailAndPassword(auth, 'loverclinic@loverclinic.com', 'Lover2024');
  PASS('signed in as staff');

  const ts = Date.now();
  const written = [];

  // 1) staff creates a REAL tfp-vitals card (REAL builder — no hand-made fixture)
  const vitals = buildTfpChatCard({
    kind: 'tfp-vitals', treatmentId: `TEST-BT-${ts}`, customerId: `TEST-CUST-${ts}`,
    customerName: 'L2 ทดสอบ', customerHN: 'TEST-HN', branchId: TEST_BRANCH_ID,
  });
  let deployed = false;
  try {
    await write(vitals);
    deployed = true;
    written.push(vitals.id);
    PASS(`POST-DEPLOY mode: staff tfp-vitals card CREATED (${vitals.id})`);
  } catch (e) {
    if (isDenied(e)) {
      PASS('PRE-DEPLOY mode: tfp card DENIED as expected (rules not yet deployed — feature live-gated, writer swallows this non-fatally)');
    } else {
      FAIL(`unexpected error on tfp create: ${e.code || e.message}`);
    }
  }

  if (deployed) {
    // 2) doctor card
    const docCard = buildTfpChatCard({
      kind: 'tfp-doctor', treatmentId: `TEST-BT-${ts}`, customerId: `TEST-CUST-${ts}`,
      customerName: 'L2 ทดสอบ', doctorName: 'นพ.L2', branchId: TEST_BRANCH_ID,
    });
    try { await write(docCard); written.push(docCard.id); PASS(`tfp-doctor card CREATED (${docCard.id})`); }
    catch (e) { FAIL(`tfp-doctor create should pass post-deploy: ${e.code || e.message}`); }

    // 3) duplicate re-save → setDoc on existing = UPDATE → update:false → DENIED (idempotency)
    try { await write(vitals); FAIL('duplicate re-create SUCCEEDED — update:false idempotency broken'); }
    catch (e) { isDenied(e) ? PASS('duplicate re-save DENIED (idempotent — no duplicate cards)') : FAIL(`duplicate: unexpected ${e.code}`); }
  }

  // 4) forge a SERVER-ONLY kind from the client → must be DENIED in BOTH modes
  try {
    await write({
      id: `TEST-FORGE-${ts}`, branchId: TEST_BRANCH_ID, deviceId: 'system', displayName: 'ระบบ',
      text: 'forge', system: { kind: 'intake', sessionId: 'S-FORGE' },
    });
    FAIL('client FORGED an intake system card — AV198 broken!');
  } catch (e) {
    isDenied(e) ? PASS('forged intake kind DENIED (server-only kinds stay unforgeable)') : FAIL(`forge: unexpected ${e.code}`);
  }

  // 5) tfp kind with EMPTY treatmentId → validator must deny
  try {
    await write({
      id: `TEST-BADTFP-${ts}`, branchId: TEST_BRANCH_ID, deviceId: 'system', displayName: 'ระบบ',
      text: 'bad', system: { kind: 'tfp-vitals', treatmentId: '', customerId: 'x' },
    });
    FAIL('tfp card with empty treatmentId was ACCEPTED — validator missing');
  } catch (e) {
    isDenied(e) ? PASS('tfp card with empty treatmentId DENIED (validator holds)') : FAIL(`validator: unexpected ${e.code}`);
  }

  if (written.length) await adminCleanup(written);

  console.log(process.exitCode === 1 ? '\n⚠️  TFP-card L2: at least one FAIL' : `\n✅ TFP-card L2: ALL PASS (${deployed ? 'post-deploy' : 'pre-deploy'} mode)`);
  process.exit(process.exitCode || 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
