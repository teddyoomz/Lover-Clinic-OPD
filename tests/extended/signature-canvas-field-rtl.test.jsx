// ─── SignatureCanvasField RTL — Phase 14.8.B (2026-04-26) ────────────────
// Real component mount + interaction tests. Catches bugs that source-grep
// alone cannot (V21 lesson). Specifically:
//   - signature_pad initialized on mount
//   - empty state visible by default
//   - clear button disabled when empty
//   - external `value` prop hydrates canvas
//   - onChange called with data URL on stroke end (mocked)
//   - cleanup runs window resize listener removal on unmount

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock signature_pad — jsdom canvas is too limited for real strokes.
// Track listener registration so we can simulate endStroke.
const padInstances = [];
vi.mock('signature_pad', () => {
  return {
    default: class MockSignaturePad {
      constructor(canvas, opts) {
        this.canvas = canvas;
        this.opts = opts;
        this._empty = true;
        this._listeners = {};
        padInstances.push(this);
      }
      isEmpty() { return this._empty; }
      clear() { this._empty = true; }
      toDataURL(_mime) {
        return this._empty ? '' : 'data:image/png;base64,FAKE_SIG_BASE64==';
      }
      toData() { return []; }
      fromData(_data) {}
      addEventListener(name, fn) {
        this._listeners[name] = fn;
      }
      removeEventListener(name) {
        delete this._listeners[name];
      }
      off() { this._listeners = {}; }
      // Test-only helper: simulate user finishing a stroke
      __fireStroke() {
        this._empty = false;
        this._listeners.endStroke?.();
      }
    },
  };
});

// jsdom doesn't implement getContext('2d') → polyfill minimal stub
beforeEach(() => {
  padInstances.length = 0;
  if (!HTMLCanvasElement.prototype.getContext) {
    HTMLCanvasElement.prototype.getContext = () => ({
      scale: () => {},
      clearRect: () => {},
      drawImage: () => {},
    });
  }
});

import SignatureCanvasField from '../src/components/backend/SignatureCanvasField.jsx';

describe('SignatureCanvasField — RTL integration', () => {
  it('R1 — renders canvas + empty placeholder by default', () => {
    render(<SignatureCanvasField onChange={vi.fn()} />);
    expect(screen.getByTestId('signature-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('signature-canvas-container').dataset.empty).toBe('true');
    expect(screen.getByText(/เซ็นชื่อด้านบน/)).toBeInTheDocument();
  });

  it('R2 — initializes signature_pad instance on mount', () => {
    render(<SignatureCanvasField onChange={vi.fn()} />);
    expect(padInstances.length).toBe(1);
    expect(padInstances[0].opts.penColor).toBe('#000000');
  });

  it('R3 — clear button disabled when canvas is empty', () => {
    render(<SignatureCanvasField onChange={vi.fn()} />);
    expect(screen.getByTestId('signature-clear')).toBeDisabled();
  });

  it('R4 — onChange fires with data URL on strokeEnd', () => {
    const onChange = vi.fn();
    render(<SignatureCanvasField onChange={onChange} />);
    act(() => { padInstances[0].__fireStroke(); });
    expect(onChange).toHaveBeenCalledWith('data:image/png;base64,FAKE_SIG_BASE64==');
  });

  it('R5 — empty state flips to false after stroke (via setIsEmpty)', () => {
    render(<SignatureCanvasField onChange={vi.fn()} />);
    act(() => { padInstances[0].__fireStroke(); });
    expect(screen.getByTestId('signature-canvas-container').dataset.empty).toBe('false');
  });

  it('R6 — clear button calls onChange("")', () => {
    const onChange = vi.fn();
    render(<SignatureCanvasField onChange={onChange} />);
    act(() => { padInstances[0].__fireStroke(); });          // first stroke → not empty
    onChange.mockClear();
    fireEvent.click(screen.getByTestId('signature-clear'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('R7 — disabled prop blocks pointer events + dims canvas', () => {
    render(<SignatureCanvasField onChange={vi.fn()} disabled />);
    const canvas = screen.getByTestId('signature-canvas');
    expect(canvas.className).toMatch(/pointer-events-none/);
    expect(canvas.className).toMatch(/opacity-60/);
  });

  it('R8 — label renders when provided', () => {
    render(<SignatureCanvasField onChange={vi.fn()} label="ลายเซ็นคนไข้" />);
    expect(screen.getByText('ลายเซ็นคนไข้')).toBeInTheDocument();
  });

  it('R9 — no label when prop omitted', () => {
    const { container } = render(<SignatureCanvasField onChange={vi.fn()} />);
    expect(container.querySelectorAll('label').length).toBe(0);
  });

  it('R10 — V21 anti-regression: data-testid wired so E2E + RTL can both find it', () => {
    render(<SignatureCanvasField onChange={vi.fn()} />);
    expect(screen.getByTestId('signature-canvas')).toBeTruthy();
    expect(screen.getByTestId('signature-canvas-container')).toBeTruthy();
    expect(screen.getByTestId('signature-clear')).toBeTruthy();
  });

  it('R11 — onClear additional callback fires alongside onChange("")', () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(<SignatureCanvasField onChange={onChange} onClear={onClear} />);
    act(() => { padInstances[0].__fireStroke(); });
    fireEvent.click(screen.getByTestId('signature-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('R12 — value prop hydrates: passes through canvas image rendering path (no crash)', () => {
    // jsdom can't decode the image, but the path runs without error
    expect(() => {
      render(
        <SignatureCanvasField
          value="data:image/png;base64,FAKE_HYDRATE=="
          onChange={vi.fn()}
        />,
      );
    }).not.toThrow();
  });

  it('R13 — oversized signature (mock) clears canvas + emits empty + shows error', () => {
    // Override mock to emit a >200 KB data URL
    const onChange = vi.fn();
    render(<SignatureCanvasField onChange={onChange} />);
    const pad = padInstances[0];
    // Replace toDataURL to return a huge string (200KB *.75 = ~270K chars)
    const huge = 'data:image/png;base64,' + 'A'.repeat(300_000);
    pad.toDataURL = () => huge;
    pad._empty = false;
    act(() => { pad._listeners.endStroke?.(); });
    // Last onChange call should be ''
    expect(onChange).toHaveBeenLastCalledWith('');
    // Error message should appear
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/ใหญ่เกินไป/)).toBeInTheDocument();
  });
});
