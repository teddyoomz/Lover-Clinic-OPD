import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase first
vi.mock('../src/firebase.js', () => ({
  db: { _mock: true },
  auth: { currentUser: null },
  appId: 'loverclinic-opd-4c39b',
}));

const setDocMock = vi.fn();
const getDocsMock = vi.fn();
const queryMock = vi.fn((col, ...constraints) => ({ col, constraints }));
const orderByMock = vi.fn((...a) => ({ kind: 'orderBy', a }));
const whereMock = vi.fn((...a) => ({ kind: 'where', a }));
const collectionMock = vi.fn((...a) => ({ kind: 'col', a }));
const docMock = vi.fn((...a) => ({ kind: 'doc', a, id: a[a.length - 1] }));
const serverTimestampMock = vi.fn(() => '__server_ts__');

vi.mock('firebase/firestore', () => ({
  collection: (...a) => collectionMock(...a),
  doc: (...a) => docMock(...a),
  setDoc: (...a) => setDocMock(...a),
  getDoc: vi.fn(),
  getDocs: (...a) => getDocsMock(...a),
  query: (...a) => queryMock(...a),
  orderBy: (...a) => orderByMock(...a),
  where: (...a) => whereMock(...a),
  limit: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: () => serverTimestampMock(),
  documentId: vi.fn(),
}));

// Mock branchSelection
vi.mock('../src/lib/branchSelection.js', () => ({
  resolveSelectedBranchId: () => 'BR-TEST',
}));

import {
  listRecallCases,
  saveRecallCase,
  setRecallCaseHidden,
} from '../src/lib/backendClient.js';

describe('Phase 29.22 · L2 — backendClient recall cases CRUD', () => {
  beforeEach(() => {
    setDocMock.mockReset();
    getDocsMock.mockReset();
    queryMock.mockClear();
    whereMock.mockClear();
    orderByMock.mockClear();
  });

  describe('listRecallCases', () => {
    it('L2.1 default excludes hidden + orders by caseName', async () => {
      getDocsMock.mockResolvedValueOnce({
        docs: [
          { id: 'C1', data: () => ({ caseName: 'A', defaultDays: 7, isHidden: false }) },
          { id: 'C2', data: () => ({ caseName: 'B', defaultDays: 14, isHidden: false }) },
        ],
      });
      const out = await listRecallCases();
      // Verify where(isHidden, ==, false) was called
      const isHiddenWhereCalls = whereMock.mock.calls.filter(c => c[0] === 'isHidden');
      expect(isHiddenWhereCalls.length).toBeGreaterThan(0);
      expect(isHiddenWhereCalls[0]).toEqual(['isHidden', '==', false]);
      // Verify orderBy(caseName, asc)
      expect(orderByMock).toHaveBeenCalledWith('caseName', 'asc');
      expect(out).toHaveLength(2);
      expect(out[0]).toEqual({ id: 'C1', caseName: 'A', defaultDays: 7, isHidden: false });
    });

    it('L2.2 { includeHidden: true } skips where(isHidden) clause', async () => {
      getDocsMock.mockResolvedValueOnce({ docs: [] });
      whereMock.mockClear();
      await listRecallCases({ includeHidden: true });
      const isHiddenWhereCalls = whereMock.mock.calls.filter(c => c[0] === 'isHidden');
      expect(isHiddenWhereCalls.length).toBe(0);
      // orderBy still called
      expect(orderByMock).toHaveBeenCalledWith('caseName', 'asc');
    });

    it('L2.3 __universal__ marker present', () => {
      expect(listRecallCases.__universal__).toBe(true);
    });
  });

  describe('saveRecallCase', () => {
    it('L2.4 generates CASE- prefix id when omitted + stamps audit fields', async () => {
      setDocMock.mockResolvedValueOnce(undefined);
      await saveRecallCase(
        { caseName: 'PRP 7d', defaultDays: 7, isHidden: false },
        { uid: 'admin-uid-1' }
      );
      expect(setDocMock).toHaveBeenCalled();
      const [docRef, payload] = setDocMock.mock.calls[0];
      expect(docRef.id).toMatch(/^CASE-/);
      expect(payload.caseName).toBe('PRP 7d');
      expect(payload.defaultDays).toBe(7);
      expect(payload.isHidden).toBe(false);
      expect(payload.createdAt).toBe('__server_ts__');
      expect(payload.createdBy).toBe('admin-uid-1');
      expect(payload.updatedAt).toBe('__server_ts__');
      expect(payload.updatedBy).toBe('admin-uid-1');
    });

    it('L2.5 preserves existing id on edit + skips createdAt/createdBy', async () => {
      setDocMock.mockResolvedValueOnce(undefined);
      await saveRecallCase(
        { id: 'CASE-EXISTING-1', caseName: 'X', defaultDays: 7 },
        { uid: 'admin-uid-2' }
      );
      const [docRef, payload, opts] = setDocMock.mock.calls[0];
      expect(docRef.id).toBe('CASE-EXISTING-1');
      expect(opts).toEqual({ merge: true });
      expect(payload).not.toHaveProperty('createdAt');
      expect(payload.updatedAt).toBe('__server_ts__');
      expect(payload.updatedBy).toBe('admin-uid-2');
    });
  });

  describe('setRecallCaseHidden', () => {
    it('L2.6 transitions to hidden stamps hiddenAt+hiddenBy', async () => {
      setDocMock.mockResolvedValueOnce(undefined);
      await setRecallCaseHidden('CASE-1', true, { uid: 'admin-1' });
      const [, payload] = setDocMock.mock.calls[0];
      expect(payload.isHidden).toBe(true);
      expect(payload.hiddenAt).toBe('__server_ts__');
      expect(payload.hiddenBy).toBe('admin-1');
    });

    it('L2.7 unhide clears hiddenAt/hiddenBy', async () => {
      setDocMock.mockResolvedValueOnce(undefined);
      await setRecallCaseHidden('CASE-1', false, { uid: 'admin-1' });
      const [, payload] = setDocMock.mock.calls[0];
      expect(payload.isHidden).toBe(false);
      expect(payload.hiddenAt).toBe(null);
      expect(payload.hiddenBy).toBe(null);
    });
  });
});
