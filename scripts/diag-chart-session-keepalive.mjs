// scripts/diag-chart-session-keepalive.mjs — Rule R diag helper.
// Keeps a tablet-chart relay session alive during a manual/Chrome-MCP test by
// re-stamping pcHeartbeatAt every 12s, so the orphan-sweep cron does NOT reap it
// (cancelledBy:'timeout'). Run in background; kill when the test is done.
//   node scripts/diag-chart-session-keepalive.mjs <sessionId>
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const P = `artifacts/${APP_ID}/public/data`;
function loadEnv(p) { const o = {}; for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2].replace(/^"(.*)"$/, '$1'); } return o; }
const env = loadEnv('.env.local.prod');
initializeApp({ credential: cert({ projectId: APP_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n') }) });
const db = getFirestore();
const sid = process.argv[2];
if (!sid) { console.error('usage: keepalive <sessionId>'); process.exit(1); }
console.log('keepalive for ' + sid);
setInterval(async () => {
  try { await db.doc(`${P}/be_chart_edit_sessions/${sid}`).set({ pcHeartbeatAt: Date.now(), updatedAt: Date.now() }, { merge: true }); process.stdout.write('.'); }
  catch (e) { console.error('hb err', e.message); }
}, 12000);
