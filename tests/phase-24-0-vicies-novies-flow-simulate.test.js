// ─── Phase 24.0-vicies-novies — full-flow simulate (Rule I) ─────────────────
//
// Rule I (iron-clad) — every sub-phase that touches a user-visible flow must
// chain pure-helper simulators of EACH step the user exercises. Helper-only
// unit tests are necessary but not sufficient.
//
// Flow chained here:
//   1. Admin creates customer-later booking via AdminDashboard kiosk
//      "+ สร้างคิวมัดจำ" → opd_sessions/{DEP-...} doc + paired
//      be_deposits + be_appointments docs (all with linkedOpdSessionId stamped).
//   2. Admin clicks "ส่งลิ้งค์ลูกค้า" in DepositPanel customer-later card →
//      provisionOpdLinkForBookingPair (OR — existing kiosk flow already has
//      the link from step 1, no separate provision needed).
//   3. Customer opens URL → fills PatientForm → submits with possibly DIFFERENT
//      phone than what was given at booking → opd_sessions doc updates.
//   4. Admin reviews + clicks "บันทึกลง OPD" → handleOpdClick →
//      addCustomer → attachCustomerToOpdSessionLinks(sessionId, customer) →
//      both halves of the pair gain customerId.
//
// Adversarial coverage (per V21 lock-in lessons): customer types different
// phone, send-link clicked twice (idempotency), legacy doc (no link),
// concurrent OPD save (idempotency).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const PAIR_HELPER = fs.readFileSync(
  path.join(ROOT, 'src/lib/appointmentDepositBatch.js'),
  'utf8',
);
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);

// ─── Pure simulators (mirror in-memory state without Firestore) ─────────────

/**
 * Mirror the Firestore "where + ==" filter as in-memory predicate. Used by
 * the simulator below to mimic attachCustomerToOpdSessionLinks query shape.
 */
function filterDocs(docs, predicates) {
  return docs.filter((doc) => predicates.every(([key, value]) => doc[key] === value));
}

/**
 * Pure simulator for attachCustomerToOpdSessionLinks. Mirrors the helper's
 * query → writeBatch → return shape WITHOUT touching Firestore. Used by
 * tests below to chain the full flow.
 */
function simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
  customerId,
  customerName,
  customerHN = '',
}) {
  if (!sessionId) throw new Error('sessionId required');
  if (!customerId) throw new Error('customerId required');
  const matchingDeposits = filterDocs(state.deposits, [
    ['linkedOpdSessionId', sessionId],
    ['customerId', ''],
  ]);
  const matchingAppts = filterDocs(state.appointments, [
    ['linkedOpdSessionId', sessionId],
    ['customerId', ''],
  ]);
  const now = new Date().toISOString();
  for (const dep of matchingDeposits) {
    dep.customerId = String(customerId);
    dep.customerName = String(customerName || '');
    dep.customerHN = String(customerHN || '');
    dep.customerLinkedAt = now;
    dep.customerLinkedFrom = 'opd-save-auto';
    dep.updatedAt = now;
    // customerNameTemp + customerPhoneTemp PRESERVED (forensic trail).
  }
  for (const appt of matchingAppts) {
    appt.customerId = String(customerId);
    appt.customerName = String(customerName || '');
    appt.customerHN = String(customerHN || '');
    appt.customerLinkedAt = now;
    appt.customerLinkedFrom = 'opd-save-auto';
    appt.updatedAt = now;
  }
  return {
    sessionId,
    depositCount: matchingDeposits.length,
    appointmentCount: matchingAppts.length,
    depositIds: matchingDeposits.map((d) => d.depositId),
    appointmentIds: matchingAppts.map((a) => a.appointmentId),
  };
}

/**
 * Pure simulator for provisionOpdLinkForBookingPair idempotency check.
 */
