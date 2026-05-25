// tests/visit-purpose-picker-rtl.test.jsx
// Task E2 — VisitPurposePicker chip multi-select (value = appointmentTo string).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VisitPurposePicker from '../src/components/VisitPurposePicker.jsx';

describe('VisitPurposePicker', () => {
  it('renders 10 chips + reflects selected from the value string', () => {
    render(<VisitPurposePicker value="ขลิบ, เสริมขนาด" onChange={() => {}} />);
    expect(screen.getByTestId('vp-chip-ขลิบ').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('vp-chip-เสริมขนาด').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('vp-chip-ทำหมัน').getAttribute('aria-pressed')).toBe('false');
  });

  it('toggling a chip emits the joined string', () => {
    const onChange = vi.fn();
    render(<VisitPurposePicker value="ขลิบ" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('vp-chip-เสริมขนาด'));
    expect(onChange).toHaveBeenCalledWith('ขลิบ, เสริมขนาด');
  });

  it('deselecting a chip removes it from the string', () => {
    const onChange = vi.fn();
    render(<VisitPurposePicker value="ขลิบ, เสริมขนาด" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('vp-chip-ขลิบ'));
    expect(onChange).toHaveBeenCalledWith('เสริมขนาด');
  });

  it('selecting อื่นๆ reveals the free-text box; typing emits "อื่นๆ: X"', () => {
    const onChange = vi.fn();
    const { rerender } = render(<VisitPurposePicker value="" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('vp-chip-อื่นๆ'));
    expect(onChange).toHaveBeenLastCalledWith('อื่นๆ');
    rerender(<VisitPurposePicker value="อื่นๆ" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('vp-other-input'), { target: { value: 'ผ่ามุก' } });
    expect(onChange).toHaveBeenLastCalledWith('อื่นๆ: ผ่ามุก');
  });

  it('hydrates legacy free-text value into the อื่นๆ box (no data loss)', () => {
    render(<VisitPurposePicker value="botox filler" onChange={() => {}} />);
    expect(screen.getByTestId('vp-chip-อื่นๆ').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('vp-other-input').value).toBe('botox filler');
  });

  it('shows the required asterisk only when required', () => {
    const { rerender, container } = render(<VisitPurposePicker value="" onChange={() => {}} />);
    expect(container.textContent).not.toContain('*');
    rerender(<VisitPurposePicker value="" onChange={() => {}} required />);
    expect(container.textContent).toContain('*');
  });

  it('wrapper carries data-field="appointmentTo" for scrollToError', () => {
    const { container } = render(<VisitPurposePicker value="" onChange={() => {}} />);
    expect(container.querySelector('[data-field="appointmentTo"]')).toBeTruthy();
  });
});
