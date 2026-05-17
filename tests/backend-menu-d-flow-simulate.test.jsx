// Rule I full-flow simulate — Backend Menu D.
// Chains the exact user click → state change → render path.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import BackendShellNew from '../src/components/backend/shell/BackendShellNew.jsx';
import { NAV_SECTIONS } from '../src/components/backend/nav/navConfig.js';

vi.mock('../src/components/backend/BranchSelector.jsx', () => ({ default: () => <div>BS</div> }));
vi.mock('../src/components/ThemeToggle.jsx', () => ({ default: () => <div>TT</div> }));
vi.mock('../src/components/backend/ProfileDropdown.jsx', () => ({ default: () => <div>PD</div> }));

function HarnessApp() {
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
      <div data-testid="active-tab">{activeTab}</div>
    </BackendShellNew>
  );
}

describe('Backend Menu D — Rule I full-flow simulate', () => {
  it('FS1 initial activeTab = customers', () => {
    render(<HarnessApp />);
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
  });

  it('FS2 tap menu → bloom opens → tap orb 0 → activeTab updates to first-section first-item', () => {
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    const orbs = screen.getAllByRole('menuitem');
    expect(orbs.length).toBe(NAV_SECTIONS.length);
    fireEvent.click(orbs[0]);
    expect(screen.getByTestId('active-tab').textContent).toBe(NAV_SECTIONS[0].items[0].id);
  });

  it('FS3 orb click also closes the bloom (no lingering overlay)', () => {
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getAllByRole('menuitem')[0]);
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('FS4 every section reachable via orb click', () => {
    NAV_SECTIONS.forEach((section, i) => {
      const { unmount } = render(<HarnessApp />);
      fireEvent.click(screen.getByTestId('duo-pill-menu'));
      const orbs = screen.getAllByRole('menuitem');
      fireEvent.click(orbs[i]);
      expect(screen.getByTestId('active-tab').textContent).toBe(section.items[0].id);
      unmount();
    });
  });

  it('FS5 backdrop click closes bloom without navigating', () => {
    render(<HarnessApp />);
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getByTestId('bloom-backdrop'));
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
  });

  it('FS6 keyboard Esc closes bloom without navigating', () => {
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
  });
});