function simulateProvisionOpdLink(state, {
  depositId = '',
  appointmentId = '',
  branchId = '',
  formType = 'intake',
  sessionName = '',
}) {
  if (!depositId && !appointmentId) {
    throw new Error('depositId OR appointmentId required');
  }
  // Idempotency: if existing booking already has linkedOpdSessionId, reuse it.
  let existing = '';
  if (depositId) {
    const dep = state.deposits.find((d) => d.depositId === depositId);
    if (dep?.linkedOpdSessionId) existing = dep.linkedOpdSessionId;
    if (!sessionName && dep) sessionName = dep.customerNameTemp || dep.customerName || 'ลูกค้าจอง';
    if (!branchId && dep) branchId = dep.branchId || '';
  } else if (appointmentId) {
    const appt = state.appointments.find((a) => a.appointmentId === appointmentId);
    if (appt?.linkedOpdSessionId) existing = appt.linkedOpdSessionId;
    if (!sessionName && appt) sessionName = appt.customerNameTemp || appt.customerName || 'ลูกค้าจอง';
    if (!branchId && appt) branchId = appt.branchId || '';
  }
  if (existing) {
    return { sessionId: existing, url: `?session=${existing}`, alreadyProvisioned: true };
  }
  // Mint new sessionId BL-{ts}-{8hex} pattern (simulator: deterministic).
  const sessionId = `BL-${Date.now()}-deadbeef`;
  state.sessions.push({
    sessionId,
    status: 'pending',
    formType,
    branchId,
    sessionName,
    linkedDepositId: depositId,
    linkedAppointmentId: appointmentId,
    createdFromBackendBooking: true,
  });
  // Reverse-stamp on deposit + appointment.
  if (depositId) {
    const dep = state.deposits.find((d) => d.depositId === depositId);
    if (dep) {
      dep.linkedOpdSessionId = sessionId;
      dep.opdLinkProvisionedAt = new Date().toISOString();
    }
  }
  if (appointmentId) {
    const appt = state.appointments.find((a) => a.appointmentId === appointmentId);
    if (appt) {
      appt.linkedOpdSessionId = sessionId;
      appt.opdLinkProvisionedAt = new Date().toISOString();
    }
  }
  return { sessionId, url: `?session=${sessionId}`, alreadyProvisioned: false };
}

/**
 * Build a fresh state (in-memory mock of the relevant Firestore collections).
 */
function freshState() {
  return {
    sessions: [],     // opd_sessions
    deposits: [],     // be_deposits
    appointments: [], // be_appointments
    customers: [],    // be_customers
  };
}

// ─── L1: kiosk flow (DEP- session) end-to-end ───────────────────────────────
describe('Phase 24.0-vicies-novies — L1: kiosk DEP- flow end-to-end', () => {
  it('VN.L1.1 — kiosk creates session + paired deposit/appointment with linkedOpdSessionId on both', () => {
    const state = freshState();
    const sessionId = 'DEP-ABC123';
    // Mirror confirmCreateDeposit kiosk path
    state.sessions.push({
      sessionId,
      status: 'pending',
      formType: 'deposit',
      branchId: 'BR-1',
      patientData: null,
      linkedDepositId: 'DEP-T1',
      linkedAppointmentId: 'BA-T1',
    });
    state.deposits.push({
      depositId: 'DEP-T1',
      customerId: '',
      customerName: 'ลูกค้าจอง',
      customerHN: '',
      customerNameTemp: 'คุณสมชาย ใจดี',
      customerPhoneTemp: '0812345678',
      branchId: 'BR-1',
      linkedAppointmentId: 'BA-T1',
      linkedOpdSessionId: sessionId,
      hasAppointment: true,
      status: 'active',
    });
    state.appointments.push({
      appointmentId: 'BA-T1',
      customerId: '',
      customerName: 'ลูกค้าจอง',
      customerNameTemp: 'คุณสมชาย ใจดี',
      customerPhoneTemp: '0812345678',
      branchId: 'BR-1',
      linkedDepositId: 'DEP-T1',
      linkedOpdSessionId: sessionId,
      appointmentType: 'deposit-booking',
      status: 'pending',
    });
    expect(state.deposits[0].linkedOpdSessionId).toBe(sessionId);
    expect(state.appointments[0].linkedOpdSessionId).toBe(sessionId);
  });

  it('VN.L1.2 — handleOpdClick → addCustomer → attachCustomerToOpdSessionLinks → both halves attached', () => {
    const state = freshState();
    const sessionId = 'DEP-ABC123';
    state.deposits.push({
      depositId: 'DEP-T1', customerId: '', customerName: 'ลูกค้าจอง',
      customerNameTemp: 'คุณสมชาย ใจดี', customerPhoneTemp: '0812345678',
      branchId: 'BR-1', linkedOpdSessionId: sessionId, hasAppointment: true, status: 'active',
    });
    state.appointments.push({
      appointmentId: 'BA-T1', customerId: '', customerName: 'ลูกค้าจอง',
      customerNameTemp: 'คุณสมชาย ใจดี', customerPhoneTemp: '0812345678',
      branchId: 'BR-1', linkedOpdSessionId: sessionId, status: 'pending',
    });
    // OPD save creates customer + attach
    const newCustomer = { id: 'LC-26000099', hn_no: 'LC-26000099' };
    const r = simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: newCustomer.id,
      customerName: 'นาย สมชาย ใจดี',
      customerHN: newCustomer.hn_no,
    });
    expect(r.depositCount).toBe(1);
    expect(r.appointmentCount).toBe(1);
    expect(state.deposits[0].customerId).toBe('LC-26000099');
    expect(state.appointments[0].customerId).toBe('LC-26000099');
    expect(state.deposits[0].customerName).toBe('นาย สมชาย ใจดี');
    // Forensic trail preserved
    expect(state.deposits[0].customerNameTemp).toBe('คุณสมชาย ใจดี');
    expect(state.deposits[0].customerPhoneTemp).toBe('0812345678');
    expect(state.deposits[0].customerLinkedFrom).toBe('opd-save-auto');
  });

  it('VN.L1.3 — toast count totals deposit + appointment counts', () => {
    const state = freshState();
    const sessionId = 'DEP-X';
    state.deposits.push({ depositId: 'DEP-T1', customerId: '', linkedOpdSessionId: sessionId });
    state.appointments.push({ appointmentId: 'BA-T1', customerId: '', linkedOpdSessionId: sessionId });
    const r = simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'C1', customerName: 'X',
    });
    expect(r.depositCount + r.appointmentCount).toBe(2);
  });
});

