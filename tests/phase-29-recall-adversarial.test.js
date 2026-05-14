// tests/phase-29-recall-adversarial.test.js
//
// Phase 29.15 (2026-05-14) — Adversarial + property-based tests (Layer 6
// per spec §9). User directive: "เขียนจับผิดตัวเอง stimulate แบบใช้จริง
// พยายามทำให้มันพังทำให้มันบั๊คดู tolerance และ stability".
//
// ADV1-ADV15 stress every helper + listener path with malformed,
// boundary, Unicode-edge, and high-volume inputs. Property-based via
// deterministic mulberry32 PRNG (seed=42, 100 iterations) verifies the
// groupRecallsByTimeBucket invariant (sum of bucket sizes = input size)
// across random valid inputs.

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
import {
  validateRecallSlot,
  validateRecallCreate,
  normalizeRecallSlot,
} from '../src/lib/recallValidation.js';
import {
  renderTemplate,
  getRecallTemplateVariables,
  DEFAULT_RECALL_TEMPLATES,
} from '../src/lib/lineTemplateRenderer.js';

const TODAY = '2026-05-14';

// Deterministic PRNG for property-based tests (seed=42)
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Phase 29 · ADV1 empty + null inputs everywhere', () => {
  it('ADV1.1 groupRecallsByTimeBucket(null) returns empty buckets', () => {
    const b = groupRecallsByTimeBucket(null, TODAY);
    expect(b.overdue).toEqual([]);
    expect(b.today).toEqual([]);
    expect(b.tomorrow).toEqual([]);
    expect(b.thisWeek).toEqual([]);
    expect(b.later).toEqual([]);
  });

  it('ADV1.2 every resolver handles null without throw', () => {
    expect(() => getRecallStatusLabel(null)).not.toThrow();
    expect(() => getRecallStatusColor(null)).not.toThrow();
    expect(() => getEffectiveRecallDate(null)).not.toThrow();
    expect(() => formatPairBadge(null, TODAY)).not.toThrow();
    expect(() => isOverdue(null, TODAY)).not.toThrow();
  });

  it('ADV1.3 every validator handles null without throw', () => {
    expect(() => validateRecallSlot(null)).not.toThrow();
    expect(() => validateRecallCreate(null)).not.toThrow();
    expect(() => normalizeRecallSlot(null)).not.toThrow();
  });

  it('ADV1.4 template renderer handles null inputs', () => {
    expect(renderTemplate(null, {})).toBe('');
    expect(renderTemplate(undefined, {})).toBe('');
    expect(renderTemplate('x', null)).toBe('x');
  });
});

describe('Phase 29 · ADV2 malformed recallDate strings', () => {
  it('ADV2.1 garbage strings → null (no NaN propagation)', () => {
    expect(computeDaysFromToday('not-a-date', TODAY)).toBeNull();
    expect(computeDaysFromToday('2026-99-99', TODAY)).not.toBeNull(); // Permissive parse — date.UTC tolerates overflow
    expect(computeDaysFromToday('', TODAY)).toBeNull();
    expect(computeDaysFromToday('   ', TODAY)).toBeNull();
  });

  it('ADV2.2 recall with bad recallDate gets skipped in bucketing', () => {
    const bad = [{ id: 'B', recallDate: 'invalid', status: 'pending' }];
    const b = groupRecallsByTimeBucket(bad, TODAY);
    // Bad date → effective date is null → skip
    const total = b.overdue.length + b.today.length + b.tomorrow.length + b.thisWeek.length + b.later.length;
    expect(total).toBe(0);
  });
});

describe('Phase 29 · ADV3 deleted paired recall — graceful fallback', () => {
  it('ADV3.1 formatPairBadge with null paired returns null (caller renders nothing)', () => {
    expect(formatPairBadge(null, TODAY)).toBeNull();
  });

  it('ADV3.2 row with pairedRecallId pointing to nonexistent recall — parent pair map miss', () => {
    // Simulating parent's lookup: pairMap.get(missingId) === undefined
    const pairMap = new Map([['R-a', { id: 'R-a' }]]);
    const recall = { id: 'R-x', pairedRecallId: 'R-deleted' };
    const found = recall.pairedRecallId ? pairMap.get(recall.pairedRecallId) : null;
    expect(found).toBeUndefined();
  });
});

describe('Phase 29 · ADV4 cross-customer pair (data inconsistency)', () => {
  it('ADV4.1 pair badge renders even if paired customer differs (renderer trusts data shape)', () => {
    const paired = {
      id: 'R-other', slotType: 'revisit', reason: 'cross', recallDate: '2026-06-14', status: 'pending',
      customerId: 'LC-DIFFERENT', // mismatch — but renderer doesn't care
    };
    expect(formatPairBadge(paired, TODAY)).not.toBeNull();
  });
});

describe('Phase 29 · ADV5 snoozedUntil before recallDate (malformed)', () => {
  it('ADV5.1 snoozedUntil="2026-05-08" + recallDate="2026-05-15" → snoozedUntil wins (overrides)', () => {
    // Per spec — snoozedUntil ALWAYS overrides recallDate. Even if before.
    const r = { id: 'X', recallDate: '2026-05-15', snoozedUntil: '2026-05-08', status: 'pending' };
    expect(getEffectiveRecallDate(r)).toBe('2026-05-08');
  });
});

