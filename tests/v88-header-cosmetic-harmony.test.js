// V88 (2026-05-18 EOD+11) — AdminDashboard top-bar cosmetic harmony.
//
// User directive (verbatim):
//   "ทำให้ปุ่ม Tab ขวาบนมันเข้ากับ Hearder Menu bar ด้านซ้ายหน่อยสิ
//    พร้อมยังทำงานเหมือนเดิมได้ 100% ห้ามยุ่งกับ logic, flow, wiring
//    ใดๆนะ ... ทำให้ปุ่มที่โดน selector ใน Bar มันแดงกว่านี้ด้วย
//    ในภาพมันแดงน้ำไป ไม่เข้าตีม ตีมเราแดงกว่านี้ นี่มันออกส้มๆ"
//
// Cosmetic-shell rule applies: className/CSS ONLY. Every handler / state /
// prop / hook verbatim. The handler regression locks at the bottom of this
// file enforce that constraint.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN_DASHBOARD_PATH = path.resolve(__dirname, '../src/pages/AdminDashboard.jsx');
const SOURCE = fs.readFileSync(ADMIN_DASHBOARD_PATH, 'utf8');

const INDEX_CSS_PATH = path.resolve(__dirname, '../src/index.css');
const CSS = fs.readFileSync(INDEX_CSS_PATH, 'utf8');

