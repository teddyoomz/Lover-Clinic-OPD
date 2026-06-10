// scripts/diag-ws1-clinic-settings-secrets.mjs — Rule R (READ-ONLY) diagnostic.
// WS1 / M2: the firestore rule `clinic_settings/{settingId} read: if true` keeps the
// public doc world-readable (theme/logo/name/hours needed pre-auth on patient pages).
// This diag confirms NO secret leaked into a world-readable clinic_settings doc.
// (FB/LINE channel secrets MUST live under the staff-only chat_config / be_line_configs /
//  be_fb_configs paths — never the public clinic_settings doc.)
//
// Read-only. Prints flagged FIELD NAMES + a short masked preview only — never full values.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
// The system_config doc is gated read:isClinicStaff() (a more-specific rule) — NOT public.
// Only the wildcard clinic_settings/{settingId} docs are world-readable; system_config is excluded.
const NON_PUBLIC_DOC_IDS = new Set(['system_config']);
const SECRET_RE = /secret|passwd|password|privatekey|private_key|channelaccesstoken|channel_access_token|accesstoken|access_token|apikey|api_key|\bkey\b|bearer|token|credential|client_secret|app_secret|appsecret/i;

function loadEnv() {
  const raw = readFileSync('.env.local.prod', 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function getDb() {
  if (getApps().length) return getFirestore();
  const env = loadEnv();
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('missing FIREBASE_ADMIN_* in .env.local.prod');
  initializeApp({ credential: cert({ projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID, clientEmail, privateKey: rawKey.split('\\n').join('\n') }) });
  return getFirestore();
}

const col = (db, c) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(c);

// Recursively walk an object; return flagged paths (key OR string value matches SECRET_RE).
function scan(obj, prefix = '') {
  const flagged = [];
  if (obj == null || typeof obj !== 'object') return flagged;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const keyHit = SECRET_RE.test(k);
    const valHit = typeof v === 'string' && v.length > 0 && SECRET_RE.test(path);
    if (keyHit || valHit) {
      const preview = typeof v === 'string' ? `len=${v.length}` : `<${typeof v}>`;
      flagged.push(`${path} (${preview})`);
    }
    if (v && typeof v === 'object') flagged.push(...scan(v, path));
  }
  return flagged;
}

async function main() {
  const db = getDb();
  const snap = await col(db, 'clinic_settings').get();
  console.log('=== WS1 / M2 — public clinic_settings secret audit (READ-ONLY) ===');
  console.log(`docs in clinic_settings: ${snap.size}`);
  let totalFlagged = 0;
  for (const d of snap.docs) {
    const isPublic = !NON_PUBLIC_DOC_IDS.has(d.id);
    const flagged = scan(d.data());
    const tag = isPublic ? 'PUBLIC (read:if true)' : 'staff-only (read:isClinicStaff)';
    if (flagged.length) {
      totalFlagged += isPublic ? flagged.length : 0;
      console.log(`\n  [${d.id}] ${tag} — flagged ${flagged.length} field(s):`);
      for (const f of flagged) console.log(`      ⚠ ${f}`);
    } else {
      console.log(`  [${d.id}] ${tag} — clean`);
    }
  }
  console.log('');
  if (totalFlagged === 0) {
    console.log('✅ RESULT: no secret-looking field in any PUBLIC clinic_settings doc. M2 clear.');
  } else {
    console.log(`🚨 RESULT: ${totalFlagged} secret-looking field(s) in a PUBLIC clinic_settings doc.`);
    console.log('   → ESCALATE: move the secret to a staff-only path (chat_config / be_line_configs /');
    console.log('     be_fb_configs) via a Rule M migration before relying on the public read rule.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
