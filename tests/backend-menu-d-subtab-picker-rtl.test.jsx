// Tier 1 RTL — Backend Menu D Sub-tab Picker (V5 desktop / V2 mobile)
// Spec: docs/superpowers/specs/2026-05-18-backend-subtab-picker-design.md

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BackendSubTabBloom from '../src/components/backend/shell/BackendSubTabBloom.jsx';
import { NAV_SECTIONS } from '../src/components/backend/nav/navConfig.js';

const noop = () => {};

function makeSection(idOverride) {
  // Pick the FIRST multi-item section by default
  if (idOverride) {
    const s = NAV_SECTIONS.find((n) => n.id === idOverride);
    if (s) return s;
  }
  return NAV_SECTIONS.find((s) => Array.isArray(s.items) && s.items.length >= 2);
}

function setViewport(width) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('Backend Menu D — Sub-tab Picker RTL', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setViewport(1024); // default desktop
  });

  afterEach(() => {
    setViewport(1024);
  });

  // ---- Rendering basics ----

  it('P1.1 renders dialog overlay with aria-modal', () => {
    render(<BackendSubTabBloom section={makeSection()} onClose={noop} onNavigate={noop} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toContain(makeSection().label);
  });

  it('P1.2 renders one mini-orb cell per section.items entry', () => {
    const section = makeSection();
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />);
    const cells = screen.getAllByRole('menuitem');
    expect(cells.length).toBe(section.items.length);
  });

  it('P1.3 each mini-orb carries data-testid + aria-label per item', () => {
    const section = makeSection();
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />);
    section.items.forEach((item) => {
      const cell = screen.getByTestId(`subtab-cell-${item.id}`);
      expect(cell.getAttribute('aria-label')).toBe(item.label);
    });
  });

  // ---- Interaction ----

  it('P1.4 click mini-orb calls onNavigate(item.id) once and onClose once', () => {
    const section = makeSection();
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(<BackendSubTabBloom section={section} onClose={onClose} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId(`subtab-cell-${section.items[0].id}`));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(section.items[0].id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('P1.5 backdrop click calls onClose only — never onNavigate', () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(<BackendSubTabBloom section={makeSection()} onClose={onClose} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('subtab-overlay'));
    expect(onClose).toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('P1.6 click on modal body (not backdrop) does NOT close', () => {
    const onClose = vi.fn();
    render(<BackendSubTabBloom section={makeSection()} onClose={onClose} onNavigate={noop} />);
    fireEvent.click(screen.getByTestId('subtab-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('P1.7 Escape key closes picker (calls onClose)', () => {
    const onClose = vi.fn();
    render(<BackendSubTabBloom section={makeSection()} onClose={onClose} onNavigate={noop} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // ---- Keyboard nav ----

  it('P1.8 ArrowRight wraps to next cell', () => {
    const section = NAV_SECTIONS.find((s) => s.items.length >= 4);
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />);
    const cells = screen.getAllByRole('menuitem');
    cells[0].focus();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cells[1]);
  });

  it('P1.9 ArrowDown jumps 4 cells (4-col grid)', () => {
    const section = NAV_SECTIONS.find((s) => s.items.length >= 5);
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />);
    const cells = screen.getAllByRole('menuitem');
    cells[0].focus();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cells[4]);
  });

  // ---- Responsive split ----

  it('P1.10 desktop mode (≥768px) renders subtab-modal.desktop', () => {
    setViewport(1024);
    render(<BackendSubTabBloom section={makeSection()} onClose={noop} onNavigate={noop} />);
    const modal = screen.getByTestId('subtab-modal');
    expect(modal.className).toContain('desktop');
    expect(modal.className).not.toContain('mobile');
  });

  it('P1.11 mobile mode (<768px) renders subtab-modal.mobile', () => {
    setViewport(400);
    render(<BackendSubTabBloom section={makeSection()} onClose={noop} onNavigate={noop} />);
    const modal = screen.getByTestId('subtab-modal');
    expect(modal.className).toContain('mobile');
    expect(modal.className).not.toContain('desktop');
  });

  // ---- Prop wiring ----

  it('P1.12 parentColor sets --c1 / --c2 CSS vars on modal', () => {
    render(
      <BackendSubTabBloom
        section={makeSection()}
        onClose={noop}
        onNavigate={noop}
        parentColor={{ c1: '#ff0000', c2: '#00ff00' }}
      />
    );
    const modal = screen.getByTestId('subtab-modal');
    expect(modal.style.getPropertyValue('--c1').trim()).toBe('#ff0000');
    expect(modal.style.getPropertyValue('--c2').trim()).toBe('#00ff00');
  });

  it('P1.13 mobile: originRect sets --origin-x / --origin-y CSS vars', () => {
    setViewport(400);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    // Orb at (200, 600) with 40x40 → center (220, 620) → 55%/77.5%
    const rect = { left: 200, top: 600, width: 40, height: 40 };
    render(
      <BackendSubTabBloom
        section={makeSection()}
        onClose={noop}
        onNavigate={noop}
        originRect={rect}
      />
    );
    const modal = screen.getByTestId('subtab-modal');
    expect(modal.style.getPropertyValue('--origin-x').trim()).toBe('55.0%');
    expect(modal.style.getPropertyValue('--origin-y').trim()).toBe('77.5%');
  });

  it('P1.14 desktop ignores originRect (does NOT set --origin-x / -y)', () => {
    setViewport(1024);
    const rect = { left: 100, top: 100, width: 40, height: 40 };
    render(
      <BackendSubTabBloom
        section={makeSection()}
        onClose={noop}
        onNavigate={noop}
        originRect={rect}
      />
    );
    const modal = screen.getByTestId('subtab-modal');
    expect(modal.style.getPropertyValue('--origin-x').trim()).toBe('');
    expect(modal.style.getPropertyValue('--origin-y').trim()).toBe('');
  });

  // ---- Emoji + coverage ----

  it('P1.15 header shows section label + count "N รายการ"', () => {
    const section = makeSection();
    render(<BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />);
    expect(screen.getByText(section.label)).toBeTruthy();
    expect(screen.getByText(`${section.items.length} รายการ`)).toBeTruthy();
  });

  it('P1.16 covers all 6 multi-item sections — each renders distinct cell IDs', () => {
    const multiSections = NAV_SECTIONS.filter((s) => s.items.length >= 2);
    multiSections.forEach((section) => {
      const { unmount } = render(
        <BackendSubTabBloom section={section} onClose={noop} onNavigate={noop} />
      );
      section.items.forEach((item) => {
        expect(screen.getByTestId(`subtab-cell-${item.id}`)).toBeTruthy();
      });
      unmount();
    });
  });

  // ---- A11y + focus ----

  it('P1.17 first cell auto-focused on mount', () => {
    render(<BackendSubTabBloom section={makeSection()} onClose={noop} onNavigate={noop} />);
    // requestAnimationFrame schedules focus; vitest jsdom runs synchronously after flush
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const cells = screen.getAllByRole('menuitem');
        expect(document.activeElement).toBe(cells[0]);
        resolve();
      });
    });
  });

  it('P1.18 V5/V2 marker present in source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/shell/BackendSubTabBloom.jsx', 'utf-8');
    expect(src).toMatch(/V5 3D Tilt Stack|V2 Expanding Bubble/);
  });
});
