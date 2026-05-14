#!/usr/bin/env node
// ─── Rule Q L2 e2e — LINE Reminder pipeline on REAL PROD ─────────────────────
//
// Verifies the runReminderPipeline against real Firestore across 8 multi-branch
// routing scenarios (spec §12 P2). Imports `runReminderPipeline` from the cron
// endpoint directly — NOT a mock or reimplementation.
//
// 8 scenarios:
//   A — real นครราชสีมา OA + admin's real lineUserId    → expect status='sent' (real LINE push)
//   B — fake BRANCH-Y OA config (FAKE token)            → expect status='failed', lineApiResult.statusCode ∈ 4xx
//                                                          + customerLineUserId === 'U-FAKE-Y' (NOT cross-leak)
//   C — cross-branch customer (linked at REAL only)     → expect status='skipped-no-line-this-branch'
//   D — multi-branch linked customer (REAL + BRANCH-Y)  → 2 logs, each with correct per-branch userId
//   E — missing branch OA (no be_line_configs doc)      → expect status='skipped-branch-no-oa'
//   F — branch OA disabled (enabled:false)              → expect status='skipped-branch-no-oa'
//   G — opt-out path (notifyOptOut:true)                → expect status='skipped-optout'
//   H — stale path (_lineStale:true)                    → expect status='skipped-stale'
//
// Usage:
//   node scripts/e2e-line-reminder-real-prod.mjs                  (dry-run preview)
//   node scripts/e2e-line-reminder-real-prod.mjs --apply \
//        --admin-line-user-id=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   (seed + run + verify + cleanup)
//
// --apply REQUIRES --admin-line-user-id=Uxxx (your real LINE userId for Scenario A push).
// All TEST-V67-* + TEST-LINE-* fixtures are cleaned up at end via try/finally.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runReminderPipeline } from '../api/cron/line-reminder-fire.js';

// ─── env loader (canonical Rule M pattern) ───────────────────────────────────
function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env.local.prod'));
if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) loadDotEnv(path.resolve(process.cwd(), '.env.local'));

const APP_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;
const BATCH_LIMIT = 400;

function getAdmin() {
  if (getApps().length > 0) return getFirestore(getApp());
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!clientEmail || !rawKey) throw new Error('FIREBASE_ADMIN_* env missing — pull .env.local.prod first');
  const app = initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail,
      privateKey: rawKey.split('\\n').join('\n'),
    }),
  });
  return getFirestore(app);
}

const db = getAdmin();
const dataCol = (n) => db.collection(BASE_PATH + '/' + n);
const dataDoc = (col, id) => db.doc(`${BASE_PATH}/${col}/${id}`);

// ─── args ────────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply');
const ADMIN_LINE_USER_ID_ARG = process.argv.find(a => a.startsWith('--admin-line-user-id='));
const ADMIN_LINE_USER_ID = ADMIN_LINE_USER_ID_ARG
  ? ADMIN_LINE_USER_ID_ARG.replace('--admin-line-user-id=', '')
  : null;

const ts = Date.now();

// ─── helpers ─────────────────────────────────────────────────────────────────
function pass(scenario, msg) {
  console.log(`  ✅ ${scenario} PASS  ${msg}`);
  return { pass: true, message: msg };
}
function fail(scenario, msg) {
  console.log(`  ❌ ${scenario} FAIL  ${msg}`);
  process.exitCode = 1;
  return { pass: false, message: msg };
}
function info(msg) { console.log(`  ℹ️  ${msg}`); }

