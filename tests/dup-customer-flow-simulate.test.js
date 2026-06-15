// Task C1 — Rule I full-flow simulate for the customer identity-claim lifecycle.
// Uses the REAL deriveClaimKey + resolveClaimAction + DuplicateIdentityError the
// production code uses, modelling the claim doc as an in-memory store, so the
// create → dup → override → edit-reclaim → delete-free chain is exercised
// end-to-end without real Firestore. (Real concurrency = the L2 e2e.)
import { describe, it, expect } from 'vitest';
import { deriveClaimKey, resolveClaimAction, DuplicateIdentityError } from '../src/lib/customerIdentity.js';

// Faithful mirror of addCustomer/updateCustomerFromForm/deleteCustomerCascade
// claim logic (same decision fn as production).
function makeClaimStore() {
  const store = new Map(); // claimKey -> { customerId, linkedCustomerIds }
  return {
    store,
    create(claimKey, customerId, override = false) {
      if (!claimKey) return { id: customerId, claimKey: null }; // walk-in
      const existing = store.get(claimKey) || null;
      const decision = resolveClaimAction({ claimExists: !!existing, owner: existing?.customerId, customerId, overrideDuplicate: override });
      if (decision.action === 'throw') throw new DuplicateIdentityError(decision.existingCustomerId, claimKey);
      if (decision.action === 'set') store.set(claimKey, { customerId, linkedCustomerIds: [] });
      else if (decision.action === 'append') {
        const c = store.get(claimKey);
        if (!c.linkedCustomerIds.includes(customerId)) c.linkedCustomerIds.push(customerId);
      }
      return { id: customerId, claimKey };
    },
    edit(customerId, oldKey, newKey) {
      if (oldKey === newKey) return;
      if (newKey) {
        const existing = store.get(newKey) || null;
        const decision = resolveClaimAction({ claimExists: !!existing, owner: existing?.customerId, customerId });
        if (decision.action === 'throw') throw new DuplicateIdentityError(decision.existingCustomerId, newKey);
        if (decision.action === 'set') store.set(newKey, { customerId, linkedCustomerIds: [] });
      }
      if (oldKey) { const c = store.get(oldKey); if (c && c.customerId === customerId) store.delete(oldKey); }
    },
    del(customerId, claimKey) {
      if (!claimKey) return;
      const c = store.get(claimKey); if (!c) return;
      if (c.customerId === customerId) {
        if (c.linkedCustomerIds.length > 0) { c.customerId = c.linkedCustomerIds.shift(); }
        else store.delete(claimKey);
      } else if (c.linkedCustomerIds.includes(customerId)) {
        c.linkedCustomerIds = c.linkedCustomerIds.filter((id) => id !== customerId);
      }
    },
    get(claimKey) { return store.get(claimKey) || null; },
  };
}

describe('C1 dup-customer lifecycle (Rule I full-flow simulate)', () => {
  const KEY = deriveClaimKey('1234567890123', ''); // CITIZEN:...

  it('F1 create → claim owned by the first customer', () => {
    const s = makeClaimStore();
    expect(s.create(KEY, 'LC-1').id).toBe('LC-1');
    expect(s.get(KEY)).toEqual({ customerId: 'LC-1', linkedCustomerIds: [] });
  });

  it('F2 second create with same id, no override → DUPLICATE_IDENTITY(LC-1)', () => {
    const s = makeClaimStore();
    s.create(KEY, 'LC-1');
    expect(() => s.create(KEY, 'LC-2')).toThrow(/DUPLICATE_IDENTITY/);
    try { s.create(KEY, 'LC-2'); } catch (e) { expect(e.existingCustomerId).toBe('LC-1'); }
    // loser did NOT get the claim
    expect(s.get(KEY).customerId).toBe('LC-1');
  });

  it('F3 override → flagged dup appended to linkedCustomerIds, owner unchanged', () => {
    const s = makeClaimStore();
    s.create(KEY, 'LC-1');
    s.create(KEY, 'LC-2', true);
    expect(s.get(KEY)).toEqual({ customerId: 'LC-1', linkedCustomerIds: ['LC-2'] });
  });

  it('F4 edit another customer TO the taken id → DUPLICATE_IDENTITY', () => {
    const s = makeClaimStore();
    s.create(KEY, 'LC-1');
    const otherKey = deriveClaimKey('9999999999999', '');
    s.create(otherKey, 'LC-3');
    expect(() => s.edit('LC-3', otherKey, KEY)).toThrow(/DUPLICATE_IDENTITY/);
  });

  it('F5 edit owner to a NEW id → old claim freed, new claimed', () => {
    const s = makeClaimStore();
    s.create(KEY, 'LC-1');
    const newKey = deriveClaimKey('5555555555555', '');
    s.edit('LC-1', KEY, newKey);
    expect(s.get(KEY)).toBeNull();
    expect(s.get(newKey)).toEqual({ customerId: 'LC-1', linkedCustomerIds: [] });
  });

  it('F6 delete the canonical owner WITH a linked dup → promote the dup', () => {
    const s = makeClaimStore();
    s.create(KEY, 'LC-1');
    s.create(KEY, 'LC-2', true); // linked
    s.del('LC-1', KEY);
    expect(s.get(KEY)).toEqual({ customerId: 'LC-2', linkedCustomerIds: [] });
  });

  it('F7 delete an override-dup → removed from linkedCustomerIds, owner stays', () => {
    const s = makeClaimStore();
    s.create(KEY, 'LC-1');
    s.create(KEY, 'LC-2', true);
    s.del('LC-2', KEY);
    expect(s.get(KEY)).toEqual({ customerId: 'LC-1', linkedCustomerIds: [] });
  });

  it('F8 delete the sole owner → claim removed (identity freed for reuse)', () => {
    const s = makeClaimStore();
    s.create(KEY, 'LC-1');
    s.del('LC-1', KEY);
    expect(s.get(KEY)).toBeNull();
    // identity is now reclaimable
    expect(s.create(KEY, 'LC-9').id).toBe('LC-9');
  });

  it('F9 walk-in (no national-id) → no claim, multiple allowed', () => {
    const s = makeClaimStore();
    expect(s.create(null, 'LC-1').claimKey).toBeNull();
    expect(s.create(null, 'LC-2').claimKey).toBeNull();
    expect(s.store.size).toBe(0);
  });

  it('F10 re-entrant: same customer "re-claims" its own id → noop, stays owner', () => {
    const s = makeClaimStore();
    s.create(KEY, 'LC-1');
    s.create(KEY, 'LC-1'); // same owner — resolveClaimAction → noop, no throw
    expect(s.get(KEY)).toEqual({ customerId: 'LC-1', linkedCustomerIds: [] });
  });
});
