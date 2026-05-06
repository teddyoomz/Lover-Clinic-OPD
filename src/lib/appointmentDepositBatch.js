// ─── appointmentDepositBatch — paired (be_deposits + be_appointments) writes ──
//
// Phase 21.0 (2026-05-06)
//
// Single source of truth for deposit-booking pair atomicity. When admin
// creates a deposit with `hasAppointment=true`, this helper writes BOTH:
//   1. be_deposits doc (status=active)
//   2. be_appointments doc (appointmentType='deposit-booking')
// in ONE Firestore writeBatch — both land or neither lands.
//
// Cross-link fields (so consumers can navigate between the docs):
//   - be_deposits.linkedAppointmentId    = appointmentId
//   - be_appointments.linkedDepositId    = depositId
//   - be_appointments.appointmentType    = 'deposit-booking'  (SSOT-locked)
//   - both docs share the same branchId  (stamped from BranchContext)
//
// WHY THIS HELPER EXISTS (problem statement):
//   Pre-Phase 21.0, DepositPanel.handleSave called createDeposit(payload)
//   which wrote ONE doc to be_deposits with `appointment` as a NESTED FIELD.
//   It did NOT spawn a be_appointments doc. AppointmentTab reads
//   be_appointments via listenToAppointmentsByDate → deposit-bookings
//   created from Finance.มัดจำ DID NOT appear in any appointment grid.
//   Phase 21.0 closes this visibility gap by making the writer atomic.
//
// V12 multi-writer note: This module is the SOLE writer of paired
// (be_deposits + be_appointments) docs. AppointmentFormModal does NOT
// duplicate this path — for type='deposit-booking' it redirects admin to
// DepositPanel (which calls into here). Single writer = no shape drift.
//
// AP1-bis slot reservation: NOT exercised here (deposit-bookings are
// scheduled via the deposit form's appointment fields, historically without
// AP1-bis guard). Doctor-collision is best-effort (caller-soft check inside
// DepositPanel before submit). Tracked as Phase 21.0-bis-future.

