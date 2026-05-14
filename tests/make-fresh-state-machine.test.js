import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMakeFreshStateMachine } from '../src/lib/makeFreshStateMachine.js';

const baseOpts = () => ({
  exportEndpoint: '/api/admin/branch-backup-export',
  makeFreshEndpoint: '/api/admin/branch-make-fresh',
  bucketDefaults: { a: true, b: false },
  fetcher: vi.fn(),
  scopeBody: { branchId: 'BR-X' },
  confirmName: 'BR-X-NAME',
});

describe('SM1 useMakeFreshStateMachine', () => {
  it('SM1.1 initial state', () => {
    const { result } = renderHook(() => useMakeFreshStateMachine(baseOpts()));
    expect(result.current.phase).toBe('idle');
    expect(result.current.checkedBuckets).toEqual({ a: true, b: false });
    expect(result.current.advancedOpen).toBe(false);
    expect(result.current.confirmText).toBe('');
    expect(result.current.matches).toBe(false);
    expect(result.current.tickedBucketIds).toEqual(['a']);
  });

  it('SM1.2 handleBucketToggle flips bucket', () => {
    const { result } = renderHook(() => useMakeFreshStateMachine(baseOpts()));
    act(() => result.current.handleBucketToggle('a'));
    expect(result.current.checkedBuckets.a).toBe(false);
    expect(result.current.tickedBucketIds).toEqual([]);
    act(() => result.current.handleBucketToggle('b'));
    expect(result.current.checkedBuckets.b).toBe(true);
    expect(result.current.tickedBucketIds).toEqual(['b']);
  });

  it('SM1.3 matches returns true on exact confirmText', () => {
    const { result } = renderHook(() => useMakeFreshStateMachine(baseOpts()));
    act(() => result.current.setConfirmText('partial'));
    expect(result.current.matches).toBe(false);
    act(() => result.current.setConfirmText('BR-X-NAME'));
    expect(result.current.matches).toBe(true);
    act(() => result.current.setConfirmText('BR-X-NAME  '));  // whitespace trim
    expect(result.current.matches).toBe(true);
  });

  it('SM1.4 handlePreview transitions idle → previewing → preview-ready', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, dryRun: true, perBucket: { a: { docs: 5 } }, totalDocs: 5, estSizeBytes: 100 }),
    });
    const { result } = renderHook(() => useMakeFreshStateMachine({ ...baseOpts(), fetcher }));
    await act(async () => { await result.current.handlePreview(); });
    expect(result.current.phase).toBe('preview-ready');
    expect(result.current.preview.totalDocs).toBe(5);
    expect(fetcher).toHaveBeenCalledWith('/api/admin/branch-backup-export', {
      branchId: 'BR-X', bucketIds: ['a'], dryRun: true,
    });
  });

  it('SM1.5 handlePreview no-op when zero buckets ticked', async () => {
    const fetcher = vi.fn();
    const { result } = renderHook(() => useMakeFreshStateMachine({ ...baseOpts(), fetcher }));
    act(() => result.current.handleBucketToggle('a'));
    expect(result.current.tickedBucketIds).toEqual([]);
    await act(async () => { await result.current.handlePreview(); });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('SM1.6 handleRun full happy path: backing-up → wiping → done', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: {}, totalDocs: 5, estSizeBytes: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, storagePath: 'p1', bodyHash: 'h1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, deletedCounts: { x: 5 }, bodyHash: 'h1', auditId: 'a1' }) });
    const { result } = renderHook(() => useMakeFreshStateMachine({ ...baseOpts(), fetcher }));
    await act(async () => { await result.current.handlePreview(); });
    act(() => {
      result.current.setPhase('confirming');
      result.current.setConfirmText('BR-X-NAME');
    });
    await act(async () => { await result.current.handleRun(); });
    expect(result.current.phase).toBe('done');
    expect(result.current.result.auditId).toBe('a1');
    expect(result.current.autoBackupRef).toBe('p1');
    expect(result.current.bodyHash).toBe('h1');
  });

  it('SM1.7 handleRun no-op when matches=false', async () => {
    const fetcher = vi.fn();
    const { result } = renderHook(() => useMakeFreshStateMachine({ ...baseOpts(), fetcher }));
    await act(async () => { await result.current.handleRun(); });  // matches=false default
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('SM1.8 error path: BACKUP_INTEGRITY_FAIL preserves backup path', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: {}, totalDocs: 5, estSizeBytes: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, storagePath: 'p1', bodyHash: 'h1' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'BACKUP_INTEGRITY_FAIL' }) });
    const { result } = renderHook(() => useMakeFreshStateMachine({ ...baseOpts(), fetcher }));
    await act(async () => { await result.current.handlePreview(); });
    act(() => {
      result.current.setPhase('confirming');
      result.current.setConfirmText('BR-X-NAME');
    });
    await act(async () => { await result.current.handleRun(); });
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toMatch(/BACKUP_INTEGRITY_FAIL/);
    expect(result.current.autoBackupRef).toBe('p1');  // preserved for manual restore
  });

  it('SM1.9 parameterized scopeBody propagates to fetcher (central scope test)', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({
      ok: true, json: async () => ({ ok: true, dryRun: true, perBucket: {}, totalDocs: 0, estSizeBytes: 0 }),
    });
    // Spread base FIRST so fetcher override wins (vs vi.fn() from baseOpts())
    const opts = {
      ...baseOpts(),
      fetcher,
      exportEndpoint: '/api/admin/central-stock-backup-export',
      scopeBody: { warehouseIds: ['WH-1'], allWarehouses: false },
      confirmName: 'WH-1-NAME',
    };
    const { result } = renderHook(() => useMakeFreshStateMachine(opts));
    await act(async () => { await result.current.handlePreview(); });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/central-stock-backup-export',
      { warehouseIds: ['WH-1'], allWarehouses: false, bucketIds: ['a'], dryRun: true },
    );
  });
});
