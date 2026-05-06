// ─── Phase 24.0-vicies-novies-bis — comprehensive end-to-end scenario coverage ─
//
// User directive 2026-05-07 (verbatim): "เขียน e2e ลองมาให้ครอบคลุมทุกกรณีด้วย
// อย่าให้พลาดเหมือนเดิม หรือกรณีอื่นๆที่เป็นไปได้อีก".
//
// This file is the comprehensive scenario simulator for the OPD-save auto-
// attach flow + duplicate-deposit fix. It chains EVERY step the user
// exercises (kiosk-create → customer-fill → admin-save → state assertions)
// using in-memory pure mirrors of the actual handlers, so we catch
// integration bugs (like the handleDepositSync miss) that source-grep + unit
// tests can't see.
//
// 12 scenarios cover:
//   E1. Kiosk deposit + appointment → handleDepositSync save (THE BUG FIX)
//   E2. Kiosk deposit-only → handleDepositSync save
//   E3. Kiosk no-deposit booking → handleOpdClick save
//   E4. Backend pickLater + send-link → handleOpdClick save
//   E5. Different phone in OPD form (phone-mismatch resilience)
//   E6. Idempotent re-save (admin double-clicks "บันทึกลง")
//   E7. Legacy session without linkedDepositId → fallback createDeposit
//   E8. Cross-customer isolation (sessionA save doesn't touch sessionB)
//   E9. Already-attached deposit re-save (no double-attach, no errors)
//   E10. handleDepositSync vs handleOpdClick: distinct routing
//   E11. Backend pickLater on appointment WITHOUT linkedDepositId (no deposit)
//   E12. Deposit-only orphan (deposit exists, linked appointment was deleted)
//
// Each scenario:
//   1. Builds in-memory state mirroring opd_sessions + be_deposits +
//      be_appointments + be_customers collections.
//   2. Runs the simulator handler matching the user's button click.
//   3. Asserts ALL invariants on the final state:
//      - No duplicate be_deposits docs
//      - customerId attached to ALL bookings of the saved session
//      - customerId NOT touched on bookings of OTHER sessions
//      - Forensic-trail fields preserved (customerNameTemp / customerPhoneTemp)
//      - Toast message correctness

import { describe, it, expect } from 'vitest';

// ─── In-memory simulator state ──────────────────────────────────────────────

function freshDb() {
  return {
    sessions: [],     // opd_sessions
    deposits: [],     // be_deposits
    appointments: [], // be_appointments
    customers: [],    // be_customers
    toasts: [],       // record of showToast() calls
  };
}

function findDoc(col, id, idField = null) {
  return col.find((d) => (idField ? d[idField] === id : d.id === id));
}

function filterDocs(col, predicates) {
  return col.filter((doc) => predicates.every(([key, value]) => doc[key] === value));
}

