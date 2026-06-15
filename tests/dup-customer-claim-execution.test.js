// Adversarial-review follow-up (workflow wdl609m33, ruleq findings) — EXECUTE the
// real addCustomer/updateCustomerFromForm claim logic (not source-grep / not a
// pure mirror). An in-memory Firestore-tx mock backs the stores so the SUT's
// resolveClaimAction, the DUPLICATE_IDENTITY throw, the override append, and the
// edit-reclaim ALL actually run. (Real OCC concurrency is the L2 e2e; this proves
// the decision logic executes end-to-end inside the production code path.)
import { describe, it, expect, beforeEach, vi } from 'vitest';

const claimStore = new Map();    // claimKey -> { customerId, linkedCustomerIds }
const customerStore = new Map(); // customerId -> data
let counter = null;
// Real Firestore paths are canonical: artifacts/test/public/data/<coll>/<id>.
const after = (p, seg) => { const i = p.indexOf(seg); return i >= 0 ? p.slice(i + seg.length) : null; };
const claimKeyOf = (p) => after(p, '/be_customer_identity/');
const custIdOf = (p) => after(p, '/be_customers/');

vi.mock('../src/firebase.js', () => ({ db: { __db: true }, auth: { currentUser: { uid: 'admin-1' } }, appId: 'test' }));

function makeTx() {
  return {
    get: async (ref) => {
      const p = ref.__doc || '';
      const ck = claimKeyOf(p); if (ck != null) { const v = claimStore.get(ck); return { exists: () => !!v, data: () => v }; }
      if (p.includes('/be_customer_counter/')) return { exists: () => counter != null, data: () => counter };
      const id = custIdOf(p); if (id != null) { const v = customerStore.get(id); return { exists: () => !!v, data: () => v }; }
      return { exists: () => false, data: () => undefined };
    },
    set: (ref, data) => { const p = ref.__doc || ''; const ck = claimKeyOf(p); if (ck != null) return claimStore.set(ck, data); if (p.includes('/be_customer_counter/')) { counter = data; return; } const id = custIdOf(p); if (id != null) customerStore.set(id, data); },
    update: (ref, patch) => { const p = ref.__doc || ''; const ck = claimKeyOf(p); if (ck != null) { claimStore.set(ck, { ...(claimStore.get(ck) || {}), ...patch }); return; } const id = custIdOf(p); if (id != null) customerStore.set(id, { ...(customerStore.get(id) || {}), ...patch }); },
    delete: (ref) => { const ck = claimKeyOf(ref.__doc || ''); if (ck != null) claimStore.delete(ck); },
  };
}

vi.mock('firebase/firestore', () => ({
  doc: (db, ...path) => ({ __doc: path.join('/') }),
  collection: (db, ...path) => ({ __col: path.join('/') }),
  getDoc: vi.fn(async (ref) => {
    const p = ref.__doc || '';
    const ck = claimKeyOf(p); if (ck != null) { const v = claimStore.get(ck); return { exists: () => !!v, data: () => v }; }
    const id = custIdOf(p); if (id != null) { const v = customerStore.get(id); return { exists: () => !!v, data: () => v }; }
    return { exists: () => false, data: () => undefined };
  }),
  getDocs: vi.fn(),
  setDoc: vi.fn(async (ref, data) => { const id = custIdOf(ref.__doc || ''); if (id != null) customerStore.set(id, data); }),
  updateDoc: vi.fn(async (ref, patch) => { const id = custIdOf(ref.__doc || ''); if (id != null) customerStore.set(id, { ...(customerStore.get(id) || {}), ...patch }); }),
  deleteDoc: vi.fn(),
  query: vi.fn(), where: vi.fn(), limit: vi.fn(), orderBy: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) })),
  runTransaction: vi.fn(async (db, fn) => fn(makeTx())),
  onSnapshot: vi.fn(),
  serverTimestamp: () => '__ts__',
}));
vi.mock('../src/lib/storageClient.js', () => ({ uploadFile: vi.fn(), buildStoragePath: () => 'p', compressImage: vi.fn(), deleteFile: vi.fn() }));

