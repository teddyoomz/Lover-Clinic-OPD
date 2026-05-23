// V119 (2026-05-23) — AV60 hook-import drift PERMANENT vitest gate.
//
// V80 saga lesson lived again: V118 added `useCallback` usage to
// AdminDashboard.jsx without adding `useCallback` to the line-1 React import.
// Build was clean (Vite doesn't static-check JS identifiers); all targeted
// tests passed (none mounted AdminDashboard). First render in real browser
// → ReferenceError → React unmounts entire tree → black screen.
//
// V80 (2026-05-16) created `scripts/diag-react-hook-import-drift.mjs` as the
// Rule P perpetual guard, but the scanner was OPT-IN — you had to remember to
// run it. V118 author (Claude) forgot. V119 closes the gap by running the
// scanner from a vitest that EVERY pre-commit / pre-deploy cycle hits
// automatically. The scanner is now MANDATORY, not OPT-IN.
//
// Class-of-bug: V12 multi-reader-sweep at the React-hook-import boundary.
// AV60 invariant lives at `.agents/skills/audit-anti-vibe-code/SKILL.md`
// (added V80). This test makes AV60 enforcement automatic.
//
// Cost: ~250ms (scans 527 .jsx/.tsx files under src/ + api/). Acceptable.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts/diag-react-hook-import-drift.mjs');

describe('V119 — AV60 React hook import drift permanent gate', () => {
  it('G1.1 — scanner exits 0 across all .jsx/.tsx in src/ + api/ (zero drift)', () => {
    const result = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    if (result.error) {
      throw new Error(`Failed to spawn AV60 scanner: ${result.error.message}`);
    }
    // The scanner prints "Drift instances found: N" + per-instance details
    // when N > 0. Exit code is non-zero on any drift.
    if (result.status !== 0) {
      // Surface the scanner's own output so the failing test shows EXACTLY
      // which file + hook is missing the import. Mirror of V80's lesson:
      // the test must surface the FILE PATH, not just a boolean.
      throw new Error(
        `AV60 drift detected — V80/V119 regression.\n` +
        `Scanner exit code: ${result.status}\n` +
        `Stdout:\n${result.stdout}\n` +
        `Stderr:\n${result.stderr}`,
      );
    }
    // Sanity: assert the scanner actually scanned files (not 0 because dir
    // was missing). Should report 500+ files in a healthy state.
    expect(result.stdout).toMatch(/Scanned: \d+ files/);
    expect(result.stdout).toMatch(/Drift instances found: 0/);
  });

  it('G1.2 — scanner reports a reasonable number of files (>= 400)', () => {
    // Defense against accidentally pointing the scanner at an empty dir
    // (e.g. someone renames src/ → src2/). The healthy baseline is ~527 files.
    const result = spawnSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    const m = result.stdout.match(/Scanned: (\d+) files/);
    expect(m).toBeTruthy();
    const scannedCount = parseInt(m[1], 10);
    expect(scannedCount).toBeGreaterThanOrEqual(400);
  });

  it('G2.1 — V119 origin documented in this file', () => {
    // Locks the institutional-memory comment so a future refactor can\'t
    // silently strip the V119 explanation. The test name + this assertion
    // together preserve the saga lesson.
    const fs = require('node:fs');
    const src = fs.readFileSync(__filename, 'utf8');
    expect(src).toMatch(/V80 saga lesson lived again/);
    expect(src).toMatch(/AV60 scanner existed but was OPT-IN/);
  });
});
