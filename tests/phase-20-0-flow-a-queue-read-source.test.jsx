// Phase 20.0 Flow A — queue read-source swap from pc_appointments → be_appointments.
//
// Q4 calibrated test depth (Rule I a + c): pure simulate of source state +
// source-grep regression guards. No preview_eval needed (read-only swap, no
// new write semantics). Write paths get full Rule I in Flows B/C/D.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADMIN_DASHBOARD = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const SCOPED_DATA_LAYER = fs.readFileSync(
  path.join(ROOT, 'src/lib/scopedDataLayer.js'),
  'utf8',
);
const BACKEND_CLIENT = fs.readFileSync(
  path.join(ROOT, 'src/lib/backendClient.js'),
  'utf8',
);

describe('Phase 20.0 Flow A — A1 source-grep no pc_appointments reads', () => {
  it('A1.1 — AdminDashboard.jsx has NO pc_appointments collection access', () => {
    // Allow only comment mentions (which document the removal). Active code
    // would use either a string literal 'pc_appointments' inside a doc()/
    // collection() call, or the same outside a comment. Strip line-comments
    // and block-comments first.
    const stripped = ADMIN_DASHBOARD
      .replace(/\/\*[\s\S]*?\*\//g, '')         // block comments
      .replace(/^\s*\/\/.*$/gm, '');             // line comments
    expect(stripped).not.toMatch(/['"]pc_appointments['"]/);
  });

  it('A1.2 — AdminDashboard.jsx has NO broker.syncAppointments() call', () => {
    const stripped = ADMIN_DASHBOARD
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/broker\.syncAppointments\s*\(/);
  });
});

describe('Phase 20.0 Flow A — A2 listenToAppointmentsByMonth wired', () => {
  it('A2.1 — AdminDashboard imports listenToAppointmentsByMonth from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*listenToAppointmentsByMonth[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('A2.2 — AdminDashboard imports getAppointmentsByMonth from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*getAppointmentsByMonth[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('A2.3 — AdminDashboard calls listenToAppointmentsByMonth(...)', () => {
    expect(ADMIN_DASHBOARD).toMatch(/listenToAppointmentsByMonth\s*\(/);
  });

  it('A2.4 — AdminDashboard calls getAppointmentsByMonth(...) for schedule-link work', () => {
    expect(ADMIN_DASHBOARD).toMatch(/getAppointmentsByMonth\s*\(/);
  });
});

describe('Phase 20.0 Flow A — A3 backendClient + scopedDataLayer surface', () => {
  it('A3.1 — backendClient exports listenToAppointmentsByMonth', () => {
    expect(BACKEND_CLIENT).toMatch(/^export\s+function\s+listenToAppointmentsByMonth\b/m);
  });

  it('A3.2 — scopedDataLayer re-exports listenToAppointmentsByMonth', () => {
    expect(SCOPED_DATA_LAYER).toMatch(
      /export\s+const\s+listenToAppointmentsByMonth\s*=/,
    );
  });

  it('A3.3 — listenToAppointmentsByMonth signature accepts (yearMonth, optsOrCallback, ...)', () => {
    expect(BACKEND_CLIENT).toMatch(
      /export\s+function\s+listenToAppointmentsByMonth\s*\(\s*yearMonth\s*,\s*optsOrCallback\s*,/,
    );
  });
});

describe('Phase 20.0 Flow A — A4 dead sync state + UI removed', () => {
  it('A4.1 — apptSyncing state declaration removed', () => {
    const stripped = ADMIN_DASHBOARD
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/useState\s*\(\s*false\s*\)\s*;\s*\n\s*const\s*\[\s*apptSyncing/);
    expect(stripped).not.toMatch(/\bapptSyncing\b/);
  });

  it('A4.2 — apptSyncSuccess state declaration removed', () => {
    const stripped = ADMIN_DASHBOARD
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/\bapptSyncSuccess\b/);
  });

  it('A4.3 — apptAutoSyncedRef removed', () => {
    const stripped = ADMIN_DASHBOARD
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/\bapptAutoSyncedRef\b/);
  });

  it('A4.4 — apptSyncedMonthsRef removed', () => {
    const stripped = ADMIN_DASHBOARD
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/\bapptSyncedMonthsRef\b/);
  });

  it('A4.5 — handleSyncAppointments handler removed', () => {
    const stripped = ADMIN_DASHBOARD
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/\bhandleSyncAppointments\b/);
  });
});

describe('Phase 20.0 Flow A — A5 listener filters + sorts correctly', () => {
  // Pure-helper simulate of the month-filter + sort logic. Mirrors what
  // listenToAppointmentsByMonth does inside backendClient.js.

  function normalizeDate(s) {
    if (!s) return '';
    const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function simulateMonthFilter(allAppts, yearMonth) {
    return allAppts
      .map(a => {
        const iso = normalizeDate(a.date);
        if (!iso || iso.slice(0, 7) !== yearMonth) return null;
        return { ...a, date: iso };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const byDate = (a.date || '').localeCompare(b.date || '');
        if (byDate !== 0) return byDate;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });
  }

  it('A5.1 — filters out appts not in target month', () => {
    const all = [
      { id: '1', date: '2026-04-15', startTime: '10:00' },
      { id: '2', date: '2026-05-01', startTime: '09:00' },
      { id: '3', date: '2026-04-30', startTime: '14:00' },
    ];
    const result = simulateMonthFilter(all, '2026-04');
    expect(result.map(a => a.id)).toEqual(['1', '3']);
  });

  it('A5.2 — sorts by (date, startTime) ascending', () => {
    const all = [
      { id: '1', date: '2026-04-15', startTime: '14:00' },
      { id: '2', date: '2026-04-15', startTime: '09:00' },
      { id: '3', date: '2026-04-10', startTime: '11:00' },
    ];
    const result = simulateMonthFilter(all, '2026-04');
    expect(result.map(a => a.id)).toEqual(['3', '2', '1']);
  });

  it('A5.3 — handles drifted ISO timestamps (e.g. "2026-04-15T00:00:00")', () => {
    const all = [
      { id: '1', date: '2026-04-15T00:00:00', startTime: '10:00' },
    ];
    const result = simulateMonthFilter(all, '2026-04');
    expect(result.length).toBe(1);
    expect(result[0].date).toBe('2026-04-15'); // normalized
  });

  it('A5.4 — empty input → empty array', () => {
    expect(simulateMonthFilter([], '2026-04')).toEqual([]);
  });

  it('A5.5 — invalid month → no match', () => {
    const all = [{ id: '1', date: '2026-04-15', startTime: '10:00' }];
    expect(simulateMonthFilter(all, '2099-12')).toEqual([]);
  });
});

describe('Phase 20.0 Flow A — A6 branch-scope auto-inject (post-Task-6)', () => {
  // Phase 20.0 Task 6 (2026-05-06) — swapped the placeholder {allBranches:true}
  // to {} so scopedDataLayer auto-injects resolveSelectedBranchId(). Z3 tests
  // in phase-20-0-task-6-branch-selector-frontend.test.jsx own the post-
  // Task-6 invariants. A6 here verifies Phase 1's transition is complete
  // (no {allBranches:true} placeholder remains for these calls).

  it('A6.1 — listenToAppointmentsByMonth uses {} opts (auto-inject branch)', () => {
    const stripped = ADMIN_DASHBOARD
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(stripped).toMatch(
      /listenToAppointmentsByMonth\s*\(\s*apptMonth\s*,\s*\{\s*\}\s*,/s,
    );
  });

  it('A6.2 — getAppointmentsByMonth schedule-link calls use {} (auto-inject)', () => {
    const stripped = ADMIN_DASHBOARD
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(stripped).toMatch(/getAppointmentsByMonth\s*\([^,]+,\s*\{\s*\}\s*\)/);
  });
});
