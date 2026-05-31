// Frontend top menu sticky — source-grep regression bank (2026-06-01, AV170).
//
// Root cause (verified in a real browser, /systematic-debugging): the Frontend top
// menu (<header data-testid="admin-top-menu">) was `position: relative` → it scrolled
// away with the page. A naive `sticky top-0` SILENTLY FAILS because the parent
// .admin-frontend-zone used `overflow-x: hidden`, which CSS coerces to computed
// `overflow-y: auto`, making the zone a scroll-container that captures the sticky
// (sticky reference becomes the never-scrolling zone, not the viewport).
//
// Fix (3 coordinated changes):
//   1. header `relative z-20` → `sticky top-0 z-20`
//   2. zone `overflow-x-hidden` → `overflow-x-clip` (clip clips horizontally WITHOUT
//      becoming a scroll-container → sticky sticks to the viewport)
//   3. in-page QR sidebar `sticky top-8` → `sticky top-24` (clears the now-sticky
//      ~60px menu so it doesn't overlap when scrolling)
//
// Working reference (unchanged): the Backend top bar (BackendTopBarNew) was ALREADY
// `sticky top-0` and keeps its overflow-x-hidden on a SIBLING <main>, not an ancestor.
// That is why the Backend sticky worked and the Frontend's would not.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const ADMIN = readFileSync('src/pages/AdminDashboard.jsx', 'utf-8');
const BE_TOPBAR = readFileSync('src/components/backend/shell/BackendTopBarNew.jsx', 'utf-8');
const BE_SHELL = readFileSync('src/components/backend/shell/BackendShellNew.jsx', 'utf-8');

describe('Frontend top menu sticky (AV170, 2026-06-01)', () => {
  // ── header is sticky ──
  it('S1.1 — top menu header is sticky top-0', () => {
    expect(ADMIN).toMatch(/<header className="menu-shell[^"]*\bsticky top-0\b[^"]*" data-testid="admin-top-menu">/);
  });
  it('S1.2 — top menu header no longer uses `relative z-20` (regression lock)', () => {
    expect(ADMIN).not.toMatch(/<header className="menu-shell[^"]*\brelative z-20\b[^"]*" data-testid="admin-top-menu">/);
  });
  it('S1.3 — header keeps z-20 (above page-flow content)', () => {
    expect(ADMIN).toMatch(/<header className="menu-shell[^"]*\bz-20\b[^"]*" data-testid="admin-top-menu">/);
  });

  // ── zone overflow-x: clip un-breaks sticky ──
  it('S2.1 — .admin-frontend-zone uses overflow-x-clip', () => {
    expect(ADMIN).toMatch(/overflow-x-clip admin-frontend-zone/);
  });
  it('S2.2 — .admin-frontend-zone MUST NOT use overflow-x-hidden (would break the sticky menu)', () => {
    expect(ADMIN).not.toMatch(/overflow-x-hidden admin-frontend-zone/);
  });

  // ── in-page QR sidebar clears the now-sticky header ──
  it('S3.1 — QR sidebar uses sticky top-24 (clears the ~60px sticky menu)', () => {
    expect(ADMIN).toMatch(/sticky top-24 shadow-\[var\(--shadow-panel\)\]/);
  });
  it('S3.2 — QR sidebar no longer sticky top-8 (would overlap the sticky menu)', () => {
    expect(ADMIN).not.toMatch(/sticky top-8 shadow-\[var\(--shadow-panel\)\]/);
  });

  // ── institutional-memory marker ──
  it('S4.1 — AV170 marker present', () => {
    expect(ADMIN).toMatch(/AV170/);
  });

  // ── class-of-bug classifier: Backend reference stays correct (isolated Frontend miss) ──
  it('S5.1 — Backend top bar reference is sticky top-0 (working example, unchanged)', () => {
    expect(BE_TOPBAR).toMatch(/sticky top-0/);
  });
  it('S5.2 — Backend keeps overflow-x-hidden on the <main> SIBLING, not the top-bar ancestor', () => {
    expect(BE_SHELL).toMatch(/<main className="[^"]*overflow-x-hidden">/);
  });
});