function tomorrowBangkokISO(now = new Date()) {
  const utcMs = now.getTime();
  const bkkMs = utcMs + 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000;
  const d = new Date(bkkMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Build minimal valid be_line_configs doc shape.
function buildBranchCfg({ branchId, channelAccessToken, enabled = true, reminderEnabled = true, currentHour = 20 }) {
  return {
    branchId,
    channelAccessToken,
    channelSecret: 'TEST-V67-FAKE-SECRET',
    enabled,
    lineReminder: {
      enabled: reminderEnabled,
      dayBeforeHour: currentHour,
      dayOfHour: 9,
      quietHourStart: 22,
      quietHourEnd: 8,
    },
  };
}

// Build minimal valid be_customers doc.
function buildCustomer({ id, lineUserIdByBranch = {}, notifyOptOut = false }) {
  return {
    id,
    customerId: id,
    firstName: 'TEST-V67',
    lastName: id,
    branchId: Object.keys(lineUserIdByBranch)[0] || null,
    lineUserId_byBranch: lineUserIdByBranch,
    notifyOptOut,
    createdAt: new Date().toISOString(),
  };
}

// Build minimal valid be_appointments doc.
function buildAppointment({ id, customerId, branchId, appointmentDate, notifyChannel = ['line'] }) {
  return {
    id,
    appointmentId: id,
    customerId,
    branchId,
    appointmentDate,
    startTime: '14:00',
    endTime: '15:00',
    status: 'scheduled',
    notifyChannel,
    treatments: [],
    createdAt: new Date().toISOString(),
  };
}

// Resolve REAL นครราชสีมา branchId from be_branches list (first match).
async function resolveRealNakhonBranch() {
  const snap = await dataCol('be_branches').get();
  const match = snap.docs.find(d => {
    const data = d.data() || {};
    const name = String(data.branchName || data.name || '').toLowerCase();
    return name.includes('นครราชสีมา') || name.includes('nakhon');
  });
  if (!match) {
    // Fallback: pick first branch
    if (snap.docs.length === 0) throw new Error('No branches found in be_branches — cannot run Scenario A');
    info(`⚠️  No นครราชสีมา branch matched by name; falling back to first branch: ${snap.docs[0].id}`);
    return snap.docs[0].id;
  }
  return match.id;
}

// Get existing real branch OA config (if exists) — Scenario A uses real OA token.
async function getRealBranchCfg(branchId) {
  const snap = await dataDoc('be_line_configs', branchId).get();
  if (!snap.exists) {
    info(`⚠️  No be_line_configs/${branchId} on prod — Scenario A will FAIL with skipped-branch-no-oa`);
    info(`     Admin must configure LINE OA for the branch first (LineSettingsTab).`);
    return null;
  }
  return { branchId, ...snap.data() };
}

// ─── Scenario runners ────────────────────────────────────────────────────────

// Scenario A: real นครราชสีมา OA + admin's REAL lineUserId.
// Triggers a REAL LINE push to the admin's phone.
async function scenarioA(realBranchId, adminLineUserId) {
  const scenarioId = 'A';
  console.log(`\n── Scenario ${scenarioId}: real branch OA + admin real lineUserId ──`);

  const branchCfg = await getRealBranchCfg(realBranchId);
  if (!branchCfg) {
    return fail(scenarioId, `No be_line_configs/${realBranchId} exists — configure via LineSettingsTab first`);
  }
  if (!branchCfg.channelAccessToken) {
    return fail(scenarioId, `be_line_configs/${realBranchId} missing channelAccessToken`);
  }

  const custId = `TEST-LINE-CUST-A-${ts}`;
  const apptId = `TEST-LINE-APPT-A-${ts}`;
  const appointmentDate = tomorrowBangkokISO();

  const cust = buildCustomer({
    id: custId,
    lineUserIdByBranch: {
      [realBranchId]: { lineUserId: adminLineUserId, linkedAt: new Date().toISOString() },
    },
  });
  cust.branchId = realBranchId;
  const appt = buildAppointment({ id: apptId, customerId: custId, branchId: realBranchId, appointmentDate });
  const branchSnap = await dataDoc('be_branches', realBranchId).get();
  const branch = branchSnap.exists ? { branchId: realBranchId, ...branchSnap.data() } : { branchId: realBranchId };

  await dataDoc('be_customers', custId).set(cust);
  await dataDoc('be_appointments', apptId).set(appt);

  const currentHour = branchCfg.lineReminder?.dayBeforeHour ?? 20;
  info(`Pushing REAL message to LINE userId=${adminLineUserId} via branch=${realBranchId}`);

  const result = await runReminderPipeline({
    db, appt, cust, branch, doctor: null, treatments: [], branchCfg, reminderType: 'dayBefore', currentHour,
  });

  const logSnap = await dataDoc('be_line_reminder_log', `${apptId}_dayBefore`).get();
  if (!logSnap.exists) return fail(scenarioId, 'log doc not written');
  const log = logSnap.data();

  if (result.status === 'sent' && log.status === 'sent' && log.customerLineUserId === adminLineUserId) {
    info(`✉️  Check the admin's LINE app for the message (real push completed)`);
    return pass(scenarioId, `status=sent, customerLineUserId=${log.customerLineUserId}`);
  }
  return fail(scenarioId, `expected sent, got ${result.status} / log.status=${log.status} (error=${log.lastError})`);
}

// Scenario B: FAKE BRANCH-Y OA config — verify 401 push + log carries correct
// per-branch userId (NO cross-branch leak from any other test customer).
async function scenarioB(testBranchY) {
  const scenarioId = 'B';
  console.log(`\n── Scenario ${scenarioId}: fake BRANCH-Y OA (FAKE token → 401) ──`);

  const branchCfg = buildBranchCfg({
    branchId: testBranchY,
    channelAccessToken: `TEST-V67-FAKE-TOKEN-Y-${ts}`,
  });
  await dataDoc('be_line_configs', testBranchY).set(branchCfg);

  const custId = `TEST-LINE-CUST-Y-${ts}`;
  const apptId = `TEST-LINE-APPT-Y-${ts}`;
  const cust = buildCustomer({
    id: custId,
    lineUserIdByBranch: {
      [testBranchY]: { lineUserId: 'U-FAKE-Y', linkedAt: new Date().toISOString() },
    },
  });
  cust.branchId = testBranchY;
  const appt = buildAppointment({ id: apptId, customerId: custId, branchId: testBranchY, appointmentDate: tomorrowBangkokISO() });

  await dataDoc('be_customers', custId).set(cust);
  await dataDoc('be_appointments', apptId).set(appt);

  const result = await runReminderPipeline({
    db, appt, cust, branch: { branchId: testBranchY }, doctor: null, treatments: [],
    branchCfg, reminderType: 'dayBefore', currentHour: branchCfg.lineReminder.dayBeforeHour,
  });

  const logSnap = await dataDoc('be_line_reminder_log', `${apptId}_dayBefore`).get();
  if (!logSnap.exists) return fail(scenarioId, 'log doc not written');
  const log = logSnap.data();

  // FAKE token causes LINE API to return 401 (Invalid signature). Some 4xx responses
  // are non-retryable (treated as 'failed' status).
  const sc = log.lineApiResult?.statusCode;
  if (log.status !== 'failed') {
    return fail(scenarioId, `expected log.status=failed, got ${log.status}`);
  }
  if (log.customerLineUserId !== 'U-FAKE-Y') {
    return fail(scenarioId, `log.customerLineUserId='${log.customerLineUserId}' — CROSS-LEAK detected; expected 'U-FAKE-Y'`);
  }
  if (typeof sc !== 'number' || sc < 400 || sc >= 600) {
    return fail(scenarioId, `expected LINE 4xx/5xx statusCode, got ${sc}`);
  }
  return pass(scenarioId, `status=failed, customerLineUserId=U-FAKE-Y (NO cross-leak), lineApiResult.statusCode=${sc}`);
}

// Scenario C: cross-branch customer (LR-3). Customer linked ONLY at REAL_BR;
// has appt at TEST_BR_Y. customer.branchId=REAL_BR. Legacy fallback MUST NOT fire
// because customer.branchId !== appt.branchId.
async function scenarioC(realBranchId, testBranchY) {
  const scenarioId = 'C';
  console.log(`\n── Scenario ${scenarioId}: cross-branch customer (LR-3) ──`);

  // BRANCH-Y cfg must exist (re-used from B if seeded — or seed minimally here for isolation)
  const cfgSnap = await dataDoc('be_line_configs', testBranchY).get();
  let branchCfg;
  if (cfgSnap.exists) {
    branchCfg = { branchId: testBranchY, ...cfgSnap.data() };
  } else {
    branchCfg = buildBranchCfg({ branchId: testBranchY, channelAccessToken: `TEST-V67-FAKE-TOKEN-Y-${ts}` });
    await dataDoc('be_line_configs', testBranchY).set(branchCfg);
  }

  const custId = `TEST-LINE-CUST-C-${ts}`;
  const apptId = `TEST-LINE-APPT-C-${ts}`;
  const cust = buildCustomer({
    id: custId,
    lineUserIdByBranch: {
      [realBranchId]: { lineUserId: 'U-FAKE-C', linkedAt: new Date().toISOString() },
    },
  });
  cust.branchId = realBranchId; // legacy field — must NOT leak as fallback for appt at Y
  // Also set legacy customer.lineUserId — proves the helper rejects it at non-matching branch
  cust.lineUserId = 'U-FAKE-C-LEGACY';
  const appt = buildAppointment({ id: apptId, customerId: custId, branchId: testBranchY, appointmentDate: tomorrowBangkokISO() });

  await dataDoc('be_customers', custId).set(cust);
  await dataDoc('be_appointments', apptId).set(appt);

  const result = await runReminderPipeline({
    db, appt, cust, branch: { branchId: testBranchY }, doctor: null, treatments: [],
    branchCfg, reminderType: 'dayBefore', currentHour: branchCfg.lineReminder.dayBeforeHour,
  });

  const logSnap = await dataDoc('be_line_reminder_log', `${apptId}_dayBefore`).get();
  if (!logSnap.exists) return fail(scenarioId, 'log doc not written');
  const log = logSnap.data();

  if (log.status !== 'skipped-no-line-this-branch') {
    return fail(scenarioId, `expected skipped-no-line-this-branch, got ${log.status}`);
  }
  if (log.customerLineUserId !== null) {
    return fail(scenarioId, `log.customerLineUserId should be null on skip, got '${log.customerLineUserId}'`);
  }
  return pass(scenarioId, `status=skipped-no-line-this-branch (LR-3: customer.branchId=REAL ignored at appt.branchId=Y)`);
}

// Scenario D: multi-branch linked customer. 2 appts, one at REAL, one at Y.
// Verify 2 separate logs with DIFFERENT per-branch userIds.
async function scenarioD(realBranchId, testBranchY) {
  const scenarioId = 'D';
  console.log(`\n── Scenario ${scenarioId}: multi-branch linked customer ──`);

  // Re-use real branch cfg + Y cfg (Scenario A + B must have seeded them).
  const realCfgSnap = await dataDoc('be_line_configs', realBranchId).get();
  if (!realCfgSnap.exists) {
    return fail(scenarioId, `prereq: be_line_configs/${realBranchId} must exist (configure via LineSettingsTab)`);
  }
  const realCfg = { branchId: realBranchId, ...realCfgSnap.data() };
  const yCfgSnap = await dataDoc('be_line_configs', testBranchY).get();
  const yCfg = yCfgSnap.exists ? { branchId: testBranchY, ...yCfgSnap.data() }
    : buildBranchCfg({ branchId: testBranchY, channelAccessToken: `TEST-V67-FAKE-TOKEN-Y-${ts}` });
  if (!yCfgSnap.exists) await dataDoc('be_line_configs', testBranchY).set(yCfg);

  const custId = `TEST-LINE-CUST-D-${ts}`;
  const apptIdReal = `TEST-LINE-APPT-D-REAL-${ts}`;
  const apptIdY = `TEST-LINE-APPT-D-Y-${ts}`;
  const userIdReal = 'U-FAKE-D-REAL';
  const userIdY = 'U-FAKE-D-Y';

  const cust = buildCustomer({
    id: custId,
    lineUserIdByBranch: {
      [realBranchId]: { lineUserId: userIdReal, linkedAt: new Date().toISOString() },
      [testBranchY]:   { lineUserId: userIdY,    linkedAt: new Date().toISOString() },
    },
  });
  cust.branchId = realBranchId;
  const apptReal = buildAppointment({ id: apptIdReal, customerId: custId, branchId: realBranchId, appointmentDate: tomorrowBangkokISO() });
  const apptY    = buildAppointment({ id: apptIdY,    customerId: custId, branchId: testBranchY,   appointmentDate: tomorrowBangkokISO() });

  await dataDoc('be_customers', custId).set(cust);
  await dataDoc('be_appointments', apptIdReal).set(apptReal);
  await dataDoc('be_appointments', apptIdY).set(apptY);

  // Pipeline call for REAL branch — DO NOT actually push to admin's LINE (use a no-op pushFn).
  // We're verifying that the pipeline writes log with the CORRECT per-branch userId,
  // not exercising the real push (Scenario A already covered that).
  const noopPush = async () => ({ statusCode: 200, body: '{}' });
  const resultReal = await runReminderPipeline({
    db, appt: apptReal, cust, branch: { branchId: realBranchId }, doctor: null, treatments: [],
    branchCfg: realCfg, reminderType: 'dayBefore',
    currentHour: realCfg.lineReminder?.dayBeforeHour ?? 20, pushFn: noopPush,
  });
  const resultY = await runReminderPipeline({
    db, appt: apptY, cust, branch: { branchId: testBranchY }, doctor: null, treatments: [],
    branchCfg: yCfg, reminderType: 'dayBefore',
    currentHour: yCfg.lineReminder?.dayBeforeHour ?? 20, pushFn: noopPush,
  });

  const logRealSnap = await dataDoc('be_line_reminder_log', `${apptIdReal}_dayBefore`).get();
  const logYSnap    = await dataDoc('be_line_reminder_log', `${apptIdY}_dayBefore`).get();
  if (!logRealSnap.exists || !logYSnap.exists) {
    return fail(scenarioId, 'one or both log docs missing');
  }
  const logReal = logRealSnap.data();
  const logY = logYSnap.data();

  if (logReal.customerLineUserId !== userIdReal) {
    return fail(scenarioId, `REAL log userId='${logReal.customerLineUserId}', expected '${userIdReal}'`);
  }
  if (logY.customerLineUserId !== userIdY) {
    return fail(scenarioId, `Y log userId='${logY.customerLineUserId}', expected '${userIdY}'`);
  }
  if (logReal.branchId !== realBranchId || logY.branchId !== testBranchY) {
    return fail(scenarioId, `log.branchId mismatch: real=${logReal.branchId}, y=${logY.branchId}`);
  }
  return pass(scenarioId, `2 logs each with correct per-branch userId (real=${userIdReal}, y=${userIdY})`);
}

// Scenario E: missing branch OA (no be_line_configs doc).
async function scenarioE(testBranchZ) {
  const scenarioId = 'E';
  console.log(`\n── Scenario ${scenarioId}: missing branch OA ──`);

  // Deliberately DO NOT create be_line_configs/testBranchZ.
  const custId = `TEST-LINE-CUST-E-${ts}`;
  const apptId = `TEST-LINE-APPT-E-${ts}`;
  const cust = buildCustomer({
    id: custId,
    lineUserIdByBranch: {
      [testBranchZ]: { lineUserId: 'U-FAKE-E', linkedAt: new Date().toISOString() },
    },
  });
  cust.branchId = testBranchZ;
  const appt = buildAppointment({ id: apptId, customerId: custId, branchId: testBranchZ, appointmentDate: tomorrowBangkokISO() });

  await dataDoc('be_customers', custId).set(cust);
  await dataDoc('be_appointments', apptId).set(appt);

  // Pass branchCfg=null (simulates cron's "no config doc" path)
  const result = await runReminderPipeline({
    db, appt, cust, branch: { branchId: testBranchZ }, doctor: null, treatments: [],
    branchCfg: null, reminderType: 'dayBefore', currentHour: 20,
  });

  const logSnap = await dataDoc('be_line_reminder_log', `${apptId}_dayBefore`).get();
  if (!logSnap.exists) return fail(scenarioId, 'log doc not written');
  const log = logSnap.data();
  if (log.status !== 'skipped-branch-no-oa') {
    return fail(scenarioId, `expected skipped-branch-no-oa, got ${log.status}`);
  }
  return pass(scenarioId, `status=skipped-branch-no-oa`);
}

// Scenario F: branch OA disabled (channelAccessToken empty, simulating disabled).
// Pipeline gate: `if (!branchCfg || !branchCfg.channelAccessToken)` → skipped-branch-no-oa.
async function scenarioF(testBranchF) {
  const scenarioId = 'F';
  console.log(`\n── Scenario ${scenarioId}: branch OA disabled ──`);

  // Cron-level filter (`if (!branchCfg.enabled || !branchCfg.channelAccessToken) continue`)
  // means disabled branches are skipped at the cron loop. At the pipeline level,
  // the same gate fires on missing channelAccessToken. We simulate the disabled
  // case via empty channelAccessToken (which a disabled branch effectively has at
  // pipeline-invocation time).
  const branchCfg = buildBranchCfg({
    branchId: testBranchF,
    channelAccessToken: '', // disabled / empty token
    enabled: false,
  });
  await dataDoc('be_line_configs', testBranchF).set(branchCfg);

  const custId = `TEST-LINE-CUST-F-${ts}`;
  const apptId = `TEST-LINE-APPT-F-${ts}`;
  const cust = buildCustomer({
    id: custId,
    lineUserIdByBranch: {
      [testBranchF]: { lineUserId: 'U-FAKE-F', linkedAt: new Date().toISOString() },
    },
  });
  cust.branchId = testBranchF;
  const appt = buildAppointment({ id: apptId, customerId: custId, branchId: testBranchF, appointmentDate: tomorrowBangkokISO() });

  await dataDoc('be_customers', custId).set(cust);
  await dataDoc('be_appointments', apptId).set(appt);

  const result = await runReminderPipeline({
    db, appt, cust, branch: { branchId: testBranchF }, doctor: null, treatments: [],
    branchCfg, reminderType: 'dayBefore', currentHour: 20,
  });

  const logSnap = await dataDoc('be_line_reminder_log', `${apptId}_dayBefore`).get();
  if (!logSnap.exists) return fail(scenarioId, 'log doc not written');
  const log = logSnap.data();
  if (log.status !== 'skipped-branch-no-oa') {
    return fail(scenarioId, `expected skipped-branch-no-oa, got ${log.status}`);
  }
  return pass(scenarioId, `status=skipped-branch-no-oa (disabled branch / empty token)`);
}

// Scenario G: opt-out path.
async function scenarioG(realBranchId) {
  const scenarioId = 'G';
  console.log(`\n── Scenario ${scenarioId}: opt-out path ──`);

  const realCfgSnap = await dataDoc('be_line_configs', realBranchId).get();
  if (!realCfgSnap.exists) {
    return fail(scenarioId, `prereq: be_line_configs/${realBranchId} must exist`);
  }
  const realCfg = { branchId: realBranchId, ...realCfgSnap.data() };
  if (!realCfg.channelAccessToken) {
    // Use a sentinel non-empty token; the pipeline must NEVER actually push for opt-out.
    realCfg.channelAccessToken = 'TEST-V67-SENTINEL-TOKEN';
  }

  const custId = `TEST-LINE-CUST-G-${ts}`;
  const apptId = `TEST-LINE-APPT-G-${ts}`;
  const cust = buildCustomer({
    id: custId,
    lineUserIdByBranch: {
      [realBranchId]: { lineUserId: 'U-FAKE-G', linkedAt: new Date().toISOString() },
    },
    notifyOptOut: true,
  });
  cust.branchId = realBranchId;
  const appt = buildAppointment({ id: apptId, customerId: custId, branchId: realBranchId, appointmentDate: tomorrowBangkokISO() });

  await dataDoc('be_customers', custId).set(cust);
  await dataDoc('be_appointments', apptId).set(appt);

  // Defensive — pushFn throws so we detect any leak past the opt-out gate.
  const guardPush = async () => { throw new Error('SCENARIO-G-LEAK: push fired despite opt-out'); };
  const result = await runReminderPipeline({
    db, appt, cust, branch: { branchId: realBranchId }, doctor: null, treatments: [],
    branchCfg: realCfg, reminderType: 'dayBefore', currentHour: realCfg.lineReminder?.dayBeforeHour ?? 20,
    pushFn: guardPush,
  });

  const logSnap = await dataDoc('be_line_reminder_log', `${apptId}_dayBefore`).get();
  if (!logSnap.exists) return fail(scenarioId, 'log doc not written');
  const log = logSnap.data();
  if (log.status !== 'skipped-optout') {
    return fail(scenarioId, `expected skipped-optout, got ${log.status}`);
  }
  return pass(scenarioId, `status=skipped-optout (push never fired)`);
}

// Scenario H: stale path (_lineStale:true on the per-branch link).
async function scenarioH(realBranchId) {
  const scenarioId = 'H';
  console.log(`\n── Scenario ${scenarioId}: stale path ──`);

  const realCfgSnap = await dataDoc('be_line_configs', realBranchId).get();
  if (!realCfgSnap.exists) {
    return fail(scenarioId, `prereq: be_line_configs/${realBranchId} must exist`);
  }
  const realCfg = { branchId: realBranchId, ...realCfgSnap.data() };
  if (!realCfg.channelAccessToken) {
    realCfg.channelAccessToken = 'TEST-V67-SENTINEL-TOKEN';
  }

  const custId = `TEST-LINE-CUST-H-${ts}`;
  const apptId = `TEST-LINE-APPT-H-${ts}`;
  const cust = buildCustomer({
    id: custId,
    lineUserIdByBranch: {
      [realBranchId]: {
        lineUserId: 'U-FAKE-H',
        linkedAt: new Date().toISOString(),
        _lineStale: true,
        _lineStaleAt: new Date().toISOString(),
      },
    },
  });
  cust.branchId = realBranchId;
  const appt = buildAppointment({ id: apptId, customerId: custId, branchId: realBranchId, appointmentDate: tomorrowBangkokISO() });

  await dataDoc('be_customers', custId).set(cust);
  await dataDoc('be_appointments', apptId).set(appt);

  const guardPush = async () => { throw new Error('SCENARIO-H-LEAK: push fired despite stale link'); };
  const result = await runReminderPipeline({
    db, appt, cust, branch: { branchId: realBranchId }, doctor: null, treatments: [],
    branchCfg: realCfg, reminderType: 'dayBefore', currentHour: realCfg.lineReminder?.dayBeforeHour ?? 20,
    pushFn: guardPush,
  });

  const logSnap = await dataDoc('be_line_reminder_log', `${apptId}_dayBefore`).get();
  if (!logSnap.exists) return fail(scenarioId, 'log doc not written');
  const log = logSnap.data();
  if (log.status !== 'skipped-stale') {
    return fail(scenarioId, `expected skipped-stale, got ${log.status}`);
  }
  return pass(scenarioId, `status=skipped-stale (push never fired)`);
}

// ─── cleanup ─────────────────────────────────────────────────────────────────
async function cleanup() {
  console.log('\n── Cleanup (always — try/finally guarded) ──');
  let totalDeleted = 0;

  const collections = [
    'be_customers',
    'be_appointments',
    'be_line_configs',
    'be_line_reminder_log',
  ];

  for (const col of collections) {
    const ids = new Set();
    // ID-prefix sweep: TEST-LINE-* + TEST-V67-* covers all fixtures from scenarios A-H.
    // For be_line_reminder_log, log id = `${apptId}_${reminderType}` so prefix match
    // catches `TEST-LINE-APPT-*_dayBefore` keys too.
    const allSnap = await dataCol(col).get();
    for (const d of allSnap.docs) {
      const id = d.id;
      if (
        id.startsWith('TEST-LINE-') ||
        id.startsWith('TEST-V67-') ||
        // be_line_reminder_log composite key
        id.includes('TEST-LINE-APPT-') ||
        // Match on -${ts}- substring for paranoia (covers any odd id shape)
        id.includes(`-${ts}-`) ||
        id.endsWith(`-${ts}`)
      ) {
        ids.add(id);
      }
    }
    if (ids.size === 0) continue;
    const refs = [...ids].map(id => dataDoc(col, id));
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const slice = refs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const r of slice) batch.delete(r);
      await batch.commit();
      totalDeleted += slice.length;
    }
    info(`Cleaned ${ids.size} from ${col}`);
  }
  info(`Total deleted: ${totalDeleted} TEST-LINE-* / TEST-V67-* docs`);
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  Rule Q L2 e2e — LINE Reminder pipeline (8 multi-branch scenarios)');
  console.log(`  Mode: ${APPLY ? 'APPLY (real fixtures + real push for Scenario A)' : 'DRY-RUN preview only'}`);
  console.log('═════════════════════════════════════════════════════════════════');

  if (!APPLY) {
    console.log('\n⚠️  DRY-RUN — re-run with:');
    console.log('     node scripts/e2e-line-reminder-real-prod.mjs --apply --admin-line-user-id=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    console.log('\n   The --admin-line-user-id arg must be your REAL LINE userId (Scenario A pushes a real');
    console.log('   message to your LINE app). Get it via the LINE Developers console or webhook event log.');
    console.log('\n  Scenarios that will be exercised:');
    console.log('    A — real นครราชสีมา OA + admin real lineUserId (REAL LINE PUSH)');
    console.log('    B — fake BRANCH-Y OA token (4xx push, no cross-leak verification)');
    console.log('    C — cross-branch customer (LR-3 — legacy fallback must NOT fire)');
    console.log('    D — multi-branch linked customer (2 logs, per-branch userId)');
    console.log('    E — missing branch OA (skipped-branch-no-oa)');
    console.log('    F — branch OA disabled (skipped-branch-no-oa)');
    console.log('    G — opt-out path (push must NOT fire)');
    console.log('    H — stale path (push must NOT fire)');
    process.exit(0);
  }

  if (!ADMIN_LINE_USER_ID) {
    console.error('\n❌ --apply requires --admin-line-user-id=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    console.error('   (Scenario A pushes a REAL LINE message to your phone via the real branch OA token.)');
    process.exit(1);
  }
  if (!/^U[a-f0-9]{32}$/i.test(ADMIN_LINE_USER_ID)) {
    console.error(`\n❌ --admin-line-user-id must match /^U[a-f0-9]{32}$/i; got '${ADMIN_LINE_USER_ID}'`);
    process.exit(1);
  }

  const realBranchId = await resolveRealNakhonBranch();
  const TEST_BR_Y = `TEST-V67-BR-Y-${ts}`;
  const TEST_BR_Z = `TEST-V67-BR-Z-${ts}`;
  const TEST_BR_F = `TEST-V67-BR-F-${ts}`;

  info(`REAL_BR (นครราชสีมา-or-fallback): ${realBranchId}`);
  info(`TEST_BR_Y: ${TEST_BR_Y}`);
  info(`TEST_BR_Z: ${TEST_BR_Z}`);
  info(`TEST_BR_F: ${TEST_BR_F}`);
  info(`admin LINE userId: ${ADMIN_LINE_USER_ID.slice(0, 6)}...`);

  const results = {};
  try {
    results.A = await scenarioA(realBranchId, ADMIN_LINE_USER_ID);
    results.B = await scenarioB(TEST_BR_Y);
    results.C = await scenarioC(realBranchId, TEST_BR_Y);
    results.D = await scenarioD(realBranchId, TEST_BR_Y);
    results.E = await scenarioE(TEST_BR_Z);
    results.F = await scenarioF(TEST_BR_F);
    results.G = await scenarioG(realBranchId);
    results.H = await scenarioH(realBranchId);

    // ─── Report + audit doc ─────────────────────────────────────────────────
    console.log('\n═══ Summary ═══');
    const passCount = Object.values(results).filter(r => r.pass).length;
    const failCount = Object.values(results).filter(r => !r.pass).length;
    for (const [k, v] of Object.entries(results)) {
      console.log(`  ${v.pass ? '✅' : '❌'} ${k}: ${v.message}`);
    }
    console.log(`\n  PASS=${passCount} / FAIL=${failCount} / TOTAL=${Object.keys(results).length}`);

    const auditId = `e2e-line-reminder-${ts}`;
    await dataDoc('be_admin_audit', auditId).set({
      action: 'e2e-line-reminder-real-prod',
      scenarios: results,
      passCount, failCount, totalCount: Object.keys(results).length,
      realBranchId,
      testBranches: { y: TEST_BR_Y, z: TEST_BR_Z, f: TEST_BR_F },
      adminLineUserIdPrefix: ADMIN_LINE_USER_ID.slice(0, 6) + '...',
      executedAt: new Date().toISOString(),
    });
    info(`Audit doc: be_admin_audit/${auditId}`);
  } finally {
    await cleanup();
  }

  console.log('\n═════════════════════════════════════════════════════════════════');
  console.log(process.exitCode
    ? '  ❌ FAILED — one or more scenarios did NOT pass (check logs above)'
    : '  ✅ ALL 8 SCENARIOS PASSED — Rule Q L2 verified on real prod');
  console.log('═════════════════════════════════════════════════════════════════');
  process.exit(process.exitCode || 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error('FATAL:', e);
    // try cleanup even on fatal error (best-effort)
    cleanup().catch(() => {}).finally(() => process.exit(1));
  });
}
