// V92 (2026-05-18 EOD+11 LATE) — BackendCmdPalette mobile sheet + visible close.
//
// User report (verbatim):
//   "เมนูใหม่กดเปิดมาแล้วเต็มจอเลย แถมไม่มีปุ่มปิดอีก
//    ช่วย Design drop down มันให้สวยและใช้งานง่ายกว่านี้ สำหรับ mobile"
//
// Pre-V92:
//   - Mobile palette used `h-full sm:h-auto` → consumed entire viewport.
//   - No top backdrop gap → click-outside-to-close (AV78 exemption from
//     V85-followup EOD9) was effectively unreachable on mobile.
//   - No visible close button. ESC kbd hint hidden on mobile (no kbd).
//   - Result: user opens palette on mobile → stuck (no obvious dismiss).
//
// V92 cosmetic fix (cosmetic-shell + V82 lock — only Command container
// className + new X button + 1 imports change; cmdk Command internals
// + onSelect handlers + filtering logic UNCHANGED):
//   - mobile container: `mt-12 max-h-[calc(100vh-3rem)] rounded-b-2xl`
//     → 48px top backdrop visible + sheet-style bottom corners
//   - desktop container: `sm:mt-0 sm:max-w-xl sm:max-h-[70vh] sm:rounded-2xl`
//     → V85-followup desktop layout PRESERVED verbatim
//   - NEW X close button in header (mobile + desktop) — explicit dismiss
//     affordance independent of backdrop-tap discovery.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

// Mock cmdk so we don't have to set up the full Command tree.
vi.mock('cmdk', () => ({
  Command: ({ children, className, label, onClick, onKeyDown, ...rest }) => (
    <div className={className} role="dialog" aria-label={label} onClick={onClick} onKeyDown={onKeyDown} data-cmdk-mock>
      {children}
    </div>
  ),
}));

// Attach Command sub-components onto the mock (cmdk exports them as members).
import { Command as CmdMock } from 'cmdk';
CmdMock.Input = ({ placeholder, className, autoFocus }) => (
  <input placeholder={placeholder} className={className} autoFocus={autoFocus} />
);
CmdMock.List = ({ children, className }) => <div className={className}>{children}</div>;
CmdMock.Empty = ({ children, className }) => <div className={className}>{children}</div>;
CmdMock.Group = ({ children, heading, className }) => (
  <div className={className}>
    <div>{heading}</div>
    {children}
  </div>
);
CmdMock.Item = ({ children, onSelect }) => (
  <div onClick={onSelect}>{children}</div>
);

// Mock useTabAccess so we don't need the real permission stack.
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: () => ({ canAccess: () => true, loaded: true }),
}));

import BackendCmdPalette from '../src/components/backend/nav/BackendCmdPalette.jsx';

const PATH = path.resolve(__dirname, '../src/components/backend/nav/BackendCmdPalette.jsx');
const SOURCE = fs.readFileSync(PATH, 'utf8');

describe('V92 — cmd-palette mobile redesign (RTL)', () => {
  it('C1.1 — explicit X close button renders in header with aria-label', () => {
    render(
      <BackendCmdPalette open={true} onOpenChange={() => {}} onNavigate={() => {}} />
    );
    const closeBtn = screen.getByTestId('cmd-palette-close');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn.getAttribute('aria-label')).toBe('ปิดเมนูค้นหา');
  });

  it('C1.2 — X close button click fires onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(
      <BackendCmdPalette open={true} onOpenChange={onOpenChange} onNavigate={() => {}} />
    );
    fireEvent.click(screen.getByTestId('cmd-palette-close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('C2.1 — Command container has mobile sheet classes (mt-12 + max-h-[calc(100vh-3rem)])', () => {
    render(
      <BackendCmdPalette open={true} onOpenChange={() => {}} onNavigate={() => {}} />
    );
    const cmd = screen.getByRole('dialog', { name: 'เมนูค้นหา' });
    const cls = cmd.className;
    expect(cls).toMatch(/\bmt-12\b/);
    expect(cls).toMatch(/max-h-\[calc\(100vh-3rem\)\]/);
    expect(cls).toMatch(/\brounded-b-2xl\b/);
  });

  it('C2.2 — Command container PRESERVES desktop classes (sm:mt-0 + sm:max-w-xl + sm:max-h-[70vh] + sm:rounded-2xl)', () => {
    render(
      <BackendCmdPalette open={true} onOpenChange={() => {}} onNavigate={() => {}} />
    );
    const cmd = screen.getByRole('dialog', { name: 'เมนูค้นหา' });
    const cls = cmd.className;
    expect(cls).toMatch(/sm:mt-0/);
    expect(cls).toMatch(/sm:max-w-xl/);
    expect(cls).toMatch(/sm:max-h-\[70vh\]/);
    expect(cls).toMatch(/sm:rounded-2xl/);
  });

  it('C2.3 — Pre-V92 mobile full-screen classes REMOVED (regression lock)', () => {
    render(
      <BackendCmdPalette open={true} onOpenChange={() => {}} onNavigate={() => {}} />
    );
    const cmd = screen.getByRole('dialog', { name: 'เมนูค้นหา' });
    const cls = cmd.className;
    // Pre-V92 had `h-full sm:h-auto`. Either of these on mobile means
    // full-screen. They MUST be gone in V92.
    expect(cls).not.toMatch(/\bh-full\b/);
    expect(cls).not.toMatch(/\bsm:h-auto\b/);
  });

  it('C3.1 — ESC keyboard hint still present on desktop (hidden on mobile)', () => {
    render(
      <BackendCmdPalette open={true} onOpenChange={() => {}} onNavigate={() => {}} />
    );
    const escKbd = Array.from(document.querySelectorAll('kbd')).find(k => k.textContent?.includes('ESC'));
    expect(escKbd).not.toBeUndefined();
    expect(escKbd.className).toMatch(/hidden sm:inline-flex/);
  });
});

