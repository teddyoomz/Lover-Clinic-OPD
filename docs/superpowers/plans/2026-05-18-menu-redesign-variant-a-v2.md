# Menu Redesign Variant A v2 — Implementation Plan (TIGHT scope)

**Date**: 2026-05-18
**Status**: Approved by user · Visual Companion mockup confirmed
**Scope (HARD-CONSTRAINED — no scope creep)**: ONLY the top-of-page menu in `src/pages/AdminDashboard.jsx`. NOT a design-system overhaul. NOT a tab-content refactor. NOT modal redesign.
**Source**: `public/menu-redesign-variants.html` Variant A refined

## Goal

Replace the current 2-row top menu in AdminDashboard.jsx with:
- **Desktop ≥768px**: Single-row TopNav with real ClinicLogo + 6 tabs + ⋯ overflow + actions (สร้างคิวใหม่ · 🔔 · BranchSelector · 👤 user-menu)
- **Mobile <768px**: Top header (logo + branch + 🔔 + 👤) + floating bottom dock (4 tabs + ⋯ เพิ่ม drawer) + จอง sub-picker (BottomSheet)
- **Preserve 100%**: Unread badges contract (4 tabs: แชท blue / คิว red / no-deposit orange / deposit emerald) · ClinicLogo behavior · BranchSelector real dropdown · NotifSettings toggle · ThemeToggle (moved into user-menu) · online indicator · signOut

## Iron-clad constraints (do not violate)

1. **NO new design-system folder** — just 4 components in `src/components/`
2. **NO refactor of tab CONTENT** — `adminMode === 'dashboard'` / `'history'` / `'noDeposit'` / `'deposit'` / etc. tab content rendering stays untouched
3. **Preserve existing state hooks** — `adminMode`, `setAdminMode`, `chatUnread`, `unreadCount`, `noDepositSessions`, `depositSessions`, `selectedBranchId`, `branches`, `theme`, `setTheme`, `signOut` (firebase), `setShowNotifSettings`, `cs` (clinic settings) — all stay
4. **StaffChatBubble** — change ONLY: add mobile-aware CSS for `bottom: 86px` on viewport <768px (one rule)
5. **Light theme**: out of scope for this phase (Phase B if user wants)
6. **No new firestore reads/writes** — pure UI restructure

## Files

### NEW (4 components + 1 css class block)

| File | Purpose | LOC est |
|---|---|---|
| `src/components/AdminTopNav.jsx` | Desktop top bar (logo + tabs + actions slot) | ~120 |
| `src/components/AdminBottomNav.jsx` | Mobile top header + bottom dock + sub-picker + drawer | ~200 |
| `src/components/AdminUserMenu.jsx` | 👤 popover: theme toggle · online indicator · signOut | ~80 |
| `src/components/AdminOverflowMenu.jsx` | ⋯ popover (desktop only): ตั้งค่า · หลังบ้าน | ~50 |

### MODIFY (3 files)

| File | Change | Risk |
|---|---|---|
| `src/pages/AdminDashboard.jsx` | Replace lines ~5738-6004 (2-row top-menu) with `<AdminTopNav .../>` + `<AdminBottomNav .../>` blocks gated by CSS media query (.menu-shell-desktop / .menu-shell-mobile classes) | HIGH — touches 8800+ LOC file |
| `src/components/staffchat/StaffChatBubble.jsx` | Add `md:bottom-4 bottom-[88px]` Tailwind class OR equivalent (1-line tweak — current is `fixed bottom-3 right-3 md:bottom-4 md:right-4` → change to `fixed bottom-[88px] right-3 md:bottom-4 md:right-4`) | LOW |
| `src/index.css` | Add `.menu-shell-desktop` / `.menu-shell-mobile` breakpoint switch + a few support classes (badge animation, pill, etc.) — ~50 LOC | LOW |

### NEW tests (2 files)

| File | Coverage |
|---|---|
| `tests/admin-topnav-bottomnav-source-grep.test.jsx` | Source-grep regression: AdminDashboard imports AdminTopNav + AdminBottomNav; legacy 2-row block removed; unread badges contract preserved (badge prop names + colors + filter expressions). |
| `tests/e2e/menu-redesign-l1.spec.js` | Playwright L1: drives 3 viewports (1440/768/375) · asserts TopNav visible on ≥768 + BottomNav visible on <768 · gradient top border · logo image renders or fallback · 4 unread badges with correct colors visible · mobile chat bubble doesn't overlap bot dock (bounding-box check). |

## Task breakdown (5 tasks)

### Task 1: Build 4 new components (NO wire-in yet)

