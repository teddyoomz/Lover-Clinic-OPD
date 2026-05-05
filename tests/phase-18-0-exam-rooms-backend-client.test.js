// ─── Phase 18.0 Task 2 — backendClient exam-room CRUD ───────────────────
// Tests the be_exam_rooms layer 1 listers/writers + branchId stamping.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockOnSnapshot = vi.fn();
const mockQuery = vi.fn((col, ...constraints) => ({ __col: col, __constraints: constraints }));
const mockWhere = vi.fn((field, op, val) => ({ __where: [field, op, val] }));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDocs: (...a) => mockGetDocs(...a),
    getDoc: (...a) => mockGetDoc(...a),
    setDoc: (...a) => mockSetDoc(...a),
    deleteDoc: (...a) => mockDeleteDoc(...a),
    onSnapshot: (...a) => mockOnSnapshot(...a),
    serverTimestamp: () => '__SERVER_TIMESTAMP__',
    query: (...a) => mockQuery(...a),
    where: (...a) => mockWhere(...a),
    collection: vi.fn(() => ({ __col: 'be_exam_rooms' })),
    doc: vi.fn((db, ...path) => ({ __doc: true, __path: path })),
    runTransaction: vi.fn(),
    writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() })),
  };
});

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));
vi.mock('../src/lib/branchSelection.js', () => ({
  resolveSelectedBranchId: vi.fn(() => 'BR-CALLER'),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Phase 18.0 — backendClient exam-room CRUD', () => {
  describe('B1 listExamRooms', () => {
    it('B1.1 with {branchId} runs single query filtered by branchId', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [{ id: 'EXR-1', data: () => ({ name: 'A', branchId: 'BR-A', sortOrder: 0 }) }],
      });
      const { listExamRooms } = await import('../src/lib/backendClient.js');
      const items = await listExamRooms({ branchId: 'BR-A' });
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
      expect(items).toEqual([{ id: 'EXR-1', name: 'A', branchId: 'BR-A', sortOrder: 0 }]);
    });

    it('B1.2 with {allBranches:true} bypasses branchId filter', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [{ id: 'EXR-1', data: () => ({}) }, { id: 'EXR-2', data: () => ({}) }],
      });
      const { listExamRooms } = await import('../src/lib/backendClient.js');
      const items = await listExamRooms({ allBranches: true });
      expect(items).toHaveLength(2);
      // No branchId where-clause when allBranches is true
      const branchWhereCalls = mockWhere.mock.calls.filter(c => c[0] === 'branchId');
      expect(branchWhereCalls).toHaveLength(0);
    });

    it('B1.3 with {status:"ใช้งาน"} adds status where-clause', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [] });
      const { listExamRooms } = await import('../src/lib/backendClient.js');
      await listExamRooms({ branchId: 'BR-A', status: 'ใช้งาน' });
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'ใช้งาน');
    });

    it('B1.4 sorts by sortOrder asc then name (Thai locale)', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          { id: 'A', data: () => ({ name: 'หย', sortOrder: 2 }) },
          { id: 'B', data: () => ({ name: 'หก', sortOrder: 0 }) },
          { id: 'C', data: () => ({ name: 'หม', sortOrder: 1 }) },
        ],
      });
      const { listExamRooms } = await import('../src/lib/backendClient.js');
      const items = await listExamRooms({ allBranches: true });
      expect(items.map(i => i.id)).toEqual(['B', 'C', 'A']);
    });
  });

  describe('B2 saveExamRoom — branchId stamping', () => {
    it('B2.1 stamps branchId from _resolveBranchIdForWrite on create', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);
      const { saveExamRoom } = await import('../src/lib/backendClient.js');
      await saveExamRoom('EXR-NEW', { name: 'ห้องดริป', sortOrder: 0 });
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const [, payload] = mockSetDoc.mock.calls[0];
      expect(payload.branchId).toBe('BR-CALLER');
      expect(payload.name).toBe('ห้องดริป');
      expect(payload.examRoomId).toBe('EXR-NEW');
      expect(payload.createdAt).toBeTruthy();
      expect(payload.updatedAt).toBeTruthy();
    });

    it('B2.2 explicit opts.branchId overrides resolver default', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);
      const { saveExamRoom } = await import('../src/lib/backendClient.js');
      await saveExamRoom('EXR-X', { name: 'X' }, { branchId: 'BR-EXPLICIT' });
      const [, payload] = mockSetDoc.mock.calls[0];
      expect(payload.branchId).toBe('BR-EXPLICIT');
    });

    it('B2.3 normalizes via normalizeExamRoom (trims name, defaults status)', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);
      const { saveExamRoom } = await import('../src/lib/backendClient.js');
      await saveExamRoom('EXR-1', { name: '  ห้อง  ', status: '' });
      const [, payload] = mockSetDoc.mock.calls[0];
      expect(payload.name).toBe('ห้อง');
      expect(payload.status).toBe('ใช้งาน');
    });

    it('B2.4 throws on validation failure (does not call setDoc)', async () => {
      const { saveExamRoom } = await import('../src/lib/backendClient.js');
      await expect(saveExamRoom('EXR-1', { name: '' })).rejects.toThrow(/ชื่อห้อง/);
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('B2.5 throws on missing examRoomId', async () => {
      const { saveExamRoom } = await import('../src/lib/backendClient.js');
      await expect(saveExamRoom('', { name: 'X' })).rejects.toThrow(/examRoomId required/);
    });
  });

  describe('B3 deleteExamRoom', () => {
    it('B3.1 calls deleteDoc on the right doc', async () => {
      mockDeleteDoc.mockResolvedValueOnce(undefined);
      const { deleteExamRoom } = await import('../src/lib/backendClient.js');
      await deleteExamRoom('EXR-DEL');
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    });
    it('B3.2 throws on missing id', async () => {
      const { deleteExamRoom } = await import('../src/lib/backendClient.js');
      await expect(deleteExamRoom('')).rejects.toThrow(/examRoomId required/);
    });
  });

  describe('B4 listenToExamRoomsByBranch', () => {
    it('B4.1 subscribes with branchId where-clause + returns unsubscribe', async () => {
      const fakeUnsub = vi.fn();
      mockOnSnapshot.mockImplementationOnce((q, onNext) => {
        onNext({ docs: [{ id: 'EXR-1', data: () => ({ branchId: 'BR-A', name: 'A' }) }] });
        return fakeUnsub;
      });
      const { listenToExamRoomsByBranch } = await import('../src/lib/backendClient.js');
      const onChange = vi.fn();
      const unsub = listenToExamRoomsByBranch('BR-A', onChange, vi.fn());
      expect(mockWhere).toHaveBeenCalledWith('branchId', '==', 'BR-A');
      expect(onChange).toHaveBeenCalledWith([{ id: 'EXR-1', branchId: 'BR-A', name: 'A' }]);
      expect(unsub).toBe(fakeUnsub);
    });

    it('B4.2 onError forwarded to caller', async () => {
      mockOnSnapshot.mockImplementationOnce((q, onNext, onError) => {
        onError(new Error('rules denied'));
        return vi.fn();
      });
      const { listenToExamRoomsByBranch } = await import('../src/lib/backendClient.js');
      const onError = vi.fn();
      listenToExamRoomsByBranch('BR-A', vi.fn(), onError);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'rules denied' }));
    });
  });

  describe('B5 getExamRoom', () => {
    it('B5.1 returns null on missing id', async () => {
      const { getExamRoom } = await import('../src/lib/backendClient.js');
      expect(await getExamRoom('')).toBeNull();
    });
    it('B5.2 returns doc when exists', async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, id: 'EXR-1', data: () => ({ name: 'A' }) });
      const { getExamRoom } = await import('../src/lib/backendClient.js');
      const out = await getExamRoom('EXR-1');
      expect(out).toEqual({ id: 'EXR-1', name: 'A' });
    });
    it('B5.3 returns null when missing', async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });
      const { getExamRoom } = await import('../src/lib/backendClient.js');
      expect(await getExamRoom('EXR-X')).toBeNull();
    });
  });
});
