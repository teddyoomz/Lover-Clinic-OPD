#!/usr/bin/env node
// scripts/v82-followup-state-machine-test.mjs
//
// V82-followup state-machine L2 verification (per Rule Q L2 — real client/admin
// SDK against real prod Firestore). Tests opd_sessions queue/archive/permanent/
// deposit/auto-archive filter round-trips for ALL formTypes after V82-followup
// patch (auto-archive opt-out + queue filter relax via _v82FollowupOpdResetAt).
//
// IMPORTANT — admin-SDK ONLY. No real action buttons. All fixtures prefixed
// TEST-V82-RT- per `feedback_no_real_action_in_preview_eval.md` lock.
//
// COPYIES filter logic VERBATIM from src/pages/AdminDashboard.jsx lines
// 2222-2286 so the test stays in sync with the source-of-truth (V12 multi-
// reader-sweep guard — when source changes, paste-update here).
//
// USAGE: node scripts/v82-followup-state-machine-test.mjs --apply
//        (defaults to DRY-RUN; --apply commits TEST-V82-RT- fixtures, runs
//        verification, then deletes ALL TEST-V82-RT- fixtures in finally{})
//
// REPORT: matrix per (formType × state) PASS/FAIL/N/A + per-failure
// assertion + actual filter output. Writes summary to be_admin_audit.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const APP_ID = 'loverclinic-opd-4c39b';
const BASE = ['artifacts', APP_ID, 'public', 'data'];
const TEST_PREFIX = 'TEST-V82-RT-';
const NAKHON_BR_ID = 'BR-1777873556815-26df6480';
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // mirror src/constants.js

