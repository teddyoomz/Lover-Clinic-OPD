// V87 (2026-05-18 EOD+11) — RecallFrontendView wrapper glow regression.
//
// User directive (verbatim):
//   "Tab ย่อย Recall ไม่ glow เหมือนที่อื่น"
//
// Root cause: V86 auto-glow CSS rule (`.admin-frontend-zone [class*="rounded-2xl"]`
// / `[class*="rounded-xl"]`) matches only `rounded-xl` and `rounded-2xl`.
// Pre-V87 the RecallFrontendView wrapper used `rounded-lg` — no match → no glow.
//
// Fix: bump `rounded-lg` → `rounded-xl` on the `data-testid="recall-frontend-view"`
// wrapper so the V86 auto-glow selector applies. No behavior change; pure
// cosmetic class swap.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RECALL_VIEW_PATH = path.resolve(__dirname, '../src/components/backend/recall/RecallFrontendView.jsx');
const SOURCE = fs.readFileSync(RECALL_VIEW_PATH, 'utf8');

const INDEX_CSS_PATH = path.resolve(__dirname, '../src/index.css');
const CSS = fs.readFileSync(INDEX_CSS_PATH, 'utf8');

describe('V87 — Recall frontend view glow (V86 auto-glow eligibility)', () => {
  it('R1.1 — wrapper uses rounded-xl (V86 auto-glow match)', () => {
    // Locate the wrapper line carrying data-testid="recall-frontend-view".
    const wrapperRe = /<div\s+data-testid="recall-frontend-view"\s+className="([^"]+)"/;
    const m = SOURCE.match(wrapperRe);
    expect(m).not.toBeNull();
    const cls = m[1];
    expect(cls).toMatch(/\brounded-xl\b/);
  });

  it('R1.2 — wrapper MUST NOT carry rounded-lg (regression lock)', () => {
    // Pre-V87 used rounded-lg → no V86 auto-glow → bug. Lock the broken shape out.
    const wrapperRe = /<div\s+data-testid="recall-frontend-view"\s+className="([^"]+)"/;
    const m = SOURCE.match(wrapperRe);
    expect(m).not.toBeNull();
    const cls = m[1];
    expect(cls).not.toMatch(/\brounded-lg\b/);
  });

  it('R2.1 — V86 auto-glow CSS rule still targets rounded-xl|rounded-2xl in .admin-frontend-zone', () => {
    // Lock the V86 auto-glow CSS contract so a future CSS refactor doesn\'t
    // accidentally drop the selector pair that makes this wrapper glow.
    expect(CSS).toMatch(/\.admin-frontend-zone\s+\[class\*=["']rounded-2xl["']\]/);
    expect(CSS).toMatch(/\.admin-frontend-zone\s+\[class\*=["']rounded-xl["']\]/);
  });

  it('R2.2 — wrapper className intersects the auto-glow eligibility set', () => {
    // Belt-and-suspenders simulation: take the wrapper className tokens,
    // verify that at least one of them is `rounded-xl` OR `rounded-2xl`.
    const wrapperRe = /<div\s+data-testid="recall-frontend-view"\s+className="([^"]+)"/;
    const cls = SOURCE.match(wrapperRe)[1];
    const tokens = cls.split(/\s+/);
    const eligible = tokens.some((t) => t === 'rounded-xl' || t === 'rounded-2xl');
    expect(eligible).toBe(true);
  });

  it('R3.1 — wrapper retains its border + bg-card so the auto-glow border-color override applies', () => {
    // V86 auto-glow paints a colored border ON TOP of the existing `border` class.
    // Without `border-[var(--bd)]` baseline, the auto-glow border could disappear
    // in some browser quirks. Lock the baseline border presence.
    const wrapperRe = /<div\s+data-testid="recall-frontend-view"\s+className="([^"]+)"/;
    const cls = SOURCE.match(wrapperRe)[1];
    expect(cls).toMatch(/\bborder\b/);
    expect(cls).toMatch(/bg-\[var\(--bg-card\)\]/);
  });
});
