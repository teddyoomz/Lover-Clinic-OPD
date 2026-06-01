import { describe, it, expect } from 'vitest';
import {
  mergeSystemConfigDefaults, validateSystemConfigPatch, computeChangedFields,
  SYSTEM_CONFIG_DEFAULTS,
} from '../src/lib/systemConfigClient.js';

describe('systemConfigClient · scheduledTasks', () => {
  it('defaults include scheduledTasks = {}', () => {
    expect(SYSTEM_CONFIG_DEFAULTS.scheduledTasks).toEqual({});
  });

  it('merge preserves a scheduledTasks slice', () => {
    const m = mergeSystemConfigDefaults({
      scheduledTasks: { chatHistoryRetention: { enabled: false, params: { retentionHours: 48 } } },
    });
    expect(m.scheduledTasks.chatHistoryRetention).toEqual({ enabled: false, params: { retentionHours: 48 } });
  });

  it('merge of missing/invalid scheduledTasks → {}', () => {
    expect(mergeSystemConfigDefaults(null).scheduledTasks).toEqual({});
    expect(mergeSystemConfigDefaults({ scheduledTasks: [] }).scheduledTasks).toEqual({});
  });

  it('validate rejects out-of-range param (retentionHours > 720)', () => {
    const err = validateSystemConfigPatch({ scheduledTasks: { chatHistoryRetention: { params: { retentionHours: 9999 } } } });
    expect(err).toMatch(/retentionHours/);
  });

  it('validate rejects unknown taskId', () => {
    expect(validateSystemConfigPatch({ scheduledTasks: { notATask: { enabled: false } } })).toMatch(/notATask|unknown/i);
  });

  it('validate rejects unknown param key', () => {
    expect(validateSystemConfigPatch({ scheduledTasks: { chatHistoryRetention: { params: { bogus: 1 } } } })).toMatch(/bogus|unknown/i);
  });

  it('validate rejects non-boolean enabled', () => {
    expect(validateSystemConfigPatch({ scheduledTasks: { chatHistoryRetention: { enabled: 'yes' } } })).toMatch(/enabled/);
  });

  it('validate accepts valid patch', () => {
    expect(validateSystemConfigPatch({ scheduledTasks: { chatHistoryRetention: { enabled: true, params: { retentionHours: 48 } } } })).toBeNull();
  });

  it('computeChangedFields diffs per-task', () => {
    const before = mergeSystemConfigDefaults({ scheduledTasks: { chatHistoryRetention: { enabled: true, params: { retentionHours: 24 } } } });
    const after = mergeSystemConfigDefaults({ scheduledTasks: { chatHistoryRetention: { enabled: false, params: { retentionHours: 24 } } } });
    expect(computeChangedFields(before, after)).toContain('scheduledTasks.chatHistoryRetention');
  });

  it('computeChangedFields: no change → no scheduledTasks entry', () => {
    const a = mergeSystemConfigDefaults({ scheduledTasks: { chatHistoryRetention: { enabled: true } } });
    expect(computeChangedFields(a, a).filter(f => f.startsWith('scheduledTasks'))).toEqual([]);
  });
});
