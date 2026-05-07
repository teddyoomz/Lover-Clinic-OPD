// V50 Phase 4 LIVE admin-SDK e2e — kiosk → OPD-save auto-link cascade chaos.
//
// Verifies on REAL prod Firestore the FULL kiosk → backend booking → OPD save
// → auto-link cascade across the user-listed scenarios:
//
//   1. No-deposit kiosk with name+phone only → real be_appointments doc visible
//      in branch grid (filtered by branchId)
//   2. Delete kiosk session BEFORE OPD save → cascade-delete linked appointment
//   3. Patient submits OPD form → admin clicks "บันทึกลง OPD" → addCustomer +
//      attachCustomerToOpdSessionLinks → appointment auto-attaches to new
//      customerId
//   4. Same flow for deposit-booking → BOTH be_deposits + be_appointments
//      auto-attach atomically (writeBatch all-or-none)
//   5. Branch correctness: customer-at-A, kiosk-at-A → all docs at A
//   6. Chaos: delete appointment mid-flow → attach skips gracefully
//      (depositCount=1, appointmentCount=0)
//   7. Chaos: delete deposit mid-flow → attach hits remaining appointment
//   8. Duplicate name+phone across 2 sessions → independent attachments
//   9. Idempotency: re-running attach is no-op (where-clause filters attached)
//   10. Branch-switch chaos: kiosk@A + customer@B (admin switched) → cross-
//       branch state captured (sharp edge documented)
//
// USAGE:
//   node scripts/e2e-v50-phase4-kiosk-opd-cascade.mjs            # dry-run
//   node scripts/e2e-v50-phase4-kiosk-opd-cascade.mjs --apply    # write+verify+cleanup
//
// Run from project root after `vercel env pull .env.local.prod`.
//
// Test-prefix discipline (V33.10/13/14): every fixture id begins with
// TEST-V50P4- so cleanup is deterministic.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Setup ─────────────────────────────────────────────────────────────────

function loadEnv() {
  return readFileSync('.env.local.prod', 'utf8').split('\n').reduce((acc, l) => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    return acc;
  }, {});
}

const APPLY = process.argv.includes('--apply');
const env = loadEnv();
const APP_ID = 'loverclinic-opd-4c39b';
const base = `artifacts/${APP_ID}/public/data`;

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.split('\\n').join('\n'),
  }),
});
const db = getFirestore();

// ─── Test-prefix helpers ──────────────────────────────────────────────────

const ts = Date.now();
const sessionTag = randomBytes(4).toString('hex');

function makeId(kind, suffix) {
  return `TEST-V50P4-${kind}-${ts}-${sessionTag}-${suffix}`;
}

const created = {
  customers: new Set(),
  appointments: new Set(),
  deposits: new Set(),
  opdSessions: new Set(),
};

function track(kind, id) {
  if (kind === 'customer') created.customers.add(id);
  else if (kind === 'appointment') created.appointments.add(id);
  else if (kind === 'deposit') created.deposits.add(id);
  else if (kind === 'opdSession') created.opdSessions.add(id);
}

// ─── Phase scaffolding ─────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}  ${detail}`);
    fail++;
  }
}

// ─── Mirror of attachCustomerToOpdSessionLinks (admin SDK) ────────────────
// Real helper uses Firebase client SDK; we mirror the LOGIC against admin
// SDK so the contract is exercised on real prod docs. Same WHERE clause
// semantics, same writeBatch all-or-none, same forensic-trail field shape.

