// tests/listen-to-products-bs18.test.js
// V43-followup — BS-18 listenToProducts Layer 1/2 (mirror V54/BS-13 + V75/BS-16)

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => {
  const onSnapshotMock = vi.fn((q, onNext, onError) => {
    onSnapshotMock.lastCallArgs = { q, onNext, onError };
    return () => { onSnapshotMock.unsubscribed = true; };
  });
  return {
    collection: vi.fn((db, path) => ({ __path: path })),
    query: vi.fn((col, ...cs) => ({ __col: col, __constraints: cs })),
    where: vi.fn((field, op, value) => ({ __where: { field, op, value } })),
    orderBy: vi.fn((field, dir) => ({ __orderBy: { field, dir } })),
    onSnapshot: onSnapshotMock,
    doc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    addDoc: vi.fn(),
    runTransaction: vi.fn(),
    serverTimestamp: vi.fn(),
    writeBatch: vi.fn(),
    Timestamp: { now: vi.fn() },
    FieldValue: { delete: vi.fn(), serverTimestamp: vi.fn() },
    deleteField: vi.fn(),
    increment: vi.fn(),
    arrayUnion: vi.fn(),
    arrayRemove: vi.fn(),
  };
});
vi.mock('../src/firebase.js', () => ({ db: {}, auth: { currentUser: null }, appId: 'test-app' }));

describe('BS-18 listenToProducts — Layer 1 safe-by-default', () => {
  let mod;
  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../src/lib/backendClient.js');
  });

  it('B1 returns empty + noop unsub when no branchId AND !allBranches', () => {
    const onChange = vi.fn();
    const unsub = mod.listenToProducts({}, onChange);
    expect(onChange).toHaveBeenCalledWith([]);
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('B2 returns empty when branchId is empty string', () => {
    const onChange = vi.fn();
    mod.listenToProducts({ branchId: '' }, onChange);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('B3 emits Firestore query when branchId provided', async () => {
    const fb = await import('firebase/firestore');
    const onChange = vi.fn();
    mod.listenToProducts({ branchId: 'BR-A' }, onChange);
    expect(fb.where).toHaveBeenCalledWith('branchId', '==', 'BR-A');
    expect(fb.onSnapshot).toHaveBeenCalled();
  });

  it('B4 emits cross-branch query when allBranches:true (no where clause)', async () => {
    const fb = await import('firebase/firestore');
    fb.where.mockClear();
    const onChange = vi.fn();
    mod.listenToProducts({ allBranches: true }, onChange);
    expect(fb.where).not.toHaveBeenCalled();
    expect(fb.onSnapshot).toHaveBeenCalled();
  });

  it('B5 maps snapshot docs with V38 spread-order (doc.id wins)', async () => {
    const fb = await import('firebase/firestore');
    const onChange = vi.fn();
    mod.listenToProducts({ branchId: 'BR-A' }, onChange);
    const { onNext } = fb.onSnapshot.lastCallArgs;
    // Simulate snapshot with stray data.id (V38 lesson)
    const fakeSnap = {
      docs: [
        { id: 'CANONICAL', data: () => ({ id: 'LEGACY-NUMERIC', productName: 'X' }) },
      ],
    };
    onNext(fakeSnap);
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'CANONICAL', productName: 'X' },
    ]);
  });

  it('B6 forwards onError callback', async () => {
    const fb = await import('firebase/firestore');
    const onChange = vi.fn();
    const onError = vi.fn();
    mod.listenToProducts({ branchId: 'BR-A' }, onChange, onError);
    const { onError: capturedErr } = fb.onSnapshot.lastCallArgs;
    capturedErr(new Error('test'));
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('BS-18 listenToProducts — Layer 2 wrapper (scopedDataLayer)', () => {
  beforeEach(() => { vi.resetModules(); });

  it('L1 auto-injects resolveSelectedBranchId when no opts', async () => {
    vi.doMock('../src/lib/branchSelection.js', () => ({
      resolveSelectedBranchId: () => 'BR-RESOLVED',
    }));
    const calls = [];
    vi.doMock('../src/lib/backendClient.js', () => ({
      listenToProducts: (opts, ...rest) => { calls.push(opts); return () => {}; },
    }));
    const sdl = await import('../src/lib/scopedDataLayer.js');
    sdl.listenToProducts({}, () => {});
    expect(calls[0]).toMatchObject({ branchId: 'BR-RESOLVED' });
  });

  it('L2 returns empty + noop when resolveSelectedBranchId returns null', async () => {
    vi.doMock('../src/lib/branchSelection.js', () => ({
      resolveSelectedBranchId: () => null,
    }));
    vi.doMock('../src/lib/backendClient.js', () => ({
      listenToProducts: () => { throw new Error('should not be called'); },
    }));
    const sdl = await import('../src/lib/scopedDataLayer.js');
    const onChange = vi.fn();
    const unsub = sdl.listenToProducts({}, onChange);
    expect(onChange).toHaveBeenCalledWith([]);
    expect(typeof unsub).toBe('function');
  });

  it('L3 passes through when explicit branchId provided', async () => {
    const calls = [];
    vi.doMock('../src/lib/branchSelection.js', () => ({
      resolveSelectedBranchId: () => 'WRONG',
    }));
    vi.doMock('../src/lib/backendClient.js', () => ({
      listenToProducts: (opts, ...rest) => { calls.push(opts); return () => {}; },
    }));
    const sdl = await import('../src/lib/scopedDataLayer.js');
    sdl.listenToProducts({ branchId: 'BR-EXPLICIT' }, () => {});
    expect(calls[0].branchId).toBe('BR-EXPLICIT');
  });

  it('L4 passes through when allBranches:true', async () => {
    const calls = [];
    vi.doMock('../src/lib/branchSelection.js', () => ({
      resolveSelectedBranchId: () => 'IGNORED',
    }));
    vi.doMock('../src/lib/backendClient.js', () => ({
      listenToProducts: (opts, ...rest) => { calls.push(opts); return () => {}; },
    }));
    const sdl = await import('../src/lib/scopedDataLayer.js');
    sdl.listenToProducts({ allBranches: true }, () => {});
    expect(calls[0].allBranches).toBe(true);
    expect(calls[0].branchId).toBeUndefined();
  });
});
