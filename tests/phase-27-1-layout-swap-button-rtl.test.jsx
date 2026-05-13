// V27.1 — LayoutSwapButton RTL tests
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LayoutSwapButton } from '../src/components/LayoutSwapButton.jsx';

describe('LSB — LayoutSwapButton', () => {
  it('LSB.1 renders with aria-label hint when position=left (form on left → click moves to right)', () => {
    render(<LayoutSwapButton onSwap={() => {}} position="left" visible={true} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label');
    expect(btn.getAttribute('aria-label')).toContain('ขวา');
  });

  it('LSB.2 aria-label hints to "ซ้าย" when position=right', () => {
    render(<LayoutSwapButton onSwap={() => {}} position="right" visible={true} />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('ซ้าย');
  });

  it('LSB.3 click fires onSwap exactly once', () => {
    const onSwap = vi.fn();
    render(<LayoutSwapButton onSwap={onSwap} position="left" visible={true} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it('LSB.4 returns null when visible=false', () => {
    const { container } = render(<LayoutSwapButton onSwap={() => {}} position="left" visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('LSB.5 data-testid="layout-swap-button" for selector', () => {
    render(<LayoutSwapButton onSwap={() => {}} position="left" visible={true} />);
    expect(screen.getByTestId('layout-swap-button')).toBeInTheDocument();
  });

  it('LSB.6 button has appropriate dimensions for inline header placement (w-9 h-9 = 36px)', () => {
    // Phase 27.1-quater (2026-05-14) — refactored from floating 44px button
    // to inline 36px button (w-9 h-9) so it can sit comfortably in a sticky
    // header next to title + branch chip without overpowering them. Still
    // satisfies practical touch-tap usability since it's surrounded by
    // padding in the header bar (≥ 44px effective tap area).
    render(<LayoutSwapButton onSwap={() => {}} position="left" visible={true} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/w-9/);
    expect(btn.className).toMatch(/h-9/);
  });

  it('LSB.7 button has hidden lg:flex so it only shows on desktop split-screen', () => {
    // Phase 27.1-quater — no wrapper div anymore (component is now inline);
    // desktop-only class lives on the button itself.
    render(<LayoutSwapButton onSwap={() => {}} position="left" visible={true} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/hidden/);
    expect(btn.className).toMatch(/lg:flex/);
  });
});