let addCustomer, updateCustomerFromForm;
beforeEach(async () => {
  claimStore.clear(); customerStore.clear(); counter = null;
  vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
  ({ addCustomer, updateCustomerFromForm } = await import('../src/lib/backendClient.js'));
});

const CID = '1234567890123';
const KEY = 'CITIZEN:1234567890123';
const baseForm = { firstname: 'อา', lastname: 'บี', citizen_id: CID };

describe('EXECUTION: addCustomer claims the identity', () => {
  it('free identity → claim created for the new customer', async () => {
    const { id } = await addCustomer({ ...baseForm }, { branchId: 'BR', createdBy: 'admin-1' });
    expect(claimStore.get(KEY)).toBeTruthy();
    expect(claimStore.get(KEY).customerId).toBe(id);
    expect(claimStore.get(KEY).linkedCustomerIds).toEqual([]);
    expect(customerStore.get(id)._identityClaimKey).toBe(KEY);
  });

  it('taken identity, no override → throws DUPLICATE_IDENTITY with the existing id (pre-check)', async () => {
    claimStore.set(KEY, { customerId: 'LC-EXISTING', linkedCustomerIds: [] });
    await expect(addCustomer({ ...baseForm }, { branchId: 'BR' })).rejects.toMatchObject({ code: 'DUPLICATE_IDENTITY', existingCustomerId: 'LC-EXISTING' });
    // loser created NO customer doc
    expect([...customerStore.keys()].length).toBe(0);
  });

  it('override → appends to linkedCustomerIds + flags the dup; canonical owner unchanged', async () => {
    claimStore.set(KEY, { customerId: 'LC-EXISTING', linkedCustomerIds: [] });
    const { id } = await addCustomer({ ...baseForm }, { branchId: 'BR', createdBy: 'admin-1', overrideDuplicate: true });
    expect(claimStore.get(KEY).customerId).toBe('LC-EXISTING');           // owner unchanged
    expect(claimStore.get(KEY).linkedCustomerIds).toContain(id);          // dup recorded
    expect(customerStore.get(id)._duplicateOfCustomerId).toBe('LC-EXISTING');
  });

  it('walk-in (no national id) → no claim written', async () => {
    await addCustomer({ firstname: 'วอล์ค', lastname: 'อิน' }, { branchId: 'BR' });
    expect(claimStore.size).toBe(0);
  });
});

describe('EXECUTION: updateCustomerFromForm edit-reclaim', () => {
  it('changing the national id frees the old claim + claims the new one', async () => {
    // seed an existing customer that owns the old claim
    const oldKey = 'CITIZEN:5555555555555';
    customerStore.set('LC-1', { firstname: 'อา', lastname: 'บี', citizen_id: '5555555555555', _identityClaimKey: oldKey });
    claimStore.set(oldKey, { customerId: 'LC-1', linkedCustomerIds: [] });
    await updateCustomerFromForm('LC-1', { firstname: 'อา', lastname: 'บี', citizen_id: CID, hn_no: 'LC-1' }, { updatedBy: 'admin-1' });
    expect(claimStore.has(oldKey)).toBe(false);              // old freed
    expect(claimStore.get(KEY).customerId).toBe('LC-1');     // new claimed
    expect(customerStore.get('LC-1')._identityClaimKey).toBe(KEY);
  });

  it('editing TO a national id owned by ANOTHER customer → throws DUPLICATE_IDENTITY', async () => {
    customerStore.set('LC-1', { firstname: 'อา', lastname: 'บี', citizen_id: '5555555555555', _identityClaimKey: 'CITIZEN:5555555555555' });
    claimStore.set('CITIZEN:5555555555555', { customerId: 'LC-1', linkedCustomerIds: [] });
    claimStore.set(KEY, { customerId: 'LC-OTHER', linkedCustomerIds: [] }); // someone else owns the target id
    await expect(updateCustomerFromForm('LC-1', { firstname: 'อา', lastname: 'บี', citizen_id: CID, hn_no: 'LC-1' }, { updatedBy: 'admin-1' }))
      .rejects.toMatchObject({ code: 'DUPLICATE_IDENTITY' });
    // old claim NOT freed (tx aborted)
    expect(claimStore.get('CITIZEN:5555555555555').customerId).toBe('LC-1');
  });
});
