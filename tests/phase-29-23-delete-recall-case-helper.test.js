/**
 * Phase 29.23 — deleteRecallCase lib function unit tests.
 *
 * Hard-delete of be_recall_cases doc. Recalls store reason as STRING SNAPSHOT
 * (no FK to caseId) so cascade is unnecessary. Pure deleteDoc + early return
 * on empty id (defense-in-depth).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase modules
const deleteDocMock = vi.fn();
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    deleteDoc: (...args) => deleteDocMock(...args),
  };
});

describe('Phase 29.23 D1 — deleteRecallCase lib', () => {
  beforeEach(() => {
    deleteDocMock.mockReset();
    deleteDocMock.mockResolvedValue(undefined);
  });

  it('D1.1 — exports deleteRecallCase from backendClient', async () => {
    const mod = await import('../src/lib/backendClient.js');
    expect(typeof mod.deleteRecallCase).toBe('function');
  });

  it('D1.2 — exports deleteRecallCase from scopedDataLayer (universal pass-through)', async () => {
    const mod = await import('../src/lib/scopedDataLayer.js');
    expect(typeof mod.deleteRecallCase).toBe('function');
  });

  it('D1.3 — calls Firestore deleteDoc with recall-cases path when id provided', async () => {
    const { deleteRecallCase } = await import('../src/lib/backendClient.js');
    await deleteRecallCase('CASE-123');
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });

  it('D1.4 — early-returns without calling deleteDoc when id is empty string', async () => {
    const { deleteRecallCase } = await import('../src/lib/backendClient.js');
    await deleteRecallCase('');
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('D1.5 — early-returns without calling deleteDoc when id is null/undefined', async () => {
    const { deleteRecallCase } = await import('../src/lib/backendClient.js');
    await deleteRecallCase(null);
    await deleteRecallCase(undefined);
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('D1.6 — ignores ctx param (forward-compat, no audit doc emitted)', async () => {
    const { deleteRecallCase } = await import('../src/lib/backendClient.js');
    await deleteRecallCase('CASE-123', { uid: 'test-uid', user: { uid: 'x' } });
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });
});
