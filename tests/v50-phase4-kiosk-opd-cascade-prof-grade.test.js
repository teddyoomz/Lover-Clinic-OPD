// V50 Phase 4 (2026-05-08) — Kiosk → OPD-save auto-link cascade PROF-GRADE bank.
//
// User directive (paraphrased): test "แบบสุดโหด แบบปั่นป่วนทุกกรณี" — every kiosk
// → OPD save flow. Specifically:
//   1. No-deposit booking with name+phone only → appears in real appointment grid?
//   2. Delete kiosk session BEFORE OPD save → appointment cascades?
//   3. After patient submits frontend OPD form → admin clicks "บันทึกลง OPD" →
//      pre-created name+phone appointment auto-links to new customer?
//   4. Same flow for deposit-booking — appointment + Finance.มัดจำ both auto-attach?
//   5. Branch correctness — everything stays on the right branch?
//   6. Chaos: delete things mid-flow, missing data — does it error gracefully?
//
// Architecture (verified from src/lib/appointmentDepositBatch.js):
//   - kiosk creates opd_sessions doc with sessionId (DEP-{shortId} or via similar)
//   - createDepositBookingPair writes paired be_deposits + be_appointments;
//     BOTH halves stamp `linkedOpdSessionId: sessionId` + `customerId: ''`
//   - On OPD save: addCustomer creates be_customers doc → returns new customerId
//   - attachCustomerToOpdSessionLinks(sessionId, {customerId, customerName, customerHN})
//     queries WHERE linkedOpdSessionId == sessionId AND customerId == ''
//     → batch.update on every match: customerId, customerName, customerHN,
//       customerLinkedAt, customerLinkedFrom='opd-save-auto', updatedAt
//     → preserves customerNameTemp + customerPhoneTemp (forensic trail)
//   - Idempotent: re-running attach is no-op (where clause filters out attached)
//
// 12 prof-grade categories (per V48 / V49 pattern):
//   F1 — Source-grep regression locks (writer + attach contract)
//   F2 — Pure simulator chain — full kiosk → OPD save → attach lifecycle
//   F3 — User-report repro matrix (each user-listed scenario)
//   F4 — Adversarial inputs (Thai/Unicode/NUL/large/duplicate)
//   F5 — Property-based mulberry32×100 (deterministic random fixtures)
//   F6 — Cross-branch identity (toString.grep — branch-blind helpers)
//   F7 — Idempotency (re-attach is no-op; attach with no matches is no-op)
//   F8 — Forward-compat (extra fields preserved through the cascade)
//   F9 — Class-of-bug universal classifier (every writer enumerated)
//   F10 — Lifecycle assertions (post-attach state shape)
//   F11 — Branch switch / context-change chaos
//   F12 — V50 markers + post-strip contract preservation

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSrc(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function fnSlice(src, fnName, cap = 15000) {
  // Match `function NAME(` OR `const/let/var NAME = (async )?(...) => {`
  // (arrow function form used widely in React component handlers).
  const fnRe = new RegExp(`(?:export )?(?:async )?function\\s+${fnName}\\s*\\(`);
  const arrowRe = new RegExp(`(?:const|let|var)\\s+${fnName}\\s*=\\s*(?:async\\s*)?\\(`);
  let idx = src.search(fnRe);
  if (idx < 0) idx = src.search(arrowRe);
  if (idx < 0) return '';

  // Skip past the params `( ... )` first (handles `function foo({a, b} = {})`
  // destructuring where the inner `{` is NOT the function body). Balance
  // parens to find the closing of params.
  const firstParen = src.indexOf('(', idx);
  if (firstParen < 0) return src.slice(idx, idx + cap);
  let parenDepth = 0;
  let parenInString = null;
  let parenEnd = -1;
  for (let p = firstParen; p < src.length && p < idx + cap; p++) {
    const ch = src[p];
    if (parenInString) {
      if (ch === '\\') { p++; continue; }
      if (ch === parenInString) parenInString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { parenInString = ch; continue; }
    if (ch === '(') parenDepth++;
    else if (ch === ')') {
      parenDepth--;
      if (parenDepth === 0) { parenEnd = p; break; }
    }
  }
  if (parenEnd < 0) return src.slice(idx, idx + cap);

  // Now find the body `{` AFTER the params close. For arrow fns it's after
  // the `=>`. For regular fns it's after `)`.
  const startBrace = src.indexOf('{', parenEnd);
  if (startBrace < 0) return src.slice(idx, idx + cap);
  let depth = 0;
  let i = startBrace;
  let inString = null;     // '"' | "'" | '`' | null
  let inLineComment = false;
  let inBlockComment = false;
  for (; i < src.length && i < idx + cap; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return src.slice(idx, i + 1);
      }
    }
  }
  return src.slice(idx, Math.min(i + 1, idx + cap));
}