// ─── L2: kiosk no-deposit flow (ND- session) ────────────────────────────────
describe('Phase 24.0-vicies-novies — L2: kiosk ND- (no-deposit) flow', () => {
  it('VN.L2.1 — ND-session has linkedAppointmentId; only appointment doc present (no deposit)', () => {
    const state = freshState();
    const sessionId = 'ND-XYZ789';
    state.sessions.push({
      sessionId, status: 'pending', formType: 'intake', branchId: 'BR-1',
      linkedAppointmentId: 'BA-N1',
    });
    state.appointments.push({
      appointmentId: 'BA-N1', customerId: '', customerName: 'คุณสมหญิง รอดู',
      customerNameTemp: 'คุณสมหญิง รอดู', customerPhoneTemp: '0898888888',
      branchId: 'BR-1', linkedOpdSessionId: sessionId, appointmentType: 'no-deposit-booking',
      status: 'pending',
    });
    const r = simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'LC-26000100', customerName: 'นางสาว สมหญิง รอดู', customerHN: 'LC-26000100',
    });
    expect(r.depositCount).toBe(0); // no deposit on no-deposit flow
    expect(r.appointmentCount).toBe(1);
    expect(state.appointments[0].customerId).toBe('LC-26000100');
  });
});

// ─── L3: customer types DIFFERENT phone — KEY user requirement ──────────────
describe('Phase 24.0-vicies-novies — L3: phone-mismatch resilience', () => {
  it('VN.L3.1 — match works even when customer typed phone DIFFERS from booking', () => {
    const state = freshState();
    const sessionId = 'DEP-DIFF1';
    state.deposits.push({
      depositId: 'DEP-T1', customerId: '',
      customerNameTemp: 'คุณวีระ ใจดี',
      customerPhoneTemp: '0811111111',  // booking-time phone
      branchId: 'BR-1', linkedOpdSessionId: sessionId,
    });
    state.appointments.push({
      appointmentId: 'BA-T1', customerId: '',
      customerNameTemp: 'คุณวีระ ใจดี',
      customerPhoneTemp: '0811111111',
      branchId: 'BR-1', linkedOpdSessionId: sessionId,
    });
    // Customer types DIFFERENT phone in OPD form (typo, different number, etc.)
    // The new customer record has phone 0899999999 but the booking has 0811111111.
    const newCustomer = { id: 'LC-26000200', hn_no: 'LC-26000200', phone: '0899999999' };
    // Match still succeeds because key is sessionId, NOT phone.
    const r = simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: newCustomer.id,
      customerName: 'นาย วีระ ใจดี',
      customerHN: newCustomer.hn_no,
    });
    expect(r.depositCount).toBe(1);
    expect(r.appointmentCount).toBe(1);
    // Booking-time temp phone preserved (audit trail)
    expect(state.deposits[0].customerPhoneTemp).toBe('0811111111');
    expect(state.deposits[0].customerId).toBe('LC-26000200');
  });

  it('VN.L3.2 — match works when customer types NO phone at all', () => {
    const state = freshState();
    const sessionId = 'DEP-NOPH';
    state.deposits.push({
      depositId: 'DEP-T2', customerId: '',
      customerPhoneTemp: '0811111111',  // booking phone
      branchId: 'BR-1', linkedOpdSessionId: sessionId,
    });
    // OPD form had no phone field filled
    const r = simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'LC-26000201', customerName: 'X', customerHN: 'LC-26000201',
    });
    expect(r.depositCount).toBe(1);
  });
});

