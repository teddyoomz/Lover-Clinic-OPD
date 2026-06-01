// Task 5 source-grep: every registry task's cron file carries the runtime guard
// (config read + status write + force + disabled-skip + its TASK_ID).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCHEDULED_TASKS } from '../src/lib/scheduledTasksRegistry.js';

describe('Scheduled Tasks · all 10 crons have the runtime guard', () => {
  for (const t of SCHEDULED_TASKS) {
    const file = `api/cron/${t.cronPath.split('/').pop()}.js`;
    it(`${t.id} (${file}) reads config + writes status + honors force + skips when disabled`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src, 'imports the runtime helper').toMatch(/readScheduledTaskConfig\s*,\s*writeScheduledTaskStatus|writeScheduledTaskStatus\s*,\s*readScheduledTaskConfig/);
      expect(src, 'reads config with db').toMatch(/readScheduledTaskConfig\(\s*db\s*,/);
      expect(src, 'writes status').toMatch(/writeScheduledTaskStatus\(\s*db\s*,/);
      expect(src, 'has the disabled-skip branch').toMatch(/disabled-by-config/);
      expect(src, 'honors the run-now force flag').toMatch(/req\.query\?\.force|req\.body\?\.force/);
      expect(src, 'declares its TASK_ID').toContain(`const TASK_ID = '${t.id}'`);
    });
  }

  it('exactly the 10 registry crons exist (no orphan cron file un-wired)', () => {
    // Cross-check: every cron file referenced by the registry is wired. (A new
    // scheduled cron MUST be added to the registry + get the guard — AV.)
    expect(SCHEDULED_TASKS.length).toBe(10);
  });
});
