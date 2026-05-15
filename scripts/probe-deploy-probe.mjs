// ─── Probe-Deploy-Probe (Rule B iron-clad) ──────────────────────────────────
// 4-endpoint check before + after firestore:rules deploy. If post-probe
// returns 403 on any endpoint → revert deploy immediately.
//
// Endpoints (per .claude/rules/01-iron-clad.md Rule B, post-V50-followup-2):
//   1. POST chat_conversations (unauth REST — webhook FB/LINE)
//   5. anon-auth: signUp → CREATE opd_sessions w/ isArchived:true → PATCH
//      whitelisted field (V23 patient form submit + V27 hide-from-queue)
//   9. V73 Staff Chat — anon CREATE be_staff_chat_messages → expect 403
//      (INVERTED probe: we WANT 403 because clinic-staff-only by rule).
//   10. V73 Staff Chat attachments — anon WRITE → expect 401/403
//       (INVERTED probe: clinic-staff-only by Storage rule).
//
// V50-followup-2 (2026-05-08) — probes 2/3/4 REMOVED:
//   - probe 2 pc_appointments → ProClinic dev-only sync deleted in V50
//   - probe 3 clinic_settings/proclinic_session → cookie-relay extension deleted
//   - probe 4 clinic_settings/proclinic_session_trial → cookie-relay trial deleted
// These endpoints now return 403 (default-deny) post-deploy — that's the
// intended state, NOT a regression. Keeping them in the probe list would
// abort every firebase rules deploy at pre-probe.
//
// Mode (CLI arg):
//   pre      — just probe (assert 200), keep doc IDs for later cleanup
//   post     — probe again (assert 200), then cleanup all probe docs
//   probe    — pre OR post (single shot; no cleanup)
//   cleanup  — only cleanup (admin SDK; nukes test-probe-* docs)
//
// Usage:
//   node scripts/probe-deploy-probe.mjs pre   > /tmp/probe-pre.txt
//   <run deploys>
//   node scripts/probe-deploy-probe.mjs post  # also cleans up
//
// Or all-in-one:
//   node scripts/probe-deploy-probe.mjs all   # pre → wait for deploys to finish
//                                               (skipped — caller orchestrates)
//                                               → post → cleanup. Use `pre`
//                                               and `post` separately for clarity.

import { readFileSync, existsSync } from 'fs';
const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
const envText = readFileSync(envFile, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

const APP_ID = 'loverclinic-opd-4c39b';
// Public Firebase Web API key (intentionally hardcoded — same as src/firebase.js)
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const DATA_PATH = `artifacts/${APP_ID}/public/data`;

const MODE = process.argv[2] || 'probe';

// ─── Generic fetchish helper ────────────────────────────────────────────────
async function http(method, url, { body, headers } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, ok: res.ok, text };
}

// ─── Per-endpoint probes ────────────────────────────────────────────────────
async function probe1_chatConversations(ts) {
  const docId = `test-probe-chat-${ts}`;
  const url = `${FIRESTORE_BASE}/${DATA_PATH}/chat_conversations?documentId=${docId}`;
  const r = await http('POST', url, {
    body: { fields: { probe: { booleanValue: true }, _probeAt: { stringValue: new Date().toISOString() } } },
  });
  return { name: 'chat_conversations POST', docId, status: r.status, ok: r.ok, error: r.ok ? null : r.text.slice(0, 200) };
}

async function probe5_anonOpdSessions(ts) {
  // (a) signUp anonymous user
  const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
  const sR = await http('POST', signUpUrl, { body: { returnSecureToken: true } });
  if (!sR.ok) {
    return { name: 'opd_sessions anon CREATE+PATCH', status: sR.status, ok: false, error: `signUp failed: ${sR.text.slice(0, 200)}` };
  }
  const idToken = JSON.parse(sR.text).idToken;
  const docId = `test-probe-anon-${ts}`;

  // (b) CREATE opd_sessions w/ isArchived:true (V27 — hide from queue UI)
  const createUrl = `${FIRESTORE_BASE}/${DATA_PATH}/opd_sessions?documentId=${docId}`;
  const cR = await http('POST', createUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
    body: {
      fields: {
        status: { stringValue: 'completed' },
        isArchived: { booleanValue: true },
        patientData: { mapValue: { fields: {} } },
      },
    },
  });
  if (!cR.ok) {
    return { name: 'opd_sessions anon CREATE+PATCH', docId, status: cR.status, ok: false, error: `create: ${cR.text.slice(0, 200)}` };
  }

  // (c) PATCH whitelisted field — proves V23 hasOnly path works
  const patchUrl = `${FIRESTORE_BASE}/${DATA_PATH}/opd_sessions/${docId}?updateMask.fieldPaths=isUnread`;
  const pR = await http('PATCH', patchUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
    body: { fields: { isUnread: { booleanValue: true } } },
  });
  return {
    name: 'opd_sessions anon CREATE+PATCH',
    docId,
    status: pR.status,
    ok: pR.ok,
    error: pR.ok ? null : `patch: ${pR.text.slice(0, 200)}`,
  };
}

