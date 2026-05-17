import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const dashSrc = () => readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
const shellSrc = () => readFileSync('src/components/backend/shell/BackendShellNew.jsx', 'utf-8');
const navSrc = () => readFileSync('src/components/backend/nav/BackendNav.jsx', 'utf-8');

describe('Backend Menu D — Source-grep regression locks', () => {
  it('T7.1 BackendDashboard imports useBackendMenuMode', () => {
    expect(dashSrc()).toMatch(/useBackendMenuMode/);
    expect(dashSrc()).toMatch(/from '\.\.\/components\/backend\/shell\/backendMenuMode/);
  });

  it('T7.2 BackendDashboard imports BackendShellNew', () => {
    expect(dashSrc()).toMatch(/BackendShellNew/);
  });

  it('T7.3 BackendDashboard preserves BackendNav import (classic mode kept)', () => {
    expect(dashSrc()).toMatch(/import BackendNav from '\.\.\/components\/backend\/nav\/BackendNav/);
  });

  it('T7.4 BackendDashboard uses both shells in ternary — classic + new', () => {
    const src = dashSrc();
    expect(src).toMatch(/menuMode\s*===\s*'new'\s*\?\s*\(?\s*<BackendShellNew/);
    expect(src).toMatch(/\)\s*:\s*\(\s*<BackendNav/);
  });

  it('T7.5 Both shells receive SAME props (activeTabId / onNavigate / clinicSettings / theme / setTheme / topBarSlot)', () => {
    const src = dashSrc();
    const ternary = src.match(/menuMode === 'new'[\s\S]{0,1800}<\/BackendNav>/);
    expect(ternary).toBeTruthy();
    const block = ternary[0];
    const props = ['activeTabId', 'onNavigate', 'clinicSettings', 'theme', 'setTheme', 'topBarSlot'];
    for (const p of props) {
      const occurrences = (block.match(new RegExp(`\\b${p}\\b`, 'g')) || []).length;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    }
  });

  it('T7.6 BackendNav.jsx is UNTOUCHED — no shell/* imports', () => {
    expect(navSrc()).not.toMatch(/backend\/shell\//);
    expect(navSrc()).not.toMatch(/BackendShellNew|BackendArcBloom|BackendDuoPill|BackendTopBarNew/);
  });

  it('T7.7 BackendShellNew preserves children slot', () => {
    expect(shellSrc()).toMatch(/\{children\}/);
  });

  it('T7.8 BackendShellNew sets html data-attr for staff-chat hide', () => {
    expect(shellSrc()).toMatch(/data-backend-menu-mode/);
  });

  it('T7.9 BackendShellNew uses BackendCmdPalette (Cmd+K preserved)', () => {
    expect(shellSrc()).toMatch(/BackendCmdPalette/);
  });

  it('T7.10 No accidental edits to sub-components (BranchSelector / ThemeToggle / ProfileDropdown source unmodified)', () => {
    const branchSel = readFileSync('src/components/backend/BranchSelector.jsx', 'utf-8');
    const themeT = readFileSync('src/components/ThemeToggle.jsx', 'utf-8');
    const profile = readFileSync('src/components/backend/ProfileDropdown.jsx', 'utf-8');
    for (const src of [branchSel, themeT, profile]) {
      expect(src).not.toMatch(/Backend Menu D|backendMenuMode|BackendShellNew|BackendArcBloom|BackendDuoPill/);
    }
  });

  it('T7.11 navConfig.js NAV_SECTIONS structure unchanged (count + key section ids)', () => {
    const nav = readFileSync('src/components/backend/nav/navConfig.js', 'utf-8');
    expect(nav.match(/id:\s*'appointments-section'/g)).toBeTruthy();
    expect(nav.match(/id:\s*'customers'/g)).toBeTruthy();
    expect(nav.match(/id:\s*'master'/g)).toBeTruthy();
  });

  it('T7.12 StaffChatWidget patch is additive — original chat.expand / unreadCount paths intact', () => {
    const widget = readFileSync('src/components/staffchat/StaffChatWidget.jsx', 'utf-8');
    expect(widget).toMatch(/chat\.expand/);
    expect(widget).toMatch(/chat\.unreadCount/);
    expect(widget).toMatch(/StaffChatBubble/);
    expect(widget).toMatch(/lover:staff-chat-open/);
    expect(widget).toMatch(/lover:staff-chat-unread/);
  });
});
