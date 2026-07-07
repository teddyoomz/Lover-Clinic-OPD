// AV205 (2026-07-07) — useModalScrollLock hook unit tests (layer 1 of the
// universal modal scroll lock). Spec: docs/superpowers/specs/2026-07-07-modal-scroll-lock-design.html
// U1 mount/unmount · U2 ref-count (stacked modals) · U3 active=false no-op ·
// U4 active flips · U5 ModalScrollLock null component · U6 gutter cleanup ·
// U7 index.css layer-1 contract.
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { useModalScrollLock, ModalScrollLock, _getLockCount } from '../src/lib/useModalScrollLock.js';

function HookHost({ active = true }) { useModalScrollLock(active); return null; }
const htmlEl = () => document.documentElement;
afterEach(() => { cleanup(); });

describe('U1 — mount/unmount toggles html[data-modal-open]', () => {
  it('sets attr on mount, removes on unmount', () => {
    const { unmount } = render(<HookHost />);
    expect(htmlEl().getAttribute('data-modal-open')).toBe('1');
    unmount();
    expect(htmlEl().hasAttribute('data-modal-open')).toBe(false);
    expect(_getLockCount()).toBe(0);
  });
});

describe('U2 — ref count (modal ซ้อน modal)', () => {
  it('stays locked until the LAST modal closes', () => {
    const a = render(<HookHost />);
    const b = render(<HookHost />);
    expect(_getLockCount()).toBe(2);
    b.unmount();
    // A ยังเปิด → ยังล็อค
    expect(htmlEl().getAttribute('data-modal-open')).toBe('1');
    a.unmount();
    expect(htmlEl().hasAttribute('data-modal-open')).toBe(false);
    expect(_getLockCount()).toBe(0);
  });
});

describe('U3 — active=false is a no-op', () => {
  it('does not lock', () => {
    const { unmount } = render(<HookHost active={false} />);
    expect(htmlEl().hasAttribute('data-modal-open')).toBe(false);
    unmount();
    expect(_getLockCount()).toBe(0);
  });
});

describe('U4 — active flips lock on/off (always-mounted modal recipe)', () => {
  it('locks when active becomes true, unlocks when false', () => {
    const { rerender, unmount } = render(<HookHost active={false} />);
    expect(htmlEl().hasAttribute('data-modal-open')).toBe(false);
    rerender(<HookHost active={true} />);
    expect(htmlEl().getAttribute('data-modal-open')).toBe('1');
    rerender(<HookHost active={false} />);
    expect(htmlEl().hasAttribute('data-modal-open')).toBe(false);
    unmount();
    expect(_getLockCount()).toBe(0);
  });
});

describe('U5 — ModalScrollLock null component (inline-host recipe)', () => {
  it('locks while rendered, renders nothing', () => {
    const { container, unmount } = render(<ModalScrollLock />);
    expect(container.innerHTML).toBe('');
    expect(htmlEl().getAttribute('data-modal-open')).toBe('1');
    unmount();
    expect(htmlEl().hasAttribute('data-modal-open')).toBe(false);
  });
  it('respects active prop', () => {
    const { unmount } = render(<ModalScrollLock active={false} />);
    expect(htmlEl().hasAttribute('data-modal-open')).toBe(false);
    unmount();
  });
});

describe('U6 — gutter var cleaned up on last unlock', () => {
  it('removes --scroll-lock-gutter', () => {
    const { unmount } = render(<HookHost />);
    unmount();
    expect(htmlEl().style.getPropertyValue('--scroll-lock-gutter')).toBe('');
  });
});

describe('U7 — index.css layer-1 contract (AV205)', () => {
  const css = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  it('html[data-modal-open] → overflow hidden', () => {
    expect(css).toMatch(/html\[data-modal-open\]\s*\{[^}]*overflow:\s*hidden/);
  });
  it('body under lock → touch-action none + gutter compensation', () => {
    expect(css).toMatch(/html\[data-modal-open\]\s+body\s*\{[^}]*touch-action:\s*none/);
    expect(css).toMatch(/--scroll-lock-gutter/);
  });
});
