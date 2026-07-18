// V91 (2026-05-18 EOD+11 LATE) — DuoPill toggle + mobile search-center.
//
// User report (verbatim):
//   "ทำปุ่มปิด menu mobile ของเราด้วย อาจจะแตะที่ปุ่มเปิดนั่นแหละเพื่อปิด
//    และนำช่องค้นหาของเวอร์ชั่น desktop มาไว้ตรงกลาง header ของเวอร์ชั่น
//    mobile พร้อมจัด left/center/right ให้สมดุลด้วย"
//
// Pre-V91:
//   - DuoPill menu button OPENS bloom; dismissal requires backdrop tap
//     (hard to discover on mobile per V90 fix history).
//   - Mobile TopBar Row 1: Home + Briefcase + flex-1 spacer + Branch +
//     Theme + Profile. No visible search input.
//
// V91 cosmetic-shell + minor behavior change (user-explicit override of
// V82 menu-untouchable lock — fix scope minimal):
//   - BackendDuoPill receives `bloomOpen` + `onToggleBloom` props; tap
//     toggles bloom state. Icon swaps Menu↔X. aria-label flips
//     เปิดเมนู↔ปิดเมนู. aria-expanded reflects state.
//   - BackendShellNew adds toggleBloom callback + passes bloomOpen to
//     DuoPill. openBloom retained for backward compat (unused).
//   - BackendTopBarNew mobile Row 1 redesigned to 3-zone layout matching
//     desktop balance: [LEFT home] [CENTER search-box trigger 200px max]
//     [RIGHT branch+theme+profile]. Briefcase icon REMOVED (search box
//     replaces it as the palette trigger).

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

import BackendDuoPill from '../src/components/backend/shell/BackendDuoPill.jsx';

const DUO_PILL_PATH = path.resolve(__dirname, '../src/components/backend/shell/BackendDuoPill.jsx');
const SHELL_PATH = path.resolve(__dirname, '../src/components/backend/shell/BackendShellNew.jsx');
const TOPBAR_PATH = path.resolve(__dirname, '../src/components/backend/shell/BackendTopBarNew.jsx');
const SOURCE_DUO = fs.readFileSync(DUO_PILL_PATH, 'utf8');
const SOURCE_SHELL = fs.readFileSync(SHELL_PATH, 'utf8');
const SOURCE_TOPBAR = fs.readFileSync(TOPBAR_PATH, 'utf8');

