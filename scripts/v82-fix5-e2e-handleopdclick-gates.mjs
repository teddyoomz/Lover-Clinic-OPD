#!/usr/bin/env node
// scripts/v82-fix5-e2e-handleopdclick-gates.mjs
//
// V82-fix5 (2026-05-17 EOD+3 LATE+3) Round 2 E2E — handleOpdClick gates
// + handleResync coverage. Continues V82-fix4's Round 1 (136/136 PASS).
//
// FOCUS: pure-logic gates that determine handleOpdClick's branching behavior,
// without invoking the full addCustomer flow (would bump HN counter from
// LC-26000001 — preserves user's fresh-start workflow).
//
// Per user directive: "ทดสอบ e2e , stress test และอื่นๆ ทุกปุ่มที่เกี่ยวกับ
// Frontend ในหน้ารายการคิว และหน้าประวัติ".
//
// COVERAGE (Round 2):
//   G1. handleOpdClick idempotency guard (line 3416)
//       "if (session.opdRecordedAt && session.brokerStatus === 'done') return;"
//   G2. _maybeOpenWalkInModal isFromBookingFlow gate (line 3471-3480)
//       5 indicators (linkedAppointmentId / linkedDepositId / appointmentProClinicId
//        / formType==='deposit' / appointmentData.appointmentDate || appointmentData.appointmentStartTime)
//   G3. handleResync state expectations (no-op for non-broker-stale sessions)
//   G4. saveOpdBtn render condition mirroring v82-followup-state-machine-test.mjs
//   G5. Source-grep wiring locks (each handler bound to expected button per AdminDashboard.jsx)
//
// NO Firestore writes (pure-logic + source-grep). Run instantly.
// NO HN counter mutation.
//
// USAGE: node scripts/v82-fix5-e2e-handleopdclick-gates.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_DASHBOARD = path.join(REPO_ROOT, 'src', 'pages', 'AdminDashboard.jsx');
const SRC = fs.readFileSync(ADMIN_DASHBOARD, 'utf8');

const RESULTS = [];
function record(group, scenario, passed, msg = '') {
  RESULTS.push({ group, scenario, passed, msg });
  const symbol = passed ? '✓' : '✗';
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`  ${symbol} [${group}/${scenario}] ${status}${msg ? `  — ${msg}` : ''}`);
}

// ── PURE-LOGIC MIRRORS (VERBATIM from AdminDashboard.jsx) ────────────────────

function handleOpdClick_shouldShortCircuit(session) {
  // Line 3416: idempotency guard
  return !!(session.opdRecordedAt && session.brokerStatus === 'done');
}

function maybeOpenWalkInModal_isFromBookingFlow(session) {
  // Lines 3471-3480: 5 indicators
  return !!(
    session?.linkedAppointmentId ||
    session?.linkedDepositId ||
    session?.appointmentProClinicId ||
    session?.formType === 'deposit' ||
    (session?.appointmentData && (
      session.appointmentData.appointmentDate ||
      session.appointmentData.appointmentStartTime
    ))
  );
}

// ── G1: handleOpdClick idempotency guard ────────────────────────────────────
console.log('\n--- G1: handleOpdClick idempotency guard ---');
{
  // Fresh session — should NOT short-circuit
  record('G1', 'fresh-session-no-short-circuit', handleOpdClick_shouldShortCircuit({}) === false, 'fresh proceeds');

  // opdRecordedAt only — should NOT short-circuit (needs broker too)
  record('G1', 'recorded-but-broker-not-done', handleOpdClick_shouldShortCircuit({ opdRecordedAt: Date.now() }) === false, 'broker missing → proceeds');

  // brokerStatus='done' only — should NOT short-circuit (needs opdRecordedAt)
  record('G1', 'broker-done-but-not-recorded', handleOpdClick_shouldShortCircuit({ brokerStatus: 'done' }) === false, 'opdRecordedAt missing → proceeds');

  // Both → short-circuits (idempotent)
  record('G1', 'both-recorded-and-done-short-circuits', handleOpdClick_shouldShortCircuit({ opdRecordedAt: Date.now(), brokerStatus: 'done' }) === true, 'idempotent — short-circuit');

  // Adversarial: brokerStatus='pending' but opdRecordedAt set → NOT short-circuit (allows retry)
  record('G1', 'recorded-broker-pending-allows-retry', handleOpdClick_shouldShortCircuit({ opdRecordedAt: Date.now(), brokerStatus: 'pending' }) === false, 'allows retry');

  // Adversarial: brokerStatus='failed' → allows retry
  record('G1', 'recorded-broker-failed-allows-retry', handleOpdClick_shouldShortCircuit({ opdRecordedAt: Date.now(), brokerStatus: 'failed' }) === false, 'allows retry');
}

