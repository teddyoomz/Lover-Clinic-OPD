// TFP → staff-chat "ระบบ" system cards (2026-07-04, spec ③④).
//
// CLIENT-side writer (design Q2=A): fired-and-forgotten from TreatmentFormPage
// right after a successful vitals-save (teal "บันทึกข้อมูลซักประวัติ") or
// doctor-save (purple "บันทึกสำหรับแพทย์"). firestore.rules narrowly allows a
// staff client to create a system card ONLY for kind ∈ {tfp-vitals, tfp-doctor}
// (intake/followup stay server-only / unforgeable — AV198).
//
// Deterministic id = one card per treatment per kind: a re-save hits the
// update:false rule (setDoc on an existing doc = update) → denied → swallowed
// → idempotent, no duplicate cards (mirror of the Cloud Function's
// CHAT-SYS-<sessionId> discipline in functions/staffChatNotify.js).
//
// NON-FATAL by contract: a card failure must NEVER break the treatment save.
// LIVE-GATED on the firestore.rules deploy — until the rules ship, create is
// denied and silently swallowed (same gate pattern as the tablet-chart
// storage.rules json upload).
import { serverTimestamp } from 'firebase/firestore';

export const TFP_CARD_KINDS = Object.freeze(['tfp-vitals', 'tfp-doctor']);

/**
 * Pure builder — no Firestore, no timestamps (writer adds createdAt).
 * V14 discipline: no undefined leaves.
 *
 * @param {object} p
 * @param {'tfp-vitals'|'tfp-doctor'} p.kind
 * @param {string} p.treatmentId  BT-... id of the treatment just saved
 * @param {string} p.customerId
 * @param {string} [p.customerName]
 * @param {string} [p.customerHN]
 * @param {string} [p.doctorName]  header-doctor name (tfp-doctor only)
 * @param {string} p.branchId     the treatment's branch (card routes there)
 * @returns {object|null} message doc (without createdAt) or null on bad input
 */
export function buildTfpChatCard({ kind, treatmentId, customerId, customerName, customerHN, doctorName, branchId } = {}) {
  if (!TFP_CARD_KINDS.includes(kind)) return null;
  const tid = String(treatmentId || '').trim();
  const bid = String(branchId || '').trim();
  if (!tid || !bid) return null;
  const isDoctor = kind === 'tfp-doctor';
  return {
    id: `CHAT-SYS-TFP-${tid}-${isDoctor ? 'doctor' : 'vitals'}`,
    branchId: bid,
    deviceId: 'system',
    displayName: 'ระบบ',
    text: isDoctor ? '🔔 แพทย์ลงบันทึกเสร็จแล้ว' : '🔔 บันทึกซักประวัติเสร็จแล้ว',
    system: {
      kind,
      treatmentId: tid,
      customerId: String(customerId || ''),
      nameSnapshot: String(customerName || ''),
      hnSnapshot: customerHN ? String(customerHN) : null,
      ...(isDoctor ? { doctorName: String(doctorName || '') } : {}),
    },
  };
}

/**
 * Fire-and-forget writer. Returns true when the card landed, false otherwise
 * (invalid input / rules-denied / duplicate / offline) — never throws.
 */
export async function writeTfpChatCard(payload) {
  try {
    const card = buildTfpChatCard(payload);
    if (!card) return false;
    const { addStaffChatMessage } = await import('./scopedDataLayer.js');
    await addStaffChatMessage({ ...card, createdAt: serverTimestamp() });
    return true;
  } catch (e) {
    // permission-denied (rules not yet deployed / duplicate re-save) or network —
    // all non-fatal by design; the treatment save itself already succeeded.
    console.warn('[tfp-chat-card] skipped:', e?.code || e?.message || e);
    return false;
  }
}
