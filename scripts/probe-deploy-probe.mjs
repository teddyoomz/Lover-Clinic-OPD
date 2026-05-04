// ─── Probe-Deploy-Probe (Rule B iron-clad) ──────────────────────────────────
// 5-endpoint check before + after firestore:rules deploy. If post-probe
// returns 403 on any endpoint → revert deploy immediately.
//
// Endpoints (per .claude/rules/01-iron-clad.md Rule B):
//   1. POST chat_conversations (unauth REST)
//   2. PATCH pc_appointments (unauth REST)
//   3. PATCH clinic_settings/proclinic_session (cookie-relay extension write)
//   4. PATCH clinic_settings/proclinic_session_trial (cookie-relay trial)
//   5. anon-auth: signUp → CREATE opd_sessions w/ isArchived:true → PATCH
//      whitelisted field (V23 patient form submit + V27 hide-from-queue)
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

async function probe2_pcAppointments(ts) {
  const docId = `test-probe-pc-${ts}`;
  const url = `${FIRESTORE_BASE}/${DATA_PATH}/pc_appointments/${docId}?updateMask.fieldPaths=probe&updateMask.fieldPaths=_probeAt`;
  const r = await http('PATCH', url, {
    body: { fields: { probe: { booleanValue: true }, _probeAt: { stringValue: new Date().toISOString() } } },
  });
  return { name: 'pc_appointments PATCH', docId, status: r.status, ok: r.ok, error: r.ok ? null : r.text.slice(0, 200) };
}

async function probe3_proclinicSession() {
  // PATCH on the REAL session doc — adds + then strips a probe field.
  const url = `${FIRESTORE_BASE}/${DATA_PATH}/clinic_settings/proclinic_session?updateMask.fieldPaths=probe`;
  const r = await http('PATCH', url, {
    body: { fields: { probe: { booleanValue: true } } },
  });
  return { name: 'clinic_settings/proclinic_session PATCH', status: r.status, ok: r.ok, error: r.ok ? null : r.text.slice(0, 200) };
}

async function probe4_proclinicSessionTrial() {
  const url = `${FIRESTORE_BASE}/${DATA_PATH}/clinic_settings/proclinic_session_trial?updateMask.fieldPaths=probe`;
  const r = await http('PATCH', url, {
    body: { fields: { probe: { booleanValue: true } } },
  });
  return { name: 'clinic_settings/proclinic_session_trial PATCH', status: r.status, ok: r.ok, error: r.ok ? null : r.text.slice(0, 200) };
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

// ─── Probe orchestrator ─────────────────────────────────────────────────────
async function runProbe(label) {
  const ts = Date.now();
  console.log(`=== ${label.toUpperCase()} PROBE @ ${new Date().toISOString()} ===`);
  const results = await Promise.all([
    probe1_chatConversations(ts),
    probe2_pcAppointments(ts),
    probe3_proclinicSession(),
    probe4_proclinicSessionTrial(),
    probe5_anonOpdSessions(ts),
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

  let nuked = { chat_conversations: 0, pc_appointments: 0, opd_sessions: 0, clinic_settings_stripped: 0 };

  // chat_conversations test-probe-chat-* + test-probe-* (legacy)
  for (const prefix of ['test-probe-chat-', 'test-probe-']) {
    const snap = await data.collection('chat_conversations').get();
    for (const d of snap.docs) {
      if (!d.id.startsWith(prefix)) continue;
      await d.ref.delete();
      nuked.chat_conversations += 1;
    }
  }
  // pc_appointments test-probe-pc-* + test-probe-*
  {
    const snap = await data.collection('pc_appointments').get();
    for (const d of snap.docs) {
      if (!d.id.startsWith('test-probe')) continue;
      await d.ref.delete();
      nuked.pc_appointments += 1;
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
  // Strip 'probe' field from clinic_settings/proclinic_session* (admin SDK)
  for (const docId of ['proclinic_session', 'proclinic_session_trial']) {
    try {
      const ref = data.collection('clinic_settings').doc(docId);
      const snap = await ref.get();
      if (snap.exists && snap.data()?.probe !== undefined) {
        const { FieldValue } = await import('firebase-admin/firestore');
        await ref.update({ probe: FieldValue.delete() });
        nuked.clinic_settings_stripped += 1;
      }
    } catch (e) { console.warn(`  cleanup ${docId}:`, e.message); }
  }

  console.log(`=== CLEANUP @ ${new Date().toISOString()} ===`);
  console.log(`  chat_conversations: nuked ${nuked.chat_conversations}`);
  console.log(`  pc_appointments:    nuked ${nuked.pc_appointments}`);
  console.log(`  opd_sessions:       nuked ${nuked.opd_sessions}`);
  console.log(`  clinic_settings:    stripped probe field on ${nuked.clinic_settings_stripped} doc(s)`);
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
