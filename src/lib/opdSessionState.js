// V118 (2026-05-23) — Card-Level OPD Lifecycle Row pure helpers.
//
// AV118 (sole sanctioned home): every site deriving "OPD save state" or
// "card OPD lifecycle state" MUST go through these helpers. Source-grep
// regression locks all callsites (tests/v118-card-opd-lifecycle-row-source-grep.test.js).
//
// Branch-blind by design — no Firestore reads, no React imports, no branchId.
// Pure JS so it's trivially testable and consumable from any layer.
//
// State machine (matches docs/superpowers/specs/2026-05-23-card-opd-lifecycle-row-design.html):
//
//   A — appt.customerId truthy → existing customer (HN set)
//   B — !customerId && !linkedOpdSessionId → customer-later, no link sent
//   C — !customerId && linkedOpdSessionId && !patientData → link sent, waiting
//   D — !customerId && linkedOpdSessionId && patientData && !saved → ready to save
//   E — saved (transient — appt.customerId stamps on next listener tick → A)

/**
 * Has the linked OPD session been committed to be_customers via handleOpdClick?
 *
 * Mirrors the legacy inline predicate `session.opdRecordedAt && session.brokerStatus === 'done'`
 * that lives at AdminDashboard:3475 (handleOpdClick early-return) + :5747
 * (viewingSession modal button label). AV118 enforces all NEW callsites use
 * this helper instead of re-inlining the literals.
 *
 * @param {object|null|undefined} session - opd_sessions doc shape
 * @returns {boolean}
 */
export function isOpdSessionSaved(session) {
  if (!session || typeof session !== 'object') return false;
  return !!(session.opdRecordedAt && session.brokerStatus === 'done');
}

/**
 * Has the customer filled the PatientForm via the remote QR/link?
 * Empty `patientData: {}` returns false (the kiosk creates the session with
 * an empty map; populated on form submit).
 *
 * @param {object|null|undefined} session
 * @returns {boolean}
 */
export function hasPatientData(session) {
  if (!session || typeof session !== 'object') return false;
  const pd = session.patientData;
  if (!pd || typeof pd !== 'object') return false;
  return Object.keys(pd).length > 0;
}

/**
 * Resolves the card-level OPD lifecycle state for a given appointment +
 * (optionally already-fetched) linked session. Returns one of the 5 states.
 *
 * When `linkedSession` is null but `appt.linkedOpdSessionId` is set, returns 'C'
 * (caller likely triggered a lazy-fetch and the session will resolve on next
 * render — meanwhile the row shows the wait state, not a save action).
 *
 * @param {object} args
 * @param {object|null} args.appt - be_appointments doc shape
 * @param {object|null} args.linkedSession - opd_sessions doc (or null)
 * @returns {'A'|'B'|'C'|'D'|'E'}
 */
export function resolveCardOpdState({ appt, linkedSession }) {
  if (!appt) return 'B';
  if (appt.customerId) return 'A';
  if (!appt.linkedOpdSessionId) return 'B';
  if (!linkedSession) return 'C';
  if (isOpdSessionSaved(linkedSession)) return 'E';
  if (!hasPatientData(linkedSession)) return 'C';
  return 'D';
}

/**
 * Synthesize a session-shaped object from a be_customers doc so the existing
 * "ประวัติผู้ป่วย OPD" modal (driven by setViewingSession) can render the
 * customer's patientData even when there's no real opd_sessions doc.
 *
 * The `__synthetic: true` marker MUST be checked by destructive operations
 * inside the modal (edit / re-sync / Resync OPD / patient-link send) — synth
 * sessions are read-only views. Print + customer-navigation buttons are safe.
 *
 * @param {object|null} customer - be_customers doc
 * @param {object|null} appt - originating appointment (for context)
 * @returns {object|null} synth session, or null if customer missing
 */
export function synthesizeSessionFromCustomer(customer, appt) {
  if (!customer || typeof customer !== 'object') return null;
  const cid = customer.id || customer.proClinicId || '';
  const aid = appt?.id || appt?.appointmentId || 'noappt';
  return {
    id: `synth-${cid || 'unknown'}-${aid}`,
    patientData: customer.patientData || {},
    opdRecordedAt: customer.createdAt || null,
    brokerStatus: 'done',
    brokerProClinicId: customer.proClinicId || null,
    brokerProClinicHN: customer.proClinicHN || customer.HN || '',
    customerId: cid,
    __synthetic: true,
    __synthSourceCustomerId: cid,
  };
}

