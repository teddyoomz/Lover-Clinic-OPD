#!/usr/bin/env node
// ─── Rule R/Q diag — real FCM test-send for AV210 post-deploy verification ───
//
// Default: READ-ONLY — lists push_config/tokens with age + zombie/fresh class.
// --send            : sends a REAL test push to every FRESH token (createdAt >=
//                     cutoff, i.e. minted by the fixed SW scope). The user must
//                     SEE the notification pop on the device (Rule Q L1 proof).
// --send-all        : sends to EVERY token (proves the zombie theory: sends
//                     "succeed" but nothing displays on pre-fix tokens).
//
// Uses the EXACT message shape functions/index.js sendPushOnSubmit sends.
// Run: node scripts/diag-push-test-send.mjs [--send|--send-all]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CUTOFF_ISO = '2026-07-19T08:00:00.000Z'; // = prune-legacy-push-tokens.mjs cutoff

function loadEnvLocal() {
  const txt = readFileSync(path.resolve(process.cwd(), '.env.local.prod'), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[line.slice(0, eq).trim()] = v;
  }
}

async function main() {
  const SEND = process.argv.includes('--send');
  const SEND_ALL = process.argv.includes('--send-all');
  loadEnvLocal();
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getMessaging } = await import('firebase-admin/messaging');

  const APP_ID = 'loverclinic-opd-4c39b';
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n'),
    }) });
  }
  const db = getFirestore();
  const snap = await db.doc(`artifacts/${APP_ID}/public/data/push_config/tokens`).get();
  const entries = snap.exists ? (snap.data().tokens || []) : [];
  console.log(`── push_config/tokens (${entries.length}) ──`);
  const fresh = [], zombie = [];
  for (const t of entries) {
    const tk = typeof t === 'string' ? t : t.token;
    const createdAt = typeof t === 'string' ? '' : (t.createdAt || '');
    const cls = createdAt >= CUTOFF_ISO ? 'FRESH' : 'zombie(pre-fix)';
    (cls === 'FRESH' ? fresh : zombie).push(tk);
    console.log(`  [${cls}] ...${tk.slice(-16)} · created=${createdAt || '(legacy)'} · UA=${(typeof t === 'string' ? '' : t.userAgent || '').slice(0, 60)}`);
  }
  console.log(`fresh ${fresh.length} · zombie ${zombie.length}`);

  if (!SEND && !SEND_ALL) { console.log('\nread-only. --send = test push to FRESH tokens · --send-all = to ALL.'); return; }
  const targets = SEND_ALL ? [...fresh, ...zombie] : fresh;
  if (targets.length === 0) { console.log('no target tokens.'); return; }

  const now = new Date();
  const title = '🔔 ทดสอบแจ้งเตือน LoverClinic';
  const body = `AV210 verification — ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`;
  // EXACT shape of functions/index.js sendPushOnSubmit
  const message = {
    notification: { title, body },
    webpush: {
      notification: { title, body, icon: '/favicon.svg', badge: '/favicon.svg', requireInteraction: true, data: { url: '/' } },
      fcmOptions: { link: '/' },
    },
    tokens: targets,
  };
  const resp = await getMessaging().sendEachForMulticast(message);
  console.log(`\nsent → success ${resp.successCount} · fail ${resp.failureCount}`);
  resp.responses.forEach((r, i) => {
    if (!r.success) console.log(`  FAIL ...${targets[i].slice(-16)} · ${r.error?.code} ${r.error?.message}`);
    else console.log(`  OK   ...${targets[i].slice(-16)}`);
  });
  console.log('\n→ Rule Q L1: the notification must VISIBLY pop on the device(s). FCM "success" alone proves delivery-accepted, not display.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
}
