// V33-customer-create — scrollToFieldError helper unit tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrollToFieldError } from '../src/lib/scrollToFieldError.js';

let alertCalls;
let scrollIntoViewCalls;
let focusCalls;

beforeEach(() => {
  vi.useFakeTimers();
  alertCalls = [];
  scrollIntoViewCalls = [];
  focusCalls = [];
  document.body.innerHTML = '';
  vi.spyOn(window, 'alert').mockImplementation((m) => alertCalls.push(m));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeField(name, attrs = {}) {
  const el = document.createElement('input');
  if (attrs.dataField) el.setAttribute('data-field', name);
  else el.setAttribute('name', name);
  el.scrollIntoView = vi.fn((opts) => scrollIntoViewCalls.push(opts));
  el.focus = vi.fn(() => focusCalls.push(name));
  document.body.appendChild(el);
  return el;
}

describe('V33.W — scrollToFieldError behavior', () => {
  it('W1 — calls alert with the message', () => {
    makeField('firstname');
    scrollToFieldError('firstname', 'กรุณากรอกชื่อ');
    expect(alertCalls[0]).toBe('กรุณากรอกชื่อ');
  });
  it('W2 — finds field by data-field attribute', () => {
    const el = makeField('email', { dataField: true });
    scrollToFieldError('email', 'msg');
    vi.advanceTimersByTime(150);
    expect(scrollIntoViewCalls.length).toBe(1);
    expect(focusCalls).toContain('email');
  });
  it('W3 — finds field by name attribute', () => {
    const el = makeField('phone', { dataField: false });
    scrollToFieldError('phone', 'msg');
    vi.advanceTimersByTime(150);
    expect(scrollIntoViewCalls.length).toBe(1);
  });
  it('W4 — adds + removes ring classes', () => {
    const el = makeField('citizen_id');
    scrollToFieldError('citizen_id', 'msg', { ringDurationMs: 200 });
    vi.advanceTimersByTime(150);
    expect(el.classList.contains('ring-2')).toBe(true);
    expect(el.classList.contains('ring-red-500')).toBe(true);
    vi.advanceTimersByTime(250);
    expect(el.classList.contains('ring-2')).toBe(false);
    expect(el.classList.contains('ring-red-500')).toBe(false);
  });
  it('W5 — useAlert=false skips alert', () => {
    makeField('foo');
    scrollToFieldError('foo', 'msg', { useAlert: false });
    expect(alertCalls.length).toBe(0);
  });
  it('W6 — null fieldName is no-op (no scroll, no error)', () => {
    expect(() => scrollToFieldError(null, 'msg')).not.toThrow();
    vi.advanceTimersByTime(200);
    expect(scrollIntoViewCalls.length).toBe(0);
  });
  it('W7 — fieldName not in DOM is no-op', () => {
    scrollToFieldError('does-not-exist', 'msg');
    vi.advanceTimersByTime(200);
    expect(scrollIntoViewCalls.length).toBe(0);
  });
  it('W8 — escapes quotes in fieldName (defense-in-depth)', () => {
    const el = makeField('weird"name', { dataField: true });
    scrollToFieldError('weird"name', 'msg');
    vi.advanceTimersByTime(150);
    expect(scrollIntoViewCalls.length).toBe(1);
  });
});