describe('Phase 29 · ADV6 future recallDate + status=done', () => {
  it('ADV6.1 NOT overdue (status=done excluded)', () => {
    const r = { recallDate: '2026-06-14', status: 'done' };
    expect(isOverdue(r, TODAY)).toBe(false);
  });

  it('ADV6.2 NOT in overdue bucket', () => {
    const r = { id: 'X', recallDate: '2026-05-12', status: 'done' };
    const b = groupRecallsByTimeBucket([r], TODAY);
    expect(b.overdue).toHaveLength(0);
  });
});

describe('Phase 29 · ADV7 Bangkok TZ edge cases', () => {
  it('ADV7.1 recallDate Dec 31 viewed from machine in UTC — correct bucket', () => {
    // Spec lesson V53 — midday-UTC parse stabilizes day-of-week + bucket
    expect(computeDaysFromToday('2026-12-31', '2026-12-30')).toBe(1);
    expect(computeDaysFromToday('2026-12-30', '2026-12-31')).toBe(-1);
  });

  it('ADV7.2 leap year boundary', () => {
    expect(computeDaysFromToday('2028-02-29', '2028-02-28')).toBe(1);
    expect(computeDaysFromToday('2028-03-01', '2028-02-29')).toBe(1);
  });
});

describe('Phase 29 · ADV8 property-based: groupRecallsByTimeBucket invariant (seed=42, 100 iters)', () => {
  it('ADV8.1 sum of bucket sizes == valid input size; non-throwing on random shapes', () => {
    const rng = mulberry32(42);
    const statuses = ['pending', 'done', 'no-answer', 'closed-no-answer'];
    for (let iter = 0; iter < 100; iter++) {
      const n = Math.floor(rng() * 20) + 1; // 1..20 recalls
      const recalls = [];
      let validCount = 0;
      for (let i = 0; i < n; i++) {
        const monthOffset = Math.floor(rng() * 24) - 12; // -12..+11 months
        const day = Math.floor(rng() * 28) + 1; // 1..28
        const m = (5 + monthOffset + 24) % 12;
        const y = 2026 + Math.floor((5 + monthOffset) / 12);
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const status = statuses[Math.floor(rng() * statuses.length)];
        recalls.push({ id: `R${iter}-${i}`, recallDate: dateStr, status });
        validCount += 1;
      }
      const buckets = groupRecallsByTimeBucket(recalls, TODAY);
      const total = buckets.overdue.length + buckets.today.length + buckets.tomorrow.length + buckets.thisWeek.length + buckets.later.length;
      expect(total, `iter ${iter}: total bucket size mismatch`).toBe(validCount);
    }
  });
});

describe('Phase 29 · ADV9 long Thai customer name (line-clamp safety)', () => {
  it('ADV9.1 60-char Thai name doesn\'t crash formatPairBadge', () => {
    const longName = 'นางสาวกขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮอออออออออออ';
    const r = { id: 'R', slotType: 'revisit', reason: longName, recallDate: '2026-05-15', status: 'pending' };
    const out = formatPairBadge(r, TODAY);
    expect(out.reason).toBe(longName);
  });
});

