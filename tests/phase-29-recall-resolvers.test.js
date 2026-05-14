// tests/phase-29-recall-resolvers.test.js
//
// Phase 29.1 (2026-05-14) — TDD test bank for recallResolvers.js pure helpers.
// R1 groupRecallsByTimeBucket · R2 getRecallStatusLabel · R3 getRecallStatusColor
// R4 computeDaysFromToday · R5 formatDaysFromTodayLabel · R6 formatPairBadge
// R7 getEffectiveRecallDate · R8 auto-snooze + manual-review · R9 isOverdue
//
// All tests use fixed TODAY = '2026-05-14' for Bangkok-stable deterministic results.

import { describe, it, expect } from 'vitest';
import {
  groupRecallsByTimeBucket,
  getRecallStatusLabel,
  getRecallStatusColor,
  getEffectiveRecallDate,
  computeDaysFromToday,
  formatDaysFromTodayLabel,
  formatPairBadge,
  shouldShowAutoSnooze,
  computeAutoSnoozeUntil,
  shouldFlagManualReview,
  isOverdue,
} from '../src/lib/recallResolvers.js';

const TODAY = '2026-05-14';

describe('Phase 29 · R1 groupRecallsByTimeBucket', () => {
  it('R1.1 groups by 5 buckets correctly', () => {
    const recalls = [
      { id: 'R1', recallDate: '2026-05-12', status: 'pending' }, // overdue
      { id: 'R2', recallDate: '2026-05-14', status: 'pending' }, // today
      { id: 'R3', recallDate: '2026-05-15', status: 'pending' }, // tomorrow
      { id: 'R4', recallDate: '2026-05-18', status: 'pending' }, // thisWeek
      { id: 'R5', recallDate: '2026-06-14', status: 'pending' }, // later
    ];
    const buckets = groupRecallsByTimeBucket(recalls, TODAY);
    expect(buckets.overdue).toHaveLength(1);
    expect(buckets.today).toHaveLength(1);
    expect(buckets.tomorrow).toHaveLength(1);
    expect(buckets.thisWeek).toHaveLength(1);
    expect(buckets.later).toHaveLength(1);
  });
  it('R1.2 snoozedUntil overrides recallDate for bucket assignment', () => {
    const recalls = [
      { id: 'R1', recallDate: '2026-05-10', status: 'pending', snoozedUntil: '2026-05-14' },
    ];
    const buckets = groupRecallsByTimeBucket(recalls, TODAY);
    expect(buckets.today).toHaveLength(1);
    expect(buckets.overdue).toHaveLength(0);
  });
  it('R1.3 done status NOT shown as overdue', () => {
    const recalls = [{ id: 'R1', recallDate: '2026-05-12', status: 'done' }];
    const buckets = groupRecallsByTimeBucket(recalls, TODAY);
    expect(buckets.overdue).toHaveLength(0);
  });
  it('R1.4 closed-no-answer with past date NOT shown as overdue', () => {
    const recalls = [{ id: 'R1', recallDate: '2026-05-12', status: 'closed-no-answer' }];
    const buckets = groupRecallsByTimeBucket(recalls, TODAY);
    expect(buckets.overdue).toHaveLength(0);
  });
  it('R1.5 empty input → empty buckets', () => {
    const buckets = groupRecallsByTimeBucket([], TODAY);
    expect(buckets.overdue).toEqual([]);
    expect(buckets.today).toEqual([]);
    expect(buckets.tomorrow).toEqual([]);
    expect(buckets.thisWeek).toEqual([]);
    expect(buckets.later).toEqual([]);
  });
  it('R1.6 null/undefined input safe (returns empty buckets)', () => {
    expect(() => groupRecallsByTimeBucket(null, TODAY)).not.toThrow();
    expect(() => groupRecallsByTimeBucket(undefined, TODAY)).not.toThrow();
  });
  it('R1.7 multiple in same bucket', () => {
    const recalls = [
      { id: 'a', recallDate: '2026-05-14', status: 'pending' },
      { id: 'b', recallDate: '2026-05-14', status: 'pending' },
    ];
    const buckets = groupRecallsByTimeBucket(recalls, TODAY);
    expect(buckets.today).toHaveLength(2);
  });
});