describe('V88 — .menu-tab-active redder color', () => {
  it('A1.1 — .menu-tab-active uses red-500 (239,68,68), NOT orange-400 (251,146,60)', () => {
    // Locate the .menu-tab-active rule body. CSS source has 1 such rule
    // (plus light-theme override which only sets color). Extract the
    // body of the first definition.
    const m = CSS.match(/\.menu-tab-active\s*\{([\s\S]*?)\}/);
    expect(m).not.toBeNull();
    const body = m[1];
    // Orange-400 stops MUST be gone (regression lock).
    expect(body).not.toMatch(/rgba\(251\s*,\s*146\s*,\s*60/);
    // Red-500 stops MUST appear at least once in the gradient + border.
    expect(body).toMatch(/rgba\(239\s*,\s*68\s*,\s*68/);
  });

  it('A1.2 — .menu-tab-active border-color uses red-500 with stronger alpha', () => {
    const m = CSS.match(/\.menu-tab-active\s*\{([\s\S]*?)\}/);
    const body = m[1];
    // border-color line must reference red-500 (239,68,68).
    expect(body).toMatch(/border-color:\s*rgba\(239\s*,\s*68\s*,\s*68\s*,\s*0\.\d+\)/);
  });

  it('A1.3 — .menu-tab-active gradient retains red-600 (220,38,38) starting stop', () => {
    // V88 keeps red-600 as the primary stop and replaces only the orange
    // mid/end stop with red-500.
    const m = CSS.match(/\.menu-tab-active\s*\{([\s\S]*?)\}/);
    const body = m[1];
    expect(body).toMatch(/rgba\(220\s*,\s*38\s*,\s*38/);
  });

  it('A2.1 — .menu-dock-tab-active mobile mirror also redder (no orange-400)', () => {
    const m = CSS.match(/\.menu-dock-tab-active\s*\{([\s\S]*?)\}/);
    expect(m).not.toBeNull();
    const body = m[1];
    expect(body).not.toMatch(/rgba\(251\s*,\s*146\s*,\s*60/);
    expect(body).toMatch(/rgba\(239\s*,\s*68\s*,\s*68/);
  });

  it('A3.1 — V88 marker comment present near .menu-tab-active', () => {
    // Locks the institutional-memory comment so a future refactor can\'t
    // silently regress to orange.
    expect(CSS).toMatch(/V88[\s\S]{0,300}universal red active state/i);
  });
});

describe('V88 — desktop right-rail buttons harmonized to transparent-base', () => {
  // Slice the desktop top bar block (line 5768 ish .. line 5886 ish).
  // Use the menu-shell / admin-top-menu anchor and the closing of the
  // desktop bar (the menu-mobile block opens right after).
  const desktopStart = SOURCE.indexOf('admin-top-menu');
  const mobileStart = SOURCE.indexOf('menu-mobile md:hidden', desktopStart);
  const DESKTOP_SLICE = SOURCE.slice(desktopStart, mobileStart);

  it('R1.1 — desktop slice resolves (sanity)', () => {
    expect(desktopStart).toBeGreaterThan(0);
    expect(mobileStart).toBeGreaterThan(desktopStart);
    expect(DESKTOP_SLICE.length).toBeGreaterThan(1000);
  });

  it('R2.1 — Bell button: transparent-base + colored text (no solid bg-input/blue-950 card frame)', () => {
    // Bell button section pattern: `setShowNotifSettings(!showNotifSettings)`.
    // Find the className expression immediately following it.
    const m = DESKTOP_SLICE.match(/setShowNotifSettings\(!showNotifSettings\)\}[\s\S]{0,400}?className=\{`([^`]+)`/);
    expect(m).not.toBeNull();
    const cls = m[1];
    // V88 NEW shape — transparent base + hover surface + colored text only.
    expect(cls).toMatch(/border\s+border-transparent/);
    expect(cls).toMatch(/hover:bg-\[var\(--bg-hover\)\]/);
    // Regression lock — pre-V88 solid styles MUST be gone.
    expect(cls).not.toMatch(/bg-blue-950\/30/);
    expect(cls).not.toMatch(/border-blue-900\/50/);
    expect(cls).not.toMatch(/bg-\[var\(--bg-input\)\]/);
  });

  it('R3.1 — Online indicator: transparent base (no card frame)', () => {
    // Online indicator div has `cursor-default` in its className AND the
    // `ออนไลน์ ${onlineAdmins.length} คน` title. Use that as anchor.
    const m = DESKTOP_SLICE.match(/<div[^>]*className="([^"]+)"\s+title=\{`ออนไลน์ \$\{onlineAdmins\.length\} คน`\}/);
    expect(m).not.toBeNull();
    const cls = m[1];
    // V88 NEW — no solid bg or visible border (just rounded-lg + padding).
    expect(cls).not.toMatch(/bg-\[var\(--bg-input\)\]/);
    expect(cls).not.toMatch(/border\s+border-\[var\(--bd\)\]/);
    // Layout primitives still present.
    expect(cls).toMatch(/rounded-lg/);
    expect(cls).toMatch(/cursor-default/);
  });

  it('R4.1 — Signout button: transparent base + red-on-hover (no card frame)', () => {
    // Signout button onClick=`signOut(auth)`. Match the className.
    const m = DESKTOP_SLICE.match(/signOut\(auth\)\}[\s\S]{0,200}?className="([^"]+)"/);
    expect(m).not.toBeNull();
    const cls = m[1];
    // V88 NEW — transparent base + red on hover.
    expect(cls).toMatch(/border\s+border-transparent/);
    expect(cls).toMatch(/hover:bg-\[var\(--bg-hover\)\]/);
    expect(cls).toMatch(/hover:text-red-500/);
    // Pre-V88 solid frame MUST be gone.
    expect(cls).not.toMatch(/bg-\[var\(--bg-input\)\]/);
  });

  it('R5.1 — Primary CTA "สร้างคิวใหม่" stays as solid red button (NOT harmonized)', () => {
    // The primary CTA must KEEP its solid styling (it's the action focus).
    expect(DESKTOP_SLICE).toMatch(/<PlusCircle size=\{14\}\/>\s*สร้างคิวใหม่/);
    // Locate the CTA className.
    const m = DESKTOP_SLICE.match(/setSessionModalTab\('standard'\);[\s\S]{0,500}?className="([^"]+)"/);
    expect(m).not.toBeNull();
    const cls = m[1];
    // Still solid red text-white px-3 py-2 rounded-lg.
    expect(cls).toMatch(/text-white/);
    expect(cls).toMatch(/rounded-lg/);
    expect(cls).toMatch(/font-bold/);
  });

  it('R6.1 — V88 marker comments present at all 3 harmonized buttons', () => {
    // Lock the institutional-memory comments at each change site.
    const v88Count = (DESKTOP_SLICE.match(/V88/g) || []).length;
    expect(v88Count).toBeGreaterThanOrEqual(3);
  });
});

describe('V88 — handler / wiring lock (cosmetic-shell constraint)', () => {
  // CRITICAL — user said: "ห้ามยุ่งกับ logic, flow, wiring ใดๆนะ".
  // Lock every handler that was on the surface pre-V88 to prove the
  // edit was cosmetic-only.

  it('W1.1 — Bell button still wired to setShowNotifSettings toggle', () => {
    expect(SOURCE).toMatch(/onClick=\{\(\)\s*=>\s*setShowNotifSettings\(!showNotifSettings\)\}/);
  });

  it('W1.2 — สร้างคิวใหม่ CTA still wired to setSessionModalTab + setShowSessionModal', () => {
    expect(SOURCE).toMatch(/setSessionModalTab\('standard'\);\s*setShowSessionModal\(true\);/);
  });

  it('W1.3 — Online indicator still pulls from onlineAdmins state', () => {
    expect(SOURCE).toMatch(/title=\{`ออนไลน์ \$\{onlineAdmins\.length\} คน`\}/);
  });

  it('W1.4 — Signout button still calls signOut(auth)', () => {
    expect(SOURCE).toMatch(/onClick=\{\(\)\s*=>\s*signOut\(auth\)\}/);
  });

  it('W1.5 — BranchSelector + ThemeToggle imports + render unchanged', () => {
    expect(SOURCE).toMatch(/<BranchSelector\s*\/>/);
    expect(SOURCE).toMatch(/<ThemeToggle\s+theme=\{theme\}\s+setTheme=\{setTheme\}\s+compact\s*\/>/);
  });

  it('W1.6 — menu-tab buttons retain exact handler shape', () => {
    // 8 menu-tab buttons each with `setAdminMode('X')` or window.open('?backend=1').
    const handlers = [
      `setAdminMode('chat')`,
      `setAdminMode('dashboard')`,
      `setAdminMode('noDeposit')`,
      `setAdminMode('deposit')`,
      `setAdminMode('appointment')`,
      `setAdminMode('history')`,
      `setAdminMode('clinicSettings')`,
      `window.open('?backend=1'`,
    ];
    for (const h of handlers) {
      expect(SOURCE.includes(h)).toBe(true);
    }
  });
});
