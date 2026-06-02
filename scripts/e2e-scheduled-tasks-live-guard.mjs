// scripts/e2e-scheduled-tasks-live-guard.mjs
// ─── Rule Q LIVE adversarial verification of the DEPLOYED Scheduled Tasks system ───
//
// Hits the REAL deployed Vercel endpoints (https://lover-clinic-app.vercel.app) to
// verify the paths that local vitest + the config-only L2 script CANNOT reach:
//
//   A — Security: every /api/cron/* rejects a no-secret request (401, auth-first,
//       BEFORE any work/LINE-send) + run-now rejects no-token / bad-token (401).
//   B — run-now input validation (authed): unknown / missing taskId → 400.
//   C — THE #1 GAP: a DISABLED scheduled cron actually SKIPS on the deployed system
//       (writes config enabled:false → GETs the live cron w/ CRON_SECRET, NO force →
//       expects {skipped:'disabled-by-config'} + a skipped status doc), and force=1
//       OVERRIDES the disable (runs anyway). Reversible: captures the raw config
//       entry up front + restores it EXACTLY (FieldValue.delete if it was absent)
//       in a finally. Uses chartEditSessionSweep — non-safety-critical, idempotent
//       (orphan tablet-session reap), every 15 min, so a few-second disable window
//       is harmless.
//   D — run-now end-to-end of an ENABLED task through the deployed endpoint (200 +
//       cronStatus 200 + a real result).
//
// Needs .env.local.prod (CRON_SECRET + FIREBASE_ADMIN_*). Run AFTER deploy.
//   node scripts/e2e-scheduled-tasks-live-guard.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { SCHEDULED_TASKS, getTask } from '../src/lib/scheduledTasksRegistry.js';

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const mm = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!mm) continue;
      let v = mm[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(mm[1] in process.env)) process.env[mm[1]] = v;
    }
  } catch { /* optional */ }
}
loadEnvFile('.env.local.prod');

const BASE = process.env.LIVE_BASE_URL || 'https://lover-clinic-app.vercel.app';
const WEB_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20'; // public web API key
const APP_ID = 'loverclinic-opd-4c39b';
const CONFIG_DOC = `artifacts/${APP_ID}/public/data/clinic_settings/system_config`;
const STATUS_DOC = `artifacts/${APP_ID}/public/data/clinic_settings/scheduled_task_status`;
const SECRET = process.env.CRON_SECRET;

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey }) });
}

async function adminIdToken() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loverclinic@loverclinic.com', password: 'Lover2024', returnSecureToken: true }),
  });
  const d = await r.json();
  if (!d.idToken) throw new Error('admin auth failed: ' + (d.error?.message || '?'));
  return d.idToken;
}

const getCron = (path, { secret = false, force = false } = {}) =>
  fetch(`${BASE}${path}${force ? '?force=1' : ''}`, secret ? { headers: { authorization: `Bearer ${SECRET}` } } : {});
