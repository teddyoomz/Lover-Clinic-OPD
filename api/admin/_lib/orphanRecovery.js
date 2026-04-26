// ─── V31 (2026-04-26) — Orphan Firebase Auth Recovery Decision ─────────────
//
// User report (verbatim): "เจอบั๊ค ลบพนักงานทิ้งไป แล้วอีเมลยัง login ได้
// และลองมาสร้างพนักงานใหม่ใช้อีเมลเดิม มันบอกว่ามีเมลอยู่ในระบบแล้ว".
//
// Root cause: StaffTab.handleDelete + DoctorsTab.handleDelete silently
// swallow Firebase Auth deletion errors (`try/catch` with console.warn) and
// proceed with Firestore deletion. Result: orphaned Firebase Auth users —
// email still logs in, but no be_staff/be_doctors doc references the uid.
// Re-creating staff with same email throws auth/email-already-exists.
//
// V31 fix: when handleCreate hits auth/email-already-exists, look up the
// existing Firebase user by email + cross-reference against be_staff and
// be_doctors. Decide what to do via this pure function (testable without
// Firebase). Refusal cases:
//   1. OWNER_EMAILS allowlist — pre-approved owner accounts
//      (Google Sign-In owners; never auto-delete)
//   2. @loverclinic.com domain — clinic admin accounts
//      (bootstrap admins; never auto-delete)
//   3. Cross-reference found — be_staff or be_doctors doc references
//      the uid → real conflict, edit the existing record instead
// Else: orphan detected → safe to delete + recreate.
//
// Pure function: takes plain inputs, returns one of the 5 decisions below.
// Testable without firebase-admin or Firestore SDK.

/**
 * @typedef {Object} OrphanRecoveryInput
 * @property {string} email — email being created
 * @property {string|null|undefined} existingUid — uid of pre-existing Firebase Auth user (or null if none)
 * @property {Object|null} crossRef — { role, id } if any be_staff/be_doctors references existingUid (or null)
 * @property {string[]} ownerEmails — OWNER_EMAILS allowlist (lowercased emails)
 * @property {RegExp} clinicEmailRegex — /@loverclinic\.com$/i
 */

/**
 * Decide what to do when handleCreate hits auth/email-already-exists.
 *
 * @param {OrphanRecoveryInput} input
 * @returns {'no-existing'|'block-owner'|'block-clinic'|'block-cross-ref'|'recover'}
 *
 * Return-value semantics:
 *   - 'no-existing'      → race condition: user gone now. Caller may retry create.
 *   - 'block-owner'      → email is owner; refuse with error
 *   - 'block-clinic'     → email is @loverclinic.com; refuse with error
 *   - 'block-cross-ref'  → real conflict (staff/doctor exists); refuse with role+id
 *   - 'recover'          → orphan; delete existing uid + retry create
 */
export function decideOrphanRecovery({ email, existingUid, crossRef, ownerEmails, clinicEmailRegex }) {
  if (!existingUid) return 'no-existing';

  const lowerEmail = String(email || '').toLowerCase().trim();

  // Owner allowlist takes precedence — even @loverclinic.com owners don't
  // matter; we never auto-delete an owner account.
  if (Array.isArray(ownerEmails) && ownerEmails.includes(lowerEmail)) {
    return 'block-owner';
  }

  // Clinic email — bootstrap admin domain
  if (clinicEmailRegex && clinicEmailRegex.test(email)) {
    return 'block-clinic';
  }

  // Cross-reference check
  if (crossRef && (crossRef.role || crossRef.id)) {
    return 'block-cross-ref';
  }

  return 'recover';
}

/**
 * Map a decision to a Thai-language error message for the user.
 * Returns null for the 'recover' or 'no-existing' decisions
 * (which proceed without an error).
 */
export function decisionToErrorMessage(decision, { email, crossRef } = {}) {
  switch (decision) {
    case 'block-owner':
      return `อีเมล ${email} เป็นบัญชีเจ้าของกิจการที่ pre-approved อยู่แล้ว — ใช้บัญชีเดิมเข้าสู่ระบบ ไม่สามารถสร้างซ้ำได้`;
    case 'block-clinic':
      return `อีเมล ${email} เป็นบัญชี @loverclinic.com — ใช้บัญชีเดิมเข้าสู่ระบบ ไม่สามารถสร้างซ้ำได้`;
    case 'block-cross-ref': {
      const role = crossRef?.role === 'doctor' ? 'แพทย์' : 'พนักงาน';
      const id = crossRef?.id || '?';
      return `อีเมลนี้ผูกกับ${role} ${id} อยู่แล้ว — กดแก้ไขบนรายการเดิมแทนการสร้างใหม่`;
    }
    default:
      return null;
  }
}