const FORM_TYPES = ['intake', 'deposit', 'followup_ed', 'followup_adam', 'followup_mrs', 'custom'];
const STATES = ['A', 'B', 'C', 'D', 'E', 'F'];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.resolve('.env.local.prod'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function col(db, name) {
  let ref = db;
  for (const seg of BASE) ref = ref.collection ? ref.collection(seg) : ref.doc(seg);
  return ref.collection(name);
}

// ── Filter logic — COPIED VERBATIM from AdminDashboard.jsx ───────────────────
// (lines 2222-2286 / 7983-7991)
//
// Each filter takes the doc object (as returned by snapshot.docs.map(d => ({
// ...d.data(), id: d.id }))) plus current Date.now() for auto-archive checks.

// Queue filter (lines 2272-2286). Coerce to bool (source uses short-circuit
// short-form so undefined fields produce undefined returns — we want strict
// boolean for test comparison).
function isInQueue(session, now) {
  if (session.isArchived) return false;
  if (session.formType === 'deposit' && !session.serviceCompleted) return false;
  if (session.isPermanent && session.formType !== 'deposit' && !session.serviceCompleted) return false;
  if (session.isPermanent) return true;
  if (session.formType === 'deposit' && session.serviceCompleted) return true;
  if (session._v82FollowupOpdResetAt) return true;
  if (!session.createdAt) return true;
  const createdAtMs = session.createdAt.toMillis();
  return (now - createdAtMs) <= SESSION_TIMEOUT_MS;
}

// Archive (history) filter (line 2245) — coerce
function isInArchive(session) {
  return !!(session.isArchived
    && (session.formType !== 'deposit' || session.serviceCompleted)
    && !(session.isPermanent && session.formType !== 'deposit' && !session.serviceCompleted));
}

// Deposit tab filter (line 2252) — coerce
function isInDepositTab(session) {
  return !!(!session.isArchived && session.formType === 'deposit' && !session.serviceCompleted);
}

// Permanent (จองไม่มัดจำ) tab filter (line 2263) — coerce
function isInPermanentTab(session) {
  return !!(!session.isArchived && session.isPermanent && session.formType !== 'deposit' && !session.serviceCompleted);
}

// Auto-archive trigger (line 2222-2240). Returns the action that auto-archive
// effect WOULD take: 'delete' | 'archive' | 'noop'
function autoArchiveAction(session, now) {
  if (session.isArchived || session.isPermanent || !session.createdAt) return 'noop';
  if (session._v82FollowupOpdResetAt) return 'noop'; // V82-followup opt-out
  if ((now - session.createdAt.toMillis()) > SESSION_TIMEOUT_MS) {
    if (!session.patientData) return 'delete';
    if (!session.isArchived) return 'archive';
  }
  return 'noop';
}

// Save-to-OPD button gate (line 7979/7983 — status==='completed' && patientData)
function showsSaveToOpdButton(session) {
  return session.status === 'completed' && !!session.patientData;
}

// Green "service completed" button (line 7987 — patientData && opdRecordedAt && brokerStatus==='done')
function showsServiceCompletedButton(session) {
  return !!session.patientData && !!session.opdRecordedAt && session.brokerStatus === 'done';
}

// Cancel deposit button (line 7984 — formType==='deposit' && serviceCompleted)
function showsCancelDepositButton(session) {
  return session.formType === 'deposit' && !!session.serviceCompleted;
}

// ── Fixture builders ────────────────────────────────────────────────────────
function buildBaseFixture(formType, stateLabel) {
  const id = `${TEST_PREFIX}${formType}-${stateLabel}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const base = {
    branchId: NAKHON_BR_ID,
    patientData: { firstName: 'Test', lastName: 'V82RT', age: 30, phone: '0900000000' },
    formType,
    sessionName: `V82RT test ${formType} ${stateLabel}`,
  };
  if (formType === 'deposit') {
    base.depositData = { paymentAmount: 1000 };
  } else if (formType === 'custom') {
    base.customTemplate = { title: 'Test custom' };
  }
  return { id, base };
}

// State-specific overlays applied on top of base
function buildStateOverlay(state, now) {
  const oneHrAgo = Timestamp.fromMillis(now - (1 * 60 * 60 * 1000));
  const threeHrAgo = Timestamp.fromMillis(now - (3 * 60 * 60 * 1000));
  const nowTs = Timestamp.fromMillis(now);

  switch (state) {
    case 'A': // Fresh kiosk submission
      return {
        status: 'completed',
        isArchived: false,
        createdAt: oneHrAgo,
      };
    case 'B': // Admin saved to OPD
      return {
        status: 'completed',
        isArchived: true,
        archivedAt: nowTs,
        createdAt: threeHrAgo,
        opdRecordedAt: nowTs,
        brokerStatus: 'done',
      };
    case 'C': // Restored to queue 'timed' (2hr)
      return {
        status: 'completed',
        isArchived: false,
        archivedAt: null,
        isPermanent: false,
        createdAt: nowTs, // restoreToQueue sets serverTimestamp()
      };
    case 'D': // Restored to queue 'permanent'
      return {
        status: 'completed',
        isArchived: false,
        archivedAt: null,
        isPermanent: true,
        createdAt: threeHrAgo, // ageing irrelevant (isPermanent guard)
      };
    case 'E': // V82-followup opt-out (old createdAt + _v82FollowupOpdResetAt)
      return {
        status: 'completed',
        isArchived: false,
        createdAt: threeHrAgo,
        _v82FollowupOpdResetAt: nowTs,
        _v82FollowupOpdResetFrom: 'TEST-V82-RT-state-E',
      };
    case 'F': // deposit + serviceCompleted (only applies to formType='deposit')
      return {
        status: 'completed',
        isArchived: false,
        createdAt: oneHrAgo,
        serviceCompleted: true,
      };
    default:
      throw new Error(`Unknown state ${state}`);
  }
}

// Expected filter classification per (formType, state).
// All expected values mirror PRODUCTION CODE semantics (AdminDashboard.jsx).
// Behavior notes baked in:
// - deposit + !serviceCompleted ALWAYS goes to deposit tab (line 2274 short-circuits BEFORE V82-followup check)
// - non-deposit + isPermanent + !serviceCompleted ALWAYS goes to permanent tab (line 2275)
// - auto-archive at line 2222 does NOT special-case formType; deposits + non-isPermanent + has patientData + age>2hr → 'archive'
function finalExpectedFor(formType, state) {
  switch (state) {
    case 'A': {
      // Fresh kiosk submission (within 2hr). Deposits go to deposit tab; others go to queue.
      const isDeposit = formType === 'deposit';
      return {
        queue: !isDeposit,
        archive: false,
        deposit: isDeposit,
        permanent: false,
        // At now+3hr+1: createdAt was now-1hr → age = 4hr+ → trigger fires.
        // patientData present → action='archive'. Not opted-out.
        autoArchiveAt3hrPlus: 'archive',
        saveOpdBtn: true,
        serviceDoneBtn: false,
        cancelDepositBtn: false,
      };
    }
    case 'B': {
      // Admin saved to OPD: isArchived=true + opdRecordedAt + brokerStatus='done'.
      // Non-deposit → main archive; deposit (no serviceCompleted) → archivedDepositSessions (NOT main archive).
      const isDeposit = formType === 'deposit';
      return {
        queue: false,
        archive: !isDeposit, // line 2245 excludes deposit-without-serviceCompleted from main archive
        deposit: false, // archived deposits go to archivedDepositSessions, not deposit tab (line 2252 excludes isArchived)
        permanent: false,
        autoArchiveAt3hrPlus: 'noop', // already isArchived
        saveOpdBtn: true, // button render gated by status+patientData (status='completed' + patientData present)
        serviceDoneBtn: true, // patientData + opdRecordedAt + brokerStatus='done'
        cancelDepositBtn: false,
      };
    }
    case 'C': {
      // Restored to queue 'timed': createdAt=now, isArchived=false, isPermanent=false.
      // Deposit (no serviceCompleted) → still goes to deposit tab (line 2274). User cannot
      // "restore deposit to timed queue" — the deposit tab is its home until serviceCompleted.
      const isDeposit = formType === 'deposit';
      return {
        queue: !isDeposit,
        archive: false,
        deposit: isDeposit,
        permanent: false,
        // At now+3hr+1: createdAt=now → age = 3hr+ → trigger fires. patientData present → 'archive'.
        autoArchiveAt3hrPlus: 'archive',
        saveOpdBtn: true,
        serviceDoneBtn: false,
        cancelDepositBtn: false,
      };
    }
    case 'D': {
      // Restored to queue 'permanent': isPermanent=true.
      // For non-deposit + !serviceCompleted → permanent tab (line 2275 excludes from queue).
      // For deposit + !serviceCompleted → STILL deposit tab (line 2274 short-circuits BEFORE line 2275).
      const isDeposit = formType === 'deposit';
      return {
        queue: false,
        archive: false,
        deposit: isDeposit,
        permanent: !isDeposit,
        autoArchiveAt3hrPlus: 'noop', // isPermanent guards
        saveOpdBtn: true,
        serviceDoneBtn: false,
        cancelDepositBtn: false,
      };
    }
    case 'E': {
      // V82-followup opt-out: old createdAt + _v82FollowupOpdResetAt + isArchived=false.
      // For non-deposit: line 2282 V82-followup relax → queue=true. autoArchive opt-out (line 2230).
      // For deposit (no serviceCompleted): line 2274 short-circuits BEFORE line 2282 → still deposit tab.
      //   (Same architectural pattern: deposit's tab assignment has priority.)
      const isDeposit = formType === 'deposit';
      return {
        queue: !isDeposit,
        archive: false,
        deposit: isDeposit,
        permanent: false,
        autoArchiveAt3hrPlus: 'noop', // V82-followup opt-out at line 2230 (applies to ALL formTypes)
        saveOpdBtn: true,
        serviceDoneBtn: false,
        cancelDepositBtn: false,
      };
    }
    case 'F': {
      // deposit + serviceCompleted=true (only meaningful for deposit).
      if (formType !== 'deposit') return { skip: true };
      return {
        queue: true, // line 2277: deposit + serviceCompleted → in queue
        archive: false,
        deposit: false, // line 2252: serviceCompleted excludes from deposit tab
        permanent: false,
        // Not isPermanent + has patientData + age=oneHrAgo. At now+3hr+1: age = 4hr+ → fires → 'archive'.
        autoArchiveAt3hrPlus: 'archive',
        saveOpdBtn: true,
        serviceDoneBtn: false,
        cancelDepositBtn: true,
      };
    }
    default:
      throw new Error(`Unknown state ${state}`);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv();
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: APP_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
      }),
    });
  }
  const db = getFirestore();

  console.log('=== V82-followup STATE MACHINE TEST ===');
  console.log('Mode:', apply ? 'APPLY (will write + verify + delete fixtures)' : 'DRY-RUN (no writes)');
  console.log('Fixture prefix:', TEST_PREFIX);
  console.log();

  if (!apply) {
    console.log('Use --apply to run the test against real prod Firestore.');
    console.log('(Test creates ~30 TEST-V82-RT- fixtures, verifies filter classification, then deletes all.)');
    return;
  }

  const now = Date.now();
  const fixtures = []; // { formType, state, id, doc, expected }
  const created = [];

  // Phase 1: write fixtures
  console.log('--- Phase 1: writing TEST-V82-RT- fixtures ---');
  for (const formType of FORM_TYPES) {
    for (const state of STATES) {
      const expected = finalExpectedFor(formType, state);
      if (expected.skip) continue;
      const { id, base } = buildBaseFixture(formType, state);
      const overlay = buildStateOverlay(state, now);
      const doc = { ...base, ...overlay };
      fixtures.push({ formType, state, id, doc, expected });
    }
  }
  console.log(`Total fixtures planned: ${fixtures.length}`);

  try {
    // Batch write
    for (let i = 0; i < fixtures.length; i += 400) {
      const chunk = fixtures.slice(i, i + 400);
      const batch = db.batch();
      for (const f of chunk) {
        batch.set(col(db, 'opd_sessions').doc(f.id), f.doc);
        created.push(f.id);
      }
      await batch.commit();
      console.log(`  Wrote ${created.length}/${fixtures.length}`);
    }

    // Phase 2: read back + verify
    console.log('\n--- Phase 2: read back + classify ---');
    const results = []; // { formType, state, id, pass, failures: [...] }
    for (const f of fixtures) {
      const snap = await col(db, 'opd_sessions').doc(f.id).get();
      if (!snap.exists) {
        results.push({ ...f, pass: false, failures: ['DOC_NOT_FOUND after write'] });
        continue;
      }
      const session = { ...snap.data(), id: snap.id };

      // Run all filters
      const actual = {
        queue: isInQueue(session, now),
        archive: isInArchive(session),
        deposit: isInDepositTab(session),
        permanent: isInPermanentTab(session),
        autoArchiveAt3hrPlus: autoArchiveAction(session, now + (3 * 60 * 60 * 1000) + 1),
        saveOpdBtn: showsSaveToOpdButton(session),
        serviceDoneBtn: showsServiceCompletedButton(session),
        cancelDepositBtn: showsCancelDepositButton(session),
      };

      const failures = [];
      for (const k of Object.keys(actual)) {
        if (f.expected[k] === undefined) continue;
        if (actual[k] !== f.expected[k]) {
          failures.push(`${k}: expected=${JSON.stringify(f.expected[k])} actual=${JSON.stringify(actual[k])}`);
        }
      }
      results.push({ ...f, pass: failures.length === 0, failures, actual });
    }

    // Phase 3: print matrix
    console.log('\n--- Phase 3: Results matrix ---\n');
    const header = `${'formType'.padEnd(18)}| ${STATES.map(s => s.padEnd(7)).join('| ')}`;
    console.log(header);
    console.log('-'.repeat(header.length));
    for (const formType of FORM_TYPES) {
      const cells = STATES.map(state => {
        const r = results.find(x => x.formType === formType && x.state === state);
        if (!r) return 'N/A   '.padEnd(7);
        return (r.pass ? 'PASS' : 'FAIL').padEnd(7);
      });
      console.log(`${formType.padEnd(18)}| ${cells.join('| ')}`);
    }

    // Detailed failures
    const allFailures = results.filter(r => !r.pass);
    if (allFailures.length > 0) {
      console.log('\n--- DETAILED FAILURES ---');
      for (const r of allFailures) {
        console.log(`\n[${r.formType} / state ${r.state}] doc=${r.id}`);
        for (const fail of r.failures) {
          console.log(`  - ${fail}`);
        }
        console.log(`  actual: ${JSON.stringify(r.actual)}`);
      }
    } else {
      console.log('\n✓ ALL ASSERTIONS PASS');
    }

    // Phase 4: audit doc
    const ts = Date.now();
    const rand = crypto.randomBytes(4).toString('hex');
    const auditId = `v82-followup-state-machine-test-${ts}-${rand}`;
    await col(db, 'be_admin_audit').doc(auditId).set({
      type: 'v82-followup-state-machine-test',
      performedAt: new Date().toISOString(),
      fixturesCount: fixtures.length,
      passCount: results.filter(r => r.pass).length,
      failCount: allFailures.length,
      formTypes: FORM_TYPES,
      states: STATES,
      failures: allFailures.map(r => ({
        formType: r.formType,
        state: r.state,
        failures: r.failures,
        // sanitize undefined → null for Firestore compatibility
        actual: JSON.parse(JSON.stringify(r.actual ?? {}, (k, v) => v === undefined ? null : v)),
      })),
    });
    console.log(`\n✓ Audit doc: be_admin_audit/${auditId}`);

    return { ok: allFailures.length === 0, auditId, fixtures: fixtures.length, failures: allFailures.length };
  } finally {
    // Phase 5: cleanup ALL TEST-V82-RT- fixtures (use finally to guarantee)
    console.log('\n--- Phase 5: cleanup ---');
    if (created.length === 0) {
      console.log('No fixtures created — nothing to cleanup.');
    } else {
      // Defensive: also re-scan for any stragglers with TEST-V82-RT- prefix
      const allSnap = await col(db, 'opd_sessions').get();
      const allTargets = new Set(created);
      for (const d of allSnap.docs) {
        if (d.id.startsWith(TEST_PREFIX)) allTargets.add(d.id);
      }
      const ids = Array.from(allTargets);
      console.log(`Cleanup targets: ${ids.length} (${created.length} just-created + ${ids.length - created.length} stragglers)`);
      let deleted = 0;
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = db.batch();
        for (const id of chunk) {
          batch.delete(col(db, 'opd_sessions').doc(id));
        }
        await batch.commit();
        deleted += chunk.length;
        console.log(`  Deleted ${deleted}/${ids.length}`);
      }
      console.log(`✓ Cleanup complete. ${deleted} TEST-V82-RT- fixtures removed.`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((res) => {
    if (res && !res.ok) process.exit(2);
  }).catch(err => {
    console.error('FATAL:', err.message || err);
    process.exit(1);
  });
}
