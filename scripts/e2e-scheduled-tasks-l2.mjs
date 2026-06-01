// scripts/e2e-scheduled-tasks-l2.mjs — Rule Q L2 verification of the
// config <-> cron contract against REAL prod Firestore (admin SDK).
//
//   READ phase (default, Rule R read-only): reads the real system_config doc and
//     runs the REAL readScheduledTaskConfig for every registry task → asserts a
//     sane {enabled, params} shape (fail-safe defaults when scheduledTasks absent).
//     Proves the cron-side read path works against the real prod doc shape.
//
//   WRITE phase (--apply, Rule M two-phase): toggles ONE task's enabled=false in
//     system_config.scheduledTasks, re-reads via readScheduledTaskConfig → asserts
//     enabled:false (i.e. that cron WOULD skip), then restores. Proves the
//     config-respect contract end-to-end on real prod.
//
// Usage:  node scripts/e2e-scheduled-tasks-l2.mjs            (read-only)
//         node scripts/e2e-scheduled-tasks-l2.mjs --apply    (toggle + restore)
//
// Needs .env.local.prod (vercel env pull --environment=production). Run AFTER
// deploy for the meaningful end-to-end (the deployed crons carry the guard).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readScheduledTaskConfig } from '../api/_lib/scheduledTaskRuntime.js';
import { SCHEDULED_TASKS } from '../src/lib/scheduledTasksRegistry.js';

// Minimal .env loader (project has no dotenv dependency).
function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const mm = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!mm) continue;
      let v = mm[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(mm[1] in process.env)) process.env[mm[1]] = v;
    }
  } catch { /* env file optional */ }
}
loadEnvFile('.env.local.prod');

const APP_ID = 'loverclinic-opd-4c39b';
const CONFIG_DOC = `artifacts/${APP_ID}/public/data/clinic_settings/system_config`;

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  initAdmin();
  const db = getFirestore();
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} · ${m}`); };

  // ── READ phase ──────────────────────────────────────────────────────────
  const snap = await db.doc(CONFIG_DOC).get();
  ok(snap.exists, `system_config doc exists`);
  console.log(`  scheduledTasks field present: ${!!snap.data()?.scheduledTasks}`);

  for (const t of SCHEDULED_TASKS) {
    const cfg = await readScheduledTaskConfig(db, t.id);
    ok(typeof cfg.enabled === 'boolean' && cfg.params && typeof cfg.params === 'object',
      `readScheduledTaskConfig('${t.id}') → {enabled:${cfg.enabled}, params:${JSON.stringify(cfg.params)}}`);
  }

  // ── WRITE phase (--apply) ───────────────────────────────────────────────
  if (apply) {
    const TASK = 'chatHistoryRetention';
    const before = await readScheduledTaskConfig(db, TASK);
    console.log(`\n[--apply] toggling ${TASK} → enabled:false ...`);
    await db.doc(CONFIG_DOC).set({ scheduledTasks: { [TASK]: { enabled: false } } }, { merge: true });
    const dis = await readScheduledTaskConfig(db, TASK);
    ok(dis.enabled === false, `after write, ${TASK}.enabled === false (cron WOULD skip)`);

    // restore: re-set to its prior enabled state (default true).
    await db.doc(CONFIG_DOC).set({ scheduledTasks: { [TASK]: { enabled: before.enabled } } }, { merge: true });
    const restored = await readScheduledTaskConfig(db, TASK);
    ok(restored.enabled === before.enabled, `restored ${TASK}.enabled === ${before.enabled}`);
  } else {
    console.log('\n(read-only — pass --apply to run the toggle+restore write phase)');
  }

  console.log(`\n=== L2 ${fail === 0 ? 'GREEN' : 'RED'} · ${pass} pass / ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('L2 ERROR:', e); process.exit(1); });
}