- Write 4 new files: AdminTopNav.jsx, AdminBottomNav.jsx, AdminUserMenu.jsx, AdminOverflowMenu.jsx
- Components use **inline JSX + Tailwind classes** (no CSS-in-JS, no styled-components)
- Use existing `lucide-react` icons (already imported in AdminDashboard)
- Props contract (paste verbatim — no improvisation):

  **AdminTopNav**:
  ```jsx
  <AdminTopNav
    activeTabId={string}                          // 'chat' | 'queue' | 'noDeposit' | 'deposit' | 'appt' | 'history' | 'settings' | 'backend'
    onTabChange={(tabId) => void}
    badges={{
      chat: number,         // chatUnread (when isChatActive)
      queue: number,        // unreadCount
      noDeposit: number,    // noDepositSessions.filter(s=>s.isUnread).length
      deposit: number,      // depositSessions.filter(s=>s.isUnread).length
    }}
    isChatActive={boolean}                        // gates chat blink animation
    logoSlot={ReactNode}                          // <ClinicLogo ...>
    onCreateClick={() => void}                    // สร้างคิวใหม่
    onNotifClick={() => void}                     // 🔔
    notifBadge={boolean}                          // dot on 🔔
    branchSlot={ReactNode}                        // <BranchSelector />
    userMenuSlot={ReactNode}                      // <AdminUserMenu />
    overflowMenuSlot={ReactNode}                  // <AdminOverflowMenu />
  />
  ```

  **AdminBottomNav**:
  ```jsx
  <AdminBottomNav
    activeTabId={string}
    onTabChange={(tabId) => void}
    badges={{ chat, queue, noDeposit, deposit }}
    isChatActive={boolean}
    logoSlot={ReactNode}
    branchSlot={ReactNode}                        // smaller version
    onNotifClick={() => void}
    notifBadge={boolean}
    userMenuSlot={ReactNode}
    drawerItems={[{ id, label, icon, onClick }]}  // ประวัติ · ตั้งค่า · หลังบ้าน · ออก
    onJongMudjam={() => void}                     // BottomSheet picker emits these
    onJongMaiMudjam={() => void}
  />
  ```

  **AdminUserMenu**:
  ```jsx
  <AdminUserMenu
    theme={'dark'|'light'}
    onThemeToggle={() => void}
    onlineCount={number}
    onSignOut={() => void}
    userName={string}
    userRole={string}
  />
  ```

  **AdminOverflowMenu** (desktop ⋯):
  ```jsx
  <AdminOverflowMenu
    onSettingsClick={() => void}
    onBackendClick={() => void}                   // opens ?backend=1 in new tab
  />
  ```

- Each component: pure render only (no Firestore reads / no business logic)
- Active tab = `--rx1-gradient-soft` bg + `--bd-accent` border + `--tx-heading` text (per mockup)
- Tab badge inline absolute top-right `-5px / -5px`, 18px min, blink CSS animation for chat
- Verify: targeted vitest source-grep + `npm run build` clean
- Commit: `feat(menu): build AdminTopNav + AdminBottomNav + AdminUserMenu + AdminOverflowMenu (Variant A v2)`

### Task 2: Wire into AdminDashboard.jsx — REPLACE legacy menu

