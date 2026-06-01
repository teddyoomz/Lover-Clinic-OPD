// Task 12 — Rule I full-flow simulate. Chains the REAL registry + REAL
// readScheduledTaskConfig + REAL config helpers (no mocks of the logic) against
// a mock admin-Firestore, mirroring the actual cron-guard + save + status flow.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readScheduledTaskConfig, writeScheduledTaskStatus } from '../api/_lib/scheduledTaskRuntime.js';
import { mergeSystemConfigDefaults, computeChangedFields, validateSystemConfigPatch } from '../src/lib/systemConfigClient.js';
import { SCHEDULED_TASKS } from '../src/lib/scheduledTasksRegistry.js';
import { RETENTION_HOURS } from '../src/lib/chatHistoryRetentionCore.js';

const mkDb = (scheduledTasks, { throwOnGet = false, captureStatus } = {}) => ({
  doc: () => ({
    get: async () => { if (throwOnGet) throw new Error('x'); return { exists: true, data: () => ({ scheduledTasks }) }; },
    set: async (d, o) => { captureStatus?.(d, o); },
  }),
});

// Mirror of the cron-guard decision (what each handler does at the top).
function guardDecision(cfg, forced) {
  if (!cfg.enabled && !forced) return { skip: true };
  return { skip: false, params: cfg.params };
}

describe('Scheduled Tasks · Rule I full-flow simulate', () => {
  it('F1 — enabled:false → guard skips (work fn NOT reached)', async () => {
    const cfg = await readScheduledTaskConfig(mkDb({ chatHistoryRetention: { enabled: false } }), 'chatHistoryRetention');
    expect(guardDecision(cfg, false).skip).toBe(true);
  });

  it('F1b — forced (run-now) overrides disabled', async () => {
    const cfg = await readScheduledTaskConfig(mkDb({ chatHistoryRetention: { enabled: false } }), 'chatHistoryRetention');
    expect(guardDecision(cfg, true).skip).toBe(false);
  });

  it('F2 — param override threads (48); missing param falls back to the core constant', async () => {
    const on = await readScheduledTaskConfig(mkDb({ chatHistoryRetention: { enabled: true, params: { retentionHours: 48 } } }), 'chatHistoryRetention');
    expect(on.params.retentionHours ?? RETENTION_HOURS).toBe(48);
    const bare = await readScheduledTaskConfig(mkDb({}), 'chatHistoryRetention');
    expect(bare.params.retentionHours ?? RETENTION_HOURS).toBe(RETENTION_HOURS);
  });

  it('F3 — config read throws → FAIL-SAFE enabled + core default (safety-critical never silently stops)', async () => {
    const cfg = await readScheduledTaskConfig(mkDb({}, { throwOnGet: true }), 'wholeSystemBackup');
    expect(cfg.enabled).toBe(true);
    expect(guardDecision(cfg, false).skip).toBe(false);
  });

  it('F4 — save diff produces scheduledTasks.<id> changedFields + validates', () => {
    const before = mergeSystemConfigDefaults({ scheduledTasks: { chatHistoryRetention: { enabled: true } } });
    const after  = mergeSystemConfigDefaults({ scheduledTasks: { chatHistoryRetention: { enabled: false } } });
    expect(computeChangedFields(before, after)).toContain('scheduledTasks.chatHistoryRetention');
    expect(validateSystemConfigPatch({ scheduledTasks: { chatHistoryRetention: { enabled: false } } })).toBeNull();
  });

  it('F5 — status write merges the per-task slice (UI listener picks it up)', async () => {
    let captured;
    await writeScheduledTaskStatus(mkDb({}, { captureStatus: (d, o) => { captured = { d, o }; } }), 'opdSessionCleanup', { ok: true, summary: 'ลบ 3' });
    expect(captured.o).toEqual({ merge: true });
    expect(captured.d.opdSessionCleanup.summary).toBe('ลบ 3');
  });

  it('F6 — ONLY ONE staff-chat deleter remains (Firebase duplicate retired)', () => {
    expect(readFileSync('functions/index.js', 'utf8')).not.toMatch(/cleanupOldStaffChatMessages/);
    const staff = SCHEDULED_TASKS.filter((t) => /staffChat/i.test(t.id));
    expect(staff.map((t) => t.id)).toEqual(['staffChatRetention']);
  });

  it('F7 — every registry task has a cron file carrying its TASK_ID guard', () => {
    for (const t of SCHEDULED_TASKS) {
      const file = `api/cron/${t.cronPath.split('/').pop()}.js`;
      expect(readFileSync(file, 'utf8')).toContain(`const TASK_ID = '${t.id}'`);
    }
  });
});
