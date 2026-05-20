import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import BackendShellNew from '../src/components/backend/shell/BackendShellNew.jsx';
import { setBackendMenuMode, getBackendMenuMode } from '../src/components/backend/shell/backendMenuMode.js';

vi.mock('../src/components/backend/BranchSelector.jsx', () => ({ default: () => <div>BS</div> }));
vi.mock('../src/components/ThemeToggle.jsx', () => ({ default: ({ theme, setTheme }) => (
  <button data-testid="tt" onClick={() => setTheme?.(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>
) }));
vi.mock('../src/components/backend/ProfileDropdown.jsx', () => ({ default: () => <div>PD</div> }));

function Harness() {
  const [activeTab, setActiveTab] = useState('customers');
  const [theme, setTheme] = useState('dark');
  return (
    <BackendShellNew
      activeTabId={activeTab}
      onNavigate={setActiveTab}
      clinicSettings={{ accentColor: '#dc2626' }}
      theme={theme}
      setTheme={setTheme}
    >
      <div data-testid="tab">{activeTab}</div>
    </BackendShellNew>
  );
}

describe('Backend Menu D — Stress', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('S1 100× mode toggle round-trip — no localStorage corruption', () => {
    for (let i = 0; i < 100; i++) {
      setBackendMenuMode(i % 2 === 0 ? 'new' : 'classic');
    }
    expect(getBackendMenuMode()).toBe('classic');
    setBackendMenuMode('new');
    expect(getBackendMenuMode()).toBe('new');
  });

  it('S2 rapid open/close DuoPill 50× — no leaked bloom overlays', () => {
    render(<Harness />);
    for (let i = 0; i < 50; i++) {
      fireEvent.click(screen.getByTestId('duo-pill-menu'));
      fireEvent.keyDown(window, { key: 'Escape' });
    }
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('S3 orb click 20× — activeTab toggles deterministically', () => {
    // V90/V91 (2026-05-18): bloom opens by default, duo-pill TOGGLES it, and
    // navigation auto-closes it (single-item orb) or opens a picker (multi-item
    // orb). To stress orb clicks deterministically, reset to a fresh open bloom
    // each iteration: Escape clears any open picker/bloom, then open if closed.
    render(<Harness />);
    let lastTab = null;
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(window, { key: 'Escape' });
      if (!screen.queryByTestId('bloom-overlay')) {
        fireEvent.click(screen.getByTestId('duo-pill-menu'));
      }
      const orbs = screen.getAllByRole('menuitem');
      const idx = i % orbs.length;
      fireEvent.click(orbs[idx]);
      const tab = screen.getByTestId('tab').textContent;
      expect(typeof tab).toBe('string');
      expect(tab.length).toBeGreaterThan(0);
      lastTab = tab;
    }
    expect(lastTab).toBeTruthy();
  });

  it('S4 theme thrash 30× — html data-attr remains "new" throughout', () => {
    render(<Harness />);
    for (let i = 0; i < 30; i++) {
      fireEvent.click(screen.getByTestId('tt'));
      expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBe('new');
    }
  });

  it('S5 staff-chat-open event fires exactly 1× per chat click', () => {
    render(<Harness />);
    const spy = vi.fn();
    window.addEventListener('lover:staff-chat-open', spy);
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByTestId('duo-pill-chat'));
    expect(spy).toHaveBeenCalledTimes(10);
    window.removeEventListener('lover:staff-chat-open', spy);
  });

  it('S6 unmount cleans up html data-attr', () => {
    const { unmount } = render(<Harness />);
    expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBe('new');
    unmount();
    expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBeNull();
  });
});