describe('V92 — source-grep regression', () => {
  it('S1.1 — X icon imported from lucide-react', () => {
    expect(SOURCE).toMatch(/import\s*\{[^}]*\bX\b[^}]*\}\s*from\s*['"]lucide-react['"]/);
  });

  it('S1.2 — close button has explicit testid + aria-label', () => {
    expect(SOURCE).toMatch(/data-testid="cmd-palette-close"/);
    expect(SOURCE).toMatch(/aria-label="ปิดเมนูค้นหา"/);
  });

  it('S1.3 — close button onClick fires onOpenChange(false) (attr order tolerant)', () => {
    // Find the close-button block by testid anchor, then scan ±400 chars
    // for the onClick handler. JSX attribute order may vary.
    const idx = SOURCE.indexOf('data-testid="cmd-palette-close"');
    expect(idx).toBeGreaterThan(0);
    const window400 = SOURCE.slice(Math.max(0, idx - 400), Math.min(SOURCE.length, idx + 400));
    expect(window400).toMatch(/onClick=\{\(\)\s*=>\s*onOpenChange\(false\)\}/);
  });

  it('S2.1 — Command container className has V92 mobile sheet classes', () => {
    expect(SOURCE).toMatch(/className="w-full\s+sm:max-w-xl\s+mt-12\s+sm:mt-0\s+max-h-\[calc\(100vh-3rem\)\]\s+sm:max-h-\[70vh\][\s\S]{0,200}rounded-b-2xl\s+sm:rounded-2xl/);
  });

  it('S2.2 — pre-V92 `h-full sm:h-auto` shape REMOVED', () => {
    // Walk the Command className region only — the only place those mobile
    // height classes could meaningfully live. Lock-out regex applies to the
    // entire file: this exact combo MUST NOT reappear on the palette container.
    expect(SOURCE).not.toMatch(/Command[\s\S]{0,500}h-full\s+sm:h-auto/);
  });

  it('S3.1 — V92 marker comment present', () => {
    expect(SOURCE).toMatch(/V92[\s\S]{0,300}mobile cmd-palette redesign/i);
  });

  it('S4.1 — backdrop click-outside-to-close handler PRESERVED (V85-followup AV78 exemption)', () => {
    expect(SOURCE).toMatch(/onClick=\{\(e\)\s*=>\s*\{\s*if\s*\(e\.currentTarget\s*===\s*e\.target\)\s*onOpenChange\(false\)/);
  });

  it('S4.2 — ESC keydown handler PRESERVED on Command container', () => {
    expect(SOURCE).toMatch(/onKeyDown=\{\(e\)\s*=>\s*\{\s*if\s*\(e\.key\s*===\s*['"]Escape['"]\)\s*onOpenChange\(false\)/);
  });

  it('S4.3 — Cmd+K / Ctrl+K global hotkey PRESERVED', () => {
    expect(SOURCE).toMatch(/e\.metaKey\s*\|\|\s*e\.ctrlKey/);
    expect(SOURCE).toMatch(/e\.key\.toLowerCase\(\)\s*===\s*['"]k['"]/);
  });
});