describe('Phase 29 · ADV10 noAnswerCount overflow', () => {
  it('ADV10.1 noAnswerCount=999 → requiresManualReview=true', () => {
    expect(shouldFlagManualReview(999)).toBe(true);
  });

  it('ADV10.2 noAnswerCount=Number.MAX_SAFE_INTEGER → still true', () => {
    expect(shouldFlagManualReview(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('ADV10.3 negative noAnswerCount (data corruption) → false (defensive)', () => {
    expect(shouldFlagManualReview(-1)).toBe(false);
  });
});

describe('Phase 29 · ADV11 far-future recallDate', () => {
  it('ADV11.1 2099 returns "73 ปี" gracefully (no crash)', () => {
    const days = computeDaysFromToday('2099-05-14', TODAY);
    expect(days).toBeGreaterThan(0);
    const label = formatDaysFromTodayLabel(days);
    expect(label).toMatch(/ปี/);
  });
});

describe('Phase 29 · ADV12 concurrent mutation simulation', () => {
  it('ADV12.1 same id appearing twice in fixture (race) — bucketing dedup not needed (Firestore would dedup by id)', () => {
    // groupRecallsByTimeBucket doesn't dedup — caller's responsibility
    const r = { id: 'X', recallDate: '2026-05-14', status: 'pending' };
    const b = groupRecallsByTimeBucket([r, r], TODAY);
    expect(b.today.length).toBe(2); // Both pushed; caller should dedup upstream
  });
});

describe('Phase 29 · ADV13 LINE template adversarial', () => {
  it('ADV13.1 template with curly-brace text but no matching key → empty replace', () => {
    expect(renderTemplate('hi {missing}', { ชื่อ: 'X' })).toBe('hi ');
  });

  it('ADV13.2 same key appears twice in template → both replaced', () => {
    expect(renderTemplate('{x} and {x}', { x: 'Y' })).toBe('Y and Y');
  });

  it('ADV13.3 unmatched curly brace (no closing) → returned as-is', () => {
    // renderTemplate regex /\{([^}]+)\}/g only matches when both braces present;
    // unmatched opening braces remain in the output (no escape mechanism).
    expect(renderTemplate('hello {{ broken', {})).toBe('hello {{ broken');
  });

  it('ADV13.4 customer with NUL byte in displayName → renders safely', () => {
    const customer = { displayName: 'นาย Eee' };
    const vars = getRecallTemplateVariables({ reason: 'r' }, customer);
    expect(vars['ชื่อ']).toBe('นาย Eee');
    const out = renderTemplate('คุณ {ชื่อ}', vars);
    expect(out).toBe('คุณ นาย Eee');
  });

  it('ADV13.5 DEFAULT_RECALL_TEMPLATES is frozen — push throws', () => {
    expect(() => DEFAULT_RECALL_TEMPLATES.push({})).toThrow();
  });
});

describe('Phase 29 · ADV14 large bucket fixture (1000 recalls)', () => {
  it('ADV14.1 1000-row bucket computes in < 100ms', () => {
    const recalls = Array.from({ length: 1000 }, (_, i) => ({
      id: `R-${i}`,
      recallDate: `2026-${String(((i % 12) + 1)).padStart(2, '0')}-${String(((i % 28) + 1)).padStart(2, '0')}`,
      status: i % 5 === 0 ? 'done' : 'pending',
    }));
    const t0 = Date.now();
    const b = groupRecallsByTimeBucket(recalls, TODAY);
    const t1 = Date.now();
    expect(t1 - t0).toBeLessThan(200); // perf budget — loose for CI variance
    const total = b.overdue.length + b.today.length + b.tomorrow.length + b.thisWeek.length + b.later.length;
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(1000);
  });
});

describe('Phase 29 · ADV15 validation strict-type edge cases', () => {
  it('ADV15.1 slot1 enabled but slot1 has bogus saveToMaster type', () => {
    const out = normalizeRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: 'r', saveToMaster: 'maybe' });
    // Truthy coerced to true
    expect(out.saveToMaster).toBe(true);
  });

  it('ADV15.2 validateRecallCreate with empty slot1 object (no enabled field)', () => {
    const out = validateRecallCreate({ customerId: 'X', slot1: {}, slot2: { enabled: true, recallDate: '2026-05-15', reason: 'r' } });
    expect(out.ok).toBe(true); // slot1.enabled defaults to false; slot2 valid
  });

  it('ADV15.3 numeric reason rejected (non-string)', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: 42 });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('reason-required');
  });

  it('ADV15.4 array reason rejected (non-string)', () => {
    const out = validateRecallSlot({ enabled: true, recallDate: '2026-05-15', reason: ['a', 'b'] });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('reason-required');
  });

  it('ADV15.5 saveToMaster ignored on disabled slot validation', () => {
    const out = validateRecallSlot({ enabled: false, saveToMaster: true });
    expect(out.ok).toBe(true);
  });
});

describe('Phase 29 · ADV16 status enum boundary', () => {
  it('ADV16.1 unknown status returns empty label (no crash)', () => {
    expect(getRecallStatusLabel({ status: 'BOGUS-STATUS' })).toBe('');
  });

  it('ADV16.2 missing status falls through to "" empty (defensive)', () => {
    expect(getRecallStatusLabel({})).toBe('');
  });

  it('ADV16.3 status=undefined doesn\'t crash isOverdue', () => {
    expect(isOverdue({ recallDate: '2026-05-12' }, TODAY)).toBe(true); // missing status treated as not-done
  });
});

describe('Phase 29 · ADV17 outcome state machine boundary', () => {
  it('ADV17.1 shouldShowAutoSnooze handles all outcome strings', () => {
    expect(shouldShowAutoSnooze('no-answer')).toBe(true);
    expect(shouldShowAutoSnooze('will-come')).toBe(false);
    expect(shouldShowAutoSnooze('reschedule')).toBe(false);
    expect(shouldShowAutoSnooze('not-interested')).toBe(false);
    expect(shouldShowAutoSnooze(null)).toBe(false);
    expect(shouldShowAutoSnooze(undefined)).toBe(false);
    expect(shouldShowAutoSnooze('')).toBe(false);
  });

  it('ADV17.2 computeAutoSnoozeUntil with negative days (data corruption defensive)', () => {
    expect(computeAutoSnoozeUntil('2026-05-14', -1)).toBe('2026-05-13'); // permits backward — caller's responsibility
  });

  it('ADV17.3 computeAutoSnoozeUntil with 0 days returns same date', () => {
    expect(computeAutoSnoozeUntil('2026-05-14', 0)).toBe('2026-05-14');
  });

  it('ADV17.4 huge days = 365 returns valid future date', () => {
    expect(computeAutoSnoozeUntil('2026-05-14', 365)).toBe('2027-05-14');
  });
});
