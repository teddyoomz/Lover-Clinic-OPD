// Phase 27.0 Task 2 — property-based + adversarial tests
// Resolvers: resolveDoctorDisplayName / resolveAssistantDisplayName /
//            resolveBranchDisplayName / resolveAssistantsDisplay
//
// V55 methodology: @fast-check/vitest 0.4.x property-based (200 runs) +
// shared adversarialFixtures Tier 4 adversarial sweep.
//
// Per design: AV42 (audit-anti-vibe-code) — these resolvers are the canonical
// live-resolve entry points; they MUST never return raw IDs and MUST always
// return strings. Property-based ensures these invariants hold for arbitrary
// inputs, not just the hand-crafted unit bank in phase-27-0-treatment-display-resolvers.test.js.

import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  resolveDoctorDisplayName,
  resolveAssistantDisplayName,
  resolveBranchDisplayName,
  resolveAssistantsDisplay,
} from '../src/lib/treatmentDisplayResolvers.js';
import { ADVERSARIAL_STRINGS, ADVERSARIAL_NON_STRINGS } from './helpers/adversarialFixtures.js';

const RUNS = { numRuns: 200 };

// ─── Arbitrary builders ──────────────────────────────────────────────────────

// A valid, non-empty trimmed name string (simulates realistic doctor/staff names)
const VALID_NAME_ARB = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim().length > 0);

// A valid ID string (e.g., 'DOC-xxx', 'STAFF-xxx', 'BR-xxx')
const VALID_ID_ARB = fc.string({ minLength: 1 });

// An arbitrary Map<string, {name: string}> with 0–5 entries
const NAME_MAP_ARB = fc.array(
  fc.tuple(fc.string({ minLength: 1 }), VALID_NAME_ARB),
  { maxLength: 5 }
).map((entries) => new Map(entries.map(([k, v]) => [k, { name: v }])));

// An array of up to 6 assistant entries (string id OR {id, name?} object)
const ASSISTANT_ENTRY_ARB = fc.oneof(
  // string id
  fc.string({ minLength: 1 }),
  // object with id only
  fc.record({ id: fc.string({ minLength: 1 }) }),
  // object with id + name
  fc.record({ id: fc.string({ minLength: 1 }), name: VALID_NAME_ARB })
);
const ASSISTANTS_ARB = fc.array(ASSISTANT_ENTRY_ARB, { maxLength: 6 });

// ─── PB1 — resolveDoctorDisplayName invariants ───────────────────────────────

describe('PB1 — resolveDoctorDisplayName property invariants', () => {
  test.prop([VALID_ID_ARB, NAME_MAP_ARB, fc.string()], RUNS)(
    'PB1.1 never throws, always returns a string',
    (doctorId, doctorMap, cachedName) => {
      const result = resolveDoctorDisplayName(doctorId, doctorMap, cachedName);
      expect(typeof result).toBe('string');
    }
  );

  test.prop([VALID_ID_ARB], RUNS)(
    'PB1.2 NEVER returns the raw doctorId when map and cache are both empty',
    (doctorId) => {
      const result = resolveDoctorDisplayName(doctorId, new Map(), '');
      // The raw ID must never leak as the return value
      expect(result).toBe('');
    }
  );

  test.prop([VALID_ID_ARB, NAME_MAP_ARB, fc.string()], RUNS)(
    'PB1.3 idempotent — calling twice with the same args yields the same result',
    (doctorId, doctorMap, cachedName) => {
      const r1 = resolveDoctorDisplayName(doctorId, doctorMap, cachedName);
      const r2 = resolveDoctorDisplayName(doctorId, doctorMap, cachedName);
      expect(r1).toBe(r2);
    }
  );

  test.prop([VALID_ID_ARB, NAME_MAP_ARB, fc.string()], RUNS)(
    'PB1.4 output is always trimmed (no leading/trailing whitespace)',
    (doctorId, doctorMap, cachedName) => {
      const result = resolveDoctorDisplayName(doctorId, doctorMap, cachedName);
      expect(result).toBe(result.trim());
    }
  );
});

// ─── PB2 — resolveAssistantsDisplay shape invariants ─────────────────────────

describe('PB2 — resolveAssistantsDisplay property invariants', () => {
  test.prop([ASSISTANTS_ARB, NAME_MAP_ARB, NAME_MAP_ARB], RUNS)(
    'PB2.1 output never contains literal "undefined" or "null"',
    (assistants, doctorMap, staffMap) => {
      const result = resolveAssistantsDisplay(assistants, doctorMap, staffMap);
      expect(result).not.toContain('undefined');
      expect(result).not.toContain('null');
    }
  );

  test.prop(
    [
      fc.array(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant({}),
          fc.constant('')
        ),
        { minLength: 1, maxLength: 8 }
      ),
      NAME_MAP_ARB,
      NAME_MAP_ARB,
    ],
    RUNS
  )(
    'PB2.2 falsy-only array (null/undefined/{}/empty-string entries, no map hits) → always returns ""',
    (falsyArray, doctorMap, staffMap) => {
      const result = resolveAssistantsDisplay(falsyArray, doctorMap, staffMap);
      expect(result).toBe('');
    }
  );

  test.prop(
    [
      // Build an array of entries all of which WILL resolve (id exists in doctorMap)
      // Names must NOT contain ', ' (the join separator) to keep split-count correct.
      fc.array(
        fc.tuple(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0 && !s.includes(', '))
        ),
        { minLength: 1, maxLength: 5 }
      ),
    ],
    RUNS
  )(
    'PB2.3 when all entries resolve, output segments count equals input count',
    (pairs) => {
      // pairs: [[id, name], ...]
      const doctorMap = new Map(pairs.map(([id, name]) => [id, { name }]));
      const assistants = pairs.map(([id]) => ({ id }));
      const result = resolveAssistantsDisplay(assistants, doctorMap, new Map());
      const segments = result.split(', ');
      expect(segments.length).toBe(pairs.length);
    }
  );
});

