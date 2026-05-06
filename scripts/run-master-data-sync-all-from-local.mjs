#!/usr/bin/env node
// ─── Run ALL master_data sync actions LOCALLY (no deploy) ──────────────────
//
// Phase 24.0-vicies-novies-quater (2026-05-07)
//
// User directive (verbatim): "HTTP 404 หมดเลย มีทางทำให้สามารถทำได้โดยไม่ต้อง
// deploy ได้ไหมเพราะตอนนี้นายมี env ทุกอย่างในมือ pull ลงมาเมื่อไหร่ก็ได้
// ถ้าทำได้ฝากในสั่งรัน sync ทั้งหมดให้สักทีนะ".
//
// Why 404: `npm run dev` runs vite-only — no `/api/*` serverless functions.
// Frontend brokerClient hits localhost:5173/api/proclinic/master → 404.
//
// This script bypasses the HTTP layer entirely:
//   1. Load .env.local.prod (PROCLINIC_* + FIREBASE_ADMIN_*)
//   2. Init firebase-admin
//   3. Mint a Firebase ID token via createCustomToken + signInWithCustomToken
//      so verifyAuth() inside the handler accepts the request
//   4. For each of 18 sync actions:
//      a. Build mock req {method:'POST', body:{action}, headers:{authorization}}
//      b. Build mock res that captures status() + json() output
//      c. Invoke master.js default-export handler — runs the real ProClinic
//         scrape (via session.js + scraper.js), returns items
//      d. Write meta doc + items to master_data/{type} via admin SDK
//   5. Audit doc to be_admin_audit/master-data-sync-all-{ts}-{rand}
//
// Two-phase:
//   Default = full run (no --dry-run flag exists for SYNC; sync is read-only
//   on ProClinic side + idempotent on master_data side via setDoc-merge).
//
// Sequential: each ProClinic sync internally rate-limits + retries; running
// in parallel risks 429-from-ProClinic. ~5-10 minutes total expected.
//
// Run via:
//   vercel env pull .env.local.prod --environment=production
//   node scripts/run-master-data-sync-all-from-local.mjs
//   node scripts/run-master-data-sync-all-from-local.mjs --only=syncProducts,syncDoctors  (subset)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Vite-style path resolution to find master.js relative to project root
const __filename = fileURLToPath(import.meta.url);

// ─── Load .env.local.prod or .env.local ──────────────────────────────────
// Dotenv-compatible parser: handles double-quoted values with \n / \r / \t /
// \" escape sequences (Vercel CLI exports multi-line values as literal
// backslash-n, e.g. PROCLINIC_ORIGIN="https://proclinicth.com\n"). Without
// this conversion, the literal \n stays in the URL and breaks fetch with a
// confusing 404 (URL parser passes the malformed URL through to the server).
function parseEnvFile(text) {
  const out = {};
  // Match KEY=VALUE where VALUE may be:
  //   1. Double-quoted with backslash escapes (\\n, \\r, \\t, \\")
  //   2. Single-quoted (no escapes)
  //   3. Unquoted (single line)
  // Multi-line quoted values also supported via dotall.
  const re = /^([A-Z0-9_]+)=(?:"((?:\\.|[^"\\])*)"|'([^']*)'|(.*))$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[1];
    let val;
    if (m[2] !== undefined) {
      // Double-quoted — decode escapes
      val = m[2]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else if (m[3] !== undefined) {
      // Single-quoted — literal
      val = m[3];
    } else {
      // Unquoted
      val = (m[4] || '').trim();
    }
    out[key] = val;
  }
  return out;
}