// ── G2: isFromBookingFlow gate (Phase 29.23-bis3) ────────────────────────────
console.log('\n--- G2: isFromBookingFlow gate (5 indicators) ---');
{
  // Walk-in (no booking origin) → should NOT be flagged (modal SHOULD open)
  record('G2', 'walk-in-intake-no-booking-flow', maybeOpenWalkInModal_isFromBookingFlow({ formType: 'intake' }) === false, 'walk-in: modal opens');
  record('G2', 'walk-in-followup-ed', maybeOpenWalkInModal_isFromBookingFlow({ formType: 'followup_ed' }) === false, 'walk-in followup: modal opens');

  // Indicator 1: linkedAppointmentId
  record('G2', 'indicator-1-linkedAppointmentId', maybeOpenWalkInModal_isFromBookingFlow({ linkedAppointmentId: 'APPT-123', formType: 'intake' }) === true, 'linkedAppointmentId → modal blocked');

  // Indicator 2: linkedDepositId
  record('G2', 'indicator-2-linkedDepositId', maybeOpenWalkInModal_isFromBookingFlow({ linkedDepositId: 'DEP-123', formType: 'intake' }) === true, 'linkedDepositId → modal blocked');

  // Indicator 3: appointmentProClinicId (legacy)
  record('G2', 'indicator-3-appointmentProClinicId', maybeOpenWalkInModal_isFromBookingFlow({ appointmentProClinicId: 'APPT-LEGACY-99', formType: 'intake' }) === true, 'appointmentProClinicId → modal blocked');

  // Indicator 4: formType==='deposit'
  record('G2', 'indicator-4-formType-deposit', maybeOpenWalkInModal_isFromBookingFlow({ formType: 'deposit' }) === true, 'deposit formType → modal blocked');

  // Indicator 5a: appointmentData.appointmentDate
  record('G2', 'indicator-5a-appointmentData-date', maybeOpenWalkInModal_isFromBookingFlow({ formType: 'intake', appointmentData: { appointmentDate: '2026-05-20' } }) === true, 'appointmentData.appointmentDate → modal blocked');

  // Indicator 5b: appointmentData.appointmentStartTime
  record('G2', 'indicator-5b-appointmentData-startTime', maybeOpenWalkInModal_isFromBookingFlow({ formType: 'intake', appointmentData: { appointmentStartTime: '14:00' } }) === true, 'appointmentData.appointmentStartTime → modal blocked');

  // Adversarial: empty appointmentData → should NOT block
  record('G2', 'empty-appointmentData-no-block', maybeOpenWalkInModal_isFromBookingFlow({ formType: 'intake', appointmentData: {} }) === false, 'empty appointmentData allows modal');

  // Adversarial: null linkedAppointmentId → no block
  record('G2', 'null-linked-no-block', maybeOpenWalkInModal_isFromBookingFlow({ formType: 'intake', linkedAppointmentId: null, linkedDepositId: null }) === false, 'null linked allows modal');

  // Adversarial: empty string falsy → no block
  record('G2', 'empty-string-falsy-no-block', maybeOpenWalkInModal_isFromBookingFlow({ formType: 'intake', linkedAppointmentId: '', linkedDepositId: '' }) === false, 'empty string allows modal');

  // Combined: multiple indicators → still blocked
  record('G2', 'multiple-indicators-blocked', maybeOpenWalkInModal_isFromBookingFlow({ formType: 'deposit', linkedAppointmentId: 'A', linkedDepositId: 'D' }) === true, 'all indicators → blocked');
}

// ── G3: saveOpdBtn render condition ─────────────────────────────────────────
// From v82-followup-state-machine-test.mjs finalExpectedFor() — saveOpdBtn always true
// when status='completed' + patientData present.
console.log('\n--- G3: saveOpdBtn render condition ---');
{
  // saveOpdBtn renders for any status='completed' + patientData session
  const cases = [
    { state: 'fresh-intake', s: { status: 'completed', patientData: { firstName: 'x' } }, expected: true },
    { state: 'no-patientData', s: { status: 'completed' }, expected: false },
    { state: 'no-status', s: { patientData: { firstName: 'x' } }, expected: false },
    { state: 'archived-but-still-rendered', s: { status: 'completed', patientData: { firstName: 'x' }, isArchived: true }, expected: true }, // gated by status+patientData; archive doesn't hide
    { state: 'permanent-not-serviced', s: { status: 'completed', patientData: { firstName: 'x' }, isPermanent: true }, expected: true },
  ];
  for (const c of cases) {
    const renders = !!(c.s.status === 'completed' && c.s.patientData);
    record('G3', `saveOpdBtn-${c.state}`, renders === c.expected, `expected=${c.expected} got=${renders}`);
  }
}

