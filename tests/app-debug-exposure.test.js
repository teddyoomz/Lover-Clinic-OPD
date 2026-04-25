// ─── Phase 14.7.H — App.jsx debug-handle exposure regression guard ──────
//
// Pre-Phase-15 survey 2026-04-26 surfaced that `src/App.jsx:6` had
// `window.__auth = auth` running unconditionally — Firebase auth handle
// exposed to the dev console in production. Low likelihood of exploit
// but a real Rule C2 violation (security by default).
//
// Fix: wrap in `if (import.meta.env.DEV)` so Vite tree-shakes the block
// out of prod builds. This file is the regression guard — fails the
// build if anyone removes the DEV gate.
//
// Also doubles as documentation: any future "expose X to window" debug
// pattern in App.jsx should follow the same gate convention.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

// Helper: extract every `window.__*` debug assignment + return whether
// each one is preceded (within ~200 chars) by `import.meta.env.DEV`.
// This is the actual contract: "no debug global without a DEV gate".
function findDebugAssignments(src) {
  const matches = [];
  const re = /window\.__([a-zA-Z_$][\w$]*)\s*=/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const idx = m.index;
    const lookback = src.slice(Math.max(0, idx - 200), idx);
    const guarded = /import\.meta\.env\.DEV/.test(lookback);
    matches.push({ name: m[1], idx, guarded, lookback: lookback.slice(-80) });
  }
  return matches;
}

describe('App.jsx debug-handle exposure (Rule C2 — security by default)', () => {
  it('every `window.__*` assignment is gated by import.meta.env.DEV (within 200 chars)', () => {
    // Contract: any debug exposure (window.__name = ...) must be inside an
    // `if (import.meta.env.DEV)` block so Vite tree-shakes it from prod.
    // The 200-char window allows comments/whitespace between the gate and
    // the assignment.
    const assignments = findDebugAssignments(APP_SRC);
    expect(assignments.length).toBeGreaterThan(0); // something is intentionally exposed in dev
    const ungated = assignments.filter(a => !a.guarded);
    expect(ungated).toEqual([]);
  });

  it('window.__auth specifically lives inside an import.meta.env.DEV block', () => {
    // Pinpoint regression guard for THIS bug fix — anyone editing App.jsx
    // who removes the gate breaks the test.
    expect(APP_SRC).toMatch(/import\.meta\.env\.DEV[\s\S]{0,200}window\.__auth\s*=/);
  });

  it('comment trail explains the gate (so the next developer keeps it)', () => {
    expect(APP_SRC).toMatch(/Vite tree-shakes/);
    expect(APP_SRC).toMatch(/Rule C2/);
  });

  it('no plain `window.__name = ...` at column 0 (top-level unguarded)', () => {
    // Backup check: top-of-file unguarded assignments are clearly never
    // gated. A literal column-0 (no leading whitespace) `window.__X =` is
    // a hard fail. (The current passing case has 2-space indent inside
    // the if block.)
    const topLevel = APP_SRC.match(/^window\.__[a-zA-Z_$][\w$]*\s*=/gm) || [];
    expect(topLevel).toEqual([]);
  });
});
