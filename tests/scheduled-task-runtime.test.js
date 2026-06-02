import { describe, it, expect } from 'vitest';
import { readScheduledTaskConfig, writeScheduledTaskStatus } from '../api/_lib/scheduledTaskRuntime.js';

// Minimal admin-Firestore mock: db.doc(path) → { get(), set(data, opts) }.
const mkDb = (docData, { throwOnGet = false, captureSet } = {}) => ({
  doc: () => ({
    get: async () => {
      if (throwOnGet) throw new Error('boom');
      return { exists: !!docData, data: () => docData };
    },
    set: async (d, opts) => { captureSet?.(d, opts); },
  }),
});

describe('readScheduledTaskConfig · FAIL-SAFE', () => {
  it('missing doc → enabled:true, params:{}', async () => {
    expect(await readScheduledTaskConfig(mkDb(null), 'chatHistoryRetention'))
      .toEqual({ enabled: true, params: {} });
  });

  it('read throws → FAIL-SAFE enabled:true', async () => {
    expect(await readScheduledTaskConfig(mkDb(null, { throwOnGet: true }), 'x'))
      .toEqual({ enabled: true, params: {} });
  });

  it('enabled:false honored + params passed through', async () => {
    const db = mkDb({ scheduledTasks: { chatHistoryRetention: { enabled: false, params: { retentionHours: 48 } } } });
    expect(await readScheduledTaskConfig(db, 'chatHistoryRetention'))
      .toEqual({ enabled: false, params: { retentionHours: 48 } });
  });

  it('task absent from config → enabled:true (default)', async () => {
    const db = mkDb({ scheduledTasks: { other: { enabled: false } } });
    expect((await readScheduledTaskConfig(db, 'chatHistoryRetention')).enabled).toBe(true);
  });

  it('malformed params (array) → {}', async () => {
    const db = mkDb({ scheduledTasks: { x: { params: [1, 2] } } });
    expect((await readScheduledTaskConfig(db, 'x')).params).toEqual({});
  });
});

// 🛡 ADVERSARIAL: ONLY a literal boolean `false` may disable a cron. Any other
// malformed `enabled` value (string "false", 0, null, a non-object task entry)
// MUST fail-safe to enabled:true — else a stray admin-SDK write or a future bug
// could silently stop a safety-critical cron (backup / chat-history / opd cleanup).
describe('readScheduledTaskConfig · only literal `false` disables (malformed → enabled)', () => {
  const reads = async (taskEntry) =>
    readScheduledTaskConfig(mkDb({ scheduledTasks: { x: taskEntry } }), 'x');

  it('enabled:"false" (string) → enabled:true', async () => {
    expect((await reads({ enabled: 'false' })).enabled).toBe(true);
  });
  it('enabled:0 → enabled:true', async () => {
    expect((await reads({ enabled: 0 })).enabled).toBe(true);
  });
  it('enabled:null → enabled:true', async () => {
    expect((await reads({ enabled: null })).enabled).toBe(true);
  });
  it('enabled:undefined (absent key) → enabled:true', async () => {
    expect((await reads({ params: { a: 1 } })).enabled).toBe(true);
  });
  it('task entry is a non-object string → {enabled:true, params:{}}', async () => {
    expect(await reads('garbage')).toEqual({ enabled: true, params: {} });
  });
  it('params is a string → {}', async () => {
    expect((await reads({ params: 'x' })).params).toEqual({});
  });
  it('params is null → {}', async () => {
    expect((await reads({ params: null })).params).toEqual({});
  });
  it('enabled:false (the ONLY disabling value) → enabled:false', async () => {
    expect((await reads({ enabled: false })).enabled).toBe(false);
  });
});

describe('writeScheduledTaskStatus', () => {
  it('merges a slice keyed by taskId with lastRunAt string', async () => {
    let captured;
    await writeScheduledTaskStatus(mkDb({}, { captureSet: (d, o) => { captured = { d, o }; } }),
      'chatHistoryRetention', { ok: true, summary: 'ลบ 5' });
    expect(captured.o).toEqual({ merge: true });
    expect(captured.d.chatHistoryRetention.ok).toBe(true);
    expect(captured.d.chatHistoryRetention.summary).toBe('ลบ 5');
    expect(typeof captured.d.chatHistoryRetention.lastRunAt).toBe('string');
    expect(captured.d.chatHistoryRetention.skipped).toBe(false);
  });

  it('never throws even if set() fails (non-fatal)', async () => {
    const db = { doc: () => ({ set: async () => { throw new Error('x'); } }) };
    await expect(writeScheduledTaskStatus(db, 'x', {})).resolves.toBeUndefined();
  });
});