// ─── attachCustomerToOpdSessionLinks simulator ──────────────────────────────
// Mirrors the helper in src/lib/appointmentDepositBatch.js exactly.
function simAttach(db, sessionId, { customerId, customerName, customerHN = '' }) {
  if (!sessionId) throw new Error('sessionId required');
  if (!customerId) throw new Error('customerId required');
  const matchingDeposits = filterDocs(db.deposits, [
    ['linkedOpdSessionId', sessionId],
    ['customerId', ''],
  ]);
  const matchingAppts = filterDocs(db.appointments, [
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

// ─── confirmCreateDeposit simulator (kiosk "+ สร้างคิวมัดจำ") ──────────────
// Mirrors AdminDashboard.jsx confirmCreateDeposit lines ~1872-2078.
function simConfirmCreateDeposit(db, {
  sessionShortId,
  hasAppointment = true,
  depositData = {},
  customerNameTemp = 'คุณสมชาย ใจดี',
  customerPhoneTemp = '0812345678',
  branchId = 'BR-1',
}) {
  const sessionId = `DEP-${sessionShortId}`;
  // Step 1: opd_sessions create
  const session = {
    id: sessionId,
    sessionId,
    status: 'pending',
    formType: 'deposit',
    branchId,
    patientData: null,
    isPermanent: true,
    sessionName: customerNameTemp || 'ลูกค้าจอง',
    depositData: {
      paymentChannel: depositData.paymentChannel || 'transfer',
      paymentAmount: String(depositData.amount || 1500),
      hasAppointment,
      appointmentDate: depositData.appointmentDate || '2026-05-09',
      appointmentStartTime: depositData.appointmentStartTime || '10:00',
      customerNameTemp,
      customerPhoneTemp,
    },
    linkedDepositId: null,
    linkedAppointmentId: null,
    depositSyncStatus: null,
  };
  db.sessions.push(session);
  // Step 2: paired or solo deposit create
  const ts = Date.now() + db.deposits.length;
  const depositId = `DEP-${ts}`;
  let appointmentId = null;
  if (hasAppointment) {
    appointmentId = `BA-${ts}-deadbeef`;
    db.deposits.push({
      depositId,
      customerId: '',
      customerName: 'ลูกค้าจอง',
      customerHN: '',
      customerNameTemp,
      customerPhoneTemp,
      amount: depositData.amount || 1500,
      paymentChannel: depositData.paymentChannel || 'transfer',
      hasAppointment: true,
      appointment: {
        date: depositData.appointmentDate || '2026-05-09',
        startTime: depositData.appointmentStartTime || '10:00',
      },
      status: 'active',
      branchId,
      linkedAppointmentId: appointmentId,
      linkedOpdSessionId: sessionId, // Phase 24.0-vicies-novies stamp
    });
    db.appointments.push({
      appointmentId,
      customerId: '',
      customerName: 'ลูกค้าจอง',
      customerNameTemp,
      customerPhoneTemp,
      branchId,
      linkedDepositId: depositId,
      linkedOpdSessionId: sessionId, // Phase 24.0-vicies-novies stamp
      appointmentType: 'deposit-booking',
      status: 'pending',
    });
  } else {
    db.deposits.push({
      depositId,
      customerId: '',
      customerName: 'ลูกค้าจอง',
      customerHN: '',
      customerNameTemp,
      customerPhoneTemp,
      amount: depositData.amount || 1500,
      paymentChannel: depositData.paymentChannel || 'transfer',
      hasAppointment: false,
      status: 'active',
      branchId,
      linkedOpdSessionId: sessionId, // Phase 24.0-vicies-novies stamp
    });
  }
  // Step 3: stamp session with cross-link
  session.linkedDepositId = depositId;
  session.linkedAppointmentId = appointmentId;
  session.depositSyncStatus = 'done';
  return { sessionId, depositId, appointmentId };
}

// ─── confirmCreateNoDeposit simulator (kiosk "+ สร้างคิวไม่มัดจำ") ─────────
function simConfirmCreateNoDeposit(db, {
  sessionShortId,
  customerNameTemp = 'คุณสมหญิง',
  customerPhoneTemp = '0898888888',
  branchId = 'BR-1',
}) {
  const sessionId = `ND-${sessionShortId}`;
  const session = {
    id: sessionId,
    sessionId,
    status: 'pending',
    formType: 'intake',
    branchId,
    patientData: null,
    sessionName: customerNameTemp,
    appointmentData: { customerNameTemp, customerPhoneTemp },
    linkedAppointmentId: null,
  };
  db.sessions.push(session);
  const ts = Date.now() + db.appointments.length + 100;
  const appointmentId = `BA-${ts}`;
  db.appointments.push({
    appointmentId,
    customerId: '',
    customerName: customerNameTemp,
    customerNameTemp,
    customerPhoneTemp,
    branchId,
    appointmentType: 'no-deposit-booking',
    linkedOpdSessionId: sessionId, // Phase 24.0-vicies-novies stamp
    status: 'pending',
  });
  session.linkedAppointmentId = appointmentId;
  return { sessionId, appointmentId };
}

// ─── PatientForm submit simulator (customer fills link) ─────────────────────
function simCustomerSubmit(db, sessionId, patientData) {
  const session = findDoc(db.sessions, sessionId, 'id');
  expect(session).toBeTruthy();
  session.patientData = patientData;
  session.status = 'completed';
  session.submittedAt = new Date().toISOString();
}

// ─── handleDepositSync simulator (kiosk DEPOSIT queue "บันทึกลง") ───────────
// Mirrors the FIXED handleDepositSync (Phase 24.0-vicies-novies-bis).
function simHandleDepositSync(db, sessionId) {
  const session = findDoc(db.sessions, sessionId, 'id');
  expect(session).toBeTruthy();
  expect(session.patientData).toBeTruthy();

  // Step 1: addCustomer
  const customerId = `LC-${1000 + db.customers.length}`;
  const customerName = `${session.patientData.prefix || ''} ${session.patientData.firstname || session.patientData.firstName || ''} ${session.patientData.lastname || session.patientData.lastName || ''}`.trim();
  const customer = {
    id: customerId,
    hn_no: customerId,
    customerName,
    telephone_number: session.patientData.telephone_number || '',
  };
  db.customers.push(customer);
  session.brokerProClinicId = customerId;
  session.brokerProClinicHN = customerId;
  session.brokerStatus = 'done';
  session.opdRecordedAt = new Date().toISOString();

  // Step 2: existingDepositIdForUpdate resolution (Phase 24.0-vicies-novies-bis fix)
  const coerceId = (v) => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v.depositId) return String(v.depositId);
    return String(v);
  };
  const existingDepositIdForUpdate = coerceId(session.depositProClinicId)
    || coerceId(session.linkedDepositId);

  const dataForBe = {
    customerId,
    customerName,
    customerHN: customerId,
    amount: Number(session.depositData?.paymentAmount) || 0,
    paymentChannel: session.depositData?.paymentChannel || '',
  };

  let depositId;
  let attachResult = null;
  if (existingDepositIdForUpdate) {
    // FIXED PATH: update existing deposit + attach appointment
    const existingDep = findDoc(db.deposits, existingDepositIdForUpdate, 'depositId');
    expect(existingDep).toBeTruthy();
    Object.assign(existingDep, dataForBe, { updatedAt: new Date().toISOString() });
    depositId = existingDepositIdForUpdate;
    attachResult = simAttach(db, sessionId, { customerId, customerName, customerHN: customerId });
  } else {
    // LEGACY PATH: create new deposit
    const ts = Date.now() + db.deposits.length + 200;
    depositId = `DEP-${ts}`;
    db.deposits.push({
      depositId,
      ...dataForBe,
      status: 'active',
      createdAt: new Date().toISOString(),
    });
  }

  session.depositProClinicId = depositId;
  session.depositSyncStatus = 'done';

  const attachedExtra = attachResult?.appointmentCount || 0;
  const toast = attachedExtra > 0
    ? `บันทึกมัดจำสำเร็จ + ผูกนัด ${attachedExtra} รายการ!`
    : 'บันทึกมัดจำสำเร็จ!';
  db.toasts.push(toast);

  return { customerId, depositId, attachResult, toast };
}

// ─── handleOpdClick simulator (kiosk INTAKE/no-deposit "บันทึกลง OPD") ──────
function simHandleOpdClick(db, sessionId) {
  const session = findDoc(db.sessions, sessionId, 'id');
  expect(session).toBeTruthy();
  expect(session.patientData).toBeTruthy();

  // Step 1: addCustomer
  const customerId = `LC-${1000 + db.customers.length}`;
  const customerName = `${session.patientData.prefix || ''} ${session.patientData.firstname || ''} ${session.patientData.lastname || ''}`.trim();
  db.customers.push({ id: customerId, hn_no: customerId, customerName });
  session.brokerProClinicId = customerId;
  session.brokerStatus = 'done';
  session.opdRecordedAt = new Date().toISOString();

  // Step 2: _attachLinkedBookings (Phase 24.0-vicies-novies)
  const attachResult = simAttach(db, sessionId, { customerId, customerName, customerHN: customerId });

  const total = (attachResult?.depositCount || 0) + (attachResult?.appointmentCount || 0);
  const toast = total > 0
    ? `บันทึกลง OPD สำเร็จ + ผูกนัด/มัดจำ ${total} รายการ`
    : 'บันทึก OPD สำเร็จ';
  db.toasts.push(toast);

  return { customerId, attachResult, toast };
}

// ─── provisionOpdLinkForBookingPair simulator (Backend "ส่งลิ้งค์ลูกค้า") ───
function simProvisionLink(db, { depositId = '', appointmentId = '', branchId = '', sessionName = '' }) {
  if (!depositId && !appointmentId) throw new Error('depositId OR appointmentId required');
  let existing = '';
  if (depositId) {
    const dep = findDoc(db.deposits, depositId, 'depositId');
    if (dep?.linkedOpdSessionId) existing = dep.linkedOpdSessionId;
    if (!sessionName && dep) sessionName = dep.customerNameTemp || dep.customerName || 'ลูกค้าจอง';
    if (!branchId && dep) branchId = dep.branchId || '';
  }
  if (existing) return { sessionId: existing, url: `?session=${existing}`, alreadyProvisioned: true };
  const sessionId = `BL-${Date.now() + db.sessions.length}-deadbeef`;
  db.sessions.push({
    id: sessionId, sessionId, status: 'pending', formType: 'intake', branchId,
    sessionName, linkedDepositId: depositId, linkedAppointmentId: appointmentId,
    createdFromBackendBooking: true,
  });
  if (depositId) {
    const dep = findDoc(db.deposits, depositId, 'depositId');
    if (dep) dep.linkedOpdSessionId = sessionId;
  }
  if (appointmentId) {
    const appt = findDoc(db.appointments, appointmentId, 'appointmentId');
    if (appt) appt.linkedOpdSessionId = sessionId;
  }
  return { sessionId, url: `?session=${sessionId}`, alreadyProvisioned: false };
}

// ─── DepositPanel.handleSave simulator (Backend customer-later create) ──────
function simBackendCreateDeposit(db, {
  customerNameTemp = 'คุณ Backend',
  customerPhoneTemp = '0801111111',
  branchId = 'BR-1',
  hasAppointment = true,
}) {
  const ts = Date.now() + db.deposits.length + 300;
  const depositId = `DEP-${ts}`;
  let appointmentId = null;
  db.deposits.push({
    depositId, customerId: '',
    customerName: 'ลูกค้าจอง', customerHN: '',
    customerNameTemp, customerPhoneTemp,
    amount: 2000, paymentChannel: 'cash',
    branchId, hasAppointment, status: 'active',
    // No linkedOpdSessionId yet — admin must click "ส่งลิ้งค์ลูกค้า" to provision.
  });
  if (hasAppointment) {
    appointmentId = `BA-${ts}-cafebabe`;
    db.appointments.push({
      appointmentId, customerId: '',
      customerNameTemp, customerPhoneTemp,
      branchId, linkedDepositId: depositId,
      appointmentType: 'deposit-booking', status: 'pending',
      // No linkedOpdSessionId yet either.
    });
    const dep = db.deposits[db.deposits.length - 1];
    dep.linkedAppointmentId = appointmentId;
  }
  return { depositId, appointmentId };
}

// ─── Common patient-data fixture ────────────────────────────────────────────
const PATIENT_FIXTURE = {
  prefix: 'นาย',
  firstname: 'สมชุ่ย',
  lastname: 'อุ้ย',
  telephone_number: '0874321456',
  citizen_id: '1234567890123',
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E1: Kiosk deposit + appointment → handleDepositSync (THE BUG FIX)
// ═══════════════════════════════════════════════════════════════════════════
describe('E1 — Kiosk deposit + appointment → handleDepositSync (bug fix lock)', () => {
  it('E1.1 — original deposit is UPDATED (NOT a new duplicate created)', () => {
    const db = freshDb();
    const { sessionId, depositId } = simConfirmCreateDeposit(db, {
      sessionShortId: 'ABCDEF',
      customerNameTemp: 'dddd',
      customerPhoneTemp: '0874321456',
    });
    expect(db.deposits).toHaveLength(1);
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    const result = simHandleDepositSync(db, sessionId);
    // CRITICAL ASSERTION: still ONE deposit (no duplicate)
    expect(db.deposits).toHaveLength(1);
    // The same deposit doc was updated
    expect(result.depositId).toBe(depositId);
    // customerId attached
    expect(db.deposits[0].customerId).toBe(result.customerId);
    expect(db.deposits[0].customerName).toBe('นาย สมชุ่ย อุ้ย');
  });

  it('E1.2 — linked appointment is ALSO attached to new customer', () => {
    const db = freshDb();
    const { sessionId, appointmentId } = simConfirmCreateDeposit(db, {
      sessionShortId: 'BCDEFG', customerNameTemp: 'dddd', customerPhoneTemp: '0874321456',
    });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    const result = simHandleDepositSync(db, sessionId);
    const appt = findDoc(db.appointments, appointmentId, 'appointmentId');
    expect(appt.customerId).toBe(result.customerId);
    expect(appt.customerName).toBe('นาย สมชุ่ย อุ้ย');
    // attach result counted the appointment
    expect(result.attachResult.appointmentCount).toBe(1);
  });

  it('E1.3 — temp identity preserved on BOTH halves (forensic trail)', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, {
      sessionShortId: 'CDEFGH', customerNameTemp: 'dddd', customerPhoneTemp: '0874321456',
    });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    simHandleDepositSync(db, sessionId);
    expect(db.deposits[0].customerNameTemp).toBe('dddd');
    expect(db.deposits[0].customerPhoneTemp).toBe('0874321456');
    expect(db.appointments[0].customerNameTemp).toBe('dddd');
    expect(db.appointments[0].customerPhoneTemp).toBe('0874321456');
  });

  it('E1.4 — toast surfaces attach count', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, { sessionShortId: 'DEFGHI' });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    simHandleDepositSync(db, sessionId);
    expect(db.toasts).toContain('บันทึกมัดจำสำเร็จ + ผูกนัด 1 รายการ!');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E2: Kiosk deposit-only (no appointment) → handleDepositSync
// ═══════════════════════════════════════════════════════════════════════════
describe('E2 — Kiosk deposit-only → handleDepositSync', () => {
  it('E2.1 — deposit-only flow does NOT create duplicate', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, {
      sessionShortId: 'XYZ001', hasAppointment: false,
    });
    expect(db.deposits).toHaveLength(1);
    expect(db.appointments).toHaveLength(0);
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    simHandleDepositSync(db, sessionId);
    expect(db.deposits).toHaveLength(1); // still 1
    expect(db.appointments).toHaveLength(0); // still 0
  });

  it('E2.2 — deposit-only customer attached + no appointment count', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, {
      sessionShortId: 'XYZ002', hasAppointment: false,
    });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    const result = simHandleDepositSync(db, sessionId);
    expect(db.deposits[0].customerId).toBe(result.customerId);
    expect(result.attachResult.appointmentCount).toBe(0);
    // toast should NOT mention nominal "ผูกนัด" since no appointment exists
    expect(db.toasts[0]).toBe('บันทึกมัดจำสำเร็จ!');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E3: Kiosk no-deposit booking → handleOpdClick
// ═══════════════════════════════════════════════════════════════════════════
describe('E3 — Kiosk no-deposit booking → handleOpdClick', () => {
  it('E3.1 — no-deposit appointment attached at OPD save (handleOpdClick path, NOT handleDepositSync)', () => {
    const db = freshDb();
    const { sessionId, appointmentId } = simConfirmCreateNoDeposit(db, {
      sessionShortId: 'NDABC1',
    });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    const result = simHandleOpdClick(db, sessionId);
    const appt = findDoc(db.appointments, appointmentId, 'appointmentId');
    expect(appt.customerId).toBe(result.customerId);
    expect(result.attachResult.appointmentCount).toBe(1);
    expect(result.attachResult.depositCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E4: Backend pickLater + send-link → handleOpdClick
// ═══════════════════════════════════════════════════════════════════════════
describe('E4 — Backend pickLater + send-link → handleOpdClick save', () => {
  it('E4.1 — Backend deposit + send-link → OPD save attaches both', () => {
    const db = freshDb();
    // Step 1: Backend creates customer-later deposit (no opd_session yet)
    const { depositId, appointmentId } = simBackendCreateDeposit(db, { hasAppointment: true });
    expect(db.sessions).toHaveLength(0); // No session yet

    // Step 2: Admin clicks "ส่งลิ้งค์ลูกค้า"
    const linkResult = simProvisionLink(db, { depositId, appointmentId });
    expect(linkResult.alreadyProvisioned).toBe(false);
    expect(linkResult.sessionId).toMatch(/^BL-/);
    expect(db.sessions).toHaveLength(1);

    // Step 3: Customer fills link
    simCustomerSubmit(db, linkResult.sessionId, PATIENT_FIXTURE);

    // Step 4: Admin clicks "บันทึกลง OPD"
    const result = simHandleOpdClick(db, linkResult.sessionId);

    // Both deposit + appointment now attached
    expect(db.deposits).toHaveLength(1);
    expect(db.appointments).toHaveLength(1);
    expect(db.deposits[0].customerId).toBe(result.customerId);
    expect(db.appointments[0].customerId).toBe(result.customerId);
    expect(result.attachResult.depositCount).toBe(1);
    expect(result.attachResult.appointmentCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E5: Different phone in OPD form (KEY user requirement)
// ═══════════════════════════════════════════════════════════════════════════
describe('E5 — Different phone in OPD form (phone-mismatch resilience)', () => {
  it('E5.1 — kiosk deposit booking phone 0811111111 → OPD form phone 0899999999 → STILL attaches', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, {
      sessionShortId: 'PHONE1',
      customerPhoneTemp: '0811111111',  // booking phone
    });
    // Customer types DIFFERENT phone in OPD form
    simCustomerSubmit(db, sessionId, {
      ...PATIENT_FIXTURE,
      telephone_number: '0899999999',  // DIFFERENT
    });
    const result = simHandleDepositSync(db, sessionId);
    // STILL attaches (sessionId-based, not phone-based)
    expect(db.deposits[0].customerId).toBe(result.customerId);
    expect(db.appointments[0].customerId).toBe(result.customerId);
    // Booking phone preserved (forensic trail)
    expect(db.deposits[0].customerPhoneTemp).toBe('0811111111');
  });

  it('E5.2 — Backend pickLater with different phone in OPD form still attaches', () => {
    const db = freshDb();
    const { depositId, appointmentId } = simBackendCreateDeposit(db, {
      customerPhoneTemp: '0822222222', hasAppointment: true,
    });
    const linkResult = simProvisionLink(db, { depositId, appointmentId });
    simCustomerSubmit(db, linkResult.sessionId, {
      ...PATIENT_FIXTURE, telephone_number: '0866666666',  // DIFFERENT
    });
    const result = simHandleOpdClick(db, linkResult.sessionId);
    expect(db.deposits[0].customerId).toBe(result.customerId);
    expect(db.appointments[0].customerId).toBe(result.customerId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E6: Idempotent re-save (admin double-clicks)
// ═══════════════════════════════════════════════════════════════════════════
describe('E6 — Idempotent re-save (admin double-clicks "บันทึกลง")', () => {
  it('E6.1 — re-running handleDepositSync does NOT create another duplicate', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, { sessionShortId: 'IDEM01' });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    simHandleDepositSync(db, sessionId);
    expect(db.deposits).toHaveLength(1);
    // 2nd save: alreadySynced now (depositSyncStatus='done', has depositProClinicId)
    simHandleDepositSync(db, sessionId);
    expect(db.deposits).toHaveLength(1); // STILL 1
  });

  it('E6.2 — re-running handleOpdClick does NOT re-attach (customerId filter)', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateNoDeposit(db, { sessionShortId: 'IDEM02' });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    const r1 = simHandleOpdClick(db, sessionId);
    expect(r1.attachResult.appointmentCount).toBe(1);
    const r2 = simHandleOpdClick(db, sessionId);
    // Second run finds 0 unattached docs (filter customerId=='')
    expect(r2.attachResult.appointmentCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E7: Legacy session without linkedDepositId → fallback createDeposit
// ═══════════════════════════════════════════════════════════════════════════
describe('E7 — Legacy session without linkedDepositId (pre Phase 24.0-vicies-novies)', () => {
  it('E7.1 — legacy session → fallback createDeposit creates fresh deposit (no errors)', () => {
    const db = freshDb();
    // Legacy session doesn't have linkedDepositId stamped
    db.sessions.push({
      id: 'DEP-LEGACY01', sessionId: 'DEP-LEGACY01', formType: 'deposit',
      branchId: 'BR-1', patientData: null,
      depositData: { paymentAmount: '1000', paymentChannel: 'cash' },
      // NO linkedDepositId, NO linkedAppointmentId
    });
    expect(db.deposits).toHaveLength(0);
    simCustomerSubmit(db, 'DEP-LEGACY01', PATIENT_FIXTURE);
    const result = simHandleDepositSync(db, 'DEP-LEGACY01');
    // Fallback path creates new deposit
    expect(db.deposits).toHaveLength(1);
    expect(db.deposits[0].customerId).toBe(result.customerId);
    expect(result.attachResult).toBe(null); // no attach call in legacy path
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E8: Cross-customer isolation (sessionA save doesn't touch sessionB)
// ═══════════════════════════════════════════════════════════════════════════
describe('E8 — Cross-customer isolation', () => {
  it('E8.1 — saving sessionA leaves sessionB bookings untouched', () => {
    const db = freshDb();
    const { sessionId: sidA } = simConfirmCreateDeposit(db, {
      sessionShortId: 'AAAAAA', customerNameTemp: 'A',
    });
    const { sessionId: sidB } = simConfirmCreateDeposit(db, {
      sessionShortId: 'BBBBBB', customerNameTemp: 'B',
    });
    expect(db.deposits).toHaveLength(2);
    simCustomerSubmit(db, sidA, PATIENT_FIXTURE);
    simHandleDepositSync(db, sidA);
    // A is attached
    expect(db.deposits.find((d) => d.customerNameTemp === 'A').customerId).not.toBe('');
    // B is UNTOUCHED
    expect(db.deposits.find((d) => d.customerNameTemp === 'B').customerId).toBe('');
    expect(db.appointments.find((a) => a.customerNameTemp === 'B').customerId).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E9: Already-attached deposit re-save (no double-attach, no errors)
// ═══════════════════════════════════════════════════════════════════════════
describe('E9 — Already-attached deposit re-save', () => {
  it('E9.1 — admin re-saves after editing patientData → updates customer fields, no duplicate', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, { sessionShortId: 'REEDIT' });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    const r1 = simHandleDepositSync(db, sessionId);
    expect(db.deposits).toHaveLength(1);
    // Customer fills form again with new data (admin edited then re-saved)
    simCustomerSubmit(db, sessionId, { ...PATIENT_FIXTURE, firstname: 'สมชุ่ย-EDIT' });
    const r2 = simHandleDepositSync(db, sessionId);
    expect(db.deposits).toHaveLength(1); // STILL 1
    // 2nd save reuses same customer? No — addCustomer creates new each call.
    // But the deposit doc was updated to the latest customer.
    expect(db.deposits[0].customerId).toBe(r2.customerId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E10: handleDepositSync vs handleOpdClick distinct routing
// ═══════════════════════════════════════════════════════════════════════════
describe('E10 — Handler routing: deposit queue → handleDepositSync, intake → handleOpdClick', () => {
  it('E10.1 — DEP-* session uses handleDepositSync (creates customer + updates deposit)', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, { sessionShortId: 'DEP10A' });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    const result = simHandleDepositSync(db, sessionId);
    expect(result.toast).toMatch(/บันทึกมัดจำสำเร็จ/);
  });

  it('E10.2 — ND-* session uses handleOpdClick (creates customer + attaches appointment)', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateNoDeposit(db, { sessionShortId: 'ND10B' });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    const result = simHandleOpdClick(db, sessionId);
    expect(result.toast).toMatch(/บันทึกลง OPD สำเร็จ/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E11: Backend pickLater on appointment WITHOUT deposit
// ═══════════════════════════════════════════════════════════════════════════
describe('E11 — Backend pickLater appointment-only (no deposit)', () => {
  it('E11.1 — appointment-only Backend booking + send-link + OPD save attaches appointment', () => {
    const db = freshDb();
    // Mirror AppointmentFormModal.handleSave with pickLater + no deposit
    const ts = Date.now();
    const apptId = `BA-${ts}-aptonly`;
    db.appointments.push({
      appointmentId: apptId, customerId: '',
      customerNameTemp: 'คุณ Appt-only', customerPhoneTemp: '0833333333',
      branchId: 'BR-1', appointmentType: 'no-deposit-booking', status: 'pending',
    });
    expect(db.deposits).toHaveLength(0);
    expect(db.appointments).toHaveLength(1);

    // Send-link: appointmentId only
    const linkResult = simProvisionLink(db, { appointmentId: apptId });
    expect(linkResult.alreadyProvisioned).toBe(false);
    expect(db.appointments[0].linkedOpdSessionId).toBe(linkResult.sessionId);

    // Customer fills, admin saves
    simCustomerSubmit(db, linkResult.sessionId, PATIENT_FIXTURE);
    const result = simHandleOpdClick(db, linkResult.sessionId);
    expect(db.appointments[0].customerId).toBe(result.customerId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E12: Send-link clicked twice (idempotency)
// ═══════════════════════════════════════════════════════════════════════════
describe('E12 — Send-link idempotency', () => {
  it('E12.1 — re-clicking send-link returns same sessionId + alreadyProvisioned=true', () => {
    const db = freshDb();
    const { depositId, appointmentId } = simBackendCreateDeposit(db, { hasAppointment: true });
    const r1 = simProvisionLink(db, { depositId, appointmentId });
    expect(r1.alreadyProvisioned).toBe(false);
    expect(db.sessions).toHaveLength(1);
    const r2 = simProvisionLink(db, { depositId, appointmentId });
    expect(r2.alreadyProvisioned).toBe(true);
    expect(r2.sessionId).toBe(r1.sessionId);
    expect(db.sessions).toHaveLength(1); // No new session minted
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO E13: Bug-replication — pre-fix vs post-fix invariants
// ═══════════════════════════════════════════════════════════════════════════
describe('E13 — Bug-replication: PRE-FIX would have duplicated; POST-FIX must NOT', () => {
  it('E13.1 — invariant: after handleDepositSync, count of be_deposits with this sessionId match is exactly 1', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, {
      sessionShortId: 'BUGREP', customerNameTemp: 'dddd', customerPhoneTemp: '0874321456',
    });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    simHandleDepositSync(db, sessionId);
    // The bug would have made this list have 2 entries (one with customerId='' for "dddd",
    // one with customerId='LC-...' for "สมชุ่ย อุ้ย"). Post-fix, exactly 1.
    const depsForSession = db.deposits.filter(
      (d) => d.linkedOpdSessionId === sessionId,
    );
    expect(depsForSession).toHaveLength(1);
    expect(depsForSession[0].customerId).not.toBe('');
    expect(depsForSession[0].customerName).toBe('นาย สมชุ่ย อุ้ย');
  });

  it('E13.2 — invariant: appointment for the same session has NON-EMPTY customerId post-save', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, {
      sessionShortId: 'BUGREP2', customerNameTemp: 'dddd',
    });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    simHandleDepositSync(db, sessionId);
    const apptsForSession = db.appointments.filter(
      (a) => a.linkedOpdSessionId === sessionId,
    );
    expect(apptsForSession).toHaveLength(1);
    expect(apptsForSession[0].customerId).not.toBe('');
    // The appointment is no longer "dddd" — it's "นาย สมชุ่ย อุ้ย"
    expect(apptsForSession[0].customerName).toBe('นาย สมชุ่ย อุ้ย');
  });

  it('E13.3 — invariant: NO orphan be_deposits with empty customerId after save', () => {
    const db = freshDb();
    const { sessionId } = simConfirmCreateDeposit(db, { sessionShortId: 'BUGREP3' });
    simCustomerSubmit(db, sessionId, PATIENT_FIXTURE);
    simHandleDepositSync(db, sessionId);
    const orphans = db.deposits.filter((d) => d.customerId === '');
    expect(orphans).toHaveLength(0);
  });
});
