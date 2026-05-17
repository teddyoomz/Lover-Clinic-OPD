// Tier 5 stress / chaos — Backend Menu D Sub-tab Picker.
// Validates resilience under rapid interaction, large sections, reduced-motion, and resize chaos.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BackendSubTabBloom from '../src/components/backend/shell/BackendSubTabBloom.jsx';
import { NAV_SECTIONS } from '../src/components/backend/nav/navConfig.js';

const noop = () => {};

function setViewport(width) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

function resizeWithAct(width) {
  act(() => {
    setViewport(width);
  });
}

describe('Backend Menu D — Sub-tab Picker stress / chaos', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setViewport(1024);
  });

  it('SS1 rapid mount/unmount 50× — completes without throw', () => {
    const section = NAV_SECTIONS.find((s) => s.items.length >= 4);
    let mounted = 0;
    let unmounted = 0;
    for (let i = 0; i < 50; i++) {
      const { unmount } = render(
        <BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />
      );
      mounted++;
      unmount();
      unmounted++;
    }
    expect(mounted).toBe(50);
    expect(unmounted).toBe(50);
  });

  it('SS2 100× mousemove during open — no thrash / no error', () => {
    const section = NAV_SECTIONS.find((s) => s.items.length >= 4);
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />);
    for (let i = 0; i < 100; i++) {
      fireEvent.mouseMove(window, { clientX: (i * 7) % 1024, clientY: (i * 13) % 768 });
    }
    // Modal still rendered, no throw
    expect(screen.getByTestId('subtab-modal')).toBeTruthy();
  });

  it('SS3 keyboard arrow mash 200× — focus stays in cells', () => {
    const section = NAV_SECTIONS.find((s) => s.items.length >= 4);
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />);
    const cells = screen.getAllByRole('menuitem');
    cells[0].focus();
    for (let i = 0; i < 200; i++) {
      const key = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'][i % 4];
      fireEvent.keyDown(window, { key });
    }
    // Focused element must be one of the menuitem cells
    expect(cells.some((c) => c === document.activeElement)).toBe(true);
  });

  it('SS4 Master section (21+ items) renders all cells without crash', () => {
    const masterSection = NAV_SECTIONS.find((s) => s.id === 'master');
    expect(masterSection).toBeDefined();
    expect(masterSection.items.length).toBeGreaterThanOrEqual(15);
    render(<BackendSubTabBloom section={masterSection} onClose={noop} onNavigate={noop} />);
    const cells = screen.getAllByRole('menuitem');
    expect(cells.length).toBe(masterSection.items.length);
  });

  it('SS5 reduced-motion preference — picker still renders and accepts clicks', () => {
    // Mock matchMedia to return prefers-reduced-motion = reduce
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q) => ({
      matches: q.includes('reduced-motion'),
      media: q,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: noop,
    }));
    const section = NAV_SECTIONS.find((s) => s.items.length >= 2);
    const onNavigate = vi.fn();
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId(`subtab-cell-${section.items[0].id}`));
    expect(onNavigate).toHaveBeenCalledWith(section.items[0].id);
    window.matchMedia = originalMatchMedia;
  });

  it('SS6 mobile→desktop resize while open — modal switches mobile↔desktop class', () => {
    setViewport(400);
    const section = NAV_SECTIONS.find((s) => s.items.length >= 2);
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />);
    expect(screen.getByTestId('subtab-modal').className).toContain('mobile');
    resizeWithAct(1024);
    expect(screen.getByTestId('subtab-modal').className).toContain('desktop');
    resizeWithAct(500);
    expect(screen.getByTestId('subtab-modal').className).toContain('mobile');
  });

  it('SS7 click cell immediately after mount — still navigates correctly', () => {
    const section = NAV_SECTIONS.find((s) => s.items.length >= 2);
    const onNavigate = vi.fn();
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={onNavigate} />);
    // Click without waiting for focus rAF
    fireEvent.click(screen.getByTestId(`subtab-cell-${section.items[0].id}`));
    expect(onNavigate).toHaveBeenCalledWith(section.items[0].id);
  });

  it('SS8 cycle through ALL multi-item sections back-to-back — distinct cell sets', () => {
    const multiSections = NAV_SECTIONS.filter((s) => s.items.length >= 2);
    multiSections.forEach((section) => {
      const { unmount } = render(
        <BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />
      );
      const cells = screen.getAllByRole('menuitem');
      expect(cells.length).toBe(section.items.length);
      // Each cell aria-label matches an item.label in this section
      const labels = cells.map((c) => c.getAttribute('aria-label'));
      section.items.forEach((item) => {
        expect(labels).toContain(item.label);
      });
      unmount();
    });
  });
});
