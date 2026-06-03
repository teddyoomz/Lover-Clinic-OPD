// tests/staffchat-no-yank-while-reading.test.jsx
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop), H4. The jump-to-latest button
// (2026-06-01) has a 9+-capped unread badge designed for "new messages arrive
// WHILE you're scrolled up reading history". But V140 (2026-05-31, one day
// earlier) made the auto-scroll fire on EVERY new last-message id UNCONDITIONALLY
// (incidental to its real fix — the 50-cap [messages.length] freeze). So a new
// message YANKS a history-reading user to the bottom → isAtBottom flips true →
// the jump button + its unread badge are unreachable. The jump-to-latest F1
// flow-simulate *looks* like it covers this but FAKES it (bumps unreadCount
// WITHOUT changing `messages`, so the [lastMessageId] effect never runs).
//
// Desired (user decision 2026-06-03 = "stay put + show badge", LINE/Slack
// standard): auto-scroll to the bottom on a new message ONLY IF the user was
// already at the bottom; if they've scrolled up, leave their position alone so
// the jump button's unread count tells them how many arrived.
//
// Fix: an isAtBottomRef (mirrors the observer's isIntersecting); the
// [lastMessageId] auto-scroll effect early-returns when !isAtBottomRef.current.
// The [visible] open effect stays UNCONDITIONAL (opening always lands at bottom).
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StaffChatMessageList } from '../src/components/staffchat/StaffChatMessageList.jsx';

let ioInstances = [];
class MockIntersectionObserver { constructor(cb){ this.cb = cb; ioInstances.push(this); } observe(){} unobserve(){} disconnect(){} }
function fireIntersect(isIntersecting) { act(() => ioInstances.forEach(io => io.cb([{ isIntersecting }]))); }

const ORIG_IO = global.IntersectionObserver;
const ORIG_RAF = global.requestAnimationFrame;
const ORIG_CAF = global.cancelAnimationFrame;
const ORIG_SCROLL = Element.prototype.scrollIntoView;
beforeEach(() => {
  ioInstances = [];
  global.IntersectionObserver = MockIntersectionObserver;
  global.requestAnimationFrame = (cb) => { cb(); return 1; }; // run the deferred scroll synchronously
  global.cancelAnimationFrame = () => {};
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  if (ORIG_IO === undefined) delete global.IntersectionObserver; else global.IntersectionObserver = ORIG_IO;
  global.requestAnimationFrame = ORIG_RAF;
  global.cancelAnimationFrame = ORIG_CAF;
  Element.prototype.scrollIntoView = ORIG_SCROLL;
});

const now = Date.UTC(2026, 5, 3, 7, 0, 0);
const mk = (n, lastId) => Array.from({ length: n }, (_, i) => ({
  id: i === n - 1 ? lastId : 'm' + i, text: 't' + i, deviceId: 'other', displayName: 'A',
  createdAt: { toMillis: () => now + i * 1000 },
}));
const listEl = () => document.querySelector('[data-testid="staff-chat-message-list"]');
function patchScroll(el, height) {
  let top = 0;
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => height });
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
  return { setTop: (v) => { top = v; }, getTop: () => top };
}