const envFile = existsSync('.env.local.prod') ? '.env.local.prod' : '.env.local';
if (existsSync(envFile)) {
  const envText = readFileSync(envFile, 'utf-8');
  const parsed = parseEnvFile(envText);
  for (const [k, v] of Object.entries(parsed)) {
    process.env[k] = v;
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────
const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';

// 18 canonical sync actions from api/proclinic/master.js + brokerClient.js.
// Order matters: doctors/staff before staff_schedules (FK resolution).
const ALL_SYNC_ACTIONS = Object.freeze([
  'syncDoctors',
  'syncStaff',
  'syncProducts',
  'syncCourses',
  'syncProductGroups',
  'syncProductUnits',
  'syncMedicalInstruments',
  'syncHolidays',
  'syncBranches',
  'syncPermissionGroups',
  'syncWalletTypes',
  'syncMembershipTypes',
  'syncCoupons',
  'syncVouchers',
  'syncDfGroups',
  'syncDfStaffRates',
  'syncMedicineLabels',
  'syncSchedules',  // last — needs doctors + staff already in be_*
]);

// ─── CLI args ──────────────────────────────────────────────────────────────
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyActions = onlyArg
  ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const actionsToRun = onlyActions
  ? ALL_SYNC_ACTIONS.filter((a) => onlyActions.includes(a))
  : ALL_SYNC_ACTIONS;

// ─── Firebase init ─────────────────────────────────────────────────────────
function initFirebase() {
  if (getApps().length > 0) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  if (!privateKey || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
    console.error('[sync-all] FATAL — missing FIREBASE_ADMIN_* env vars.');
    console.error('  Run: vercel env pull .env.local.prod --environment=production');
    process.exit(1);
  }
  initializeApp({
    credential: cert({
      type: 'service_account',
      project_id: APP_ID,
      private_key: privateKey,
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    }),
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function randHex(n = 8) {
  return randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

async function mintIdToken() {
  // Create custom token → exchange for ID token via Identity Toolkit.
  // The handler's verifyAuth() reads the Bearer token + calls
  // identitytoolkit:lookup which accepts ID tokens (not custom tokens).
  const customToken = await getAuth().createCustomToken('script-master-sync', {
    isClinicStaff: true,
    admin: true,
  });
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Failed to exchange custom token: ${resp.status} ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (!data.idToken) throw new Error('No idToken returned from Identity Toolkit');
  return data.idToken;
}

function buildMockReqRes(action, idToken) {
  const captured = { status: 0, body: null, headers: {} };
  const req = {
    method: 'POST',
    headers: { authorization: `Bearer ${idToken}` },
    // body.useTrialServer is OMITTED → getSession routes to PROCLINIC_ORIGIN
    // env (production). This matches Phase 24.0-vicies-novies-ter source switch.
    body: { action },
  };
  const res = {
    status(code) { captured.status = code; return this; },
    json(body) { captured.body = body; return this; },
    setHeader(k, v) { captured.headers[k] = v; return this; },
    end() { return this; },
  };
  return { req, res, captured };
}

async function writeMasterData(db, type, items, totalPages = 1) {
  // Meta doc
  await db.doc(`${BASE_PATH}/master_data/${type}`).set({
    type,
    count: items.length,
    totalPages: totalPages || 1,
    syncedAt: new Date().toISOString(),
  });
  // Items in subcollection — batches of 400
  const BATCH = 400;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const batch = db.batch();
    chunk.forEach((item, idx) => {
      const id = String(item.id || (i + idx));
      batch.set(
        db.doc(`${BASE_PATH}/master_data/${type}/items/${id}`),
        { ...item, _syncedAt: new Date().toISOString() },
      );
    });
    await batch.commit();
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('[sync-all] starting LOCAL master-data sync');
  console.log(`[sync-all] actions to run: ${actionsToRun.length} (${actionsToRun.join(', ')})`);
  initFirebase();
  const db = getFirestore();

  // Step 1: mint a Firebase ID token so verifyAuth accepts our requests
  console.log('[sync-all] minting Firebase ID token...');
  const idToken = await mintIdToken();

  // Step 2: dynamic import of master.js (after env loaded)
  // The path is project-relative; we're at scripts/, so master.js is ../api/proclinic/master.js
  const handlerModule = await import('../api/proclinic/master.js');
  const handler = handlerModule.default;
  if (typeof handler !== 'function') {
    throw new Error('master.js default export is not a function');
  }

  // Step 3: run each action sequentially
  const results = [];
  for (const action of actionsToRun) {
    const t0 = Date.now();
    process.stdout.write(`[sync-all] ${action.padEnd(28)} ... `);
    try {
      const { req, res, captured } = buildMockReqRes(action, idToken);
      await handler(req, res);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      if (captured.status !== 200) {
        console.log(`HTTP ${captured.status} (${elapsed}s) — ${JSON.stringify(captured.body).slice(0, 200)}`);
        results.push({ action, status: captured.status, error: captured.body?.error || 'non-200', elapsed });
        continue;
      }
      if (!captured.body?.success) {
        console.log(`FAIL (${elapsed}s) — ${captured.body?.error || 'unknown'}`);
        results.push({ action, status: 200, error: captured.body?.error || 'success=false', elapsed });
        continue;
      }
      const items = captured.body.items || [];
      const type = captured.body.type;
      const totalPages = captured.body.totalPages || 1;
      if (!type) {
        console.log(`OK but NO TYPE — skipping write`);
        results.push({ action, status: 200, count: items.length, error: 'no type field', elapsed });
        continue;
      }
      await writeMasterData(db, type, items, totalPages);
      console.log(`OK ${items.length} items → master_data/${type} (${elapsed}s)`);
      results.push({ action, status: 200, type, count: items.length, totalPages, elapsed });
    } catch (e) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`ERROR (${elapsed}s) — ${e.message}`);
      results.push({ action, error: e.message, elapsed });
    }
  }

  // Step 4: audit doc
  const auditId = `master-data-sync-all-from-local-${Date.now()}-${randHex()}`;
  await db.doc(`${BASE_PATH}/be_admin_audit/${auditId}`).set({
    phase: '24.0-vicies-novies-quater',
    op: 'master-data-sync-all-from-local',
    actionsRun: actionsToRun,
    results,
    totals: {
      attempted: results.length,
      succeeded: results.filter((r) => r.count !== undefined).length,
      failed: results.filter((r) => r.error).length,
      itemsWritten: results.reduce((sum, r) => sum + (r.count || 0), 0),
    },
    runAt: FieldValue.serverTimestamp(),
  });

  // Step 5: summary
  console.log('\n[sync-all] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const r of results) {
    const tag = r.error ? 'FAIL' : 'OK  ';
    const ext = r.error ? r.error.slice(0, 60) : `${r.count} items`;
    console.log(`[sync-all] ${tag} ${r.action.padEnd(28)} ${ext}`);
  }
  console.log('[sync-all] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const total = results.length;
  const ok = results.filter((r) => !r.error).length;
  console.log(`[sync-all] DONE: ${ok}/${total} succeeded. Audit: ${BASE_PATH}/be_admin_audit/${auditId}`);
  process.exit(ok === total ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[sync-all] FATAL', err);
    process.exit(1);
  });
}