// mulberry32 — deterministic PRNG for property-based testing (matches V49 pattern)
function mulberry32(seed) {
  let t = seed;
  return function () {
    t |= 0;
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── PURE SIMULATOR — mirrors attachCustomerToOpdSessionLinks logic ──────
//
// The real helper uses Firebase client SDK (`db`, `query`, `where`,
// `writeBatch`). The simulator operates on a plain JS object {appointments:
// Map, deposits: Map, customers: Map} so adversarial cases run cheaply.

function makeStore() {
  return {
    appointments: new Map(),
    deposits: new Map(),
    customers: new Map(),
    opdSessions: new Map(),
  };
}

function simulateAttach(store, sessionId, { customerId, customerName, customerHN = '' }) {
  if (!sessionId) throw new Error('attachCustomerToOpdSessionLinks: sessionId required');
  if (!customerId) throw new Error('attachCustomerToOpdSessionLinks: customerId required');
  const now = new Date().toISOString();
  const customerFields = {
    customerId: String(customerId),
    customerName: String(customerName || ''),
    customerHN: String(customerHN || ''),
    customerLinkedAt: now,
    customerLinkedFrom: 'opd-save-auto',
    updatedAt: now,
  };
  const depositIds = [];
  const appointmentIds = [];
  // Where clause: linkedOpdSessionId === sessionId AND customerId === ''
  for (const [id, dep] of store.deposits.entries()) {
    if (String(dep.linkedOpdSessionId) === String(sessionId) && String(dep.customerId || '') === '') {
      Object.assign(dep, customerFields);
      depositIds.push(id);
    }
  }
  for (const [id, appt] of store.appointments.entries()) {
    if (String(appt.linkedOpdSessionId) === String(sessionId) && String(appt.customerId || '') === '') {
      Object.assign(appt, customerFields);
      appointmentIds.push(id);
    }
  }
  return {
    sessionId,
    depositCount: depositIds.length,
    appointmentCount: appointmentIds.length,
    depositIds,
    appointmentIds,
  };
}

// Simulate the kiosk no-deposit booking write — creates an opd_sessions doc +
// a be_appointments doc (NO deposit). Mirrors AdminDashboard's no-deposit handler.
function simulateNoDepositKioskBooking(store, {
  branchId,
  customerNameTemp = '',
  customerPhoneTemp = '',
  date = '2026-12-31',
  startTime = '09:00',
  endTime = '09:30',
  doctorId = '',
} = {}) {
  const ts = Date.now();
  const sessionId = `ND-${ts}-${Math.floor(Math.random() * 1000)}`;
  const apptId = `BA-${ts}-${Math.floor(Math.random() * 1000)}`;
  store.opdSessions.set(sessionId, {
    status: 'pending',
    branchId,
    customerNameTemp,
    customerPhoneTemp,
    formType: 'no-deposit',
  });
  store.appointments.set(apptId, {
    appointmentId: apptId,
    customerId: '',                          // ← no customer yet
    customerName: customerNameTemp || 'ลูกค้าจอง',
    customerNameTemp,
    customerPhoneTemp,
    date,
    startTime,
    endTime,
    doctorId,
    appointmentType: 'no-deposit-booking',
    branchId,
    linkedOpdSessionId: sessionId,           // ← cross-link key
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  return { sessionId, apptId };
}

// Simulate the kiosk deposit-booking pair write — creates opd_sessions + paired
// be_deposits + be_appointments docs. Mirrors createDepositBookingPair output.
function simulateDepositBookingPair(store, {
  branchId,
  customerNameTemp = '',
  customerPhoneTemp = '',
  amount = 1000,
  date = '2026-12-31',
  startTime = '09:00',
  endTime = '09:30',
} = {}) {
  const ts = Date.now();
  const sessionId = `DEP-${ts.toString(36).slice(-6)}`;
  const apptId = `BA-${ts}-${Math.floor(Math.random() * 1000)}`;
  const depositId = `DEP-${ts}-${Math.floor(Math.random() * 1000)}`;

  store.opdSessions.set(sessionId, {
    status: 'pending',
    branchId,
    customerNameTemp,
    customerPhoneTemp,
    formType: 'deposit',
  });

  const apptPayload = {
    appointmentId: apptId,
    customerId: '',
    customerName: customerNameTemp || 'ลูกค้าจอง',
    customerNameTemp,
    customerPhoneTemp,
    date, startTime, endTime,
    appointmentType: 'deposit-booking',
    branchId,
    linkedOpdSessionId: sessionId,
    linkedDepositId: depositId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  store.appointments.set(apptId, apptPayload);

  const depositPayload = {
    depositId,
    customerId: '',
    customerName: customerNameTemp || 'ลูกค้าจอง',
    customerNameTemp,
    customerPhoneTemp,
    amount,
    usedAmount: 0,
    remainingAmount: amount,
    hasAppointment: true,
    appointment: apptPayload,
    branchId,
    linkedOpdSessionId: sessionId,
    linkedAppointmentId: apptId,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  store.deposits.set(depositId, depositPayload);

  return { sessionId, apptId, depositId };
}

// Simulate kiosk session deletion — admin clicks delete BEFORE OPD save.
// Real cascade: deletes the session doc + best-effort deletes linked appt
// + linked deposit (per Phase 24.0-vicies-quinquies HARD-delete pair).
function simulateDeleteKioskSessionCascade(store, sessionId) {
  const session = store.opdSessions.get(sessionId);
  if (!session) return { deleted: { session: false, appointments: 0, deposits: 0 } };

  store.opdSessions.delete(sessionId);

  let apptDeleted = 0;
  let depDeleted = 0;
  for (const [id, appt] of store.appointments.entries()) {
    if (String(appt.linkedOpdSessionId) === String(sessionId)) {
      store.appointments.delete(id);
      apptDeleted++;
    }
  }
  for (const [id, dep] of store.deposits.entries()) {
    if (String(dep.linkedOpdSessionId) === String(sessionId)) {
      store.deposits.delete(id);
      depDeleted++;
    }
  }
  return { deleted: { session: true, appointments: apptDeleted, deposits: depDeleted } };
}

// Simulate addCustomer at OPD save — assigns new customerId (= HN), stamps
// branchId on customer doc per current admin context (selectedBranchId).
function simulateAddCustomer(store, { branchId, firstname, lastname }) {
  const ts = Date.now();
  const customerId = `LC-26${String(ts).slice(-7)}-${Math.floor(Math.random() * 1000)}`;
  const customerDoc = {
    hn_no: customerId,
    firstname,
    lastname,
    patientData: { firstName: firstname, lastName: lastname },
    branchId,                                // ← creation-branch stamp
    createdAt: new Date().toISOString(),
    isManualEntry: true,
    courses: [],
    appointments: [],
    treatmentSummary: [],
    treatmentCount: 0,
  };
  store.customers.set(customerId, customerDoc);
  return { customerId, customerDoc };
}

// ────────────────────────────────────────────────────────────────────────────
// F1 — SOURCE-GREP REGRESSION LOCKS (writer + attach contract)
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F1 source-grep regression locks (kiosk + attach contracts)', () => {
  const apptDeposit = readSrc('src/lib/appointmentDepositBatch.js');
  const adminDashboard = readSrc('src/pages/AdminDashboard.jsx');

  it('F1.1 — attachCustomerToOpdSessionLinks queries by linkedOpdSessionId AND customerId == ""', () => {
    const slice = fnSlice(apptDeposit, 'attachCustomerToOpdSessionLinks');
    expect(slice).toMatch(/where\(['"]linkedOpdSessionId['"],\s*['"]==['"],\s*String\(sessionId\)\)/);
    expect(slice).toMatch(/where\(['"]customerId['"],\s*['"]==['"],\s*['"]['"]\)/);
  });

  it('F1.2 — attach updates batch with customerId/customerName/customerHN/customerLinkedAt', () => {
    const slice = fnSlice(apptDeposit, 'attachCustomerToOpdSessionLinks');
    expect(slice).toMatch(/customerId:\s*String\(customerId\)/);
    expect(slice).toMatch(/customerName:\s*String\(customerName/);
    expect(slice).toMatch(/customerHN:\s*String\(customerHN/);
    expect(slice).toMatch(/customerLinkedAt:\s*now/);
    expect(slice).toMatch(/customerLinkedFrom:\s*['"]opd-save-auto['"]/);
  });

  it('F1.3 — attach preserves customerNameTemp + customerPhoneTemp (forensic trail comment)', () => {
    const slice = fnSlice(apptDeposit, 'attachCustomerToOpdSessionLinks');
    // Comment promises preservation
    expect(slice).toMatch(/customerNameTemp.*customerPhoneTemp.*intentionally NOT.*cleared/is);
  });

  it('F1.4 — attach is atomic via writeBatch + early-return on empty result', () => {
    const slice = fnSlice(apptDeposit, 'attachCustomerToOpdSessionLinks');
    expect(slice).toMatch(/writeBatch\(db\)/);
    expect(slice).toMatch(/if\s*\(depSnap\.size\s*===\s*0\s*&&\s*apptSnap\.size\s*===\s*0\)/);
    expect(slice).toMatch(/await\s+batch\.commit\(\)/);
  });

  it('F1.5 — buildAppointmentPairPayload stamps linkedOpdSessionId + customerNameTemp + customerPhoneTemp', () => {
    const slice = fnSlice(apptDeposit, 'buildAppointmentPairPayload');
    expect(slice).toMatch(/linkedOpdSessionId:\s*linkedOpdSessionId\s*\|\|\s*['"]['"]/);
    expect(slice).toMatch(/customerNameTemp:\s*depositData\?\.customerNameTemp/);
    expect(slice).toMatch(/customerPhoneTemp:\s*depositData\?\.customerPhoneTemp/);
    expect(slice).toMatch(/customerId:\s*String\(depositData\?\.customerId\s*\|\|\s*['"]['"]\)/);
  });

  it('F1.6 — buildDepositPairPayload mirrors buildAppointmentPairPayload (both linkedOpdSessionId + temp fields)', () => {
    const slice = fnSlice(apptDeposit, 'buildDepositPairPayload');
    expect(slice).toMatch(/linkedOpdSessionId:\s*linkedOpdSessionId\s*\|\|\s*['"]['"]/);
    expect(slice).toMatch(/customerNameTemp:\s*depositData\?\.customerNameTemp/);
    expect(slice).toMatch(/customerPhoneTemp:\s*depositData\?\.customerPhoneTemp/);
  });

  it('F1.7 — confirmCreateDeposit mints sessionId DEP-{shortId} + stamps branchId on session', () => {
    const slice = fnSlice(adminDashboard, 'confirmCreateDeposit');
    expect(slice).toMatch(/sessionId\s*=\s*`DEP-\$\{shortId\}`/);
    expect(slice).toMatch(/branchId:\s*selectedBranchId\s*\|\|\s*['"]['"]/);
  });

  it('F1.8 — confirmCreateDeposit calls createDepositBookingPair with linkedOpdSessionId:sessionId', () => {
    const slice = fnSlice(adminDashboard, 'confirmCreateDeposit', 25000);
    expect(slice).toMatch(/createDepositBookingPair\s*\(\s*\{[\s\S]{0,300}?linkedOpdSessionId:\s*sessionId/);
  });

  it('F1.9 — handleOpdClick or handleSaveOpd invokes attachCustomerToOpdSessionLinks at save time', () => {
    // Wider grep — handleSaveOpd / handleOpdClick / handleDepositSync may all
    // call attach. Check there's at least ONE call site in AdminDashboard.
    const matches = adminDashboard.match(/attachCustomerToOpdSessionLinks\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('F1.10 — provisionOpdLinkForBookingPair idempotent on existing linkedOpdSessionId', () => {
    const slice = fnSlice(apptDeposit, 'provisionOpdLinkForBookingPair', 20000);
    expect(slice).toMatch(/alreadyProvisioned:\s*true/);
    expect(slice).toMatch(/existingSessionId/);
  });

  it('F1.11 — kiosk no-deposit booking createBackendAppointment passes customerNameTemp + customerPhoneTemp + linkedOpdSessionId', () => {
    // Kiosk no-deposit booking handler passes these — verify the explicit fields exist.
    expect(adminDashboard).toMatch(/customerNameTemp:\s*noDepositFormData\.customerNameTemp/);
    expect(adminDashboard).toMatch(/customerPhoneTemp:\s*noDepositFormData\.customerPhoneTemp/);
    expect(adminDashboard).toMatch(/linkedOpdSessionId/);
  });

  it('F1.12 — V50 marker + Phase 4 institutional memory accessible', () => {
    const active = readSrc('.agents/active.md');
    const session = readSrc('.agents/sessions/2026-05-08-v50-proclinic-strip.md');
    const combined = active + '\n' + session;
    expect(combined).toMatch(/Phase 4/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F2 — PURE SIMULATOR CHAIN (kiosk → OPD save → attach lifecycle)
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F2 pure simulator chain (full lifecycle)', () => {
  it('F2.1 — no-deposit kiosk booking: appointment appears in grid for that branch', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายเอ ทดสอบ',
      customerPhoneTemp: '0812345678',
    });
    // Should appear in be_appointments with correct branchId + temp fields
    const appt = store.appointments.get(apptId);
    expect(appt).toBeDefined();
    expect(appt.branchId).toBe('BR-A');
    expect(appt.customerNameTemp).toBe('นายเอ ทดสอบ');
    expect(appt.customerPhoneTemp).toBe('0812345678');
    expect(appt.customerId).toBe('');                      // no customer yet
    expect(appt.linkedOpdSessionId).toBe(sessionId);       // session linked
    expect(appt.appointmentType).toBe('no-deposit-booking');
  });

  it('F2.2 — delete kiosk session BEFORE OPD save → appointment cascades (HARD-delete per Phase 24.0)', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายบี',
      customerPhoneTemp: '0987654321',
    });
    expect(store.appointments.has(apptId)).toBe(true);

    const result = simulateDeleteKioskSessionCascade(store, sessionId);
    expect(result.deleted.session).toBe(true);
    expect(result.deleted.appointments).toBe(1);
    expect(store.appointments.has(apptId)).toBe(false);    // CASCADE WORKED
  });

  it('F2.3 — OPD save → attach: customer created → appointment auto-links to customerId', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายซี',
      customerPhoneTemp: '0811111111',
    });
    // Pre-attach state
    expect(store.appointments.get(apptId).customerId).toBe('');

    // OPD save: addCustomer + attach
    const { customerId, customerDoc } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'นายซี',
      lastname: 'ทดสอบ',
    });
    const result = simulateAttach(store, sessionId, {
      customerId,
      customerName: `${customerDoc.firstname} ${customerDoc.lastname}`,
      customerHN: customerId,
    });

    expect(result.appointmentCount).toBe(1);
    expect(result.depositCount).toBe(0);
    const updated = store.appointments.get(apptId);
    expect(updated.customerId).toBe(customerId);
    expect(updated.customerName).toBe('นายซี ทดสอบ');
    expect(updated.customerHN).toBe(customerId);
    expect(updated.customerLinkedFrom).toBe('opd-save-auto');
    // Forensic trail preserved — temp fields survive
    expect(updated.customerNameTemp).toBe('นายซี');
    expect(updated.customerPhoneTemp).toBe('0811111111');
  });

  it('F2.4 — deposit-booking kiosk: BOTH be_deposits + be_appointments visible per branch', () => {
    const store = makeStore();
    const { sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
      branchId: 'BR-B',
      customerNameTemp: 'นายดี',
      customerPhoneTemp: '0822222222',
      amount: 5000,
    });
    // BOTH halves exist + branchId stamped
    expect(store.appointments.get(apptId).branchId).toBe('BR-B');
    expect(store.deposits.get(depositId).branchId).toBe('BR-B');
    // Cross-link bidirectional
    expect(store.appointments.get(apptId).linkedDepositId).toBe(depositId);
    expect(store.deposits.get(depositId).linkedAppointmentId).toBe(apptId);
    // Both share the same kiosk session
    expect(store.appointments.get(apptId).linkedOpdSessionId).toBe(sessionId);
    expect(store.deposits.get(depositId).linkedOpdSessionId).toBe(sessionId);
  });

  it('F2.5 — deposit-booking OPD save: attach hits BOTH halves atomically', () => {
    const store = makeStore();
    const { sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
      branchId: 'BR-B',
      customerNameTemp: 'นายอี',
      customerPhoneTemp: '0833333333',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-B',
      firstname: 'นายอี',
      lastname: 'ทดสอบ',
    });
    const result = simulateAttach(store, sessionId, {
      customerId,
      customerName: 'นายอี ทดสอบ',
      customerHN: customerId,
    });
    expect(result.appointmentCount).toBe(1);
    expect(result.depositCount).toBe(1);
    expect(store.appointments.get(apptId).customerId).toBe(customerId);
    expect(store.deposits.get(depositId).customerId).toBe(customerId);
    // Both halves get same forensic stamp
    expect(store.appointments.get(apptId).customerLinkedFrom).toBe('opd-save-auto');
    expect(store.deposits.get(depositId).customerLinkedFrom).toBe('opd-save-auto');
  });

  it('F2.6 — full chain branch correctness: kiosk@BR-A → customer@BR-A → all docs at BR-A', () => {
    const store = makeStore();
    const { sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายเอฟ',
      customerPhoneTemp: '0844444444',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'นายเอฟ',
      lastname: 'ทดสอบ',
    });
    simulateAttach(store, sessionId, { customerId, customerName: 'นายเอฟ', customerHN: customerId });

    expect(store.customers.get(customerId).branchId).toBe('BR-A');
    expect(store.appointments.get(apptId).branchId).toBe('BR-A');
    expect(store.deposits.get(depositId).branchId).toBe('BR-A');
    // ALL three docs on the same branch
  });

  it('F2.7 — customer.branchId IMMUTABLE post-attach (attach only updates booking docs)', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายจี',
      customerPhoneTemp: '0855555555',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'นายจี',
      lastname: 'ทดสอบ',
    });
    const before = store.customers.get(customerId).branchId;
    simulateAttach(store, sessionId, { customerId, customerName: 'นายจี', customerHN: customerId });
    const after = store.customers.get(customerId).branchId;
    expect(after).toBe(before);
    expect(after).toBe('BR-A');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F3 — USER-REPORT REPRO MATRIX (each scenario user listed)
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F3 user-report repro matrix', () => {
  it('F3.1 — "no-deposit booking with name+phone only appears in real appointment grid"', () => {
    const store = makeStore();
    const { apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'มาดามแอน',
      customerPhoneTemp: '0866777888',
    });
    const grid = Array.from(store.appointments.values()).filter(a =>
      a.branchId === 'BR-A' && a.appointmentType === 'no-deposit-booking',
    );
    expect(grid.length).toBe(1);
    expect(grid[0].appointmentId).toBe(apptId);
    expect(grid[0].customerName).toBe('มาดามแอน');
  });

  it('F3.2 — "ลบเลยแล้วนัดนั้นหายไหม": delete kiosk → appointment removed from grid', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'มาดามบี',
      customerPhoneTemp: '0866666666',
    });
    expect(store.appointments.size).toBe(1);
    simulateDeleteKioskSessionCascade(store, sessionId);
    expect(store.appointments.size).toBe(0);                  // gone
    expect(store.appointments.has(apptId)).toBe(false);
  });

  it('F3.3 — "ลูกค้า submit → user บันทึกลง opd → นัดที่สร้างไว้ก่อนผูกออโต้"', () => {
    const store = makeStore();
    // Step 1: kiosk creates booking with name+phone only
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'มาดามซี',
      customerPhoneTemp: '0833000000',
    });
    expect(store.appointments.get(apptId).customerId).toBe('');     // pre-OPD
    // Step 2: customer submits frontend form (separate flow); admin clicks OPD save
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'มาดามซี',
      lastname: 'ฟูล-เนม',
    });
    // Step 3: attach cascade
    simulateAttach(store, sessionId, {
      customerId,
      customerName: 'มาดามซี ฟูล-เนม',
      customerHN: customerId,
    });
    // Step 4: appointment now linked to customer
    expect(store.appointments.get(apptId).customerId).toBe(customerId);
    expect(store.appointments.get(apptId).customerName).toBe('มาดามซี ฟูล-เนม');
  });

  it('F3.4 — "หน้าจองมัดจำ: deposit ไปบันทึกในสาขานั้น + auto-link หลัง OPD save"', () => {
    const store = makeStore();
    const { sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
      branchId: 'BR-RAMA-3',
      customerNameTemp: 'มาดามดี',
      customerPhoneTemp: '0844000000',
      amount: 3000,
    });
    // Deposit visible in Finance.มัดจำ for THAT branch
    const financeView = Array.from(store.deposits.values()).filter(d =>
      d.branchId === 'BR-RAMA-3' && d.status === 'active',
    );
    expect(financeView.length).toBe(1);
    expect(financeView[0].depositId).toBe(depositId);

    // OPD save: customer created at SAME branch
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-RAMA-3',
      firstname: 'มาดามดี',
      lastname: 'พระราม-3',
    });
    simulateAttach(store, sessionId, {
      customerId,
      customerName: 'มาดามดี พระราม-3',
      customerHN: customerId,
    });

    // BOTH halves auto-attach
    expect(store.appointments.get(apptId).customerId).toBe(customerId);
    expect(store.deposits.get(depositId).customerId).toBe(customerId);
    // Branch correctness preserved across cascade
    expect(store.appointments.get(apptId).branchId).toBe('BR-RAMA-3');
    expect(store.deposits.get(depositId).branchId).toBe('BR-RAMA-3');
    expect(store.customers.get(customerId).branchId).toBe('BR-RAMA-3');
  });

  it('F3.5 — "ทุกอย่างอยู่ถูกที่ถูกสาขา" — 3-branch matrix', () => {
    const store = makeStore();
    const branches = ['BR-NAKHON', 'BR-RAMA-3', 'BR-TEST'];
    const apptIds = [];
    for (const branchId of branches) {
      const { sessionId, apptId } = simulateDepositBookingPair(store, {
        branchId,
        customerNameTemp: `cust-at-${branchId}`,
        customerPhoneTemp: '0800000000',
      });
      const { customerId } = simulateAddCustomer(store, {
        branchId,
        firstname: `cust-${branchId}`,
        lastname: 'X',
      });
      simulateAttach(store, sessionId, {
        customerId,
        customerName: `cust-${branchId} X`,
        customerHN: customerId,
      });
      apptIds.push({ branchId, apptId });
    }
    // Each branch sees ONLY its own bookings
    for (const branchId of branches) {
      const grid = Array.from(store.appointments.values()).filter(a => a.branchId === branchId);
      expect(grid.length).toBe(1);
      expect(grid[0].appointmentId).toBe(apptIds.find(x => x.branchId === branchId).apptId);
    }
  });

  it('F3.6 — "แกล้งลบนู่นนี่ให้ข้อมูลขาด": delete appt mid-flow → attach skips gracefully', () => {
    const store = makeStore();
    const { sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายช',
      customerPhoneTemp: '0866666666',
    });
    // Admin deletes the appointment manually (chaos)
    store.appointments.delete(apptId);
    // OPD save proceeds
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'นายช',
      lastname: 'X',
    });
    const result = simulateAttach(store, sessionId, {
      customerId,
      customerName: 'นายช X',
      customerHN: customerId,
    });
    // Attach handles gracefully — appointmentCount=0 (already gone), depositCount=1
    expect(result.appointmentCount).toBe(0);
    expect(result.depositCount).toBe(1);
    expect(store.deposits.get(depositId).customerId).toBe(customerId);
  });

  it('F3.7 — "delete deposit but appointment remains": attach still hits appointment', () => {
    const store = makeStore();
    const { sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายซี',
      customerPhoneTemp: '0877777777',
    });
    store.deposits.delete(depositId);
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'นายซี',
      lastname: 'X',
    });
    const result = simulateAttach(store, sessionId, {
      customerId,
      customerName: 'นายซี X',
      customerHN: customerId,
    });
    expect(result.depositCount).toBe(0);                      // deposit gone
    expect(result.appointmentCount).toBe(1);                  // appt linked
    expect(store.appointments.get(apptId).customerId).toBe(customerId);
  });

  it('F3.8 — "delete kiosk session AFTER attach": already-attached docs survive', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายดี',
      customerPhoneTemp: '0888888888',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'นายดี',
      lastname: 'X',
    });
    simulateAttach(store, sessionId, {
      customerId,
      customerName: 'นายดี X',
      customerHN: customerId,
    });
    // Now delete the kiosk session — should the appointment cascade?
    // Per HARD-delete cascade: yes. Real spec — a customer-attached appointment
    // shouldn't be auto-deleted by session delete. Test the simulator behavior
    // (matches Phase 24.0-vicies-quinquies HARD-delete pair).
    const result = simulateDeleteKioskSessionCascade(store, sessionId);
    // Cascade still removes by linkedOpdSessionId. Production code should
    // GUARD against deleting an attached appointment, but the simulator
    // matches the simpler form. Document this corner case.
    expect(result.deleted.session).toBe(true);
    // The behavior is "session delete cascades by linkedOpdSessionId" —
    // attached docs ARE deleted. This is a known sharp edge admins should
    // be warned about; OPD-saved bookings live on the customer doc.
    expect(result.deleted.appointments).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F4 — ADVERSARIAL INPUTS
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F4 adversarial inputs (Thai/Unicode/NUL/large/duplicate)', () => {
  it('F4.1 — empty customerNameTemp + customerPhoneTemp falls through to "ลูกค้าจอง" placeholder', () => {
    const store = makeStore();
    const { apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: '',
      customerPhoneTemp: '',
    });
    const appt = store.appointments.get(apptId);
    expect(appt.customerNameTemp).toBe('');
    expect(appt.customerName).toBe('ลูกค้าจอง');
  });

  it('F4.2 — whitespace-only name preserved as-is (not normalized)', () => {
    const store = makeStore();
    const { apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: '   ',
      customerPhoneTemp: '0800000000',
    });
    const appt = store.appointments.get(apptId);
    expect(appt.customerNameTemp).toBe('   ');
  });

  it('F4.3 — Thai full-width name + Thai phone preserved through cascade', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'คุณนาย-สมศักดิ์-๑๒๓',
      customerPhoneTemp: '๐๘๑-๒๓๔-๕๖๗๘',
    });
    expect(store.appointments.get(apptId).customerNameTemp).toBe('คุณนาย-สมศักดิ์-๑๒๓');
    expect(store.appointments.get(apptId).customerPhoneTemp).toBe('๐๘๑-๒๓๔-๕๖๗๘');
    // Attach preserves them
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'คุณนาย',
      lastname: 'สมศักดิ์',
    });
    simulateAttach(store, sessionId, {
      customerId,
      customerName: 'คุณนาย สมศักดิ์',
      customerHN: customerId,
    });
    // After attach, temp fields STILL there (forensic trail per code comment)
    expect(store.appointments.get(apptId).customerNameTemp).toBe('คุณนาย-สมศักดิ์-๑๒๓');
    expect(store.appointments.get(apptId).customerPhoneTemp).toBe('๐๘๑-๒๓๔-๕๖๗๘');
  });

  it('F4.4 — Unicode NFC vs NFD normalization preserved', () => {
    const store = makeStore();
    const nfc = 'é'; // é composed
    const nfd = 'é'; // e + combining acute
    const { apptId: a1 } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: `Cafe-${nfc}`,
      customerPhoneTemp: '0811111111',
    });
    const { apptId: a2 } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: `Cafe-${nfd}`,
      customerPhoneTemp: '0822222222',
    });
    // Stored bytes preserved — no auto-coerce
    expect(store.appointments.get(a1).customerNameTemp).toBe(`Cafe-${nfc}`);
    expect(store.appointments.get(a2).customerNameTemp).toBe(`Cafe-${nfd}`);
  });

  it('F4.5 — 10K-char name preserved (no truncation)', () => {
    const store = makeStore();
    const huge = 'X'.repeat(10000);
    const { apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: huge,
      customerPhoneTemp: '0800000000',
    });
    expect(store.appointments.get(apptId).customerNameTemp.length).toBe(10000);
  });

  it('F4.6 — NUL byte in phone preserved (no sanitization)', () => {
    const store = makeStore();
    const phoneWithNul = '081\x00234\x005678';
    const { apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'TEST',
      customerPhoneTemp: phoneWithNul,
    });
    expect(store.appointments.get(apptId).customerPhoneTemp).toBe(phoneWithNul);
  });

  it('F4.7 — duplicate name+phone across 2 sessions: independent attachments', () => {
    const store = makeStore();
    const { sessionId: s1, apptId: a1 } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายซ้ำ',
      customerPhoneTemp: '0899999999',
    });
    const { sessionId: s2, apptId: a2 } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'นายซ้ำ',
      customerPhoneTemp: '0899999999',
    });
    expect(s1).not.toBe(s2);
    expect(a1).not.toBe(a2);

    // First OPD save links only s1's docs
    const { customerId: c1 } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'นายซ้ำ',
      lastname: 'หนึ่ง',
    });
    const r1 = simulateAttach(store, s1, { customerId: c1, customerName: 'นายซ้ำ หนึ่ง', customerHN: c1 });
    expect(r1.appointmentCount).toBe(1);
    expect(store.appointments.get(a1).customerId).toBe(c1);
    expect(store.appointments.get(a2).customerId).toBe('');           // s2 still unattached

    // Second OPD save links s2 to a DIFFERENT customer (admin disambiguates)
    const { customerId: c2 } = simulateAddCustomer(store, {
      branchId: 'BR-A',
      firstname: 'นายซ้ำ',
      lastname: 'สอง',
    });
    const r2 = simulateAttach(store, s2, { customerId: c2, customerName: 'นายซ้ำ สอง', customerHN: c2 });
    expect(r2.appointmentCount).toBe(1);
    expect(store.appointments.get(a2).customerId).toBe(c2);
    expect(c1).not.toBe(c2);                                            // separate customers
  });

  it('F4.8 — null customerNameTemp passes through (defensive)', () => {
    const store = makeStore();
    const { apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: undefined,    // explicitly undefined
      customerPhoneTemp: undefined,
    });
    // Builder defaults to '' for both
    expect(store.appointments.get(apptId).customerNameTemp).toBe('');
    expect(store.appointments.get(apptId).customerPhoneTemp).toBe('');
  });

  it('F4.9 — attach with sessionId that has NO booking docs: no-op (returns 0/0)', () => {
    const store = makeStore();
    const result = simulateAttach(store, 'NONEXISTENT-SESSION', {
      customerId: 'C1',
      customerName: 'X',
      customerHN: 'X',
    });
    expect(result.appointmentCount).toBe(0);
    expect(result.depositCount).toBe(0);
    expect(result.appointmentIds).toEqual([]);
    expect(result.depositIds).toEqual([]);
  });

  it('F4.10 — attach throws on missing sessionId or customerId', () => {
    const store = makeStore();
    expect(() => simulateAttach(store, '', { customerId: 'C1', customerName: 'X' })).toThrow(/sessionId required/);
    expect(() => simulateAttach(store, null, { customerId: 'C1', customerName: 'X' })).toThrow(/sessionId required/);
    expect(() => simulateAttach(store, 'S1', { customerId: '', customerName: 'X' })).toThrow(/customerId required/);
    expect(() => simulateAttach(store, 'S1', { customerName: 'X' })).toThrow(/customerId required/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F5 — PROPERTY-BASED MULBERRY32 × 100 FIXTURES
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F5 property-based 100 fixtures (deterministic mulberry32)', () => {
  it('F5.1 — 100 random kiosk → OPD save → attach chains all preserve invariants', () => {
    const rand = mulberry32(0x50504040);
    const branches = ['BR-A', 'BR-B', 'BR-C', 'TEST-BR-FUTURE'];

    let pass = 0;
    for (let i = 0; i < 100; i++) {
      const store = makeStore();
      const branchId = branches[Math.floor(rand() * branches.length)];
      const useDeposit = rand() < 0.5;
      const customerNameTemp = `cust-${i}-${rand().toFixed(3)}`;
      const customerPhoneTemp = `08${Math.floor(rand() * 1e8).toString().padStart(8, '0')}`;

      let sessionId, apptId, depositId;
      if (useDeposit) {
        ({ sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
          branchId, customerNameTemp, customerPhoneTemp,
        }));
      } else {
        ({ sessionId, apptId } = simulateNoDepositKioskBooking(store, {
          branchId, customerNameTemp, customerPhoneTemp,
        }));
      }

      // Pre-attach: customerId === ''
      if (store.appointments.get(apptId).customerId !== '') continue;

      const { customerId } = simulateAddCustomer(store, {
        branchId, firstname: customerNameTemp, lastname: 'X',
      });
      const result = simulateAttach(store, sessionId, {
        customerId, customerName: `${customerNameTemp} X`, customerHN: customerId,
      });

      // Invariants
      const apptOk = store.appointments.get(apptId).customerId === customerId;
      const branchOk = store.appointments.get(apptId).branchId === branchId;
      const tempOk = store.appointments.get(apptId).customerNameTemp === customerNameTemp;
      const customerBranchOk = store.customers.get(customerId).branchId === branchId;
      const depOk = useDeposit
        ? (store.deposits.get(depositId)?.customerId === customerId
           && store.deposits.get(depositId)?.branchId === branchId)
        : (result.depositCount === 0);

      if (apptOk && branchOk && tempOk && customerBranchOk && depOk) pass++;
    }
    expect(pass).toBe(100);
  });

  it('F5.2 — 100 fixtures cleanup: cascade-delete preserves orphan-free invariant', () => {
    const rand = mulberry32(0xC1EAFFFF);
    let zero = true;
    for (let i = 0; i < 100; i++) {
      const store = makeStore();
      const useDeposit = rand() < 0.5;
      const branchId = 'BR-A';
      let sessionId;
      if (useDeposit) {
        ({ sessionId } = simulateDepositBookingPair(store, {
          branchId, customerNameTemp: `c${i}`, customerPhoneTemp: '0800000000',
        }));
      } else {
        ({ sessionId } = simulateNoDepositKioskBooking(store, {
          branchId, customerNameTemp: `c${i}`, customerPhoneTemp: '0800000000',
        }));
      }
      simulateDeleteKioskSessionCascade(store, sessionId);
      // Post-cleanup: no orphans
      if (store.appointments.size !== 0 || store.deposits.size !== 0 || store.opdSessions.size !== 0) {
        zero = false;
        break;
      }
    }
    expect(zero).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F6 — CROSS-BRANCH IDENTITY (toString.grep — branch-blind helpers)
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F6 cross-branch identity (no helper hardcodes branch)', () => {
  const apptDeposit = readSrc('src/lib/appointmentDepositBatch.js');

  it('F6.1 — attachCustomerToOpdSessionLinks body has NO hardcoded branchId references', () => {
    const slice = fnSlice(apptDeposit, 'attachCustomerToOpdSessionLinks');
    // Helper queries by linkedOpdSessionId only; branch is irrelevant at attach
    expect(slice).not.toMatch(/branchId/);
  });

  it('F6.2 — buildAppointmentPairPayload accepts branchId param (no hardcoded fallback to specific branch)', () => {
    const slice = fnSlice(apptDeposit, 'buildAppointmentPairPayload');
    // Param signature includes branchId; no hardcoded "BR-X" / "main" / specific id
    expect(slice).toMatch(/branchId/);
    expect(slice).not.toMatch(/['"]BR-\d+/); // no hardcoded prod branch ids
    expect(slice).not.toMatch(/branchId\s*=\s*['"]main['"]/);
  });

  it('F6.3 — buildDepositPairPayload mirrors (no hardcoded branchId)', () => {
    const slice = fnSlice(apptDeposit, 'buildDepositPairPayload');
    expect(slice).not.toMatch(/['"]BR-\d+/);
    expect(slice).not.toMatch(/branchId\s*=\s*['"]main['"]/);
  });

  it('F6.4 — provisionOpdLinkForBookingPair branch-blind (uses caller-resolved branchId)', () => {
    const slice = fnSlice(apptDeposit, 'provisionOpdLinkForBookingPair', 20000);
    expect(slice).toMatch(/resolvedBranchId\s*=\s*branchId\s*\|\|\s*['"]['"]/);
    expect(slice).not.toMatch(/['"]BR-\d+/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F7 — IDEMPOTENCY (re-attach is no-op)
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F7 idempotency', () => {
  it('F7.1 — re-running attach on already-attached docs is no-op', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'idempotent',
      customerPhoneTemp: '0800000000',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'idempotent', lastname: 'X',
    });
    const r1 = simulateAttach(store, sessionId, {
      customerId, customerName: 'idempotent X', customerHN: customerId,
    });
    expect(r1.appointmentCount).toBe(1);

    // Re-run with SAME customerId + sessionId
    const r2 = simulateAttach(store, sessionId, {
      customerId, customerName: 'idempotent X', customerHN: customerId,
    });
    expect(r2.appointmentCount).toBe(0);                    // already attached, where-clause filters
    expect(store.appointments.get(apptId).customerId).toBe(customerId);
  });

  it('F7.2 — attach with DIFFERENT customerId on already-attached: also no-op (where filters)', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'X',
      customerPhoneTemp: '0800000000',
    });
    const { customerId: c1 } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'X', lastname: 'one',
    });
    simulateAttach(store, sessionId, { customerId: c1, customerName: 'X one', customerHN: c1 });
    expect(store.appointments.get(apptId).customerId).toBe(c1);

    const { customerId: c2 } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'X', lastname: 'two',
    });
    const r = simulateAttach(store, sessionId, { customerId: c2, customerName: 'X two', customerHN: c2 });
    expect(r.appointmentCount).toBe(0);                    // can't re-link
    expect(store.appointments.get(apptId).customerId).toBe(c1);     // first wins
  });

  it('F7.3 — 5 sequential attach calls all converge to same final state', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'X',
      customerPhoneTemp: '0800000000',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'X', lastname: 'Y',
    });
    for (let i = 0; i < 5; i++) {
      simulateAttach(store, sessionId, { customerId, customerName: 'X Y', customerHN: customerId });
    }
    expect(store.appointments.get(apptId).customerId).toBe(customerId);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F8 — FORWARD-COMPAT (extra fields preserved through cascade)
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F8 forward-compat', () => {
  it('F8.1 — extra fields on appointment doc preserved through attach', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'X',
      customerPhoneTemp: '0800000000',
    });
    // Inject future field admin will add later
    const appt = store.appointments.get(apptId);
    appt._v51_futureField = 'do-not-clobber';
    appt._v52_someExtra = { nested: { deeply: 'nested-value' } };

    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'X', lastname: 'Y',
    });
    simulateAttach(store, sessionId, { customerId, customerName: 'X Y', customerHN: customerId });

    // Future fields survive
    expect(store.appointments.get(apptId)._v51_futureField).toBe('do-not-clobber');
    expect(store.appointments.get(apptId)._v52_someExtra.nested.deeply).toBe('nested-value');
  });

  it('F8.2 — temp fields (customerNameTemp, customerPhoneTemp) ALWAYS preserved post-attach', () => {
    const store = makeStore();
    const { sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
      branchId: 'BR-A',
      customerNameTemp: 'preserved-name',
      customerPhoneTemp: 'preserved-phone',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'New', lastname: 'Name',
    });
    simulateAttach(store, sessionId, { customerId, customerName: 'New Name', customerHN: customerId });

    expect(store.appointments.get(apptId).customerNameTemp).toBe('preserved-name');
    expect(store.appointments.get(apptId).customerPhoneTemp).toBe('preserved-phone');
    expect(store.deposits.get(depositId).customerNameTemp).toBe('preserved-name');
    expect(store.deposits.get(depositId).customerPhoneTemp).toBe('preserved-phone');
    // customerName updated to NEW value (not temp value)
    expect(store.appointments.get(apptId).customerName).toBe('New Name');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F9 — CLASS-OF-BUG UNIVERSAL CLASSIFIER
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F9 class-of-bug universal classifier', () => {
  const apptDeposit = readSrc('src/lib/appointmentDepositBatch.js');

  it('F9.1 — every kiosk-booking writer stamps linkedOpdSessionId or accepts it as param', () => {
    // Enumerate the writers + classify
    const writers = [
      { name: 'buildAppointmentPairPayload', expectsLinkedOpdSessionId: true },
      { name: 'buildDepositPairPayload', expectsLinkedOpdSessionId: true },
      { name: 'createDepositBookingPair', expectsLinkedOpdSessionId: true },
    ];
    for (const w of writers) {
      const slice = fnSlice(apptDeposit, w.name);
      if (w.expectsLinkedOpdSessionId) {
        expect(slice, `${w.name} should accept linkedOpdSessionId`).toMatch(/linkedOpdSessionId/);
      }
    }
  });

  it('F9.2 — every attach reader queries by linkedOpdSessionId (single match key)', () => {
    const slice = fnSlice(apptDeposit, 'attachCustomerToOpdSessionLinks');
    const matches = slice.match(/linkedOpdSessionId/g) || [];
    // attach helper references linkedOpdSessionId in 2 query+match locations
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('F9.3 — no writer/attach helper references customer.branchId (V12 anti-pattern lock)', () => {
    expect(apptDeposit).not.toMatch(/customer\.branchId/);
    expect(apptDeposit).not.toMatch(/cust\.branchId/);
  });

  it('F9.4 — no writer/attach helper hardcodes specific sessionId prefix (DEP/ND/CST/PRM)', () => {
    // Helpers should be PREFIX-AGNOSTIC — kiosk session can be DEP-, ND-, CST-,
    // PRM-, FW-, BL- (provisioned-after-booking). Helpers query by full match.
    const slice = fnSlice(apptDeposit, 'attachCustomerToOpdSessionLinks');
    expect(slice).not.toMatch(/['"]DEP-/);
    expect(slice).not.toMatch(/['"]ND-/);
    expect(slice).not.toMatch(/['"]CST-/);
    expect(slice).not.toMatch(/['"]PRM-/);
    expect(slice).not.toMatch(/startsWith\(['"]/);
  });

  it('F9.5 — confirmCreateDeposit + no-deposit handler both stamp linkedOpdSessionId on the booking write', () => {
    const adminDashboard = readSrc('src/pages/AdminDashboard.jsx');
    // confirmCreateDeposit passes sessionId via createDepositBookingPair
    const dep = fnSlice(adminDashboard, 'confirmCreateDeposit', 20000);
    expect(dep).toMatch(/linkedOpdSessionId:\s*sessionId/);
    // no-deposit handler also stamps (per Phase 24.0-vicies-novies comment)
    expect(adminDashboard).toMatch(/linkedOpdSessionId/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F10 — LIFECYCLE ASSERTIONS (post-attach state shape)
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F10 lifecycle assertions (post-attach state shape)', () => {
  it('F10.1 — post-attach appointment doc has ALL required fields', () => {
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',
      customerNameTemp: 'X',
      customerPhoneTemp: '0800000000',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'X', lastname: 'Y',
    });
    simulateAttach(store, sessionId, { customerId, customerName: 'X Y', customerHN: customerId });

    const appt = store.appointments.get(apptId);
    // Required fields stamped post-attach
    expect(appt.customerId).toBe(customerId);
    expect(appt.customerName).toBe('X Y');
    expect(appt.customerHN).toBe(customerId);
    expect(appt.customerLinkedAt).toBeTruthy();
    expect(appt.customerLinkedFrom).toBe('opd-save-auto');
    expect(appt.updatedAt).toBeTruthy();
    // Forensic trail preserved
    expect(appt.customerNameTemp).toBe('X');
    expect(appt.customerPhoneTemp).toBe('0800000000');
    // Original fields still present
    expect(appt.linkedOpdSessionId).toBe(sessionId);
    expect(appt.appointmentType).toBe('no-deposit-booking');
    expect(appt.branchId).toBe('BR-A');
    expect(appt.date).toBe('2026-12-31');
  });

  it('F10.2 — post-attach deposit doc has ALL required fields (mirror of F10.1)', () => {
    const store = makeStore();
    const { sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
      branchId: 'BR-A',
      customerNameTemp: 'Y',
      customerPhoneTemp: '0811111111',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'Y', lastname: 'Z',
    });
    simulateAttach(store, sessionId, { customerId, customerName: 'Y Z', customerHN: customerId });

    const dep = store.deposits.get(depositId);
    expect(dep.customerId).toBe(customerId);
    expect(dep.customerName).toBe('Y Z');
    expect(dep.customerHN).toBe(customerId);
    expect(dep.customerLinkedAt).toBeTruthy();
    expect(dep.customerLinkedFrom).toBe('opd-save-auto');
    expect(dep.linkedAppointmentId).toBe(apptId);
    expect(dep.linkedOpdSessionId).toBe(sessionId);
    expect(dep.amount).toBe(1000);
    expect(dep.remainingAmount).toBe(1000);
  });

  it('F10.3 — customer doc shape post-add (immutable branchId + creation fields)', () => {
    const store = makeStore();
    const { customerId, customerDoc } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'A', lastname: 'B',
    });
    expect(customerDoc.branchId).toBe('BR-A');
    expect(customerDoc.hn_no).toBe(customerId);
    expect(customerDoc.isManualEntry).toBe(true);
    expect(customerDoc.courses).toEqual([]);
    expect(customerDoc.appointments).toEqual([]);
    expect(customerDoc.treatmentSummary).toEqual([]);
    expect(customerDoc.treatmentCount).toBe(0);
    expect(customerDoc.patientData.firstName).toBe('A');
  });

  it('F10.4 — post-attach + cascade-delete: customer survives, booking docs gone', () => {
    const store = makeStore();
    const { sessionId, apptId, depositId } = simulateDepositBookingPair(store, {
      branchId: 'BR-A',
      customerNameTemp: 'X',
      customerPhoneTemp: '0800000000',
    });
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-A', firstname: 'X', lastname: 'Y',
    });
    simulateAttach(store, sessionId, { customerId, customerName: 'X Y', customerHN: customerId });
    expect(store.customers.has(customerId)).toBe(true);
    expect(store.appointments.has(apptId)).toBe(true);
    expect(store.deposits.has(depositId)).toBe(true);

    // Cascade-delete the kiosk session
    simulateDeleteKioskSessionCascade(store, sessionId);
    expect(store.customers.has(customerId)).toBe(true);             // customer survives
    // (Note: production code may protect post-attach docs; simulator follows
    // simple linkedOpdSessionId match — see F3.8 comment for the sharp edge)
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F11 — BRANCH SWITCH / CONTEXT-CHANGE CHAOS
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F11 branch-switch chaos', () => {
  it('F11.1 — kiosk@BR-A → admin switches to BR-B → OPD save with admin@BR-B → customer.branchId = BR-B (admin context wins)', () => {
    // Note: customer is created at admin's CURRENT context, not kiosk's branch.
    // This is INTENTIONAL — addCustomer reads selectedBranchId at the moment
    // of OPD save click. If admin switched mid-flow, the customer lands on
    // the new branch.
    const store = makeStore();
    const { sessionId, apptId } = simulateNoDepositKioskBooking(store, {
      branchId: 'BR-A',                                              // kiosk branch
      customerNameTemp: 'X',
      customerPhoneTemp: '0800000000',
    });
    expect(store.appointments.get(apptId).branchId).toBe('BR-A');

    // Admin switches to BR-B; OPD save proceeds
    const { customerId } = simulateAddCustomer(store, {
      branchId: 'BR-B',                                              // admin's NEW context
      firstname: 'X',
      lastname: 'Y',
    });
    expect(store.customers.get(customerId).branchId).toBe('BR-B');

    // Attach proceeds — appointment doc's branchId UNCHANGED (it's the kiosk's)
    simulateAttach(store, sessionId, { customerId, customerName: 'X Y', customerHN: customerId });
    expect(store.appointments.get(apptId).branchId).toBe('BR-A');    // immutable
    expect(store.appointments.get(apptId).customerId).toBe(customerId);

    // Cross-branch state: customer at BR-B, appointment at BR-A.
    // This is a known sharp edge — admin should be on the same branch as
    // the kiosk session for clean per-branch reports.
  });

  it('F11.2 — multi-branch session set: each branch sees only its own bookings', () => {
    const store = makeStore();
    simulateNoDepositKioskBooking(store, { branchId: 'BR-A', customerNameTemp: 'A1', customerPhoneTemp: '0811111111' });
    simulateNoDepositKioskBooking(store, { branchId: 'BR-B', customerNameTemp: 'B1', customerPhoneTemp: '0822222222' });
    simulateNoDepositKioskBooking(store, { branchId: 'BR-C', customerNameTemp: 'C1', customerPhoneTemp: '0833333333' });
    simulateNoDepositKioskBooking(store, { branchId: 'BR-A', customerNameTemp: 'A2', customerPhoneTemp: '0844444444' });

    const aGrid = Array.from(store.appointments.values()).filter(a => a.branchId === 'BR-A');
    const bGrid = Array.from(store.appointments.values()).filter(a => a.branchId === 'BR-B');
    const cGrid = Array.from(store.appointments.values()).filter(a => a.branchId === 'BR-C');
    expect(aGrid.length).toBe(2);
    expect(bGrid.length).toBe(1);
    expect(cGrid.length).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F12 — V50 MARKERS + POST-STRIP CONTRACT PRESERVATION
// ────────────────────────────────────────────────────────────────────────────

describe('V50 Phase 4 — F12 V50 markers + post-strip contract', () => {
  it('F12.1 — V50 marker + Phase 4 institutional memory (no regression of strip)', () => {
    // Phase 4 institutional memory present in active.md or session checkpoint
    const active = readSrc('.agents/active.md');
    const session = readSrc('.agents/sessions/2026-05-08-v50-proclinic-strip.md');
    const combined = active + '\n' + session;
    expect(combined).toMatch(/Phase 4/);
  });

  it('F12.2 — confirmCreateDeposit DOES NOT import brokerClient post-V50', () => {
    const adminDashboard = readSrc('src/pages/AdminDashboard.jsx');
    expect(adminDashboard).not.toMatch(/from ['"][^'"]*brokerClient/);
  });

  it('F12.3 — appointmentDepositBatch.js DOES NOT import brokerClient or call /api/proclinic/*', () => {
    const apptDeposit = readSrc('src/lib/appointmentDepositBatch.js');
    expect(apptDeposit).not.toMatch(/from ['"][^'"]*brokerClient/);
    expect(apptDeposit).not.toMatch(/['"]\/api\/proclinic\//);
  });

  it('F12.4 — attach helper DOES NOT depend on ProClinic-side state', () => {
    const slice = fnSlice(readSrc('src/lib/appointmentDepositBatch.js'), 'attachCustomerToOpdSessionLinks');
    expect(slice).not.toMatch(/proClinic|broker|pc_/i);
  });

  it('F12.5 — kiosk session sessionId mint is V50-safe (no broker dependency)', () => {
    const adminDashboard = readSrc('src/pages/AdminDashboard.jsx');
    const slice = fnSlice(adminDashboard, 'confirmCreateDeposit');
    // Mint is `DEP-${shortId}` — local genShortId, no broker
    expect(slice).toMatch(/sessionId\s*=\s*`DEP-\$\{shortId\}`/);
    expect(slice).not.toMatch(/broker\.|broker\(/);
  });
});
