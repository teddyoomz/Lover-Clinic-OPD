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
  query,
  where,
  getDocs,
  collection,
} from 'firebase/firestore';
import { resolveSelectedBranchId } from './branchSelection.js';

const basePath = () => ['artifacts', appId, 'public', 'data'];
const depositDoc = (id) => doc(db, ...basePath(), 'be_deposits', String(id));
const appointmentDoc = (id) => doc(db, ...basePath(), 'be_appointments', String(id));
// Phase 24.0-vicies-novies (2026-05-07) — opd_sessions doc + collection refs
// for the Backend pickLater "ส่งลิ้งค์ลูกค้า" provisioning flow.
const opdSessionDoc = (id) => doc(db, ...basePath(), 'opd_sessions', String(id));
const depositsCol = () => collection(db, ...basePath(), 'be_deposits');
const appointmentsCol = () => collection(db, ...basePath(), 'be_appointments');

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
// V68 (2026-05-15) — `lineNotify` field stripped. notifyChannel: ['line']
// is the canonical channel-state driver (read by cron pipeline + retry
// + debug-fire). lineNotify field had zero consumers post-Wave-1 LINE
// reminder ship; orphan field on existing be_appointments docs is harmless.
export function buildAppointmentPairPayload({
  depositData,
  depositId,
  appointmentId,
  branchId,
  // Phase 24.0-vicies-novies (2026-05-07) — when the kiosk flow already minted
  // an opd_sessions doc (e.g. confirmCreateDeposit), the sessionId is passed
  // through here so the be_appointments doc carries the unique-link match key
  // bidirectionally. Used by attachCustomerToOpdSessionLinks at OPD save time
  // to find the booking and attach the new customerId. Phone-mismatch resilient
  // — match is sessionId-based, not phone-based.
  linkedOpdSessionId = '',
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
    status: 'pending',
    branchId: branchId || null,
    // Cross-link to deposit doc (queryable both directions).
    linkedDepositId: depositId,
    // Phase 24.0-vicies-novies — bidirectional unique-link match key for the
    // OPD-save auto-attach flow. Empty string when the booking originated
    // outside the link-send mechanism (e.g. legacy customer-later create).
    linkedOpdSessionId: linkedOpdSessionId || '',
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
  // Phase 24.0-vicies-novies (2026-05-07) — see buildAppointmentPairPayload for
  // context. Stamped on both halves of the pair when the kiosk flow already
  // minted an opd_sessions doc, so attachCustomerToOpdSessionLinks can find
  // the deposit at OPD-save time via a single sessionId match.
  linkedOpdSessionId = '',
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
    // Phase 24.0-vicies-novies — bidirectional unique-link match key (see
    // buildAppointmentPairPayload). Empty string for legacy / non-link create.
    linkedOpdSessionId: linkedOpdSessionId || '',
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
export async function createDepositBookingPair({
  depositData,
  branchId,
  // Phase 24.0-vicies-novies (2026-05-07) — kiosk callsites (confirmCreateDeposit
  // in AdminDashboard.jsx) pass through the freshly-minted opd_sessions doc id
  // (e.g. DEP-XXXXXX) so the paired deposit + appointment carry the unique-link
  // match key from creation. attachCustomerToOpdSessionLinks reads this at
  // OPD-save time to find pending bookings + cascade the new customerId.
  linkedOpdSessionId = '',
} = {}) {
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
    linkedOpdSessionId,
  });
  const apptPayload = buildAppointmentPairPayload({
    depositData,
    depositId,
    appointmentId,
    branchId: resolvedBranchId,
    linkedOpdSessionId,
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
 *        assistantNames, roomId, roomName, channel, purpose, note, color).
 *        Only fields present on the input override; missing fields are left
 *        untouched on the deposit doc.
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
    'note', 'color',
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
 *        channel, appointmentTo, notes, appointmentColor,
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

/**
 * Phase 24.0-vicies-quinquies (2026-05-06) — HARD-delete the deposit-booking
 * pair. Distinct from cancelDepositBookingPair (soft-cancel via status flag):
 * this helper deletes both documents outright via writeBatch.
 *
 * User report: "มีบั๊คคือลบ จองมัดจำ จากหน้า frontend แล้ว ในหน้าการเงิน
 * ไม่ต้องแสดงเป็นยกเลิกแต่ให้ลบหายไปเลย" + "ถ้าลบนัดหมาย จองมัดจำ จากหน้า
 * นัดหมายแล้ว ถ้าไม่ลบในการเงินด้วย มันจะแสดง bubble ตรงแถบวันที่".
 *
 * Both bugs share root cause: soft-cancelled docs (status='cancelled') still
 * count in getAppointmentsByMonth (no status filter) AND still render in
 * Finance.มัดจำ list (renders all statuses including 'cancelled'). User's
 * mental model is "ลบ" = gone-from-list; soft-cancel doesn't match.
 *
 * Used by:
 *   - Kiosk handleDepositCancel (X icon — Phase 24.0-vicies-bis converted)
 *   - Kiosk archive (trash icon in confirm modal — Phase 24.0-vicies-ter converted)
 *   - AppointmentCalendarView delete-via-modal cascade (when appt has
 *     linkedDepositId)
 *
 * Distinct from cancelDepositBookingPair which remains in use for
 * Finance.มัดจำ admin-driven cancel flow (where audit trail of cancelled
 * docs may matter). The kiosk + appointment-tab "delete" UIs route here
 * for true removal.
 *
 * Best-effort: throws if depositId missing, gracefully handles already-gone
 * docs (allowing the caller to retry idempotent cleanups).
 *
 * @param {string} depositId — be_deposits doc id
 * @returns {Promise<{ depositId, appointmentId?: string, deleted: true, pairDeleted: boolean }>}
 */
export async function deleteDepositBookingPair(depositId) {
  if (!depositId) throw new Error('deleteDepositBookingPair: depositId required');
  const depRef = depositDoc(depositId);
  const snap = await getDoc(depRef);
  if (!snap.exists()) {
    // Already deleted — idempotent. Return success with no appointmentId.
    return { depositId, deleted: true, pairDeleted: false };
  }
  const data = snap.data() || {};
  const appointmentId = data.linkedAppointmentId || '';
  // Refuse to delete if any of the deposit's funds have been used (admin
  // must un-apply payments first via Finance.มัดจำ refund flow). Mirrors
  // cancelDepositBookingPair's guard so the hard-delete path can't bypass
  // the same financial integrity check.
  if ((Number(data.usedAmount) || 0) > 0) {
    throw new Error(
      'มัดจำถูกใช้ไปบางส่วนแล้ว ไม่สามารถลบได้ กรุณายกเลิกใบเสร็จที่ใช้มัดจำก่อน',
    );
  }
  const batch = writeBatch(db);
  batch.delete(depRef);
  if (appointmentId) batch.delete(appointmentDoc(appointmentId));
  await batch.commit();
  return {
    depositId,
    appointmentId: appointmentId || undefined,
    deleted: true,
    pairDeleted: !!appointmentId,
  };
}

/**
 * Phase 24.0-vicies-novies (2026-05-07) — auto-attach customer-later deposit +
 * appointment to a newly-saved OPD customer at "บันทึกลง OPD" save time.
 *
 * Match key = bidirectional `linkedOpdSessionId`:
 *   - opd_sessions has linkedDepositId / linkedAppointmentId (admin-stamped at
 *     create time in confirmCreateDeposit / confirmCreateNoDeposit).
 *   - be_deposits + be_appointments carry the reverse field linkedOpdSessionId
 *     (Phase 24.0-vicies-novies addition — see buildDepositPairPayload).
 *
 * User directive lock (verbatim, 2026-05-07): "เวลาเราส่ง link ให้ใครอะ มัน
 * สร้าง unique link มาอยู่แล้ว มึงก็เอาไปประกอบกับ มัดจำ กับนัดหมาย ดิวะ มัน
 * ไม่ซ้ำกันอยู่แล้ว พอลูกค้าส่งข้อมูลมาผ่านลิ้งนั้น มันก็ไป match กับ unique
 * link ที่บันทึกไปก่อนหน้านี้ ใน มัดจำ กับนัดหมาย".
 *
 * Phone-mismatch resilience: customer can type ANY phone in the OPD form —
 * irrelevant. Match is via stamped sessionId on the deposit + appointment
 * docs, NOT phone. ✅ "Different phone" requirement satisfied by design.
 *
 * Idempotent: docs with `customerId !== ''` are excluded by the WHERE clause
 * → re-running attach for the same session is a 0-write no-op.
 *
 * Forensic trail: `customerLinkedAt` (ISO ts) + `customerLinkedFrom:
 * 'opd-save-auto'` are stamped on each updated doc. `customerNameTemp` /
 * `customerPhoneTemp` are PRESERVED so admin can audit who paid the deposit
 * before being formally registered.
 *
 * @param {string} sessionId — opd_sessions doc id (the unique link).
 * @param {Object} args
 * @param {string} args.customerId — be_customers doc id (canonical HN-based)
 * @param {string} args.customerName
 * @param {string} [args.customerHN]
 * @returns {Promise<{
 *   sessionId: string,
 *   depositCount: number,
 *   appointmentCount: number,
 *   depositIds: string[],
 *   appointmentIds: string[],
 * }>}
 */
export async function attachCustomerToOpdSessionLinks(sessionId, {
  customerId,
  customerName,
  customerHN = '',
} = {}) {
  if (!sessionId) {
    throw new Error('attachCustomerToOpdSessionLinks: sessionId required');
  }
  if (!customerId) {
    throw new Error('attachCustomerToOpdSessionLinks: customerId required');
  }
  // Single-pass query for each collection. WHERE clause filters out
  // already-attached docs (idempotency: re-running attach is a no-op).
  const depositQ = query(
    depositsCol(),
    where('linkedOpdSessionId', '==', String(sessionId)),
    where('customerId', '==', ''),
  );
  const apptQ = query(
    appointmentsCol(),
    where('linkedOpdSessionId', '==', String(sessionId)),
    where('customerId', '==', ''),
  );
  const [depSnap, apptSnap] = await Promise.all([
    getDocs(depositQ),
    getDocs(apptQ),
  ]);
  const now = new Date().toISOString();
  const customerFields = {
    customerId: String(customerId),
    customerName: String(customerName || ''),
    customerHN: String(customerHN || ''),
    // Forensic trail — Rule M pattern (preserves provenance for admin audit).
    customerLinkedAt: now,
    customerLinkedFrom: 'opd-save-auto',
    updatedAt: now,
    // NOTE: customerNameTemp + customerPhoneTemp are intentionally NOT
    // cleared — they remain on the doc as the booking-time identity record.
  };
  // Atomic writeBatch — all-or-none commit. Empty-result case writes nothing.
  const depositIds = [];
  const appointmentIds = [];
  if (depSnap.size === 0 && apptSnap.size === 0) {
    return {
      sessionId,
      depositCount: 0,
      appointmentCount: 0,
      depositIds,
      appointmentIds,
    };
  }
  const batch = writeBatch(db);
  depSnap.forEach((d) => {
    batch.update(d.ref, customerFields);
    depositIds.push(d.id);
  });
  apptSnap.forEach((d) => {
    batch.update(d.ref, customerFields);
    appointmentIds.push(d.id);
  });
  await batch.commit();
  return {
    sessionId,
    depositCount: depSnap.size,
    appointmentCount: apptSnap.size,
    depositIds,
    appointmentIds,
  };
}

/**
 * Phase 24.0-vicies-novies (2026-05-07) — Backend pickLater "ส่งลิ้งค์ลูกค้า"
 * provisioning helper. Mints a fresh opd_sessions doc + stamps
 * linkedOpdSessionId on the existing customer-later deposit + appointment so
 * the booking is now wired into the unique-link match cascade.
 *
 * Distinct from the kiosk flow (confirmCreateDeposit) which mints the session
 * AT booking time — this helper mints the session AFTER booking, retroactively
 * connecting an existing customer-later pair to the OPD-save attach mechanism.
 *
 * Idempotent: if the deposit already has a non-empty linkedOpdSessionId, the
 * existing sessionId is returned + alreadyProvisioned=true (no new session
 * minted). Admin clicking "ส่งลิ้งค์ลูกค้า" twice = same URL.
 *
 * @param {Object} args
 * @param {string} args.depositId — be_deposits doc id (must exist).
 * @param {string} [args.appointmentId] — be_appointments doc id (optional —
 *        for noDeposit-only flows where no deposit exists, the helper supports
 *        appointment-only provisioning by passing depositId='' instead).
 * @param {string} [args.branchId] — defaults to deposit's branchId.
 * @param {string} [args.formType='intake'] — opd_sessions formType field.
 * @param {string} [args.sessionName] — display label on opd_sessions queue.
 * @param {string} [args.origin] — URL origin (e.g. https://lover-clinic-app.vercel.app);
 *        falls back to window.location.origin then to '' (path-only URL).
 * @returns {Promise<{
 *   sessionId: string,
 *   url: string,
 *   alreadyProvisioned: boolean,
 * }>}
 */
export async function provisionOpdLinkForBookingPair({
  depositId = '',
  appointmentId = '',
  branchId = '',
  formType = 'intake',
  sessionName = '',
  origin = '',
} = {}) {
  if (!depositId && !appointmentId) {
    throw new Error('provisionOpdLinkForBookingPair: depositId OR appointmentId required');
  }
  // Read the source-of-truth doc to check idempotency + capture the branchId
  // when caller didn't provide one.
  let resolvedBranchId = branchId || '';
  let existingSessionId = '';
  let resolvedSessionName = sessionName || '';
  if (depositId) {
    const depRef = depositDoc(depositId);
    const depSnap = await getDoc(depRef);
    if (!depSnap.exists()) {
      throw new Error(`provisionOpdLinkForBookingPair: deposit ${depositId} not found`);
    }
    const depData = depSnap.data() || {};
    if (depData.linkedOpdSessionId && String(depData.linkedOpdSessionId).trim()) {
      existingSessionId = String(depData.linkedOpdSessionId).trim();
    }
    if (!resolvedBranchId && depData.branchId) {
      resolvedBranchId = depData.branchId;
    }
    if (!resolvedSessionName) {
      resolvedSessionName = depData.customerNameTemp
        || depData.customerName
        || 'ลูกค้าจอง';
    }
  } else if (appointmentId) {
    const apptRef = appointmentDoc(appointmentId);
    const apptSnap = await getDoc(apptRef);
    if (!apptSnap.exists()) {
      throw new Error(`provisionOpdLinkForBookingPair: appointment ${appointmentId} not found`);
    }
    const apptData = apptSnap.data() || {};
    if (apptData.linkedOpdSessionId && String(apptData.linkedOpdSessionId).trim()) {
      existingSessionId = String(apptData.linkedOpdSessionId).trim();
    }
    if (!resolvedBranchId && apptData.branchId) {
      resolvedBranchId = apptData.branchId;
    }
    if (!resolvedSessionName) {
      resolvedSessionName = apptData.customerNameTemp
        || apptData.customerName
        || 'ลูกค้าจอง';
    }
  }
  // Idempotent short-circuit — re-using existing session.
  if (existingSessionId) {
    const url = _buildOpdSessionUrl(existingSessionId, origin);
    return { sessionId: existingSessionId, url, alreadyProvisioned: true };
  }
  // Mint fresh sessionId — BL-{timestamp}-{8 hex chars} (BL = Backend-Link,
  // distinct from kiosk DEP-/ND-/CST-/PRM-/FW- prefixes). Crypto-secure
  // suffix per Rule C2 (crypto.getRandomValues only — no insecure PRNG).
  const ts = Date.now();
  const buf = new Uint8Array(4);
  globalThis.crypto.getRandomValues(buf);
  const suffix = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  const sessionId = `BL-${ts}-${suffix}`;
  const sessionRef = opdSessionDoc(sessionId);
  const sessionPayload = {
    status: 'pending',
    formType: formType || 'intake',
    isPermanent: false,
    branchId: resolvedBranchId || '',
    sessionName: resolvedSessionName,
    patientData: null,
    // Cross-link to the backing deposit + appointment so handleOpdClick can
    // find them at OPD-save time even without the reverse-lookup query.
    linkedDepositId: depositId || '',
    linkedAppointmentId: appointmentId || '',
    createdFromBackendBooking: true,
    createdAt: serverTimestamp(),
  };
  const now = new Date().toISOString();
  const reverseStamp = {
    linkedOpdSessionId: sessionId,
    opdLinkProvisionedAt: now,
    updatedAt: now,
  };
  const batch = writeBatch(db);
  batch.set(sessionRef, sessionPayload);
  if (depositId) {
    batch.update(depositDoc(depositId), reverseStamp);
  }
  if (appointmentId) {
    batch.update(appointmentDoc(appointmentId), reverseStamp);
  }
  await batch.commit();
  const url = _buildOpdSessionUrl(sessionId, origin);
  return { sessionId, url, alreadyProvisioned: false };
}

/**
 * Compose the public patient-form URL for a given opd_sessions doc id.
 * Helper isolated for testability — mocking window.location is awkward.
 * Phase 24.0-vicies-novies.
 */
function _buildOpdSessionUrl(sessionId, origin = '') {
  let resolvedOrigin = origin;
  if (!resolvedOrigin && typeof window !== 'undefined' && window.location?.origin) {
    resolvedOrigin = window.location.origin;
  }
  return resolvedOrigin
    ? `${resolvedOrigin}/?session=${sessionId}`
    : `?session=${sessionId}`;
}

// Phase 21.0 marker — institutional-memory grep target. Keep this comment
// at end-of-file. Removed = grep guard fails (test in tests/phase-21-0-*).
// MARKER: phase-21-0-deposit-booking-pair-helper
// MARKER: phase-24-0-septiesdecies-attach-customer-to-deposit
// MARKER: phase-24-0-octiesdecies-sync-appt-metadata-to-deposit
// MARKER: phase-24-0-noniesdecies-create-appointment-for-existing-deposit
// MARKER: phase-24-0-vicies-sync-customer-temp-to-deposit
// MARKER: phase-24-0-vicies-quinquies-delete-deposit-booking-pair
// MARKER: phase-24-0-vicies-novies-attach-customer-to-opd-session-links
// MARKER: phase-24-0-vicies-novies-provision-opd-link-for-booking-pair