- Open `src/pages/AdminDashboard.jsx`
- Locate the existing 2-row menu block (around lines 5738-6004 — verify via grep "Row 1: Logo + compact action icons" comment)
- REPLACE the entire block with:
  ```jsx
  {/* Phase A v2 — TopNav (desktop) + BottomNav (mobile), breakpoint via CSS */}
  <div className="menu-shell-desktop">
    <AdminTopNav
      activeTabId={ADMIN_MODE_TO_TAB[adminMode] || 'queue'}
      onTabChange={handleTabChange}
      badges={{
        chat: isChatActive ? chatUnread : 0,
        queue: unreadCount,
        noDeposit: noDepositSessions.filter(s => s.isUnread).length,
        deposit: depositSessions.filter(s => s.isUnread).length,
      }}
      isChatActive={isChatActive}
      logoSlot={<ClinicLogo className="h-9 max-w-[140px]" showText={false} clinicSettings={cs} theme={theme} />}
      onCreateClick={() => setShowNamePrompt(true)}
      onNotifClick={() => setShowNotifSettings(true)}
      notifBadge={hasUnreadNotifs}
      branchSlot={<BranchSelector />}
      userMenuSlot={
        <AdminUserMenu
          theme={theme}
          onThemeToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onlineCount={onlineAdminsCount}
          onSignOut={() => signOut(auth)}
          userName={currentUserName}
          userRole={currentUserRole}
        />
      }
      overflowMenuSlot={
        <AdminOverflowMenu
          onSettingsClick={() => setAdminMode('settings')}
          onBackendClick={() => window.open('?backend=1', '_blank')}
        />
      }
    />
  </div>
  <div className="menu-shell-mobile">
    <AdminBottomNav
      activeTabId={ADMIN_MODE_TO_TAB[adminMode] || 'queue'}
      onTabChange={handleTabChange}
      badges={{ chat: isChatActive ? chatUnread : 0, queue: unreadCount,
                noDeposit: noDepositSessions.filter(s => s.isUnread).length,
                deposit: depositSessions.filter(s => s.isUnread).length }}
      isChatActive={isChatActive}
      logoSlot={<ClinicLogo className="h-7 max-w-[100px]" showText={false} clinicSettings={cs} theme={theme} />}
      branchSlot={<BranchSelector compact />}
      onNotifClick={() => setShowNotifSettings(true)}
      notifBadge={hasUnreadNotifs}
      userMenuSlot={
        <AdminUserMenu
          theme={theme}
          onThemeToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onlineCount={onlineAdminsCount}
          onSignOut={() => signOut(auth)}
          userName={currentUserName}
          userRole={currentUserRole}
        />
      }
      drawerItems={[
        { id: 'history', label: 'ประวัติ', icon: <FileText size={16}/>, onClick: () => setAdminMode('history') },
        { id: 'settings', label: 'ตั้งค่า', icon: <Settings size={16}/>, onClick: () => setAdminMode('settings') },
        { id: 'backend', label: 'หลังบ้าน', icon: <Database size={16}/>, onClick: () => window.open('?backend=1', '_blank') },
        { id: 'signout', label: 'ออกจากระบบ', icon: <LogOut size={16}/>, onClick: () => signOut(auth), variant: 'danger' },
      ]}
      onJongMudjam={() => setAdminMode('deposit')}
      onJongMaiMudjam={() => setAdminMode('noDeposit')}
    />
  </div>
  ```
- Add at top of file (with imports):
  ```jsx
  import AdminTopNav from '../components/AdminTopNav.jsx';
  import AdminBottomNav from '../components/AdminBottomNav.jsx';
  import AdminUserMenu from '../components/AdminUserMenu.jsx';
  import AdminOverflowMenu from '../components/AdminOverflowMenu.jsx';
  ```
- Add at file scope (above component function):
  ```jsx
  const ADMIN_MODE_TO_TAB = {
    chat: 'chat', dashboard: 'queue', noDeposit: 'noDeposit', deposit: 'deposit',
    appointment: 'appt', history: 'history', settings: 'settings', backend: 'backend',
  };
  const TAB_TO_ADMIN_MODE = Object.fromEntries(Object.entries(ADMIN_MODE_TO_TAB).map(([k, v]) => [v, k]));
  ```
- Add inside component body (handler):
  ```jsx
  const handleTabChange = useCallback((tabId) => {
    if (tabId === 'backend') { window.open('?backend=1', '_blank'); return; }
    setAdminMode(TAB_TO_ADMIN_MODE[tabId] || 'dashboard');
  }, [setAdminMode]);
  ```
- **Verify ALL referenced state hooks exist** in AdminDashboard.jsx scope:
  - `adminMode`, `setAdminMode`, `chatUnread`, `isChatActive`, `unreadCount`, `noDepositSessions`, `depositSessions`, `cs`, `theme`, `setTheme`, `signOut` (firebase/auth), `auth` (firebase), `setShowNamePrompt`, `setShowNotifSettings`, `hasUnreadNotifs`, `onlineAdminsCount`, `currentUserName`, `currentUserRole`
  - If any state hook is named DIFFERENTLY → use actual name (do NOT invent state)
  - If a hook doesn't exist (e.g. `hasUnreadNotifs` may not exist) → derive from existing state or pass false/undefined
- Run full vitest. Fix V21 regressions inline.
- Build clean.
- Commit: `feat(AdminDashboard): wire AdminTopNav + AdminBottomNav (Variant A v2 — Phase A)`

### Task 3: index.css breakpoint + StaffChatBubble mobile lift

- Append to `src/index.css`:
  ```css
  /* Menu Variant A v2 — Phase A breakpoint switch */
  .menu-shell-desktop { display: block; }
  .menu-shell-mobile { display: none; }
  @media (max-width: 767px) {
    .menu-shell-desktop { display: none; }
    .menu-shell-mobile { display: block; }
    /* clear floating bottom dock for content */
    body { padding-bottom: 88px; }
  }
  /* Phase A v2: blink animation for chat unread badge */
  @keyframes menu-chat-blink {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.18); }
  }
  .menu-badge-chat-blink { animation: menu-chat-blink 1.2s ease-in-out infinite; }
  ```