/**
 * V121 (2026-05-23) — does this opd_session belong to the V118 card-flow?
 *
 * Card-flow sessions are minted via provisionOpdLinkForBookingPair with
 * `hideFromQueue:true` (V120) → they carry BOTH createdFromBackendBooking:true
 * AND isHiddenFromQueue:true. Returns false for kiosk sessions, walk-in
 * sessions, deposit sessions, and pre-V120 legacy hidden sessions (which set
 * isHiddenFromQueue:true via the V116 deleteSession-with-link path but
 * lacked createdFromBackendBooking).
 *
 * AV118 V121 amendment: every site deriving "is this card-flow?" MUST use
 * this helper — locks the predicate so a future shape evolution (e.g. a new
 * field) updates ONE place.
 *
 * @param {object|null|undefined} session
 * @returns {boolean}
 */
export function isCardFlowSession(session) {
  if (!session || typeof session !== 'object') return false;
  return !!(session.createdFromBackendBooking && session.isHiddenFromQueue);
}

/**
 * V121 (2026-05-23) — does this card-flow session need admin's attention?
 *
 * True iff:
 *  - it's a V118 card-flow session (isCardFlowSession), AND
 *  - customer has filled the form (session.isUnread is set true by PatientForm
 *    on submit + sticks until handleOpdClick stamps opdRecordedAt/done), AND
 *  - admin hasn't saved to be_customers yet (isOpdSessionSaved false)
 *
 * Locked Q1=B: pure review via 🟢 ดูข้อมูล does NOT clear isUnread for
 * card-flow sessions — only handleOpdClick succeeding transitions the
 * session out of this filter via isOpdSessionSaved becoming true.
 *
 * @param {object|null|undefined} session
 * @returns {boolean}
 */
export function isCardFlowUnread(session) {
  if (!isCardFlowSession(session)) return false;
  if (!session.isUnread) return false;
  if (isOpdSessionSaved(session)) return false;
  return true;
}

/**
 * V124 (2026-05-24 EOD+1) — broader predicate for the "นัดหมาย" tab bubble.
 *
 * V121's `isCardFlowUnread` restricts to V118 Card-flow sessions only (requires
 * `createdFromBackendBooking` + `isHiddenFromQueue` markers, set by
 * `provisionOpdLinkForBookingPair({hideFromQueue:true})` from the V118 Card
 * "✏️ ส่งลิ้งค์" path). Real-world bookings minted via the regular
 * จองไม่มัดจำ / จองมัดจำ / AppointmentFormModal paths lack those markers, so
 * V121's bubble missed them — user-visible regression vs intent. Caught
 * 2026-05-24 EOD+1 via Rule R diag on BA-1779590375471 → ND-68FA49 (regular
 * no-deposit booking, no V118/V120 markers, but customer DID fill the form).
 *
 * This helper aligns the COUNT surface with the visible BADGE on
 * AppointmentHubRowCard line 172 ("📥 ลูกค้ากรอกแล้ว · รอบันทึก") which
 * renders when `resolveCardOpdState({appt, linkedSession}) === 'D'`. State D =
 * `!appt.customerId && appt.linkedOpdSessionId && linkedSession exists &&
 *  hasPatientData(linkedSession) && !isOpdSessionSaved(linkedSession)`.
 *
 * Single-source-of-truth via existing `resolveCardOpdState` — any future
 * state-machine refinement propagates automatically to BOTH rendering AND
 * counting surfaces. AV-pattern: any badge-count pair MUST share predicate.
 *
 * @param {object} args
 * @param {object|null} args.appt - be_appointments doc shape
 * @param {object|null} args.linkedSession - opd_sessions doc (or null)
 * @returns {boolean}
 */
export function isAppointmentPendingOpdSave({ appt, linkedSession }) {
  // V125 (2026-05-24 EOD+1) — exclude cancelled appts from state-D match.
  // Pre-V125: `resolveCardOpdState` didn't check `appt.status` → cancelled
  // appts with linkedOpdSessionId + patientData + !saved still returned 'D'
  // → bubble counter held a stale "1" after admin clicked ยกเลิก. User-
  // reported: "กดยกเลิก แต่ bubble ไม่หายไป". Past sub-pill's row card ALSO
  // rendered the "📥 ลูกค้ากรอกแล้ว · รอบันทึก" badge for the cancelled appt
  // (defaultStatusFilterForTab('past').exclude=[] lets cancelled through).
  //
  // Status check happens HERE (predicate, not resolveCardOpdState) so the
  // state-machine semantic for the lifecycle row stays clean (cancelled
  // appts on the ยกเลิก sub-tab already short-circuit via `hideOpdLifecycle`).
  // The predicate is bubble+badge-specific and can carry the extra guard.
  if (appt?.status === 'cancelled') return false;
  return resolveCardOpdState({ appt, linkedSession }) === 'D';
}
