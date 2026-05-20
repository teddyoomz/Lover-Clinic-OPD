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
  // V90/V91 (2026-05-18): the bloom opens by default + duo-pill toggles it.
  // Pass isSpecificEntityContext so the bloom starts CLOSED — each test's
  // duo-pill-menu click then OPENS it (preserving "tap menu → bloom opens").
  return (
    <BackendShellNew
      activeTabId={activeTab}
      onNavigate={setActiveTab}
      clinicSettings={{ accentColor: '#dc2626' }}
      theme={theme}
      setTheme={setTheme}
      isSpecificEntityContext={true}
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

  it('FS2 (V21-T6 fixup) tap menu → bloom opens → tap multi-item orb → picker opens → tap mini-orb 0 → activeTab updates', () => {
    // Pre-T6: orb click directly navigated.
    // Post-T6: multi-item sections (≥2 sub-tabs) open the picker first; mini-orb click finalizes navigation.
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    const orbs = screen.getAllByRole('menuitem');
    expect(orbs.length).toBe(NAV_SECTIONS.length);
    const multiIdx = NAV_SECTIONS.findIndex(s => s.items.length >= 2);
    expect(multiIdx).toBeGreaterThanOrEqual(0);
    fireEvent.click(orbs[multiIdx]);
    // Picker is now open + ArcBloom still rendered behind
    expect(screen.queryByTestId('subtab-overlay')).not.toBeNull();
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
    // Click the first mini-orb in the picker
    const firstMiniOrb = screen.getByTestId(`subtab-cell-${NAV_SECTIONS[multiIdx].items[0].id}`);
    fireEvent.click(firstMiniOrb);
    expect(screen.getByTestId('active-tab').textContent).toBe(NAV_SECTIONS[multiIdx].items[0].id);
  });

  it('FS2-bis (V21-T6 fixup) single-item orb click direct-navigates without opening picker', () => {
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    const singleIdx = NAV_SECTIONS.findIndex(s => s.items.length === 1);
    expect(singleIdx).toBeGreaterThanOrEqual(0);
    fireEvent.click(screen.getAllByRole('menuitem')[singleIdx]);
    expect(screen.queryByTestId('subtab-overlay')).toBeNull();
    expect(screen.getByTestId('active-tab').textContent).toBe(NAV_SECTIONS[singleIdx].items[0].id);
  });

  it('FS3 (V21-T6 fixup) single-item orb click closes the bloom (no lingering overlay)', () => {
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    const singleIdx = NAV_SECTIONS.findIndex(s => s.items.length === 1);
    fireEvent.click(screen.getAllByRole('menuitem')[singleIdx]);
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('FS3-bis (V21-T6 fixup) multi-item orb click keeps ArcBloom open with picker mounted on top', () => {
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    const multiIdx = NAV_SECTIONS.findIndex(s => s.items.length >= 2);
    fireEvent.click(screen.getAllByRole('menuitem')[multiIdx]);
    // bloom + picker render via portal (createPortal → document.body), so query
    // the whole document via screen, not the render container (cf. FP1/FP3/FP4).
    expect(screen.queryByTestId('bloom-overlay')).not.toBeNull();
    expect(screen.queryByTestId('subtab-overlay')).not.toBeNull();
  });

  it('FS4 (V21-T6 fixup) every section reachable — multi-item goes via picker, single-item direct', () => {
    NAV_SECTIONS.forEach((section, i) => {
      const { unmount } = render(<HarnessApp />);
      fireEvent.click(screen.getByTestId('duo-pill-menu'));
      const orbs = screen.getAllByRole('menuitem');
      fireEvent.click(orbs[i]);
      if (section.items.length === 1) {
        // Direct navigate
        expect(screen.getByTestId('active-tab').textContent).toBe(section.items[0].id);
      } else {
        // Picker is now open; click first mini-orb to finalize navigation
        const firstMiniOrb = screen.getByTestId(`subtab-cell-${section.items[0].id}`);
        fireEvent.click(firstMiniOrb);
        expect(screen.getByTestId('active-tab').textContent).toBe(section.items[0].id);
      }
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
