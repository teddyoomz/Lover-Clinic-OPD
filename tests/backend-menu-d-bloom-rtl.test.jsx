import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BackendArcBloom from '../src/components/backend/shell/BackendArcBloom.jsx';
import { NAV_SECTIONS } from '../src/components/backend/nav/navConfig.js';

const noop = () => {};

describe('Backend Menu D — ArcBloom RTL', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('T3.1 renders nothing when open=false', () => {
    const { container } = render(<BackendArcBloom open={false} onClose={noop} onNavigate={noop} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('T3.2 renders dialog when open=true with aria-modal', () => {
    render(<BackendArcBloom open={true} onClose={noop} onNavigate={noop} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toMatch(/เมนู|menu/i);
  });

  it('T3.3 renders one orb per NAV_SECTIONS entry (8 orbs)', () => {
    render(<BackendArcBloom open={true} onClose={noop} onNavigate={noop} />);
    const orbs = screen.getAllByRole('menuitem');
    expect(orbs.length).toBe(NAV_SECTIONS.length);
  });

  it('T3.4 orb click invokes onNavigate with first item id from that section', () => {
    const onNavigate = vi.fn();
    render(<BackendArcBloom open={true} onClose={vi.fn()} onNavigate={onNavigate} />);
    const orbs = screen.getAllByRole('menuitem');
    fireEvent.click(orbs[0]);
    const firstSectionFirstItemId = NAV_SECTIONS[0].items[0].id;
    expect(onNavigate).toHaveBeenCalledWith(firstSectionFirstItemId);
  });

  it('T3.5 orb click also closes the bloom', () => {
    const onClose = vi.fn();
    render(<BackendArcBloom open={true} onClose={onClose} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('menuitem')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('T3.6 Escape key closes bloom', () => {
    const onClose = vi.fn();
    render(<BackendArcBloom open={true} onClose={onClose} onNavigate={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('T3.7 Arrow keys move focus to next orb', () => {
    render(<BackendArcBloom open={true} onClose={noop} onNavigate={noop} />);
    const orbs = screen.getAllByRole('menuitem');
    orbs[0].focus();
    expect(document.activeElement).toBe(orbs[0]);
    fireEvent.keyDown(orbs[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(orbs[1]);
  });

  it('T3.8 backdrop click closes bloom', () => {
    const onClose = vi.fn();
    render(<BackendArcBloom open={true} onClose={onClose} onNavigate={vi.fn()} />);
    const backdrop = screen.getByTestId('bloom-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('T3.9 each orb has accessible name from NAV_SECTIONS.label', () => {
    render(<BackendArcBloom open={true} onClose={noop} onNavigate={noop} />);
    const orbs = screen.getAllByRole('menuitem');
    NAV_SECTIONS.forEach((section, i) => {
      expect(orbs[i].getAttribute('aria-label')).toContain(section.label);
    });
  });

  it('T3.10 V82 marker present', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/shell/BackendArcBloom.jsx', 'utf-8');
    expect(src).toMatch(/Backend Menu D|ArcBloom/);
  });
});
