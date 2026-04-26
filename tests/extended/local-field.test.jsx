// ─── LocalField — adversarial tests (perf refactor safety net) ─────────────
// Guards the local-state + onBlur commit + 180ms debounce pattern behind
// LocalInput / LocalTextarea. Any regression here propagates to 28 noisy
// inputs on TreatmentFormPage + SaleTab → typing lag returns.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { LocalInput, LocalTextarea } from '../src/components/form/LocalField.jsx';

describe('LocalInput — basic render + commit', () => {
  it('L1 renders initial value from prop', () => {
    const { container } = render(<LocalInput value="hello" onCommit={() => {}} />);
    expect(container.querySelector('input').value).toBe('hello');
  });

  it('L2 typing updates DOM immediately (no parent notification)', () => {
    const onCommit = vi.fn();
    const { container } = render(<LocalInput value="" onCommit={onCommit} />);
    const input = container.querySelector('input');
    fireEvent.change(input, { target: { value: 'a' } });
    expect(input.value).toBe('a');
    // onCommit NOT fired yet — debounce / blur still pending.
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('L3 onBlur commits the current value via onCommit', () => {
    const onCommit = vi.fn();
    const { container } = render(<LocalInput value="" onCommit={onCommit} />);
    const input = container.querySelector('input');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('abc');
  });

  it('L4 onBlur skips commit when value unchanged', () => {
    const onCommit = vi.fn();
    const { container } = render(<LocalInput value="x" onCommit={onCommit} />);
    fireEvent.blur(container.querySelector('input'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('L5 debounce commits after 180ms of no typing', async () => {
    vi.useFakeTimers();
    try {
      const onCommit = vi.fn();
      const { container } = render(<LocalInput value="" onCommit={onCommit} />);
      const input = container.querySelector('input');
      fireEvent.change(input, { target: { value: 'a' } });
      expect(onCommit).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(200); });
      expect(onCommit).toHaveBeenCalledWith('a');
    } finally {
      vi.useRealTimers();
    }
  });

  it('L6 debounce resets on each keystroke (commits on idle)', async () => {
    vi.useFakeTimers();
    try {
      const onCommit = vi.fn();
      const { container } = render(<LocalInput value="" onCommit={onCommit} />);
      const input = container.querySelector('input');
      fireEvent.change(input, { target: { value: 'a' } });
      await act(async () => { vi.advanceTimersByTime(100); });
      fireEvent.change(input, { target: { value: 'ab' } });
      await act(async () => { vi.advanceTimersByTime(100); });
      fireEvent.change(input, { target: { value: 'abc' } });
      // 200ms since first keystroke, but only 0ms since last — should NOT commit yet.
      expect(onCommit).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(200); });
      // Now idle → commit 'abc' once.
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith('abc');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LocalInput — external value sync', () => {
  it('S1 external value change updates local (edit-mode restore)', () => {
    function Wrapper() {
      const [v, setV] = useState('init');
      return (
        <>
          <button onClick={() => setV('restored')}>set</button>
          <LocalInput value={v} onCommit={() => {}} />
        </>
      );
    }
    const { container } = render(<Wrapper />);
    const input = container.querySelector('input');
    expect(input.value).toBe('init');
    fireEvent.click(container.querySelector('button'));
    expect(input.value).toBe('restored');
  });

  it('S2 external value change does NOT re-commit (prevents loop)', () => {
    const onCommit = vi.fn();
    function Wrapper() {
      const [v, setV] = useState('a');
      return (
        <>
          <button onClick={() => setV('b')}>set</button>
          <LocalInput value={v} onCommit={onCommit} />
        </>
      );
    }
    const { container } = render(<Wrapper />);
    fireEvent.click(container.querySelector('button'));
    fireEvent.blur(container.querySelector('input'));
    // Local synced to 'b' from external; blur sees local === committed → skip.
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('S3 null/undefined value becomes empty string (no crash)', () => {
    const { container, rerender } = render(<LocalInput value={null} onCommit={() => {}} />);
    expect(container.querySelector('input').value).toBe('');
    rerender(<LocalInput value={undefined} onCommit={() => {}} />);
    expect(container.querySelector('input').value).toBe('');
  });

  it('S4 numeric value coerces to string for input', () => {
    const { container } = render(<LocalInput value={42} onCommit={() => {}} type="number" />);
    expect(container.querySelector('input').value).toBe('42');
  });
});

describe('LocalInput — event passthrough', () => {
  it('P1 consumer onChange fires alongside internal onChange', () => {
    const onChange = vi.fn();
    const { container } = render(<LocalInput value="" onCommit={() => {}} onChange={onChange} />);
    fireEvent.change(container.querySelector('input'), { target: { value: 'x' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('P2 consumer onBlur fires alongside internal onBlur', () => {
    const onBlur = vi.fn();
    const { container } = render(<LocalInput value="" onCommit={() => {}} onBlur={onBlur} />);
    fireEvent.blur(container.querySelector('input'));
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('P3 passes through non-handler props (placeholder, className, disabled, type)', () => {
    const { container } = render(
      <LocalInput value="" onCommit={() => {}}
        placeholder="phone" className="my-cls" disabled type="tel" />
    );
    const input = container.querySelector('input');
    expect(input.placeholder).toBe('phone');
    expect(input.className).toBe('my-cls');
    expect(input.disabled).toBe(true);
    expect(input.type).toBe('tel');
  });

  it('P4 missing onCommit does not crash (guarded with ?.)', () => {
    const { container } = render(<LocalInput value="" />);
    expect(() => {
      fireEvent.change(container.querySelector('input'), { target: { value: 'x' } });
      fireEvent.blur(container.querySelector('input'));
    }).not.toThrow();
  });
});

describe('LocalTextarea', () => {
  it('T1 renders as textarea (multi-line)', () => {
    const { container } = render(<LocalTextarea value="line1\nline2" onCommit={() => {}} rows={3} />);
    const ta = container.querySelector('textarea');
    expect(ta).toBeTruthy();
    expect(ta.rows).toBe(3);
  });

  it('T2 same commit-on-blur behavior as LocalInput', () => {
    const onCommit = vi.fn();
    const { container } = render(<LocalTextarea value="" onCommit={onCommit} />);
    const ta = container.querySelector('textarea');
    fireEvent.change(ta, { target: { value: 'long note' } });
    fireEvent.blur(ta);
    expect(onCommit).toHaveBeenCalledWith('long note');
  });

  it('T3 external value sync', () => {
    function Wrapper() {
      const [v, setV] = useState('');
      return (
        <>
          <button onClick={() => setV('loaded')}>set</button>
          <LocalTextarea value={v} onCommit={() => {}} />
        </>
      );
    }
    const { container } = render(<Wrapper />);
    expect(container.querySelector('textarea').value).toBe('');
    fireEvent.click(container.querySelector('button'));
    expect(container.querySelector('textarea').value).toBe('loaded');
  });
});

describe('LocalField — timer cleanup (no leaks)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('C1 unmount clears pending debounce timer (no stray onCommit after unmount)', () => {
    const onCommit = vi.fn();
    const { container, unmount } = render(<LocalInput value="" onCommit={onCommit} />);
    fireEvent.change(container.querySelector('input'), { target: { value: 'x' } });
    unmount();
    vi.advanceTimersByTime(500);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('C2 re-typing cancels previous debounce (no duplicate commits)', async () => {
    const onCommit = vi.fn();
    const { container } = render(<LocalInput value="" onCommit={onCommit} />);
    const input = container.querySelector('input');
    fireEvent.change(input, { target: { value: 'a' } });
    await act(async () => { vi.advanceTimersByTime(100); });
    fireEvent.change(input, { target: { value: 'b' } });
    await act(async () => { vi.advanceTimersByTime(100); });
    fireEvent.change(input, { target: { value: 'c' } });
    await act(async () => { vi.advanceTimersByTime(200); });
    // Each intermediate debounce was reset. Only final 'c' commits once.
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith('c');
  });
});

describe('LocalField — integration with parent state', () => {
  it('I1 round-trip: type → blur → parent state updates → value prop reflects', () => {
    function Wrapper() {
      const [v, setV] = useState('');
      return (
        <div>
          <span data-testid="live">{v}</span>
          <LocalInput value={v} onCommit={setV} />
        </div>
      );
    }
    const { container } = render(<Wrapper />);
    const input = container.querySelector('input');
    // Typing does NOT update parent
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(screen.getByTestId('live').textContent).toBe('');
    // Blur commits
    fireEvent.blur(input);
    expect(screen.getByTestId('live').textContent).toBe('hello');
    // Value prop reflected back into input
    expect(input.value).toBe('hello');
  });

  it('I2 two LocalInputs side-by-side — typing in one does NOT re-render the other', () => {
    let otherRenderCount = 0;
    function Other({ value }) {
      otherRenderCount++;
      return <LocalInput value={value} onCommit={() => {}} data-testid="other" />;
    }
    function Wrapper() {
      const [a, setA] = useState('');
      const [b, setB] = useState('fixed');
      return (
        <>
          <LocalInput value={a} onCommit={setA} data-testid="a" />
          <Other value={b} />
        </>
      );
    }
    const { container } = render(<Wrapper />);
    const initialRenderCount = otherRenderCount;
    const aInput = container.querySelector('[data-testid="a"]');
    fireEvent.change(aInput, { target: { value: 'typing' } });
    fireEvent.change(aInput, { target: { value: 'typing!' } });
    // Parent never re-renders on these keystrokes (local state only)
    expect(otherRenderCount).toBe(initialRenderCount);
  });
});
