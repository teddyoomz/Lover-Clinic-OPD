// @vitest-environment jsdom
// ─── fx-perf-adaptive (2026-07-21) — iOS white-scroll fix + visual tier ─────
// Root cause (measured live on TFP): 10 full-width cards run infinite
// BOX-SHADOW keyframes (v86-breath auto-glow) → the page invalidates its own
// paint at 60fps forever → iOS tiles can never cache → fast scroll = white
// checkerboard even on an iPhone 17 Pro Max. Fix = one CSS control plane
// (--fx-anim consumed as animation-play-state by every shadow-animating rule):
//   html.is-scrolling            pauses breathers during scroll (ALL tiers)
//   html[data-visual-tier=eco]   pauses permanently + dims (weak machines)
// FP4 = the anti-drift classifier: a future box-shadow animation added
// without the pause plane turns this bank red.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const mockBeacon = vi.fn();
vi.mock('../src/lib/errorBeacon.js', () => ({
  reportTelemetryToBeacon: (...a) => mockBeacon(...a),
}));
const fx = await import('../src/lib/fxPerf.js');

const ROOT = join(__dirname, '..');
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8');

beforeEach(() => { mockBeacon.mockReset(); fx._resetFxPerfForTests(); });
afterEach(() => { fx._resetFxPerfForTests(); vi.useRealTimers(); });

describe('FP1 — resolveVisualTier (pure)', () => {
  it('FP1.1 default = full (beauty first; demote only on evidence)', () => {
    expect(fx.resolveVisualTier({})).toBe('full');
    expect(fx.resolveVisualTier({ hist: [{ ratio: 0.1 }], deviceMemory: 8, cores: 10 })).toBe('full');
  });

  it('FP1.2 manual override wins over everything', () => {
    expect(fx.resolveVisualTier({ override: 'full', cores: 1, hist: [{ ratio: 0.9 }, { ratio: 0.9 }] })).toBe('full');
    expect(fx.resolveVisualTier({ override: 'eco', cores: 16 })).toBe('eco');
  });

  it('FP1.3 hardware floor → eco instantly (≤2 cores or ≤2GB)', () => {
    expect(fx.resolveVisualTier({ cores: 2 })).toBe('eco');
    expect(fx.resolveVisualTier({ deviceMemory: 2 })).toBe('eco');
    expect(fx.resolveVisualTier({ cores: 0, deviceMemory: 0 })).toBe('full'); // unknown ≠ weak
  });

  it('FP1.4 measured jank ≥2 of last 3 sessions → eco (machinePerf ethos)', () => {
    expect(fx.resolveVisualTier({ hist: [{ ratio: 0.5 }, { ratio: 0.3 }] })).toBe('eco');
    expect(fx.resolveVisualTier({ hist: [{ ratio: 0.5 }, { ratio: 0.1 }, { ratio: 0.05 }] })).toBe('full'); // 1/3 only
    expect(fx.resolveVisualTier({ hist: [{ ratio: 0.9 }] })).toBe('full'); // single sample never flips
  });
});

describe('FP2 — recordJankSample + apply', () => {
  it('FP2.1 records, caps history at 3, flips with telemetry on the 2nd janky session', () => {
    expect(fx.recordJankSample(0.6)).toBe('recorded');
    expect(mockBeacon).not.toHaveBeenCalled();
    expect(fx.recordJankSample(0.6)).toBe('flipped');
    expect(mockBeacon).toHaveBeenCalledWith(expect.stringContaining('auto-eco-visual'));
    expect(fx.recordJankSample(0.6)).toBe('recorded'); // already eco — no re-flip spam
    expect(fx.getVisualTierState().hist.length).toBeLessThanOrEqual(3);
  });

  it('FP2.2 garbage ratios are skipped', () => {
    expect(fx.recordJankSample(NaN)).toBe('skipped');
    expect(fx.recordJankSample(-1)).toBe('skipped');
  });

  it('FP2.3 applyVisualTier stamps html[data-visual-tier]; override setter applies live', () => {
    fx.applyVisualTier();
    expect(['full', 'eco']).toContain(document.documentElement.dataset.visualTier);
    fx.setVisualTierOverride('eco');
    expect(document.documentElement.dataset.visualTier).toBe('eco');
    fx.setVisualTierOverride('full');
    expect(document.documentElement.dataset.visualTier).toBe('full');
    fx.setVisualTierOverride('auto');
    expect(fx.getVisualTierState().override).toBe('auto');
  });
});

