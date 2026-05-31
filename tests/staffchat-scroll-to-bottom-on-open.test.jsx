// tests/staffchat-scroll-to-bottom-on-open.test.jsx
// (2026-06-01) BUG: on a cold Chrome-tab open, the staff-chat list opened scrolled
// UP (not at the latest message) and stayed there — user had to press the jump
// button every time. Root cause (verified on REAL prod): the auto-scroll used a
// single endRef.scrollIntoView({behavior:'smooth'}) keyed on [lastMessageId]; on
// cold mount that smooth animation was interrupted by mount re-renders and settled
// ~1158px short of the true bottom (scrollTop 4538 of 5695). Setting the CONTAINER
// scrollTop = scrollHeight reaches the true bottom instantly (prod: distance 0).
// Fix: scrollContainerToBottom(listRef.current), immediate + one rAF, deps
// [lastMessageId] (keeps V140's no-yank-on-snapshot-re-fire contract).
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StaffChatMessageList, scrollContainerToBottom } from '../src/components/staffchat/StaffChatMessageList.jsx';

// IntersectionObserver mock (jsdom has none).
let ioInstances = [];
class MockIntersectionObserver { constructor(cb) { this.cb = cb; ioInstances.push(this); } observe() {} unobserve() {} disconnect() {} }

// AV41 — capture + restore globals (no cross-file leak).
const ORIG_IO = global.IntersectionObserver;
const ORIG_RAF = global.requestAnimationFrame;
const ORIG_CAF = global.cancelAnimationFrame;
beforeEach(() => {
  ioInstances = [];
  global.IntersectionObserver = MockIntersectionObserver;
  // run the deferred (rAF) scroll synchronously inside the test
  global.requestAnimationFrame = (cb) => { cb(); return 1; };
  global.cancelAnimationFrame = () => {};
});
afterAll(() => {
  if (ORIG_IO === undefined) delete global.IntersectionObserver; else global.IntersectionObserver = ORIG_IO;
  global.requestAnimationFrame = ORIG_RAF;
  global.cancelAnimationFrame = ORIG_CAF;
});

const now = Date.UTC(2026, 5, 1, 7, 0, 0);
const mk = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'm' + i, text: 'msg ' + i, deviceId: 'other', displayName: 'A',
  createdAt: { toMillis: () => now + i * 1000 },
}));

describe('U: scrollContainerToBottom helper', () => {
  it('U1: sets scrollTop to the element scrollHeight (true bottom)', () => {
    const el = { scrollHeight: 4242, scrollTop: 0 };
    scrollContainerToBottom(el);
    expect(el.scrollTop).toBe(4242);
  });
  it('U2: null/undefined-safe (no throw)', () => {
    expect(() => scrollContainerToBottom(null)).not.toThrow();
    expect(() => scrollContainerToBottom(undefined)).not.toThrow();
  });
});

describe('B: auto-scroll drives the CONTAINER to its full scrollHeight on a new last message', () => {
  function patchScroll(el, height) {
    let val = 0;
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => height });
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => val, set: (v) => { val = v; } });
    return () => val;
  }

  it('B1: a new last message scrolls the container to scrollHeight (reaches the true bottom)', () => {
    const { rerender } = render(<StaffChatMessageList messages={mk(5)} ownDeviceId="me" />);
    const el = screen.getByTestId('staff-chat-message-list');
    const getTop = patchScroll(el, 9999);
    act(() => { rerender(<StaffChatMessageList messages={mk(6)} ownDeviceId="me" />); });
    expect(getTop()).toBe(9999);
  });
});

describe('SG: source-grep regression locks', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/staffchat/StaffChatMessageList.jsx'), 'utf8');

  it('SG1: exports scrollContainerToBottom that sets scrollTop = scrollHeight', () => {
    expect(src).toMatch(/export function scrollContainerToBottom/);
    expect(src).toMatch(/\.scrollTop\s*=\s*\w+\.scrollHeight/);
  });
  it('SG2: the scroll container carries listRef', () => {
    expect(src).toMatch(/const listRef = useRef/);
    expect(src).toMatch(/ref=\{listRef\}/);
  });
  it('SG3: auto-scroll effect uses the helper + requestAnimationFrame', () => {
    expect(src).toMatch(/scrollContainerToBottom\(listRef\.current\)/);
    expect(src).toMatch(/requestAnimationFrame/);
  });
  it('SG4: only ONE real endRef.current?.scrollIntoView call remains (the jump button) — auto-scroll no longer animates', () => {
    // Count the actual CALL pattern (not the word in comments). Pre-fix the file
    // had 2 such calls (auto-scroll effect + scrollToLatest); post-fix the
    // undershoot-prone auto-scroll call is gone, leaving only the jump button's.
    expect((src.match(/endRef\.current\?\.scrollIntoView/g) || []).length).toBe(1);
  });
});
