// V33.7 — LangPillToggle component RTL tests.
//
// Reusable segmented-pill TH/EN (or TH/EN/Bilingual) toggle used by
// LinkLineInstructionsModal + LinkRequestsTab "ผูกแล้ว" + DocumentPrintModal.
// Rule C1 extract — 3 call sites = shared.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LangPillToggle from '../src/components/backend/LangPillToggle.jsx';

beforeEach(() => cleanup());

describe('V33.7.LP1 — basic render', () => {
  it('LP1.1 — default 2 buttons (TH + EN)', () => {
    render(<LangPillToggle value="th" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /TH/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /EN/i })).toBeTruthy();
  });
  it('LP1.2 — 3 buttons when options=["th","en","bilingual"]', () => {
    render(<LangPillToggle value="th" options={['th', 'en', 'bilingual']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /TH(?!\/)/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^.*: EN$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /TH\/EN/i })).toBeTruthy();
  });
  it('LP1.3 — group has aria-label', () => {
    const { container } = render(<LangPillToggle value="th" onChange={() => {}} ariaLabel="bot reply language" />);
    const group = container.querySelector('[role="group"]');
    expect(group).toBeTruthy();
    expect(group.getAttribute('aria-label')).toBe('bot reply language');
  });
  it('LP1.4 — labels render uppercase', () => {
    render(<LangPillToggle value="th" onChange={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toBe('TH');
    expect(buttons[1].textContent).toBe('EN');
  });
  it('LP1.5 — bilingual option renders as "TH/EN"', () => {
    render(<LangPillToggle value="bilingual" options={['th', 'en', 'bilingual']} onChange={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[2].textContent).toBe('TH/EN');
  });
});

describe('V33.7.LP2 — active state', () => {
  it('LP2.1 — active button has aria-pressed=true', () => {
    render(<LangPillToggle value="en" onChange={() => {}} />);
    const enBtn = screen.getByRole('button', { name: /EN/i });
    const thBtn = screen.getByRole('button', { name: /TH/i });
    expect(enBtn.getAttribute('aria-pressed')).toBe('true');
    expect(thBtn.getAttribute('aria-pressed')).toBe('false');
  });
  it('LP2.2 — active button uses activeClassName', () => {
    render(<LangPillToggle value="th" onChange={() => {}} activeClassName="bg-rose-700 text-white" />);
    const thBtn = screen.getByRole('button', { name: /TH/i });
    expect(thBtn.className).toMatch(/bg-rose-700/);
    expect(thBtn.className).toMatch(/text-white/);
  });
  it('LP2.3 — inactive buttons get inactiveClassName', () => {
    render(<LangPillToggle value="th" onChange={() => {}} />);
    const enBtn = screen.getByRole('button', { name: /EN/i });
    expect(enBtn.className).toMatch(/text-\[var\(--tx-muted/);
  });
});

describe('V33.7.LP3 — onChange behavior', () => {
  it('LP3.1 — click inactive button → onChange fires with new value', () => {
    const onChange = vi.fn();
    render(<LangPillToggle value="th" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /EN/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('en');
  });
  it('LP3.2 — click active button → onChange does NOT fire (no-op)', () => {
    const onChange = vi.fn();
    render(<LangPillToggle value="th" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /TH/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('LP3.3 — missing onChange does NOT crash', () => {
    render(<LangPillToggle value="th" />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /EN/i }))).not.toThrow();
  });
});

describe('V33.7.LP4 — disabled state', () => {
  it('LP4.1 — disabled prop disables every button', () => {
    render(<LangPillToggle value="th" onChange={() => {}} disabled />);
    screen.getAllByRole('button').forEach((b) => expect(b.disabled).toBe(true));
  });
  it('LP4.2 — disabled click does NOT fire onChange', () => {
    const onChange = vi.fn();
    render(<LangPillToggle value="th" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: /EN/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('LP4.3 — disabled className includes opacity-50', () => {
    render(<LangPillToggle value="th" onChange={() => {}} disabled />);
    const btn = screen.getByRole('button', { name: /TH/i });
    expect(btn.className).toMatch(/opacity-50/);
    expect(btn.className).toMatch(/cursor-not-allowed/);
  });
});

describe('V33.7.LP5 — adversarial', () => {
  it('LP5.1 — empty options array falls back to default ["th","en"]', () => {
    render(<LangPillToggle value="th" options={[]} onChange={() => {}} />);
    expect(screen.getAllByRole('button').length).toBe(2);
  });
  it('LP5.2 — undefined value → no button is active (all aria-pressed=false)', () => {
    render(<LangPillToggle value={undefined} onChange={() => {}} />);
    screen.getAllByRole('button').forEach((b) => {
      expect(b.getAttribute('aria-pressed')).toBe('false');
    });
  });
  it('LP5.3 — non-string options coerce to string', () => {
    // Defensive: numeric option should still render
    render(<LangPillToggle value={1} options={[1, 2]} onChange={() => {}} />);
    expect(screen.getAllByRole('button').length).toBe(2);
  });
  it('LP5.4 — size="xs" produces smaller padding/text', () => {
    render(<LangPillToggle value="th" onChange={() => {}} size="xs" />);
    const btn = screen.getByRole('button', { name: /TH/i });
    expect(btn.className).toMatch(/text-\[10px\]/);
  });
  it('LP5.5 — size="sm" (default) produces 11px text', () => {
    render(<LangPillToggle value="th" onChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /TH/i });
    expect(btn.className).toMatch(/text-\[11px\]/);
  });
});

describe('V33.7.LP6 — labelFn override (custom labels)', () => {
  it('LP6.1 — labelFn replaces default labels', () => {
    render(
      <LangPillToggle
        value="th"
        onChange={() => {}}
        labelFn={(opt) => (opt === 'th' ? 'ไทย' : 'ENG')}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toBe('ไทย');
    expect(buttons[1].textContent).toBe('ENG');
  });
});
