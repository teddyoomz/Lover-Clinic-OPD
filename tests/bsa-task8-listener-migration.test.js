// ─── BSA Task 8 — Live listener migration regression bank ───────────────────
// Phase BSA (2026-05-04). Locks the contract that every branch-scoped
// `listenTo*` callsite in components/pages either:
//   (a) is wrapped via `useBranchAwareListener(listenToX, ...)` — auto
//       re-subscribes on top-right branch switch, OR
//   (b) is annotated `// audit-branch-scope: listener-direct` because the
//       listener uses positional args incompatible with the hook's
//       (object-args + branchId injection) contract; the file's existing
//       useEffect carries branchId in deps for re-subscribe parity.
//
// Catches Task 5 → Task 8 drift: a future commit adding a new
// branch-scoped listener call that bypasses the hook (and forgets the
// annotation) fails this test before merge.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const BRANCH_SCOPED_LISTENERS = [
  'listenToAppointmentsByDate',
  'listenToAllSales',
  'listenToHolidays',
  'listenToScheduleByDay',
];

const grep = (pattern, paths) => {
  // Cross-platform: use { stdio: ['ignore','pipe','ignore'] } to swallow
  // stderr instead of `2>/dev/null` (which fails on Windows cmd). Catch
  // wraps non-zero exit (no matches) and returns []; matches return stdout.
  try {
    const out = execSync(`git grep -nE "${pattern}" -- ${paths}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch { return []; }
};

describe('BSA Task 8 — Live listener migration', () => {
  it('BS-4 — every branch-scoped listenTo* callsite uses useBranchAwareListener OR is annotated listener-direct', () => {
    for (const fn of BRANCH_SCOPED_LISTENERS) {
      const directCalls = grep(`${fn}\\(`, '"src/components/**" "src/pages/**"');
      const violations = directCalls.filter((line) => {
        const src = line.replace(/^[^:]+:\d+:/, '');
        // Skip lines that are inside useBranchAwareListener (hook usage)
        if (src.includes('useBranchAwareListener')) return false;
        // Skip lines in files that have the listener-direct annotation
        const file = line.split(':')[0];
        try {
          const content = fs.readFileSync(file, 'utf8');
          if (content.includes('audit-branch-scope: listener-direct')) return false;
        } catch {}
        return true;
      });
      expect(violations, `BS-4 ${fn} unannotated direct call:\n${violations.join('\n')}`).toEqual([]);
    }
  });

  it('T8.1 — useBranchAwareListener is imported in at least one consumer', () => {
    const hits = grep('useBranchAwareListener', '"src/components/**" "src/pages/**"');
    expect(hits.length).toBeGreaterThan(0);
  });
});