describe('Phase 29 · R2 getRecallStatusLabel', () => {
  it('R2.1 pending → รอโทร', () => {
    expect(getRecallStatusLabel({ status: 'pending' })).toBe('รอโทร');
  });
  it('R2.2 done → เสร็จแล้ว', () => {
    expect(getRecallStatusLabel({ status: 'done' })).toBe('เสร็จแล้ว');
  });
  it('R2.3 no-answer with count → ติดต่อไม่ได้ครั้งที่ N', () => {
    expect(getRecallStatusLabel({ status: 'no-answer', noAnswerCount: 2 })).toBe('ติดต่อไม่ได้ครั้งที่ 2');
  });
  it('R2.4 closed-no-answer → ปิด (ติดต่อไม่ได้)', () => {
    expect(getRecallStatusLabel({ status: 'closed-no-answer' })).toBe('ปิด (ติดต่อไม่ได้)');
  });
  it('R2.5 pending + snoozedUntil → เลื่อนไป <date>', () => {
    expect(getRecallStatusLabel({ status: 'pending', snoozedUntil: '2026-05-20' })).toBe('เลื่อนไป 20 พ.ค.');
  });
  it('R2.6 pending + past recallDate → เกินกำหนด N วัน', () => {
    expect(getRecallStatusLabel({ status: 'pending', recallDate: '2026-05-12' }, TODAY)).toBe('เกินกำหนด 2 วัน');
  });
  it('R2.7 null/empty safe', () => {
    expect(getRecallStatusLabel(null)).toBe('');
    expect(getRecallStatusLabel({})).toBe('');
  });
});

describe('Phase 29 · R3 getRecallStatusColor', () => {
  it('R3.1 done → emerald text token', () => {
    expect(getRecallStatusColor({ status: 'done' }).text).toBe('#6ee7b7');
  });
  it('R3.2 no-answer → red text token', () => {
    expect(getRecallStatusColor({ status: 'no-answer' }).text).toBe('#fca5a5');
  });
  it('R3.3 closed-no-answer → gray text token', () => {
    expect(getRecallStatusColor({ status: 'closed-no-answer' }).text).toBe('#9ca3af');
  });
  it('R3.4 snoozed pending → indigo text token', () => {
    expect(getRecallStatusColor({ status: 'pending', snoozedUntil: '2026-05-20' }).text).toBe('#a5b4fc');
  });
  it('R3.5 plain pending → amber text token', () => {
    expect(getRecallStatusColor({ status: 'pending' }).text).toBe('#fcd34d');
  });
  it('R3.6 null safe', () => {
    // Phase 29.22 round-3 V21-class fixup: resolver now returns 5-key shape
    // { bg, border, text, lightText, darkText } (theme-aware). Test was
    // asserting the legacy 3-key shape from pre-round-3.
    expect(getRecallStatusColor(null)).toEqual({
      bg: 'transparent',
      border: 'transparent',
      text: 'inherit',
      lightText: 'inherit',
      darkText: 'inherit',
    });
  });
});

describe('Phase 29 · R4 computeDaysFromToday', () => {
  it('R4.1 today → 0', () => {
    expect(computeDaysFromToday('2026-05-14', TODAY)).toBe(0);
  });
  it('R4.2 tomorrow → 1', () => {
    expect(computeDaysFromToday('2026-05-15', TODAY)).toBe(1);
  });
  it('R4.3 past 2d → -2', () => {
    expect(computeDaysFromToday('2026-05-12', TODAY)).toBe(-2);
  });
  it('R4.4 184 days ahead', () => {
    expect(computeDaysFromToday('2026-11-14', TODAY)).toBe(184);
  });
  it('R4.5 invalid date returns null', () => {
    expect(computeDaysFromToday('', TODAY)).toBeNull();
    expect(computeDaysFromToday(null, TODAY)).toBeNull();
    expect(computeDaysFromToday('not-a-date', TODAY)).toBeNull();
  });
  it('R4.6 invalid today returns null', () => {
    expect(computeDaysFromToday('2026-05-14', null)).toBeNull();
  });
});

