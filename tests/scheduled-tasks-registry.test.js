import { describe, it, expect } from 'vitest';
import { SCHEDULED_TASKS, getTask, listParams, defaultParamsFor,
  CATEGORY_ORDER, CATEGORY_LABELS } from '../src/lib/scheduledTasksRegistry.js';
import { RETENTION_HOURS } from '../src/lib/chatHistoryRetentionCore.js';
import { RETENTION_DAYS as STAFF_CHAT_DAYS } from '../src/lib/staffChatRetentionCore.js';
import { RETENTION_DAYS as STOCK_MOVE_DAYS } from '../src/lib/stockMovementRetentionCore.js';

describe('scheduledTasksRegistry', () => {
  it('has exactly 10 tasks, all source=vercel (Firebase fn retired)', () => {
    expect(SCHEDULED_TASKS.length).toBe(10);
    expect(SCHEDULED_TASKS.every(t => t.source === 'vercel')).toBe(true);
  });

  it('every task has the full descriptor shape', () => {
    for (const t of SCHEDULED_TASKS) {
      expect(t.id && t.label && t.category && t.scheduleHuman && t.cronPath && t.auditOpPrefix).toBeTruthy();
      expect(typeof t.deletesData).toBe('boolean');
      expect(typeof t.safetyCritical).toBe('boolean');
      expect(Array.isArray(t.params)).toBe(true);
      expect(CATEGORY_ORDER).toContain(t.category);
    }
  });

  it('param defaults import the core constants (single source, no duplication)', () => {
    expect(listParams('chatHistoryRetention').find(p => p.key === 'retentionHours').default).toBe(RETENTION_HOURS);
    expect(listParams('staffChatRetention').find(p => p.key === 'retentionDays').default).toBe(STAFF_CHAT_DAYS);
    expect(listParams('stockMovementRetention').find(p => p.key === 'retentionDays').default).toBe(STOCK_MOVE_DAYS);
    expect(listParams('opdSessionCleanup').find(p => p.key === 'sessionTimeoutHours').default).toBe(2);
  });

  it('safety-critical = backup + chatHistory + opdSession', () => {
    const crit = SCHEDULED_TASKS.filter(t => t.safetyCritical).map(t => t.id).sort();
    expect(crit).toEqual(['chatHistoryRetention', 'opdSessionCleanup', 'wholeSystemBackup']);
  });

  it('every safety-critical task has a Thai safetyNote', () => {
    for (const t of SCHEDULED_TASKS.filter(t => t.safetyCritical)) {
      expect(typeof t.safetyNote).toBe('string');
      expect(t.safetyNote.length).toBeGreaterThan(5);
    }
  });

  it('ids unique; every param has key/default/min/max', () => {
    expect(new Set(SCHEDULED_TASKS.map(t => t.id)).size).toBe(10);
    for (const t of SCHEDULED_TASKS) {
      for (const p of t.params) {
        expect(p.key && typeof p.default === 'number').toBeTruthy();
        expect(typeof p.min === 'number' && typeof p.max === 'number' && p.min <= p.max).toBe(true);
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it('helpers: getTask / defaultParamsFor', () => {
    expect(getTask('chatHistoryRetention').id).toBe('chatHistoryRetention');
    expect(getTask('nope')).toBeNull();
    expect(defaultParamsFor('chatHistoryRetention')).toEqual({ retentionHours: RETENTION_HOURS });
    expect(defaultParamsFor('stockLotCleanup')).toEqual({});
  });

  it('CATEGORY_LABELS cover every used category', () => {
    for (const t of SCHEDULED_TASKS) expect(CATEGORY_LABELS[t.category]).toBeTruthy();
  });
});