// ─── L4: legacy customer-later doc (no linkedOpdSessionId) ──────────────────
describe('Phase 24.0-vicies-novies — L4: legacy doc — silent no-op', () => {
  it('VN.L4.1 — legacy customer-later doc without linkedOpdSessionId is SKIPPED at OPD save', () => {
    const state = freshState();
    const sessionId = 'DEP-NEW';
    // Legacy deposit (no linkedOpdSessionId — pre-Phase-24-0-vicies-novies)
    state.deposits.push({
      depositId: 'DEP-LEGACY', customerId: '',
      customerNameTemp: 'คุณ Old', customerPhoneTemp: '0800000000',
      branchId: 'BR-1',
      // linkedOpdSessionId field absent
    });
    const r = simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'C1', customerName: 'X',
    });
    expect(r.depositCount).toBe(0);
    expect(r.appointmentCount).toBe(0);
    expect(state.deposits[0].customerId).toBe(''); // unchanged
  });

  it('VN.L4.2 — legacy doc still attachable via existing pickLater UI (manual fallback)', () => {
    // Documents the manual fallback flow per plan: when no linkedOpdSessionId
    // exists, admin manually attaches via AppointmentFormModal pickLater toggle
    // (Phase 24.0-vicies-septiesdecies attachCustomerToLinkedDeposit). The
    // attach-to-OPD-session helper is a no-op for these — but the manual
    // path still works because attachCustomerToLinkedDeposit looks up by
    // depositId, not sessionId.
    expect(PAIR_HELPER).toMatch(/export\s+async\s+function\s+attachCustomerToLinkedDeposit/);
  });
});

// ─── L5: idempotency (admin double-clicks send-link / re-saves OPD) ─────────
describe('Phase 24.0-vicies-novies — L5: idempotency', () => {
  it('VN.L5.1 — re-clicking send-link returns existing sessionId (alreadyProvisioned=true)', () => {
    const state = freshState();
    state.deposits.push({
      depositId: 'DEP-IDEMP', customerId: '',
      customerNameTemp: 'X', branchId: 'BR-1',
    });
    const r1 = simulateProvisionOpdLink(state, { depositId: 'DEP-IDEMP', branchId: 'BR-1' });
    expect(r1.alreadyProvisioned).toBe(false);
    expect(r1.sessionId).toMatch(/^BL-/);
    // Click again
    const r2 = simulateProvisionOpdLink(state, { depositId: 'DEP-IDEMP', branchId: 'BR-1' });
    expect(r2.alreadyProvisioned).toBe(true);
    expect(r2.sessionId).toBe(r1.sessionId); // SAME url
    // Only one session minted
    expect(state.sessions.filter((s) => s.linkedDepositId === 'DEP-IDEMP').length).toBe(1);
  });

  it('VN.L5.2 — re-running OPD save (admin double-clicks) doesn\'t double-attach', () => {
    const state = freshState();
    const sessionId = 'DEP-2X';
    state.deposits.push({
      depositId: 'DEP-T1', customerId: '',
      linkedOpdSessionId: sessionId, branchId: 'BR-1',
    });
    const r1 = simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'C1', customerName: 'X',
    });
    expect(r1.depositCount).toBe(1);
    // Second click — deposit now has customerId set, query filter excludes it.
    const r2 = simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'C1', customerName: 'X',
    });
    expect(r2.depositCount).toBe(0);
  });
});

