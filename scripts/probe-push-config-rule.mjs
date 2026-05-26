// Rule B Probe-Deploy-Probe + Rule Q L2 — push_config firestore rule deploy.
// Run BEFORE deploy (expect push_config staff-write DENIED = the bug) and AFTER
// deploy (expect ALLOWED = fixed). Uses REAL client auth: a clinic-staff custom
// token (minted via admin SDK with isClinicStaff claim) + an anonymous token,
// then issues the EXACT Firestore REST writes the browser issues. Admin SDK is
// used ONLY to mint the custom token (NOT to write) — the writes go through the
// client auth path that real rules gate. Cleans up any TEST-PROBE doc it creates.
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20'; // public web key (src/firebase.js)
const PROJECT = 'loverclinic-opd-4c39b';
const APP_ID = 'loverclinic-opd-4c39b';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const PREFIX = `artifacts/${APP_ID}/public/data`;

function loadEnv() {
  const text = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function anonToken() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  });
  return (await r.json()).idToken;
}

async function staffToken() {
  const custom = await getAuth().createCustomToken('probe-push-config-staff', { isClinicStaff: true });
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  return (await r.json()).idToken;
}

async function writeProbe(idToken, collection, docId) {
  const r = await fetch(`${FS}/${PREFIX}/${collection}?documentId=${docId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields: { probe: { booleanValue: true } } }),
  });
  return r.status;
}
async function readProbe(idToken, path) {
  const r = await fetch(`${FS}/${path}`, { headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} });
  return r.status; // 200 = exists+allowed, 404 = allowed but missing, 403 = denied
}
async function deleteProbe(idToken, collection, docId) {
  await fetch(`${FS}/${PREFIX}/${collection}/${docId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}` } });
}

async function main() {
  const env = loadEnv();
  const key = env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n');
  initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || PROJECT, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: key }) });

  const ts = Date.now();
  const anon = await anonToken();
  const staff = await staffToken();

  const staffDoc = `TEST-PROBE-staff-${ts}`;
  const staffCode = await writeProbe(staff, 'push_config', staffDoc);
  const anonCode = await writeProbe(anon, 'push_config', `TEST-PROBE-anon-${ts}`);
  // baseline (no pollution): public read of clinic_settings should NOT be 403
  const readCode = await readProbe(anon, `${PREFIX}/clinic_settings/main`);
  if (staffCode === 200) await deleteProbe(staff, 'push_config', staffDoc);

  console.log('=== push_config rule probe ===');
  console.log(`  push_config staff-write : HTTP ${staffCode}  (FIX target = 200 post-deploy; 403 pre-deploy)`);
  console.log(`  push_config anon-write  : HTTP ${anonCode}  (want 403 — not world-open)`);
  console.log(`  clinic_settings anon-read: HTTP ${readCode}  (want 200/404 = allowed; 403 = REGRESSION)`);
  console.log('=== verdict ===');
  console.log(`  staff push_config = ${staffCode === 200 ? 'ALLOWED ✓' : 'DENIED (' + staffCode + ')'}`);
  console.log(`  anon push_config  = ${anonCode === 403 ? 'DENIED ✓' : 'CODE ' + anonCode + ' ✗'}`);
  console.log(`  public read       = ${readCode !== 403 ? 'OK ✓ (no regression)' : 'DENIED ✗ REGRESSION'}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
