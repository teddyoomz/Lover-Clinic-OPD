// functions/staffChatNotify.js — staff-chat "System" notification card writer.
// Called from sendPushOnSubmit AFTER the FCM send, non-fatal. Writes a card into
// the per-branch be_staff_chat_messages (admin SDK → bypasses the create
// validators). Intake cards carry NO customerId (no be_customer yet) + the
// sessionId so the CLIENT can live-resolve via opd_session.brokerProClinicId once
// the walk-in is registered. Follow-up cards carry the linkedCustomerId + a
// name/HN snapshot. The customer NAME link is rendered client-side (sky, never
// red — Thai culture). AV198.
const crypto = require('crypto');
const { resolveCustomerName, resolveCustomerHN } = require('./customerDisplay');

function newId() {
  return `CHAT-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

// Pure: build the be_staff_chat_messages doc (minus createdAt, stamped by the
// writer). NEVER throws — the caller treats the whole thing as non-fatal.
function buildStaffChatNotification({ kind, session = {}, sessionId, customer, branchId, idFactory } = {}) {
  const isFollow = kind === 'followup';
  const s = session || {};
  let name;
  if (isFollow) {
    name = resolveCustomerName(customer)
      || String((s.confirmInfo && s.confirmInfo.name) || '').trim();
  } else {
    // intake: no be_customer yet — name from the kiosk PatientForm submission
    // (resolveCustomerName is patientData-aware: firstNameTh/firstName + prefix).
    name = resolveCustomerName({ patientData: s.patientData || {} });
  }
  const customerId = isFollow ? (String(s.linkedCustomerId || '') || null) : null;
  const hn = isFollow ? (resolveCustomerHN(customer) || customerId || null) : null;
  const headline = isFollow ? 'กรอกแบบประเมินติดตามเสร็จแล้ว' : 'กรอกข้อมูลรับเข้าเสร็จแล้ว';
  // Idempotent card id per session: a re-invoke of sendPushOnSubmit for the same
  // session (double-click submit / a retried call — both still have only
  // submittedAt, so isEdit stays false) re-writes the SAME doc instead of
  // creating a duplicate card. One session = one card. (Tests pass idFactory.)
  return {
    id: (typeof idFactory === 'function'
      ? idFactory()
      : (sessionId ? `CHAT-SYS-${String(sessionId)}` : newId())),
    branchId: String(branchId || ''),
    deviceId: 'system',
    displayName: 'ระบบ',
    text: `🔔 ${headline}`,
    system: {
      kind: isFollow ? 'followup' : 'intake',
      sessionId: String(sessionId || ''),
      customerId: customerId || null,
      nameSnapshot: name || '',
      hnSnapshot: hn || null,
    },
  };
}

// Admin-SDK write at the canonical path. Skips (returns false) when there is no
// branchId to route to — a card with no branch would be invisible to every
// per-branch listener, so dropping it is correct + non-fatal.
async function writeStaffChatNotification(db, BASE_PATH, FieldValue, doc) {
  if (!doc || !doc.branchId) return false;
  await db.doc(`${BASE_PATH}/be_staff_chat_messages/${doc.id}`)
    .set({ ...doc, createdAt: FieldValue.serverTimestamp() });
  return true;
}

module.exports = { buildStaffChatNotification, writeStaffChatNotification };
