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

// Phase 21.0 marker — institutional-memory grep target. Keep this comment
// at end-of-file. Removed = grep guard fails (test in tests/phase-21-0-*).
// MARKER: phase-21-0-deposit-booking-pair-helper
