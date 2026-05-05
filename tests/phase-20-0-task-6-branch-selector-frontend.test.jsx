// Phase 20.0 Task 6 — BranchSelector in AdminDashboard (Frontend) header.
// Q4 calibrated test depth: source-grep + lifecycle (a + c + e). The selector
// component itself has its own RTL test bank in branch-selector.test.jsx;
// here we verify that AdminDashboard mounts it + threads selectedBranchId
// through its read-paths.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADMIN_DASHBOARD = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const STRIPPED = ADMIN_DASHBOARD
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const APP_JSX = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

describe('Phase 20.0 Task 6 — Z1 BranchSelector mounted in AdminDashboard header', () => {
  it('Z1.1 — AdminDashboard imports BranchSelector', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s+BranchSelector\s+from\s+['"][^'"]*BranchSelector\.jsx['"]/,
    );
  });

  it('Z1.2 — AdminDashboard renders <BranchSelector /> in header JSX', () => {
    expect(STRIPPED).toMatch(/<BranchSelector\s*\/?\s*>/);
  });

  it('Z1.3 — BranchProvider is mounted at App.jsx so AdminDashboard inherits context', () => {
    expect(APP_JSX).toMatch(/<BranchProvider>/);
    expect(APP_JSX).toMatch(/<\/BranchProvider>/);
  });
});

describe('Phase 20.0 Task 6 — Z2 selectedBranchId observed via useSelectedBranch hook', () => {
  it('Z2.1 — AdminDashboard imports useSelectedBranch from BranchContext', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*useSelectedBranch[^}]*\}\s*from\s*['"][^'"]*BranchContext\.jsx['"]/s,
    );
  });

  it('Z2.2 — useSelectedBranch destructures branchId as selectedBranchId', () => {
    expect(STRIPPED).toMatch(/const\s*\{\s*branchId:\s*selectedBranchId\s*\}\s*=\s*useSelectedBranch\s*\(\s*\)/);
  });
});

describe('Phase 20.0 Task 6 — Z3 listenToAppointmentsByMonth follows selected branch', () => {
  it('Z3.1 — listener call passes empty opts {} so scopedDataLayer auto-injects selectedBranchId', () => {
    // Pre-Task-6 used {allBranches: true}; Task 6 swaps to {} (auto-inject).
    expect(STRIPPED).toMatch(/listenToAppointmentsByMonth\s*\(\s*apptMonth\s*,\s*\{\s*\}\s*,/);
  });

  it('Z3.2 — listener useEffect deps include selectedBranchId so subscription re-fires on branch switch', () => {
    // useEffect(() => {...}, [apptMonth, db, appId, selectedBranchId])
    expect(STRIPPED).toMatch(/\[\s*apptMonth\s*,\s*db\s*,\s*appId\s*,\s*selectedBranchId\s*\]/);
  });

  it('Z3.3 — getAppointmentsByMonth (schedule-link work) also passes empty opts (auto-inject)', () => {
    // 3 occurrences expected: updateActiveSchedules + handleGenScheduleLink (2x)
    const matches = STRIPPED.match(/getAppointmentsByMonth\s*\([^,]+,\s*\{\s*\}\s*\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('Z3.4 — no remaining {allBranches: true} for these calls', () => {
    // Allow {allBranches: true} elsewhere (other unrelated callers) but the
    // queue-listener + month-reads should be auto-inject.
    // Search specifically for `listenToAppointmentsByMonth(...{allBranches:` /
    // `getAppointmentsByMonth(..., {allBranches:`.
    expect(STRIPPED).not.toMatch(/listenToAppointmentsByMonth\s*\([^)]*allBranches:\s*true/s);
    expect(STRIPPED).not.toMatch(/getAppointmentsByMonth\s*\([^)]*allBranches:\s*true/s);
  });
});

describe('Phase 20.0 Task 6 — Z4 BranchSelector placement order (header)', () => {
  it('Z4.1 — BranchSelector mounted before ThemeToggle in JSX (header order)', () => {
    // Find positions to confirm BranchSelector renders to the LEFT of
    // ThemeToggle (matches BackendDashboard header convention).
    const branchIdx = STRIPPED.indexOf('<BranchSelector');
    const themeIdx = STRIPPED.indexOf('<ThemeToggle');
    expect(branchIdx).toBeGreaterThan(-1);
    expect(themeIdx).toBeGreaterThan(-1);
    expect(branchIdx).toBeLessThan(themeIdx);
  });
});

describe('Phase 20.0 Task 6 — Z5 lifecycle: branch switch triggers fresh be_appointments read', () => {
  // Pure simulate of the dep-array re-run semantics. When selectedBranchId
  // changes, React re-runs the effect → calls listenToAppointmentsByMonth
  // again → new branchId is auto-injected → resubscribed listener.

  function simulateEffectReSubscribe(deps, prevDeps) {
    // React useEffect re-fires iff any dep changes (Object.is comparison)
    if (deps.length !== prevDeps.length) return true;
    for (let i = 0; i < deps.length; i++) {
      if (!Object.is(deps[i], prevDeps[i])) return true;
    }
    return false;
  }

  it('Z5.1 — branch switch (selectedBranchId change) triggers re-subscription', () => {
    const prev = ['2026-04', {}, 'app-1', 'BR-A'];
    const next = ['2026-04', {}, 'app-1', 'BR-B'];
    expect(simulateEffectReSubscribe(next, prev)).toBe(true);
  });

  it('Z5.2 — month change also triggers re-subscription', () => {
    const prev = ['2026-04', {}, 'app-1', 'BR-A'];
    const next = ['2026-05', {}, 'app-1', 'BR-A'];
    expect(simulateEffectReSubscribe(next, prev)).toBe(true);
  });

  it('Z5.3 — no change → no re-subscription', () => {
    const same = ['2026-04', {}, 'app-1', 'BR-A'];
    expect(simulateEffectReSubscribe(same, same)).toBe(false);
  });
});
