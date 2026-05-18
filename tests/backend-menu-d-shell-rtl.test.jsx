import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BackendShellNew from '../src/components/backend/shell/BackendShellNew.jsx';

vi.mock('../src/components/backend/BranchSelector.jsx', () => ({
  default: () => <div data-testid="mock-branch-selector">Branch</div>,
}));
vi.mock('../src/components/ThemeToggle.jsx', () => ({
  default: ({ theme, setTheme }) => (
    <button data-testid="mock-theme-toggle" onClick={() => setTheme?.(theme === 'dark' ? 'light' : 'dark')}>
      {theme}
    </button>
  ),
}));
vi.mock('../src/components/backend/ProfileDropdown.jsx', () => ({
  default: () => <div data-testid="mock-profile-dropdown">Profile</div>,
}));
// V85-followup AV82 (T6.13) — mock BackendCmdPalette so the test can simulate
// a palette pick WITHOUT mounting cmdk (which needs ResizeObserver, absent in
// jsdom). Mock exposes a test button that calls onNavigate(tabId) the SAME
// way the real palette does, exercising the shell's handleNavigate contract.
vi.mock('../src/components/backend/nav/BackendCmdPalette.jsx', () => ({
  default: ({ open, onOpenChange, onNavigate }) => (
    open ? (
      <div data-testid="mock-cmd-palette" aria-label="เมนูค้นหา">
        <button
          data-testid="mock-palette-pick"
          onClick={() => {
            onNavigate?.('customers');
            onOpenChange?.(false);  // real palette also closes itself
          }}
        >
          Pick item
        </button>
      </div>
    ) : null
  ),
}));