// ─── L6: source-grep regression guards (Rule I item c) ──────────────────────
describe('Phase 24.0-vicies-novies — L6: source-grep regression guards', () => {
  it('VN.L6.1 — every createDepositBookingPair callsite handling kiosk flow forwards linkedOpdSessionId', () => {
    // The kiosk callsite (confirmCreateDeposit) MUST pass the session id as
    // linkedOpdSessionId. Other callsites (DepositPanel.handleSave,
    // AppointmentFormModal embedded subform) don't have a session yet — they
    // legitimately omit the field (will be back-filled via send-link button).
    // This test specifically guards confirmCreateDeposit kiosk path.
    expect(ADMIN).toMatch(
      /createDepositBookingPair\(\{\s*[\s\S]{0,500}?linkedOpdSessionId:\s*sessionId/,
    );
  });

  it('VN.L6.2 — buildAppointmentPairPayload + buildDepositPairPayload BOTH stamp linkedOpdSessionId', () => {
    // V12 multi-writer-sweep guard.
    expect(PAIR_HELPER).toMatch(
      /buildAppointmentPairPayload[\s\S]{0,3000}?linkedOpdSessionId:\s*linkedOpdSessionId\s*\|\|\s*['"]['"]/,
    );
    expect(PAIR_HELPER).toMatch(
      /buildDepositPairPayload[\s\S]{0,3000}?linkedOpdSessionId:\s*linkedOpdSessionId\s*\|\|\s*['"]['"]/,
    );
  });

  it('VN.L6.3 — handleOpdClick attach hook fires in ALL 3 success paths', () => {
    const occurrences = ADMIN.match(/await\s+_attachLinkedBookings/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  it('VN.L6.4 — confirmCreateNoDeposit symmetric stamp on session linkedAppointmentId', () => {
    // Mirror of confirmCreateDeposit kiosk-write — opd_sessions also gets
    // linkedAppointmentId so handleOpdClick has bidirectional traceability.
    expect(ADMIN).toMatch(
      /linkedAppointmentId:\s*apptResult\.appointmentId/,
    );
  });

  it('VN.L6.5 — anti-regression: NO phone/name fuzzy match remains anywhere (Q3=REJECTED lock)', () => {
    // User explicitly rejected phone/name/citizen_id matching. If a future dev
    // tries to re-add fuzzy match in attachCustomerToOpdSessionLinks, this test
    // catches it.
    const block = PAIR_HELPER.match(
      /export\s+async\s+function\s+attachCustomerToOpdSessionLinks[\s\S]{0,3500}?\}\s*\n/,
    );
    expect(block[0]).not.toMatch(/customerPhoneTemp\s*==/);
    expect(block[0]).not.toMatch(/where\(['"]customerPhoneTemp['"]/);
    expect(block[0]).not.toMatch(/customerNameTemp\s*==/);
    expect(block[0]).not.toMatch(/Levenshtein|fuzzy/);
  });

  it('VN.L6.6 — opd-session URL builder always uses ?session= path (V16 anon-auth flow lock)', () => {
    // Public PatientForm reads `?session=` per V16/V23. URL builder must
    // emit the same path so the existing render gate + listener-resubscribe
    // logic kicks in.
    expect(PAIR_HELPER).toMatch(/`\$\{resolvedOrigin\}\/\?session=\$\{sessionId\}`/);
  });

  it('VN.L6.7 — institutional-memory markers present (both new helpers)', () => {
    expect(PAIR_HELPER).toMatch(
      /MARKER:\s*phase-24-0-vicies-novies-attach-customer-to-opd-session-links/,
    );
    expect(PAIR_HELPER).toMatch(
      /MARKER:\s*phase-24-0-vicies-novies-provision-opd-link-for-booking-pair/,
    );
  });

  it('VN.L6.8 — Phase 24.0-vicies-novies marker present in source files', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-vicies-novies/);
    expect(PAIR_HELPER).toMatch(/Phase 24\.0-vicies-novies/);
  });
});

// ─── L7-L9: lifecycle + adversarial coverage ────────────────────────────────
describe('Phase 24.0-vicies-novies — L7: lifecycle assertions', () => {
  it('VN.L7.1 — after attach, deposit.customerName = constructed prefix+first+last (NOT temp name)', () => {
    const state = freshState();
    const sessionId = 'DEP-FRESH';
    state.deposits.push({
      depositId: 'DEP-T1', customerId: '',
      customerName: 'ลูกค้าจอง',  // placeholder
      customerNameTemp: 'คุณสมชาย',
      linkedOpdSessionId: sessionId,
    });
    simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'C1',
      customerName: 'นาย สมชาย ใจดี',  // canonical from be_customers
    });
    expect(state.deposits[0].customerName).toBe('นาย สมชาย ใจดี');
    // Temp preserved for audit
    expect(state.deposits[0].customerNameTemp).toBe('คุณสมชาย');
  });

  it('VN.L7.2 — after attach, customerHN populated for a clickable link in DepositPanel', () => {
    const state = freshState();
    const sessionId = 'DEP-HN1';
    state.deposits.push({
      depositId: 'DEP-T1', customerId: '', customerHN: '',
      linkedOpdSessionId: sessionId,
    });
    simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'LC-26000050', customerName: 'X', customerHN: 'LC-26000050',
    });
    expect(state.deposits[0].customerHN).toBe('LC-26000050');
  });
});

describe('Phase 24.0-vicies-novies — L8: adversarial customers / Thai text', () => {
  it('VN.L8.1 — Thai full name preserved verbatim', () => {
    const state = freshState();
    const sessionId = 'DEP-TH1';
    state.deposits.push({
      depositId: 'DEP-T1', customerId: '', linkedOpdSessionId: sessionId,
    });
    simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'C1', customerName: 'นางสาว ปวีณา ศรีวรรณ',
    });
    expect(state.deposits[0].customerName).toBe('นางสาว ปวีณา ศรีวรรณ');
  });

  it('VN.L8.2 — empty customerHN handled gracefully (string conversion)', () => {
    const state = freshState();
    const sessionId = 'DEP-NHN';
    state.deposits.push({
      depositId: 'DEP-T1', customerId: '', linkedOpdSessionId: sessionId,
    });
    simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'C1', customerName: 'X', customerHN: '',
    });
    expect(state.deposits[0].customerHN).toBe('');
  });

  it('VN.L8.3 — undefined customerHN coerced to empty string', () => {
    const state = freshState();
    const sessionId = 'DEP-UHN';
    state.deposits.push({
      depositId: 'DEP-T1', customerId: '', linkedOpdSessionId: sessionId,
    });
    simulateAttachCustomerToOpdSessionLinks(state, sessionId, {
      customerId: 'C1', customerName: 'X', customerHN: undefined,
    });
    expect(state.deposits[0].customerHN).toBe('');
  });
});

