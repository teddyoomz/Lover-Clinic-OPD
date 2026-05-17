// Menu Variant A v2 — Phase A (2026-05-18) source-grep regression bank.
//
// Locks the post-redesign contract:
//   - Desktop pill bar (md:flex) replaces the legacy 2-row xl:hidden / xl:flex header
//   - Mobile top bar (md:hidden) + floating bottom dock (md:hidden fixed bottom)
//   - All 8 setAdminMode handlers preserved verbatim
//   - All 4 unread badges preserved with EXACT same expressions + colors
//   - Notif popover preserved verbatim in BOTH viewports
//   - BranchSelector + ThemeToggle + ClinicLogo + online indicator + signOut all wired
//   - StaffChatBubble lifted on mobile (bottom-[88px]) to clear bottom dock
//
// V21 fixup: any pre-existing test that asserted the OLD JSX shape (e.g.
// `mode: 'dashboard'` object array OR `<Activity size={16}/>` hard-coded
// size) needs migration to the NEW contract.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf-8');
const CSS = readFileSync('src/index.css', 'utf-8');
const BUBBLE = readFileSync('src/components/staffchat/StaffChatBubble.jsx', 'utf-8');

describe('Menu Variant A v2 — Phase A (2026-05-18)', () => {
  // ───── Shell + breakpoint ─────
  it('M1.1 menu shell has data-testid="admin-top-menu"', () => {
    expect(SRC).toMatch(/data-testid="admin-top-menu"/);
  });
  it('M1.2 desktop pill bar gated by md:flex hidden md:flex', () => {
    expect(SRC).toMatch(/menu-desktop hidden md:flex/);
  });
  it('M1.3 mobile top bar gated by md:hidden', () => {
    expect(SRC).toMatch(/menu-mobile md:hidden/);
  });
  it('M1.4 menu-grad-line 3px RX1 accent present', () => {
    expect(SRC).toMatch(/menu-grad-line/);
    expect(CSS).toMatch(/\.menu-grad-line\s*\{[^}]*linear-gradient[^}]*#dc2626/);
  });

  // ───── 8 desktop tabs — all setAdminMode handlers preserved ─────
  const tabModes = ['chat', 'dashboard', 'noDeposit', 'deposit', 'appointment', 'history', 'clinicSettings'];
  for (const mode of tabModes) {
    it(`M2.${mode} desktop tab dispatches setAdminMode('${mode}')`, () => {
      expect(SRC).toMatch(new RegExp(`setAdminMode\\('${mode}'\\)`));
    });
  }
  it('M2.backend desktop tab opens ?backend=1 in new tab', () => {
    expect(SRC).toMatch(/window\.open\('\?backend=1', '_blank'\)/);
  });

  // ───── 4 unread badges — exact expressions preserved ─────
  it('M3.1 chat badge: isChatActive && chatUnread > 0 → blue-500', () => {
    expect(SRC).toMatch(/isChatActive\s*&&\s*chatUnread\s*>\s*0[\s\S]{0,200}?background:\s*['"]#3b82f6['"]/);
  });
  it('M3.2 queue badge: unreadCount > 0 → red-500', () => {
    expect(SRC).toMatch(/unreadCount\s*>\s*0[\s\S]{0,200}?background:\s*['"]#ef4444['"]/);
  });
  it('M3.3 no-deposit badge: noDepositSessions.filter(s=>s.isUnread).length → orange-500', () => {
    expect(SRC).toMatch(/noDepositSessions\.filter\(s\s*=>\s*s\.isUnread\)\.length[\s\S]{0,300}?background:\s*['"]#f97316['"]/);
  });
  it('M3.4 deposit badge: depositSessions.filter(s=>s.isUnread).length → emerald-500', () => {
    expect(SRC).toMatch(/depositSessions\.filter\(s\s*=>\s*s\.isUnread\)\.length[\s\S]{0,300}?background:\s*['"]#10b981['"]/);
  });

  // ───── Mobile bottom dock ─────
  it('M4.1 bottom dock has data-testid', () => {
    expect(SRC).toMatch(/data-testid="menu-bottom-dock"/);
  });
  it('M4.2 bottom dock has 5 slots: chat / dashboard / appointment / jong / more', () => {
    for (const tab of ['chat', 'dashboard', 'appointment', 'jong', 'more']) {
      expect(SRC).toMatch(new RegExp(`data-tab="${tab}"`));
    }
  });
  it('M4.3 จอง slot opens BottomSheet picker (setShowMobileJongPicker(true))', () => {
    expect(SRC).toMatch(/setShowMobileJongPicker\(true\)/);
  });
  it('M4.4 ⋯ เพิ่ม slot opens drawer (setShowMobileMoreDrawer(true))', () => {
    expect(SRC).toMatch(/setShowMobileMoreDrawer\(true\)/);
  });
  it('M4.5 BottomSheet picker has both จองไม่มัดจำ + จองมัดจำ options', () => {
    expect(SRC).toMatch(/data-testid="menu-jong-sheet"/);
    expect(SRC).toMatch(/setAdminMode\('noDeposit'\);\s*setShowMobileJongPicker\(false\)/);
    expect(SRC).toMatch(/setAdminMode\('deposit'\);\s*setShowMobileJongPicker\(false\)/);
  });
  it('M4.6 More drawer has ประวัติ / ตั้งค่า / หลังบ้าน / theme / signOut', () => {
    expect(SRC).toMatch(/data-testid="menu-more-drawer"/);
    expect(SRC).toMatch(/setAdminMode\('history'\);\s*setShowMobileMoreDrawer\(false\)/);
    expect(SRC).toMatch(/setAdminMode\('clinicSettings'\);\s*setShowMobileMoreDrawer\(false\)/);
    expect(SRC).toMatch(/window\.open\('\?backend=1', '_blank'\);\s*setShowMobileMoreDrawer\(false\)/);
    expect(SRC).toMatch(/signOut\(auth\)/);
  });

  // ───── Notif popover preserved verbatim in BOTH viewports ─────
  it('M5.1 Notif popover trigger present (both viewports share showNotifSettings state)', () => {
    expect(SRC).toMatch(/setShowNotifSettings\(!showNotifSettings\)/);
  });
  it('M5.2 Notif popover sound toggle preserved', () => {
    expect(SRC).toMatch(/checked=\{isNotifEnabled\}/);
    expect(SRC).toMatch(/setIsNotifEnabled\(e\.target\.checked\)/);
  });
  it('M5.3 Notif popover volume slider preserved', () => {
    expect(SRC).toMatch(/setNotifVolume\(parseFloat\(e\.target\.value\)\)/);
  });
  it('M5.4 Notif popover push enable/disable preserved', () => {
    expect(SRC).toMatch(/onClick=\{disablePushNotifications\}/);
    expect(SRC).toMatch(/onClick=\{enablePushNotifications\}/);
  });

  // ───── Slot wiring (BranchSelector + ThemeToggle + ClinicLogo + online + signOut) ─────
  it('M6.1 ClinicLogo rendered in BOTH viewports with showText={false}', () => {
    const matches = SRC.match(/<ClinicLogo[^/]*showText=\{false\}[^/]*\/>/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(2); // desktop + mobile
  });
  it('M6.2 BranchSelector rendered (no compact prop — real dropdown)', () => {
    expect(SRC).toMatch(/<BranchSelector\s*\/>/);
  });
  it('M6.3 ThemeToggle rendered with compact in desktop right rail', () => {
    expect(SRC).toMatch(/<ThemeToggle theme=\{theme\} setTheme=\{setTheme\} compact/);
  });
  it('M6.4 Online admins indicator preserved (onlineAdmins.length + animate-ping dot)', () => {
    expect(SRC).toMatch(/onlineAdmins\.length/);
    expect(SRC).toMatch(/animate-ping/);
  });
  it('M6.5 Sign out wired to signOut(auth)', () => {
    expect(SRC).toMatch(/onClick=\{\(\)\s*=>\s*signOut\(auth\)\}/);
  });

  // ───── สร้างคิวใหม่ + popover ─────
  it('M7.1 สร้างคิวใหม่ button dispatches setSessionModalTab + setShowSessionModal', () => {
    expect(SRC).toMatch(/setSessionModalTab\('standard'\);\s*setShowSessionModal\(true\)/);
  });

  // ───── CSS contract ─────
  it('M8.1 .menu-tab CSS defined', () => { expect(CSS).toMatch(/\.menu-tab\s*\{/); });
  it('M8.2 .menu-tab-active gradient bg defined', () => { expect(CSS).toMatch(/\.menu-tab-active[\s\S]{0,200}?linear-gradient/); });
  it('M8.3 .menu-dock-tab CSS defined', () => { expect(CSS).toMatch(/\.menu-dock-tab\s*\{/); });
  it('M8.4 .menu-badge + .menu-badge-dock defined', () => {
    expect(CSS).toMatch(/\.menu-badge\s*\{/);
    expect(CSS).toMatch(/\.menu-badge-dock\s*\{/);
  });
  it('M8.5 body padding-bottom 88px on mobile (clears bottom dock)', () => {
    expect(CSS).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?body\s*\{\s*padding-bottom:\s*88px/);
  });

  // ───── StaffChatBubble mobile lift ─────
  it('M9.1 StaffChatBubble uses bottom-[88px] on mobile (no md: prefix)', () => {
    expect(BUBBLE).toMatch(/bottom-\[88px\]/);
  });
  it('M9.2 StaffChatBubble preserves md:bottom-4 for desktop (no conflict)', () => {
    expect(BUBBLE).toMatch(/md:bottom-4/);
  });
  it('M9.3 StaffChatBubble no longer uses bottom-3 (legacy mobile pos)', () => {
    expect(BUBBLE).not.toMatch(/bottom-3 /);
  });

  // ───── Anti-regression: legacy menu shapes ABSENT ─────
  it('M10.1 legacy 2-row "Row 1: Logo + compact action icons" comment ABSENT', () => {
    expect(SRC).not.toMatch(/Row 1: Logo \+ compact action icons/);
  });
  it('M10.2 legacy 4×2 mobile grid "Row 2: Nav tabs" ABSENT', () => {
    expect(SRC).not.toMatch(/Row 2: Nav tabs — mobile full-width/);
  });
  it('M10.3 legacy "hidden xl:flex" desktop button row ABSENT', () => {
    // The pre-redesign desktop row was `hidden xl:flex items-center gap-2 z-10`.
    // After v2, no `hidden xl:flex` for the menu (it's md:flex now).
    // Other xl:flex sites in the file remain unaffected by this assertion
    // because we narrow to the specific class combination.
    expect(SRC).not.toMatch(/hidden xl:flex items-center gap-2 z-10 flex-wrap/);
  });
});
