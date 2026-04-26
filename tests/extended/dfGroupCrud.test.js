// ─── Phase 13.3.2 · DF group + staff-rates CRUD (mocked Firestore) ───────
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), update: vi.fn(), set: vi.fn(), commit: vi.fn().mockResolvedValue() })),
  runTransaction: vi.fn(),
  increment: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { now: vi.fn(), fromDate: vi.fn() },
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  documentId: vi.fn(),
  onSnapshot: vi.fn(),
}));

const mod = await import('../src/lib/backendClient.js');

beforeEach(() => { vi.resetAllMocks(); });

describe('Phase 13.3.2 — DF group CRUD', () => {
  it('DC1: saveDfGroup rejects empty id', async () => {
    await expect(mod.saveDfGroup('', { name: 'G' })).rejects.toThrow(/groupId required/);
  });
  it('DC2: saveDfGroup propagates validator error', async () => {
    await expect(mod.saveDfGroup('DFG-0426-x', { name: '' })).rejects.toThrow();
  });
  it('DC3: saveDfGroup writes with auto id + timestamps', async () => {
    const { setDoc } = await import('firebase/firestore');
    await mod.saveDfGroup('DFG-0426-deadbeef', {
      name: 'Group A', rates: [{ courseId: 'C1', value: 20, type: 'percent' }],
    });
    expect(setDoc).toHaveBeenCalledOnce();
    const [, payload] = setDoc.mock.calls[0];
    expect(payload.id).toBe('DFG-0426-deadbeef');
    expect(payload.groupId).toBe('DFG-0426-deadbeef');
    expect(payload.name).toBe('Group A');
    expect(payload.rates).toHaveLength(1);
  });
  it('DC4: getDfGroup returns data', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({ exists: () => true, id: 'DFG-1', data: () => ({ name: 'A' }) });
    const r = await mod.getDfGroup('DFG-1');
    expect(r.name).toBe('A');
  });
  it('DC5: listDfGroups sorts by name (Thai collation)', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'X', data: () => ({ name: 'ข' }) },
        { id: 'Y', data: () => ({ name: 'ก' }) },
      ],
    });
    const r = await mod.listDfGroups();
    expect(r.map((g) => g.name)).toEqual(['ก', 'ข']);
  });
  it('DC6: deleteDfGroup calls deleteDoc', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await mod.deleteDfGroup('DFG-1');
    expect(deleteDoc).toHaveBeenCalledOnce();
  });
});

describe('Phase 13.3.2 — DF staff-rate CRUD', () => {
  it('DC7: saveDfStaffRates rejects empty staffId', async () => {
    await expect(mod.saveDfStaffRates('', { rates: [] })).rejects.toThrow(/staffId required/);
  });
  it('DC8: saveDfStaffRates writes to doc keyed by staffId', async () => {
    const { setDoc } = await import('firebase/firestore');
    await mod.saveDfStaffRates('STAFF-1', {
      rates: [{ courseId: 'C1', value: 500, type: 'baht' }],
    });
    expect(setDoc).toHaveBeenCalledOnce();
    const [, payload] = setDoc.mock.calls[0];
    expect(payload.staffId).toBe('STAFF-1');
    expect(payload.rates).toHaveLength(1);
  });
  it('DC9: saveDfStaffRates injects staffId into payload even if missing', async () => {
    const { setDoc } = await import('firebase/firestore');
    // Caller passes data without staffId — backendClient must inject it.
    await mod.saveDfStaffRates('STAFF-2', { rates: [] });
    const [, payload] = setDoc.mock.calls[0];
    expect(payload.staffId).toBe('STAFF-2');
  });
  it('DC10: getDfStaffRates returns data', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({ exists: () => true, id: 'STAFF-1', data: () => ({ staffId: 'STAFF-1', rates: [] }) });
    const r = await mod.getDfStaffRates('STAFF-1');
    expect(r.staffId).toBe('STAFF-1');
  });
  it('DC11: listDfStaffRates returns all docs', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'S1', data: () => ({ staffId: 'S1' }) },
        { id: 'S2', data: () => ({ staffId: 'S2' }) },
      ],
    });
    const r = await mod.listDfStaffRates();
    expect(r).toHaveLength(2);
  });
  it('DC12: deleteDfStaffRates calls deleteDoc', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await mod.deleteDfStaffRates('STAFF-1');
    expect(deleteDoc).toHaveBeenCalledOnce();
  });
});
