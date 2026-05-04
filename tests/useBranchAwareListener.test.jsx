import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useBranchAwareListener } from '../src/hooks/useBranchAwareListener.js';

// Mock useSelectedBranch — controllable per-test via setMockBranchId
let mockBranchId = 'BR-A';
const setMockBranchId = (id) => { mockBranchId = id; };

vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({
    branchId: mockBranchId,
    branches: [],
    selectBranch: () => {},
    isReady: true,
  }),
}));

beforeEach(() => {
  setMockBranchId('BR-A');
});

describe('Task 5 — useBranchAwareListener Layer 3', () => {
  it('BS3.1 subscribes on mount with current branchId injected into opts', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe() {
      useBranchAwareListener(listener, { startDate: '2026-05-01' }, () => {});
      return null;
    }
    render(<Probe />);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual({ startDate: '2026-05-01', branchId: 'BR-A' });
  });

  it('BS3.2 re-subscribes when branchId changes', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe() {
      useBranchAwareListener(listener, { startDate: '2026-05-01' }, () => {});
      return null;
    }
    const { rerender } = render(<Probe />);
    expect(listener).toHaveBeenCalledTimes(1);
    act(() => { setMockBranchId('BR-B'); });
    rerender(<Probe />);
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toEqual({ startDate: '2026-05-01', branchId: 'BR-B' });
  });

  it('BS3.3 universal listener (__universal__:true) does NOT inject branchId; positional arg pass-through', () => {
    const unsub = vi.fn();
    const listener = Object.assign(vi.fn(() => unsub), { __universal__: true });
    function Probe() {
      useBranchAwareListener(listener, 'customer-id-123', () => {});
      return null;
    }
    render(<Probe />);
    expect(listener.mock.calls[0][0]).toBe('customer-id-123');
  });

  it('BS3.4 universal listener does NOT re-subscribe on branch switch', () => {
    const unsub = vi.fn();
    const listener = Object.assign(vi.fn(() => unsub), { __universal__: true });
    function Probe() {
      useBranchAwareListener(listener, 'customer-123', () => {});
      return null;
    }
    const { rerender } = render(<Probe />);
    expect(listener).toHaveBeenCalledTimes(1);
    act(() => { setMockBranchId('BR-B'); });
    rerender(<Probe />);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(unsub).toHaveBeenCalledTimes(0);
  });

  it('BS3.5 unmount cleans up subscription', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe() {
      useBranchAwareListener(listener, {}, () => {});
      return null;
    }
    const { unmount } = render(<Probe />);
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('BS3.6 args change re-subscribes', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe({ args }) {
      useBranchAwareListener(listener, args, () => {});
      return null;
    }
    const { rerender } = render(<Probe args={{ startDate: '2026-05-01' }} />);
    rerender(<Probe args={{ startDate: '2026-06-01' }} />);
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('BS3.7 onChange ref updates without re-subscribe', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe({ tag }) {
      const onChange = () => tag;
      useBranchAwareListener(listener, {}, onChange);
      return null;
    }
    const { rerender } = render(<Probe tag="a" />);
    rerender(<Probe tag="b" />);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(unsub).toHaveBeenCalledTimes(0);
  });

  it('BS3.8 null listenerFn is no-op (does not throw)', () => {
    function Probe() {
      useBranchAwareListener(null, {}, () => {});
      return null;
    }
    expect(() => render(<Probe />)).not.toThrow();
  });

  it('BS3.9 onChange data is forwarded from listener callback', () => {
    let unsubFn = vi.fn();
    let storedOnChange;
    const listener = vi.fn((args, onChange) => {
      storedOnChange = onChange;
      return unsubFn;
    });
    let captured = null;
    function Probe() {
      useBranchAwareListener(listener, {}, (data) => { captured = data; });
      return null;
    }
    render(<Probe />);
    storedOnChange({ a: 1 });
    expect(captured).toEqual({ a: 1 });
  });

  it('BS3.10 onError is forwarded', () => {
    let storedOnError;
    const listener = vi.fn((args, onChange, onError) => {
      storedOnError = onError;
      return vi.fn();
    });
    let capturedErr = null;
    function Probe() {
      useBranchAwareListener(listener, {}, () => {}, (err) => { capturedErr = err; });
      return null;
    }
    render(<Probe />);
    storedOnError(new Error('boom'));
    expect(capturedErr).toBeInstanceOf(Error);
    expect(capturedErr.message).toBe('boom');
  });

  it('BS3.11 array args pass through unchanged (positional listener fallback)', () => {
    const unsub = vi.fn();
    const listener = vi.fn(() => unsub);
    function Probe() {
      useBranchAwareListener(listener, ['filter1', 'filter2'], () => {});
      return null;
    }
    render(<Probe />);
    expect(listener.mock.calls[0][0]).toEqual(['filter1', 'filter2']);
  });
});
