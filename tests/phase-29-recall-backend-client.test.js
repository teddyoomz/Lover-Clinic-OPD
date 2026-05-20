// tests/phase-29-recall-backend-client.test.js
//
// Phase 29.2 (2026-05-14) — TDD test bank for backendClient recall functions.
// B1 list/listen/create/update/outcome/line-send/snooze — shape + safe-by-default.
// Uses mocked firebase/firestore + firebase.js (no real network/DB).
//
// Verifies:
//  - Functions exist and are exported
//  - Listener returns unsubscribe fn
//  - createRecall returns {id} with RECALL- prefix
//  - createRecallPair returns 2 distinct RECALL- ids
//  - Safe-by-default (BS-13): list with no branchId + no allBranches → []

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/firebase.js', () => ({
  db: { __mock: 'db' },
  auth: { currentUser: { uid: 'TEST-UID', email: 'test@loverclinic.com', displayName: 'Test Admin' } },
  appId: 'loverclinic-opd-4c39b',
}));

vi.mock('../src/lib/branchSelection.js', () => ({
  resolveSelectedBranchId: vi.fn(() => 'BR-TEST'),
}));

vi.mock('firebase/firestore', async () => {
  const setDoc = vi.fn(async () => {});
  const updateDoc = vi.fn(async () => {});
  const deleteDoc = vi.fn(async () => {});
  const getDoc = vi.fn(async () => ({ exists: () => false, id: 'mock-id', data: () => ({}) }));
  const getDocs = vi.fn(async () => ({ docs: [] }));
  const onSnapshot = vi.fn((q, onNext) => {
    setTimeout(() => onNext?.({ docs: [] }), 0);
    return () => {};
  });
  const writeBatch = vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => {}),
  }));
  const runTransaction = vi.fn(async (_db, fn) => fn({
    get: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }));
  return {
    collection: vi.fn((...args) => ({ __coll: args.join('/') })),
    query: vi.fn((c, ...cl) => ({ __q: true, _coll: c, _clauses: cl })),
    where: vi.fn((field, op, val) => ({ where: { field, op, val } })),
    orderBy: vi.fn((field, dir) => ({ orderBy: { field, dir } })),
    limit: vi.fn(n => ({ limit: n })),
    doc: vi.fn((db, ...path) => ({ __doc: path.join('/') })),
    setDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot,
    serverTimestamp: vi.fn(() => 'SERVER-TS'),
    writeBatch, runTransaction,
    documentId: vi.fn(() => '__name__'),
    Timestamp: { fromDate: vi.fn(d => ({ _d: d })) },
  };
});

import {
  listRecalls, listRecallsForCustomer,
  listenToRecalls, listenToRecallsForCustomer,
  createRecall, createRecallPair,
  updateRecall, recordRecallOutcome, recordRecallLineSend, snoozeRecall,
} from '../src/lib/backendClient.js';

describe('Phase 29 · B1 backendClient recall functions', () => {
  it('B1.1 listRecalls accepts {branchId} filter and returns array', async () => {
    const out = await listRecalls({ branchId: 'BR-1' });
    expect(Array.isArray(out)).toBe(true);
  });
  it('B1.2 listRecallsForCustomer accepts customerId and returns array', async () => {
    const out = await listRecallsForCustomer('LC-1');
    expect(Array.isArray(out)).toBe(true);
  });
  it('B1.3 listenToRecalls returns unsubscribe function', () => {
    const unsub = listenToRecalls({ branchId: 'BR-1' }, () => {}, () => {});
    expect(typeof unsub).toBe('function');
  });
  it('B1.4 listenToRecallsForCustomer returns unsubscribe function', () => {
    const unsub = listenToRecallsForCustomer('LC-1', () => {}, () => {});
    expect(typeof unsub).toBe('function');
  });
  it('B1.5 createRecall returns {id} with RECALL- prefix', async () => {
    const out = await createRecall({
      branchId: 'BR-1', customerId: 'LC-1', customerName: 'X',
      slotType: 'aftercare', recallDate: '2026-05-15', reason: 'x',
    });
    expect(out.id).toMatch(/^RECALL-/);
  });
  it('B1.6 createRecallPair returns {id1, id2} both with RECALL- prefix and distinct', async () => {
    const out = await createRecallPair({
      branchId: 'BR-1', customerId: 'LC-1', customerName: 'X',
      slot1: { recallDate: '2026-05-15', reason: 'x' },
      slot2: { recallDate: '2026-11-14', reason: 'y' },
    });
    expect(out.id1).toMatch(/^RECALL-/);
    expect(out.id2).toMatch(/^RECALL-/);
    expect(out.id1).not.toBe(out.id2);
  });
  it('B1.7 updateRecall resolves without throw', async () => {
    await expect(updateRecall('RECALL-1', { status: 'done' })).resolves.toBeUndefined();
  });
  it('B1.8 recordRecallOutcome resolves with recordedBy (2026-05-20 Q2=B)', async () => {
    await expect(recordRecallOutcome('RECALL-1', { outcome: 'will-come', outcomeNote: 'ok', recordedBy: { name: 'พิมพ์ชนก', staffId: 'S1' } })).resolves.toBeUndefined();
  });
  it('B1.8b recordRecallOutcome throws when recordedBy missing (required staff)', async () => {
    await expect(recordRecallOutcome('RECALL-1', { outcome: 'will-come' })).rejects.toThrow('พนักงานผู้ลงบันทึก');
  });
  it('B1.9 recordRecallLineSend resolves without throw', async () => {
    await expect(recordRecallLineSend('RECALL-1', { templateId: 'recall-default', messageText: 'hi' })).resolves.toBeUndefined();
  });
  it('B1.10 snoozeRecall resolves without throw', async () => {
    await expect(snoozeRecall('RECALL-1', '2026-05-20')).resolves.toBeUndefined();
  });
});

describe('Phase 29 · B2 safe-by-default (BS-13)', () => {
  beforeEach(async () => {
    // Reset branchSelection mock — return null to simulate no branch
    const branchSelection = await import('../src/lib/branchSelection.js');
    branchSelection.resolveSelectedBranchId.mockReturnValue(null);
  });
  it('B2.1 listRecalls with no opts + no resolved branch → returns []', async () => {
    const out = await listRecalls();
    expect(out).toEqual([]);
  });
  it('B2.2 listRecalls with {} + no resolved branch → returns []', async () => {
    const out = await listRecalls({});
    expect(out).toEqual([]);
  });
  it('B2.3 listenToRecalls with no opts + no resolved branch → fires onChange([]) and returns noop', () => {
    return new Promise((resolve) => {
      const unsub = listenToRecalls({}, (data) => {
        expect(data).toEqual([]);
        expect(typeof unsub).toBe('function');
        resolve();
      });
    });
  });
  it('B2.4 listenToRecallsForCustomer with empty customerId → fires onChange([]) and returns noop', () => {
    return new Promise((resolve) => {
      const unsub = listenToRecallsForCustomer('', (data) => {
        expect(data).toEqual([]);
        expect(typeof unsub).toBe('function');
        resolve();
      });
    });
  });
  it('B2.5 listRecallsForCustomer with empty id → returns []', async () => {
    const out = await listRecallsForCustomer('');
    expect(out).toEqual([]);
  });
});

describe('Phase 29 · B3 universal markers (BSA)', () => {
  it('B3.1 listenToRecallsForCustomer marked __universal__', () => {
    expect(listenToRecallsForCustomer.__universal__).toBe(true);
  });
});
