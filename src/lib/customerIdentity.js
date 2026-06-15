// 2026-06-16 — Customer identity-claim primitives (Part A, Rule T bulletproof
// duplicate-prevention). The claim key is the doc-id of be_customer_identity/{key}
// — a transactional uniqueness guard claimed atomically inside addCustomer.
//
// Design (hardened by workflow w89gycg12):
//   - Key is TYPE-PREFIXED so a 13-digit citizen id can never collide with a
//     numeric passport: `CITIZEN:{13 digits}` vs `PASSPORT:{UPPERCASE}`.
//   - Citizen id validated to EXACTLY 13 digits (after stripping dashes/spaces).
//     A 12- or 14-digit input is NOT a citizen key (falls through to passport,
//     which here is empty → null) — never silently re-padded.
//   - Passport: strip spaces/dashes, UPPERCASE, alphanumeric, ≤30 chars. Lenient
//     by design (foreign formats vary); 'aa 000 123' and 'AA000123' intentionally
//     collide to the same claim.
//   - Both present → CITIZEN wins (passport stays searchable but unguarded).
//   - Both empty/invalid → null (walk-in; no claim, duplicates allowed by policy).

/**
 * Thrown by addCustomer/updateCustomerFromForm when a national-id/passport
 * already belongs to another customer. Carries the existing customer's id so
 * the UI can offer "open existing" / override.
 */
export class DuplicateIdentityError extends Error {
  constructor(existingCustomerId, claimKey) {
    super('DUPLICATE_IDENTITY');
    this.name = 'DuplicateIdentityError';
    this.code = 'DUPLICATE_IDENTITY';
    this.existingCustomerId = existingCustomerId || null;
    this.claimKey = claimKey || null;
  }
}

/**
 * Derive the type-prefixed identity-claim key from a customer's identity fields.
 * @param {string} citizenId  canonical `citizen_id` (Thai 13-digit national id)
 * @param {string} passportId canonical `passport_id` (foreigner)
 * @returns {string|null} `CITIZEN:{13d}` | `PASSPORT:{UPPER}` | null (walk-in)
 */
export function deriveClaimKey(citizenId, passportId) {
  const c = String(citizenId || '').replace(/[\s-]/g, '');
  if (/^\d{13}$/.test(c)) return `CITIZEN:${c}`;
  const p = String(passportId || '').replace(/[\s-]/g, '').toUpperCase();
  if (p && p.length <= 30 && /^[A-Z0-9]+$/.test(p)) return `PASSPORT:${p}`;
  return null;
}

/**
 * Pure decision for what to do with an identity claim inside a transaction.
 * Shared by addCustomer (create) + updateCustomerFromForm (edit reclaim) so the
 * "is this a duplicate?" logic is unit-testable and can't drift (Rule of 3).
 *
 * @param {{claimExists:boolean, owner:?string, customerId:string, overrideDuplicate?:boolean}} p
 * @returns {{action:'set'|'noop'|'append'|'throw', existingCustomerId?:string}}
 *   - 'set'    → claim is free; create it for customerId
 *   - 'noop'   → claim already owned by customerId (or owner empty); nothing to do
 *   - 'append' → owned by another, override requested → add customerId to linkedCustomerIds
 *   - 'throw'  → owned by another, no override → DUPLICATE_IDENTITY (existingCustomerId)
 */
export function resolveClaimAction({ claimExists, owner, customerId, overrideDuplicate = false }) {
  if (!claimExists) return { action: 'set' };
  if (!owner || owner === customerId) return { action: 'noop' };
  if (overrideDuplicate) return { action: 'append' };
  return { action: 'throw', existingCustomerId: owner };
}