- Modify `src/components/staffchat/StaffChatBubble.jsx` line 13:
  - **From**: `className="fixed bottom-3 right-3 md:bottom-4 md:right-4 w-14 h-14 ..."`
  - **To**: `className="fixed bottom-[88px] right-3 md:bottom-4 md:right-4 w-14 h-14 ..."`
  - Effect: mobile (no md: prefix) = bottom 88px; desktop (md:) = bottom 16px (4 × 0.25rem)
- Commit: `feat(menu): index.css breakpoint switch + StaffChatBubble mobile lift to 88px`

### Task 4: Source-grep regression test + targeted vitest

- Write `tests/admin-topnav-bottomnav-source-grep.test.jsx` covering:
  - AdminDashboard imports AdminTopNav, AdminBottomNav, AdminUserMenu, AdminOverflowMenu
  - Legacy 2-row block (`grep "Row 1: Logo + compact action icons"`) ABSENT
  - `<AdminTopNav` and `<AdminBottomNav` rendered with required props
  - 4 badge expressions preserved verbatim (chat/queue/noDeposit/deposit filter expressions)
  - StaffChatBubble has `bottom-[88px]` for mobile
  - index.css has `.menu-shell-desktop` / `.menu-shell-mobile`
  - `ADMIN_MODE_TO_TAB` + `handleTabChange` declared
- Run targeted vitest + full vitest. Confirm 11322+ pass (V82-fix6 baseline) + new tests
- Commit: `test(menu): Variant A v2 source-grep regression + tab badge contract`

### Task 5: Rule Q V66 L1 Playwright

- Write `tests/e2e/menu-redesign-l1.spec.js`:
  - Drive 3 viewports: desktop-1440, tablet-768, mobile-375
  - At each: assert TopNav visible (≥768) OR BottomNav visible (<768)
  - Assert 3px gradient top border via `getComputedStyle(::before)` or first inline element
  - Logo image OR fallback text visible
  - For each viewport with active 'queue' mode: queue tab badge has red bg (`rgb(239, 68, 68)`)
  - Mobile-only: tap จอง → BottomSheet opens with 2 options · tap outside dismisses
  - Mobile-only: chat bubble bounding-box.top > bottom-dock bounding-box.top (i.e. above it)
- Run: `npx playwright test tests/e2e/menu-redesign-l1.spec.js --reporter=list`
- Expected: 6+ tests PASS at all viewports
- Commit: `test(menu): Rule Q V66 L1 Playwright — 3 viewports + chat bubble no-overlap`

## Stop conditions

- All 5 commits landed + pushed to master
- `npm run build` clean
- `npx vitest run` PASS (baseline 11322+ + new tests)
- Playwright L1 PASS at 3 viewports
- Mobile chat bubble visually verified to NOT overlap bot dock (bounding box check in spec)
- Await user `deploy` verb per V18

## Out-of-scope (NO scope creep)

- Tab content refactor (Queue/History/etc render unchanged)
- Modal redesign (Phase B if user wants)
- Settings panel redesign (Phase C if user wants)
- Light theme variants
- Removing BranchSelector real dropdown (it stays — wrapped as `branchSlot`)
- Notification system rewrite
- Adding ANY new state hooks
- ChatPanel changes
- ClinicLogo changes (just use as `logoSlot`)
- Sound system changes
- Audit invariants (no new AV# this phase)

## Risk register

| Risk | Mitigation |
|---|---|
| Some state hooks named differently in actual AdminDashboard.jsx | Verify before writing wire-in. Adapt names; don't invent state. |
| V21 fixup needed in existing tests asserting legacy menu | Update tests inline to assert new canonical home. |
| StaffChatBubble has other consumers using `bottom-3` | Grep before changing; only edit if 1 consumer; otherwise add CSS override. |
| `hasUnreadNotifs` doesn't exist | Pass `false` or derive from existing notif state. |
| BranchSelector renders own dropdown that conflicts visually with new TopNav | Visually verify in Playwright L1. Adjust z-index if needed (TopNav z=40, BranchSelector dropdown z=50+). |
| Mobile chat bubble bottom: 88px conflicts with custom user OS settings (some Android have nav bar) | env(safe-area-inset-bottom) is on bot dock — bubble doesn't need it; bubble is ABOVE dock which already handles it. |