// ─── PB3 — resolveBranchDisplayName invariants ───────────────────────────────

describe('PB3 — resolveBranchDisplayName property invariants', () => {
  test.prop([VALID_ID_ARB], RUNS)(
    'PB3.1 raw branchId never leaks when map and cache are both empty',
    (branchId) => {
      const result = resolveBranchDisplayName(branchId, new Map(), '');
      expect(result).toBe('');
    }
  );

  test.prop([VALID_ID_ARB, VALID_NAME_ARB, VALID_NAME_ARB], RUNS)(
    'PB3.2 live map name wins over cache name when both present',
    (branchId, liveName, cacheName) => {
      // liveName has minLength:1 after filter → guaranteed non-empty after trim
      const branchMap = new Map([[branchId, { name: liveName }]]);
      const result = resolveBranchDisplayName(branchId, branchMap, cacheName);
      // live entry exists → should return the live name (trimmed)
      expect(result).toBe(liveName.trim());
    }
  );
});

// ─── AD1 — adversarial cachedName for resolveDoctorDisplayName ───────────────

describe('AD1 — adversarial cachedName inputs for resolveDoctorDisplayName', () => {
  it('AD1.1 ADVERSARIAL_STRINGS: typeof output === "string" and output === cachedName.trim()', () => {
    for (const s of ADVERSARIAL_STRINGS) {
      const out = resolveDoctorDisplayName('DOC-1', new Map(), s);
      expect(typeof out).toBe('string');
      // When map has no entry, falls back to _trimmedString(cachedName)
      expect(out).toBe(s.trim());
    }
  });

  it('AD1.2 ADVERSARIAL_NON_STRINGS: output === "" (non-string cached → _trimmedString returns "")', () => {
    for (const v of ADVERSARIAL_NON_STRINGS) {
      const out = resolveDoctorDisplayName('DOC-1', new Map(), v);
      expect(out).toBe('');
    }
  });
});

// ─── AD2 — prototype pollution probe ─────────────────────────────────────────

describe('AD2 — prototype pollution / duck-typing safety', () => {
  it('AD2.1 plain-object map rejected via duck-typing → returns cached fallback', () => {
    // A plain object has no .get method; resolver duck-checks typeof .get === "function"
    const plainObj = { 'DOC-1': { name: 'Dr. Foo' } };
    const out = resolveDoctorDisplayName('DOC-1', plainObj, 'fallback');
    // duck-type guard fails → skips map lookup → returns trimmed cachedName
    expect(out).toBe('fallback');
  });

  it('AD2.2 Map with polluted prototype does not corrupt output', () => {
    // Even if someone adds a custom property to Map.prototype,
    // Map.get() behavior remains isolated to the instance.
    const map = new Map([['DOC-X', { name: 'Dr. Bar' }]]);
    // Temporarily pollute Map.prototype (restored immediately)
    const original = Object.getOwnPropertyDescriptor(Map.prototype, 'size');
    try {
      // @ts-ignore — intentional prototype mutation for adversarial test
      Map.prototype.__adversarial__ = 'POISON';
      const out = resolveDoctorDisplayName('DOC-X', map, 'cache');
      // Must still resolve live name correctly
      expect(out).toBe('Dr. Bar');
    } finally {
      delete Map.prototype.__adversarial__;
    }
  });
});

// ─── AD3 — frozen / immutable inputs ─────────────────────────────────────────

describe('AD3 — frozen and immutable inputs', () => {
  it('AD3.1 Object.freeze on entry does not crash resolveAssistantDisplayName', () => {
    const entry = Object.freeze({ id: 'STAFF-1', name: 'Frozen Asst' });
    const staffMap = new Map([['STAFF-1', { name: 'Live Name' }]]);
    // doctorMap has no entry → falls to staffMap
    const out = resolveAssistantDisplayName(entry, new Map(), staffMap);
    expect(out).toBe('Live Name');
  });

  it('AD3.2 Object.freeze on map value does not crash resolver', () => {
    const frozenVal = Object.freeze({ name: 'Frozen Doc' });
    const map = new Map([['DOC-FROZEN', frozenVal]]);
    const out = resolveDoctorDisplayName('DOC-FROZEN', map, '');
    expect(out).toBe('Frozen Doc');
  });
});

// ─── AD4 — cyclic-reference safety ───────────────────────────────────────────

describe('AD4 — cyclic-reference safety', () => {
  it('AD4.1 entry with cyclic .self reference does not infinite-loop', () => {
    // Resolver only reads entry.id and entry.name — cyclic refs are harmless
    const entry = { id: 'STAFF-CYCLIC', name: 'Cyclic Staff' };
    entry.self = entry; // introduce cyclic ref
    const staffMap = new Map([['STAFF-CYCLIC', { name: 'Live Name' }]]);
    const out = resolveAssistantDisplayName(entry, new Map(), staffMap);
    // staffMap has the live name → returns it
    expect(out).toBe('Live Name');
  });
});