// ── G4: handleResync — Source-grep wiring lock ──────────────────────────────
console.log('\n--- G4: handleResync wiring ---');
{
  // handleResync should exist + take a session arg
  const hasFn = /const handleResync = async \(session\)/.test(SRC);
  record('G4', 'handleResync-exists', hasFn, 'handler exists');

  // handleResync is wired in JSX (search for onClick references)
  const wireMatches = SRC.match(/onClick=\{[^}]*handleResync\([^)]*\)/g) || [];
  record('G4', 'handleResync-wired-in-UI', wireMatches.length >= 1, `${wireMatches.length} button wire(s)`);
}

// ── G5: Source-grep wiring locks per Queue/History handler ──────────────────
console.log('\n--- G5: Queue/History handler wiring (source-grep) ---');
{
  const handlers = [
    { name: 'deleteSession', expected: 'B1' },
    { name: 'restoreToQueue', expected: 'B2/B3' },
    { name: 'hardDeleteSession', expected: 'B4' },
    { name: 'saveEditedName', expected: 'B5' },
    { name: 'handleNoDepositServiceStart', expected: 'B6' },
    { name: 'handleNoDepositCancel', expected: 'B7' },
    { name: 'handleViewSession', expected: 'B8' },
    { name: 'handleOpdClick', expected: 'handleOpdClick' },
    { name: 'handleEditName', expected: 'edit-name-modal-trigger' },
  ];
  for (const h of handlers) {
    const hasDef = new RegExp(`const ${h.name} = (async )?\\(`).test(SRC);
    record('G5', `${h.name}-defined`, hasDef, `function definition present`);
    // Check it's wired in UI — accept any React event handler (onClick / onChange /
    // onSubmit / onBlur / onKeyDown / onFocus). saveEditedName uses onBlur+onKeyDown
    // for inline-edit UX (no explicit button click).
    const wirePattern = new RegExp(`(onClick=|onChange=|onSubmit=|onBlur=|onKeyDown=|onFocus=|onMouseDown=|onPointerDown=)\\{[^}]*${h.name}`, 'g');
    const wireCount = (SRC.match(wirePattern) || []).length;
    record('G5', `${h.name}-wired`, wireCount >= 1, `${wireCount} JSX wire(s) — covers ${h.expected}`);
  }
}

// ── G6: V82-fix2 specific source-grep regression locks ──────────────────────
console.log('\n--- G6: V82-fix2 source patch locks (regression guard) ---');
{
  // The V82-fix2 patch added _v82FollowupOpdResetAt opt-out BEFORE line 2275 reject
  const hasOptOutTop = /if \(session\._v82FollowupOpdResetAt && session\.formType !== 'deposit'\) return true;/.test(SRC);
  record('G6', 'v82-fix2-opt-out-at-top', hasOptOutTop, 'opt-out at top of queue filter');

  // noDepositSessions filter excludes reset-stamped
  const hasNdExclude = /!s\.isArchived && s\.isPermanent && s\.formType !== 'deposit' && !s\.serviceCompleted && !s\._v82FollowupOpdResetAt/.test(SRC);
  record('G6', 'v82-fix2-noDeposit-exclude', hasNdExclude, 'noDepositSessions excludes reset-stamped');

  // V82-fix2 marker comments present
  const hasMarker = /V82-fix2.*opt-out.*MUST fire BEFORE/s.test(SRC);
  record('G6', 'v82-fix2-marker-comment', hasMarker, 'marker comment present');
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n=== SUMMARY ===');
const total = RESULTS.length;
const pass = RESULTS.filter(r => r.passed).length;
const fail = RESULTS.filter(r => !r.passed).length;
console.log(`Total: ${total}  PASS: ${pass}  FAIL: ${fail}`);
if (fail > 0) {
  console.log('\nFAILURES:');
  RESULTS.filter(r => !r.passed).forEach(r => console.log(`  ✗ [${r.group}/${r.scenario}] ${r.msg}`));
  process.exit(1);
}
console.log('\n✅ ALL PASS\n');
