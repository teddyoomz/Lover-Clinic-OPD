// tests/staffchat-read-cursor-on-open.test.jsx
// (2026-06-03) — Regression lock for the hide-don't-unmount read-cursor bug.
//
// The staff-chat panel now stays MOUNTED (hidden via display:none) on minimize so
// the composer draft survives. That made "opening" the chat a VISIBILITY
// transition, NOT a remount — which silently broke the MessageList's open
// behaviors (they assumed open === a fresh mount):
//   1. auto-scroll-to-bottom ran while hidden (scrollHeight 0 → no-op) and never
//      re-fired on open → the chat opened scrolled to the TOP.
//   2. the read cursor (markScrolledToBottom) never advanced on open because the
//      bottom sentinel never intersected.
//   3. the IntersectionObserver created while display:none got STUCK (no layout
//      box) → it never fired isIntersecting once the panel later showed.
// User-reported recurrence (2026-06-03): "scroll to the bottom, refresh / new tab,
// reopen → bounces back to the top, doesn't save the read checkpoint".
//
// Fix: MessageList takes a `visible` prop and, on the hidden→visible transition,
// (a) scrolls to the true bottom, (b) marks-read directly (advance the cursor —
// robust, not reliant on the observer firing after a display toggle), and
// (c) re-creates the IntersectionObserver on a now-laid-out node.
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { StaffChatMessageList } from '../src/components/staffchat/StaffChatMessageList.jsx';
import fs from 'node:fs';
import path from 'node:path';

// Controllable IntersectionObserver mock (jsdom has none) + scrollIntoView mock.
let ioInstances = [];
class MockIntersectionObserver {
  constructor(cb) { this.cb = cb; ioInstances.push(this); }
  observe() {}
  unobserve() {}
  disconnect() {}
}
const ORIG_IO = global.IntersectionObserver;
const ORIG_SCROLL = Element.prototype.scrollIntoView;
beforeEach(() => {
  ioInstances = [];
  global.IntersectionObserver = MockIntersectionObserver;
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  if (ORIG_IO === undefined) delete global.IntersectionObserver;
  else global.IntersectionObserver = ORIG_IO;
  Element.prototype.scrollIntoView = ORIG_SCROLL;
});

const now = Date.UTC(2026, 5, 3, 7, 0, 0);
const MSGS = [
  { id: 'm1', text: 'a', deviceId: 'dev-other', displayName: 'A', createdAt: { toMillis: () => now } },
  { id: 'm2', text: 'b', deviceId: 'dev-other', displayName: 'B', createdAt: { toMillis: () => now + 1000 } },
];
const list = (over) => (
  <StaffChatMessageList messages={MSGS} ownDeviceId="dev-me" {...over} />
);

describe('R1 — mark-read (cursor advance) fires on the hidden→visible transition, NOT while hidden', () => {
  it('R1.1 not called while hidden; called once per open (each visible-transition)', () => {
    const onScrolledToBottom = vi.fn();
    const { rerender } = render(list({ onScrolledToBottom, visible: false }));
    expect(onScrolledToBottom).not.toHaveBeenCalled();              // hidden → no mark-read
    rerender(list({ onScrolledToBottom, visible: true }));
    expect(onScrolledToBottom).toHaveBeenCalledTimes(1);            // open → mark-read
    rerender(list({ onScrolledToBottom, visible: false }));
    rerender(list({ onScrolledToBottom, visible: true }));
    expect(onScrolledToBottom).toHaveBeenCalledTimes(2);            // re-open → mark-read again
  });

  it('R1.2 a NEW message while already-open does NOT re-fire mark-read (only visibility does)', () => {
    const onScrolledToBottom = vi.fn();
    const { rerender } = render(list({ onScrolledToBottom, visible: true }));
    expect(onScrolledToBottom).toHaveBeenCalledTimes(1);
    const more = [...MSGS, { id: 'm3', text: 'c', deviceId: 'dev-other', displayName: 'C', createdAt: { toMillis: () => now + 2000 } }];
    rerender(<StaffChatMessageList messages={more} ownDeviceId="dev-me" onScrolledToBottom={onScrolledToBottom} visible={true} />);
    expect(onScrolledToBottom).toHaveBeenCalledTimes(1);            // visible unchanged → not re-fired
  });
});

describe('R2 — IntersectionObserver gated on + re-created per visibility (stuck-observer fix)', () => {
  it('R2.1 no observer while hidden; fresh observer on open; intersect hides the jump button', () => {
    const onScrolledToBottom = vi.fn();
    const { rerender } = render(list({ onScrolledToBottom, visible: false }));
    expect(ioInstances.length).toBe(0);                            // hidden → never observed
    rerender(list({ onScrolledToBottom, visible: true }));
    expect(ioInstances.length).toBeGreaterThanOrEqual(1);          // visible → fresh observer
    act(() => ioInstances.forEach(io => io.cb([{ isIntersecting: true }])));
    expect(screen.queryByTestId('staff-chat-jump-latest')).toBeNull(); // at bottom → no jump btn
  });
});

describe('SG — source-grep regression locks', () => {
  const ROOT = process.cwd();
  const listSrc = fs.readFileSync(path.resolve(ROOT, 'src/components/staffchat/StaffChatMessageList.jsx'), 'utf8');
  const widgetSrc = fs.readFileSync(path.resolve(ROOT, 'src/components/staffchat/StaffChatWidget.jsx'), 'utf8');

  it('SG1 MessageList accepts a `visible` prop', () => {
    expect(listSrc).toMatch(/function StaffChatMessageList\(\{[^}]*\bvisible\b/);
  });
  it('SG2 a visible-transition effect scrolls to bottom + marks read (deps [visible])', () => {
    expect(listSrc).toMatch(/if\s*\(!visible\)\s*return undefined;\s*\n\s*scrollContainerToBottom/);
    expect(listSrc).toMatch(/onScrolledToBottomRef\.current\?\.\(\)/);
    expect(listSrc).toMatch(/\}, \[visible\]\);/);
  });
  it('SG3 the IntersectionObserver effect is gated on visible + lists it as a dep', () => {
    expect(listSrc).toMatch(/if\s*\(!visible\)\s*return undefined;\s*\n\s*if\s*\(typeof IntersectionObserver/);
    expect(listSrc).toMatch(/\}, \[onScrolledToBottom, lastMessageId, visible\]\);/);
  });
  it('SG4 Widget passes visible={!chat.minimized} to the MessageList', () => {
    const mlBlock = widgetSrc.match(/<StaffChatMessageList[\s\S]*?\/>/);
    expect(mlBlock).toBeTruthy();
    expect(mlBlock[0]).toMatch(/visible=\{!chat\.minimized\}/);
  });
});