const runNow = (taskId, token) =>
  fetch(`${BASE}/api/admin/run-scheduled-task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(taskId === undefined ? {} : { taskId }),
  });
const freshMs = 90_000; // a status lastRunAt within 90s counts as "this run"

async function main() {
  if (!SECRET) { console.error('CRON_SECRET missing — vercel env pull .env.local.prod --environment=production'); process.exit(1); }
  initAdmin();
  const db = getFirestore();
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} · ${m}`); };

  // ── A · Security: every cron rejects no-secret (auth-first, before any work) ──
  console.log('\n── A · cron CRON_SECRET gate (no-secret → 401, all 10) ──');
  for (const t of SCHEDULED_TASKS) {
    const r = await getCron(t.cronPath, { secret: false });
    ok(r.status === 401, `${t.id} (${t.cronPath}) no-secret → ${r.status} (expect 401)`);
  }
  console.log('\n── A · run-now auth gate ──');
  ok((await runNow('chartEditSessionSweep', null)).status === 401, 'run-now no-token → 401');
  ok((await runNow('chartEditSessionSweep', 'garbage.token.x')).status === 401, 'run-now bad-token → 401');

  // ── B · run-now input validation (authed) ──
  console.log('\n── B · run-now input validation (authed) ──');
  const token = await adminIdToken();
  {
    const r = await runNow('definitely-not-a-task', token); const b = await r.json().catch(() => ({}));
    ok(r.status === 400 && b.error === 'UNKNOWN_TASK', `run-now unknown taskId → ${r.status} ${b.error}`);
  }
  {
    const r = await runNow(undefined, token); const b = await r.json().catch(() => ({}));
    ok(r.status === 400, `run-now missing taskId → ${r.status} ${b.error || ''}`);
  }

  // ── C · LIVE GUARD: disabled cron SKIPS on the deployed system + force overrides ──
  console.log('\n── C · live disable-skip + force-override (chartEditSessionSweep) ──');
  const TASK = 'chartEditSessionSweep';
  const CRONPATH = getTask(TASK).cronPath;
  // capture raw config entry (may be undefined) for an exact restore
  const rawSnap = await db.doc(CONFIG_DOC).get();
  const rawBefore = rawSnap.data()?.scheduledTasks?.[TASK]; // undefined if absent
  try {
    await db.doc(CONFIG_DOC).set({ scheduledTasks: { [TASK]: { enabled: false } } }, { merge: true });

    // C1 — no force → deployed cron must skip
    let t0 = Date.now();
    const r1 = await getCron(CRONPATH, { secret: true, force: false });
    const b1 = await r1.json().catch(() => ({}));
    ok(r1.status === 200 && b1.skipped === 'disabled-by-config',
      `disabled + no-force → ${r1.status} ${JSON.stringify(b1)} (expect skipped)`);
    // C2 — status doc reflects the skip
    const s1 = (await db.doc(STATUS_DOC).get()).data()?.[TASK] || {};
    ok(s1.skipped === true && Date.parse(s1.lastRunAt) >= t0 - 5000,
      `status after skip → skipped:${s1.skipped} fresh:${Date.parse(s1.lastRunAt) >= t0 - 5000}`);

    // C3 — force=1 OVERRIDES the disable (runs)
    t0 = Date.now();
    const r2 = await getCron(CRONPATH, { secret: true, force: true });
    const b2 = await r2.json().catch(() => ({}));
    ok(r2.status === 200 && typeof b2.scanned === 'number' && b2.skipped === undefined,
      `disabled + force=1 → ${r2.status} ${JSON.stringify(b2)} (expect ran, not skipped)`);
    // C4 — status doc reflects the real run
    const s2 = (await db.doc(STATUS_DOC).get()).data()?.[TASK] || {};
    ok(s2.skipped === false && Date.parse(s2.lastRunAt) >= t0 - 5000,
      `status after force-run → skipped:${s2.skipped} fresh:${Date.parse(s2.lastRunAt) >= t0 - 5000}`);
  } finally {
    // restore EXACTLY: delete the field if it was absent, else set it back verbatim
    if (rawBefore === undefined) {
      await db.doc(CONFIG_DOC).set({ scheduledTasks: { [TASK]: FieldValue.delete() } }, { merge: true });
    } else {
      await db.doc(CONFIG_DOC).set({ scheduledTasks: { [TASK]: rawBefore } }, { merge: true });
    }
    const after = (await db.doc(CONFIG_DOC).get()).data()?.scheduledTasks?.[TASK];
    ok(JSON.stringify(after) === JSON.stringify(rawBefore),
      `config restored exactly (was ${JSON.stringify(rawBefore)})`);
  }

  // ── D · run-now end-to-end of an ENABLED task through the deployed endpoint ──
  console.log('\n── D · run-now end-to-end (authed, enabled task) ──');
  {
    const t0 = Date.now();
    const r = await runNow(TASK, token); const b = await r.json().catch(() => ({}));
    ok(r.status === 200 && b.cronStatus === 200 && b.result && typeof b.result.scanned === 'number',
      `run-now ${TASK} → ${r.status} cronStatus:${b.cronStatus} result:${JSON.stringify(b.result)}`);
    const s = (await db.doc(STATUS_DOC).get()).data()?.[TASK] || {};
    ok(Date.parse(s.lastRunAt) >= t0 - 5000, `status fresh after run-now (${s.lastRunAt})`);
  }

  console.log(`\n=== LIVE GUARD ${fail === 0 ? 'GREEN' : 'RED'} · ${pass} pass / ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('LIVE GUARD ERROR:', e); process.exit(1); });
}