import { db, appId } from '../firebase.js';
import {
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { resolveSelectedBranchId } from './branchSelection.js';

const basePath = () => ['artifacts', appId, 'public', 'data'];
const depositDoc = (id) => doc(db, ...basePath(), 'be_deposits', String(id));
const appointmentDoc = (id) => doc(db, ...basePath(), 'be_appointments', String(id));

/**
 * Phase 21.0 — branchId resolver for paired writes. Mirrors
 * backendClient._resolveBranchIdForWrite shape (intentionally NOT importing
 * to avoid a circular-import path between data-layer modules; both stay
 * tiny and Rule-of-3 boundary is preserved).
 */
function _resolveBranchIdForWrite(data) {
  if (data && typeof data.branchId === 'string' && data.branchId.trim()) {
    return data.branchId;
  }
  return resolveSelectedBranchId() || null;
}

/**
 * Build the appointment-doc payload from the deposit's embedded
 * `appointment` metadata + cross-link fields. Pure helper — exported for
 * testing without Firestore.
 *
 * @param {Object} args
 * @param {Object} args.depositData — the same payload DepositPanel builds
 *   for createDeposit, must include `appointment` field with date / startTime / etc.
 * @param {string} args.depositId    — caller-minted DEP-{ts}
 * @param {string} args.appointmentId — caller-minted BA-{ts}-{rand}
 * @param {string|null} args.branchId
 * @returns {Object} appointment doc payload (no serverTimestamp — caller stamps via batch)
 */
export function buildAppointmentPairPayload({
  depositData,
  depositId,
  appointmentId,
  branchId,
}) {
  const appt = depositData?.appointment || {};
  const now = new Date().toISOString();
  // Phase 21.0 — the be_appointments shape mirrors what AppointmentFormModal
  // writes (so AppointmentCalendarView's existing rendering applies). Fields
  // are sourced from the deposit's embedded appointment metadata. Snake-vs-
  // camel: deposit.appointment uses camelCase already (see DepositPanel save
  // builder around line 304).
  return {
    appointmentId,
    customerId: String(depositData?.customerId || ''),
    customerName: depositData?.customerName || '',
    customerHN: depositData?.customerHN || '',
    // Phase 24.0-terdecies (2026-05-06) — "เลือกลูกค้าภายหลัง" temp fields.
    // When the kiosk staff books before a customer doc exists, customerId
    // stays '' and customerName falls through to the "ลูกค้าจอง" placeholder.
    // The booking-time name + phone the caller gave land here so admin can
    // contact them + identify them in Finance.มัดจำ before linking a real
    // customer doc.
    customerNameTemp: depositData?.customerNameTemp || '',
    customerPhoneTemp: depositData?.customerPhoneTemp || '',
    date: appt.date || '',
    startTime: appt.startTime || '',
    endTime: appt.endTime || appt.startTime || '',
    appointmentType: 'deposit-booking',
    advisorId: appt.advisorId || '',
    advisorName: appt.advisorName || '',
    doctorId: appt.doctorId || '',
    doctorName: appt.doctorName || '',
    assistantIds: Array.isArray(appt.assistantIds) ? appt.assistantIds : [],
    assistantNames: Array.isArray(appt.assistantNames) ? appt.assistantNames : [],
    roomId: appt.roomId || '',
    roomName: appt.roomName || '',
    channel: appt.channel || '',
    appointmentTo: appt.purpose || appt.appointmentTo || '',
    location: appt.location || '',
    notes: appt.note || appt.notes || '',
    appointmentColor: appt.color || appt.appointmentColor || '',
    lineNotify: !!appt.lineNotify,
    status: 'pending',
    branchId: branchId || null,
    // Cross-link to deposit doc (queryable both directions).
    linkedDepositId: depositId,
    // Forensic trail — these fields tell future admins / migration scripts
    // that this appointment was spawned by a paired deposit-booking write
    // rather than created directly via AppointmentFormModal.
    spawnedFromDepositId: depositId,
    spawnedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Build the deposit-doc payload mirroring backendClient.createDeposit shape
 * + the linkedAppointmentId cross-link. Pure helper — exported for testing.
 *
 * @param {Object} args
 * @param {Object} args.depositData
 * @param {string} args.depositId
 * @param {string} args.appointmentId
 * @param {string|null} args.branchId
 * @returns {Object} deposit doc payload
 */
export function buildDepositPairPayload({
  depositData,
  depositId,
  appointmentId,
  branchId,
}) {
  const now = new Date().toISOString();
  const amount = Number(depositData?.amount) || 0;
  return {
    depositId,
    customerId: String(depositData?.customerId || ''),
    customerName: depositData?.customerName || '',
    customerHN: depositData?.customerHN || '',
    // Phase 24.0-terdecies — see buildAppointmentPairPayload for context.
    customerNameTemp: depositData?.customerNameTemp || '',
    customerPhoneTemp: depositData?.customerPhoneTemp || '',
    amount,
    usedAmount: 0,
    remainingAmount: amount,
    paymentChannel: depositData?.paymentChannel || '',
    paymentDate: depositData?.paymentDate || now.slice(0, 10),
    paymentTime: depositData?.paymentTime || '',
    refNo: depositData?.refNo || '',
    sellers: Array.isArray(depositData?.sellers) ? depositData.sellers : [],
    customerSource: depositData?.customerSource || '',
    sourceDetail: depositData?.sourceDetail || '',
    hasAppointment: true,  // pair-write always has appointment
    appointment: depositData?.appointment || null,
    note: depositData?.note || '',
    status: 'active',
    cancelNote: '',
    cancelEvidenceUrl: depositData?.cancelEvidenceUrl || '',
    cancelledAt: null,
    refundAmount: 0,
    refundChannel: '',
    refundDate: null,
    paymentEvidenceUrl: depositData?.paymentEvidenceUrl || '',
    paymentEvidencePath: depositData?.paymentEvidencePath || '',
    proClinicDepositId: depositData?.proClinicDepositId || null,
    usageHistory: [],
    branchId: branchId || null,
    // Cross-link to appointment doc.
    linkedAppointmentId: appointmentId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Mint a paired (depositId, appointmentId) tuple. Uses Date.now() + a
 * 4-char crypto-secure suffix for collision-resistance under concurrent
 * admin writes. Phase 21.0 (security: anti-vibe-code C2 — no Math.random
 * for IDs).
 *
 * Exported for testing — production callers receive ids via the helper.
 */
export function mintPairIds() {
  const ts = Date.now();
  // Phase 24.0-vicies (2026-05-06) — 8 hex chars (32-bit entropy) instead
  // of 4 (16-bit). Tight-loop callers (e.g. test fixtures generating 100
  // ids in the same ms) can hit birthday collisions on 16-bit (~7.6% rate
  // for 100 samples). 32-bit drops collision rate to ~2.3e-6 for 1000 ids.
  // crypto-secure source (browser: crypto.getRandomValues; Node: globalThis
  // since Node 19+).
  const buf = new Uint8Array(4);
  globalThis.crypto.getRandomValues(buf);
  const suffix = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  return {
    depositId: `DEP-${ts}`,
    appointmentId: `BA-${ts}-${suffix}`,
  };
}

/**
 * Atomically create a paired deposit-booking. Both be_deposits + be_appointments
 * writes commit together via Firestore writeBatch.
 *
 * @param {Object} args
 * @param {Object} args.depositData — same shape DepositPanel builds for createDeposit.
 *   MUST include `hasAppointment: true` and `appointment: { date, startTime, ... }`.
 * @param {string|null} [args.branchId] — override; falls through to
 *   resolveSelectedBranchId() from BranchContext when omitted.
 * @returns {Promise<{depositId, appointmentId}>}
 */
export async function createDepositBookingPair({ depositData, branchId } = {}) {
  if (!depositData || typeof depositData !== 'object') {
    throw new Error('createDepositBookingPair: depositData required');
  }
  if (!depositData.hasAppointment || !depositData.appointment) {
    throw new Error('createDepositBookingPair: depositData.appointment required');
  }
  if (!depositData.appointment.date || !depositData.appointment.startTime) {
    throw new Error('createDepositBookingPair: appointment.date + startTime required');
  }
  const resolvedBranchId = branchId || _resolveBranchIdForWrite(depositData);
  const { depositId, appointmentId } = mintPairIds();
  const depositPayload = buildDepositPairPayload({
    depositData,
    depositId,
    appointmentId,
    branchId: resolvedBranchId,
  });
  const apptPayload = buildAppointmentPairPayload({
    depositData,
    depositId,
    appointmentId,
    branchId: resolvedBranchId,
  });
  const batch = writeBatch(db);
  batch.set(depositDoc(depositId), depositPayload);
  batch.set(appointmentDoc(appointmentId), apptPayload);
  await batch.commit();
  // Customer balance recalc is intentionally NOT inside the batch (it's a
  // read-then-write workflow that lives in customer doc). Caller (DepositPanel)
  // can recalc post-commit via the existing recalcCustomerDepositBalance
  // helper from backendClient. Decoupling preserves writeBatch atomicity for
  // the two-doc create.
  return { depositId, appointmentId };
}

/**
 * Atomically cancel both docs of a paired deposit-booking.
 *
 * If the deposit has no `linkedAppointmentId` (legacy create from before
 * Phase 21.0, or backfilled deposit pre-migration), falls back to deposit-
 * only cancel — the caller is expected to detect this case and route to
 * the legacy single-doc cancel path. We surface a `pairCancelled: false`
 * flag in that case so callers can branch correctly.
 *
 * @param {string} depositId
 * @param {Object} args
 * @param {string} [args.cancelNote]
 * @param {string} [args.cancelEvidenceUrl]
 * @returns {Promise<{ pairCancelled: boolean, depositId, appointmentId?: string }>}
 */
export async function cancelDepositBookingPair(depositId, {
  cancelNote = '',
  cancelEvidenceUrl = '',
} = {}) {
  const depositRef = depositDoc(depositId);
  const snap = await getDoc(depositRef);
  if (!snap.exists()) {
    throw new Error('Deposit not found');
  }
  const data = snap.data() || {};
  const appointmentId = data.linkedAppointmentId || '';
  if ((Number(data.usedAmount) || 0) > 0) {
    throw new Error(
      'มัดจำถูกใช้ไปบางส่วนแล้ว ไม่สามารถยกเลิกได้ กรุณายกเลิกใบเสร็จที่ใช้มัดจำก่อน',
    );
  }
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(depositRef, {
    status: 'cancelled',
    cancelNote,
    cancelEvidenceUrl,
    cancelledAt: now,
    remainingAmount: 0,
    updatedAt: now,
  });
  if (appointmentId) {
    batch.update(appointmentDoc(appointmentId), {
      status: 'cancelled',
      // Forensic trail — when the cancel was triggered via the pair helper.
      pairCancelledAt: now,
      pairCancelReason: cancelNote || '',
      updatedAt: now,
    });
  }
  await batch.commit();
  return {
    pairCancelled: !!appointmentId,
    depositId,
    appointmentId: appointmentId || undefined,
  };
}

/**
 * Phase 24.0-septiesdecies (2026-05-06) — attach a real customer to a
 * pre-existing customer-later deposit. Used when admin edits a deposit-
 * booking appointment + selects a real customer (toggling pickLater off).
 * The appointment update writes customerId/customerName/customerHN on the
 * be_appointments doc; this helper cascades the same fields to the linked
 * be_deposits doc so Finance.มัดจำ shows the correct customer. The temp
 * fields (customerNameTemp / customerPhoneTemp) are preserved for forensic
 * trail. Best-effort: throws if depositId missing OR doc doesn't exist;
 * caller wraps in try/catch.
 *
 * @param {string} depositId — be_deposits doc id (from
 *        appt.linkedDepositId / appt.spawnedFromDepositId).
 * @param {Object} args
 * @param {string} args.customerId — be_customers doc id (canonical HN-based)
 * @param {string} args.customerName
 * @param {string} [args.customerHN]
 * @returns {Promise<{ depositId: string, attached: true }>}
 */
export async function attachCustomerToLinkedDeposit(depositId, {
  customerId,
  customerName,
  customerHN = '',
} = {}) {
  if (!depositId) throw new Error('attachCustomerToLinkedDeposit: depositId required');
  if (!customerId) throw new Error('attachCustomerToLinkedDeposit: customerId required');
  const ref = depositDoc(depositId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(`attachCustomerToLinkedDeposit: deposit ${depositId} not found`);
  }
  const now = new Date().toISOString();
  // Use writeBatch even for single-doc update so future cascades (e.g.
  // wallet-tx, audit doc) can ride on the same atomic boundary.
  const batch = writeBatch(db);
  batch.update(ref, {
    customerId: String(customerId),
    customerName: String(customerName || ''),
    customerHN: String(customerHN || ''),
    // Forensic trail — preserves the original booking-time temp identity
    // so admin can audit who paid the deposit before the customer was
    // formally registered. customerNameTemp / customerPhoneTemp are kept;
    // do NOT clear them.
    customerLinkedAt: now,
    customerLinkedFrom: 'appointment-modal',
    updatedAt: now,
  });
  await batch.commit();
  return { depositId, attached: true };
}

/**
 * Phase 24.0-octiesdecies (2026-05-06) — sync appointment metadata to the
 * linked be_deposits.appointment embedded object. User report: "พอ edit
 * ลูกค้าที่จองมัดจำ ... ตรงนัดหมายเปลี่ยนเหตุผล ตรงตารางหน้าการเงินมัน
 * ไม่เปลี่ยนตาม". DepositPanel "มัดจำสำหรับ" column reads
 * dep.appointment.purpose; if AppointmentFormModal updates the be_appointments
 * doc but the linked be_deposits.appointment.purpose stays stale, admin
 * sees old metadata in Finance.มัดจำ until manual reload. This helper
 * keeps both sides in sync.
 *
 * Best-effort cascade: throws if depositId missing or doc gone; caller
 * wraps in try/catch. Preserves untouched fields on the deposit's embedded
 * appointment via dotted-path updates.
 *
 * @param {string} depositId — be_deposits doc id (from
 *        appt.linkedDepositId / appt.spawnedFromDepositId).
 * @param {Object} apptMeta — same shape as the embedded `appointment` field
 *        DepositPanel writes when creating a deposit (date, startTime,
 *        endTime, doctorId, doctorName, advisorId, advisorName, assistantIds,
 *        assistantNames, roomId, roomName, channel, purpose, note, color,
 *        lineNotify). Only fields present on the input override; missing
 *        fields are left untouched on the deposit doc.
 * @returns {Promise<{ depositId: string, synced: true }>}
 */
export async function syncAppointmentToLinkedDeposit(depositId, apptMeta = {}) {
  if (!depositId) throw new Error('syncAppointmentToLinkedDeposit: depositId required');
  const ref = depositDoc(depositId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(`syncAppointmentToLinkedDeposit: deposit ${depositId} not found`);
  }
  const now = new Date().toISOString();
  // Build dotted-path updates so we don't wipe sibling fields on the
  // appointment object. Only persist fields the caller actually provided
  // (vs. blanket-clearing missing fields).
  const update = {
    updatedAt: now,
    appointmentSyncedAt: now,
  };
  const allowedKeys = [
    'type', 'option',
    'date', 'startTime', 'endTime',
    'doctorId', 'doctorName',
    'advisorId', 'advisorName',
    'assistantIds', 'assistantNames',
    'roomId', 'roomName',
    'channel', 'purpose', 'appointmentTo',
    'note', 'color', 'lineNotify',
  ];
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(apptMeta, key)) {
      update[`appointment.${key}`] = apptMeta[key];
    }
  }
  const batch = writeBatch(db);
  batch.update(ref, update);
  await batch.commit();
  return { depositId, synced: true };
}

/**
 * Phase 24.0-noniesdecies (2026-05-06) — create an appointment for an
 * already-existing deposit. User report: "เพิ่มในหน้าการเงิน หากมัดจำไหน
 * ไม่มีนัด ให้สามารถสร้างนัดสำหรับมัดจำนั้นได้ โดยนัดที่สร้างก็จะไปอยู่ใน
 * หน้า จองมัดจำ เลยโดยอัตโนมัติ".
 *
 * Distinct from createDepositBookingPair (which mints BOTH new docs):
 *   • The deposit doc already exists (admin clicks 'สร้างนัด' on a deposit
 *     row in Finance.มัดจำ that has hasAppointment=false).
 *   • Only be_appointments is newly minted.
 *   • The deposit doc is updated atomically with hasAppointment=true,
 *     linkedAppointmentId=newApptId, and the embedded `appointment` field
 *     (so DepositPanel's มัดจำสำหรับ column populates immediately).
 *
 * Atomic via writeBatch — both writes commit together or neither does.
 *
 * @param {string} depositId — be_deposits doc id (must exist).
 * @param {Object} apptPayload — same shape AppointmentFormModal builds for
 *        createBackendAppointment (date, startTime, endTime, customerId,
 *        customerName, customerHN, doctorId, doctorName, advisorId,
 *        advisorName, assistantIds, assistantNames, roomId, roomName,
 *        channel, appointmentTo, notes, appointmentColor, lineNotify,
 *        appointmentType, branchId, etc.).
 * @returns {Promise<{ depositId: string, appointmentId: string }>}
 */
export async function createAppointmentForExistingDeposit(depositId, apptPayload = {}) {
  if (!depositId) throw new Error('createAppointmentForExistingDeposit: depositId required');
  if (!apptPayload?.date || !apptPayload?.startTime) {
    throw new Error('createAppointmentForExistingDeposit: apptPayload.date + startTime required');
  }
  const depRef = depositDoc(depositId);
  const depSnap = await getDoc(depRef);
  if (!depSnap.exists()) {
    throw new Error(`createAppointmentForExistingDeposit: deposit ${depositId} not found`);
  }
  const depData = depSnap.data() || {};
  // Mint a fresh appointment id matching the pair-helper's BA-{ts}-{rand}
  // shape so admin tooling that greps appointmentId by prefix sees both.
  // Phase 24.0-vicies (2026-05-06) — 8 hex chars matches the bumped
  // mintPairIds suffix length (was 4 → ~7.6% collision rate in tight loops).
  const ts = Date.now();
  const buf = new Uint8Array(4);
  globalThis.crypto.getRandomValues(buf);
  const suffix = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  const appointmentId = `BA-${ts}-${suffix}`;
  const now = new Date().toISOString();
  const branchId = apptPayload.branchId || depData.branchId || null;

  // be_appointments payload — type locked to 'deposit-booking' so the appt
  // appears in the จองมัดจำ sub-tab (per user directive).
  const newApptPayload = {
    appointmentId,
    customerId: String(apptPayload.customerId || depData.customerId || ''),
    customerName: apptPayload.customerName || depData.customerName || '',
    customerHN: apptPayload.customerHN || depData.customerHN || '',
    customerNameTemp: apptPayload.customerNameTemp || depData.customerNameTemp || '',
    customerPhoneTemp: apptPayload.customerPhoneTemp || depData.customerPhoneTemp || '',
    date: apptPayload.date,
    startTime: apptPayload.startTime,
    endTime: apptPayload.endTime || apptPayload.startTime,
    appointmentType: 'deposit-booking',
    advisorId: apptPayload.advisorId || '',
    advisorName: apptPayload.advisorName || '',
    doctorId: apptPayload.doctorId || '',
    doctorName: apptPayload.doctorName || '',
    assistantIds: Array.isArray(apptPayload.assistantIds) ? apptPayload.assistantIds : [],
    assistantNames: Array.isArray(apptPayload.assistantNames) ? apptPayload.assistantNames : [],
    roomId: apptPayload.roomId || '',
    roomName: apptPayload.roomName || '',
    channel: apptPayload.channel || '',
    appointmentTo: apptPayload.appointmentTo || '',
    location: apptPayload.location || '',
    notes: apptPayload.notes || '',
    appointmentColor: apptPayload.appointmentColor || '',
    lineNotify: !!apptPayload.lineNotify,
    status: 'pending',
    branchId,
    linkedDepositId: depositId,
    spawnedFromDepositId: depositId,
    spawnedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // be_deposits update — set hasAppointment=true + cross-link + populate the
  // embedded appointment metadata so DepositPanel renders immediately.
  const depUpdate = {
    hasAppointment: true,
    linkedAppointmentId: appointmentId,
    'appointment.type': 'deposit-booking',
    'appointment.option': 'once',
    'appointment.date': apptPayload.date,
    'appointment.startTime': apptPayload.startTime,
    'appointment.endTime': apptPayload.endTime || apptPayload.startTime,
    'appointment.doctorId': apptPayload.doctorId || '',
    'appointment.doctorName': apptPayload.doctorName || '',
    'appointment.advisorId': apptPayload.advisorId || '',
    'appointment.advisorName': apptPayload.advisorName || '',
    'appointment.assistantIds': Array.isArray(apptPayload.assistantIds) ? apptPayload.assistantIds : [],
    'appointment.assistantNames': Array.isArray(apptPayload.assistantNames) ? apptPayload.assistantNames : [],
    'appointment.roomId': apptPayload.roomId || '',
    'appointment.roomName': apptPayload.roomName || '',
    'appointment.channel': apptPayload.channel || '',
    'appointment.purpose': apptPayload.appointmentTo || '',
    'appointment.appointmentTo': apptPayload.appointmentTo || '',
    'appointment.note': apptPayload.notes || '',
    'appointment.color': apptPayload.appointmentColor || '',
    'appointment.lineNotify': !!apptPayload.lineNotify,
    appointmentSyncedAt: now,
    updatedAt: now,
  };

  const batch = writeBatch(db);
  batch.set(appointmentDoc(appointmentId), newApptPayload);
  batch.update(depRef, depUpdate);
  await batch.commit();
  return { depositId, appointmentId };
}

/**
 * Phase 24.0-vicies (2026-05-06) — sync customer temp identity (name + phone)
 * to the linked be_deposits doc. User report: "ตรงปุ่มแก้ไขในหน้าจองไม่มัดจำ
 * ทำให้แก้ไขชื่อและเบอร์โทรลูกค้าได้ด้วย และเมื่อแก้ในนี้ก็จะไปแก้ตรงหน้า
 * การเงินและหน้านัดหมายด้วย" — when admin edits customer name/phone via the
 * noDeposit-tab edit button + the session has a linkedDepositId, the deposit
 * doc in Finance.มัดจำ should reflect the new name/phone.
 *
 * Distinct from attachCustomerToLinkedDeposit (Phase 24.0-septiesdecies):
 *   • This helper does NOT touch customerId — it only syncs the displayable
 *     name + the temp identity fields. Use this for noDeposit-edit cascades
 *     where no real customer doc is being attached, just edited.
 *   • attachCustomerToLinkedDeposit fires once when admin attaches a real
 *     customer; this helper fires on every edit.
 *
 * Best-effort cascade: throws if depositId missing or doc gone; caller wraps
 * in try/catch.
 *
 * @param {string} depositId — be_deposits doc id (from
 *        session.linkedDepositId / session.depositProClinicId).
 * @param {Object} args
 * @param {string} [args.customerName] — overrides the visible label only when
 *        provided (selective merge — undefined fields skipped).
 * @param {string} [args.customerNameTemp]
 * @param {string} [args.customerPhoneTemp]
 * @returns {Promise<{ depositId: string, synced: true }>}
 */
export async function syncCustomerTempToLinkedDeposit(depositId, {
  customerName,
  customerNameTemp,
  customerPhoneTemp,
} = {}) {
  if (!depositId) throw new Error('syncCustomerTempToLinkedDeposit: depositId required');
  const ref = depositDoc(depositId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(`syncCustomerTempToLinkedDeposit: deposit ${depositId} not found`);
  }
  const now = new Date().toISOString();
  // Selective merge — only overwrite fields the caller explicitly provides.
  // Empty strings ARE allowed (admin clearing a field) but undefined skips.
  const update = {
    customerTempSyncedAt: now,
    updatedAt: now,
  };
  if (customerName !== undefined) update.customerName = String(customerName || '');
  if (customerNameTemp !== undefined) update.customerNameTemp = String(customerNameTemp || '');
  if (customerPhoneTemp !== undefined) update.customerPhoneTemp = String(customerPhoneTemp || '');
  // Use writeBatch for consistency with the other cascade helpers + so future
  // additions (e.g. audit doc) can ride on the same atomic boundary.
  const batch = writeBatch(db);
  batch.update(ref, update);
  await batch.commit();
  return { depositId, synced: true };
}

// Phase 21.0 marker — institutional-memory grep target. Keep this comment
// at end-of-file. Removed = grep guard fails (test in tests/phase-21-0-*).
// MARKER: phase-21-0-deposit-booking-pair-helper
// MARKER: phase-24-0-septiesdecies-attach-customer-to-deposit
// MARKER: phase-24-0-octiesdecies-sync-appt-metadata-to-deposit
// MARKER: phase-24-0-noniesdecies-create-appointment-for-existing-deposit
// MARKER: phase-24-0-vicies-sync-customer-temp-to-deposit
