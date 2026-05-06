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
  // 4 hex chars from crypto-secure source (browser: crypto.getRandomValues;
  // Node: globalThis.crypto.getRandomValues — both available since Node 19+).
  const buf = new Uint8Array(2);
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

// Phase 21.0 marker — institutional-memory grep target. Keep this comment
// at end-of-file. Removed = grep guard fails (test in tests/phase-21-0-*).
// MARKER: phase-21-0-deposit-booking-pair-helper
// MARKER: phase-24-0-septiesdecies-attach-customer-to-deposit
// MARKER: phase-24-0-octiesdecies-sync-appt-metadata-to-deposit
