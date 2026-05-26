// Rule R diag (READ-ONLY) — inspect push_config state to root-cause symptom ③
// "no mobile push on patient-form submit". The push fn (functions/index.js
// sendPushOnSubmit) is called by PatientForm after submit; it reads
// push_config/tokens + push_config/settings.globalPushMuted. This script
// reports both so we know whether push is broken by stale/empty tokens or a
// global mute (NOT by the AdminDashboard tab removal — that's frontend-only).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function loadEnv() {
  const text = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const key = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b',
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: key,
    }),
  });
  const db = getFirestore();
  const APP_ID = 'loverclinic-opd-4c39b';

  // --- push_config/tokens ---
  const tokensRef = db.doc(`artifacts/${APP_ID}/public/data/push_config/tokens`);
  const tokensSnap = await tokensRef.get();
  console.log('=== push_config/tokens ===');
  if (!tokensSnap.exists) {
    console.log('❌ tokens DOC DOES NOT EXIST → push fn returns "no tokens doc" → NO push ever sent');
  } else {
    const tokens = tokensSnap.data().tokens || [];
    console.log(`   token count = ${tokens.length}`);
    if (tokens.length === 0) {
      console.log('❌ tokens array EMPTY → push fn returns "no tokens" → NO push. Admin must re-enable.');
    }
    tokens.forEach((t, i) => {
      const tk = typeof t === 'string' ? t : t.token;
      const ua = (typeof t === 'object' && t.userAgent) ? t.userAgent : '(string-form token, no UA)';
      const created = (typeof t === 'object' && t.createdAt) ? t.createdAt : '(unknown)';
      console.log(`   [${i}] ...${(tk || '').slice(-16)} · created=${created} · UA=${ua}`);
    });
  }

  // --- push_config/settings ---
  const settingsRef = db.doc(`artifacts/${APP_ID}/public/data/push_config/settings`);
  const settingsSnap = await settingsRef.get();
  console.log('\n=== push_config/settings ===');
  if (!settingsSnap.exists) {
    console.log('   settings doc missing → globalPushMuted defaults FALSE (push not muted)');
  } else {
    const s = settingsSnap.data();
    console.log('   globalPushMuted =', s.globalPushMuted,
      s.globalPushMuted ? '❌ MUTED → push fn returns "push muted (test mode)" → NO push' : '✅ not muted');
    console.log('   full settings:', JSON.stringify(s));
  }

  console.log('\n=== Verdict ===');
  const tokensOk = tokensSnap.exists && (tokensSnap.data().tokens || []).length > 0;
  const muted = settingsSnap.exists && settingsSnap.data().globalPushMuted === true;
  if (!tokensOk) console.log('→ ROOT CAUSE candidate: no/empty tokens. Fix = admin re-enable push (UI reachable in top bell).');
  if (muted) console.log('→ ROOT CAUSE candidate: globalPushMuted=true. Fix = unmute.');
  if (tokensOk && !muted) console.log('→ tokens present + not muted → push SHOULD fire. If user still gets none: tokens may be STALE/invalid (FCM auto-prunes on next send) OR device-side notification permission revoked. Needs a live test send.');

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
