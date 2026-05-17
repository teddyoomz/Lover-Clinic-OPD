// Tier 3 Rule I full-flow simulate — Backend Menu D Sub-tab Picker.
// Chains the COMPLETE user click path through the real ShellNew + ArcBloom + SubTabBloom.

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

function setViewport(width) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('Backend Menu D — Sub-tab Picker Rule I flow-simulate', () => {
  it('FP1 menu → orb (multi-item) → picker → mini-orb 0 → activeTab updates', () => {
    setViewport(1024);
    const multiSection = NAV_SECTIONS.find((s) => s.items.length >= 2);
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getByTestId(`bloom-orb-${multiSection.id}`));
    // Picker mounted; ArcBloom still behind
    expect(screen.queryByTestId('subtab-overlay')).not.toBeNull();
    expect(screen.queryByTestId('bloom-overlay')).not.toBeNull();
    fireEvent.click(screen.getByTestId(`subtab-cell-${multiSection.items[0].id}`));
    expect(screen.getByTestId('active-tab').textContent).toBe(multiSection.items[0].id);
    // Both blooms collapsed
    expect(screen.queryByTestId('subtab-overlay')).toBeNull();
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('FP2 menu → orb (single-item) → direct navigate, picker NOT mounted', () => {
    setViewport(1024);
    const singleSection = NAV_SECTIONS.find((s) => s.items.length === 1);
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getByTestId(`bloom-orb-${singleSection.id}`));
    expect(screen.queryByTestId('subtab-overlay')).toBeNull();
    expect(screen.getByTestId('active-tab').textContent).toBe(singleSection.items[0].id);
  });

  it('FP3 menu → multi-item orb → Esc → picker closes, ArcBloom stays open, activeTab unchanged', () => {
    setViewport(1024);
    const multiSection = NAV_SECTIONS.find((s) => s.items.length >= 2);
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getByTestId(`bloom-orb-${multiSection.id}`));
    expect(screen.queryByTestId('subtab-overlay')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('subtab-overlay')).toBeNull();
    // ArcBloom remains; activeTab default unchanged
    expect(screen.queryByTestId('bloom-overlay')).not.toBeNull();
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
  });

  it('FP4 menu → multi-item orb → backdrop click → picker closes, ArcBloom stays open', () => {
    setViewport(1024);
    const multiSection = NAV_SECTIONS.find((s) => s.items.length >= 2);
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getByTestId(`bloom-orb-${multiSection.id}`));
    fireEvent.click(screen.getByTestId('subtab-overlay'));
    expect(screen.queryByTestId('subtab-overlay')).toBeNull();
    expect(screen.queryByTestId('bloom-overlay')).not.toBeNull();
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
  });

  it('FP5 mobile viewport — multi-item picker renders V2 mobile bubble', () => {
    setViewport(400);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const multiSection = NAV_SECTIONS.find((s) => s.items.length >= 2);
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getByTestId(`bloom-orb-${multiSection.id}`));
    const modal = screen.getByTestId('subtab-modal');
    expect(modal.className).toContain('mobile');
    // Origin should be set from orb rect
    expect(modal.style.getPropertyValue('--origin-x').trim()).not.toBe('');
  });

  it('FP6 every multi-item section reachable via picker mini-orb chain', () => {
    setViewport(1024);
    const multiSections = NAV_SECTIONS.filter((s) => s.items.length >= 2);
    multiSections.forEach((section) => {
      const { unmount } = render(<HarnessApp />);
      fireEvent.click(screen.getByTestId('duo-pill-menu'));
      fireEvent.click(screen.getByTestId(`bloom-orb-${section.id}`));
      fireEvent.click(screen.getByTestId(`subtab-cell-${section.items[0].id}`));
      expect(screen.getByTestId('active-tab').textContent).toBe(section.items[0].id);
      unmount();
    });
  });

  it('FP7 every single-item section reachable via direct nav (no picker)', () => {
    setViewport(1024);
    const singleSections = NAV_SECTIONS.filter((s) => s.items.length === 1);
    singleSections.forEach((section) => {
      const { unmount } = render(<HarnessApp />);
      fireEvent.click(screen.getByTestId('duo-pill-menu'));
      fireEvent.click(screen.getByTestId(`bloom-orb-${section.id}`));
      expect(screen.queryByTestId('subtab-overlay')).toBeNull();
      expect(screen.getByTestId('active-tab').textContent).toBe(section.items[0].id);
      unmount();
    });
  });

  it('FP8 picker mini-orb click navigates to LAST item correctly (boundary)', () => {
    setViewport(1024);
    const section = NAV_SECTIONS.find((s) => s.items.length >= 5);
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getByTestId(`bloom-orb-${section.id}`));
    const lastItem = section.items[section.items.length - 1];
    fireEvent.click(screen.getByTestId(`subtab-cell-${lastItem.id}`));
    expect(screen.getByTestId('active-tab').textContent).toBe(lastItem.id);
  });
});
