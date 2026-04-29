// Phase 16.1 (2026-04-30) — recursive shape validator for audienceValidation.js
//
// Coverage:
//   V1. validateAudienceRule shape gates (root must be group, etc.)
//   V2. per-predicate-type param validation
//   V3. nested + depth + child-count
//   V4. hasUndefinedLeaves walker (V14 Firestore setDoc compat)
//   V5. emptyAudienceRule starting point

import { describe, test, expect } from 'vitest';
import {
  validateAudienceRule,
  emptyAudienceRule,
  hasUndefinedLeaves,
} from '../src/lib/audienceValidation.js';

// ─── V1 root-level shape gates ─────────────────────────────────────────────
describe('V1 root-level shape', () => {
  test('V1.1 valid empty AND group', () => {
    expect(validateAudienceRule({ kind: 'group', op: 'AND', children: [] })).toBe(null);
  });
  test('V1.2 reject null', () => {
    expect(validateAudienceRule(null)).not.toBe(null);
  });
  test('V1.3 reject array', () => {
    expect(validateAudienceRule([])).not.toBe(null);
  });
  test('V1.4 reject root.kind=predicate', () => {
    const fail = validateAudienceRule({ kind: 'predicate', type: 'gender', params: { value: 'F' } });
    expect(fail).not.toBe(null);
    expect(fail[0]).toBe('rule.kind');
  });
  test('V1.5 reject invalid op', () => {
    const fail = validateAudienceRule({ kind: 'group', op: 'XOR', children: [] });
    expect(fail).not.toBe(null);
    expect(fail[0]).toBe('rule.op');
  });
  test('V1.6 reject non-array children', () => {
    const fail = validateAudienceRule({ kind: 'group', op: 'AND', children: 'not-array' });
    expect(fail).not.toBe(null);
    expect(fail[0]).toBe('rule.children');
  });
});

// ─── V2 per-predicate validation ───────────────────────────────────────────
describe('V2 predicate-param validation', () => {
  const wrap = (pred) => ({ kind: 'group', op: 'AND', children: [pred] });

  test('V2.1 age-range valid', () => {
    expect(validateAudienceRule(wrap({ kind: 'predicate', type: 'age-range', params: { min: 30, max: 60 } }))).toBe(null);
  });
  test('V2.2 age-range min > max', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'age-range', params: { min: 60, max: 30 } }));
    expect(fail).not.toBe(null);
  });
  test('V2.3 age-range out-of-bounds', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'age-range', params: { min: -5, max: 30 } }));
    expect(fail).not.toBe(null);
  });
  test('V2.4 age-range neither min nor max', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'age-range', params: { min: null, max: null } }));
    expect(fail).not.toBe(null);
  });

  test('V2.5 gender valid F', () => {
    expect(validateAudienceRule(wrap({ kind: 'predicate', type: 'gender', params: { value: 'F' } }))).toBe(null);
  });
  test('V2.6 gender invalid', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'gender', params: { value: 'X' } }));
    expect(fail).not.toBe(null);
  });

  test('V2.7 branch valid', () => {
    expect(validateAudienceRule(wrap({ kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A'] } }))).toBe(null);
  });
  test('V2.8 branch empty array rejected', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'branch', params: { branchIds: [] } }));
    expect(fail).not.toBe(null);
  });
  test('V2.9 branch non-string id rejected', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A', 99] } }));
    expect(fail).not.toBe(null);
  });

  test('V2.10 source valid', () => {
    expect(validateAudienceRule(wrap({ kind: 'predicate', type: 'source', params: { values: ['Facebook'] } }))).toBe(null);
  });
  test('V2.11 source empty array rejected', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'source', params: { values: [] } }));
    expect(fail).not.toBe(null);
  });

  test('V2.12 bought valid', () => {
    expect(validateAudienceRule(wrap({ kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: 'P-1', months: 6 } }))).toBe(null);
  });
  test('V2.13 bought invalid kind', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'rabbit', refId: 'P-1', months: 6 } }));
    expect(fail).not.toBe(null);
  });
  test('V2.14 bought empty refId', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: '', months: 6 } }));
    expect(fail).not.toBe(null);
  });
  test('V2.15 bought zero months', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: 'P-1', months: 0 } }));
    expect(fail).not.toBe(null);
  });

  test('V2.16 spend-bracket valid', () => {
    expect(validateAudienceRule(wrap({ kind: 'predicate', type: 'spend-bracket', params: { min: 1000, max: null } }))).toBe(null);
  });
  test('V2.17 spend-bracket negative rejected', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'spend-bracket', params: { min: -1, max: 1000 } }));
    expect(fail).not.toBe(null);
  });
  test('V2.18 spend-bracket min > max', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'spend-bracket', params: { min: 5000, max: 1000 } }));
    expect(fail).not.toBe(null);
  });

  test('V2.19 last-visit-days valid', () => {
    expect(validateAudienceRule(wrap({ kind: 'predicate', type: 'last-visit-days', params: { op: '<=', days: 90 } }))).toBe(null);
  });
  test('V2.20 last-visit-days invalid op', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'last-visit-days', params: { op: '!=', days: 90 } }));
    expect(fail).not.toBe(null);
  });

  test('V2.21 has-unfinished-course true', () => {
    expect(validateAudienceRule(wrap({ kind: 'predicate', type: 'has-unfinished-course', params: { value: true } }))).toBe(null);
  });
  test('V2.22 has-unfinished-course non-boolean rejected', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'has-unfinished-course', params: { value: 1 } }));
    expect(fail).not.toBe(null);
  });

  test('V2.23 unknown predicate type rejected', () => {
    const fail = validateAudienceRule(wrap({ kind: 'predicate', type: 'unknown-type', params: {} }));
    expect(fail).not.toBe(null);
  });
});