async function adminAttachCustomerToOpdSessionLinks(sessionId, { customerId, customerName, customerHN = '' }) {
  if (!sessionId) throw new Error('attachCustomerToOpdSessionLinks: sessionId required');
  if (!customerId) throw new Error('attachCustomerToOpdSessionLinks: customerId required');

  const depQ = db.collection(`${base}/be_deposits`)
    .where('linkedOpdSessionId', '==', String(sessionId))
    .where('customerId', '==', '');
  const apptQ = db.collection(`${base}/be_appointments`)
    .where('linkedOpdSessionId', '==', String(sessionId))
    .where('customerId', '==', '');

  const [depSnap, apptSnap] = await Promise.all([depQ.get(), apptQ.get()]);
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
  if (depSnap.size === 0 && apptSnap.size === 0) {
    return { sessionId, depositCount: 0, appointmentCount: 0, depositIds, appointmentIds };
  }
  const batch = db.batch();
  depSnap.forEach((d) => {
    batch.update(d.ref, customerFields);
    depositIds.push(d.id);
  });
  apptSnap.forEach((d) => {
    batch.update(d.ref, customerFields);
    appointmentIds.push(d.id);
  });
  await batch.commit();
  return { sessionId, depositCount: depSnap.size, appointmentCount: apptSnap.size, depositIds, appointmentIds };
}

// ─── Booking write helpers (mirror of createDepositBookingPair / no-deposit) ─

