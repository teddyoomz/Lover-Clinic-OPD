// V73-followup (2026-05-22 EOD+1) — Regression for user-reported bug saga
// (Rounds 1-5 of /systematic-debugging — Phase 4.5 "question the architecture").
//
// User reports through the saga:
//   R1: "บั๊คเหมือนเดิม" — pressing prev once, can't press next back at all.
//   R2: "ยังต้องกด 2 ครั้งบางที" — intermittent under non-rapid clicks.
//   R3: "เลื่อนรัวๆ 7-10 รอบ แล้วเจอ" — rapid prev/next sometimes sticks.
//   R4: "ยังมีดีเลย์ กดแล้วไม่เปลี่ยนเลยอยู่ · ไม่ responsive ในทันที
//        ก็ก่อให้เกิดอาการค้างได้" — even with Set-based race-immune fix,
//        the opacity-gate render-cycle + 150ms CSS transition was perceived
//        as delay; user wants INSTANT response on every click.
//
// Round-5 architectural fix (the "question the architecture" answer per
// /systematic-debugging Phase 4.5): REMOVE the opacity gate entirely. Two
// stacked <img>s — blurred thumb BEHIND (always full opacity) + sharp full
// IN FRONT (no gate, no transition, no state). Browser paints cached hits
// instantly; fresh-loads show the blurred thumb as cover until they paint.
// INSTANT response + zero state + zero race surface.
//
// These tests assert the architectural CONTRACT (state absent, opacity gate
// absent, etc.) rather than simulating browser race conditions — because
// with zero state there are no races possible to simulate.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import React from 'react';

import { StaffChatImageLightbox } from '../src/components/staffchat/StaffChatImageLightbox.jsx';

const URL_1 = 'https://example.test/img-1.jpg';
const URL_2 = 'https://example.test/img-2.jpg';
const URL_3 = 'https://example.test/img-3.jpg';

const IMAGES_2 = [
  { fullUrl: URL_1, thumbUrl: URL_1 + '?t' },
  { fullUrl: URL_2, thumbUrl: URL_2 + '?t' },
];
const IMAGES_3 = [
  { fullUrl: URL_1, thumbUrl: URL_1 + '?t' },
  { fullUrl: URL_2, thumbUrl: URL_2 + '?t' },
  { fullUrl: URL_3, thumbUrl: URL_3 + '?t' },
];

function fullImg() { return screen.getByTestId('staff-chat-lightbox-image'); }
function queryPrev() { return screen.queryByTestId('staff-chat-lightbox-prev'); }
function queryNext() { return screen.queryByTestId('staff-chat-lightbox-next'); }