// ─── V3 nested + depth + count ─────────────────────────────────────────────
describe('V3 structural', () => {
  test('V3.1 valid 2-deep AND/OR', () => {
    const rule = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', type: 'gender', params: { value: 'F' } },
        {
          kind: 'group',
          op: 'OR',
          children: [
            { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A'] } },
          ],
        },
      ],
    };
    expect(validateAudienceRule(rule)).toBe(null);
  });
  test('V3.2 reject depth > 6', () => {
    let inner = { kind: 'group', op: 'AND', children: [] };
    for (let i = 0; i < 7; i++) inner = { kind: 'group', op: 'AND', children: [inner] };
    const fail = validateAudienceRule(inner);
    expect(fail).not.toBe(null);
  });
  test('V3.3 reject child-count > 50', () => {
    const children = Array.from({ length: 51 }, () => ({ kind: 'predicate', type: 'gender', params: { value: 'F' } }));
    const fail = validateAudienceRule({ kind: 'group', op: 'AND', children });
    expect(fail).not.toBe(null);
  });
  test('V3.4 reject unknown node kind', () => {
    const fail = validateAudienceRule({ kind: 'group', op: 'AND', children: [{ kind: 'mystery' }] });
    expect(fail).not.toBe(null);
  });
});

// ─── V4 hasUndefinedLeaves + V14 lock ──────────────────────────────────────
describe('V4 V14 no-undefined-leaves', () => {
  test('V4.1 hasUndefinedLeaves on plain values', () => {
    expect(hasUndefinedLeaves(undefined)).toBe(true);
    expect(hasUndefinedLeaves(null)).toBe(false);
    expect(hasUndefinedLeaves(0)).toBe(false);
    expect(hasUndefinedLeaves('')).toBe(false);
    expect(hasUndefinedLeaves([1, 2])).toBe(false);
    expect(hasUndefinedLeaves([1, undefined, 2])).toBe(true);
  });
  test('V4.2 hasUndefinedLeaves on nested object', () => {
    expect(hasUndefinedLeaves({ a: { b: { c: 1 } } })).toBe(false);
    expect(hasUndefinedLeaves({ a: { b: { c: undefined } } })).toBe(true);
  });
  test('V4.3 validateAudienceRule rejects undefined leaf in params', () => {
    const rule = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', type: 'gender', params: { value: 'F', extra: undefined } },
      ],
    };
    const fail = validateAudienceRule(rule);
    expect(fail).not.toBe(null);
  });
  test('V4.4 valid rule has no undefined leaves', () => {
    const rule = {
      kind: 'group',
      op: 'AND',
      children: [{ kind: 'predicate', type: 'gender', params: { value: 'F' } }],
    };
    expect(hasUndefinedLeaves(rule)).toBe(false);
  });
});

// ─── V5 emptyAudienceRule ─────────────────────────────────────────────────
describe('V5 emptyAudienceRule', () => {
  test('V5.1 returns valid empty AND group', () => {
    const r = emptyAudienceRule();
    expect(r.kind).toBe('group');
    expect(r.op).toBe('AND');
    expect(r.children).toEqual([]);
    expect(validateAudienceRule(r)).toBe(null);
  });
  test('V5.2 returns fresh instance each call', () => {
    const r1 = emptyAudienceRule();
    const r2 = emptyAudienceRule();
    r1.children.push({ kind: 'predicate', type: 'gender', params: { value: 'F' } });
    expect(r2.children).toEqual([]);
  });
});
