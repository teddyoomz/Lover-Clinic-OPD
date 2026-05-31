// tests/staffchat-jump-to-latest.test.jsx
// (2026-06-01) Jump-to-latest button. RTL with a controllable IntersectionObserver
// mock (jsdom has none) + scrollIntoView mock. Q1=C (circle+count, "9+" cap),
// Q2=A (appear when scrolled up). V82 onScrolledToBottom (read cursor) preserved.
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { StaffChatMessageList } from '../src/components/staffchat/StaffChatMessageList.jsx';
import fs from 'node:fs';
import path from 'node:path';

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

describe('SG source-grep regression locks', () => {
  const ROOT = process.cwd();
  const listSrc = fs.readFileSync(path.resolve(ROOT, 'src/components/staffchat/StaffChatMessageList.jsx'), 'utf8');
  const widgetSrc = fs.readFileSync(path.resolve(ROOT, 'src/components/staffchat/StaffChatWidget.jsx'), 'utf8');

  it('SG1: MessageList imports ChevronDown from lucide-react', () => {
    expect(listSrc).toMatch(/import\s*\{[^}]*ChevronDown[^}]*\}\s*from\s*['"]lucide-react['"]/);
  });
  it('SG2: button has the testid + Thai aria-label', () => {
    expect(listSrc).toContain('data-testid="staff-chat-jump-latest"');
    expect(listSrc).toContain('aria-label="ลงไปข้อความล่าสุด"');
  });
  it('SG3: button gated on !isAtBottom', () => {
    expect(listSrc).toMatch(/!isAtBottom\s*&&/);
  });
  it('SG4: isAtBottom driven by the SAME observer (one observer, reuse)', () => {
    expect(listSrc).toMatch(/setIsAtBottom\(entry\.isIntersecting\)/);
    expect((listSrc.match(/new IntersectionObserver/g) || []).length).toBe(1);
  });
  it('SG5: V82 onScrolledToBottom still fires only on intersect', () => {
    expect(listSrc).toMatch(/entry\.isIntersecting\s*&&\s*typeof onScrolledToBottom === 'function'/);
  });
  it('SG6: tap scrolls endRef smooth to bottom via scrollToLatest', () => {
    expect(listSrc).toMatch(/scrollToLatest/);
    expect(listSrc).toMatch(/scrollIntoView\(\{ behavior: 'smooth', block: 'end' \}\)/);
  });
  it('SG7: badge caps at "9+"', () => {
    expect(listSrc).toMatch(/unreadCount > 9 \? '9\+' : unreadCount/);
  });
  it('SG8: Widget threads chat.unreadCount into the MessageList element (not just the bubble)', () => {
    // Scope to the <StaffChatMessageList ... /> element — a bare widgetSrc match
    // would false-pass on the pre-existing <StaffChatBubble unreadCount={chat.unreadCount} />.
    const mlBlock = widgetSrc.match(/<StaffChatMessageList[\s\S]*?\/>/);
    expect(mlBlock).toBeTruthy();
    expect(mlBlock[0]).toMatch(/unreadCount=\{chat\.unreadCount\}/);
  });
  it('SG9: scroll list keeps its data-testid (consumers depend on it)', () => {
    expect(listSrc).toContain('data-testid="staff-chat-message-list"');
  });
});

describe('F1 Rule I flow-simulate — full jump-to-latest cycle', () => {
  it('cycles: at-bottom hidden → scroll-up bare → new-msg badge → tap → land → reset', () => {
    const onScrolledToBottom = vi.fn();
    const props = { messages: MSGS, ownDeviceId: 'dev-me', onScrolledToBottom };
    const { rerender } = render(<StaffChatMessageList {...props} unreadCount={0} />);

    // 1. at bottom → hidden
    fireIntersect(true);
    expect(screen.queryByTestId('staff-chat-jump-latest')).toBeNull();

    // 2. scroll up, no new → bare circle (no badge)
    fireIntersect(false);
    expect(screen.getByTestId('staff-chat-jump-latest')).toBeTruthy();
    expect(screen.queryByTestId('staff-chat-jump-latest-count')).toBeNull();

    // 3. new messages arrive while scrolled up → badge "2"
    rerender(<StaffChatMessageList {...props} unreadCount={2} />);
    expect(screen.getByTestId('staff-chat-jump-latest-count').textContent).toBe('2');

    // 4. tap → smooth scroll to latest
    Element.prototype.scrollIntoView.mockClear();
    fireEvent.click(screen.getByTestId('staff-chat-jump-latest'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' });

    // 5. landed at bottom → cursor advances (V82) + button hides
    rerender(<StaffChatMessageList {...props} unreadCount={0} />);
    fireIntersect(true);
    expect(onScrolledToBottom).toHaveBeenCalled();
    expect(screen.queryByTestId('staff-chat-jump-latest')).toBeNull();
  });
});
