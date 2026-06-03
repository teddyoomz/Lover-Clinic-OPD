// tests/staffchat-sticker-objecturl-leak.test.jsx
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop), sticker #6. The custom-sticker
// grid rendered <img src={stickerObjectUrl(rec)} /> INLINE inside mine.map →
// stickerObjectUrl does URL.createObjectURL(rec.blob) with NO cache + NO revoke,
// so EVERY render minted a fresh object-URL per sticker and never freed it → the
// underlying blobs stayed alive for the page lifetime (a bounded but real leak;
// worse on each re-render of the custom tab).
//
// Fix: StickerPicker builds the object-URLs ONCE per `mine` change in a useEffect
// (rec.id → url) and revokes the prior set on change/unmount; the render reads the
// cached map. → one URL per rec, revoked when the picker closes.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../src/lib/staffChatStickers.js', () => ({
  BUNDLED_STICKERS: [],
  bundledStickerSrc: () => '',
}));
vi.mock('../src/lib/stickerLibrary.js', () => ({
  listStickers: vi.fn(() => Promise.resolve([
    { id: 's1', blob: new Blob(['a'], { type: 'image/png' }), addedAt: 2 },
    { id: 's2', blob: new Blob(['b'], { type: 'image/png' }), addedAt: 1 },
  ])),
  addSticker: vi.fn(() => Promise.resolve()),
  addStickerFromUrl: vi.fn(() => Promise.resolve()),
  removeSticker: vi.fn(() => Promise.resolve()),
  stickerObjectUrl: (rec) => (rec && rec.blob ? 'blob:legacy' : ''),
}));

import { StaffChatStickerPicker } from '../src/components/staffchat/StaffChatStickerPicker.jsx';

const ORIG_CREATE = URL.createObjectURL;
const ORIG_REVOKE = URL.revokeObjectURL;
let createSpy, revokeSpy, seq;
beforeEach(() => {
  seq = 0;
  createSpy = vi.fn(() => `blob:fake-${++seq}`);
  revokeSpy = vi.fn();
  URL.createObjectURL = createSpy;
  URL.revokeObjectURL = revokeSpy;
});
afterEach(() => {
  URL.createObjectURL = ORIG_CREATE;
  URL.revokeObjectURL = ORIG_REVOKE;
});

const picker = () => (
  <StaffChatStickerPicker onPickEmoji={() => {}} onSendBundled={() => {}} onSendCustom={() => {}} onClose={() => {}} />
);

describe('SL — custom-sticker object-URL lifecycle (no per-render leak)', () => {
  it('SL1 one object-URL per rec, NOT per render, and revoked on unmount', async () => {
    const { rerender, unmount } = render(picker());
    expect(createSpy).not.toHaveBeenCalled();            // emoji tab default → no URLs
    fireEvent.click(screen.getByTestId('sticker-tab-custom'));
    await waitFor(() => expect(screen.getAllByTestId('sticker-custom').length).toBe(2));
    expect(createSpy.mock.calls.length).toBe(2);         // one URL per sticker

    // re-renders that DON'T change the sticker list must NOT mint new URLs (the leak)
    rerender(picker());
    rerender(picker());
    expect(createSpy.mock.calls.length).toBe(2);         // still 2, not 6

    // closing the picker frees the blobs
    unmount();
    expect(revokeSpy).toHaveBeenCalledTimes(2);
  });
});

describe('SL-SG — source-grep regression lock', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/staffchat/StaffChatStickerPicker.jsx'), 'utf8');
  it('SG1 the custom grid reads a cached url map (no inline stickerObjectUrl per render)', () => {
    // the render must NOT call stickerObjectUrl(rec) inline in the map
    expect(src).not.toMatch(/src=\{stickerObjectUrl\(/);
    // a cached map drives the <img>
    expect(src).toMatch(/mineUrls\[/);
  });
  it('SG2 an effect creates + revokes object-URLs keyed on the sticker list', () => {
    expect(src).toMatch(/URL\.createObjectURL/);
    expect(src).toMatch(/URL\.revokeObjectURL/);
    expect(src).toMatch(/\}, \[mine\]\);/);
  });
});
