import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LINE_CONFIG,
  validateLineConfig,
  mergeLineConfigDefaults,
  normalizeLineConfigForWrite,
} from '../src/lib/lineConfigClient.js';

describe('Task 1 — lineReminder defaults + validation', () => {
  it('T1.1 DEFAULT_LINE_CONFIG.lineReminder has all required fields', () => {
    expect(DEFAULT_LINE_CONFIG.lineReminder).toBeDefined();
    expect(DEFAULT_LINE_CONFIG.lineReminder.enabled).toBe(false);
    expect(DEFAULT_LINE_CONFIG.lineReminder.dayBeforeHour).toBe(20);
    expect(DEFAULT_LINE_CONFIG.lineReminder.dayOfHour).toBe(9);
    expect(DEFAULT_LINE_CONFIG.lineReminder.quietHourStart).toBe(22);
    expect(DEFAULT_LINE_CONFIG.lineReminder.quietHourEnd).toBe(8);
    expect(typeof DEFAULT_LINE_CONFIG.lineReminder.templateDayBefore).toBe('string');
    expect(typeof DEFAULT_LINE_CONFIG.lineReminder.templateDayOf).toBe('string');
    expect(typeof DEFAULT_LINE_CONFIG.lineReminder.cancellationPolicyText).toBe('string');
  });

  it('T1.2 Templates contain required tokens', () => {
    const t = DEFAULT_LINE_CONFIG.lineReminder.templateDayBefore;
    expect(t).toContain('{{customerName}}');
    expect(t).toContain('{{branchName}}');
    expect(t).toContain('{{date}}');
    expect(t).toContain('{{time}}');
    const o = DEFAULT_LINE_CONFIG.lineReminder.templateDayOf;
    expect(o).toContain('{{customerName}}');
    expect(o).toContain('{{time}}');
  });

  it('T1.3 validateLineConfig accepts valid lineReminder', () => {
    const config = {
      ...DEFAULT_LINE_CONFIG,
      lineReminder: { enabled: true, dayBeforeHour: 20, dayOfHour: 9, quietHourStart: 22, quietHourEnd: 8,
        templateDayBefore: 'x', templateDayOf: 'x', cancellationPolicyText: 'x' },
    };
    expect(validateLineConfig(config).valid).toBe(true);
  });

  it('T1.4 validateLineConfig rejects out-of-range hours', () => {
    const config = { ...DEFAULT_LINE_CONFIG, lineReminder: { ...DEFAULT_LINE_CONFIG.lineReminder, dayBeforeHour: 25 } };
    const r = validateLineConfig(config);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/dayBeforeHour/);
  });

  it('T1.5 validateLineConfig accepts dayOfHour=null (disabled day-of window)', () => {
    const config = { ...DEFAULT_LINE_CONFIG, lineReminder: { ...DEFAULT_LINE_CONFIG.lineReminder, dayOfHour: null } };
    expect(validateLineConfig(config).valid).toBe(true);
  });

  it('T1.6 validateLineConfig rejects when reminder.enabled=true but no channelAccessToken', () => {
    const config = {
      ...DEFAULT_LINE_CONFIG,
      enabled: true,
      channelAccessToken: '',
      lineReminder: { ...DEFAULT_LINE_CONFIG.lineReminder, enabled: true },
    };
    const r = validateLineConfig(config);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/channelAccessToken/);
  });

  it('T1.7 quiet-hour fields accept wrap-around (start > end)', () => {
    const config = {
      ...DEFAULT_LINE_CONFIG,
      lineReminder: { ...DEFAULT_LINE_CONFIG.lineReminder, quietHourStart: 22, quietHourEnd: 8 },
    };
    expect(validateLineConfig(config).valid).toBe(true);
  });

  // ─── Task 1 polish (2026-05-15) — I1+I2 deep-merge + normalize propagation ───

  it('T1.8 mergeLineConfigDefaults returns full lineReminder block when remote has empty lineReminder', () => {
    // Remote doc has no lineReminder field at all
    const merged = mergeLineConfigDefaults({ channelId: 'CH-1', enabled: false });
    expect(merged.lineReminder).toBeDefined();
    expect(merged.lineReminder.enabled).toBe(false);
    expect(merged.lineReminder.dayBeforeHour).toBe(20);
    expect(merged.lineReminder.dayOfHour).toBe(9);
    expect(merged.lineReminder.quietHourStart).toBe(22);
    expect(merged.lineReminder.quietHourEnd).toBe(8);
    expect(typeof merged.lineReminder.templateDayBefore).toBe('string');
    expect(merged.lineReminder.templateDayBefore.length).toBeGreaterThan(0);
    expect(typeof merged.lineReminder.templateDayOf).toBe('string');
    expect(typeof merged.lineReminder.cancellationPolicyText).toBe('string');
    // Sanity: all 8 fields populated
    expect(Object.keys(merged.lineReminder).length).toBeGreaterThanOrEqual(8);
  });

  it('T1.9 mergeLineConfigDefaults deep-merges partial lineReminder (remote={enabled:true} → output has all 8 fields)', () => {
    // Critical: Firestore returns partial lineReminder; downstream readers (cron, debug-fire,
    // history) must NOT see `undefined` for dayBeforeHour / templates / etc.
    const merged = mergeLineConfigDefaults({
      channelId: 'CH-1',
      lineReminder: { enabled: true }, // partial — only one field!
    });
    expect(merged.lineReminder.enabled).toBe(true); // remote wins
    // ALL other fields must fall back to defaults (not undefined):
    expect(merged.lineReminder.dayBeforeHour).toBe(20);
    expect(merged.lineReminder.dayOfHour).toBe(9);
    expect(merged.lineReminder.quietHourStart).toBe(22);
    expect(merged.lineReminder.quietHourEnd).toBe(8);
    expect(merged.lineReminder.templateDayBefore).toBe(DEFAULT_LINE_CONFIG.lineReminder.templateDayBefore);
    expect(merged.lineReminder.templateDayOf).toBe(DEFAULT_LINE_CONFIG.lineReminder.templateDayOf);
    expect(merged.lineReminder.cancellationPolicyText).toBe(DEFAULT_LINE_CONFIG.lineReminder.cancellationPolicyText);
    // None should be undefined:
    expect(merged.lineReminder.dayBeforeHour).not.toBeUndefined();
    expect(merged.lineReminder.templateDayBefore).not.toBeUndefined();
  });

  it('T1.10 normalizeLineConfigForWrite propagates lineReminder block (UI Save preserves all 8 fields)', () => {
    // Without this, UI Save through saveLineConfig silently DROPS lineReminder.
    const input = {
      branchId: 'BR-1',
      channelId: 'CH-1',
      lineReminder: {
        enabled: true,
        dayBeforeHour: 18,
        dayOfHour: 10,
        quietHourStart: 23,
        quietHourEnd: 7,
        templateDayBefore: 'custom day-before',
        templateDayOf: 'custom day-of',
        cancellationPolicyText: 'custom policy',
      },
    };
    const out = normalizeLineConfigForWrite(input);
    expect(out.lineReminder).toBeDefined();
    expect(out.lineReminder.enabled).toBe(true);
    expect(out.lineReminder.dayBeforeHour).toBe(18);
    expect(out.lineReminder.dayOfHour).toBe(10);
    expect(out.lineReminder.quietHourStart).toBe(23);
    expect(out.lineReminder.quietHourEnd).toBe(7);
    expect(out.lineReminder.templateDayBefore).toBe('custom day-before');
    expect(out.lineReminder.templateDayOf).toBe('custom day-of');
    expect(out.lineReminder.cancellationPolicyText).toBe('custom policy');
  });

  it('T1.11 normalizeLineConfigForWrite clamps out-of-range hours (99 → 23) + handles dayOfHour=null', () => {
    const out = normalizeLineConfigForWrite({
      branchId: 'BR-1',
      lineReminder: {
        enabled: true,
        dayBeforeHour: 99,        // out-of-range → clamp to 23
        dayOfHour: null,          // null preserved (disabled day-of window)
        quietHourStart: -5,       // negative → clamp to 0
        quietHourEnd: 50,         // out-of-range → clamp to 23
        templateDayBefore: '',    // empty → falls back to default
        templateDayOf: 'ok',
        cancellationPolicyText: 'ok',
      },
    });
    expect(out.lineReminder.dayBeforeHour).toBe(23);
    expect(out.lineReminder.dayOfHour).toBe(null);
    expect(out.lineReminder.quietHourStart).toBe(0);
    expect(out.lineReminder.quietHourEnd).toBe(23);
    expect(out.lineReminder.templateDayBefore).toBe(DEFAULT_LINE_CONFIG.lineReminder.templateDayBefore);
    expect(out.lineReminder.templateDayOf).toBe('ok');
    expect(out.lineReminder.cancellationPolicyText).toBe('ok');
  });
});
