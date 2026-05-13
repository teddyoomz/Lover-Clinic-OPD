// tests/helpers/adversarialFixtures.js
//
// V55.1 — Brutal pre-deploy test bank shared adversarial-fixture library
// (Phase 26.2g-fillin-bis-followup verification, 2026-05-14)
//
// Two frozen sets:
//   - ADVERSARIAL_STRINGS — every "weird" string a helper might receive
//                          (NFC/NFD/NUL/10K-char/Thai cluster/zero-width/BOM/
//                           whitespace/SQL-shape/XSS-shape/path-traversal)
//   - ADVERSARIAL_NON_STRINGS — every "weird" non-string value a helper
//                               might receive (null/undefined/numbers/Date/
//                               Symbol/function/cyclic-prep/etc.)
//
// Per design spec `docs/superpowers/specs/2026-05-14-brutal-pre-deploy-test-bank-design.md` Tier 4.
// Future Phase tests that touch user-input parsers should consume these
// fixture sets so adversarial coverage is uniform across the codebase.

// Zero-width joiner cluster
const ZWJ = '​‌‍';
// Byte-order mark
const BOM = '﻿';

/**
 * Every "weird" string a helper might receive in production. Frozen so
 * consumers cannot accidentally mutate the fixture between tests.
 */
export const ADVERSARIAL_STRINGS = Object.freeze([
  '',                                              // empty
  '\0',                                            // NUL byte
  'a'.repeat(10_000),                              // 10K char
  'café'.normalize('NFC'),                         // Latin NFC (4 codepoints)
  'café'.normalize('NFD'),                         // NFD (5 codepoints — e + combining acute)
  'มะม่วง',                                        // Thai cluster
  'ค' + '่' + 'ำ',                            // Thai with combining mai-ek + sara am
  'ＡＢＣ',                                         // fullwidth Latin
  '𝐀𝐁𝐂',                                          // astral plane (surrogate pairs)
  ZWJ,                                             // zero-width joiners only
  BOM,                                             // BOM only
  'leading ',                                      // trailing space
  ' trailing',                                     // leading space
  '  middle  spaces  ',                            // surrounded whitespace
  '"; DROP TABLE customers;--',                    // SQL-injection shape
  '<script>alert(1)</script>',                     // XSS shape
  '../../etc/passwd',                              // path-traversal shape
  'Robert\'); DROP TABLE Students;--',             // Bobby Tables
  '🇹🇭',                                          // flag emoji (composite)
  '👨‍⚕️',                                        // ZWJ doctor emoji
]);

/**
 * Every "weird" non-string value a helper might receive. Frozen — consumers
 * MUST NOT mutate; tests that need cyclic refs should build them locally.
 */
export const ADVERSARIAL_NON_STRINGS = Object.freeze([
  null,
  undefined,
  0,
  1,
  -1,
  false,
  true,
  NaN,
  Infinity,
  -Infinity,
  [],
  [1, 2, 3],
  {},
  { x: 1 },
  Symbol('a'),
  () => 'function-return',
  new Date('2026-05-14T00:00:00Z'),
  new Map(),
  new Set(),
  new RegExp('xyz'),
  // Note: cyclic references can't be frozen here — tests build their own.
]);

/**
 * Standard "clean" PatientForm-sanitized values for cross-checks against
 * adversarial fixtures. Use these to confirm a helper still works for
 * realistic inputs after stress-fuzzing.
 */
export const CLEAN_PATIENT_FORM_FIXTURES = Object.freeze({
  congenitalDiseaseSimple: 'เบาหวาน',
  congenitalDiseaseCompound: 'ความดันโลหิตสูง, เบาหวาน',
  drugAllergySimple: 'พารา',
  foodAllergySimple: 'ขนมถ้วย',
  beforeTreatmentSimple: 'X-ray',
  pregnancyValue: '3 เดือน',
  medicationValue: 'Atenolol 50mg',
});

/**
 * @returns {string} short label for a non-string value for test names.
 */
export function describeAdversarialNonString(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
    return `number(${v})`;
  }
  if (typeof v === 'boolean') return `bool(${v})`;
  if (typeof v === 'symbol') return 'Symbol';
  if (typeof v === 'function') return 'function';
  if (Array.isArray(v)) return `array(${v.length})`;
  if (v instanceof Date) return 'Date';
  if (v instanceof Map) return 'Map';
  if (v instanceof Set) return 'Set';
  if (v instanceof RegExp) return 'RegExp';
  return 'object';
}

/**
 * @returns {string} short label for a string fixture for test names.
 */
export function describeAdversarialString(s) {
  if (s === '') return 'empty';
  if (s === '\0') return 'NUL';
  if (s.length === 10_000) return '10K-char';
  if (s === ZWJ) return 'zero-width-joiners';
  if (s === BOM) return 'BOM';
  if (s.length > 30) return `long(${s.length})`;
  return `'${s.replace(/\n/g, '\\n').slice(0, 30)}'`;
}
