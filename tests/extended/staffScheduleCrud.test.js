// ─── Phase 13.2.2 · staff schedule CRUD (mocked Firestore) ────────────────
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

const valid = () => ({
  staffId: 'STAFF-1',
  staffName: 'Alice',
  date: '2026-04-24',
  type: 'work',
  startTime: '09:00',
  endTime: '18:00',
});

describe('Phase 13.2.2 — saveStaffSchedule', () => {
  it('SC1: rejects empty id', async () => {
    await expect(mod.saveStaffSchedule('', valid())).rejects.toThrow(/scheduleId required/);
    await expect(mod.saveStaffSchedule(null, valid())).rejects.toThrow(/scheduleId required/);
  });
  it('SC2: propagates validator error', async () => {
    await expect(mod.saveStaffSchedule('STFSCH-0426-x', { staffId: '' })).rejects.toThrow();
  });
  it('SC3: writes with auto id + timestamps', async () => {
    const { setDoc } = await import('firebase/firestore');
    await mod.saveStaffSchedule('STFSCH-0426-deadbeef', valid());
    expect(setDoc).toHaveBeenCalledOnce();
    const [, payload] = setDoc.mock.calls[0];
    expect(payload.id).toBe('STFSCH-0426-deadbeef');
    expect(payload.scheduleId).toBe('STFSCH-0426-deadbeef');
    expect(payload.staffId).toBe('STAFF-1');
    expect(payload.type).toBe('work');
    expect(typeof payload.createdAt).toBe('string');
    expect(typeof payload.updatedAt).toBe('string');
  });
});

describe('Phase 13.2.2 — getStaffSchedule', () => {
  it('SC4: null for empty id', async () => {
    const { getDoc } = await import('firebase/firestore');
    const r = await mod.getStaffSchedule('');
    expect(r).toBeNull();
    expect(getDoc).not.toHaveBeenCalled();
  });
  it('SC5: null for missing doc', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({ exists: () => false });
    const r = await mod.getStaffSchedule('missing');
    expect(r).toBeNull();
  });
  it('SC6: returns { id, ...data }', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValueOnce({
      exists: () => true, id: 'STFSCH-0426-x', data: () => ({ staffId: 'STAFF-1', type: 'work' }),
    });
    const r = await mod.getStaffSchedule('STFSCH-0426-x');
    expect(r.id).toBe('STFSCH-0426-x');
    expect(r.staffId).toBe('STAFF-1');
  });
});

describe('Phase 13.2.2 — listStaffSchedules', () => {
  const docs = [
    { id: 'E1', data: () => ({ staffId: 'S1', date: '2026-04-01', startTime: '09:00', type: 'work' }) },
    { id: 'E2', data: () => ({ staffId: 'S2', date: '2026-04-24', startTime: '10:00', type: 'work' }) },
    { id: 'E3', data: () => ({ staffId: 'S1', date: '2026-04-24', type: 'holiday' }) },
    { id: 'E4', data: () => ({ staffId: 'S1', date: '2026-04-15', startTime: '08:30', type: 'work' }) },
  ];

  it('SC7: empty list', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({ docs: [] });
    const r = await mod.listStaffSchedules();
    expect(r).toEqual([]);
  });
  it('SC8: sorts by date asc then startTime asc', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({ docs });
    const r = await mod.listStaffSchedules();
    expect(r.map((e) => e.id)).toEqual(['E1', 'E4', 'E3', 'E2']);
  });
  it('SC9: filters by staffId', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({ docs });
    const r = await mod.listStaffSchedules({ staffId: 'S1' });
    expect(r.every((e) => e.staffId === 'S1')).toBe(true);
    expect(r).toHaveLength(3);
  });
  it('SC10: filters by date range (inclusive)', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({ docs });
    const r = await mod.listStaffSchedules({ startDate: '2026-04-10', endDate: '2026-04-24' });
    expect(r.map((e) => e.id)).toEqual(['E4', 'E3', 'E2']);
  });
  it('SC11: combines staffId + date range', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({ docs });
    const r = await mod.listStaffSchedules({ staffId: 'S1', startDate: '2026-04-20' });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('E3');
  });
});

describe('Phase 13.2.2 — deleteStaffSchedule', () => {
  it('SC12: rejects empty id', async () => {
    await expect(mod.deleteStaffSchedule('')).rejects.toThrow(/scheduleId required/);
    await expect(mod.deleteStaffSchedule(null)).rejects.toThrow(/scheduleId required/);
  });
  it('SC13: calls deleteDoc', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    const r = await mod.deleteStaffSchedule('STFSCH-0426-x');
    expect(deleteDoc).toHaveBeenCalledOnce();
    expect(r.success).toBe(true);
  });
});
