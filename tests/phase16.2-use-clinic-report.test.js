import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../src/lib/clinicReportAggregator.js', () => ({
  clinicReportAggregator: vi.fn(),
}));

import { clinicReportAggregator } from '../src/lib/clinicReportAggregator.js';
import { useClinicReport } from '../src/hooks/useClinicReport.js';

describe('H1 useClinicReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clinicReportAggregator.mockResolvedValue({ tiles: { revenueYtd: 100 }, charts: {}, tables: {}, meta: {} });
  });

  it('H1.1 — fires aggregator on mount', async () => {
    const filter = { from: '2026-04-01', to: '2026-04-30' };
    renderHook(() => useClinicReport(filter));
    await waitFor(() => expect(clinicReportAggregator).toHaveBeenCalledWith(filter));
  });

  it('H1.2 — exposes loading then snapshot', async () => {
    const { result } = renderHook(() => useClinicReport({ from: '2026-04-01', to: '2026-04-30' }));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshot.tiles.revenueYtd).toBe(100);
  });

  it('H1.3 — same filter twice (re-render with equivalent object) hits cache', async () => {
    const filter1 = { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] };
    const { result, rerender } = renderHook(({ f }) => useClinicReport(f), {
      initialProps: { f: filter1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(1);

    rerender({ f: { ...filter1 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(1); // cache hit
  });

  it('H1.4 — different filter triggers fresh fetch', async () => {
    const { result, rerender } = renderHook(({ f }) => useClinicReport(f), {
      initialProps: { f: { from: '2026-04-01', to: '2026-04-30' } },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ f: { from: '2026-03-01', to: '2026-04-30' } });
    await waitFor(() => expect(clinicReportAggregator).toHaveBeenCalledTimes(2));
  });

  it('H1.5 — refresh() clears cache for current key + refetches', async () => {
    const { result } = renderHook(() => useClinicReport({ from: '2026-04-01', to: '2026-04-30' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(clinicReportAggregator).toHaveBeenCalledTimes(2);
  });

  it('H1.6 — aggregator rejection surfaces error, snapshot stays null', async () => {
    clinicReportAggregator.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useClinicReport({ from: '2026-04-01', to: '2026-04-30' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/boom/);
    expect(result.current.snapshot).toBeNull();
  });

  it('H1.7 — no setInterval anywhere (zero-polling guarantee)', async () => {
    const fakeSetInterval = vi.spyOn(global, 'setInterval');
    renderHook(() => useClinicReport({ from: '2026-04-01', to: '2026-04-30' }));
    expect(fakeSetInterval).not.toHaveBeenCalled();
    fakeSetInterval.mockRestore();
  });

  it('H1.9 — undefined snapshot from aggregator is cached (no re-fetch loop)', async () => {
    clinicReportAggregator.mockResolvedValueOnce(undefined);
    const filter = { from: '2026-04-01', to: '2026-04-30' };
    const { result, rerender } = renderHook(() => useClinicReport(filter));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(1);
    expect(result.current.snapshot).toBeUndefined();
    // Re-render with same filter — must NOT re-fetch (cache hit on undefined value)
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(1); // truthy-check bug would have re-fetched
  });

  it('H1.8 — after refresh(), changing filter back to original key still uses cache (no orphan re-fetch)', async () => {
    const filterA = { from: '2026-04-01', to: '2026-04-30' };
    const filterB = { from: '2026-03-01', to: '2026-03-31' };
    const { result, rerender } = renderHook(({ f }) => useClinicReport(f), {
      initialProps: { f: filterA },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(1); // cached A

    // refresh A
    await act(async () => { await result.current.refresh(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(2); // A re-fetched

    // switch to B
    rerender({ f: filterB });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(3); // B fresh fetch

    // switch BACK to A — should hit cache (was repopulated after refresh)
    rerender({ f: filterA });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(clinicReportAggregator).toHaveBeenCalledTimes(3); // cache hit, no 4th call
  });
});
