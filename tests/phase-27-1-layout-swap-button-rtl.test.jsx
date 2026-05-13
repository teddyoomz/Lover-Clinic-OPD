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

  it('LSB.6 touch target ≥ 44px (WCAG 2.5.5) via w-11 h-11 Tailwind class', () => {
    render(<LayoutSwapButton onSwap={() => {}} position="left" visible={true} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/w-11/);
    expect(btn.className).toMatch(/h-11/);
  });

  it('LSB.7 wrapper has hidden lg:flex so it only shows on desktop', () => {
    render(<LayoutSwapButton onSwap={() => {}} position="left" visible={true} />);
    const wrapper = screen.getByTestId('layout-swap-button-wrapper');
    expect(wrapper.className).toMatch(/hidden/);
    expect(wrapper.className).toMatch(/lg:flex/);
  });
});
