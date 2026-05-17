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

  it('T6.6 click DuoPill menu opens bloom overlay', () => {
    setup();
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
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
});
