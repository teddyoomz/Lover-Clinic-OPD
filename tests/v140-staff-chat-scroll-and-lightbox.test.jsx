import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';

// V140 (2026-05-31) — two staff-chat bugs found via /systematic-debugging:
//   Bug 1 (AV160): auto-scroll froze at the 50-message cap because the effect
//                  keyed on [messages.length] (length stays 50 once capped).
//   Bug 2 (AV161): lightbox nav arrows used faint bg-white/15 → invisible on
//                  light/white images.

// Focused render — stub the heavy message row + day grouping.
vi.mock('../src/components/staffchat/StaffChatMessage.jsx', () => ({
  StaffChatMessage: ({ message }) => <div data-testid="m">{message.id}</div>,
}));
vi.mock('../src/lib/staffChatDayGroups.js', () => ({
  groupMessagesByDay: (msgs) => [{ dayKey: 'd', label: '', items: msgs }],
}));

import { StaffChatMessageList } from '../src/components/staffchat/StaffChatMessageList.jsx';

afterEach(cleanup);
beforeEach(() => { window.HTMLElement.prototype.scrollIntoView = vi.fn(); });

// 50 messages (the cap); `lastId` controls the newest (last) message's id.
const mk = (n, lastId) =>
  Array.from({ length: n }, (_, i) => ({
    id: i === n - 1 ? lastId : `m${i}`,
    deviceId: 'd1',
    text: `t${i}`,
    createdAt: 1000 + i,
  }));

describe('V140.Bug1 · staff-chat auto-scroll fires on a new message even at the 50-cap (AV160)', () => {
  it('re-scrolls when the last message changes but length stays 50 (the reported bug)', () => {
    const { rerender } = render(<StaffChatMessageList messages={mk(50, 'old')} ownDeviceId="x" />);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1); // initial mount

    // A new send at the cap: array length is STILL 50, only the last id changes.
    // Old code `[messages.length]` → would NOT fire (this is exactly the bug).
    rerender(<StaffChatMessageList messages={mk(50, 'new')} ownDeviceId="x" />);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('does NOT re-scroll when the same snapshot re-renders (new array ref, same last id)', () => {
    const msgs = mk(50, 'same');
    const { rerender } = render(<StaffChatMessageList messages={msgs} ownDeviceId="x" />);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    rerender(<StaffChatMessageList messages={[...msgs]} ownDeviceId="x" />); // identity changes, last id same
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1); // no redundant yank
  });

  it('still scrolls on the very first messages (length growing 0→N path unaffected)', () => {
    const { rerender } = render(<StaffChatMessageList messages={mk(1, 'a')} ownDeviceId="x" />);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    rerender(<StaffChatMessageList messages={mk(2, 'b')} ownDeviceId="x" />);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('source: scroll effect keys on lastMessageId, never [messages.length]', () => {
    const src = readFileSync('src/components/staffchat/StaffChatMessageList.jsx', 'utf8');
    expect(src).toMatch(/const lastMessageId = /);
    expect(src).toMatch(/\}, \[lastMessageId\]\)/);
    expect(src).not.toMatch(/\}, \[messages\.length\]\)/);            // bug pattern gone
    expect(src).not.toMatch(/\[onScrolledToBottom, messages\.length\]/); // observer too
  });
});

describe('V140.Bug2 · lightbox nav arrows visible on any image colour (AV161)', () => {
  const lb = readFileSync('src/components/staffchat/StaffChatImageLightbox.jsx', 'utf8');

  it('both nav-arrow circles use a dark ring-backed circle (not faint bg-white)', () => {
    // old faint-white nav pattern (group-hover:bg-white/30) must be gone…
    expect(lb).not.toMatch(/rounded-full bg-white\/15 group-hover:bg-white\/30/);
    // …and BOTH arrows (prev + next) use the dark ring-backed circle.
    const dark = lb.match(/rounded-full bg-black\/55 ring-1 ring-white\/40/g) || [];
    expect(dark.length).toBe(2);
  });

  it('the dark circle sits right before each Chevron (scoped to the nav arrows)', () => {
    for (const marker of ['<ChevronLeft', '<ChevronRight']) {
      const before = lb.slice(Math.max(0, lb.indexOf(marker) - 260), lb.indexOf(marker));
      expect(before).toMatch(/bg-black\//);
    }
  });

  it('reference: ImageLightbox close still uses a dark backing (the proven pattern)', () => {
    expect(readFileSync('src/components/ImageLightbox.jsx', 'utf8')).toMatch(/bg-black\/\d/);
  });
});

describe('V140 · AV160 + AV161 documented', () => {
  it('both invariants present in the audit skill', () => {
    const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(av).toMatch(/AV160/);
    expect(av).toMatch(/AV161/);
  });
});