describe('FP3 — installFxScrollPause (jsdom + fake timers)', () => {
  it('FP3.1 scroll adds html.is-scrolling; settle removes it; uninstall cleans up', () => {
    vi.useFakeTimers();
    const un = fx.installFxScrollPause({ settleMs: 180 });
    expect(document.documentElement.classList.contains('is-scrolling')).toBe(false);
    document.dispatchEvent(new Event('scroll'));
    expect(document.documentElement.classList.contains('is-scrolling')).toBe(true);
    // continuous scrolling keeps it on
    vi.advanceTimersByTime(100);
    document.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(100);
    expect(document.documentElement.classList.contains('is-scrolling')).toBe(true);
    // idle past settle → off
    vi.advanceTimersByTime(200);
    expect(document.documentElement.classList.contains('is-scrolling')).toBe(false);
    un();
    document.dispatchEvent(new Event('scroll'));
    expect(document.documentElement.classList.contains('is-scrolling')).toBe(false);
  });
});

describe('FP4 — CSS classifier: every box-shadow animation rides the pause plane', () => {
  // keyframes bodies end with a column-0 closing brace in this file
  const kfBlocks = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{[\s\S]*?\n\}/g)];
  const shadowKf = kfBlocks.filter(([block]) => /box-shadow/.test(block)).map(([, name]) => name);

  it('FP4.1 sanity — the known expensive keyframes are detected', () => {
    expect(shadowKf).toEqual(expect.arrayContaining(['v86-breath', 'v86-breath-light', 'glow-pulse', 'accent-breathe', 'card-filled-pending-breathe']));
  });

  it('FP4.2 EVERY INFINITE box-shadow animation carries animation-play-state: var(--fx-anim)', () => {
    // Scope = infinite only: one-shot effects (e.g. staff-chat-reply-bounce
    // 0.9s click highlight) self-terminate and cannot cause the perpetual
    // tile-invalidation class — they stay off the pause plane by design.
    const offenders = [];
    for (const name of shadowKf) {
      const re = new RegExp(`animation:[^;]*\\b${name}\\b[^;]*;`, 'g');
      for (const m of css.matchAll(re)) {
        if (!/\binfinite\b/.test(m[0])) continue;
        const open = css.lastIndexOf('{', m.index);
        const close = css.indexOf('}', m.index);
        const rule = css.slice(open, close);
        if (!rule.includes('animation-play-state: var(--fx-anim')) {
          offenders.push(`${name} @ char ${m.index}`);
        }
      }
    }
    expect(offenders, `infinite box-shadow animations missing the pause plane: ${offenders.join(' · ')}`).toEqual([]);
  });

  it('FP4.3 control plane rules exist (scroll pause + eco tier with inline-beating dim)', () => {
    expect(css).toMatch(/html\.is-scrolling\s*\{\s*--fx-anim:\s*paused;/);
    // eco intensity MUST carry !important — useV86GlowApply writes the admin's
    // intensity as an INLINE style on <html>, which beats a plain rule (caught
    // live in the 2026-07-21 L1: eco showed 0.45 without it).
    expect(css).toMatch(/html\[data-visual-tier="eco"\]\s*\{[\s\S]*?--fx-anim:\s*paused;[\s\S]*?--neon-intensity:\s*0\.25\s*!important/);
  });

  it('FP4.4 cheap compositor animations are NOT strangled (spinners stay running)', () => {
    // spin-smooth (loading spinner) must not consume the pause plane
    const spin = css.match(/animation:\s*spin-smooth[^;]*;[\s\S]{0,120}/);
    expect(spin).toBeTruthy();
    expect(spin[0]).not.toContain('--fx-anim');
  });
});

describe('FP5 — wiring', () => {
  it('FP5.1 App.jsx installs all three at boot', () => {
    const app = readFileSync(join(ROOT, 'src/App.jsx'), 'utf8');
    expect(app).toMatch(/applyVisualTier\(\)/);
    expect(app).toMatch(/startFrameJankProbe\(\)/);
    expect(app).toMatch(/installFxScrollPause\(\)/);
    expect(app).toMatch(/from '\.\/lib\/fxPerf\.js'/);
  });

  it('FP5.2 health card exposes the 3-way tier toggle', () => {
    const src = readFileSync(join(ROOT, 'src/components/backend/InfraHealthSection.jsx'), 'utf8');
    expect(src).toMatch(/infra-visual-tier-box/);
    expect(src).toMatch(/infra-visual-tier-\$\{mode\}/);
    expect(src).toMatch(/setVisualTierOverride\(mode\)/);
  });
});
