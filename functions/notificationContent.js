// functions/notificationContent.js — PURE CJS (no firebase). Builds the FCM push
// { title, body } from an opd_session + the resolved customer doc. Pure so it's
// unit-testable (mirrors the functions/assessmentMaterialize.js pattern).
//
// Branch order: edit → follow-up (linkedCustomerId, shows name + HN) → intake.
const { resolveCustomerName, resolveCustomerHN } = require('./customerDisplay');

function buildNotificationContent({ session, sessionId, customer, changedSections = [] } = {}) {
  const s = session || {};
  const pd = s.patientData || {};
  const rawName = String(s.sessionName || '').trim() || sessionId || 'OPD';
  const title = rawName.length > 28 ? rawName.substring(0, 27) + '…' : rawName;
  const isEdit = !!s.updatedAt;

  // 1. Edit of an existing session — unchanged.
  if (isEdit) {
    const sections = (changedSections && changedSections.length > 0)
      ? changedSections.join(' · ')
      : 'ข้อมูลผู้ป่วย';
    return { title, body: `✏️ แก้ไขแล้ว · ${sections}` };
  }

  // 2. Follow-up assessment (or any session tied to a known customer) → name + HN.
  // name: live-resolve from be_customers (V113), fall back to the confirmInfo snapshot.
  // hn: resolveCustomerHN (hn_no for real customers), fall back to the customer id
  // (LC-xxxxxxx — the customer number staff recognize when hn_no is empty).
  if (s.linkedCustomerId) {
    const name = resolveCustomerName(customer) || String((s.confirmInfo && s.confirmInfo.name) || '').trim();
    const hn = resolveCustomerHN(customer) || String(s.linkedCustomerId);
    return { title, body: name ? `🔔 ${name} · HN ${hn}` : `🔔 HN ${hn}` };
  }

  // 3. Intake (new walk-in) — name from patientData; no HN yet (customer not created). Unchanged.
  // compose-either (parity with resolveCustomerName) — show name when EITHER first or last is present.
  const patientName = (pd.firstName || pd.lastName) ? `${pd.firstName || ''} ${pd.lastName || ''}`.trim() : null;
  return { title, body: patientName ? `🔔 ข้อมูลใหม่ · ${patientName}` : '🔔 ได้รับข้อมูลผู้ป่วยแล้ว' };
}

module.exports = { buildNotificationContent };