describe('Phase 29 · R5 formatDaysFromTodayLabel', () => {
  it('R5.1 0 → วันนี้', () => {
    expect(formatDaysFromTodayLabel(0)).toBe('วันนี้');
  });
  it('R5.2 1 → พรุ่งนี้', () => {
    expect(formatDaysFromTodayLabel(1)).toBe('พรุ่งนี้');
  });
  it('R5.3 negative → เกินกำหนด N วัน', () => {
    expect(formatDaysFromTodayLabel(-2)).toBe('เกินกำหนด 2 วัน');
  });
  it('R5.4 90 (exact month) → 90 วัน (3 เดือน) (no tilde)', () => {
    expect(formatDaysFromTodayLabel(90)).toBe('90 วัน (3 เดือน)');
  });
  it('R5.5 184 (inexact month) → 184 วัน (~6 เดือน) (with tilde)', () => {
    expect(formatDaysFromTodayLabel(184)).toBe('184 วัน (~6 เดือน)');
  });
  it('R5.6 400 → 1 ปี', () => {
    expect(formatDaysFromTodayLabel(400)).toBe('1 ปี');
  });
  it('R5.7 within-week range', () => {
    expect(formatDaysFromTodayLabel(3)).toBe('3 วัน');
    expect(formatDaysFromTodayLabel(7)).toBe('7 วัน');
  });
  it('R5.8 week-bucket between 8-29', () => {
    expect(formatDaysFromTodayLabel(14)).toBe('14 วัน (2 สัปดาห์)');
  });
});

describe('Phase 29 · R6 formatPairBadge', () => {
  it('R6.1 pending paired recall returns full shape', () => {
    const paired = { id: 'R2', slotType: 'revisit', reason: 'ฟิลเลอร์ครบ 6 เดือน', recallDate: '2026-11-14', status: 'pending' };
    const out = formatPairBadge(paired, TODAY);
    expect(out.icon).toBe('📅');
    expect(out.reason).toBe('ฟิลเลอร์ครบ 6 เดือน');
    expect(out.date).toBe('14 พ.ย.');
    expect(out.statusSuffix).toBe('รอ Recall');
  });
  it('R6.2 done paired recall', () => {
    const paired = { id: 'R1', slotType: 'aftercare', reason: 'ติดตามอาการหลังฉีดฟิลเลอร์', recallDate: '2026-05-15', status: 'done' };
    const out = formatPairBadge(paired, TODAY);
    expect(out.icon).toBe('🩹');
    expect(out.statusSuffix).toBe('เสร็จแล้ว');
  });
  it('R6.3 no-answer with count', () => {
    const paired = { id: 'R2', slotType: 'revisit', reason: 'ตรวจติดตาม', recallDate: '2026-01-22', status: 'no-answer', noAnswerCount: 2 };
    const out = formatPairBadge(paired, TODAY);
    expect(out.statusSuffix).toBe('ติดต่อไม่ได้ครั้งที่ 2');
  });
  it('R6.4 snoozed suffix', () => {
    const paired = { id: 'R3', slotType: 'aftercare', reason: 'ติดตาม', recallDate: '2026-05-15', status: 'pending', snoozedUntil: '2026-05-20' };
    const out = formatPairBadge(paired, TODAY);
    expect(out.statusSuffix).toBe('เลื่อนไป 20 พ.ค.');
  });
  it('R6.5 overdue suffix', () => {
    const paired = { id: 'R4', slotType: 'revisit', reason: 'ฟิลเลอร์ครบรอบ', recallDate: '2026-05-12', status: 'pending' };
    const out = formatPairBadge(paired, TODAY);
    expect(out.statusSuffix).toBe('เกินกำหนด 2 วัน');
  });
  it('R6.6 null safe', () => {
    expect(formatPairBadge(null, TODAY)).toBe(null);
  });
});