describe('Phase 24.0-vicies-novies — L9: cross-booking isolation', () => {
  it('VN.L9.1 — attach for sessionA does NOT touch sessionB bookings (key is per-session)', () => {
    const state = freshState();
    state.deposits.push({
      depositId: 'DEP-A', customerId: '', linkedOpdSessionId: 'DEP-SESSION-A',
    });
    state.deposits.push({
      depositId: 'DEP-B', customerId: '', linkedOpdSessionId: 'DEP-SESSION-B',
    });
    simulateAttachCustomerToOpdSessionLinks(state, 'DEP-SESSION-A', {
      customerId: 'CUST-A', customerName: 'A',
    });
    expect(state.deposits[0].customerId).toBe('CUST-A');
    expect(state.deposits[1].customerId).toBe('');  // B unchanged
  });

  it('VN.L9.2 — already-attached doc with same linkedOpdSessionId is NOT re-attached', () => {
    const state = freshState();
    state.deposits.push({
      depositId: 'DEP-OLD', customerId: 'PRIOR-CUST',  // already attached
      linkedOpdSessionId: 'DEP-SHARED',
    });
    state.deposits.push({
      depositId: 'DEP-NEW', customerId: '',
      linkedOpdSessionId: 'DEP-SHARED',
    });
    simulateAttachCustomerToOpdSessionLinks(state, 'DEP-SHARED', {
      customerId: 'NEW-CUST', customerName: 'X',
    });
    expect(state.deposits[0].customerId).toBe('PRIOR-CUST'); // unchanged
    expect(state.deposits[1].customerId).toBe('NEW-CUST');
  });
});