describe('NY — no yank to bottom on a new message while reading history', () => {
  it('NY1 scrolled UP + a NEW message → does NOT scroll to bottom (no yank)', () => {
    const { rerender } = render(<StaffChatMessageList messages={mk(6, 'old')} ownDeviceId="me" visible={true} />);
    const sc = patchScroll(listEl(), 9999);
    fireIntersect(false);          // observer: user has scrolled UP (not at bottom)
    sc.setTop(3200);               // their reading position
    rerender(<StaffChatMessageList messages={mk(7, 'new')} ownDeviceId="me" visible={true} />); // a real new message
    expect(sc.getTop()).toBe(3200); // position preserved — NOT yanked to 9999
  });

  it('NY2 at the BOTTOM + a NEW message → DOES scroll to bottom (pin preserved)', () => {
    const { rerender } = render(<StaffChatMessageList messages={mk(6, 'old')} ownDeviceId="me" visible={true} />);
    const sc = patchScroll(listEl(), 9999);
    fireIntersect(true);           // observer: user is at the bottom
    sc.setTop(0);
    rerender(<StaffChatMessageList messages={mk(7, 'new')} ownDeviceId="me" visible={true} />);
    expect(sc.getTop()).toBe(9999); // pinned to bottom (standard chat follow)
  });

  it('NY3 default (no observer signal yet) + a NEW message → scrolls (first-load / cold path intact)', () => {
    // isAtBottomRef defaults true so the very first messages + the V140 cap-fix
    // path still scroll (no observer has fired). Locks backward-compat with
    // staffchat-scroll-to-bottom-on-open B1 + v140 Bug1.
    const { rerender } = render(<StaffChatMessageList messages={mk(1, 'a')} ownDeviceId="me" visible={true} />);
    const sc = patchScroll(listEl(), 9999);
    sc.setTop(0);
    rerender(<StaffChatMessageList messages={mk(2, 'b')} ownDeviceId="me" visible={true} />);
    expect(sc.getTop()).toBe(9999);
  });

  it('NY5 reopening re-establishes at-bottom → a new message after reopen DOES follow (no stale gate)', () => {
    // H4 added the isAtBottomRef gate; the [visible] OPEN effect must reset it true
    // (open scrolled to bottom) so a stale scrolled-up value from before minimize
    // doesn't wrongly suppress the first follow-scroll after reopen.
    const { rerender } = render(<StaffChatMessageList messages={mk(6, 'old')} ownDeviceId="me" visible={true} />);
    const sc = patchScroll(listEl(), 9999);
    fireIntersect(false);          // user had scrolled UP before minimizing
    rerender(<StaffChatMessageList messages={mk(6, 'old')} ownDeviceId="me" visible={false} />); // minimize
    rerender(<StaffChatMessageList messages={mk(6, 'old')} ownDeviceId="me" visible={true} />);  // reopen → lands at bottom
    sc.setTop(3000);               // pretend a tiny drift; isAtBottomRef should be true from reopen
    rerender(<StaffChatMessageList messages={mk(7, 'new')} ownDeviceId="me" visible={true} />);  // new message
    expect(sc.getTop()).toBe(9999); // followed (reopen reset the gate to at-bottom)
  });

  it('NY4 jump button + unread badge SURVIVE a new message while scrolled up (the feature now works)', () => {
    const { rerender } = render(<StaffChatMessageList messages={mk(6, 'old')} ownDeviceId="me" visible={true} unreadCount={0} />);
    patchScroll(listEl(), 9999);
    fireIntersect(false);          // scrolled up → jump button appears
    expect(screen.getByTestId('staff-chat-jump-latest')).toBeTruthy();
    // a new message arrives + the hook bumps unread; with no-yank the user stays up
    rerender(<StaffChatMessageList messages={mk(7, 'new')} ownDeviceId="me" visible={true} unreadCount={2} />);
    expect(screen.getByTestId('staff-chat-jump-latest')).toBeTruthy();
    expect(screen.getByTestId('staff-chat-jump-latest-count').textContent).toBe('2');
  });
});

describe('SG — conditional-auto-scroll regression locks', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/staffchat/StaffChatMessageList.jsx'), 'utf8');
  it('SG1 isAtBottomRef exists + mirrors the observer isIntersecting', () => {
    expect(src).toMatch(/isAtBottomRef\s*=\s*useRef\(/);
    expect(src).toMatch(/isAtBottomRef\.current\s*=\s*entry\.isIntersecting/);
  });
  it('SG2 the [lastMessageId] auto-scroll effect is gated on isAtBottomRef.current', () => {
    // the gate immediately precedes the sync container scroll — this exact pair is
    // UNIQUE to the [lastMessageId] follow-effect (the [visible] open effect uses
    // `if (!visible)`), so a new message can't yank a user who scrolled up.
    expect(src).toMatch(/if\s*\(!isAtBottomRef\.current\)\s*return undefined;\s*\n\s*scrollContainerToBottom\(listRef\.current\);/);
    expect(src).toMatch(/\}, \[lastMessageId\]\);/);
  });
  it('SG3 the [visible] open effect stays UNCONDITIONAL (open always lands at bottom)', () => {
    // the visible-transition effect must still scroll regardless of isAtBottom.
    // (2026-06-03 EOD+4 V21-fixup, H11) — the !visible branch gained a media-pause
    // body before its return; the open scroll sits right after that branch, with
    // NO isAtBottomRef gate (unconditional — unlike the [lastMessageId] effect).
    expect(src).toMatch(/if\s*\(!visible\)\s*\{[\s\S]*?return undefined;\s*\n\s*\}\s*\n\s*scrollContainerToBottom\(listRef\.current\);/);
  });
});