describe('Phase 29 · R7 getEffectiveRecallDate', () => {
  it('R7.1 snoozedUntil takes precedence', () => {
    expect(getEffectiveRecallDate({ recallDate: '2026-05-10', snoozedUntil: '2026-05-20' })).toBe('2026-05-20');
  });
  it('R7.2 falsy snoozedUntil → recallDate', () => {
    expect(getEffectiveRecallDate({ recallDate: '2026-05-10' })).toBe('2026-05-10');
    expect(getEffectiveRecallDate({ recallDate: '2026-05-10', snoozedUntil: null })).toBe('2026-05-10');
    expect(getEffectiveRecallDate({ recallDate: '2026-05-10', snoozedUntil: '' })).toBe('2026-05-10');
  });
  it('R7.3 null safe', () => {
    expect(getEffectiveRecallDate(null)).toBe(null);
  });
});

describe('Phase 29 · R8 auto-snooze + manual review', () => {
  it('R8.1 shouldShowAutoSnooze for no-answer', () => {
    expect(shouldShowAutoSnooze('no-answer')).toBe(true);
    expect(shouldShowAutoSnooze('will-come')).toBe(false);
    expect(shouldShowAutoSnooze('done')).toBe(false);
  });
  it('R8.2 computeAutoSnoozeUntil returns now+3d (default)', () => {
    expect(computeAutoSnoozeUntil('2026-05-14', 3)).toBe('2026-05-17');
    expect(computeAutoSnoozeUntil('2026-05-14')).toBe('2026-05-17'); // default 3
  });
  it('R8.3 computeAutoSnoozeUntil with custom N', () => {
    expect(computeAutoSnoozeUntil('2026-05-14', 7)).toBe('2026-05-21');
  });
  it('R8.4 shouldFlagManualReview at threshold 3', () => {
    expect(shouldFlagManualReview(2)).toBe(false);
    expect(shouldFlagManualReview(3)).toBe(true);
    expect(shouldFlagManualReview(5)).toBe(true);
  });
  it('R8.5 shouldFlagManualReview with custom threshold', () => {
    expect(shouldFlagManualReview(4, 5)).toBe(false);
    expect(shouldFlagManualReview(5, 5)).toBe(true);
  });
  it('R8.6 computeAutoSnoozeUntil null-safe', () => {
    expect(computeAutoSnoozeUntil('', 3)).toBeNull();
    expect(computeAutoSnoozeUntil(null, 3)).toBeNull();
  });
});

describe('Phase 29 · R9 isOverdue', () => {
  it('R9.1 overdue when recallDate before today AND pending', () => {
    expect(isOverdue({ recallDate: '2026-05-12', status: 'pending' }, TODAY)).toBe(true);
  });
  it('R9.2 done status NOT overdue', () => {
    expect(isOverdue({ recallDate: '2026-05-12', status: 'done' }, TODAY)).toBe(false);
  });
  it('R9.3 closed-no-answer NOT overdue', () => {
    expect(isOverdue({ recallDate: '2026-05-12', status: 'closed-no-answer' }, TODAY)).toBe(false);
  });
  it('R9.4 today NOT overdue', () => {
    expect(isOverdue({ recallDate: '2026-05-14', status: 'pending' }, TODAY)).toBe(false);
  });
  it('R9.5 snoozedUntil in future overrides past recallDate', () => {
    expect(isOverdue({ recallDate: '2026-05-10', status: 'pending', snoozedUntil: '2026-05-15' }, TODAY)).toBe(false);
  });
  it('R9.6 null safe', () => {
    expect(isOverdue(null, TODAY)).toBe(false);
  });
});
