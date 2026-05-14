import { describe, it, expect } from 'vitest';
import { DEFAULT_LINE_CONFIG, validateLineConfig } from '../src/lib/lineConfigClient.js';

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
});