describe('V73-followup R5 — INSTANT lightbox (no opacity gate, no state, no race surface)', () => {
  it('initial mount: full img is in DOM with src + NO opacity class (always visible)', () => {
    render(<StaffChatImageLightbox images={IMAGES_2} startIndex={1} onClose={vi.fn()} />);
    const img = fullImg();
    expect(img.getAttribute('src')).toBe(URL_2);
    // No opacity-0 / opacity-100 / transition classes — fully visible by default
    expect(img.className).not.toMatch(/opacity-0\b/);
    expect(img.className).not.toMatch(/transition-opacity/);
    cleanup();
  });

  it('prev → next round-trip: src updates SYNCHRONOUSLY on every click (zero render-cycle delay)', () => {
    render(<StaffChatImageLightbox images={IMAGES_2} startIndex={1} onClose={vi.fn()} />);
    expect(fullImg().getAttribute('src')).toBe(URL_2);

    fireEvent.click(queryPrev());
    // Synchronously after click: src already updated, no opacity transition.
    expect(fullImg().getAttribute('src')).toBe(URL_1);
    expect(fullImg().className).not.toMatch(/opacity-0\b/);

    fireEvent.click(queryNext());
    expect(fullImg().getAttribute('src')).toBe(URL_2);
    expect(fullImg().className).not.toMatch(/opacity-0\b/);
    cleanup();
  });

  it('RAPID-CLICK STRESS: 200 round-trips with no waits — every state visible immediately', () => {
    render(<StaffChatImageLightbox images={IMAGES_2} startIndex={0} onClose={vi.fn()} />);
    // 200 round-trips with NO awaits. With zero state there can be no race.
    for (let i = 0; i < 200; i++) {
      fireEvent.click(queryNext());
      expect(fullImg().getAttribute('src')).toBe(URL_2);
      expect(fullImg().className).not.toMatch(/opacity-0\b/);
      fireEvent.click(queryPrev());
      expect(fullImg().getAttribute('src')).toBe(URL_1);
      expect(fullImg().className).not.toMatch(/opacity-0\b/);
    }
    cleanup();
  });

  it('N=3 mid-array: both arrows visible, every click changes src synchronously', () => {
    render(<StaffChatImageLightbox images={IMAGES_3} startIndex={1} onClose={vi.fn()} />);
    expect(fullImg().getAttribute('src')).toBe(URL_2);
    fireEvent.click(queryPrev());
    expect(fullImg().getAttribute('src')).toBe(URL_1);
    fireEvent.click(queryNext());
    expect(fullImg().getAttribute('src')).toBe(URL_2);
    fireEvent.click(queryNext());
    expect(fullImg().getAttribute('src')).toBe(URL_3);
    fireEvent.click(queryPrev());
    expect(fullImg().getAttribute('src')).toBe(URL_2);
    cleanup();
  });

  it('keyboard arrows are equally instant', () => {
    render(<StaffChatImageLightbox images={IMAGES_3} startIndex={1} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(fullImg().getAttribute('src')).toBe(URL_1);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(fullImg().getAttribute('src')).toBe(URL_2);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(fullImg().getAttribute('src')).toBe(URL_3);
    cleanup();
  });

  // Round-6 (2026-05-22 EOD+2) supersedes the R5 thumb-behind design. User
  // reported R5 still felt "ติดบ้าง ไม่ติดบ้าง" with rapid clicks (keyed
  // remount of `<img key={idx}>` caused DOM churn). R6 = ONE <img> never
  // remounted (browser smooth-swaps src) + Blob cache pre-warm. The
  // thumb-behind layer is GONE — the blob cache covers any fresh-load gap.
  it('single full <img> for the main image — NO thumb-behind layer (Round 6 contract)', () => {
    render(<StaffChatImageLightbox images={IMAGES_2} startIndex={0} onClose={vi.fn()} />);
    const lightbox = screen.getByTestId('staff-chat-image-lightbox');
    // No aria-hidden blurred-thumb image (R5 artifact removed in R6)
    const hidden = lightbox.querySelectorAll('img[aria-hidden="true"]');
    expect(hidden.length).toBe(0);
    // Main image is the only <img> in the central region (filmstrip thumbs at
    // the bottom are separate — they have a parent button with thumb testid).
    const mainImg = screen.getByTestId('staff-chat-lightbox-image');
    expect(mainImg.tagName).toBe('IMG');
    // No blurred-thumb className anywhere on the main image
    expect(mainImg.className).not.toMatch(/blur-\[2px\]/);
    cleanup();
  });

  it('main <img> is NEVER remounted across nav — same element, src swaps in place (Round 6 contract)', () => {
    render(<StaffChatImageLightbox images={IMAGES_3} startIndex={0} onClose={vi.fn()} />);
    const before = screen.getByTestId('staff-chat-lightbox-image');
    fireEvent.click(queryNext());
    const after1 = screen.getByTestId('staff-chat-lightbox-image');
    fireEvent.click(queryNext());
    const after2 = screen.getByTestId('staff-chat-lightbox-image');
    // SAME DOM node identity through every nav — the heart of R6's smooth swap
    expect(after1).toBe(before);
    expect(after2).toBe(before);
    expect(before.getAttribute('src')).toBe(URL_3);
    cleanup();
  });
});