async function writeKioskNoDepositBooking({ branchId, customerNameTemp, customerPhoneTemp, suffix }) {
  const sessionId = makeId('NDSESS', suffix);
  const apptId = makeId('NDAPPT', suffix);
  const apptPayload = {
    appointmentId: apptId,
    customerId: '',
    customerName: customerNameTemp || 'ลูกค้าจอง',
    customerNameTemp,
    customerPhoneTemp,
    date: '2026-12-31',
    startTime: '09:00',
    endTime: '09:30',
    appointmentType: 'no-deposit-booking',
    branchId,
    linkedOpdSessionId: sessionId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  if (APPLY) {
    const sessionPayload = {
      status: 'pending',
      formType: 'no-deposit',
      branchId,
      isPermanent: true,
      sessionName: customerNameTemp || 'ลูกค้าจอง',
    };
    await db.collection(`${base}/opd_sessions`).doc(sessionId).set(sessionPayload);
    await db.collection(`${base}/be_appointments`).doc(apptId).set(apptPayload);
    track('opdSession', sessionId);
    track('appointment', apptId);
  }
  return { sessionId, apptId };
}

async function writeKioskDepositBookingPair({ branchId, customerNameTemp, customerPhoneTemp, amount = 1000, suffix }) {
  const sessionId = makeId('DEPSESS', suffix);
  const apptId = makeId('DEPAPPT', suffix);
  const depositId = makeId('DEPDOC', suffix);
  const now = new Date().toISOString();
  const apptPayload = {
    appointmentId: apptId,
    customerId: '',
    customerName: customerNameTemp || 'ลูกค้าจอง',
    customerNameTemp,
    customerPhoneTemp,
    date: '2026-12-31',
    startTime: '10:00',
    endTime: '10:30',
    appointmentType: 'deposit-booking',
    branchId,
    linkedOpdSessionId: sessionId,
    linkedDepositId: depositId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  const depositPayload = {
    depositId,
    customerId: '',
    customerName: customerNameTemp || 'ลูกค้าจอง',
    customerNameTemp,
    customerPhoneTemp,
    amount,
    usedAmount: 0,
    remainingAmount: amount,
    paymentChannel: 'cash',
    hasAppointment: true,
    appointment: apptPayload,
    branchId,
    linkedOpdSessionId: sessionId,
    linkedAppointmentId: apptId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  if (APPLY) {
    const sessionPayload = {
      status: 'pending',
      formType: 'deposit',
      branchId,
      isPermanent: true,
      sessionName: customerNameTemp || 'ลูกค้าจอง',
    };
    await db.collection(`${base}/opd_sessions`).doc(sessionId).set(sessionPayload);
    const batch = db.batch();
    batch.set(db.collection(`${base}/be_appointments`).doc(apptId), apptPayload);
    batch.set(db.collection(`${base}/be_deposits`).doc(depositId), depositPayload);
    await batch.commit();
    track('opdSession', sessionId);
    track('appointment', apptId);
    track('deposit', depositId);
  }
  return { sessionId, apptId, depositId };
}

async function writeCustomer({ branchId, firstname, lastname, suffix }) {
  const customerId = makeId('CUST', suffix);
  const payload = {
    hn_no: customerId,
    firstname,
    lastname,
    patientData: { firstName: firstname, lastName: lastname },
    branchId,
    createdAt: new Date().toISOString(),
    isManualEntry: true,
    courses: [],
    appointments: [],
    treatmentSummary: [],
    treatmentCount: 0,
  };
  if (APPLY) {
    await db.collection(`${base}/be_customers`).doc(customerId).set(payload);
    track('customer', customerId);
  }
  return { customerId, payload };
}

async function deleteKioskSessionCascade(sessionId) {
  if (!APPLY) return { session: false, appointments: 0, deposits: 0 };
  // Delete linked appointment(s) + deposit(s) by linkedOpdSessionId
  let apptCount = 0, depCount = 0;
  const apptSnap = await db.collection(`${base}/be_appointments`)
    .where('linkedOpdSessionId', '==', String(sessionId)).get();
  const depSnap = await db.collection(`${base}/be_deposits`)
    .where('linkedOpdSessionId', '==', String(sessionId)).get();
  const batch = db.batch();
  apptSnap.forEach((d) => { batch.delete(d.ref); apptCount++; created.appointments.delete(d.id); });
  depSnap.forEach((d) => { batch.delete(d.ref); depCount++; created.deposits.delete(d.id); });
  // Delete the session itself
  batch.delete(db.collection(`${base}/opd_sessions`).doc(sessionId));
  await batch.commit();
  created.opdSessions.delete(sessionId);
  return { session: true, appointments: apptCount, deposits: depCount };
}

// ─── Phase 0 — discover branches ───────────────────────────────────────────

async function phase0_discoverBranches() {
  console.log('\n=== Phase 0: discover branches ===');
  const snap = await db.collection(`${base}/be_branches`).get();
  const branches = [];
  snap.forEach((d) => {
    const data = d.data();
    branches.push({ id: d.id, name: data.name || data.displayName || d.id });
  });
  console.log(`Found ${branches.length} branches:`);
  branches.forEach((b) => console.log(`  - ${b.id}  (${b.name})`));
  return branches.slice(0, 3);
}

// ─── Scenarios ─────────────────────────────────────────────────────────────

async function scenarioA_NoDepositGridVisibility(branches) {
  console.log('\n=== Scenario A: no-deposit kiosk → grid visibility ===');
  const branch = branches[0];
  const { sessionId, apptId } = await writeKioskNoDepositBooking({
    branchId: branch.id,
    customerNameTemp: 'TEST V50P4 no-dep grid',
    customerPhoneTemp: '0800000001',
    suffix: 'A',
  });
  if (APPLY) {
    const apptDoc = await db.collection(`${base}/be_appointments`).doc(apptId).get();
    check(`A.1 No-deposit appt doc exists in be_appointments`, apptDoc.exists);
    if (apptDoc.exists) {
      const data = apptDoc.data();
      check(`A.2 branchId stamped == ${branch.id.slice(0, 14)}`, data.branchId === branch.id);
      check(`A.3 customerNameTemp preserved`, data.customerNameTemp === 'TEST V50P4 no-dep grid');
      check(`A.4 customerPhoneTemp preserved`, data.customerPhoneTemp === '0800000001');
      check(`A.5 customerId === '' (no customer yet)`, data.customerId === '');
      check(`A.6 linkedOpdSessionId === sessionId`, data.linkedOpdSessionId === sessionId);
      check(`A.7 appointmentType === 'no-deposit-booking'`, data.appointmentType === 'no-deposit-booking');
    }
    // Branch grid filter — ONLY this branch sees the appointment
    const branchSnap = await db.collection(`${base}/be_appointments`)
      .where('branchId', '==', branch.id)
      .where('appointmentType', '==', 'no-deposit-booking')
      .where('linkedOpdSessionId', '==', sessionId)
      .get();
    check(`A.8 Branch grid filter returns this booking`, branchSnap.size === 1);
  }
  return { sessionId, apptId, branch };
}

async function scenarioB_DeleteKioskCascade(branches) {
  console.log('\n=== Scenario B: delete kiosk session BEFORE OPD save → cascade-delete ===');
  const branch = branches[0];
  const { sessionId, apptId } = await writeKioskNoDepositBooking({
    branchId: branch.id,
    customerNameTemp: 'TEST V50P4 cascade-del',
    customerPhoneTemp: '0800000002',
    suffix: 'B',
  });
  if (APPLY) {
    // Verify it exists first
    const before = await db.collection(`${base}/be_appointments`).doc(apptId).get();
    check(`B.1 Pre-delete: appt exists`, before.exists);
    const result = await deleteKioskSessionCascade(sessionId);
    check(`B.2 Cascade deleted session`, result.session === true);
    check(`B.3 Cascade deleted ${result.appointments} appointment(s)`, result.appointments === 1);
    const after = await db.collection(`${base}/be_appointments`).doc(apptId).get();
    check(`B.4 Post-delete: appt gone`, !after.exists);
  }
}

async function scenarioC_OpdSaveAutoLink(branches) {
  console.log('\n=== Scenario C: OPD save → auto-link cascade (no-deposit) ===');
  const branch = branches[0];
  const { sessionId, apptId } = await writeKioskNoDepositBooking({
    branchId: branch.id,
    customerNameTemp: 'TEST V50P4 opd-link',
    customerPhoneTemp: '0800000003',
    suffix: 'C',
  });
  if (APPLY) {
    const { customerId } = await writeCustomer({
      branchId: branch.id,
      firstname: 'TEST V50P4',
      lastname: 'OPD-LINK',
      suffix: 'C',
    });
    const result = await adminAttachCustomerToOpdSessionLinks(sessionId, {
      customerId,
      customerName: 'TEST V50P4 OPD-LINK',
      customerHN: customerId,
    });
    check(`C.1 Attach result.appointmentCount === 1`, result.appointmentCount === 1);
    check(`C.2 Attach result.depositCount === 0`, result.depositCount === 0);
    const apptDoc = await db.collection(`${base}/be_appointments`).doc(apptId).get();
    if (apptDoc.exists) {
      const data = apptDoc.data();
      check(`C.3 Post-attach customerId === ${customerId.slice(-12)}`, data.customerId === customerId);
      check(`C.4 Post-attach customerName === 'TEST V50P4 OPD-LINK'`, data.customerName === 'TEST V50P4 OPD-LINK');
      check(`C.5 Post-attach customerLinkedFrom === 'opd-save-auto'`, data.customerLinkedFrom === 'opd-save-auto');
      check(`C.6 Forensic trail: customerNameTemp preserved`, data.customerNameTemp === 'TEST V50P4 opd-link');
      check(`C.7 Forensic trail: customerPhoneTemp preserved`, data.customerPhoneTemp === '0800000003');
      check(`C.8 branchId UNCHANGED post-attach`, data.branchId === branch.id);
    }
  }
}

async function scenarioD_DepositPairAutoLink(branches) {
  console.log('\n=== Scenario D: deposit-booking OPD save → BOTH halves auto-link ===');
  const branch = branches[0];
  const { sessionId, apptId, depositId } = await writeKioskDepositBookingPair({
    branchId: branch.id,
    customerNameTemp: 'TEST V50P4 dep-pair',
    customerPhoneTemp: '0800000004',
    amount: 2000,
    suffix: 'D',
  });
  if (APPLY) {
    // Pre-attach: deposit visible in finance for that branch
    const finSnap = await db.collection(`${base}/be_deposits`)
      .where('branchId', '==', branch.id)
      .where('linkedOpdSessionId', '==', sessionId).get();
    check(`D.1 Pre-attach: deposit visible in Finance.มัดจำ filter (1 doc)`, finSnap.size === 1);

    const { customerId } = await writeCustomer({
      branchId: branch.id,
      firstname: 'TEST V50P4',
      lastname: 'DEP-PAIR',
      suffix: 'D',
    });
    const result = await adminAttachCustomerToOpdSessionLinks(sessionId, {
      customerId,
      customerName: 'TEST V50P4 DEP-PAIR',
      customerHN: customerId,
    });
    check(`D.2 Attach result.appointmentCount === 1`, result.appointmentCount === 1);
    check(`D.3 Attach result.depositCount === 1`, result.depositCount === 1);

    // Verify BOTH halves linked
    const apptDoc = await db.collection(`${base}/be_appointments`).doc(apptId).get();
    const depDoc = await db.collection(`${base}/be_deposits`).doc(depositId).get();
    check(`D.4 Appt customerId linked`, apptDoc.exists && apptDoc.data().customerId === customerId);
    check(`D.5 Deposit customerId linked`, depDoc.exists && depDoc.data().customerId === customerId);
    // Branch correctness across 3 docs
    check(`D.6 Customer.branchId === branch`, (await db.collection(`${base}/be_customers`).doc(customerId).get()).data().branchId === branch.id);
    check(`D.7 Appt.branchId === branch (immutable)`, apptDoc.data().branchId === branch.id);
    check(`D.8 Deposit.branchId === branch (immutable)`, depDoc.data().branchId === branch.id);
  }
}

async function scenarioE_BranchMatrix(branches) {
  console.log('\n=== Scenario E: 3-branch matrix — every branch isolated ===');
  if (branches.length < 3) {
    console.log('  SKIP: < 3 branches available');
    return;
  }
  for (let i = 0; i < 3; i++) {
    const branch = branches[i];
    const { sessionId, apptId } = await writeKioskNoDepositBooking({
      branchId: branch.id,
      customerNameTemp: `TEST V50P4 matrix-${i}`,
      customerPhoneTemp: `080000010${i}`,
      suffix: `E${i}`,
    });
    if (APPLY) {
      const { customerId } = await writeCustomer({
        branchId: branch.id,
        firstname: `TEST V50P4 matrix-${i}`,
        lastname: 'X',
        suffix: `E${i}`,
      });
      await adminAttachCustomerToOpdSessionLinks(sessionId, {
        customerId,
        customerName: `TEST V50P4 matrix-${i} X`,
        customerHN: customerId,
      });
      const apptDoc = await db.collection(`${base}/be_appointments`).doc(apptId).get();
      check(`E.${i + 1} Branch ${branch.id.slice(0, 14)}: customer linked + branchId immutable`,
        apptDoc.exists
        && apptDoc.data().customerId === customerId
        && apptDoc.data().branchId === branch.id,
      );
    }
  }
}

async function scenarioF_DeleteApptMidFlow(branches) {
  console.log('\n=== Scenario F: chaos — delete appt BEFORE OPD save (deposit-pair only attaches deposit) ===');
  const branch = branches[0];
  const { sessionId, apptId, depositId } = await writeKioskDepositBookingPair({
    branchId: branch.id,
    customerNameTemp: 'TEST V50P4 chaos-F',
    customerPhoneTemp: '0800000005',
    suffix: 'F',
  });
  if (APPLY) {
    // Admin manually deletes the appt mid-flow (chaos)
    await db.collection(`${base}/be_appointments`).doc(apptId).delete();
    created.appointments.delete(apptId);

    const { customerId } = await writeCustomer({
      branchId: branch.id,
      firstname: 'TEST V50P4',
      lastname: 'CHAOS-F',
      suffix: 'F',
    });
    const result = await adminAttachCustomerToOpdSessionLinks(sessionId, {
      customerId,
      customerName: 'TEST V50P4 CHAOS-F',
      customerHN: customerId,
    });
    check(`F.1 appointmentCount === 0 (already deleted)`, result.appointmentCount === 0);
    check(`F.2 depositCount === 1 (deposit still there)`, result.depositCount === 1);
    const depDoc = await db.collection(`${base}/be_deposits`).doc(depositId).get();
    check(`F.3 Deposit linked despite missing appt`, depDoc.exists && depDoc.data().customerId === customerId);
  }
}

async function scenarioG_DeleteDepositMidFlow(branches) {
  console.log('\n=== Scenario G: chaos — delete deposit BEFORE OPD save (only appt links) ===');
  const branch = branches[0];
  const { sessionId, apptId, depositId } = await writeKioskDepositBookingPair({
    branchId: branch.id,
    customerNameTemp: 'TEST V50P4 chaos-G',
    customerPhoneTemp: '0800000006',
    suffix: 'G',
  });
  if (APPLY) {
    await db.collection(`${base}/be_deposits`).doc(depositId).delete();
    created.deposits.delete(depositId);

    const { customerId } = await writeCustomer({
      branchId: branch.id,
      firstname: 'TEST V50P4',
      lastname: 'CHAOS-G',
      suffix: 'G',
    });
    const result = await adminAttachCustomerToOpdSessionLinks(sessionId, {
      customerId,
      customerName: 'TEST V50P4 CHAOS-G',
      customerHN: customerId,
    });
    check(`G.1 appointmentCount === 1`, result.appointmentCount === 1);
    check(`G.2 depositCount === 0 (already deleted)`, result.depositCount === 0);
    const apptDoc = await db.collection(`${base}/be_appointments`).doc(apptId).get();
    check(`G.3 Appt linked despite missing deposit`, apptDoc.exists && apptDoc.data().customerId === customerId);
  }
}

async function scenarioH_DuplicateNamePhone(branches) {
  console.log('\n=== Scenario H: duplicate name+phone across 2 sessions → independent attachments ===');
  const branch = branches[0];
  const { sessionId: s1, apptId: a1 } = await writeKioskNoDepositBooking({
    branchId: branch.id,
    customerNameTemp: 'TEST V50P4 dup',
    customerPhoneTemp: '0800007777',
    suffix: 'H1',
  });
  const { sessionId: s2, apptId: a2 } = await writeKioskNoDepositBooking({
    branchId: branch.id,
    customerNameTemp: 'TEST V50P4 dup',
    customerPhoneTemp: '0800007777',
    suffix: 'H2',
  });
  if (APPLY) {
    check(`H.1 Two distinct sessionIds`, s1 !== s2);
    const { customerId: c1 } = await writeCustomer({
      branchId: branch.id, firstname: 'TEST V50P4 dup', lastname: 'one', suffix: 'H1',
    });
    const r1 = await adminAttachCustomerToOpdSessionLinks(s1, {
      customerId: c1, customerName: 'TEST V50P4 dup one', customerHN: c1,
    });
    check(`H.2 First attach hits 1 appt`, r1.appointmentCount === 1);
    const a1Doc = await db.collection(`${base}/be_appointments`).doc(a1).get();
    const a2DocBefore = await db.collection(`${base}/be_appointments`).doc(a2).get();
    check(`H.3 Session 1 appt linked to c1`, a1Doc.data().customerId === c1);
    check(`H.4 Session 2 appt UNCHANGED (customerId still '')`, a2DocBefore.data().customerId === '');

    // Second OPD save links c2
    const { customerId: c2 } = await writeCustomer({
      branchId: branch.id, firstname: 'TEST V50P4 dup', lastname: 'two', suffix: 'H2',
    });
    const r2 = await adminAttachCustomerToOpdSessionLinks(s2, {
      customerId: c2, customerName: 'TEST V50P4 dup two', customerHN: c2,
    });
    check(`H.5 Second attach hits 1 appt`, r2.appointmentCount === 1);
    const a2Doc = await db.collection(`${base}/be_appointments`).doc(a2).get();
    check(`H.6 Session 2 appt linked to c2 (different from c1)`,
      a2Doc.data().customerId === c2 && c1 !== c2);
  }
}

async function scenarioI_Idempotency(branches) {
  console.log('\n=== Scenario I: idempotency — re-running attach is no-op ===');
  const branch = branches[0];
  const { sessionId, apptId } = await writeKioskNoDepositBooking({
    branchId: branch.id,
    customerNameTemp: 'TEST V50P4 idem',
    customerPhoneTemp: '0800009999',
    suffix: 'I',
  });
  if (APPLY) {
    const { customerId } = await writeCustomer({
      branchId: branch.id, firstname: 'TEST V50P4 idem', lastname: 'X', suffix: 'I',
    });
    const r1 = await adminAttachCustomerToOpdSessionLinks(sessionId, {
      customerId, customerName: 'TEST V50P4 idem X', customerHN: customerId,
    });
    check(`I.1 First attach links 1 appt`, r1.appointmentCount === 1);

    // Re-run — should be no-op (where-clause filters customerId=='')
    const r2 = await adminAttachCustomerToOpdSessionLinks(sessionId, {
      customerId, customerName: 'TEST V50P4 idem X', customerHN: customerId,
    });
    check(`I.2 Re-attach is no-op (count=0)`, r2.appointmentCount === 0);

    // Try to re-attach with DIFFERENT customer — should also be no-op
    const { customerId: c2 } = await writeCustomer({
      branchId: branch.id, firstname: 'TEST V50P4 idem', lastname: 'Y', suffix: 'I2',
    });
    const r3 = await adminAttachCustomerToOpdSessionLinks(sessionId, {
      customerId: c2, customerName: 'TEST V50P4 idem Y', customerHN: c2,
    });
    check(`I.3 Re-attach with different customer is no-op (first wins)`, r3.appointmentCount === 0);
    const apptDoc = await db.collection(`${base}/be_appointments`).doc(apptId).get();
    check(`I.4 Original customerId preserved (not overwritten)`,
      apptDoc.data().customerId === customerId);
  }
}

async function scenarioJ_BranchSwitchChaos(branches) {
  console.log('\n=== Scenario J: branch-switch chaos — kiosk@A + customer@B (admin switched) ===');
  if (branches.length < 2) {
    console.log('  SKIP: < 2 branches available');
    return;
  }
  const kioskBranch = branches[0];
  const adminBranch = branches[1];
  const { sessionId, apptId } = await writeKioskNoDepositBooking({
    branchId: kioskBranch.id,
    customerNameTemp: 'TEST V50P4 br-switch',
    customerPhoneTemp: '0800001111',
    suffix: 'J',
  });
  if (APPLY) {
    // Admin switched to BR-B before clicking OPD save
    const { customerId } = await writeCustomer({
      branchId: adminBranch.id,                    // ← different branch!
      firstname: 'TEST V50P4 br-switch',
      lastname: 'X',
      suffix: 'J',
    });
    await adminAttachCustomerToOpdSessionLinks(sessionId, {
      customerId, customerName: 'TEST V50P4 br-switch X', customerHN: customerId,
    });
    const apptDoc = await db.collection(`${base}/be_appointments`).doc(apptId).get();
    const custDoc = await db.collection(`${base}/be_customers`).doc(customerId).get();
    check(`J.1 Customer.branchId === admin's CURRENT branch (${adminBranch.id.slice(0, 14)})`,
      custDoc.data().branchId === adminBranch.id);
    check(`J.2 Appt.branchId === kiosk's ORIGINAL branch (${kioskBranch.id.slice(0, 14)})`,
      apptDoc.data().branchId === kioskBranch.id);
    check(`J.3 Cross-branch state captured: customer ${adminBranch.id.slice(0, 14)} ↔ appt ${kioskBranch.id.slice(0, 14)}`,
      apptDoc.data().customerId === customerId && custDoc.data().branchId !== apptDoc.data().branchId);
    // Documents the SHARP EDGE — admin should stay on same branch as kiosk
    // for clean per-branch reports. Production code does NOT auto-correct.
  }
}

// ─── Cleanup + audit doc ───────────────────────────────────────────────────

async function cleanup() {
  console.log('\n=== Cleanup ===');
  if (!APPLY) {
    console.log('  (dry-run: nothing to clean)');
    return;
  }
  let deleted = 0;
  for (const id of created.appointments) {
    await db.collection(`${base}/be_appointments`).doc(id).delete();
    deleted++;
  }
  for (const id of created.deposits) {
    await db.collection(`${base}/be_deposits`).doc(id).delete();
    deleted++;
  }
  for (const id of created.customers) {
    await db.collection(`${base}/be_customers`).doc(id).delete();
    deleted++;
  }
  for (const id of created.opdSessions) {
    await db.collection(`${base}/opd_sessions`).doc(id).delete();
    deleted++;
  }
  check(`Cleanup deleted ${deleted} TEST- fixtures`, deleted > 0);

  // Verify zero orphans
  let orphans = 0;
  for (const id of created.appointments) {
    const s = await db.collection(`${base}/be_appointments`).doc(id).get();
    if (s.exists) orphans++;
  }
  for (const id of created.deposits) {
    const s = await db.collection(`${base}/be_deposits`).doc(id).get();
    if (s.exists) orphans++;
  }
  for (const id of created.customers) {
    const s = await db.collection(`${base}/be_customers`).doc(id).get();
    if (s.exists) orphans++;
  }
  for (const id of created.opdSessions) {
    const s = await db.collection(`${base}/opd_sessions`).doc(id).get();
    if (s.exists) orphans++;
  }
  check(`Post-cleanup orphan count === 0`, orphans === 0, `orphans=${orphans}`);

  // Audit doc
  const auditId = `v50-phase4-kiosk-opd-cascade-${ts}-${randomBytes(4).toString('hex')}`;
  await db.collection(`${base}/be_admin_audit`).doc(auditId).set({
    phase: 'V50.Phase4',
    operation: 'e2e-kiosk-opd-cascade-chaos',
    fixturesCreated: deleted,
    pass,
    fail,
    appliedAt: FieldValue.serverTimestamp(),
    sessionTag,
  });
  check(`Audit doc emitted: be_admin_audit/${auditId}`, true);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`V50 Phase 4 kiosk → OPD cascade chaos e2e (${APPLY ? '--apply' : 'dry-run'})`);
  console.log(`  session=${sessionTag} ts=${ts}`);

  const branches = await phase0_discoverBranches();
  if (branches.length === 0) {
    console.error('No branches found — aborting');
    process.exit(1);
  }

  await scenarioA_NoDepositGridVisibility(branches);
  await scenarioB_DeleteKioskCascade(branches);
  await scenarioC_OpdSaveAutoLink(branches);
  await scenarioD_DepositPairAutoLink(branches);
  await scenarioE_BranchMatrix(branches);
  await scenarioF_DeleteApptMidFlow(branches);
  await scenarioG_DeleteDepositMidFlow(branches);
  await scenarioH_DuplicateNamePhone(branches);
  await scenarioI_Idempotency(branches);
  await scenarioJ_BranchSwitchChaos(branches);
  await cleanup();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total: ${pass} pass / ${fail} fail`);
  console.log(`Mode: ${APPLY ? 'APPLIED (writes committed + cleaned)' : 'DRY-RUN (no writes)'}`);
  console.log('='.repeat(60));
  if (fail > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}
