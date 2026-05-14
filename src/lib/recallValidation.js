/**
 * Phase 29 (2026-05-14) — recall create/edit validation.
 * Pure JS. Validation only — no Firestore, no React.
 */

/**
 * Phase 29 — validate a single recall slot.
 * Disabled slot always passes; enabled slot requires recallDate + non-empty reason.
 * @param {{enabled?:boolean,recallDate?:string,reason?:string}} slot
 * @returns {{ok:boolean,errors:string[]}}
 */
export function validateRecallSlot(slot) {
  if (!slot || !slot.enabled) return { ok: true, errors: [] };
  const errors = [];
  if (!slot.recallDate || typeof slot.recallDate !== 'string') errors.push('date-required');
  if (typeof slot.reason !== 'string' || slot.reason.trim() === '') errors.push('reason-required');
  return { ok: errors.length === 0, errors };
}

/**
 * Phase 29 — validate a full recall-create payload (2-slot design).
 * Requires customerId + at least one enabled slot. Slot errors prefixed with slot1-/slot2-.
 * @param {{customerId?:string,slot1?:object,slot2?:object}} payload
 * @returns {{ok:boolean,errors:string[]}}
 */
export function validateRecallCreate(payload) {
  const errors = [];
  if (!payload?.customerId) errors.push('customer-required');
  const s1 = payload?.slot1 || { enabled: false };
  const s2 = payload?.slot2 || { enabled: false };
  if (!s1.enabled && !s2.enabled) errors.push('at-least-one-slot-required');
  if (s1.enabled) {
    const r = validateRecallSlot(s1);
    if (!r.ok) errors.push(...r.errors.map(e => `slot1-${e}`));
  }
  if (s2.enabled) {
    const r = validateRecallSlot(s2);
    if (!r.ok) errors.push(...r.errors.map(e => `slot2-${e}`));
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Phase 29 — clean a slot for save (trim reason, coerce booleans).
 * Disabled slot returns minimal shape.
 * @param {object} slot
 * @returns {{enabled:boolean,recallDate?:string,reason?:string,saveToMaster?:boolean}}
 */
export function normalizeRecallSlot(slot) {
  if (!slot) return { enabled: false };
  return {
    enabled: !!slot.enabled,
    recallDate: slot.recallDate || '',
    reason: typeof slot.reason === 'string' ? slot.reason.trim() : '',
    saveToMaster: !!slot.saveToMaster,
  };
}
