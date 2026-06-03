// tests/staffchat-pause-media-on-minimize.test.jsx
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop), H11. hide-don't-unmount keeps the
// staff-chat panel MOUNTED (display:none) on minimize. StaffChatMessage renders
// inline <video controls> / <audio controls> in the bubble. display:none does NOT
// pause a playing media element → a voice message / video that the user started
// KEEPS PLAYING (audio audible) after they minimize the chat, with no visible
// controls to stop it. Pre-change a minimize UNMOUNTED the list → the media
// element unmounted → playback stopped. This is a hide-don't-unmount regression.
//
// Desired: minimizing the panel (visible→false) pauses any inline media in the
// list (restores the pre-change "minimize stops playback" behavior).
//
// Fix: the MessageList [visible] effect, on the visible→false branch, pauses
// every <video>/<audio> inside listRef before returning.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StaffChatMessageList } from '../src/components/staffchat/StaffChatMessageList.jsx';

let ioInstances = [];
class MockIntersectionObserver { constructor(cb){ this.cb = cb; ioInstances.push(this); } observe(){} unobserve(){} disconnect(){} }

const ORIG_IO = global.IntersectionObserver;
const ORIG_SCROLL = Element.prototype.scrollIntoView;
const ORIG_PAUSE = window.HTMLMediaElement.prototype.pause;
const ORIG_LOAD = window.HTMLMediaElement.prototype.load;
let pauseSpy;
beforeEach(() => {
  ioInstances = [];
  global.IntersectionObserver = MockIntersectionObserver;
  Element.prototype.scrollIntoView = vi.fn();
  pauseSpy = vi.fn();
  window.HTMLMediaElement.prototype.pause = pauseSpy;     // jsdom doesn't implement media — stub it
  window.HTMLMediaElement.prototype.load = vi.fn();
});
afterAll(() => {
  if (ORIG_IO === undefined) delete global.IntersectionObserver; else global.IntersectionObserver = ORIG_IO;
  Element.prototype.scrollIntoView = ORIG_SCROLL;
  window.HTMLMediaElement.prototype.pause = ORIG_PAUSE;
  window.HTMLMediaElement.prototype.load = ORIG_LOAD;
});

const now = Date.UTC(2026, 5, 3, 7, 0, 0);
const videoMsg = { id: 'mv', deviceId: 'other', displayName: 'A', createdAt: { toMillis: () => now },
  attachments: [{ mimeType: 'video/mp4', fullUrl: 'blob:vid', thumbUrl: '' }] };
const audioMsg = { id: 'ma', deviceId: 'other', displayName: 'A', createdAt: { toMillis: () => now + 1000 },
  attachments: [{ mimeType: 'audio/mpeg', fullUrl: 'blob:aud', thumbUrl: '' }] };

describe('MM — inline media pauses when the chat is minimized (hide-don\'t-unmount)', () => {
  it('MM1 a <video> in the list is paused on minimize (visible true→false)', () => {
    const { rerender } = render(<StaffChatMessageList messages={[videoMsg]} ownDeviceId="me" visible={true} />);
    expect(screen.getByTestId('staff-chat-attach-video')).toBeInTheDocument();
    expect(pauseSpy).not.toHaveBeenCalled();                 // open → not paused
    rerender(<StaffChatMessageList messages={[videoMsg]} ownDeviceId="me" visible={false} />);
    expect(pauseSpy).toHaveBeenCalled();                     // minimize → paused (no background audio)
  });

  it('MM2 an <audio> in the list is paused on minimize', () => {
    const { rerender } = render(<StaffChatMessageList messages={[audioMsg]} ownDeviceId="me" visible={true} />);
    expect(screen.getByTestId('staff-chat-attach-audio')).toBeInTheDocument();
    rerender(<StaffChatMessageList messages={[audioMsg]} ownDeviceId="me" visible={false} />);
    expect(pauseSpy).toHaveBeenCalled();
  });

  it('MM3 media is NOT paused while the panel stays open (a new message re-render must not stop playback)', () => {
    const { rerender } = render(<StaffChatMessageList messages={[videoMsg]} ownDeviceId="me" visible={true} />);
    pauseSpy.mockClear();
    // a new message arrives while open → visible unchanged → must NOT pause the playing media
    rerender(<StaffChatMessageList messages={[videoMsg, audioMsg]} ownDeviceId="me" visible={true} />);
    expect(pauseSpy).not.toHaveBeenCalled();
  });
});

describe('SG — pause-on-minimize regression lock', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/staffchat/StaffChatMessageList.jsx'), 'utf8');
  it('SG1 the [visible] effect pauses video/audio when !visible', () => {
    // a querySelectorAll('video, audio') + pause must live in the !visible branch
    expect(src).toMatch(/querySelectorAll\(['"]video, ?audio['"]\)/);
    expect(src).toMatch(/\.pause\(\)/);
  });
});