async function probe9_staffChatMessagesAnon(ts) {
  const docId = `test-probe-staffchat-${ts}`;
  const url = `${FIRESTORE_BASE}/${DATA_PATH}/be_staff_chat_messages?documentId=${docId}`;
  // Anon write should be REJECTED (403)
  const r = await http('POST', url, {
    body: { fields: { branchId: { stringValue: 'BR-PROBE' }, displayName: { stringValue: 'PROBE' }, text: { stringValue: 'p' }, deviceId: { stringValue: 'd' } } },
  });
  return {
    name: 'be_staff_chat_messages anon CREATE (expect 403)',
    docId,
    status: r.status,
    ok: r.status === 403,  // INVERTED — we WANT 403
    error: r.status === 403 ? null : `expected 403 got ${r.status}: ${r.text.slice(0, 200)}`,
  };
}

async function probe10_staffChatAttachmentsAnon(ts) {
  // V73 Feature F (2026-05-16) — verify Storage rule blocks anon writes.
  // Storage REST returns 401 (no Bearer token) or 403 (with bad token); both
  // are "rule rejected" — same intent as Firestore 403. INVERTED probe.
  const filename = `test-probe-attach-${ts}.json`;
  const url = `https://firebasestorage.googleapis.com/v0/b/${APP_ID}.firebasestorage.app/o?name=staff-chat-attachments%2FPROBE%2F${filename}`;
  const r = await http('POST', url, {
    body: { probe: true },
  });
  return {
    name: 'staff-chat-attachments anon WRITE (expect 401/403)',
    status: r.status,
    ok: r.status === 401 || r.status === 403,
    error: (r.status === 401 || r.status === 403) ? null : `expected 403/401 got ${r.status}: ${r.text.slice(0, 200)}`,
  };
}

// ─── Probe orchestrator ─────────────────────────────────────────────────────
async function runProbe(label) {
  const ts = Date.now();
  console.log(`=== ${label.toUpperCase()} PROBE @ ${new Date().toISOString()} ===`);
  const results = await Promise.all([
    probe1_chatConversations(ts),
    probe5_anonOpdSessions(ts),
    probe9_staffChatMessagesAnon(ts),
    probe10_staffChatAttachmentsAnon(ts),
  ]);
  let allOk = true;
  for (const r of results) {
    const tag = r.ok ? '✓' : '✗ FAIL';
    const docInfo = r.docId ? ` doc=${r.docId}` : '';
    console.log(`  ${tag} [${r.status}] ${r.name}${docInfo}${r.error ? ' ' + r.error : ''}`);
    if (!r.ok) allOk = false;
  }
  return { allOk, results };
}

// ─── Cleanup (admin SDK — bypasses rules) ───────────────────────────────────
async function runCleanup() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  }, `cleanup-${Date.now()}`); // unique name to avoid duplicate-app error
  const db = getFirestore(app);
  const data = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');

  let nuked = { chat_conversations: 0, opd_sessions: 0, be_staff_chat_messages: 0 };

  // chat_conversations test-probe-chat-* + test-probe-* (legacy)
  for (const prefix of ['test-probe-chat-', 'test-probe-']) {
    const snap = await data.collection('chat_conversations').get();
    for (const d of snap.docs) {
      if (!d.id.startsWith(prefix)) continue;
      await d.ref.delete();
      nuked.chat_conversations += 1;
    }
  }
  // opd_sessions test-probe-anon-*
  {
    const snap = await data.collection('opd_sessions').get();
    for (const d of snap.docs) {
      if (!d.id.startsWith('test-probe-anon-')) continue;
      await d.ref.delete();
      nuked.opd_sessions += 1;
    }
  }
  // be_staff_chat_messages — defensive cleanup if probe9 inversion broke (V27 lesson)
  {
    const snap = await data.collection('be_staff_chat_messages').get();
    for (const d of snap.docs) {
      if (!d.id.startsWith('test-probe-staffchat-')) continue;
      await d.ref.delete();
      nuked.be_staff_chat_messages = (nuked.be_staff_chat_messages || 0) + 1;
    }
  }

  console.log(`=== CLEANUP @ ${new Date().toISOString()} ===`);
  console.log(`  chat_conversations: nuked ${nuked.chat_conversations}`);
  console.log(`  opd_sessions:       nuked ${nuked.opd_sessions}`);
  console.log(`  be_staff_chat_messages: nuked ${nuked.be_staff_chat_messages || 0}`);
}

// ─── Entry ─────────────────────────────────────────────────────────────────
async function main() {
  if (MODE === 'pre' || MODE === 'probe') {
    const { allOk } = await runProbe('pre');
    if (!allOk) {
      console.error('PRE-PROBE FAILED — DO NOT DEPLOY. Investigate failures above.');
      process.exit(2);
    }
    console.log('PRE-PROBE OK.');
    return process.exit(0);
  }
  if (MODE === 'post') {
    const { allOk } = await runProbe('post');
    if (!allOk) {
      console.error('POST-PROBE FAILED — REVERT firestore.rules IMMEDIATELY.');
      console.error('Recovery: git checkout HEAD~1 -- firestore.rules && firebase deploy --only firestore:rules');
      process.exit(2);
    }
    console.log('POST-PROBE OK.');
    await runCleanup();
    console.log('CLEANUP DONE.');
    return process.exit(0);
  }
  if (MODE === 'cleanup') {
    await runCleanup();
    return process.exit(0);
  }
  console.error(`Unknown mode: ${MODE} (use pre|post|probe|cleanup)`);
  process.exit(1);
}

main().catch(err => {
  console.error('SCRIPT FAILED:', err);
  process.exit(1);
});