describe('Backend Menu D — Shell RTL', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-backend-menu-mode');
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });
  afterEach(() => {
    document.documentElement.removeAttribute('data-backend-menu-mode');
  });

  const setup = (overrides = {}) =>
    render(
      <BackendShellNew
        activeTabId="customers"
        onNavigate={vi.fn()}
        clinicSettings={{ accentColor: '#dc2626' }}
        theme="dark"
        setTheme={vi.fn()}
        topBarSlot={null}
        {...overrides}
      >
        <div data-testid="shell-children">PAGE CONTENT</div>
      </BackendShellNew>
    );

  it('T6.1 sets html[data-backend-menu-mode="new"] on mount, clears on unmount', () => {
    const { unmount } = setup();
    expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBe('new');
    unmount();
    expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBeNull();
  });

  it('T6.2 renders children content unchanged', () => {
    setup();
    expect(screen.getByTestId('shell-children').textContent).toBe('PAGE CONTENT');
  });

  it('T6.3 renders all 5 utility buttons (desktop)', () => {
    setup();
    expect(screen.getByTestId('topbar-frontend-desktop')).toBeTruthy();
    expect(screen.getByTestId('topbar-shortcut-desktop')).toBeTruthy();
    expect(screen.getByTestId('mock-branch-selector')).toBeTruthy();
    expect(screen.getByTestId('mock-theme-toggle')).toBeTruthy();
    expect(screen.getByTestId('mock-profile-dropdown')).toBeTruthy();
  });

  it('T6.4 mode toggle visible on desktop ≥768px', () => {
    setup();
    expect(screen.getByTestId('backend-menu-mode-toggle')).toBeTruthy();
  });

  it('T6.5 renders DuoPill', () => {
    setup();
    expect(screen.getByTestId('backend-duo-pill')).toBeTruthy();
    expect(screen.getByTestId('duo-pill-chat')).toBeTruthy();
    expect(screen.getByTestId('duo-pill-menu')).toBeTruthy();
  });

  it('T6.6 (EOD+5 polish) bloom is OPEN by default on mount; backdrop click closes; DuoPill menu re-opens it', () => {
    // EOD+5 polish: BackendShellNew now defaults bloomOpen=true so user sees
    // the menu waiting on first entry to ?backend=1. This test verifies the
    // open-by-default + close + re-open cycle.
    setup();
    // Open by default
    expect(screen.getByTestId('bloom-overlay')).toBeTruthy();
    // Close via backdrop
    fireEvent.click(screen.getByTestId('bloom-backdrop'));
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
    // DuoPill menu re-opens
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    expect(screen.getByTestId('bloom-overlay')).toBeTruthy();
  });

  it('T6.7 click DuoPill chat dispatches lover:staff-chat-open event', () => {
    setup();
    const spy = vi.fn();
    window.addEventListener('lover:staff-chat-open', spy);
    fireEvent.click(screen.getByTestId('duo-pill-chat'));
    expect(spy).toHaveBeenCalled();
    window.removeEventListener('lover:staff-chat-open', spy);
  });

  it('T6.8 Esc closes bloom when open', () => {
    setup();
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    expect(screen.getByTestId('bloom-overlay')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('T6.9 (V21-T6 fixup) click single-item orb calls onNavigate verbatim with item id', async () => {
    // Pre-T6: every orb click → onNavigate.
    // Post-T6: only items.length === 1 sections direct-navigate; multi-item opens picker first.
    const { NAV_SECTIONS } = await import('../src/components/backend/nav/navConfig.js');
    const singleIdx = NAV_SECTIONS.findIndex((s) => s.items.length === 1);
    expect(singleIdx).toBeGreaterThanOrEqual(0);
    const onNavigate = vi.fn();
    setup({ onNavigate });
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    const orbs = screen.getAllByRole('menuitem');
    fireEvent.click(orbs[singleIdx]);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0][0]).toBe(NAV_SECTIONS[singleIdx].items[0].id);
  });

  it('T6.10 theme prop passed through to ThemeToggle verbatim', () => {
    setup({ theme: 'light' });
    expect(screen.getByTestId('mock-theme-toggle').textContent).toBe('light');
  });

  it('T6.11 topBarSlot rendered (breadcrumb slot)', () => {
    setup({ topBarSlot: <div data-testid="custom-slot">SLOT</div> });
    expect(screen.getByTestId('custom-slot')).toBeTruthy();
  });

  it('T6.12 V82 marker present', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/shell/BackendShellNew.jsx', 'utf-8');
    expect(src).toMatch(/Backend Menu D|BackendShellNew/);
  });

  it('T6.13 (V85-followup AV82) Cmd-palette pick closes BOTH palette AND bloom', () => {
    // Bug pre-fix: palette pick → tab switches + palette closes BUT bloom
    // stays open (bloomOpen defaults true, handleNavigate never set it false).
    // User screenshot showed dimmed bloom backdrop visible behind palette
    // after picking a menu item. Fix: handleNavigate also closes both overlays.
    // Uses mocked BackendCmdPalette (see top-of-file) — exercises the shell's
    // handleNavigate contract WITHOUT cmdk's ResizeObserver requirement.
    const onNavigate = vi.fn();
    setup({ onNavigate });

    // Bloom is open by default (T6.6 contract)
    expect(screen.getByTestId('bloom-overlay')).toBeTruthy();

    // Open palette via topbar shortcut trigger (V85-followup search-box)
    fireEvent.click(screen.getByTestId('topbar-shortcut-desktop'));
    expect(screen.getByTestId('mock-cmd-palette')).toBeTruthy();

    // Simulate palette pick — the mock's button mirrors the real handleSelect:
    // calls onNavigate(tabId) + onOpenChange(false) for the palette itself.
    fireEvent.click(screen.getByTestId('mock-palette-pick'));

    // Contract: onNavigate called once + BOTH overlays gone
    // Pre-fix this assertion failed on bloom-overlay (bloomOpen never cleared)
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0][0]).toBe('customers');
    expect(screen.queryByTestId('mock-cmd-palette')).toBeNull();
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('T6.14 (V85-followup AV82) source-grep — handleNavigate closes both overlays', async () => {
    // Drift catcher — if a future commit strips setBloomOpen(false) or
    // setPaletteOpen(false) from handleNavigate, the bug returns. Lock both.
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/shell/BackendShellNew.jsx', 'utf-8');
    // Anchor on the handleNavigate body. Capture lines between the
    // `const handleNavigate = useCallback(` and its closing `[onNavigate])`
    // (whitespace allowed before the closing paren due to multi-line dep array).
    const m = src.match(/const handleNavigate = useCallback\([\s\S]*?\[onNavigate\]\s*\)/);
    expect(m).toBeTruthy();
    const body = m[0];
    expect(body).toMatch(/onNavigate\?\.\(tabId\)/);
    expect(body).toMatch(/setBloomOpen\(false\)/);
    expect(body).toMatch(/setPaletteOpen\(false\)/);
    // V85-followup marker present
    expect(src).toMatch(/AV82|V85-followup.*shell-level handleNavigate|EOD9\+1/);
  });
});
