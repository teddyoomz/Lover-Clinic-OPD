// tests/staffchat-jump-to-latest.test.jsx
// (2026-06-01) Jump-to-latest button. RTL with a controllable IntersectionObserver
// mock (jsdom has none) + scrollIntoView mock. Q1=C (circle+count, "9+" cap),
// Q2=A (appear when scrolled up). V82 onScrolledToBottom (read cursor) preserved.
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { StaffChatMessageList } from '../src/components/staffchat/StaffChatMessageList.jsx';

// --- controllable IntersectionObserver mock ---
let ioInstances = [];
class MockIntersectionObserver {
  constructor(cb) { this.cb = cb; ioInstances.push(this); }
  observe() {}
  unobserve() {}
  disconnect() {}
}
function fireIntersect(isIntersecting) {
  act(() => { ioInstances.forEach(io => io.cb([{ isIntersecting }])); });
}

// AV41 — capture + restore globals (no cross-file leak).
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

const now = Date.UTC(2026, 5, 1, 7, 0, 0); // createdAt as Firestore {toMillis}
const MSGS = [
  { id: 'm1', text: 'เคสเช้านี้รีพอร์ตแล้วนะ', deviceId: 'dev-other', displayName: 'หมอ A', createdAt: { toMillis: () => now } },
  { id: 'm2', text: 'โอเคค่า', deviceId: 'dev-me', displayName: 'มิ้นท์', createdAt: { toMillis: () => now + 1000 } },
  { id: 'm3', text: 'ของเข้าสต็อกแล้วน้า', deviceId: 'dev-other', displayName: 'พี่เคาน์เตอร์', createdAt: { toMillis: () => now + 2000 } },
];

function renderList(props = {}) {
  return render(
    <StaffChatMessageList
      messages={MSGS}
      ownDeviceId="dev-me"
      onScrolledToBottom={props.onScrolledToBottom || (() => {})}
      unreadCount={props.unreadCount ?? 0}
    />
  );
}

describe('J1-J7 jump-to-latest button behavior', () => {
  it('J1: hidden at bottom', () => {
    renderList();
    fireIntersect(true);
    expect(screen.queryByTestId('staff-chat-jump-latest')).toBeNull();
  });

  it('J2: appears when scrolled up', () => {
    renderList();
    fireIntersect(false);
    expect(screen.getByTestId('staff-chat-jump-latest')).toBeTruthy();
  });

  it('J3: badge shows unreadCount when >0 and scrolled up', () => {
    renderList({ unreadCount: 3 });
    fireIntersect(false);
    expect(screen.getByTestId('staff-chat-jump-latest-count').textContent).toBe('3');
  });

  it('J4: no badge when unreadCount=0 (bare circle)', () => {
    renderList({ unreadCount: 0 });
    fireIntersect(false);
    expect(screen.getByTestId('staff-chat-jump-latest')).toBeTruthy();
    expect(screen.queryByTestId('staff-chat-jump-latest-count')).toBeNull();
  });

  it('J5: badge caps at "9+" for counts > 9', () => {
    renderList({ unreadCount: 15 });
    fireIntersect(false);
    expect(screen.getByTestId('staff-chat-jump-latest-count').textContent).toBe('9+');
  });

  it('J6: clicking smooth-scrolls endRef to bottom', () => {
    renderList();
    fireIntersect(false);
    Element.prototype.scrollIntoView.mockClear();
    fireEvent.click(screen.getByTestId('staff-chat-jump-latest'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' });
  });

  it('J7: returning to bottom hides button AND fires onScrolledToBottom (V82 preserved)', () => {
    const onScrolledToBottom = vi.fn();
    renderList({ onScrolledToBottom });
    fireIntersect(false);
    expect(screen.getByTestId('staff-chat-jump-latest')).toBeTruthy();
    fireIntersect(true);
    expect(screen.queryByTestId('staff-chat-jump-latest')).toBeNull();
    expect(onScrolledToBottom).toHaveBeenCalled();
  });
});