describe('V91 — DuoPill toggle behavior (RTL)', () => {
  it('D1.1 — menu button shows Menu icon + "เปิดเมนู" aria-label when bloomOpen=false', () => {
    render(<BackendDuoPill bloomOpen={false} onToggleBloom={() => {}} />);
    const menuBtn = screen.getByTestId('duo-pill-menu');
    expect(menuBtn.getAttribute('aria-label')).toBe('เปิดเมนู');
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
    expect(menuBtn.getAttribute('data-bloom-open')).toBe('false');
    // Menu icon present, X icon absent.
    expect(menuBtn.querySelector('svg.lucide-menu')).not.toBeNull();
    expect(menuBtn.querySelector('svg.lucide-x')).toBeNull();
  });

  it('D1.2 — menu button shows X icon + "ปิดเมนู" aria-label when bloomOpen=true', () => {
    render(<BackendDuoPill bloomOpen={true} onToggleBloom={() => {}} />);
    const menuBtn = screen.getByTestId('duo-pill-menu');
    expect(menuBtn.getAttribute('aria-label')).toBe('ปิดเมนู');
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true');
    expect(menuBtn.getAttribute('data-bloom-open')).toBe('true');
    // X icon present, Menu icon absent.
    expect(menuBtn.querySelector('svg.lucide-x')).not.toBeNull();
    expect(menuBtn.querySelector('svg.lucide-menu')).toBeNull();
  });

  it('D2.1 — onToggleBloom fires on menu button click', () => {
    const onToggleBloom = vi.fn();
    render(<BackendDuoPill bloomOpen={false} onToggleBloom={onToggleBloom} />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    expect(onToggleBloom).toHaveBeenCalledTimes(1);
  });

  it('D2.2 — backward-compat: falls back to onOpenBloom when onToggleBloom not provided', () => {
    const onOpenBloom = vi.fn();
    render(<BackendDuoPill bloomOpen={false} onOpenBloom={onOpenBloom} />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    expect(onOpenBloom).toHaveBeenCalledTimes(1);
  });

  it('D3.1 — chat button onClick UNCHANGED (V82 lock preserved for chat segment)', () => {
    // Chat button must continue dispatching the lover:staff-chat-open event.
    const dispatched = [];
    const orig = window.dispatchEvent;
    window.dispatchEvent = (ev) => { dispatched.push(ev.type); return orig.call(window, ev); };
    render(<BackendDuoPill bloomOpen={false} onToggleBloom={() => {}} />);
    fireEvent.click(screen.getByTestId('duo-pill-chat'));
    window.dispatchEvent = orig;
    expect(dispatched).toContain('lover:staff-chat-open');
  });
});

describe('V91 — DuoPill source-grep regression', () => {
  it('S1.1 — DuoPill imports X icon from lucide-react', () => {
    expect(SOURCE_DUO).toMatch(/import\s*\{[^}]*\bX\b[^}]*\}\s*from\s*['"]lucide-react['"]/);
  });

  it('S1.2 — handleMenuClick prefers onToggleBloom (toggle) over onOpenBloom (back-compat)', () => {
    expect(SOURCE_DUO).toMatch(/if\s*\(typeof onToggleBloom === ['"]function['"]\)\s*\{[\s\S]{0,80}onToggleBloom\(\)/);
  });

  it('S1.3 — menu button conditionally renders X vs MenuIcon based on bloomOpen', () => {
    expect(SOURCE_DUO).toMatch(/\{bloomOpen \? <X size=\{22\}/);
    expect(SOURCE_DUO).toMatch(/<MenuIcon size=\{22\}/);
  });

  it('S1.4 — aria-label + aria-expanded flip with bloomOpen', () => {
    expect(SOURCE_DUO).toMatch(/aria-label=\{bloomOpen \? ['"]ปิดเมนู['"] : ['"]เปิดเมนู['"]/);
    expect(SOURCE_DUO).toMatch(/aria-expanded=\{bloomOpen \? ['"]true['"] : ['"]false['"]/);
  });

  it('S1.5 — V91 marker comment present', () => {
    expect(SOURCE_DUO).toMatch(/V91[\s\S]{0,300}toggles bloom/i);
  });
});

describe('V91 — BackendShellNew wiring', () => {
  it('S2.1 — shell defines toggleBloom callback alongside openBloom + closeBloom', () => {
    expect(SOURCE_SHELL).toMatch(/const toggleBloom = useCallback\(\(\) => setBloomOpen\(\(b\) => !b\), \[\]\)/);
  });

  it('S2.2 — DuoPill receives bloomOpen + onToggleBloom (not onOpenBloom)', () => {
    expect(SOURCE_SHELL).toMatch(/<BackendDuoPill bloomOpen=\{bloomOpen\} onToggleBloom=\{toggleBloom\}/);
  });

  it('S2.3 — V82 menu-untouchable handleNavigate body PRESERVED', () => {
    expect(SOURCE_SHELL).toMatch(/onNavigate\?\.\(tabId\);\s*setBloomOpen\(false\);\s*setPaletteOpen\(false\);/);
  });

  it('S2.4 — V90 isSpecificEntityContext prop preserved', () => {
    expect(SOURCE_SHELL).toMatch(/isSpecificEntityContext\s*=\s*false/);
    // DL repoint (2026-07-19): the deep-link signal is folded into the initial state.
    expect(SOURCE_SHELL).toMatch(/useState\(!\(isSpecificEntityContext \|\| initialBloomClosed\)\)/);
  });
});

describe('V91 — BackendTopBarNew mobile 3-zone search-center', () => {
  it('S3.1 — Mobile Row 1 uses justify-between for 3-zone balance', () => {
    // Find the mobile branch — slice from `!isDesktop` to the Row 2 comment.
    const m = SOURCE_TOPBAR.match(/!isDesktop\s*&&[\s\S]{0,4500}?Row 2/);
    expect(m).not.toBeNull();
    const mobileSlice = m[0];
    // Outer 3-zone container has justify-between.
    expect(mobileSlice).toMatch(/h-11\s+px-2\s+flex\s+items-center[^"]*justify-between/);
  });

  it('S3.2 — Mobile CENTER zone has the search-box trigger (replaces Briefcase)', () => {
    const m = SOURCE_TOPBAR.match(/!isDesktop\s*&&[\s\S]{0,4500}?Row 2/);
    const mobileSlice = m[0];
    // Search trigger has `data-testid="topbar-shortcut-mobile"` + Search icon
    // (not Briefcase). Width capped at max-w-[200px] for mobile fit.
    expect(mobileSlice).toMatch(/data-testid="topbar-shortcut-mobile"[\s\S]{0,500}max-w-\[200px\]/);
    expect(mobileSlice).toMatch(/<Search size=\{12\}/);
    // Briefcase icon MUST be gone from mobile Row 1.
    expect(mobileSlice).not.toMatch(/<Briefcase size=\{18\}/);
  });

  it('S3.3 — Mobile RIGHT cluster has Branch + Theme + Profile in a flex-shrink-0 wrapper', () => {
    const m = SOURCE_TOPBAR.match(/!isDesktop\s*&&[\s\S]{0,4500}?Row 2/);
    const mobileSlice = m[0];
    // RIGHT cluster wraps the 3 components in a flex-shrink-0 div.
    expect(mobileSlice).toMatch(/flex items-center gap-1\.5 flex-shrink-0[^<]*[\s\S]{0,300}?<BranchSelector\s*\/>[\s\S]{0,200}?<ThemeToggle[\s\S]{0,200}?<ProfileDropdown/);
  });

  it('S3.4 — Mobile pre-V91 `<div className="flex-1" />` spacer REMOVED', () => {
    // The old layout used a bare flex-1 spacer between Briefcase and the
    // right cluster. V91 replaces it with a centered search zone. Source-
    // grep regression: no naked `<div className="flex-1" />` in the mobile
    // slice.
    const m = SOURCE_TOPBAR.match(/!isDesktop\s*&&[\s\S]{0,4500}?Row 2/);
    const mobileSlice = m[0];
    expect(mobileSlice).not.toMatch(/<div className="flex-1"\s*\/>/);
  });

  it('S3.5 — V91 marker comment present in TopBar mobile block', () => {
    const m = SOURCE_TOPBAR.match(/!isDesktop\s*&&[\s\S]{0,4500}?Row 2/);
    const mobileSlice = m[0];
    expect(mobileSlice).toMatch(/V91[\s\S]{0,200}3-zone/i);
  });

  it('S3.6 — Desktop layout UNCHANGED (3-zone structure preserved from V85-followup EOD9)', () => {
    // Desktop branch must still have the LEFT/CENTER/RIGHT cluster pattern
    // with the search-box trigger at max-w-[320px].
    expect(SOURCE_TOPBAR).toMatch(/isDesktop\s*&&[\s\S]{0,3000}?max-w-\[320px\][\s\S]{0,500}?ค้นหาเมนู…/);
  });
});
